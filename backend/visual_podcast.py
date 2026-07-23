"""
visual_podcast.py
-----------------
FastAPI router — Visual Podcast AI Studio feature.

Pipeline per request:
  1. Auth — Clerk JWT via get_current_user().
  2. Fetch up to 5 PDF summaries from MongoDB pdf_docs.
  3. For each slide (sequential):
     a. LLM (GPT-OSS-20B)  → body paragraph (one call per slide).
     b. LLM (GPT-OSS-20B)  → heading derived from body.
     c. Pillow              → overlay text on PNG template → temp PNG.
     d. Gemini TTS          → 24 kHz mono PCM → WAV bytes.
  4. MoviePy — concatenate all (image + audio) pairs into final MP4.
  5. Upload MP4 to Firebase Storage via REST API → get download URL.
  6. Stream SSE events throughout:
       event: progress  — after each slide { slide, total, heading }
       event: done      — { url, slides, topic } with Firebase download URL
       event: error     — { detail } on failure

This SSE approach keeps the Railway HTTP connection alive during the long
generation (7–10 min), avoiding the 60-second request timeout.

Required env vars (backend):
  FIREBASE_API_KEY          — same as VITE_FIREBASE_API_KEY on frontend
  FIREBASE_STORAGE_BUCKET   — e.g. my-project.appspot.com

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
import urllib.parse
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import AsyncGenerator, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
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

# ── Bundled fonts (downloaded on first run — works on Railway/Linux) ───────────
FONTS_DIR = Path(__file__).parent / "assets" / "fonts"

# Direct TTF download links (DejaVu 2.37, free & MIT-compatible)
_FONT_URLS: dict = {
    "DejaVuSans-Bold.ttf": "https://github.com/dejavu-fonts/dejavu-fonts/raw/version_2_37/ttf/DejaVuSans-Bold.ttf",
    "DejaVuSans.ttf":      "https://github.com/dejavu-fonts/dejavu-fonts/raw/version_2_37/ttf/DejaVuSans.ttf",
}

def _ensure_fonts() -> None:
    """Download DejaVu fonts into assets/fonts/ if not present.

    Uses stdlib urllib so no extra deps are required.  Safe to call at
    import time — skips any font that already exists.
    """
    import urllib.request
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in _FONT_URLS.items():
        dest = FONTS_DIR / name
        if not dest.exists():
            try:
                print(f"[VisualPodcast] Downloading font: {name} …")
                urllib.request.urlretrieve(url, dest)
                print(f"[VisualPodcast] Font ready: {dest}")
            except Exception as exc:  # noqa: BLE001
                print(f"[VisualPodcast] Font download failed ({name}): {exc}")

_ensure_fonts()

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
# Bundled fonts (assets/fonts/) are checked first — guaranteed on Railway.
# System fonts are fallbacks for local dev environments.
_BOLD_FONTS = [
    str(FONTS_DIR / "DejaVuSans-Bold.ttf"),            # bundled — highest priority
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]
_REG_FONTS = [
    str(FONTS_DIR / "DejaVuSans.ttf"),                 # bundled — highest priority
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
    # ── Canvas ────────────────────────────────────────────────────────────────
    if TEMPLATE_PATH.exists():
        img = Image.open(TEMPLATE_PATH).convert("RGBA")
        img = img.resize((SLIDE_W, SLIDE_H), Image.LANCZOS)
    else:
        img = Image.new("RGBA", (SLIDE_W, SLIDE_H), (13, 27, 42, 255))

    draw = ImageDraw.Draw(img)

    # ── Layout constants ───────────────────────────────────────────────────────
    H_PAD   = 100          # horizontal margin (left & right)
    CW      = SLIDE_W - 2 * H_PAD   # usable content width

    # ── Zone boundaries (out of 720px tall) ───────────────────────────────────
    # [0 … 60]       → top breathing room
    # [60 … 220]     → heading zone  (160 px)
    # [220 … 240]    → accent separator
    # [240 … 640]    → body zone     (400 px)
    # [640 … 680]    → bottom bar (slide number)
    HEADING_ZONE_Y = 60
    HEADING_ZONE_H = 160
    SEP_Y          = HEADING_ZONE_Y + HEADING_ZONE_H + 10   # ~230
    BODY_ZONE_Y    = SEP_Y + 24
    BODY_ZONE_BOT  = 635   # above the bottom bar

    # ── Fonts ──────────────────────────────────────────────────────────────────
    h_font  = _load_font(46, bold=True)
    b_font  = _load_font(26, bold=False)
    n_font  = _load_font(18, bold=False)

    # ── Heading — wrap & vertically center in heading zone ────────────────────
    h_lines = _wrap_text(draw, heading, h_font, CW)[:3]
    H_LH    = 56          # heading line-height
    h_block  = len(h_lines) * H_LH
    h_y0     = HEADING_ZONE_Y + max(0, (HEADING_ZONE_H - h_block) // 2)

    for i, line in enumerate(h_lines):
        try:
            lw = draw.textlength(line, font=h_font)
        except Exception:
            lw = len(line) * 23
        x = (SLIDE_W - lw) / 2            # horizontally centered
        y = h_y0 + i * H_LH
        _put_text(draw, (x, y), line, h_font,
                  fill=(10, 10, 10),
                  stroke_w=2, stroke_fill=(255, 255, 255, 210))

    # ── Accent separator bar ───────────────────────────────────────────────────
    # Thin colored bar, left-aligned to H_PAD
    accent_x1 = H_PAD
    accent_x2 = H_PAD + 60              # short accent dash
    draw.line([(accent_x1, SEP_Y), (accent_x2, SEP_Y)],
              fill=(30, 120, 220, 200), width=4)
    draw.line([(accent_x2 + 8, SEP_Y), (SLIDE_W - H_PAD, SEP_Y)],
              fill=(0, 0, 0, 40), width=1)

    # ── Body — wrap, cap to available height, vertically center ───────────────
    B_LH        = 40          # body line-height (generous leading)
    b_max_lines = max(1, (BODY_ZONE_BOT - BODY_ZONE_Y) // B_LH)
    b_lines     = _wrap_text(draw, body, b_font, CW)[:b_max_lines]

    b_block = len(b_lines) * B_LH
    # Vertically center in available zone (with a slight upward bias)
    b_y0    = BODY_ZONE_Y + max(0, (BODY_ZONE_BOT - BODY_ZONE_Y - b_block) // 2)

    for line in b_lines:
        _put_text(draw, (H_PAD, b_y0), line, b_font,
                  fill=(15, 15, 15),
                  stroke_w=1, stroke_fill=(255, 255, 255, 170))
        b_y0 += B_LH

    # ── Slide-number badge (bottom-right) ─────────────────────────────────────
    n_text = f"{slide_num}  /  {total_slides}"
    try:
        nw = draw.textlength(n_text, font=n_font)
    except Exception:
        nw = len(n_text) * 9
    n_x = SLIDE_W - nw - H_PAD
    n_y = BODY_ZONE_BOT + 8
    _put_text(draw, (n_x, n_y), n_text, n_font,
              fill=(60, 60, 60),
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


# ── Firebase Storage upload helper ────────────────────────────────────────────
async def _upload_to_firebase(mp4_bytes: bytes, user_id: str, notebook_id: str) -> str:
    """
    Upload mp4_bytes to Firebase Storage via the REST API using the public
    API key (same one the frontend uses).  Returns the download URL.

    Requires env vars:
      FIREBASE_API_KEY          — Firebase web API key
      FIREBASE_STORAGE_BUCKET   — e.g. "my-project.appspot.com"
    """
    api_key = os.environ.get("FIREBASE_API_KEY", "")
    bucket  = os.environ.get("FIREBASE_STORAGE_BUCKET", "")
    if not api_key or not bucket:
        raise RuntimeError(
            "FIREBASE_API_KEY and FIREBASE_STORAGE_BUCKET must be set for backend upload."
        )

    object_name = f"visual-podcasts/{user_id}/{notebook_id}/{int(datetime.now(timezone.utc).timestamp() * 1000)}.mp4"
    encoded     = urllib.parse.quote(object_name, safe="")
    upload_url  = (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket}/o"
        f"?uploadType=media&name={encoded}&key={api_key}"
    )

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            upload_url,
            content=mp4_bytes,
            headers={"Content-Type": "video/mp4"},
        )
        r.raise_for_status()
        data  = r.json()
        token = data.get("downloadTokens", "")

    download_url = (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket}/o"
        f"/{encoded}?alt=media&token={token}"
    )
    print(f"[VisualPodcast] Uploaded to Firebase: {object_name}")
    return download_url


# ── Main generation route (SSE streaming) ──────────────────────────────────────
@router.post("/visual-podcast/generate")
async def generate_visual_podcast(
    body: VisualPodcastRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Returns a text/event-stream response.  Each event is a JSON object:
      { "type": "progress", "slide": N, "total": M, "heading": "..." }
      { "type": "done",     "url": "https://firebasestorage...", "slides": [...], "topic": "..." }
      { "type": "error",    "detail": "..." }

    Streaming keeps the Railway HTTP connection alive during the long
    generation, preventing the 60-second proxy timeout.
    """
    user_id, _ = await _auth(authorization)
    num = max(1, min(body.num_slides, MAX_SLIDES))

    async def event_stream() -> AsyncGenerator[str, None]:
        # 1. Fetch PDF summaries
        ctx, names = await _fetch_summaries(
            user_id, body.notebook_id, body.selected_pdf_ids or []
        )
        if not ctx.strip():
            yield (
                f"data: {json.dumps({'type': 'error', 'detail': 'No document content found. Please select indexed PDFs and try again.'})}"
                "\n\n"
            )
            return

        topic = names[0] if names else "Research"
        print(f"[VisualPodcast] {len(ctx)} chars from {names}, {num} slides")

        tmp_dir = tempfile.mkdtemp(prefix="vp_")
        try:
            tmp:        Path                    = Path(tmp_dir)
            clips_data: List[Tuple[Path, Path]] = []
            meta:       List[dict]              = []

            for i in range(num):
                n = i + 1

                # 2. Body paragraph
                slide_body = await _gen_body(ctx, n, num, body.style_notes)
                print(f"[VisualPodcast] Slide {n} body ({len(slide_body)} chars)")

                # 3. Heading
                heading = await _gen_heading(slide_body, n, num)

                # 4. Render PNG
                img_path = tmp / f"slide_{n:02d}.png"
                await asyncio.to_thread(
                    _render_slide_sync, heading, slide_body, n, num, img_path
                )

                # 5. TTS → WAV
                wav_bytes = await asyncio.to_thread(_tts_sync, slide_body)
                wav_path  = tmp / f"audio_{n:02d}.wav"
                wav_path.write_bytes(wav_bytes)

                clips_data.append((img_path, wav_path))
                meta.append({"slide_num": n, "heading": heading, "body": slide_body, "narration": slide_body})

                # ── Yield progress event — keeps the connection alive ──────────
                yield (
                    f"data: {json.dumps({'type': 'progress', 'slide': n, 'total': num, 'heading': heading})}"
                    "\n\n"
                )

            # 6. MoviePy → MP4
            final_path = tmp / "podcast.mp4"
            await asyncio.to_thread(_make_video_sync, clips_data, final_path)
            mp4_bytes = final_path.read_bytes()
            print(f"[VisualPodcast] MP4 built — {len(mp4_bytes)//1024} KB, {num} slides")

            # 7. Upload to Firebase, get download URL
            firebase_url = await _upload_to_firebase(mp4_bytes, user_id, body.notebook_id)

            # ── Final done event ──────────────────────────────────────────────
            yield (
                f"data: {json.dumps({'type': 'done', 'url': firebase_url, 'slides': meta, 'topic': topic})}"
                "\n\n"
            )

        except Exception as exc:
            print(f"[VisualPodcast] Error: {exc}")
            yield (
                f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}"
                "\n\n"
            )
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx/Railway proxy buffering
        },
    )


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
