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
import hashlib
from typing import List, Optional
from datetime import datetime, timezone

import tiktoken
from bson import ObjectId
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
EMBED_BATCH_SIZE = 90   # stay safely under multilingual-e5-large's 96-input limit

_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]
pdf_docs_col  = _db["pdf_docs"]    # per-PDF metadata for each user
notebooks_col = _db["notebooks"]   # same collection as chat.py uses

# ── Ensure MongoDB indexes (called once at startup) ────────────────────────────
async def ensure_indexes():
    """
    Create indexes needed for deduplication and list queries.
    Motor's create_index is idempotent — safe to call on every startup.
    """
    # Fast dedup lookup: (user_id, pdf_hash)
    await pdf_docs_col.create_index(
        [("user_id", 1), ("pdf_hash", 1)],
        name="user_pdf_hash",
        background=True,
    )
    # Fast notebook PDF listing
    await pdf_docs_col.create_index(
        [("notebook_id", 1), ("user_id", 1), ("uploaded_at", -1)],
        name="notebook_user_uploaded",
        background=True,
    )
    print("[RAG] MongoDB indexes ensured.")

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
        f"Constraints: each chunk must be 100–1000 tokens.\n"
        f"Goal: choose a chunk count that gives precise, retrievable chunks. "
        f"Prefer more, smaller chunks over fewer large ones when the document permits.\n"
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
    # Hard-ceiling: no more than ⌊tokens/100⌋ chunks (100-token min per chunk)
    max_n = max(1, total_tokens // 100)

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


# ── Public: RAG context retrieval (called from chat.py) ──────────────────────
async def generate_pdf_summary(doc_id: str, user_id: str, filename: str) -> tuple:
    """
    Generate a structured HTML summary AND a short notebook name for a newly-uploaded PDF
    in a single LLM call — eliminates the race condition that existed when both were
    separate sequential calls.

    Strategy:
      1. Embed a broad summary query
      2. Retry querying Pinecone up to 4 times (3 s apart) — serverless
         indexes can take a few seconds to become queryable after upsert
      3. Feed the top-10 retrieved chunks to Groq, which responds with:
             NOTEBOOK_NAME: <4-7 word title in Title Case>
             <rest is clean HTML summary>
      4. Parse the first line to extract the notebook name
      5. Return (summary_html, notebook_name)
    """
    SUMMARY_QUERY = (
        "introduction overview main topic methodology findings results "
        "conclusions key points abstract"
    )
    fallback_name = (filename.rsplit(".", 1)[0] if "." in filename else filename)[:80]

    try:
        q_vec = await embed_texts([SUMMARY_QUERY], "query")
        index = await asyncio.to_thread(get_index)

        # ── Retry loop: wait for Pinecone to index the freshly upserted vectors
        # top_k=4 keeps us inside Groq's 8000 TPM limit:
        #   4 chunks × ~1000 tokens = ~4000 ctx + ~500 prompt + 1200 output ≈ 5700 total
        # (top_k=10 was causing rate-limit failures on subsequent uploads)
        results = None
        for attempt in range(4):                      # try up to 4 times
            r = await asyncio.to_thread(
                index.query,
                vector=q_vec[0],
                top_k=4,
                namespace=user_id,
                include_metadata=True,
                filter={"doc_id": {"$in": [doc_id]}},
            )
            if r.matches:
                results = r
                print(f"[RAG] Pinecone returned {len(r.matches)} matches on attempt {attempt+1}")
                break
            print(f"[RAG] Pinecone returned 0 matches (attempt {attempt+1}/4) — waiting 3 s…")
            await asyncio.sleep(3)

        if not results or not results.matches:
            print(f"[RAG] No Pinecone matches found after retries for doc_id={doc_id}")
            return "", fallback_name

        # Sort by chunk_index so context reads in document order
        sorted_matches = sorted(
            results.matches,
            key=lambda m: m.metadata.get("chunk_index", 0),
        )
        context = "\n\n---\n\n".join(
            m.metadata.get("text", "") for m in sorted_matches
        )

        prompt = (
            f'You are summarizing the PDF "{filename}".\n'
            f"Using ONLY the excerpts below, produce two things:\n\n"
            f"1. FIRST LINE ONLY — a short notebook title (4-7 words, Title Case, no quotes, no punctuation at end).\n"
            f"   Start this line with exactly: NOTEBOOK_NAME: \n"
            f"   Example: NOTEBOOK_NAME: Climate Change Economic Impacts Study\n\n"
            f"2. THEN — a comprehensive, structured HTML summary.\n"
            f"   Cover: main topic, key arguments, methodology (if present), findings, conclusions.\n\n"
            f"STRICT RULES:\n"
            f"  - The very first line must be: NOTEBOOK_NAME: <title>\n"
            f"  - After that, output ONLY clean HTML: <h3>, <p>, <ul>, <li>, <strong>, <em>, <hr> tags\n"
            f"  - No <html>/<body>/<head> tags, no inline styles, no markdown\n"
            f"  - Do NOT open the summary with 'Here is a summary' — go straight into content\n"
            f"  - The notebook title must NOT be generic (avoid: 'PDF Summary', 'Research Notes', 'Document Overview')\n"
            f"  - The notebook title must NOT be the filename or its words\n\n"
            f"DOCUMENT EXCERPTS:\n{context}"
        )

        resp = await _groq.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=1200,  # 4k ctx + 500 prompt + 1200 out ≈ 5700 ≤ 8000 TPM
            temperature=0.3,
        )
        raw = resp.choices[0].message.content.strip()

        # ── Parse: first line = NOTEBOOK_NAME: <name>, rest = HTML summary
        notebook_name = fallback_name
        summary = raw

        lines = raw.split("\n", 1)
        first_line = lines[0].strip()
        if first_line.upper().startswith("NOTEBOOK_NAME:"):
            extracted = first_line[len("NOTEBOOK_NAME:"):].strip().strip('"\' ').rstrip(".,;:")
            if extracted:
                notebook_name = extracted
            summary = lines[1].strip() if len(lines) > 1 else ""
        else:
            # LLM didn't follow format — whole response is summary, use fallback name
            print(f"[RAG] Warning: LLM did not start with NOTEBOOK_NAME: prefix. Raw start: {first_line[:80]}")

        print(f"[RAG] Summary generated for '{filename}' ({len(summary)} chars)")
        print(f"[RAG] Notebook name extracted: '{notebook_name}'")
        return summary, notebook_name

    except Exception as exc:
        print(f"[RAG summary error] {exc}")
        return "", fallback_name


# generate_notebook_name has been merged into generate_pdf_summary above.
# Both the summary and the notebook name are now produced in a single LLM call
# to eliminate the race condition that occurred when the naming call ran
# before the summary was reliably written to MongoDB.


async def retrieve_rag_context(
    query: str,
    user_id: str,
    doc_ids: List[str],
    top_k: int = 3,
) -> tuple:
    """
    Embed *query*, query Pinecone in the user's namespace filtered to
    *doc_ids*, and return:
      - formatted context string (for injection into system prompt)
      - list of source dicts (for frontend hover citations)

    When multiple doc_ids are provided each doc is queried individually
    (1 chunk per doc guaranteed), then all results are merged and the
    top `top_k` by score are kept — ensuring every selected PDF contributes.

    Returns ("", []) if nothing relevant is found or an error occurs.
    """
    if not doc_ids:
        return "", []
    try:
        q_vec = await embed_texts([query], "query")
        index = await asyncio.to_thread(get_index)

        print(f"[RAG] retrieve_rag_context called: top_k={top_k}, doc_ids={doc_ids}")
        # Unified query across all selected PDFs — cosine similarity decides
        # relevance.  All PDFs in a notebook share the same user namespace so a
        # single $in filter is all that's needed; no per-doc round-trips.
        results = await asyncio.to_thread(
            index.query,
            vector=q_vec[0],
            top_k=top_k,
            namespace=user_id,
            include_metadata=True,
            filter={"doc_id": {"$in": doc_ids}},
        )
        all_matches = results.matches or []
        print(f"[RAG] Pinecone returned {len(all_matches)} chunk(s) for top_k={top_k} across {len(doc_ids)} doc(s)")

        if not all_matches:
            return "", []

        parts: List[str] = []
        sources: List[dict] = []
        for match in all_matches:
            meta = match.metadata or {}
            source = meta.get("pdf_name", "document")
            chunk_text = meta.get("text", "")
            parts.append(f"[Source: {source}]\n{chunk_text}")
            sources.append({
                "pdf_name":    source,
                "chunk_index": meta.get("chunk_index", 0),
                "doc_id":      meta.get("doc_id", ""),
                "text":        chunk_text,
                "score":       round(float(match.score), 3) if match.score else 0.0,
            })

        return "\n\n---\n\n".join(parts), sources

    except Exception as e:
        print(f"[RAG retrieve error] {e}")
        return "", []


# ── POST /upload-pdf ───────────────────────────────────────────────────────────
@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    x_notebook_id: Optional[str] = Header(None, alias="X-Notebook-Id"),
):
    """
    Full RAG ingestion pipeline with deduplication:
      0. SHA-256 hash of raw bytes → check MongoDB for existing user doc
         If match found → reuse existing doc_id / vectors (skip steps 1-6)
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

    # ── 0. Deduplication: hash the raw bytes ───────────────────────────────────
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
    print(f"[RAG] PDF hash for '{filename}': {pdf_hash[:16]}…")

    # Check if this user has already processed an identical PDF elsewhere
    existing_doc = await pdf_docs_col.find_one(
        {"user_id": user_id, "pdf_hash": pdf_hash},
        # Prefer docs that have a summary already; sort by upload date descending
        sort=[("uploaded_at", -1)],
    )

    if existing_doc:
        # ── Fast path: reuse existing vectors ─────────────────────────────────
        orig_doc_id      = existing_doc["doc_id"]
        orig_total_toks  = existing_doc.get("total_tokens", 0)
        orig_chunks      = existing_doc.get("chunk_count", 0)
        orig_tpc         = existing_doc.get("tokens_per_chunk", 0)
        orig_summary     = existing_doc.get("summary", "")
        orig_firebase    = existing_doc.get("firebase_pdf_url", "")
        orig_name        = existing_doc.get("suggested_name") or existing_doc.get("name", filename)

        print(f"[RAG] ♻️  Duplicate PDF detected — reusing doc_id={orig_doc_id} "
              f"from notebook {existing_doc.get('notebook_id')} "
              f"(skipping embed + Pinecone upsert)")

        # Create a fresh pdf_docs row for *this* notebook that points to the
        # same doc_id so Pinecone vector queries work without any re-indexing.
        new_meta = {
            "doc_id":           orig_doc_id,      # same Pinecone vectors!
            "notebook_id":      notebook_id,
            "user_id":          user_id,
            "name":             filename,
            "size":             len(pdf_bytes),
            "total_tokens":     orig_total_toks,
            "chunk_count":      orig_chunks,
            "tokens_per_chunk": orig_tpc,
            "uploaded_at":      datetime.now(timezone.utc),
            "selected":         True,
            "summary":          orig_summary,
            "firebase_pdf_url": orig_firebase,
            "pdf_hash":         pdf_hash,
            "reused_from":      existing_doc["_id"],  # audit trail
        }
        await pdf_docs_col.insert_one(new_meta)

        # Persist a "♻️ Already indexed" summary message to the notebook chat
        if orig_summary:
            try:
                meta_line = (
                    f'<p><strong>{filename}</strong> '
                    f'&nbsp;<em style="font-size:0.8em;opacity:0.6">'
                    f'{orig_total_toks:,} tokens · {orig_chunks} chunks — '
                    f'<strong>♻️ reused from existing index</strong>'
                    f'</em></p><hr>'
                )
                await notebooks_col.update_one(
                    {"_id": ObjectId(notebook_id)},
                    {
                        "$push": {"messages": {"role": "assistant", "content": meta_line + orig_summary}},
                        "$set":  {"updated_at": datetime.now(timezone.utc)},
                    },
                )
                print(f"[RAG] Reuse summary persisted to notebook {notebook_id}")
            except Exception as exc:
                print(f"[RAG] Warning: could not persist reuse summary: {exc}")

        return {
            "doc_id":           orig_doc_id,
            "name":             filename,
            "total_tokens":     orig_total_toks,
            "chunk_count":      orig_chunks,
            "tokens_per_chunk": orig_tpc,
            "selected":         True,
            "summary":          orig_summary,
            "suggested_name":   orig_name,
            "firebase_pdf_url": orig_firebase,
            "reused":           True,   # ← tells frontend to skip Firebase re-upload
        }
    # ── End fast path ─────────────────────────────────────────────────────────

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

    # ── 5. Embed chunks (batched — multilingual-e5-large limit: 96 inputs/call) ──
    # A 1-second pause between batches avoids Pinecone inference 429s on large PDFs.
    try:
        embeddings: List[List[float]] = []
        for batch_idx, batch_start in enumerate(range(0, actual_chunks, EMBED_BATCH_SIZE)):
            if batch_idx > 0:
                await asyncio.sleep(1)   # rate-limit guard between batches
            batch = chunks[batch_start : batch_start + EMBED_BATCH_SIZE]
            batch_embeddings = await embed_texts(batch, "passage")
            embeddings.extend(batch_embeddings)
            print(f"[RAG] Embedded chunks {batch_start}–{batch_start + len(batch) - 1} "
                  f"({len(batch_embeddings)} vectors)")
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

    # ── 7. Save metadata to MongoDB (summary + firebase_url added later) ────────
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
        "summary":          "",   # placeholder — filled in step 8
        "firebase_pdf_url": "",   # placeholder — filled by frontend after Firebase upload
        "pdf_hash":         pdf_hash,  # for deduplication on future uploads
    })

    # ── 7b. Backfill pdf_hash on legacy docs (uploaded before dedup was added) ──
    # Older documents for this user share the same filename + byte size but have
    # no pdf_hash field because they predate this feature.  Stamping the hash now
    # means the *next* re-upload of those PDFs will correctly hit the fast path.
    try:
        backfill_result = await pdf_docs_col.update_many(
            {
                "user_id":  user_id,
                "name":     filename,
                "size":     len(pdf_bytes),
                "pdf_hash": {"$exists": False},   # only legacy docs without a hash
            },
            {"$set": {"pdf_hash": pdf_hash}},
        )
        if backfill_result.modified_count:
            print(
                f"[RAG] Backfilled pdf_hash onto {backfill_result.modified_count} "
                f"legacy doc(s) for '{filename}' — future re-uploads will skip processing"
            )
    except Exception as exc:
        print(f"[RAG] Warning: pdf_hash backfill failed (non-fatal): {exc}")

    # ── 8. Query Pinecone for indexed vectors → single LLM call produces:
    #         • suggested_name  (parsed from first line: "NOTEBOOK_NAME: ...")
    #         • summary         (the rest of the response — clean HTML)
    #    generate_pdf_summary retries up to 4× (3 s apart) so Pinecone has time
    #    to make the freshly upserted vectors queryable.
    summary, suggested_name = await generate_pdf_summary(doc_id, user_id, filename)
    if summary:
        await pdf_docs_col.update_one(
            {"doc_id": doc_id, "notebook_id": notebook_id},
            {"$set": {"summary": summary, "suggested_name": suggested_name}},
        )
        print(f"[RAG] Summary saved to MongoDB for doc_id={doc_id}")

        # ── Persist the summary as an assistant chat message in the notebook ───────
        # This means the summary survives page refreshes: loadHistory() fetches
        # it back from MongoDB just like any other chat message.
        try:
            meta_line = (
                f'<p><strong>{filename}</strong> '
                f'&nbsp;<em style="font-size:0.8em;opacity:0.6">'
                f'{total_tokens:,} tokens · {actual_chunks} chunks indexed'
                f'</em></p><hr>'
            )
            summary_chat_msg = {
                "role":    "assistant",
                "content": meta_line + summary,
            }
            await notebooks_col.update_one(
                {"_id": ObjectId(notebook_id)},
                {
                    "$push": {"messages": summary_chat_msg},
                    "$set":  {"updated_at": datetime.now(timezone.utc)},
                },
            )
            print(f"[RAG] Summary message persisted to notebook {notebook_id}")
        except Exception as exc:
            print(f"[RAG] Warning: could not persist summary message to notebook: {exc}")
    else:
        print(f"[RAG] WARNING: summary empty for '{filename}' — notebook name will fall back to filename")

    print(f"[RAG] Suggested notebook name: '{suggested_name}'")

    return {
        "doc_id":           doc_id,
        "name":             filename,
        "total_tokens":     total_tokens,
        "chunk_count":      actual_chunks,
        "tokens_per_chunk": tokens_per_chunk,
        "selected":         True,
        "summary":          summary,        # returned to frontend for immediate display
        "suggested_name":   suggested_name, # parsed from same LLM response — no race condition
        "reused":           False,
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


# ── PATCH /pdfs/{doc_id}/firebase-url ────────────────────────────────────
from pydantic import BaseModel as _BaseModel

class _FirebaseUrlBody(_BaseModel):
    firebase_pdf_url: str

@router.patch("/pdfs/{doc_id}/firebase-url")
async def save_pdf_firebase_url(
    doc_id: str,
    body: _FirebaseUrlBody,
    authorization: Optional[str] = Header(None),
):
    """
    Called by the frontend after uploading the raw PDF file to Firebase Storage.
    Saves the permanent download URL to MongoDB so the PDF can be re-downloaded later.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    doc = await pdf_docs_col.find_one({"doc_id": doc_id, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="PDF not found or access denied")

    await pdf_docs_col.update_one(
        {"doc_id": doc_id, "user_id": user_id},
        {"$set": {"firebase_pdf_url": body.firebase_pdf_url}},
    )
    print(f"[RAG] Firebase PDF URL saved for doc_id={doc_id}: {body.firebase_pdf_url[:60]}...")
    return {"status": "ok"}


# ── DELETE /pdfs/{doc_id} ──────────────────────────────────────────────────────
@router.delete("/pdfs/{doc_id}")
async def delete_pdf(
    doc_id: str,
    authorization: Optional[str] = Header(None),
    x_notebook_id: Optional[str] = Header(None, alias="X-Notebook-Id"),
):
    """
    Remove a PDF from a notebook.

    Strategy (dedup-safe):
      • Pinecone vectors are NEVER deleted — they stay in the user namespace
        so that an identical PDF uploaded to any future notebook can skip
        re-embedding entirely (zero Pinecone write-units reused).
      • Only the single pdf_docs MongoDB row for *this* notebook is removed.
      • The firebase_pdf_url is returned to the frontend so it can delete
        the raw PDF file from Firebase Storage (storage cost, not compute).

    Only the owning user can delete.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    notebook_id = x_notebook_id or ""

    # Find the precise row for this user + notebook combination
    query: dict = {"doc_id": doc_id, "user_id": user_id}
    if notebook_id:
        query["notebook_id"] = notebook_id

    doc = await pdf_docs_col.find_one(query)
    if not doc:
        raise HTTPException(status_code=404, detail="PDF not found or access denied")

    firebase_pdf_url = doc.get("firebase_pdf_url", "")

    # ♻️  Pinecone vectors are intentionally preserved for deduplication reuse.
    #     If the same PDF is uploaded again (same sha-256 hash), the backend
    #     will find the still-existing vectors and skip all embedding work.
    print(
        f"[RAG] Removing MongoDB record for doc_id={doc_id} "
        f"notebook={notebook_id or 'any'} "
        f"(Pinecone vectors kept for dedup reuse)"
    )

    # Remove only this notebook's metadata row from MongoDB
    await pdf_docs_col.delete_one(query)

    return {
        "status":           "deleted",
        "doc_id":           doc_id,
        "firebase_pdf_url": firebase_pdf_url,  # frontend uses this to delete from Firebase Storage
    }


# ── Notebook cascade cleanup (called from chat.py on notebook delete) ──────────
async def cleanup_notebook_pdfs(notebook_id: str, user_id: str) -> list:
    """
    Called when an entire notebook is deleted.  Handles three resources:

      Firebase Storage  → always collect URLs so the frontend can delete files
                          (storage is billed per byte; always clean up)

      Pinecone vectors  → NEVER deleted — permanently preserved so that an
                          identical PDF uploaded to any future notebook can skip
                          re-embedding entirely (zero Pinecone write-units wasted).

      MongoDB pdf_docs  → rows that still have other notebook references are
                          deleted normally.  Rows that are the LAST reference for
                          a doc_id are converted into dedup anchors
                          (notebook_id="__dedup__") instead of being deleted, so
                          the pdf_hash → doc_id mapping survives for future uploads.

    Returns list[str] of firebase_pdf_urls so the frontend can call deleteObject().
    """
    # 1. Fetch all PDF docs belonging to this notebook
    cursor = pdf_docs_col.find({"notebook_id": notebook_id, "user_id": user_id})
    notebook_pdfs = await cursor.to_list(length=500)

    if not notebook_pdfs:
        print(f"[RAG cleanup] No pdf_docs found for notebook {notebook_id}")
        return []

    firebase_urls: list = []
    anchor_ids: list = []  # _id's of rows to keep as dedup anchors

    for doc in notebook_pdfs:
        doc_id = doc["doc_id"]
        fb_url = doc.get("firebase_pdf_url", "")
        if fb_url:
            firebase_urls.append(fb_url)

        # Check if any OTHER notebook for this user still references this doc_id
        other_refs = await pdf_docs_col.count_documents({
            "user_id":     user_id,
            "doc_id":      doc_id,
            "notebook_id": {"$ne": notebook_id},
        })

        if other_refs == 0:
            # Last reference — promote this row to a dedup anchor so that
            # future uploads of the same PDF can still reuse existing vectors.
            # ♻️  Pinecone vectors are NEVER deleted.
            anchor_ids.append(doc["_id"])

    # 2. Convert last-reference rows into dedup anchors.
    #    Clear firebase_pdf_url because the Firebase file is about to be removed.
    if anchor_ids:
        await pdf_docs_col.update_many(
            {"_id": {"$in": anchor_ids}},
            {"$set": {
                "notebook_id":      "__dedup__",  # sentinel — won't match any real notebook query
                "firebase_pdf_url": "",           # Firebase file being deleted; URL no longer valid
                "dedup_anchor":     True,
            }},
        )
        print(
            f"[RAG cleanup] Converted {len(anchor_ids)} doc(s) to dedup anchors "
            f"(Pinecone vectors permanently preserved)"
        )

    # 3. Delete all remaining rows for this notebook (anchor rows were already
    #    re-parented to '__dedup__' so they won't be matched here).
    result = await pdf_docs_col.delete_many({"notebook_id": notebook_id, "user_id": user_id})
    print(f"[RAG cleanup] Deleted {result.deleted_count} pdf_docs rows for notebook {notebook_id}")

    return firebase_urls


async def cleanup_user_all_data(user_id: str) -> None:
    """
    Called when a Clerk user is permanently deleted.
    Wipes ALL data for the user:
      • All pdf_docs rows (including dedup anchors)
      • Entire Pinecone namespace (all vectors)
    Notebooks and users_meta are deleted directly in chat.py before this is called.
    """
    # Delete all pdf_docs rows for this user (including dedup anchors)
    result = await pdf_docs_col.delete_many({"user_id": user_id})
    print(f"[RAG] Deleted {result.deleted_count} pdf_docs rows for user {user_id[:12]}…")

    # Delete entire Pinecone namespace for this user
    try:
        index = get_index()
        await asyncio.to_thread(index.delete, delete_all=True, namespace=user_id)
        print(f"[RAG] Deleted Pinecone namespace for user {user_id[:12]}…")
    except Exception as e:
        print(f"[RAG] Pinecone namespace delete failed for user {user_id[:12]}…: {e}")

    return firebase_urls
