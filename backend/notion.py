"""
notion.py — Notion OAuth 2.0 integration for Mindpad AI.

OAuth flow (public connection / authorization_code grant):
  1.  GET  /notion/connect    → returns { auth_url } pointing to Notion's consent page
  2.  Notion redirects to     GET /notion/callback?code=…&state=…
  3.  Backend exchanges code → access_token + refresh_token, stored in MongoDB
  4.  User is redirected to frontend with ?notion=connected

Data isolation:
  Every token row in `notion_connections` is keyed by the Clerk user_id, so
  users can never access each other's workspaces.

Sync:
  POST /notion/sync  — fetches a Notion page's full block tree, converts it to
  HTML, and creates a new Mindpad notebook whose first message is that content,
  labelled as coming from Notion.

Required .env variables (backend):
  NOTION_CLIENT_ID       — OAuth app client ID from developers.notion.com
  NOTION_CLIENT_SECRET   — OAuth app client secret
  NOTION_REDIRECT_URI    — must match the redirect URI registered in the Notion developer portal
                           e.g. https://your-backend.onrender.com/notion/callback
  NOTION_STATE_SECRET    — any long random string; used to HMAC-sign state params
  FRONTEND_URL           — e.g. https://mindpad-ai.vercel.app  (no trailing slash)
"""

import os
import re
import hmac
import hashlib
import base64
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Header, Query
from fastapi.responses import RedirectResponse, JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

load_dotenv()

router = APIRouter(prefix="/notion", tags=["notion"])

# ── Config ─────────────────────────────────────────────────────────────────────
NOTION_CLIENT_ID     = os.environ.get("NOTION_CLIENT_ID", "")
NOTION_CLIENT_SECRET = os.environ.get("NOTION_CLIENT_SECRET", "")
NOTION_REDIRECT_URI  = os.environ.get("NOTION_REDIRECT_URI", "")
NOTION_STATE_SECRET  = os.environ.get("NOTION_STATE_SECRET", "changeme-mindpad-notion-secret")
FRONTEND_URL         = os.environ.get("FRONTEND_URL", "https://mindpad-ai.vercel.app")

NOTION_AUTH_URL  = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"
NOTION_API_BASE  = "https://api.notion.com/v1"
NOTION_VERSION   = "2022-06-28"

# ── MongoDB ────────────────────────────────────────────────────────────────────
_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]

notion_connections_col = _db["notion_connections"]  # per-user Notion OAuth tokens
_notebooks_col         = _db["notebooks"]           # shared with chat.py


# ── CSRF-safe state helpers ────────────────────────────────────────────────────
def _make_state(user_id: str) -> str:
    """Return a base64url-encoded state string: `<user_id>.<hmac_hex>`.
    The HMAC prevents an attacker from forging a state that binds to a
    different user_id (CSRF protection for the OAuth callback).
    """
    sig = hmac.new(
        NOTION_STATE_SECRET.encode(), user_id.encode(), hashlib.sha256
    ).hexdigest()
    raw = f"{user_id}.{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _parse_state(state: str) -> Optional[str]:
    """Verify the HMAC signature and return user_id, or None if tampered."""
    try:
        # Restore base64 padding
        padded = state + "=" * (4 - len(state) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        user_id, sig = raw.rsplit(".", 1)
        expected = hmac.new(
            NOTION_STATE_SECRET.encode(), user_id.encode(), hashlib.sha256
        ).hexdigest()
        if hmac.compare_digest(sig, expected):
            return user_id
    except Exception:
        pass
    return None


# ── Notion API helpers ─────────────────────────────────────────────────────────
def _headers(access_token: str) -> dict:
    return {
        "Authorization":  f"Bearer {access_token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type":   "application/json",
    }


async def _exchange_code(code: str) -> dict:
    """Exchange an authorization code for access + refresh tokens."""
    credential = base64.b64encode(
        f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}".encode()
    ).decode()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            NOTION_TOKEN_URL,
            headers={
                "Authorization": f"Basic {credential}",
                "Content-Type":  "application/json",
            },
            json={
                "grant_type":   "authorization_code",
                "code":         code,
                "redirect_uri": NOTION_REDIRECT_URI,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def _do_refresh(refresh_token: str) -> dict:
    """Exchange a refresh_token for a new access_token + refresh_token pair."""
    credential = base64.b64encode(
        f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}".encode()
    ).decode()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            NOTION_TOKEN_URL,
            headers={
                "Authorization": f"Basic {credential}",
                "Content-Type":  "application/json",
            },
            json={
                "grant_type":    "refresh_token",
                "refresh_token": refresh_token,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def _get_access_token(user_id: str) -> str:
    """Return a valid access_token for user, auto-refreshing if the stored one
    has been rejected. Raises 404 if the user has not connected Notion."""
    conn = await notion_connections_col.find_one({"user_id": user_id})
    if not conn:
        raise HTTPException(
            status_code=404,
            detail="Notion not connected. Please connect your Notion workspace first.",
        )
    return conn["access_token"]


async def _refresh_and_store(user_id: str, refresh_token: str) -> str:
    """Refresh the token and persist the new pair; return the new access_token."""
    try:
        data = await _do_refresh(refresh_token)
        new_access  = data.get("access_token", "")
        new_refresh = data.get("refresh_token", refresh_token)
        if new_access:
            await notion_connections_col.update_one(
                {"user_id": user_id},
                {"$set": {"access_token": new_access, "refresh_token": new_refresh}},
            )
            return new_access
    except Exception as e:
        print(f"[Notion] Token refresh failed: {e}")
    raise HTTPException(
        status_code=401,
        detail="Notion access token expired. Please reconnect your Notion workspace.",
    )


# ── Block / rich-text helpers ──────────────────────────────────────────────────
def _rich_text(arr: list) -> str:
    """Extract plain text from a Notion rich_text array."""
    return "".join(item.get("plain_text", "") for item in (arr or []))


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _inline(text: str) -> str:
    """Apply **bold**, *italic*, `code` inline markdown → HTML."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*",     r"<em>\1</em>",         text)
    text = re.sub(r"`(.+?)`",       r"<code>\1</code>",      text)
    return text


def _blocks_to_html(blocks: list) -> str:
    """Convert a flat list of Notion block objects into clean HTML."""
    parts: List[str] = []
    in_ul = False
    in_ol = False

    def _close_lists():
        nonlocal in_ul, in_ol
        if in_ul:
            parts.append("</ul>")
            in_ul = False
        if in_ol:
            parts.append("</ol>")
            in_ol = False

    for block in blocks:
        btype = block.get("type", "")
        data  = block.get(btype, {})
        text  = _escape(_rich_text(data.get("rich_text", [])))

        if btype == "heading_1":
            _close_lists()
            parts.append(f"<h2>{_inline(text)}</h2>")

        elif btype == "heading_2":
            _close_lists()
            parts.append(f"<h3>{_inline(text)}</h3>")

        elif btype == "heading_3":
            _close_lists()
            parts.append(f"<h3><em>{_inline(text)}</em></h3>")

        elif btype == "paragraph":
            _close_lists()
            if text:
                parts.append(f"<p>{_inline(text)}</p>")

        elif btype == "bulleted_list_item":
            if in_ol:
                parts.append("</ol>")
                in_ol = False
            if not in_ul:
                parts.append("<ul>")
                in_ul = True
            parts.append(f"<li>{_inline(text)}</li>")

        elif btype == "numbered_list_item":
            if in_ul:
                parts.append("</ul>")
                in_ul = False
            if not in_ol:
                parts.append("<ol>")
                in_ol = True
            parts.append(f"<li>{_inline(text)}</li>")

        elif btype == "to_do":
            _close_lists()
            checked = "☑" if data.get("checked") else "☐"
            parts.append(f"<p>{checked} {_inline(text)}</p>")

        elif btype == "quote":
            _close_lists()
            parts.append(f"<blockquote>{_inline(text)}</blockquote>")

        elif btype == "callout":
            _close_lists()
            emoji = ""
            icon = data.get("icon", {})
            if icon and icon.get("type") == "emoji":
                emoji = icon.get("emoji", "") + " "
            parts.append(f"<blockquote><strong>{emoji}{_inline(text)}</strong></blockquote>")

        elif btype == "code":
            _close_lists()
            lang = data.get("language", "")
            code_text = _escape(_rich_text(data.get("rich_text", [])))
            parts.append(f'<pre><code class="language-{lang}">{code_text}</code></pre>')

        elif btype == "divider":
            _close_lists()
            parts.append("<hr>")

        elif btype == "image":
            _close_lists()
            img_data = data.get("external", {}) or data.get("file", {})
            url = img_data.get("url", "")
            caption = _escape(_rich_text(data.get("caption", [])))
            if url:
                alt = caption or "Notion image"
                parts.append(f'<p><em>[Image: {_escape(alt)}]</em></p>')

        # table_of_contents, unsupported → skip

    _close_lists()
    return "\n".join(parts)


def _blocks_to_plain_text(blocks: list) -> str:
    """Extract clean, unformatted plain text from blocks for RAG indexing.
    Uses the same _rich_text() helper to get raw character content without
    HTML markup, ensuring the embedding index contains only signal.
    """
    parts: list[str] = []
    for block in blocks:
        btype = block.get("type", "")
        data  = block.get(btype, {})

        # Most content blocks carry a rich_text array
        text = _rich_text(data.get("rich_text", []))
        if text:
            parts.append(text)

        # Code blocks use their own rich_text; language acts as a label
        if btype == "code":
            lang = data.get("language", "")
            code_text = _rich_text(data.get("rich_text", []))
            if code_text:
                parts.append(f"[{lang} code]\n{code_text}" if lang else code_text)

        # Table rows store cells under a different key
        if btype == "table_row":
            cells = data.get("cells", [])
            row_text = " | ".join(
                _rich_text(cell) for cell in cells if _rich_text(cell)
            )
            if row_text:
                parts.append(row_text)

    return "\n\n".join(p for p in parts if p.strip())


async def _index_notion_to_rag(
    plain_text:  str,
    page_id:     str,
    page_title:  str,
    user_id:     str,
    notebook_id: str,
) -> Optional[str]:
    """
    Index a Notion page's plain text into Pinecone using the exact same dynamic-
    chunking pipeline as PDF uploads.  Saves metadata to `pdf_docs_col` so the
    existing retrieve_rag_context() query path works without any changes.

    Returns the new doc_id on success, or None if there is nothing to index.
    """
    import asyncio
    import uuid as _uuid
    from rag import (
        count_tokens,
        decide_chunk_count,
        split_into_token_chunks,
        embed_texts,
        get_index,
        pdf_docs_col as rag_pdf_docs_col,
        EMBED_BATCH_SIZE,
    )

    if not plain_text or not plain_text.strip():
        print(f"[Notion RAG] '{page_title}' — page is empty, skipping index.")
        return None

    total_tokens = count_tokens(plain_text)
    if total_tokens < 3:
        print(f"[Notion RAG] '{page_title}' — empty ({total_tokens} tokens), skipping index.")
        return None

    print(f"[Notion RAG] '{page_title}' → {total_tokens} tokens")

    # ── Dynamic chunking (same Groq call as PDFs) ─────────────────────────────
    # For very short pages (< 200 tokens) skip the Groq call and use 1 chunk
    if total_tokens < 200:
        num_chunks_target = 1
    else:
        num_chunks_target = await decide_chunk_count(total_tokens, page_title)
    raw_tpc           = total_tokens // max(1, num_chunks_target)
    tokens_per_chunk  = max(total_tokens, min(1000, raw_tpc))
    chunks            = split_into_token_chunks(plain_text, tokens_per_chunk)
    actual_chunks     = len(chunks)
    print(f"[Notion RAG] {actual_chunks} chunks @ ≤{tokens_per_chunk} tokens each")

    # ── Embed (batched, matching PDF pipeline) ────────────────────────────────
    embeddings: list = []
    for batch_idx, batch_start in enumerate(range(0, actual_chunks, EMBED_BATCH_SIZE)):
        if batch_idx > 0:
            await asyncio.sleep(1)
        batch      = chunks[batch_start: batch_start + EMBED_BATCH_SIZE]
        batch_embs = await embed_texts(batch, "passage")
        embeddings.extend(batch_embs)

    # ── Upsert to Pinecone ────────────────────────────────────────────────────
    doc_id  = _uuid.uuid4().hex
    vectors = [
        {
            "id":     f"{doc_id}::chunk_{i}",
            "values": embeddings[i],
            "metadata": {
                "doc_id":         doc_id,
                "notebook_id":    notebook_id,
                "user_id":        user_id,
                "pdf_name":       page_title,
                "chunk_index":    i,
                "text":           chunks[i][:2000],
                "source":         "notion",
                "notion_page_id": page_id,
            },
        }
        for i in range(actual_chunks)
    ]

    pinecone_index = await asyncio.to_thread(get_index)
    upsert_batch   = 100
    for batch_start in range(0, len(vectors), upsert_batch):
        await asyncio.to_thread(
            pinecone_index.upsert,
            vectors=vectors[batch_start: batch_start + upsert_batch],
            namespace=user_id,
        )
    print(f"[Notion RAG] Upserted {actual_chunks} vectors → namespace='{user_id}', doc_id={doc_id}")

    # ── Save metadata to pdf_docs_col ─────────────────────────────────────────
    await rag_pdf_docs_col.insert_one({
        "doc_id":           doc_id,
        "notebook_id":      notebook_id,
        "user_id":          user_id,
        "name":             page_title,
        "size":             len(plain_text.encode("utf-8")),
        "total_tokens":     total_tokens,
        "chunk_count":      actual_chunks,
        "tokens_per_chunk": tokens_per_chunk,
        "uploaded_at":      datetime.now(timezone.utc),
        "selected":         True,
        "summary":          "",
        "firebase_pdf_url": "",
        "pdf_hash":         "",
        "source":           "notion",
        "notion_page_id":   page_id,
    })

    return doc_id


async def _delete_notion_rag_data(user_id: str) -> None:
    """Delete all Notion-sourced vectors from Pinecone and records from pdf_docs_col."""
    import asyncio
    from rag import get_index, pdf_docs_col as rag_pdf_docs_col

    cursor   = rag_pdf_docs_col.find({"user_id": user_id, "source": "notion"}, {"doc_id": 1})
    doc_ids  = [d["doc_id"] async for d in cursor]
    if not doc_ids:
        return

    pinecone_index = await asyncio.to_thread(get_index)

    # Pinecone does not support wildcard deletes on IDs, so we collect the
    # exact vector IDs from the stored chunk_count and delete them in batches.
    all_ids: list[str] = []
    async for doc in rag_pdf_docs_col.find(
        {"user_id": user_id, "source": "notion"},
        {"doc_id": 1, "chunk_count": 1},
    ):
        for i in range(doc.get("chunk_count", 0)):
            all_ids.append(f"{doc['doc_id']}::chunk_{i}")

    delete_batch = 1000
    for start in range(0, len(all_ids), delete_batch):
        await asyncio.to_thread(
            pinecone_index.delete,
            ids=all_ids[start: start + delete_batch],
            namespace=user_id,
        )

    await rag_pdf_docs_col.delete_many({"user_id": user_id, "source": "notion"})
    print(f"[Notion RAG] Deleted {len(doc_ids)} Notion doc(s) + {len(all_ids)} vectors for user {user_id[:12]}…")


async def _fetch_all_blocks(page_id: str, access_token: str) -> list:
    """Fetch every block for a page, following Notion's cursor-based pagination."""
    blocks = []
    cursor = None
    async with httpx.AsyncClient(timeout=25.0) as client:
        while True:
            params: dict = {"page_size": 100}
            if cursor:
                params["start_cursor"] = cursor
            resp = await client.get(
                f"{NOTION_API_BASE}/blocks/{page_id}/children",
                headers=_headers(access_token),
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            blocks.extend(data.get("results", []))
            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")
    return blocks


# ── Pydantic models ────────────────────────────────────────────────────────────
class SyncPageRequest(BaseModel):
    page_id:    str
    page_title: str


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/status")
async def notion_status(authorization: Optional[str] = Header(None)):
    """Return the Notion connection status for the authenticated user."""
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)
    conn = await notion_connections_col.find_one({"user_id": user_id})
    if not conn:
        return {"connected": False}
    return {
        "connected":      True,
        "workspace_name": conn.get("workspace_name", ""),
        "workspace_icon": conn.get("workspace_icon", ""),
        "workspace_id":   conn.get("workspace_id",   ""),
        "connected_at":   conn.get("connected_at", datetime.now(timezone.utc)).isoformat(),
    }


@router.get("/connect")
async def notion_connect(authorization: Optional[str] = Header(None)):
    """Return the Notion OAuth authorization URL for the frontend to redirect to."""
    from chat import get_current_user
    if not NOTION_CLIENT_ID or not NOTION_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="Notion OAuth is not configured on this server. "
                   "Set NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, and NOTION_REDIRECT_URI.",
        )
    user_id, _ = await get_current_user(authorization)
    state = _make_state(user_id)

    from urllib.parse import urlencode
    params = urlencode({
        "owner":         "user",
        "client_id":     NOTION_CLIENT_ID,
        "redirect_uri":  NOTION_REDIRECT_URI,
        "response_type": "code",
        "state":         state,
    })
    return JSONResponse({"auth_url": f"{NOTION_AUTH_URL}?{params}"})


@router.get("/callback")
async def notion_callback(
    code:  Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """
    Unauthenticated endpoint called by Notion after the user grants access.
    Validates the HMAC-signed state, exchanges the code for tokens, and
    persists them to MongoDB. Redirects the browser back to the frontend.
    """
    if error:
        reason = error if re.match(r"^[\w_]+$", error) else "access_denied"
        return RedirectResponse(url=f"{FRONTEND_URL}?notion=error&reason={reason}")

    if not code or not state:
        return RedirectResponse(url=f"{FRONTEND_URL}?notion=error&reason=missing_params")

    user_id = _parse_state(state)
    if not user_id:
        return RedirectResponse(url=f"{FRONTEND_URL}?notion=error&reason=invalid_state")

    try:
        token_data = await _exchange_code(code)
    except Exception as exc:
        print(f"[Notion callback] Token exchange failed: {exc}")
        return RedirectResponse(url=f"{FRONTEND_URL}?notion=error&reason=token_exchange_failed")

    access_token  = token_data.get("access_token",  "")
    refresh_token = token_data.get("refresh_token", "")
    workspace_id  = token_data.get("workspace_id",  "")
    workspace_name = token_data.get("workspace_name", "")
    workspace_icon = token_data.get("workspace_icon", "")
    bot_id        = token_data.get("bot_id", "")

    if not access_token:
        return RedirectResponse(url=f"{FRONTEND_URL}?notion=error&reason=no_token")

    await notion_connections_col.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id":        user_id,
                "access_token":   access_token,
                "refresh_token":  refresh_token,
                "workspace_id":   workspace_id,
                "workspace_name": workspace_name,
                "workspace_icon": workspace_icon,
                "bot_id":         bot_id,
                "connected_at":   datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    print(f"[Notion] Connected workspace '{workspace_name}' for user {user_id[:12]}…")
    return RedirectResponse(url=f"{FRONTEND_URL}?notion=connected")


@router.delete("/disconnect")
async def notion_disconnect(authorization: Optional[str] = Header(None)):
    """Remove the user's Notion connection from MongoDB and purge their RAG data."""
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)
    await notion_connections_col.delete_one({"user_id": user_id})
    try:
        await _delete_notion_rag_data(user_id)
    except Exception as exc:
        print(f"[Notion] RAG cleanup on disconnect failed (non-fatal): {exc}")
    return {"status": "disconnected"}


@router.get("/pages")
async def notion_list_pages(authorization: Optional[str] = Header(None)):
    """
    List all Notion pages (and databases) that the connected user has shared
    with the integration. Auto-refreshes the access token if it has expired.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)
    conn = await notion_connections_col.find_one({"user_id": user_id})
    if not conn:
        raise HTTPException(
            status_code=404,
            detail="Notion not connected.",
        )
    access_token  = conn["access_token"]
    refresh_token = conn.get("refresh_token", "")

    results = []
    cursor = None

    async with httpx.AsyncClient(timeout=20.0) as client:
        while True:
            body: dict = {
                "filter":    {"value": "page", "property": "object"},
                "page_size": 50,
            }
            if cursor:
                body["start_cursor"] = cursor

            resp = await client.post(
                f"{NOTION_API_BASE}/search",
                headers=_headers(access_token),
                json=body,
            )

            # Token expired — try a one-time refresh
            if resp.status_code == 401 and refresh_token:
                access_token = await _refresh_and_store(user_id, refresh_token)
                refresh_token = ""  # only attempt once
                resp = await client.post(
                    f"{NOTION_API_BASE}/search",
                    headers=_headers(access_token),
                    json=body,
                )

            if resp.status_code == 401:
                raise HTTPException(
                    status_code=401,
                    detail="Notion token expired. Please reconnect your workspace.",
                )
            resp.raise_for_status()
            data = resp.json()

            for page in data.get("results", []):
                title = ""
                for prop in page.get("properties", {}).values():
                    if prop.get("type") == "title":
                        title = _rich_text(prop.get("title", []))
                        break
                if not title:
                    # Fallback: last segment of the Notion page URL slug
                    title = page.get("url", "").rsplit("/", 1)[-1].replace("-", " ").title() or "Untitled"

                icon_obj = page.get("icon") or {}
                icon = icon_obj.get("emoji", "") if icon_obj.get("type") == "emoji" else ""

                results.append({
                    "id":          page.get("id", ""),
                    "title":       title or "Untitled",
                    "url":         page.get("url", ""),
                    "last_edited": page.get("last_edited_time", ""),
                    "icon":        icon,
                })

            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")

    return {"pages": results}


@router.post("/sync")
async def notion_sync_page(
    body: SyncPageRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Fetch the full content of a Notion page and create a new Mindpad notebook
    pre-populated with that content as an opening assistant message.
    Returns the new notebook's id and name.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    conn = await notion_connections_col.find_one({"user_id": user_id})
    if not conn:
        raise HTTPException(status_code=404, detail="Notion not connected.")
    access_token  = conn["access_token"]
    refresh_token = conn.get("refresh_token", "")

    # Fetch page blocks (with one token-refresh retry on 401)
    try:
        blocks = await _fetch_all_blocks(body.page_id, access_token)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 401 and refresh_token:
            access_token = await _refresh_and_store(user_id, refresh_token)
            blocks = await _fetch_all_blocks(body.page_id, access_token)
        elif exc.response.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail="Notion page not found or not shared with the integration.",
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch Notion page: {exc.response.status_code}",
            )

    html_content = _blocks_to_html(blocks) if blocks else "<p><em>This Notion page is empty.</em></p>"

    # Wrap in a clear header so the user knows this was imported from Notion
    safe_title = _escape(body.page_title)
    full_html = (
        f"<h2>📄 {safe_title}</h2>"
        f"<p><em>Synced from your Notion workspace. "
        f"Ask Midy AI any questions about this page.</em></p>"
        f"<hr>"
        f"{html_content}"
    )

    now = datetime.now(timezone.utc)
    notebook_name = f"[Notion] {body.page_title}"[:80]  # cap at 80 chars
    result = await _notebooks_col.insert_one({
        "user_id":        user_id,
        "name":           notebook_name,
        "messages":       [
            {
                "role":           "assistant",
                "content":        full_html,
                "notion_page_id": body.page_id,
            }
        ],
        "created_at":     now,
        "updated_at":     now,
        "notion_page_id": body.page_id,
    })

    notebook_id_str = str(result.inserted_id)
    print(
        f"[Notion] Synced page '{body.page_title}' → notebook {notebook_id_str} "
        f"for user {user_id[:12]}…"
    )

    # ── Index page content into Pinecone so users can query it via RAG ────────
    plain_text = _blocks_to_plain_text(blocks)
    doc_id = None
    try:
        doc_id = await _index_notion_to_rag(
            plain_text, body.page_id, body.page_title, user_id, notebook_id_str
        )
        if doc_id:
            print(f"[Notion RAG] Indexed as doc_id={doc_id}")
    except Exception as exc:
        # RAG indexing is best-effort — the notebook was already created successfully
        print(f"[Notion RAG] Indexing failed (non-fatal): {exc}")

    # ── Generate AI summary (same pipeline as PDF upload) ────────────────────
    # Queries Pinecone with a broad summary query → single Groq call → HTML summary.
    # Saved as a second assistant message in the notebook so it persists on refresh.
    summary = ""
    total_tokens = 0
    chunk_count = 0
    if doc_id:
        try:
            from rag import generate_pdf_summary, pdf_docs_col as rag_pdf_docs_col
            summary, _ = await generate_pdf_summary(doc_id, user_id, body.page_title)
            if summary:
                doc_meta = await rag_pdf_docs_col.find_one({"doc_id": doc_id})
                if doc_meta:
                    total_tokens = doc_meta.get("total_tokens", 0)
                    chunk_count  = doc_meta.get("chunk_count", 0)
                meta_line = (
                    f'<p><strong>{body.page_title}</strong>'
                    f'&nbsp;<em style="font-size:0.8em;opacity:0.6">'
                    f'{total_tokens:,} tokens · {chunk_count} chunks indexed'
                    f'</em></p><hr>'
                )
                summary_msg = {"role": "assistant", "content": meta_line + summary}
                await _notebooks_col.update_one(
                    {"_id": ObjectId(notebook_id_str)},
                    {"$push": {"messages": summary_msg}, "$set": {"updated_at": datetime.now(timezone.utc)}},
                )
                print(f"[Notion RAG] Summary saved to notebook {notebook_id_str}")
        except Exception as exc:
            print(f"[Notion RAG] Summary generation failed (non-fatal): {exc}")
            summary = ""

    return {
        "status":        "synced",
        "notebook_id":   notebook_id_str,
        "notebook_name": notebook_name,
        "summary":       summary,
        "total_tokens":  total_tokens,
        "chunk_count":   chunk_count,
    }


# ── Utility exposed to chat.py for cascade-delete ─────────────────────────────
async def cleanup_notion_connection(user_id: str) -> None:
    """Remove Notion tokens and all RAG data when a user deletes their account."""
    await notion_connections_col.delete_one({"user_id": user_id})
    try:
        await _delete_notion_rag_data(user_id)
    except Exception as exc:
        print(f"[Notion] RAG cleanup on account delete failed (non-fatal): {exc}")
    print(f"[Notion] Removed connection + RAG data for deleted user {user_id[:12]}…")
