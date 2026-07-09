"""
video_suggestions.py
--------------------
FastAPI router — Video Suggestions feature.

Pipeline:
  1. Fetch HTML summaries for selected PDFs from MongoDB pdf_docs.
  2. Fail fast (422) if no summaries exist — no fallback to garbage input.
  3. GPT-OSS-20B generates 4 focused YouTube search queries from the real content.
  4. Concurrently call Serper.dev /videos for each query.
  5. Deduplicate, cap, return.
"""

import os
import asyncio
import re as _re
import json as _json
from html.parser import HTMLParser
from typing import List, Optional, Tuple

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from groq import AsyncGroq
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# ── Clients ─────────────────────────────────────────────────────────────────────
_groq_client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY", ""))
SERPER_API_KEY = os.environ.get("SERPER_API_KEY", "")

# ── MongoDB ──────────────────────────────────────────────────────────────────────
_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]
_pdf_docs_col = _db["pdf_docs"]


# ── Request model ────────────────────────────────────────────────────────────────
class VideoSuggestionsRequest(BaseModel):
    notebook_id: str
    selected_pdf_ids: Optional[List[str]] = []
    max_videos: int = 12


# ── Auth ─────────────────────────────────────────────────────────────────────────
async def _get_current_user(authorization: Optional[str]):
    from chat import get_current_user
    return await get_current_user(authorization)


# ── HTML strip ───────────────────────────────────────────────────────────────────
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


# ── Fetch summaries from pdf_docs ────────────────────────────────────────────────
async def _fetch_pdf_summaries(
    user_id: str, notebook_id: str, doc_ids: List[str]
) -> Tuple[str, List[str]]:
    """
    Returns (plain_text_context, list_of_doc_names).
    - If doc_ids given  → query by doc_id only (globally unique).
    - If no doc_ids     → query by user_id + notebook_id (all PDFs in notebook).
    """
    if doc_ids:
        query: dict = {"doc_id": {"$in": doc_ids}}
    else:
        query = {"user_id": user_id, "notebook_id": notebook_id}

    print(f"[VideoSuggestions] Querying pdf_docs: {query}")
    docs = await _pdf_docs_col.find(
        query, {"_id": 0, "name": 1, "summary": 1}
    ).limit(10).to_list(10)
    print(f"[VideoSuggestions] Found {len(docs)} doc(s)")

    parts: List[str] = []
    names: List[str] = []
    for doc in docs:
        name = doc.get("name", "Document")
        raw = doc.get("summary", "")
        if not raw:
            print(f"[VideoSuggestions]  · '{name}' — no summary stored")
            continue
        plain = _strip_html(raw)[:800]
        if plain:
            parts.append(f"[{name}]: {plain}")
            names.append(name)

    return "\n\n".join(parts)[:3000], names


# ── Generate keyword queries ─────────────────────────────────────────────────────
async def _generate_keyword_queries(doc_context: str) -> List[str]:
    """
    Ask GPT-OSS-20B to produce 4 YouTube search queries from the document content.
    """
    system_prompt = (
        "You are an expert at crafting precise YouTube search queries for academic topics. "
        "Respond ONLY with a valid JSON array of exactly 4 strings — no markdown, no explanation. "
        'Example: ["query one", "query two", "query three", "query four"]'
    )
    user_prompt = (
        "Based on the following research document summaries, generate exactly 4 distinct "
        "YouTube search queries that will surface the most relevant educational videos.\n\n"
        "Mix the angles: (1) overview/introduction, (2) deep-dive explanation, "
        "(3) tutorial or worked example, (4) latest research or real-world application.\n\n"
        "Keep each query concise (4-9 words). Output ONLY the JSON array.\n\n"
        f"DOCUMENT SUMMARIES:\n{doc_context}"
    )

    try:
        completion = await _groq_client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.35,
            max_tokens=512,
        )
        raw = (completion.choices[0].message.content or "").strip()
        raw = _re.sub(r"<think>.*?</think>", "", raw, flags=_re.DOTALL).strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end != -1:
            queries = _json.loads(raw[start:end + 1])
            if isinstance(queries, list):
                return [str(q).strip() for q in queries if q][:5]
    except Exception as exc:
        print(f"[VideoSuggestions] LLM failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Query generation failed: {exc}")

    raise HTTPException(status_code=500, detail="Could not parse LLM response into search queries.")


# ── Serper /videos search ────────────────────────────────────────────────────────
async def _search_videos_serper(query: str, num: int = 4) -> List[dict]:
    if not SERPER_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                "https://google.serper.dev/videos",
                headers={"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"},
                json={"q": query, "num": num, "gl": "us", "hl": "en"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        print(f"[VideoSuggestions] Serper failed for '{query}': {exc}")
        return []

    videos = []
    for item in data.get("videos", []):
        link = item.get("link", "")
        video_id = ""
        m = _re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", link)
        if m:
            video_id = m.group(1)
        thumbnail = item.get("imageUrl", "") or item.get("thumbnailUrl", "")
        if not thumbnail and video_id:
            thumbnail = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
        videos.append({
            "title":     item.get("title", "Untitled"),
            "channel":   item.get("channel", item.get("source", "Unknown")),
            "duration":  item.get("duration", ""),
            "thumbnail": thumbnail,
            "video_id":  video_id,
            "url":       link,
            "query":     query,
        })
    return videos


# ── Route ────────────────────────────────────────────────────────────────────────
@router.post("/video-suggestions")
async def get_video_suggestions(
    body: VideoSuggestionsRequest,
    authorization: Optional[str] = Header(None),
):
    user_id, _ = await _get_current_user(authorization)

    max_videos = min(body.max_videos, 20)
    doc_ids = [d for d in (body.selected_pdf_ids or []) if d]

    # 1. Fetch real summaries — fail fast if none found
    doc_context, doc_names = await _fetch_pdf_summaries(user_id, body.notebook_id, doc_ids)
    if not doc_context.strip():
        raise HTTPException(
            status_code=422,
            detail="No PDF summaries found. Please select indexed PDFs and try again.",
        )

    topic_label = doc_names[0] if doc_names else "Research Document"
    print(f"[VideoSuggestions] {len(doc_context)} chars from: {doc_names}")

    # 2. Generate queries from real content
    queries = await _generate_keyword_queries(doc_context)
    print(f"[VideoSuggestions] Queries: {queries}")

    # 3. Concurrent video search
    results = await asyncio.gather(*[_search_videos_serper(q) for q in queries])

    # 4. Deduplicate
    seen: set = set()
    combined: List[dict] = []
    for batch in results:
        for vid in batch:
            key = vid["video_id"] or vid["url"]
            if key and key not in seen:
                seen.add(key)
                combined.append(vid)

    return {
        "videos": combined[:max_videos],
        "queries_used": queries,
        "topic": topic_label,
    }
