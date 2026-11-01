"""
llm.py — single gateway to OpenRouter for every LLM / vision / image / TTS call.

  Text + vision : OPENROUTER_MODEL        (default qwen/qwen3.7-flash)
  Image gen     : OPENROUTER_IMAGE_MODEL  (default openai/gpt-image-2)
  Text-to-speech: OPENROUTER_TTS_MODEL    (default hexgrad/kokoro-82m)

Groq is still used for Whisper speech-to-text only (see chat.py /transcribe).
"""

import io
import os
import re
import wave
import base64
from typing import List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
LLM_MODEL = os.environ.get("OPENROUTER_MODEL", "qwen/qwen3.7-flash")
IMAGE_MODEL = os.environ.get("OPENROUTER_IMAGE_MODEL", "openai/gpt-image-2")
TTS_MODEL = os.environ.get("OPENROUTER_TTS_MODEL", "hexgrad/kokoro-82m")
TTS_VOICE = os.environ.get("OPENROUTER_TTS_VOICE", "af_heart")

TTS_SAMPLE_RATE = 24000  # Kokoro native rate; OpenRouter "pcm" is 16-bit mono LE
_TTS_CHUNK_CHARS = 1500

_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
_HEADERS = {
    "Authorization": f"Bearer {_API_KEY}",
    "HTTP-Referer": os.environ.get("FRONTEND_URL", "https://mindpad-ai.vercel.app"),
    "X-Title": "Mindpad AI",
}

_client = AsyncOpenAI(
    api_key=_API_KEY or "missing-openrouter-key",
    base_url=OPENROUTER_BASE_URL,
    default_headers={k: v for k, v in _HEADERS.items() if k != "Authorization"},
)


async def llm_complete(**kwargs):
    """
    OpenRouter chat completion with the shared Qwen model.
    Accepts the usual OpenAI kwargs (messages, temperature, max_tokens, stream, ...).
    Reasoning is switched off unless the caller passes its own extra_body, so short
    JSON / classification replies are not eaten by thinking tokens.
    """
    kwargs.setdefault("model", LLM_MODEL)
    kwargs.setdefault("extra_body", {"reasoning": {"enabled": False}})
    return await _client.chat.completions.create(**kwargs)


async def generate_image_bytes(
    prompt: str,
    references: Optional[List[bytes]] = None,
    aspect_ratio: Optional[str] = None,
) -> Tuple[bytes, str]:
    """
    Generate (or edit) an image via OpenRouter. Returns (image_bytes, mime_type).

    references: optional images (raw bytes, PNG assumed) passed as `input_references`
    so the model edits/uses them. aspect_ratio is a hint (e.g. "16:9"); if the model
    rejects it the request is retried without it.
    """
    # Dedicated image endpoint: chat/completions rejects pure image-generation models.
    payload: dict = {"model": IMAGE_MODEL, "prompt": prompt, "n": 1}
    if references:
        payload["input_references"] = [
            {
                "type": "image_url",
                "image_url": {"url": "data:image/png;base64," + base64.b64encode(r).decode()},
            }
            for r in references
        ]
    async with httpx.AsyncClient(timeout=300) as http:
        resp = await http.post(
            f"{OPENROUTER_BASE_URL}/images",
            json={**payload, "aspect_ratio": aspect_ratio} if aspect_ratio else payload,
            headers=_HEADERS,
        )
        if aspect_ratio and resp.status_code in (400, 422):
            resp = await http.post(f"{OPENROUTER_BASE_URL}/images", json=payload, headers=_HEADERS)
    if resp.status_code >= 400:
        raise ValueError(f"OpenRouter image error {resp.status_code}: {resp.text[:300]}")

    for item in resp.json().get("data") or []:
        if item.get("b64_json"):
            return base64.b64decode(item["b64_json"]), item.get("media_type") or "image/png"
    raise ValueError("No image data in OpenRouter response")


def _split_for_tts(text: str) -> List[str]:
    """Split text into <=_TTS_CHUNK_CHARS pieces on sentence boundaries."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: List[str] = []
    cur = ""
    for s in sentences:
        while len(s) > _TTS_CHUNK_CHARS:  # pathological sentence with no punctuation
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(s[:_TTS_CHUNK_CHARS])
            s = s[_TTS_CHUNK_CHARS:]
        if cur and len(cur) + len(s) + 1 > _TTS_CHUNK_CHARS:
            chunks.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        chunks.append(cur)
    return chunks


async def synthesize_wav(text: str, voice: str = "", speed: Optional[float] = None, model: str = "") -> bytes:
    """Text-to-speech via OpenRouter Kokoro. Returns WAV container bytes."""
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean:
        raise ValueError("No text to synthesise")

    pcm = b""
    async with httpx.AsyncClient(timeout=180) as http:
        for chunk in _split_for_tts(clean):
            resp = await http.post(
                f"{OPENROUTER_BASE_URL}/audio/speech",
                headers=_HEADERS,
                json={
                    "model": model or TTS_MODEL,
                    "input": chunk,
                    "voice": voice or TTS_VOICE,
                    "response_format": "pcm",
                    **({"speed": speed} if speed else {}),
                },
            )
            if resp.status_code >= 400:
                raise ValueError(f"OpenRouter TTS error {resp.status_code}: {resp.text[:300]}")
            pcm += resp.content

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(TTS_SAMPLE_RATE)
        wf.writeframes(pcm)
    return buf.getvalue()
