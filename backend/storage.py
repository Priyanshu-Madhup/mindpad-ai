"""
storage.py — Storage usage & deletion API for Mindpad AI.

GET  /storage/usage
  Returns PDF metadata (doc_id, name, firebase_pdf_url), insight-canvas entries,
  and all AI Studio feature data (mind maps, flashcards, quiz sessions, video
  suggestions, audio podcasts, visual podcasts) for the authenticated user so the
  frontend can display and manage all notebook-level stored data.

GET  /storage/summary
  Instant read of the tracked usage variable (users_meta.storage_used_bytes +
  per-category breakdown). Both are null until first computed.

POST /storage/sync
  One-time backfill: the frontend resolves Firebase file sizes for items that
  have no stored size yet and posts them here; the total is then recomputed.

Tracking model
  Every Firebase-hosted item stores its byte size in MongoDB when it is saved
  (pdf_docs.size, notebooks.insight_canvas_size / audio_podcast_size /
  visual_podcast_size). After any upload, deletion or notebook removal,
  refresh_storage_used() recomputes the total from those stored sizes (MongoDB
  only, no Firebase calls) and writes it to users_meta. If any item has no size
  yet the variable is set to null and the frontend falls back to the one-time
  Firebase lookup + /storage/sync.

DELETE /storage/pdf/{doc_id}
  Removes all pdf_docs MongoDB rows for a given doc_id (covers dedup copies
  across multiple notebooks). Pinecone vectors are intentionally kept for
  future dedup reuse. Returns the firebase_pdf_url for client-side deletion.

DELETE /storage/canvas/{notebook_id}
  Clears insight_canvas_url from the notebook document in MongoDB.
  The frontend deletes the Firebase Storage file before calling this endpoint.

DELETE /storage/mind-map/{notebook_id}
  Clears mind_map_data from the notebook document in MongoDB.

DELETE /storage/flashcards/{notebook_id}
  Clears flashcards_data from the notebook document in MongoDB.

DELETE /storage/quiz/{notebook_id}
  Clears quiz_data from the notebook document in MongoDB.

DELETE /storage/video-suggestions/{notebook_id}
  Clears video_suggestions_data from the notebook document in MongoDB.

DELETE /storage/audio-podcast/{notebook_id}
  Clears audio_podcast_url from the notebook document in MongoDB.
  The frontend deletes the Firebase Storage audio file before calling this.

DELETE /storage/visual-podcast/{notebook_id}
  Clears visual_podcast_url from the notebook document in MongoDB.
  The frontend deletes the Firebase Storage video file before calling this.
"""

import os
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(tags=["Storage"])

_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]
_notebooks_col = _db["notebooks"]
_pdf_docs_col  = _db["pdf_docs"]
_users_meta_col = _db["users_meta"]

# (notebook url field, notebook size field, breakdown key)
_NB_FILE_FIELDS = (
    ("insight_canvas_url", "insight_canvas_size", "canvas"),
    ("audio_podcast_url",  "audio_podcast_size",  "audio"),
    ("visual_podcast_url", "visual_podcast_size", "visual"),
)


def _is_size(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0


async def compute_breakdown(user_id: str) -> Optional[dict]:
    """
    Sum stored byte sizes per category from MongoDB only.
    Returns None if any counted item has no stored size (caller must backfill).
    """
    out = {"pdf": 0, "canvas": 0, "audio": 0, "visual": 0}
    seen: set[str] = set()
    async for doc in _pdf_docs_col.find(
        {"user_id": user_id, "firebase_pdf_url": {"$nin": ["", None]}},
        {"doc_id": 1, "size": 1},
    ):
        doc_id = doc.get("doc_id")
        if not doc_id or doc_id in seen:
            continue
        seen.add(doc_id)
        if not _is_size(doc.get("size")):
            return None
        out["pdf"] += int(doc["size"])

    proj = {k: 1 for f in _NB_FILE_FIELDS for k in f[:2]}
    async for nb in _notebooks_col.find({"user_id": user_id}, proj):
        for url_f, size_f, key in _NB_FILE_FIELDS:
            if nb.get(url_f):
                if not _is_size(nb.get(size_f)):
                    return None
                out[key] += int(nb[size_f])
    return out


async def refresh_storage_used(user_id: str) -> Optional[dict]:
    """Recompute and persist the tracked usage variable. Never raises."""
    try:
        bd = await compute_breakdown(user_id)
        await _users_meta_col.update_one(
            {"user_id": user_id},
            {"$set": {
                "storage_used_bytes": sum(bd.values()) if bd else None,
                "storage_breakdown":  bd,
            }},
        )
        return bd
    except Exception as exc:
        print(f"[Storage] refresh_storage_used failed (non-fatal): {exc}")
        return None


def _summary_payload(bd: Optional[dict]) -> dict:
    return {"used_bytes": sum(bd.values()) if bd else None, "breakdown": bd}


@router.get("/storage/summary")
async def get_storage_summary(authorization: Optional[str] = Header(None)):
    """Fast read of the tracked variable. Returns nulls if it has never been computed."""
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)
    meta = await _users_meta_col.find_one(
        {"user_id": user_id}, {"storage_used_bytes": 1, "storage_breakdown": 1}
    ) or {}
    bd = meta.get("storage_breakdown")
    if meta.get("storage_used_bytes") is None or not isinstance(bd, dict):
        return _summary_payload(None)
    return _summary_payload(bd)


class _SyncItem(BaseModel):
    type: str          # pdf | canvas | audio | visual
    id: str            # doc_id for pdf, notebook_id otherwise
    size: int


class _SyncBody(BaseModel):
    items: List[_SyncItem]


@router.post("/storage/sync")
async def sync_storage_sizes(body: _SyncBody, authorization: Optional[str] = Header(None)):
    """One-time backfill of sizes resolved client-side from Firebase metadata."""
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    size_field = {"canvas": "insight_canvas_size", "audio": "audio_podcast_size", "visual": "visual_podcast_size"}
    for it in body.items:
        size = max(int(it.size), 0)
        if it.type == "pdf":
            await _pdf_docs_col.update_many(
                {"user_id": user_id, "doc_id": it.id}, {"$set": {"size": size}}
            )
        elif it.type in size_field:
            try:
                oid = ObjectId(it.id)
            except Exception:
                continue
            await _notebooks_col.update_one(
                {"_id": oid, "user_id": user_id}, {"$set": {size_field[it.type]: size}}
            )
    bd = await refresh_storage_used(user_id)
    return _summary_payload(bd)


@router.get("/storage/usage")
async def get_storage_usage(authorization: Optional[str] = Header(None)):
    """
    Returns PDF docs, insight-canvas Firebase URLs, and all AI Studio feature
    metadata for the authenticated user so the frontend can display and manage them.
    Firebase-hosted items (PDFs, canvas, audio/visual podcasts) return URLs so the
    frontend can resolve their file sizes via Firebase getMetadata().
    MongoDB-only items (mind maps, flashcards, quiz sessions, video suggestions)
    return count-based metadata only — they don't consume Firebase storage quota.
    """
    from chat import get_current_user  # local import avoids circular dependency
    user_id, _ = await get_current_user(authorization)

    # ── PDFs ─────────────────────────────────────────────────────────────────
    # Group by doc_id — a dedup'd PDF that appears in N notebooks shows up once.
    seen: set[str] = set()
    pdfs: list[dict] = []
    async for doc in _pdf_docs_col.find(
        {"user_id": user_id},
        {"doc_id": 1, "name": 1, "firebase_pdf_url": 1, "size": 1},
    ):
        doc_id = doc.get("doc_id", "")
        url    = doc.get("firebase_pdf_url", "")
        if not doc_id or not url or doc_id in seen:
            continue
        seen.add(doc_id)
        pdfs.append({
            "doc_id": doc_id, "name": doc.get("name", ""), "firebase_pdf_url": url,
            "size": doc["size"] if _is_size(doc.get("size")) else None,
        })

    # ── Per-notebook AI Studio data ───────────────────────────────────────────
    canvas_urls: list[dict] = []
    mind_maps: list[dict] = []
    flashcards: list[dict] = []
    quiz_sessions: list[dict] = []
    video_suggestions: list[dict] = []
    audio_podcasts: list[dict] = []
    visual_podcasts: list[dict] = []

    async for nb in _notebooks_col.find(
        {"user_id": user_id},
        {
            "insight_canvas_url": 1,
            "mind_map_data": 1,
            "flashcards_data": 1,
            "quiz_data": 1,
            "video_suggestions_data": 1,
            "audio_podcast_url": 1,
            "visual_podcast_url": 1,
            "insight_canvas_size": 1,
            "audio_podcast_size": 1,
            "visual_podcast_size": 1,
            "name": 1,
        },
    ):
        nb_id   = str(nb["_id"])
        nb_name = nb.get("name", "Untitled Notebook")

        # Insight Canvas (Firebase-hosted image)
        if nb.get("insight_canvas_url"):
            canvas_urls.append({
                "url":         nb["insight_canvas_url"],
                "name":        nb_name,
                "notebook_id": nb_id,
                "size":        nb['insight_canvas_size'] if _is_size(nb.get('insight_canvas_size')) else None,
            })

        # Mind Map (pure MongoDB JSON — no Firebase file)
        if nb.get("mind_map_data"):
            mm = nb["mind_map_data"]
            # Count total nodes to give user a sense of size
            node_count = _count_nodes(mm)
            mind_maps.append({
                "notebook_id": nb_id,
                "name":        nb_name,
                "label":       mm.get("label", "Mind Map"),
                "node_count":  node_count,
            })

        # Flashcards (pure MongoDB — no Firebase file)
        if nb.get("flashcards_data"):
            fd = nb["flashcards_data"]
            mind_maps_cards = fd.get("cards", [])
            flashcards.append({
                "notebook_id": nb_id,
                "name":        nb_name,
                "topic":       fd.get("topic", nb_name),
                "card_count":  len(mind_maps_cards),
            })

        # Quiz Session (pure MongoDB — no Firebase file)
        if nb.get("quiz_data"):
            qd = nb["quiz_data"]
            quiz_sessions.append({
                "notebook_id":    nb_id,
                "name":           nb_name,
                "topic":          qd.get("topic", nb_name),
                "difficulty":     qd.get("difficulty", "medium"),
                "question_count": len(qd.get("questions", [])),
            })

        # Video Suggestions (pure MongoDB metadata — no Firebase file)
        if nb.get("video_suggestions_data"):
            vsd = nb["video_suggestions_data"]
            video_suggestions.append({
                "notebook_id": nb_id,
                "name":        nb_name,
                "topic":       vsd.get("topic", nb_name),
                "video_count": len(vsd.get("videos", [])),
            })

        # Audio Podcast (Firebase-hosted audio file)
        if nb.get("audio_podcast_url"):
            audio_podcasts.append({
                "url":         nb["audio_podcast_url"],
                "name":        nb_name,
                "notebook_id": nb_id,
                "size":        nb['audio_podcast_size'] if _is_size(nb.get('audio_podcast_size')) else None,
            })

        # Visual Podcast (Firebase-hosted video file)
        if nb.get("visual_podcast_url"):
            visual_podcasts.append({
                "url":         nb["visual_podcast_url"],
                "name":        nb_name,
                "notebook_id": nb_id,
                "size":        nb['visual_podcast_size'] if _is_size(nb.get('visual_podcast_size')) else None,
            })

    # Self-heal the tracked variable from MongoDB data only
    summary = _summary_payload(await refresh_storage_used(user_id))

    return {
        **summary,
        "pdfs":              pdfs,
        "canvas_urls":       canvas_urls,
        "mind_maps":         mind_maps,
        "flashcards":        flashcards,
        "quiz_sessions":     quiz_sessions,
        "video_suggestions": video_suggestions,
        "audio_podcasts":    audio_podcasts,
        "visual_podcasts":   visual_podcasts,
    }


def _count_nodes(node: dict) -> int:
    """Recursively count total nodes in a mind map tree."""
    if not isinstance(node, dict):
        return 0
    count = 1
    for child in node.get("children", []) or []:
        count += _count_nodes(child)
    return count


# ── PDF ───────────────────────────────────────────────────────────────────────

@router.delete("/storage/pdf/{doc_id}")
async def delete_pdf_storage(
    doc_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Deletes all pdf_docs MongoDB rows for this doc_id (covers multi-notebook
    dedup entries). Pinecone vectors are kept for future dedup reuse.
    Returns firebase_pdf_url so the frontend can remove the file from Firebase.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    doc = await _pdf_docs_col.find_one({"doc_id": doc_id, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="PDF not found")

    firebase_pdf_url = doc.get("firebase_pdf_url", "")
    await _pdf_docs_col.delete_many({"doc_id": doc_id, "user_id": user_id})
    await refresh_storage_used(user_id)
    print(f"[Storage] Deleted all pdf_docs rows for doc_id={doc_id} (Pinecone vectors kept)")
    return {"firebase_pdf_url": firebase_pdf_url}


# ── Insight Canvas ────────────────────────────────────────────────────────────

@router.delete("/storage/canvas/{notebook_id}")
async def delete_canvas_storage(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Clears insight_canvas_url from the notebook in MongoDB.
    The frontend must delete the Firebase Storage file before calling this.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    result = await _notebooks_col.update_one(
        {"_id": oid, "user_id": user_id},
        {"$unset": {"insight_canvas_url": "", "insight_canvas_size": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")
    await refresh_storage_used(user_id)

    print(f"[Storage] Cleared insight_canvas_url for notebook={notebook_id}")
    return {"status": "ok"}


# ── Mind Map ──────────────────────────────────────────────────────────────────

@router.delete("/storage/mind-map/{notebook_id}")
async def delete_mind_map_storage(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Clears mind_map_data from the notebook in MongoDB.
    Pure MongoDB data — no Firebase file to delete.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    result = await _notebooks_col.update_one(
        {"_id": oid, "user_id": user_id},
        {"$unset": {"mind_map_data": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")

    print(f"[Storage] Cleared mind_map_data for notebook={notebook_id}")
    return {"status": "ok"}


# ── Flashcards ────────────────────────────────────────────────────────────────

@router.delete("/storage/flashcards/{notebook_id}")
async def delete_flashcards_storage(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Clears flashcards_data from the notebook in MongoDB.
    Pure MongoDB data — no Firebase file to delete.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    result = await _notebooks_col.update_one(
        {"_id": oid, "user_id": user_id},
        {"$unset": {"flashcards_data": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")

    print(f"[Storage] Cleared flashcards_data for notebook={notebook_id}")
    return {"status": "ok"}


# ── Quiz Session ──────────────────────────────────────────────────────────────

@router.delete("/storage/quiz/{notebook_id}")
async def delete_quiz_storage(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Clears quiz_data from the notebook in MongoDB.
    Pure MongoDB data — no Firebase file to delete.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    result = await _notebooks_col.update_one(
        {"_id": oid, "user_id": user_id},
        {"$unset": {"quiz_data": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")

    print(f"[Storage] Cleared quiz_data for notebook={notebook_id}")
    return {"status": "ok"}


# ── Video Suggestions ─────────────────────────────────────────────────────────

@router.delete("/storage/video-suggestions/{notebook_id}")
async def delete_video_suggestions_storage(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Clears video_suggestions_data from the notebook in MongoDB.
    Pure MongoDB data — no Firebase file to delete.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    result = await _notebooks_col.update_one(
        {"_id": oid, "user_id": user_id},
        {"$unset": {"video_suggestions_data": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")

    print(f"[Storage] Cleared video_suggestions_data for notebook={notebook_id}")
    return {"status": "ok"}


# ── Audio Podcast ─────────────────────────────────────────────────────────────

@router.delete("/storage/audio-podcast/{notebook_id}")
async def delete_audio_podcast_storage(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Clears audio_podcast_url from the notebook in MongoDB.
    The frontend must delete the Firebase Storage audio file before calling this.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    result = await _notebooks_col.update_one(
        {"_id": oid, "user_id": user_id},
        {"$unset": {"audio_podcast_url": "", "audio_podcast_size": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")
    await refresh_storage_used(user_id)

    print(f"[Storage] Cleared audio_podcast_url for notebook={notebook_id}")
    return {"status": "ok"}


# ── Visual Podcast ────────────────────────────────────────────────────────────

@router.delete("/storage/visual-podcast/{notebook_id}")
async def delete_visual_podcast_storage(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Clears visual_podcast_url from the notebook in MongoDB.
    The frontend must delete the Firebase Storage video file before calling this.
    """
    from chat import get_current_user
    user_id, _ = await get_current_user(authorization)

    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    result = await _notebooks_col.update_one(
        {"_id": oid, "user_id": user_id},
        {"$unset": {"visual_podcast_url": "", "visual_podcast_size": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")
    await refresh_storage_used(user_id)

    print(f"[Storage] Cleared visual_podcast_url for notebook={notebook_id}")
    return {"status": "ok"}
