"""
support_chat.py
───────────────
Landing-page support chatbot powered by NVIDIA NIM API.
Model: mistralai/mistral-large-3-675b-instruct-2512 (streaming)
Grounded in features.txt — answers questions about Mindpad AI only.
"""

import os
import json
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import httpx

router = APIRouter()

# ── Load feature reference doc once at startup ────────────────────────────────
_FEATURES_PATH = Path(__file__).parent / "features.txt"
_FEATURES_DOC  = _FEATURES_PATH.read_text(encoding="utf-8") if _FEATURES_PATH.exists() else ""

NVIDIA_API_KEY   = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
NVIDIA_MODEL     = "mistralai/mistral-large-3-675b-instruct-2512"

# ── System prompt — grounded in the feature doc ───────────────────────────────
SUPPORT_SYSTEM_PROMPT = f"""You are the official Mindpad AI support assistant embedded on the Mindpad AI landing page.
You are friendly, concise, and helpful.

Your ONLY job is to answer questions about Mindpad AI based on the feature reference below.
If a question is unrelated to Mindpad AI, politely redirect the user.
If you don't know something, say so honestly — do not make things up.

RESPOND IN PLAIN TEXT (no markdown, no HTML). Keep answers short and conversational.

=== MINDPAD AI FEATURE REFERENCE ===
{_FEATURES_DOC}
=== END REFERENCE ==="""


class SupportMessage(BaseModel):
    role: str    # "user" or "assistant"
    content: str

class SupportRequest(BaseModel):
    messages: List[SupportMessage]


@router.post("/support-chat")
async def support_chat(body: SupportRequest):
    """
    Streams a response from NVIDIA NIM grounded in features.txt.
    The frontend landing page chat widget calls this endpoint.
    """
    if not NVIDIA_API_KEY:
        async def _no_key():
            yield "data: " + json.dumps({"choices": [{"delta": {"content": "Support chat is not configured yet."}}]}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_no_key(), media_type="text/event-stream")

    # Build messages array (system prompt + conversation history)
    messages = [{"role": "system", "content": SUPPORT_SYSTEM_PROMPT}]
    for msg in body.messages[-10:]:   # keep last 10 turns to stay within context
        messages.append({"role": msg.role, "content": msg.content})

    payload = {
        "model": NVIDIA_MODEL,
        "messages": messages,
        "max_tokens": 512,
        "temperature": 0.3,
        "top_p": 1.0,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
    }

    async def stream_nvidia():
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", NVIDIA_INVOKE_URL, headers=headers, json=payload) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        yield line + "\n\n"
                    elif line == "[DONE]":
                        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_nvidia(), media_type="text/event-stream")
