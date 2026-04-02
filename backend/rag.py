"""
rag.py — RAG (Retrieval-Augmented Generation) module for Mindpad AI.

Architecture:
  • Upload  → PyPDF2 text extraction → tiktoken token count
           → Groq decides optimal chunk count (hard cap: 1000 tokens/chunk)
           → Pinecone multilingual-e5-large embeds each chunk
           → vectors upserted into namespace = Clerk user_id
           → metadata (doc_id, name, chunk_count…) saved to MongoDB

  • Chat    → embed user query → Pinecone top-3 retrieval from user namespace
           → inject retrieved context into LLM system prompt

  • Delete  → remove Pinecone vectors + MongoDB metadata row

Namespace strategy:
  Each Clerk user_id becomes an isolated Pinecone namespace so users
  can NEVER see each other's documents, even inside the same index.
"""

import os
import uuid
import asyncio
import io
from typing import List, Optional
from datetime import datetime, timezone

import tiktoken
from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from groq import AsyncGroq
from pinecone import Pinecone, ServerlessSpec
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

router = APIRouter(tags=["RAG"])

# ── Clients ────────────────────────────────────────────────────────────────────
_groq = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))

_pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "mindpad-ai")
EMBEDDING_MODEL = "multilingual-e5-large"   # 1024-dim, Pinecone-native
EMBED_DIM = 1024

_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]
pdf_docs_col = _db["pdf_docs"]   # stores per-PDF metadata for each user

# ── Tokenizer ──────────────────────────────────────────────────────────────────
_enc = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(_enc.encode(text))


def split_into_token_chunks(text: str, max_tokens: int) -> List[str]:
    """
    Split *text* into chunks of at most *max_tokens* each,
    breaking on whitespace boundaries so words are never cut mid-way.
    """
    words = text.split()
    chunks: List[str] = []
    current: List[str] = []
    current_tokens = 0

    for word in words:
        wt = len(_enc.encode(word))
        if current_tokens + wt > max_tokens and current:
            chunks.append(" ".join(current))
            current, current_tokens = [], 0
        current.append(word)
        current_tokens += wt

    if current:
        chunks.append(" ".join(current))
    return chunks


# ── Pinecone index (lazy-initialised once per process) ─────────────────────────
_index = None


def _init_index():
    """Create the Pinecone serverless index if it doesn't exist, then cache it."""
    global _index
    if _index is not None:
        return _index

    existing = [idx.name for idx in _pc.list_indexes()]
    if PINECONE_INDEX_NAME not in existing:
        print(f"[Pinecone] Creating index '{PINECONE_INDEX_NAME}' …")
        _pc.create_index(
            name=PINECONE_INDEX_NAME,
            dimension=EMBED_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )

    _index = _pc.Index(PINECONE_INDEX_NAME)
    print(f"[Pinecone] Index '{PINECONE_INDEX_NAME}' ready.")
    return _index


def get_index():
    return _init_index()


# ── Groq: choose optimal chunk count ──────────────────────────────────────────
async def decide_chunk_count(total_tokens: int, pdf_name: str) -> int:
    """
    Ask Groq to pick the ideal number of chunks that balances semantic
    coherence vs. retrieval precision.  Hard constraints are enforced
    after the LLM responds:
      - max 1000 tokens / chunk
      - min 200 tokens  / chunk (to avoid meaningless micro-chunks)
    """
    prompt = (
        f"You are a RAG chunking expert.\n"
        f"PDF: \"{pdf_name}\" | Total tokens: {total_tokens}\n"
        f"Constraints: each chunk must be 200–1000 tokens.\n"
        f"Goal: choose a chunk count that keeps chunks semantically coherent "
        f"and precisely retrievable.\n"
        f"Reply with ONLY a single integer. No explanation."
    )

    resp = await _groq.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": prompt}],
        max_completion_tokens=8,
        temperature=0,
    )
    raw = resp.choices[0].message.content.strip()

    try:
        n = int("".join(filter(str.isdigit, raw)) or "0")
    except ValueError:
        n = 0

    # Hard-floor: need at least ⌈tokens/1000⌉ chunks to stay under 1000/chunk
    min_n = max(1, -(-total_tokens // 1000))        # ceiling division
    # Hard-ceiling: no more than ⌊tokens/200⌋ chunks (would produce tiny scraps)
    max_n = max(1, total_tokens // 200)

    clamped = max(min_n, min(max(n, min_n), max_n, 50))
    print(f"[RAG] Groq suggested {n} chunks → clamped to {clamped}")
    return clamped


# ── Embed helper (sync, runs in thread pool) ───────────────────────────────────
def _embed_sync(texts: List[str], input_type: str) -> List[List[float]]:
    result = _pc.inference.embed(
        model=EMBEDDING_MODEL,
        inputs=texts,
        parameters={"input_type": input_type, "truncate": "END"},
    )
    return [item["values"] for item in result]


async def embed_texts(texts: List[str], input_type: str = "passage") -> List[List[float]]:
    return await asyncio.to_thread(_embed_sync, texts, input_type)


# ── Public: RAG context retrieval (called from chat.py) ───────────────────────
async def generate_pdf_summary(doc_id: str, user_id: str, filename: str) -> str:
    """
    Generate a structured HTML summary for a newly-uploaded PDF.

    Strategy — identical to how RAG context is retrieved for chat:
      1. Embed a hardcoded broad summary query
      2. Retrieve the top-10 most-representative chunks from Pinecone
         (filtered to this doc, ordered by chunk_index for coherence)
      3. Feed those chunks to Groq with a hardcoded HTML summary prompt
      4. Return the HTML string (stored in MongoDB by the caller)
    """
    # Broad query that surfaces intro / methodology / results / conclusion chunks
    SUMMARY_QUERY = (
        "introduction overview main topic methodology findings results "
        "conclusions key points abstract"
    )
    try:
        q_vec = await embed_texts([SUMMARY_QUERY], "query")
        index = await asyncio.to_thread(get_index)

        results = await asyncio.to_thread(
            index.query,
            vector=q_vec[0],
            top_k=10,                          # more chunks → better coverage
            namespace=user_id,                 # user-isolated namespace
            include_metadata=True,
            filter={"doc_id": {"$in": [doc_id]}},
        )

        if not results.matches:
            return ""

        # Sort by chunk_index so the context reads in document order
        sorted_matches = sorted(
            results.matches,
            key=lambda m: m.metadata.get("chunk_index", 0),
        )
        context = "\n\n---\n\n".join(
            m.metadata.get("text", "") for m in sorted_matches
        )

        # Hardcoded summary prompt — HTML output matches the chat renderer
        prompt = (
            f'You are summarizing the PDF "{filename}".\n'
            f"Using ONLY the excerpts below, write a comprehensive, structured HTML summary.\n"
            f"Cover: main topic, key arguments, methodology (if present), findings, conclusions.\n"
            f"Rules:\n"
            f"  - Output ONLY clean HTML: <h3>, <p>, <ul>, <li>, <strong>, <em>, <hr> tags\n"
            f"  - No <html>/<body>/<head> tags, no inline styles, no markdown\n"
            f"  - Do NOT open with 'Here is a summary' — go straight into content\n\n"
            f"DOCUMENT EXCERPTS:\n{context}"
        )

        resp = await _groq.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=1500,
            temperature=0.3,
        )
        summary = resp.choices[0].message.content.strip()
        print(f"[RAG] Summary generated for '{filename}' ({len(summary)} chars)")
        return summary

    except Exception as exc:
        print(f"[RAG summary error] {exc}")
        return ""


async def retrieve_rag_context(
    query: str,
    user_id: str,
    doc_ids: List[str],
    top_k: int = 3,
) -> str:
    """
    Embed *query*, query Pinecone in the user's namespace filtered to
    *doc_ids*, and return the top-k chunks as a formatted string.

    Returns "" if nothing relevant is found or an error occurs.
    """
    if not doc_ids:
        return ""
    try:
        q_vec = await embed_texts([query], "query")
        index = await asyncio.to_thread(get_index)

        results = await asyncio.to_thread(
            index.query,
            vector=q_vec[0],
            top_k=top_k,
            namespace=user_id,          # ← user-isolated namespace
            include_metadata=True,
            filter={"doc_id": {"$in": doc_ids}},
        )

        if not results.matches:
            return ""

        parts: List[str] = []
        for match in results.matches:
            meta = match.metadata or {}
            source = meta.get("pdf_name", "document")
            chunk_text = meta.get("text", "")
            parts.append(f"[Source: {source}]\n{chunk_text}")

        return "\n\n---\n\n".join(parts)

    except Exception as e:
        print(f"[RAG retrieve error] {e}")
        return ""


# ── POST /upload-pdf ───────────────────────────────────────────────────────────
@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    x_notebook_id: Optional[str] = Header(None, alias="X-Notebook-Id"),
):
    """
    Full RAG ingestion pipeline:
      1. Extract text (PyPDF2)
      2. Count tokens (tiktoken cl100k_base)
      3. Groq decides optimal chunk count (max 1000 tokens/chunk)
      4. Split text into chunks
      5. Embed with Pinecone multilingual-e5-large
      6. Upsert into Pinecone — namespace = Clerk user_id
      7. Save metadata to MongoDB pdf_docs collection
    """
    # ── Auth ───────────────────────────────────────────────────────────────────
    # Import here to avoid circular import at module load time
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    notebook_id = x_notebook_id or ""
    if not notebook_id:
        raise HTTPException(status_code=400, detail="X-Notebook-Id header is required")

    pdf_bytes = await file.read()
    filename = file.filename or "document.pdf"

    # ── 1. Extract text ────────────────────────────────────────────────────────
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
        full_text = "\n".join(
            page.extract_text() or "" for page in reader.pages
        ).strip()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"PDF read error: {exc}")

    if not full_text:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found. The PDF may be scanned or image-only.",
        )

    # ── 2. Count tokens ────────────────────────────────────────────────────────
    total_tokens = count_tokens(full_text)
    print(f"[RAG] '{filename}' → {total_tokens} tokens")

    # ── 3. Groq decides chunk count ────────────────────────────────────────────
    num_chunks_target = await decide_chunk_count(total_tokens, filename)
    tokens_per_chunk = min(1000, max(200, total_tokens // max(1, num_chunks_target)))

    # ── 4. Split text ──────────────────────────────────────────────────────────
    chunks = split_into_token_chunks(full_text, tokens_per_chunk)
    actual_chunks = len(chunks)
    print(f"[RAG] {actual_chunks} chunks @ ≤{tokens_per_chunk} tokens each")

    # ── 5. Embed chunks ────────────────────────────────────────────────────────
    try:
        embeddings = await embed_texts(chunks, "passage")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {exc}")

    # ── 6. Upsert to Pinecone ──────────────────────────────────────────────────
    doc_id = uuid.uuid4().hex
    vectors = [
        {
            "id": f"{doc_id}::chunk_{i}",
            "values": embeddings[i],
            "metadata": {
                "doc_id":      doc_id,
                "notebook_id": notebook_id,
                "user_id":     user_id,
                "pdf_name":    filename,
                "chunk_index": i,
                # Store at most 2 000 chars so Pinecone metadata stays lean
                "text":        chunks[i][:2000],
            },
        }
        for i in range(actual_chunks)
    ]

    try:
        index = await asyncio.to_thread(get_index)
        # Batch upserts — Pinecone recommends ≤100 vectors per call
        for batch_start in range(0, len(vectors), 100):
            await asyncio.to_thread(
                index.upsert,
                vectors=vectors[batch_start : batch_start + 100],
                namespace=user_id,          # ← user-isolated namespace
            )
        print(f"[RAG] Upserted {actual_chunks} vectors → namespace='{user_id}'")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Pinecone upsert failed: {exc}")

    # ── 7. Save metadata to MongoDB (summary added in step 8) ────────────────
    await pdf_docs_col.insert_one({
        "doc_id":           doc_id,
        "notebook_id":      notebook_id,
        "user_id":          user_id,
        "name":             filename,
        "size":             len(pdf_bytes),
        "total_tokens":     total_tokens,
        "chunk_count":      actual_chunks,
        "tokens_per_chunk": tokens_per_chunk,
        "uploaded_at":      datetime.now(timezone.utc),
        "selected":         True,
        "summary":          "",          # placeholder — filled in step 8
    })

    # ── 8. Generate summary using the same RAG system (hardcoded query) ───────
    summary = await generate_pdf_summary(doc_id, user_id, filename)
    if summary:
        await pdf_docs_col.update_one(
            {"doc_id": doc_id},
            {"$set": {"summary": summary}},
        )

    return {
        "doc_id":           doc_id,
        "name":             filename,
        "total_tokens":     total_tokens,
        "chunk_count":      actual_chunks,
        "tokens_per_chunk": tokens_per_chunk,
        "selected":         True,
        "summary":          summary,     # returned to frontend for immediate display
    }


# ── GET /pdfs/{notebook_id} ────────────────────────────────────────────────────
@router.get("/pdfs/{notebook_id}")
async def list_pdfs(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    """Return all PDFs uploaded to the given notebook by the current user."""
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    cursor = pdf_docs_col.find(
        {"notebook_id": notebook_id, "user_id": user_id},
        {
            "_id": 0,
            "doc_id": 1, "name": 1, "size": 1,
            "total_tokens": 1, "chunk_count": 1,
            "tokens_per_chunk": 1, "uploaded_at": 1, "selected": 1,
        },
    ).sort("uploaded_at", -1)

    docs = await cursor.to_list(length=200)
    for d in docs:
        if d.get("uploaded_at"):
            d["uploaded_at"] = d["uploaded_at"].isoformat()

    return {"pdfs": docs}


# ── DELETE /pdfs/{doc_id} ──────────────────────────────────────────────────────
@router.delete("/pdfs/{doc_id}")
async def delete_pdf(
    doc_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Delete a PDF's vectors from Pinecone (user namespace) and its
    metadata row from MongoDB.  Only the owning user can delete.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    doc = await pdf_docs_col.find_one({"doc_id": doc_id, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="PDF not found or access denied")

    chunk_count = doc.get("chunk_count", 100)
    vector_ids = [f"{doc_id}::chunk_{i}" for i in range(chunk_count)]

    # Remove vectors from Pinecone (non-fatal if already gone)
    try:
        index = await asyncio.to_thread(get_index)
        await asyncio.to_thread(index.delete, ids=vector_ids, namespace=user_id)
        print(f"[RAG] Deleted {chunk_count} vectors for doc_id={doc_id}")
    except Exception as exc:
        print(f"[RAG delete] Pinecone error (non-fatal): {exc}")

    # Remove metadata from MongoDB
    await pdf_docs_col.delete_one({"doc_id": doc_id, "user_id": user_id})
    return {"status": "deleted", "doc_id": doc_id}
