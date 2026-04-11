"""
support_chat.py — Mindpad AI landing-page support chatbot (Groq, non-streaming).
Answers questions about Mindpad AI based on features.txt only.
"""

import os
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import JSONResponse
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

# Initialize client eagerly at import time
_GROQ_KEY = os.getenv("GROQ_API_KEY", "")
_client = AsyncGroq(api_key=_GROQ_KEY) if _GROQ_KEY else None


class SupportMessage(BaseModel):
    role: str
    content: str

class SupportRequest(BaseModel):
    messages: List[SupportMessage]


async def warm_up() -> None:
    """Make a minimal Groq API call at startup to open the TCP/TLS connection."""
    if not _client:
        return
    try:
        await _client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
            temperature=0,
        )
        print("[Support chat] Groq connection warmed up.")
    except Exception as e:
        print(f"[Support chat] Warm-up failed (non-fatal): {e}")


@router.post("/support-chat")
async def support_chat(body: SupportRequest):
    if not _client:
        return JSONResponse({"reply": "Support chat is unavailable."})

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in body.messages[-6:]]

    try:
        response = await _client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            max_tokens=400,
            temperature=0.3,
        )
        reply = response.choices[0].message.content or ""
        return JSONResponse({"reply": reply})
    except Exception as e:
        print(f"[Support chat] Groq error: {e}")
        return JSONResponse({"reply": "Sorry, I'm having trouble connecting right now. Please try again shortly."}, status_code=200)

