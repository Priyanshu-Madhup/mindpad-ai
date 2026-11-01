"""
mindmap.py
----------
FastAPI router — Mind Map AI Studio feature.

Pipeline (POST /mind-map):
  1. Auth          — Clerk JWT via get_current_user().
  2. RAG retrieval — Pinecone top-5 chunks from the selected PDFs, using a broad
                     topic-extraction query.
  3. Fail fast     — HTTP 400 if no PDFs are selected, HTTP 422 if nothing is retrieved.
  4. LLM           — Qwen (OpenRouter) builds a hierarchical { label, children } JSON tree.
  5. Parse         — <think> blocks and markdown fences are stripped; the outermost
                     JSON object is extracted and loaded.
  6. Return        — { tree } for the frontend (MindMapModal.jsx) to lay out with d3-hierarchy.

Save:
  PATCH /notebooks/{notebook_id}/mind-map — persist the tree on the notebook document
  (clearing it lives in storage.py: DELETE /storage/mind-map/{notebook_id}).
"""

import os
import re
import json
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from llm import llm_complete
from rag import retrieve_rag_context
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

_mongo     = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_notebooks = _mongo["mindpad_ai"]["notebooks"]

MINDMAP_QUERY = (
    "Extract all key topics, concepts, subtopics, categories, hierarchical relationships, "
    "themes, theories, methodologies, and major findings present in the document. "
    "Identify the central theme and all major and minor branches of knowledge."
)

SYSTEM_PROMPT = (
    "You are an expert knowledge organizer. "
    "You always respond with ONLY valid JSON and nothing else — no markdown, no fences, no explanation."
)


# ── Pydantic models ───────────────────────────────────────────────────────────
class MindMapRequest(BaseModel):
    notebook_id: str
    selected_pdf_ids: List[str]


class MindMapDataUpdate(BaseModel):
    tree: dict


# ── Auth proxy ────────────────────────────────────────────────────────────────
async def _auth(authorization: Optional[str]) -> Tuple[str, str]:
    from chat import get_current_user
    return await get_current_user(authorization)


# ── Helpers ───────────────────────────────────────────────────────────────────
def _build_user_prompt(rag_context: str) -> str:
    return f"""Analyze the research content and build a comprehensive mind map as a JSON tree.

REQUIREMENTS:
- Root node: the central topic or document title (2–5 words)
- 4–7 main branches (depth 1): major themes or categories
- 2–5 sub-nodes per branch (depth 2): specific concepts or subtopics
- Optional 2–3 leaf nodes per sub-node (depth 3): key details or terms
- Keep ALL labels concise: 2–6 words maximum
- Total nodes: 30–60 for a rich, informative map

OUTPUT FORMAT — ONLY valid JSON, no markdown fences, no explanation:
{{
  "label": "Central Topic",
  "children": [
    {{
      "label": "Main Branch",
      "children": [
        {{
          "label": "Sub-topic",
          "children": [
            {{"label": "Detail A"}},
            {{"label": "Detail B"}}
          ]
        }}
      ]
    }}
  ]
}}

RESEARCH CONTENT:
{rag_context}"""


def _parse_tree(original: str) -> dict:
    """Pull the JSON tree out of the model's reply, tolerating <think> blocks and fences."""
    original = (original or "").strip()
    # Strip <think>…</think> reasoning blocks
    raw = re.sub(r"<think>.*?</think>", "", original, flags=re.DOTALL).strip()
    # Strip any accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    # Find the outermost JSON object; if nothing outside <think>, search inside it too
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        # Model may have embedded JSON inside its <think> block — search the original
        start = original.find("{")
        end = original.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON object found in model response")
        raw = original[start:end + 1]
    else:
        raw = raw[start:end + 1]
    return json.loads(raw)


# ── POST /mind-map ────────────────────────────────────────────────────────────
@router.post("/mind-map")
async def generate_mind_map(
    body: MindMapRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate an interactive mind map JSON tree from selected PDFs.
    1. Retrieves top-5 RAG chunks with a comprehensive topic-extraction query.
    2. Feeds context to Qwen to produce a hierarchical JSON tree.
    Returns the tree JSON for the frontend to render with D3.
    """
    user_id, _ = await _auth(authorization)

    if not body.selected_pdf_ids:
        raise HTTPException(status_code=400, detail="No PDFs selected. Please select at least one PDF.")

    rag_context, _ = await retrieve_rag_context(
        query=MINDMAP_QUERY,
        user_id=user_id,
        doc_ids=body.selected_pdf_ids,
        top_k=5,
    )

    if not rag_context:
        raise HTTPException(
            status_code=422,
            detail="Could not retrieve content from the selected PDFs. Ensure at least one PDF is indexed.",
        )

    print(f"[MindMap] Retrieved {len(rag_context)} chars of context for user {user_id[:8]}…")

    try:
        completion = await llm_complete(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": _build_user_prompt(rag_context)},
            ],
            temperature=0.3,
            max_tokens=4096,
        )
        tree_data = _parse_tree(completion.choices[0].message.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mind map generation failed: {str(e)}")

    return {"tree": tree_data}


# ── PATCH /notebooks/{id}/mind-map ────────────────────────────────────────────
@router.patch("/notebooks/{notebook_id}/mind-map")
async def save_mind_map_data(
    notebook_id: str,
    body: MindMapDataUpdate,
    authorization: Optional[str] = Header(None),
):
    """Persist the mind map tree JSON for this notebook."""
    user_id, _ = await _auth(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    await _notebooks.update_one(
        {"_id": oid, "user_id": user_id},
        {"$set": {"mind_map_data": body.tree, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"status": "ok"}
