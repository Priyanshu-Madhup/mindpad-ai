"""
visual_podcast.py
-----------------
FastAPI router — Visual Podcast AI Studio feature.

Pipeline per request:
  1. Auth — Clerk JWT via get_current_user().
  2. Fetch up to 5 PDF summaries from MongoDB pdf_docs.
  3. LLM (GPT-OSS-20B) — one small call → n topic outline.
  4. For each slide (sequential):
     a. LLM (GPT-OSS-20B)  → { heading, body, narration } JSON (one call per slide).
     b. Pillow              → overlay text on PNG template → temp PNG.
     c. Gemini TTS          → 24 kHz mono PCM → WAV bytes.
  5. MoviePy — concatenate all (image + audio) pairs into final MP4.
  6. Return base64-encoded MP4 + per-slide metadata as JSON.

Template : backend/assets/ppt_mindpad.png  (user-supplied, 1280×720 recommended)
           Falls back to a plain dark-navy canvas if the file is absent.
Requires : Pillow, moviepy (pip install moviepy)
"""

import io
import os
import re
import json
import wave
import base64
import asyncio
import shutil
import tempfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from groq import AsyncGroq
from google import genai as google_genai
from google.genai import types as google_genai_types
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from PIL import Image, ImageDraw, ImageFont
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────
TEMPLATE_PATH = Path(__file__).parent / "assets" / "ppt_mindpad.png"
SLIDE_W, SLIDE_H = 1280, 720
MAX_SLIDES = 8

# ── Clients ───────────────────────────────────────────────────────────────────
_groq   = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY", ""))
_gemini = google_genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

_mongo     = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db        = _mongo["mindpad_ai"]
_pdf_docs  = _db["pdf_docs"]
_notebooks = _db["notebooks"]

# ── Pydantic models ───────────────────────────────────────────────────────────
class VisualPodcastRequest(BaseModel):
    notebook_id:      str
    selected_pdf_ids: Optional[List[str]] = []
    num_slides:       int = 5
    style_notes:      str = ""

class SaveVisualPodcastUrl(BaseModel):
    url: str

# ── Auth proxy ────────────────────────────────────────────────────────────────
async def _auth(authorization: Optional[str]) -> Tuple[str, str]:
    from chat import get_current_user
    return await get_current_user(authorization)

# ── HTML stripper ─────────────────────────────────────────────────────────────
class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._p: List[str] = []
    def handle_data(self, data: str):
        t = data.strip()
        if t:
            self._p.append(t)
    def get_text(self) -> str:
        return " ".join(self._p)

def _strip_html(html: str) -> str:
    s = _Stripper()
    s.feed(html)
    return s.get_text()

# ── Font helpers ──────────────────────────────────────────────────────────────
_BOLD_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]
_REG_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibri.ttf",
]

def _load_font(size: int, bold: bool = False):
    for path in (_BOLD_FONTS if bold else _REG_FONTS):
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            pass
    return ImageFont.load_default()

def _is_truetype(font) -> bool:
    return isinstance(font, ImageFont.FreeTypeFont)

# ── Text helpers ──────────────────────────────────────────────────────────────
def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> List[str]:
    words = text.split()
    lines: List[str] = []
    cur: List[str] = []
    for word in words:
        test = " ".join(cur + [word])
        try:
            w = draw.textlength(test, font=font)
        except Exception:
            w = len(test) * 8
        if w > max_w and cur:
            lines.append(" ".join(cur))
            cur = [word]
        else:
            cur.append(word)
    if cur:
        lines.append(" ".join(cur))
    return lines

def _put_text(draw: ImageDraw.ImageDraw, xy, text: str, font, fill,
              stroke_w: int = 0, stroke_fill=None):
    kwargs: dict = {"font": font, "fill": fill}
    if stroke_w and _is_truetype(font):
        kwargs["stroke_width"] = stroke_w
        kwargs["stroke_fill"]  = stroke_fill
    draw.text(xy, text, **kwargs)

# ── Slide renderer ────────────────────────────────────────────────────────────
def _render_slide_sync(
    heading: str,
    body: str,
    slide_num: int,
    total_slides: int,
    out_path: Path,
) -> None:
    if TEMPLATE_PATH.exists():
        img = Image.open(TEMPLATE_PATH).convert("RGBA")
        img = img.resize((SLIDE_W, SLIDE_H), Image.LANCZOS)
    else:
        img = Image.new("RGBA", (SLIDE_W, SLIDE_H), (13, 27, 42, 255))

    draw = ImageDraw.Draw(img)
    PAD  = 80
    CW   = SLIDE_W - 2 * PAD

    # Heading
    h_font  = _load_font(48, bold=True)
    h_lines = _wrap_text(draw, heading, h_font, CW)[:3]
    H_LH    = 60
    H_Y0    = 140

    for i, line in enumerate(h_lines):
        try:
            lw = draw.textlength(line, font=h_font)
        except Exception:
            lw = len(line) * 24
        x = (SLIDE_W - lw) / 2
        y = H_Y0 + i * H_LH
        _put_text(draw, (x, y), line, h_font,
                  fill=(0, 0, 0),
                  stroke_w=2, stroke_fill=(255, 255, 255, 200))

    # Separator
    sep_y = H_Y0 + len(h_lines) * H_LH + 12
    draw.line([(PAD, sep_y), (SLIDE_W - PAD, sep_y)], fill=(0, 0, 0, 60), width=1)

    # Body
    b_font  = _load_font(21, bold=False)
    b_lines = _wrap_text(draw, body, b_font, CW)[:26]
    B_LH    = 30
    b_y     = sep_y + 16

    for line in b_lines:
        _put_text(draw, (PAD, b_y), line, b_font,
                  fill=(0, 0, 0),
                  stroke_w=1, stroke_fill=(255, 255, 255, 160))
        b_y += B_LH

    # Slide number
    n_font = _load_font(17, bold=False)
    n_text = f"{slide_num} / {total_slides}"
    try:
        nw = draw.textlength(n_text, font=n_font)
    except Exception:
        nw = len(n_text) * 9
    _put_text(draw, (SLIDE_W - nw - 28, SLIDE_H - 38), n_text, n_font,
              fill=(30, 30, 30),
              stroke_w=1, stroke_fill=(255, 255, 255, 140))

    img.convert("RGB").save(out_path, "PNG")

# ── Gemini TTS ────────────────────────────────────────────────────────────────
def _tts_sync(text: str) -> bytes:
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = re.sub(r"\s+", " ", clean).strip()[:5000]
    resp = _gemini.models.generate_content(
        model="gemini-3.1-flash-tts-preview",
        contents=clean,
        config=google_genai_types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=google_genai_types.SpeechConfig(
                voice_config=google_genai_types.VoiceConfig(
                    prebuilt_voice_config=google_genai_types.PrebuiltVoiceConfig(
                        voice_name="Kore",
                    )
                )
            ),
        ),
    )
    pcm = resp.candidates[0].content.parts[0].inline_data.data
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(pcm)
    return buf.getvalue()

# ── MoviePy video builder (synchronous — called via asyncio.to_thread) ────────
def _make_video_sync(
    clips_data: List[Tuple[Path, Path]],
    final: Path,
) -> None:
    """
    Combine (image, audio) pairs into a single MP4 using MoviePy.
    MoviePy bundles its own ffmpeg via imageio-ffmpeg — no system install needed.
    """
    from moviepy.editor import ImageClip, AudioFileClip, concatenate_videoclips

    video_clips = []
    for img_path, wav_path in clips_data:
        img_clip   = ImageClip(str(img_path))
        audio_clip = AudioFileClip(str(wav_path))
        duration   = max(audio_clip.duration, 3.0)
        img_clip   = img_clip.set_duration(duration).set_audio(audio_clip)
        video_clips.append(img_clip)

    final_video = concatenate_videoclips(video_clips, method="compose")
    final_video.write_videofile(
        str(final),
        fps=24,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile=str(final.parent / "temp_audio.m4a"),
        remove_temp=True,
        verbose=False,
        logger=None,
    )
    final_video.close()
    for clip in video_clips:
        clip.close()

# ── MongoDB: fetch PDF summaries ──────────────────────────────────────────────
async def _fetch_summaries(
    user_id: str, notebook_id: str, doc_ids: List[str]
) -> Tuple[str, List[str]]:
    q = (
        {"doc_id": {"$in": doc_ids}}
        if doc_ids
        else {"user_id": user_id, "notebook_id": notebook_id}
    )
    docs = await _pdf_docs.find(
        q, {"_id": 0, "name": 1, "summary": 1}
    ).limit(5).to_list(5)

    parts: List[str] = []
    names: List[str] = []
    for d in docs:
        txt = _strip_html(d.get("summary", ""))[:800]
        if txt:
            parts.append(f"[{d.get('name', 'Document')}]: {txt}")
            names.append(d.get("name", "Document"))
    return "\n\n".join(parts)[:4000], names

# ── LLM helpers ───────────────────────────────────────────────────────────────
def _clean_llm(raw: str) -> str:
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return raw

async def _gen_body(ctx: str, slide_num: int, total: int, style: str) -> str:
    """One LLM call → one body paragraph for a single slide."""
    style_clause = f" Style: {style}." if style.strip() else ""
    resp = await _groq.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are writing slide {slide_num} of {total} for a visual podcast.{style_clause} "
                    "Write a detailed paragraph covering a unique aspect of the topic, "
                    "suitable for spoken delivery. "
                    "Output ONLY the paragraph text. No labels, no markdown."
                ),
            },
            {
                "role": "user",
                "content": f"Source content:\n{ctx}\n\nWrite the paragraph for slide {slide_num}.",
            },
        ],
        temperature=0.65,
        max_tokens=600,
    )
    return (resp.choices[0].message.content or "").strip()


async def _gen_heading(body: str, slide_num: int, total: int) -> str:
    """One LLM call → heading. No token limit — let the model write a natural title."""
    resp = await _groq.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": (
                    f"Write a concise, descriptive title for slide {slide_num} of {total} "
                    "of a visual podcast. Return ONLY the title. No quotes, no markdown."
                ),
            },
            {
                "role": "user",
                "content": body,
            },
        ],
        temperature=0.5,
    )
    raw = (resp.choices[0].message.content or f"Slide {slide_num}").strip()
    heading = raw.strip('"\' ').strip()
    heading = re.sub(r'^[#*\-]+\s*', '', heading).strip()
    print(f"[VisualPodcast] Heading {slide_num}: '{heading}'")
    return heading or f"Slide {slide_num}"


# ── Main generation route ──────────────────────────────────────────────────────
@router.post("/visual-podcast/generate")
async def generate_visual_podcast(
    body: VisualPodcastRequest,
    authorization: Optional[str] = Header(None),
):
    user_id, _ = await _auth(authorization)

    num = max(1, min(body.num_slides, MAX_SLIDES))

    # 1. Fetch PDF summaries
    ctx, names = await _fetch_summaries(
        user_id, body.notebook_id, body.selected_pdf_ids or []
    )
    if not ctx.strip():
        raise HTTPException(
            status_code=422,
            detail="No document content found. Please select indexed PDFs and try again.",
        )

    topic = names[0] if names else "Research"
    print(f"[VisualPodcast] {len(ctx)} chars from {names}, {num} slides")

    tmp_dir = tempfile.mkdtemp(prefix="vp_")
    try:
        tmp                                 = Path(tmp_dir)
        clips_data: List[Tuple[Path, Path]] = []
        meta:       List[dict]              = []

        for i in range(num):
            n = i + 1

            # 2. One call → body paragraph for this slide
            slide_body = await _gen_body(ctx, n, num, body.style_notes)
            print(f"[VisualPodcast] Slide {n} body ({len(slide_body)} chars)")

            # 3. One call → heading derived from the body
            heading = await _gen_heading(slide_body, n, num)

            # 4. Render PNG
            img_path = tmp / f"slide_{n:02d}.png"
            await asyncio.to_thread(
                _render_slide_sync, heading, slide_body, n, num, img_path
            )

            # 5. TTS from body → WAV
            wav_bytes = await asyncio.to_thread(_tts_sync, slide_body)
            wav_path  = tmp / f"audio_{n:02d}.wav"
            wav_path.write_bytes(wav_bytes)

            clips_data.append((img_path, wav_path))
            meta.append({"slide_num": n, "heading": heading, "body": slide_body, "narration": slide_body})

        # 6. MoviePy → final MP4
        final_path = tmp / "podcast.mp4"
        await asyncio.to_thread(_make_video_sync, clips_data, final_path)

        video_b64 = base64.b64encode(final_path.read_bytes()).decode()
        print(f"[VisualPodcast] Done — {len(video_b64)//1024} KB b64, {num} slides")

        return JSONResponse({"video_b64": video_b64, "slides": meta, "topic": topic})

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ── Save Firebase URL route ────────────────────────────────────────────────────
@router.patch("/notebooks/{notebook_id}/visual-podcast")
async def save_visual_podcast_url(
    notebook_id: str,
    body: SaveVisualPodcastUrl,
    authorization: Optional[str] = Header(None),
):
    user_id, _ = await _auth(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    await _notebooks.update_one(
        {"_id": oid, "user_id": user_id},
        {"$set": {"visual_podcast_url": body.url, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True}


# ── Delete Firebase URL route ──────────────────────────────────────────────────
@router.delete("/notebooks/{notebook_id}/visual-podcast")
async def delete_visual_podcast_url(
    notebook_id: str,
    authorization: Optional[str] = Header(None),
):
    user_id, _ = await _auth(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    await _notebooks.update_one(
        {"_id": oid, "user_id": user_id},
        {"$unset": {"visual_podcast_url": ""}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True}
