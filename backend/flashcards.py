"""
flashcards.py
-------------
FastAPI router — Flashcards AI Studio feature.

Pipeline:
  1. Auth — Clerk JWT via get_current_user().
  2. Fetch stored HTML summaries from MongoDB pdf_docs (same helper as video_suggestions.py).
  3. Retrieve top-5 Pinecone chunks for "important topics key concepts" via retrieve_rag_context().
  4. Combine summaries + chunks into a rich context block.
  5. Fail-fast HTTP 422 if both sources are empty.
  6. GPT-OSS-20B generates exactly N Q&A cards as strict JSON.
  7. Return { cards, topic, num_cards }.
"""

import os
import asyncio
import re as _re
import json as _json
from html.parser import HTMLParser
from typing import List, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from groq import AsyncGroq
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# ── Clients ──────────────────────────────────────────────────────────────────
_groq = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY", ""))

# ── MongoDB ───────────────────────────────────────────────────────────────────
_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]
_pdf_docs_col = _db["pdf_docs"]


# ── Request model ─────────────────────────────────────────────────────────────
class FlashcardsRequest(BaseModel):
    notebook_id: str
    selected_pdf_ids: Optional[List[str]] = []
    num_cards: int = 10


# ── Auth ──────────────────────────────────────────────────────────────────────
async def _get_current_user(authorization: Optional[str]):
    from chat import get_current_user
    return await get_current_user(authorization)


# ── HTML stripper ─────────────────────────────────────────────────────────────
class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: List[str] = []

    def handle_data(self, data: str):
        t = data.strip()
        if t:
            self._parts.append(t)

    def get_text(self) -> str:
        return " ".join(self._parts)


def _strip_html(html: str) -> str:
    s = _Stripper()
    s.feed(html)
    return s.get_text()


# ── Fetch PDF summaries from MongoDB ─────────────────────────────────────────
async def _fetch_summaries(
    user_id: str, notebook_id: str, doc_ids: List[str]
) -> Tuple[str, List[str]]:
    """
    Returns (plain_text_context, list_of_doc_names).
    Queries by doc_id when provided (globally unique), else by notebook_id.
    """
    if doc_ids:
        query: dict = {"doc_id": {"$in": doc_ids}}
    else:
        query = {"user_id": user_id, "notebook_id": notebook_id}

    print(f"[Flashcards] Querying pdf_docs: {query}")
    docs = await _pdf_docs_col.find(
        query, {"_id": 0, "name": 1, "summary": 1}
    ).limit(10).to_list(10)
    print(f"[Flashcards] Found {len(docs)} doc(s)")

    parts: List[str] = []
    names: List[str] = []
    for doc in docs:
        name = doc.get("name", "Document")
        raw = doc.get("summary", "")
        if not raw:
            continue
        plain = _strip_html(raw)[:800]
        if plain:
            parts.append(f"[{name}]: {plain}")
            names.append(name)

    return "\n\n".join(parts)[:3000], names


# ── Retrieve top-N Pinecone chunks ────────────────────────────────────────────
async def _retrieve_chunks(user_id: str, doc_ids: List[str], top_k: int = 5) -> str:
    """
    Pull the top-k most relevant chunks from Pinecone for a broad 'key topics' query.
    Returns a combined plain-text string, or '' if nothing found.
    """
    if not doc_ids:
        return ""
    try:
        from rag import retrieve_rag_context
        context, _ = await retrieve_rag_context(
            query="most important topics key concepts definitions principles",
            user_id=user_id,
            doc_ids=doc_ids,
            top_k=top_k,
        )
        return context
    except Exception as exc:
        print(f"[Flashcards] Pinecone retrieval failed: {exc}")
        return ""


# ── Generate Q&A cards via LLM ────────────────────────────────────────────────
async def _generate_cards(context: str, num_cards: int) -> List[dict]:
    """
    Ask GPT-OSS-20B to produce `num_cards` Q&A pairs as a strict JSON array.
    Strips <think>…</think> blocks before parsing.
    """
    system_prompt = (
        "You are an expert academic tutor specialising in flashcard creation. "
        "Respond ONLY with a valid JSON array — no markdown fences, no explanation. "
        f"Produce exactly {num_cards} objects, each with two string fields: "
        '"question" (concise, clear) and "answer" (1–3 sentences, accurate). '
        'Example: [{"question": "What is X?", "answer": "X is Y."}]'
    )
    user_prompt = (
        f"Based on the following research document content, generate exactly {num_cards} "
        "important flashcard question-and-answer pairs that cover the key topics, "
        "definitions, principles, and concepts a student must know.\n\n"
        "Make questions specific and testable. Answers should be concise but complete.\n\n"
        f"DOCUMENT CONTENT:\n{context}"
    )

    completion = await _groq.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=2048,
    )

    raw = (completion.choices[0].message.content or "").strip()
    # Strip reasoning blocks
    raw = _re.sub(r"<think>.*?</think>", "", raw, flags=_re.DOTALL).strip()
    # Strip markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("LLM did not return a JSON array")

    cards = _json.loads(raw[start: end + 1])
    if not isinstance(cards, list):
        raise ValueError("Parsed result is not a list")

    # Validate each card
    valid = [
        c for c in cards
        if isinstance(c, dict)
        and isinstance(c.get("question"), str) and c["question"].strip()
        and isinstance(c.get("answer"), str) and c["answer"].strip()
    ]
    return valid[:num_cards]


# ── Route ─────────────────────────────────────────────────────────────────────
@router.post("/flashcards")
async def generate_flashcards(
    body: FlashcardsRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate flashcards from the stored PDF summaries and Pinecone chunks
    for the selected documents in the given notebook.
    """
    user_id, _ = await _get_current_user(authorization)

    num_cards = max(5, min(body.num_cards, 20))
    doc_ids = [d for d in (body.selected_pdf_ids or []) if d]

    # 1. Fetch MongoDB summaries
    summary_ctx, doc_names = await _fetch_summaries(user_id, body.notebook_id, doc_ids)

    # 2. Retrieve Pinecone chunks (only when specific doc_ids known)
    chunk_ctx = await _retrieve_chunks(user_id, doc_ids, top_k=5) if doc_ids else ""

    # 3. Combine — chunks first (most specific), then summaries
    combined = "\n\n".join(filter(None, [chunk_ctx, summary_ctx]))[:4000]

    if not combined.strip():
        raise HTTPException(
            status_code=422,
            detail="No document content found. Please select indexed PDFs and try again.",
        )

    topic = doc_names[0] if doc_names else "Research Document"
    print(f"[Flashcards] {len(combined)} chars of context from: {doc_names}")

    # 4. Generate cards
    try:
        cards = await _generate_cards(combined, num_cards)
    except Exception as exc:
        print(f"[Flashcards] LLM error: {exc}")
        raise HTTPException(status_code=500, detail=f"Card generation failed: {exc}")

    if not cards:
        raise HTTPException(status_code=500, detail="LLM returned no valid cards.")

    print(f"[Flashcards] Generated {len(cards)} cards for '{topic}'")

    return {
        "cards": cards,
        "topic": topic,
        "num_cards": len(cards),
    }
