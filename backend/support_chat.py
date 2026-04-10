"""
support_chat.py — Mindpad AI landing-page support chatbot (Groq, streaming).
Answers questions about Mindpad AI based on features.txt only.
"""

import os
import json
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
from groq import AsyncGroq

router = APIRouter()

# Load feature reference once at startup
_FEATURES_DOC = (Path(__file__).parent / "features.txt").read_text(encoding="utf-8")

GROQ_MODEL = "llama-3.1-8b-instant"

SYSTEM_PROMPT = f"""You are a support assistant for Mindpad AI. Answer questions about Mindpad AI only, using the reference below.
Be brief and conversational. Plain text only — no markdown or HTML.
If the question is unrelated to Mindpad AI, politely say so. If you don't know, say so.

MINDPAD AI REFERENCE:
{_FEATURES_DOC}"""

# Initialize client eagerly at import time to avoid first-request delay
_GROQ_KEY = os.getenv("GROQ_API_KEY", "")
_client = AsyncGroq(api_key=_GROQ_KEY) if _GROQ_KEY else None


class SupportMessage(BaseModel):
    role: str
    content: str

class SupportRequest(BaseModel):
    messages: List[SupportMessage]


@router.post("/support-chat")
async def support_chat(body: SupportRequest):
    if not _client:
        async def _no_key():
            yield "data: " + json.dumps({"choices": [{"delta": {"content": "Support chat is unavailable."}}]}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_no_key(), media_type="text/event-stream")

    # Keep last 6 messages for context; always include system prompt
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in body.messages[-6:]]

    async def stream_groq():
        stream = await _client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            max_tokens=400,
            temperature=0.3,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield "data: " + json.dumps({"choices": [{"delta": {"content": delta}}]}) + "\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_groq(), media_type="text/event-stream")
