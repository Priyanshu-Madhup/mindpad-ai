"""
storage.py — Storage usage & deletion API for Mindpad AI.

GET  /storage/usage
  Returns PDF metadata (doc_id, name, firebase_pdf_url) and insight-canvas
  entries (url, name, notebook_id) for the authenticated user so the frontend
  can call Firebase getMetadata() on each URL to compute file sizes.

DELETE /storage/pdf/{doc_id}
  Removes all pdf_docs MongoDB rows for a given doc_id (covers dedup copies
  across multiple notebooks). Pinecone vectors are intentionally kept for
  future dedup reuse. Returns the firebase_pdf_url for client-side deletion.

DELETE /storage/canvas/{notebook_id}
  Clears insight_canvas_url from the notebook document in MongoDB.
  The frontend deletes the Firebase Storage file before calling this endpoint.
"""

import os
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(tags=["Storage"])

_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]
_notebooks_col = _db["notebooks"]
_pdf_docs_col  = _db["pdf_docs"]


@router.get("/storage/usage")
async def get_storage_usage(authorization: Optional[str] = Header(None)):
    """
    Returns PDF docs and insight-canvas Firebase URLs for the authenticated user.
    The frontend calls Firebase getMetadata() on each URL to compute file sizes.
    """
    from chat import get_current_user  # local import avoids circular dependency
    user_id, _ = await get_current_user(authorization)

    # ── PDFs ─────────────────────────────────────────────────────────────────
    # Group by doc_id — a dedup'd PDF that appears in N notebooks shows up once.
    seen: set[str] = set()
    pdfs: list[dict] = []
    async for doc in _pdf_docs_col.find(
        {"user_id": user_id},
        {"doc_id": 1, "name": 1, "firebase_pdf_url": 1},
    ):
        doc_id = doc.get("doc_id", "")
        url    = doc.get("firebase_pdf_url", "")
        if not doc_id or not url or doc_id in seen:
            continue
        seen.add(doc_id)
        pdfs.append({"doc_id": doc_id, "name": doc.get("name", ""), "firebase_pdf_url": url})

    # ── Insight Canvas ────────────────────────────────────────────────────────
    canvas_urls: list[dict] = []
    async for nb in _notebooks_col.find(
        {"user_id": user_id},
        {"insight_canvas_url": 1, "name": 1},
    ):
        url = nb.get("insight_canvas_url")
        if url:
            canvas_urls.append({
                "url":         url,
                "name":        nb.get("name", "Notebook"),
                "notebook_id": str(nb["_id"]),
            })

    return {"pdfs": pdfs, "canvas_urls": canvas_urls}


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
    print(f"[Storage] Deleted all pdf_docs rows for doc_id={doc_id} (Pinecone vectors kept)")
    return {"firebase_pdf_url": firebase_pdf_url}


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
        {"$unset": {"insight_canvas_url": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")

    print(f"[Storage] Cleared insight_canvas_url for notebook={notebook_id}")
    return {"status": "ok"}
