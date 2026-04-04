"""
deep_research.py — Deep Research pipeline for Mindpad AI.

Flow (per user query):
  1. Call Serper.dev → get top N organic links for the query
  2. For each link, call Firecrawl (scrape → markdown, cached 1 h)
  3. Concatenate markdown from all pages
  4. Tokenise → let Groq decide the optimal number of chunks (same
     dynamic-chunking logic as PDF pipeline, capped 200–1000 tok/chunk)
  5. Embed chunks with Pinecone multilingual-e5-large
  6. Upsert into the user's Pinecone namespace with a unique doc_id
     tagged as source_type = "deep_research"
  7. Save metadata row to MongoDB (collection: deep_research_docs)
  8. The chat endpoint then calls retrieve_rag_context() with the
     returned doc_id to get the top-3 most relevant chunks for the query

Namespace strategy: same as PDF — user_id → isolated Pinecone namespace.
"""

import os
import uuid
import asyncio
from typing import List, Optional, Tuple
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

# Re-use helpers from the RAG module (same Pinecone index, same embedder, same chunker)
from rag import (
    decide_chunk_count,
    split_into_token_chunks,
    count_tokens,
    embed_texts,
    get_index,
)

load_dotenv()

router = APIRouter(tags=["DeepResearch"])

# ── Clients ────────────────────────────────────────────────────────────────────
SERPER_API_KEY = os.environ.get("SERPER_API_KEY", "")
FIRECRAWL_API_KEY = os.environ.get("FIRECRAWL_API_KEY", "")

_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]
deep_research_docs_col = _db["deep_research_docs"]

# ── Constants ──────────────────────────────────────────────────────────────────
SERPER_NUM_RESULTS = 5          # how many links to fetch from Serper
FIRECRAWL_MAX_AGE_MS = 3_600_000  # 1 hour cache for Firecrawl
SCRAPER_PAGE_TIMEOUT = 30.0     # per-page HTTP timeout for Firecrawl (seconds)
MAX_CONTENT_CHARS = 40_000      # cap total markdown to avoid gigantic token counts


# ── Step 1: Get URLs from Serper ───────────────────────────────────────────────
async def fetch_serper_links(query: str, num: int = SERPER_NUM_RESULTS) -> List[str]:
    """Return a list of organic result URLs from Serper.dev for *query*."""
    if not SERPER_API_KEY:
        print("[DeepResearch] SERPER_API_KEY not set — no links fetched.")
        return []
    try:
        payload = {"q": query, "num": num}
        headers = {"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://google.serper.dev/search",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        urls = [r["link"] for r in data.get("organic", [])[:num] if r.get("link")]
        print(f"[DeepResearch] Serper returned {len(urls)} URLs for query: {query[:60]}")
        return urls
    except Exception as e:
        print(f"[DeepResearch] Serper error: {e}")
        return []


# ── Step 2: Scrape each URL with Firecrawl ─────────────────────────────────────
async def scrape_url_firecrawl(url: str) -> str:
    """
    Scrape *url* using the Firecrawl REST API (not the SDK, to stay async).
    Returns the scraped markdown, or empty string on error.
    """
    if not FIRECRAWL_API_KEY:
        print("[DeepResearch] FIRECRAWL_API_KEY not set — scraping skipped.")
        return ""
    try:
        payload = {
            "url": url,
            "formats": ["markdown"],
            "maxAge": FIRECRAWL_MAX_AGE_MS,
        }
        headers = {
            "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=SCRAPER_PAGE_TIMEOUT) as client:
            resp = await client.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        # Firecrawl v1 response: { success: true, data: { markdown: "..." } }
        markdown = ""
        if isinstance(data, dict):
            inner = data.get("data") or data
            markdown = inner.get("markdown") or inner.get("content") or ""

        print(f"[DeepResearch] Scraped {len(markdown)} chars from {url[:60]}")
        return markdown
    except Exception as e:
        print(f"[DeepResearch] Firecrawl error for {url[:60]}: {e}")
        return ""


async def scrape_all_urls(urls: List[str]) -> str:
    """
    Scrape all URLs concurrently (but gated by asyncio.gather, so Firecrawl
    handles the concurrency control).  Returns a single concatenated markdown string
    capped at MAX_CONTENT_CHARS.
    """
    tasks = [scrape_url_firecrawl(url) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    parts = []
    for url, res in zip(urls, results):
        if isinstance(res, Exception):
            print(f"[DeepResearch] Scrape task failed for {url[:60]}: {res}")
            continue
        if res and res.strip():
            parts.append(f"<!-- Source: {url} -->\n{res.strip()}")

    combined = "\n\n---\n\n".join(parts)
    if len(combined) > MAX_CONTENT_CHARS:
        combined = combined[:MAX_CONTENT_CHARS]
        print(f"[DeepResearch] Content truncated to {MAX_CONTENT_CHARS} chars")
    return combined


# ── Step 3-6: Chunk, embed, upsert ────────────────────────────────────────────
async def index_scraped_content(
    content: str,
    query: str,
    user_id: str,
    notebook_id: str,
    urls: List[str],
) -> Optional[str]:
    """
    Dynamically chunk *content*, embed the chunks, and upsert into Pinecone.
    Returns the new doc_id string, or None on failure.
    """
    if not content or not content.strip():
        print("[DeepResearch] No content to index.")
        return None

    total_tokens = count_tokens(content)
    print(f"[DeepResearch] Total tokens in scraped content: {total_tokens}")

    if total_tokens < 50:
        print("[DeepResearch] Content too short — skipping indexing.")
        return None

    # Use the same Groq-driven dynamic chunking as the PDF pipeline
    label = f"Deep Research: {query[:60]}"
    num_chunks_target = await decide_chunk_count(total_tokens, label)
    tokens_per_chunk = min(1000, max(200, total_tokens // max(1, num_chunks_target)))
    chunks = split_into_token_chunks(content, tokens_per_chunk)
    actual_chunks = len(chunks)
    print(f"[DeepResearch] {actual_chunks} chunks @ ≤{tokens_per_chunk} tokens each")

    # Embed
    try:
        embeddings = await embed_texts(chunks, "passage")
    except Exception as e:
        print(f"[DeepResearch] Embedding failed: {e}")
        return None

    # Build vectors
    doc_id = uuid.uuid4().hex
    vectors = [
        {
            "id": f"{doc_id}::chunk_{i}",
            "values": embeddings[i],
            "metadata": {
                "doc_id":       doc_id,
                "notebook_id":  notebook_id,
                "user_id":      user_id,
                "source_type":  "deep_research",
                "query":        query[:200],
                "chunk_index":  i,
                # Keep metadata lean — 2000 char cap
                "text":         chunks[i][:2000],
                "pdf_name":     f"Deep Research: {query[:80]}",  # reuse pdf_name key for display
            },
        }
        for i in range(actual_chunks)
    ]

    # Upsert to Pinecone
    try:
        index = await asyncio.to_thread(get_index)
        for batch_start in range(0, len(vectors), 100):
            await asyncio.to_thread(
                index.upsert,
                vectors=vectors[batch_start : batch_start + 100],
                namespace=user_id,
            )
        print(f"[DeepResearch] Upserted {actual_chunks} vectors → namespace='{user_id}'")
    except Exception as e:
        print(f"[DeepResearch] Pinecone upsert error: {e}")
        return None

    # Save metadata to MongoDB
    try:
        await deep_research_docs_col.insert_one({
            "doc_id":           doc_id,
            "notebook_id":      notebook_id,
            "user_id":          user_id,
            "query":            query,
            "urls":             urls,
            "total_tokens":     total_tokens,
            "chunk_count":      actual_chunks,
            "tokens_per_chunk": tokens_per_chunk,
            "indexed_at":       datetime.now(timezone.utc),
        })
    except Exception as e:
        print(f"[DeepResearch] MongoDB save error (non-fatal): {e}")

    return doc_id


# ── Public orchestrator — called from chat.py ──────────────────────────────────
async def run_deep_research(
    query: str,
    user_id: str,
    notebook_id: str,
    num_results: int = SERPER_NUM_RESULTS,
) -> Tuple[Optional[str], List[str]]:
    """
    Full deep-research pipeline:
      fetch links → scrape → chunk → embed → upsert → return (doc_id, urls)

    This is the single entry point used by the chat endpoint.
    Returns (doc_id, urls) where doc_id is None on failure.
    """
    print(f"[DeepResearch] Starting pipeline for query: '{query[:80]}'")

    # 1. Get URLs
    urls = await fetch_serper_links(query, num=num_results)
    if not urls:
        return None, []

    # 2. Scrape all pages concurrently
    content = await scrape_all_urls(urls)
    if not content:
        print("[DeepResearch] All pages returned empty content.")
        return None, urls

    # 3-6. Index into Pinecone
    doc_id = await index_scraped_content(content, query, user_id, notebook_id, urls)
    return doc_id, urls


# ── POST /deep-research/index ─────────────────────────────────────────────────
# Optional standalone endpoint so the frontend can trigger indexing explicitly.
class DeepResearchRequest(BaseModel):
    query: str
    notebook_id: str
    num_results: int = SERPER_NUM_RESULTS


@router.post("/deep-research/index")
async def deep_research_index(
    body: DeepResearchRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Trigger deep research indexing for a query.
    Returns doc_id + urls so the frontend can show which pages were scraped.
    """
    from chat import get_current_user  # avoid circular import at module load
    user_id, _ = await get_current_user(authorization)

    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    if not body.notebook_id:
        raise HTTPException(status_code=400, detail="notebook_id is required")

    doc_id, urls = await run_deep_research(
        query=body.query,
        user_id=user_id,
        notebook_id=body.notebook_id,
        num_results=body.num_results,
    )

    if doc_id is None:
        raise HTTPException(
            status_code=422,
            detail="Deep research returned no indexable content. Check Serper/Firecrawl keys.",
        )

    return {
        "doc_id":  doc_id,
        "urls":    urls,
        "status":  "indexed",
    }
