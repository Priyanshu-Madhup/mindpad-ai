"""
mindspeak.py
------------
FastAPI router — MindSpeak, the live voice conversation feature of AI Studio.

One spoken turn, streamed back as Server-Sent Events so the reply starts playing
before the model has finished writing it:

  1. Auth        — Clerk JWT via get_current_user().
  2. Listen      — uploaded audio → Groq Whisper → transcript   (event: transcript)
  3. Context     — last few voice turns from the notebook + top RAG chunks from the
                   selected PDFs (if any).
  4. Think       — Qwen (OpenRouter) streams the reply token by token (event: token).
  5. Speak       — every finished sentence is sent to the TTS voice right away, in
                   parallel with the model, and returned in order   (event: audio).
  6. Remember    — the user turn and the reply are appended to the notebook's
                   `mindspeak_messages`, even if the user hits Stop mid-sentence.

Routes:
  POST   /mindspeak/turn                   — run one spoken turn (SSE)
  GET    /notebooks/{notebook_id}/mindspeak — saved voice conversation
  DELETE /notebooks/{notebook_id}/mindspeak — clear the saved voice conversation
"""

import os
import re
import json
import base64
import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from llm import llm_complete, synthesize_wav
from rag import retrieve_rag_context
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

_mongo     = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_notebooks = _mongo["mindpad_ai"]["notebooks"]

MAX_AUDIO_BYTES   = 10 * 1024 * 1024   # one spoken turn is a few seconds; 10 MB is generous
HISTORY_TURNS     = 8                   # previous messages sent to the model for continuity
MAX_SAVED         = 400                 # messages kept per notebook (oldest dropped first)
RAG_CONTEXT_CHARS = 3000
FIRST_CHUNK_MIN   = 20                  # the first spoken piece may break at a comma once this long
FIRST_CHUNK_LEN   = 45                  # ...and the buffer is at least this long (or ~70 chars at a word break)
TTS_PIECE_CHARS   = 300                 # longer sentences are split so no single TTS call runs long

# Fast voice. OpenRouter's default Kokoro took 7-17 s per sentence; x-ai/grok-voice-tts-1.0
# answers in ~1-2 s, runs on the same OpenRouter key (no separate free-tier caps) and costs
# about $0.015 per 1,000 characters. Kokoro stays as the fallback.
TTS_MODEL = os.environ.get("MINDSPEAK_TTS_MODEL", "x-ai/grok-voice-tts-1.0")
TTS_VOICE = os.environ.get("MINDSPEAK_TTS_VOICE", "eve")

SYSTEM_PROMPT = (
    "You are Midy, the voice of Mindpad AI, in a live spoken conversation. "
    "Your words are read aloud, so write exactly how a warm, quick-witted person talks: "
    "short natural sentences, usually two to four, and never more than six. "
    "Plain text only — no markdown, bullets, headings, emojis, HTML or special symbols. "
    "Say numbers and abbreviations the way they are spoken. "
    "Answer first, then add one useful detail if it helps. "
    "When document excerpts are provided, ground the answer in them and say so naturally; "
    "if they do not cover the question, answer from general knowledge and say that. "
    "End with a short question only when it moves the conversation forward."
)


# ── Auth proxy ────────────────────────────────────────────────────────────────
async def _auth(authorization: Optional[str]):
    from chat import get_current_user
    return await get_current_user(authorization)


def _oid(notebook_id: str) -> ObjectId:
    try:
        return ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")


# ── Helpers ───────────────────────────────────────────────────────────────────
def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _transcribe(audio_bytes: bytes, filename: str) -> str:
    """Groq Whisper speech-to-text (same model as POST /transcribe)."""
    from chat import groq_sync

    def _run():
        out = groq_sync.audio.transcriptions.create(
            file=(filename, audio_bytes),
            model="whisper-large-v3-turbo",
            temperature=0,
            response_format="verbose_json",
        )
        return out.text

    return (await asyncio.to_thread(_run) or "").strip()


def _speakable(text: str) -> str:
    """Strip anything a TTS voice would read out loud as noise."""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[*_`#>~|]+", "", text)
    text = re.sub(r"^\s*[-•]\s+", "", text, flags=re.M)
    text = re.sub(r"\[(\d+)\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+|\n+")


def _pop_sentences(buffer: str, first: bool):
    """
    Split *buffer* into complete sentences plus the unfinished tail.
    The first chunk is released early (at a comma once it is long enough) so audio
    starts as soon as possible; later chunks wait for a real sentence end.
    """
    parts = _SENTENCE_END.split(buffer)
    if len(parts) > 1:
        return [p for p in parts[:-1] if p.strip()], parts[-1]
    if first and len(buffer) >= FIRST_CHUNK_LEN:
        m = re.search(r"[,;:—–-]\s", buffer[FIRST_CHUNK_MIN:])
        if m:
            cut = FIRST_CHUNK_MIN + m.end()
            return [buffer[:cut]], buffer[cut:]
        if len(buffer) >= 70:                      # no punctuation yet: break at the last word
            cut = buffer.rfind(" ", 0, len(buffer) - 1)
            if cut > FIRST_CHUNK_MIN:
                return [buffer[:cut]], buffer[cut + 1:]
    return [], buffer


def _pieces(sentence: str) -> List[str]:
    """Split a long sentence into <=TTS_PIECE_CHARS pieces on word boundaries."""
    out, cur = [], ""
    for word in sentence.split():
        if cur and len(cur) + 1 + len(word) > TTS_PIECE_CHARS:
            out.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    if cur:
        out.append(cur)
    return out


async def _synth(text: str) -> bytes:
    """Fast OpenRouter voice (about 1-2 s per sentence); falls back to Kokoro if it fails."""
    try:
        return await synthesize_wav(text, voice=TTS_VOICE, model=TTS_MODEL)
    except Exception as e:
        print(f"[MindSpeak] {TTS_MODEL} failed, falling back to Kokoro: {e}")
        return await synthesize_wav(text, speed=1.15)


async def _load_history(oid: ObjectId, user_id: str) -> List[dict]:
    doc = await _notebooks.find_one(
        {"_id": oid, "user_id": user_id}, {"mindspeak_messages": 1}
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    msgs = doc.get("mindspeak_messages") or []
    return [{"role": m["role"], "content": m["content"]} for m in msgs[-HISTORY_TURNS:]]


async def _save_turn(oid: ObjectId, user_id: str, user_text: str, reply: str, interrupted: bool):
    """Append the user turn and the (possibly partial) reply to the notebook."""
    now = datetime.now(timezone.utc).isoformat()
    entries = [{"role": "user", "content": user_text, "ts": now}]
    if reply.strip():
        entry = {"role": "assistant", "content": reply.strip(), "ts": now}
        if interrupted:
            entry["interrupted"] = True
        entries.append(entry)
    try:
        await _notebooks.update_one(
            {"_id": oid, "user_id": user_id},
            {
                "$push": {"mindspeak_messages": {"$each": entries, "$slice": -MAX_SAVED}},
                "$set":  {"updated_at": datetime.now(timezone.utc)},
            },
        )
    except Exception as e:
        print(f"[MindSpeak save error] {e}")


# ── POST /mindspeak/turn ──────────────────────────────────────────────────────
@router.post("/mindspeak/turn")
async def mindspeak_turn(
    audio: UploadFile = File(...),
    notebook_id: str = Form(...),
    selected_pdf_ids: str = Form(""),
    language: str = Form("English"),
    authorization: Optional[str] = Header(None),
):
    """
    Run one spoken turn. Returns text/event-stream; every event is `data: <json>`:
      {"type":"transcript","text":...}              what the user said
      {"type":"token","text":...}                   next piece of the written reply
      {"type":"audio","seq":n,"text":...,"b64":...} WAV for the next sentence, in order
      {"type":"tts_error","detail":...}             voice synthesis failed (text still streams)
      {"type":"done","reply":...}                   turn finished and saved
      {"type":"error","detail":...}
    """
    user_id, _ = await _auth(authorization)
    oid = _oid(notebook_id)

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio received")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Recording is too long")
    filename = audio.filename or "speech.webm"
    doc_ids = [d for d in (selected_pdf_ids or "").split(",") if d.strip()]
    history = await _load_history(oid, user_id)

    async def event_stream():
        out: asyncio.Queue = asyncio.Queue()    # events headed for the browser
        tts_q: asyncio.Queue = asyncio.Queue()  # (seq, sentence, tts_task) in speaking order
        state = {"reply": "", "user": "", "finished": False, "saved": False, "tts_warned": False}
        tasks: List[asyncio.Task] = []

        async def tts_worker():
            """Hand audio to the browser strictly in order, while later sentences render."""
            while True:
                item = await tts_q.get()
                if item is None:
                    break
                seq, sentence, task = item
                try:
                    wav = await task
                    await out.put({
                        "type": "audio", "seq": seq, "text": sentence,
                        "b64": base64.b64encode(wav).decode(),
                    })
                except Exception as e:
                    print(f"[MindSpeak TTS] sentence {seq} skipped: {e}")
                    if not state["tts_warned"]:
                        state["tts_warned"] = True
                        await out.put({"type": "tts_error", "detail": "The voice is unavailable right now — showing text only."})
            await out.put(None)

        async def producer():
            seq = 0
            buffer = ""
            try:
                # Listen
                user_text = await _transcribe(audio_bytes, filename)
                if len(re.sub(r"\W", "", user_text)) < 2:
                    await out.put({"type": "error", "detail": "I didn't catch that — try again."})
                    return
                state["user"] = user_text
                await out.put({"type": "transcript", "text": user_text})

                # Context
                context = ""
                if doc_ids:
                    context, _ = await retrieve_rag_context(
                        query=user_text, user_id=user_id, doc_ids=doc_ids, top_k=3
                    )
                system = SYSTEM_PROMPT + f" Speak in {language}."
                if context:
                    system += "\n\nDocument excerpts:\n" + context[:RAG_CONTEXT_CHARS]
                messages = [{"role": "system", "content": system}, *history,
                            {"role": "user", "content": user_text}]

                def queue_sentence(raw: str):
                    nonlocal seq
                    sentence = _speakable(raw)
                    if len(re.sub(r"\W", "", sentence)) < 2:
                        return
                    for piece in _pieces(sentence):
                        task = asyncio.create_task(_synth(piece))
                        tasks.append(task)
                        tts_q.put_nowait((seq, piece, task))
                        seq += 1

                # Think + speak
                completion = await llm_complete(
                    messages=messages, temperature=0.7, max_tokens=420, stream=True
                )
                async for chunk in completion:
                    if not chunk.choices:
                        continue
                    piece = chunk.choices[0].delta.content
                    if not piece:
                        continue
                    state["reply"] += piece
                    await out.put({"type": "token", "text": piece})
                    buffer += piece
                    ready, buffer = _pop_sentences(buffer, first=(seq == 0))
                    for sentence in ready:
                        queue_sentence(sentence)
                if buffer.strip():
                    queue_sentence(buffer)
                state["finished"] = True
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[MindSpeak error] {e}")
                await out.put({"type": "error", "detail": "Something went wrong. Please try again."})
            finally:
                tts_q.put_nowait(None)

        def save_turn_once():
            """Persist exactly once — whether the turn finished, failed or was stopped."""
            if state["user"] and not state["saved"]:
                state["saved"] = True
                return asyncio.create_task(_save_turn(
                    oid, user_id, state["user"], state["reply"], interrupted=not state["finished"]
                ))

        worker = asyncio.create_task(tts_worker())
        prod = asyncio.create_task(producer())
        tasks.extend([worker, prod])
        try:
            while True:
                event = await out.get()
                if event is None:
                    break
                yield _sse(event)
            saver = save_turn_once()
            if saver:
                await saver
            if state["finished"]:
                yield _sse({"type": "done", "reply": state["reply"].strip()})
        finally:
            # Client pressed Stop / disconnected: cancel work, keep what was said so far.
            for t in tasks:
                if not t.done():
                    t.cancel()
            save_turn_once()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Saved conversation ────────────────────────────────────────────────────────
@router.get("/notebooks/{notebook_id}/mindspeak")
async def get_mindspeak(notebook_id: str, authorization: Optional[str] = Header(None)):
    """Return the notebook's saved voice conversation (oldest first)."""
    user_id, _ = await _auth(authorization)
    doc = await _notebooks.find_one(
        {"_id": _oid(notebook_id), "user_id": user_id}, {"mindspeak_messages": 1}
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return {"messages": doc.get("mindspeak_messages") or []}


@router.delete("/notebooks/{notebook_id}/mindspeak")
async def delete_mindspeak(notebook_id: str, authorization: Optional[str] = Header(None)):
    """Clear the notebook's saved voice conversation."""
    user_id, _ = await _auth(authorization)
    res = await _notebooks.update_one(
        {"_id": _oid(notebook_id), "user_id": user_id},
        {"$unset": {"mindspeak_messages": ""}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return {"status": "ok"}
