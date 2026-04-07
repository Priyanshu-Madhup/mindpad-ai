"""
support_chat.py
───────────────
Landing-page support chatbot powered by Groq.
Model: llama-3.1-8b-instant (streaming)
Grounded in features.txt — answers questions about Mindpad AI only.
"""

import os
import json
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from groq import AsyncGroq

router = APIRouter()

# ── Load feature reference doc once at startup ────────────────────────────────
_FEATURES_PATH = Path(__file__).parent / "features.txt"
_FEATURES_DOC  = _FEATURES_PATH.read_text(encoding="utf-8") if _FEATURES_PATH.exists() else ""

GROQ_MODEL = "llama-3.1-8b-instant"

SUPPORT_SYSTEM_PROMPT = f"""You are the official Mindpad AI support assistant embedded on the Mindpad AI landing page.
You are friendly, concise, and helpful.

Your ONLY job is to answer questions about Mindpad AI based on the feature reference below.
If a question is unrelated to Mindpad AI, politely redirect the user.
If you don't know something, say so honestly — do not make things up.

RESPOND IN PLAIN TEXT (no markdown, no HTML). Keep answers short and conversational.

=== MINDPAD AI FEATURE REFERENCE ===
{_FEATURES_DOC}
=== END REFERENCE ==="""

# ── Lazy singleton client — created once on first request ─────────────────────
_client: Optional[AsyncGroq] = None

def _get_client() -> Optional[AsyncGroq]:
    global _client
    if _client is None:
        key = os.getenv("GROQ_API_KEY", "")
        if key:
            _client = AsyncGroq(api_key=key)
    return _client


class SupportMessage(BaseModel):
    role: str    # "user" or "assistant"
    content: str

class SupportRequest(BaseModel):
    messages: List[SupportMessage]


@router.post("/support-chat")
async def support_chat(body: SupportRequest):
    client = _get_client()
    if not client:
        async def _no_key():
            yield "data: " + json.dumps({"choices": [{"delta": {"content": "Support chat is not configured yet."}}]}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_no_key(), media_type="text/event-stream")

    messages = [{"role": "system", "content": SUPPORT_SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in body.messages[-10:]]

    async def stream_groq():
        stream = await client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            max_tokens=512,
            temperature=0.3,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield "data: " + json.dumps({"choices": [{"delta": {"content": delta}}]}) + "\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_groq(), media_type="text/event-stream")
