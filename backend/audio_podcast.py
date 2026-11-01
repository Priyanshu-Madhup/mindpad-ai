"""
audio_podcast.py
----------------
FastAPI router — Audio Podcast AI Studio feature.

Pipeline per request:
  1. Auth          — Clerk JWT via get_current_user().
  2. RAG retrieval — Pinecone top-6 chunks, query:
                     "summarise the whole document in a very very detailed manner"
  3. MongoDB       — HTML summaries from pdf_docs (plain-text, capped per doc).
  4. Merge         — chunks (most specific) + summaries → rich context block.
  5. Pass 1 LLM    — Qwen (OpenRouter) → long-form lecture script.
  6. Pass 2 LLM    — Qwen (OpenRouter) → humanise into warm, spoken-word narration.
  7. Kokoro TTS    — hexgrad/kokoro-82m (OpenRouter) → 16-bit PCM 24 kHz → WAV.
  8. Return        — { audio_b64, script, topic, word_count } as JSON.

Save/delete:
  PATCH  /notebooks/{notebook_id}/audio-podcast  — persist Firebase URL in MongoDB
  DELETE /notebooks/{notebook_id}/audio-podcast  — remove URL from MongoDB
"""

import os
import re
import base64
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import List, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from llm import llm_complete, synthesize_wav
from storage import refresh_storage_used
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

_mongo     = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db        = _mongo["mindpad_ai"]
_pdf_docs  = _db["pdf_docs"]
_notebooks = _db["notebooks"]

# ── Pydantic models ───────────────────────────────────────────────────────────
class AudioPodcastRequest(BaseModel):
    notebook_id:      str
    selected_pdf_ids: Optional[List[str]] = []

class SaveAudioPodcastUrl(BaseModel):
    url: str
    size: Optional[int] = None   # bytes of the uploaded file (storage tracking)

# ── Auth proxy ────────────────────────────────────────────────────────────────
async def _auth(authorization: Optional[str]) -> Tuple[str, str]:
    from chat import get_current_user
    return await get_current_user(authorization)

# ── HTML stripper ─────────────────────────────────────────────────────────────
class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._p: List[str] = []

    def handle_data(self, data: str):
        t = data.strip()
        if t:
            self._p.append(t)

    def get_text(self) -> str:
        return " ".join(self._p)

def _strip_html(html: str) -> str:
    s = _Stripper()
    s.feed(html)
    return s.get_text()

# ── MongoDB: fetch PDF summaries ──────────────────────────────────────────────
async def _fetch_summaries(
    user_id: str, notebook_id: str, doc_ids: List[str]
) -> Tuple[str, List[str]]:
    """
    Returns (plain_text_context, list_of_doc_names).
    Fetches up to 10 docs; strips HTML; caps each at 1 200 chars, total at 6 000.
    """
    query: dict = (
        {"doc_id": {"$in": doc_ids}}
        if doc_ids
        else {"user_id": user_id, "notebook_id": notebook_id}
    )
    docs = await _pdf_docs.find(
        query, {"_id": 0, "name": 1, "summary": 1}
    ).limit(10).to_list(10)

    parts: List[str] = []
    names: List[str] = []
    for d in docs:
        plain = _strip_html(d.get("summary", ""))[:1200]
        if plain:
            parts.append(f"[{d.get('name', 'Document')}]: {plain}")
            names.append(d.get("name", "Document"))

    return "\n\n".join(parts)[:6000], names

# ── Pinecone RAG: top-6 chunks ────────────────────────────────────────────────
async def _retrieve_chunks(user_id: str, doc_ids: List[str]) -> str:
    """
    Pull top-6 Pinecone chunks using a comprehensive summarisation query so the
    TTS script is informed by the actual document content, not just the stored
    summary blurbs.
    """
    if not doc_ids:
        return ""
    try:
        from rag import retrieve_rag_context
        context, _ = await retrieve_rag_context(
            query="summarise the whole document in a very very detailed manner",
            user_id=user_id,
            doc_ids=doc_ids,
            top_k=6,
        )
        return context
    except Exception as exc:
        print(f"[AudioPodcast] Pinecone retrieval failed: {exc}")
        return ""

# ── LLM Pass 1: research-mode lecture script ──────────────────────────────────
async def _generate_lecture_script(context: str, topic: str) -> str:
    """
    Use the Qwen model to produce a thorough,
    structured lecture script from the merged document context.
    Output: long-form plain text, ~3 000-5 000 words.
    """
    system_prompt = (
        "You are a world-class academic lecturer writing a comprehensive audio lecture script. "
        "Your goal is to explain the material from the provided document context in exhaustive detail, "
        "covering all major concepts, supporting evidence, examples, and implications. "
        "Structure the lecture with a clear introduction, multiple detailed body sections, and a conclusion. "
        "Write in flowing prose — NO bullet points, NO markdown, NO headers. "
        "Write as if you are speaking aloud to an engaged audience. "
        "Aim for a thorough, scholarly yet accessible tone. "
        "Do NOT include stage directions or speaker labels. Output ONLY the lecture text."
    )
    user_prompt = (
        f"Create an extremely detailed, comprehensive audio lecture script on: \"{topic}\"\n\n"
        "Use the following document content as your primary source — cover everything in it thoroughly:\n\n"
        f"{context}\n\n"
        "Write a rich, detailed lecture script that a listener could follow without ever seeing the original document."
    )

    completion = await llm_complete(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.55,
        max_tokens=4096,
    )
    raw = (completion.choices[0].message.content or "").strip()
    # Strip any <think>…</think> reasoning blocks
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    print(f"[AudioPodcast] Pass 1 script: {len(raw)} chars")
    return raw

# ── LLM Pass 2: humanise to warm spoken narration ─────────────────────────────
async def _humanise_script(lecture_script: str) -> str:
    """
    Rewrite the lecture script as warm, engaging, conversational spoken-word
    narration suitable for a podcast — natural transitions, no lists, flowing.
    """
    system_prompt = (
        "You are a professional podcast narrator and science communicator. "
        "Rewrite the given lecture script as a warm, engaging, first-person spoken-word podcast narration. "
        "Rules:\n"
        "- Natural, conversational tone — like an engaging lecturer speaking to curious listeners.\n"
        "- Use smooth transitions between ideas (e.g. 'Now, what is fascinating here is...', 'Building on this...').\n"
        "- No bullet points, no numbered lists, no markdown, no section headers.\n"
        "- Flowing continuous prose, as if heard in an audiobook or podcast.\n"
        "- Keep all the key information but make it feel human and warm.\n"
        "- Output ONLY the final narration text. No labels, no meta-commentary."
    )
    user_prompt = (
        "Humanise the following lecture script into a warm, engaging podcast narration:\n\n"
        f"{lecture_script[:6000]}"
    )

    completion = await llm_complete(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.70,
        max_tokens=3000,
    )
    raw = (completion.choices[0].message.content or "").strip()
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    print(f"[AudioPodcast] Pass 2 narration: {len(raw)} chars")
    return raw

# ── Kokoro TTS (OpenRouter) → WAV bytes ───────────────────────────────────────
async def _tts(text: str) -> bytes:
    """Synthesise speech with Kokoro-82M. Truncates to 5 000 chars. Returns WAV bytes."""
    return await synthesize_wav(text[:5000])

# ── Main generation route ──────────────────────────────────────────────────────
@router.post("/audio-podcast")
async def generate_audio_podcast(
    body: AudioPodcastRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Full audio podcast generation pipeline:
      RAG retrieval → research-LLM lecture → humanise → Kokoro TTS → base64 WAV.
    Returns: { audio_b64, script, topic, word_count }
    """
    user_id, _ = await _auth(authorization)
    doc_ids = [d for d in (body.selected_pdf_ids or []) if d]

    print(f"[AudioPodcast] user={user_id[:12]}... notebook={body.notebook_id} docs={doc_ids}")

    # 1. Fetch MongoDB summaries
    summary_ctx, doc_names = await _fetch_summaries(user_id, body.notebook_id, doc_ids)

    # 2. Pinecone RAG — top-6 detailed chunks
    chunk_ctx = await _retrieve_chunks(user_id, doc_ids) if doc_ids else ""

    # 3. Merge: chunks first (most specific), then summaries
    combined = "\n\n".join(filter(None, [chunk_ctx, summary_ctx]))[:7000]

    if not combined.strip():
        raise HTTPException(
            status_code=422,
            detail="No document content found. Please select indexed PDFs and try again.",
        )

    topic = doc_names[0] if doc_names else "Research Document"
    print(f"[AudioPodcast] {len(combined)} chars of context for topic: '{topic}'")

    # 4. Pass 1 — long-form lecture script
    try:
        lecture_script = await _generate_lecture_script(combined, topic)
    except Exception as exc:
        print(f"[AudioPodcast] Pass 1 LLM error: {exc}")
        raise HTTPException(status_code=500, detail=f"Lecture script generation failed: {exc}")

    if not lecture_script.strip():
        raise HTTPException(status_code=500, detail="LLM returned an empty lecture script.")

    # 5. Pass 2 — humanise to warm podcast narration
    try:
        narration = await _humanise_script(lecture_script)
    except Exception as exc:
        print(f"[AudioPodcast] Pass 2 LLM error: {exc}")
        narration = lecture_script  # graceful fallback

    final_script = narration or lecture_script

    # 6. Kokoro TTS → WAV bytes
    try:
        wav_bytes = await _tts(final_script)
    except Exception as exc:
        print(f"[AudioPodcast] TTS error: {exc}")
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {exc}")

    audio_b64  = base64.b64encode(wav_bytes).decode("utf-8")
    word_count = len(final_script.split())
    print(f"[AudioPodcast] Done — {len(wav_bytes) // 1024} KB WAV, {word_count} words")

    return {
        "audio_b64":  audio_b64,
        "script":     final_script,
        "topic":      topic,
        "word_count": word_count,
    }

# ── Save Firebase URL ─────────────────────────────────────────────────────────
@router.patch("/notebooks/{notebook_id}/audio-podcast")
async def save_audio_podcast_url(
    notebook_id: str,
    body: SaveAudioPodcastUrl,
    authorization: Optional[str] = Header(None),
):
    user_id, _ = await _auth(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    update: dict = {"$set": {
        "audio_podcast_url": body.url,
        "updated_at": datetime.now(timezone.utc),
    }}
    if body.size is not None:
        update["$set"]["audio_podcast_size"] = max(body.size, 0)
    else:
        update["$unset"] = {"audio_podcast_size": ""}
    await _notebooks.update_one({"_id": oid, "user_id": user_id}, update)
    await refresh_storage_used(user_id)
    return {"ok": True}

# ── Delete Firebase URL ───────────────────────────────────────────────────────
@router.delete("/notebooks/{notebook_id}/audio-podcast")
async def delete_audio_podcast_url(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    user_id, _ = await _auth(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    await _notebooks.update_one(
        {"_id": oid, "user_id": user_id},
        {
            "$unset": {"audio_podcast_url": "", "audio_podcast_size": ""},
            "$set":   {"updated_at": datetime.now(timezone.utc)},
        },
    )
    await refresh_storage_used(user_id)
    return {"ok": True}
