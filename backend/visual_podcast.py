"""
visual_podcast.py
-----------------
FastAPI router — Visual Podcast AI Studio feature.

Pipeline per request:
  1. Auth — Clerk JWT via get_current_user().
  2. Fetch up to 5 PDF summaries from MongoDB pdf_docs.
  3. For each slide (sequential):
     a. LLM (Qwen via OpenRouter) → body paragraph (one call per slide).
     b. LLM (Qwen via OpenRouter) → heading derived from body.
     c. Pillow              → overlay text on PNG template → temp PNG.
     c2. Image model (OpenRouter) → composes the whole slide (text, layout, visuals) on the
         blank template; one LLM-decided theme is shared by all slides. The Pillow slide
         from (c) is only the fallback if this call fails.
     d. Kokoro-82M TTS (OpenRouter) → 24 kHz mono PCM → WAV bytes.
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
import base64
import asyncio
import time
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
from llm import llm_complete, synthesize_wav, generate_image_bytes
from storage import refresh_storage_used
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from PIL import Image, ImageDraw, ImageFont, ImageOps
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────
TEMPLATE_PATH = Path(__file__).parent / "assets" / "ppt_mindpad.png"
SLIDE_W, SLIDE_H = 1280, 720
MAX_SLIDES = 8
# Slides 2..N are built concurrently; this caps simultaneous LLM / image / TTS pipelines.
MAX_PARALLEL_SLIDES = max(1, int(os.environ.get("VISUAL_PODCAST_PARALLEL", "2")))


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
    size: Optional[int] = None   # bytes of the uploaded mp4 (storage tracking)

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
# System fonts checked in order — Linux paths for Railway, Windows for local dev.
# Falls back to Pillow's built-in bitmap font if none are found.
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
    blank: bool = False,
) -> None:
    # ── Canvas ────────────────────────────────────────────────────────────────
    if TEMPLATE_PATH.exists():
        img = Image.open(TEMPLATE_PATH).convert("RGBA")
        img = img.resize((SLIDE_W, SLIDE_H), Image.LANCZOS)
    else:
        img = Image.new("RGBA", (SLIDE_W, SLIDE_H), (13, 27, 42, 255))

    if blank:   # template only — the image model composes the whole slide on top of it
        img.convert("RGB").save(out_path, "PNG")
        return

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

# ── Kokoro TTS (OpenRouter) ───────────────────────────────────────────────────
async def _tts(text: str) -> bytes:
    return await synthesize_wav(text[:5000])

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

    # Slides are still images (all 1280x720): "chain" skips per-frame compositing and a low
    # frame rate cuts the Python frame loop ~6x. Playback looks identical.
    final_video = concatenate_videoclips(video_clips, method="chain")
    final_video.write_videofile(
        str(final),
        fps=4,
        codec="libx264",
        audio_codec="aac",
        preset="ultrafast",   # smallest encoder memory footprint (slides are static images)
        threads=2,
        ffmpeg_params=["-tune", "stillimage", "-pix_fmt", "yuv420p"],
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
    resp = await llm_complete(
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
    resp = await llm_complete(
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
        max_tokens=100,
    )
    raw = (resp.choices[0].message.content or f"Slide {slide_num}").strip()
    heading = raw.strip('"\' ').strip()
    heading = re.sub(r'^[#*\-]+\s*', '', heading).strip()
    print(f"[VisualPodcast] Heading {slide_num}: '{heading}'")
    return heading or f"Slide {slide_num}"


# ── Deck theme (decided once, reused for every slide) ─────────────────────────
_DEFAULT_THEME = (
    "Clean modern editorial look. Deep navy and white base with one teal accent colour. "
    "Soft flat vector illustrations with subtle gradients, rounded shapes, generous whitespace, "
    "crisp sans-serif typography."
)

async def _decide_theme(ctx: str, topic: str, style_notes: str) -> str:
    """One LLM call → a single visual theme the whole deck must follow."""
    style_clause = f" The user asked for this style: {style_notes}." if style_notes.strip() else ""
    try:
        resp = await llm_complete(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an art director defining ONE visual theme for every slide of a presentation video. "
                        "Describe it in 80-120 words of plain text: exact colour palette (name 3-5 colours), "
                        "background treatment, illustration style (e.g. flat vector, watercolour, isometric 3D, photo-realistic), "
                        "recurring decorative motifs, icon style, typography feel, and mood. "
                        "It must suit the subject and be reusable unchanged on every slide. Output ONLY the description."
                    ),
                },
                {"role": "user", "content": f"Topic: {topic}.{style_clause}\n\nContent:\n{ctx[:1500]}"},
            ],
            temperature=0.6,
            max_tokens=300,
        )
        theme = _clean_llm((resp.choices[0].message.content or "").strip())
        return theme or _DEFAULT_THEME
    except Exception as exc:
        print(f"[VisualPodcast] Theme decision failed, using default: {exc}")
        return _DEFAULT_THEME


async def _enhance_slide(
    img_path: Path,
    blank_path: Path,
    heading: str,
    body: str,
    slide_num: int,
    total: int,
    theme: str,
    anchor: Optional[bytes],
) -> Optional[bytes]:
    """
    Ask the image model to compose the ENTIRE slide — typography, layout and artwork —
    on top of the blank template (blank_path). For slides 2+, the first finished slide
    is attached as a style anchor. On success overwrites img_path (normalised to
    1280x720) and returns its bytes; returns None on failure so the caller keeps the
    plain Pillow slide already at img_path.
    """
    base_bytes = blank_path.read_bytes()
    prompt = (
        "Design a complete presentation slide. The FIRST attached image is the blank slide template: "
        "use it as the base — keep its background, frame and overall look, and output a 16:9 landscape slide.\n\n"
        "You create everything on the slide: place the heading as a large, clear title; present the slide text "
        "as readable typography (use it as written if short, otherwise condense it into 3-5 concise points or a "
        "short paragraph that keeps the key facts); add a small slide number "
        f"\"{slide_num} / {total}\" in the bottom-right corner. "
        "Add relevant illustrations, images, icons or diagrams that visually explain the content, with a "
        "polished layout, strong hierarchy and balanced whitespace. "
        "All text must be spelled correctly, large enough to read, and never covered by artwork.\n\n"
        f"DECK THEME (identical on every slide of this deck, do not invent a new one):\n{theme}\n\n"
        + (
            "The SECOND attached image is an already finished slide from the same deck. Match its colour palette, "
            "background treatment, illustration style, fonts and decorative motifs exactly.\n\n"
            if anchor else ""
        )
        + f"SLIDE HEADING: {heading}\nSLIDE TEXT: {body}"
    )
    refs = [base_bytes] + ([anchor] if anchor else [])
    try:
        out_bytes, _ = await generate_image_bytes(prompt, references=refs, aspect_ratio="16:9")

        def _normalise() -> bytes:
            img = Image.open(io.BytesIO(out_bytes)).convert("RGB")
            if abs(img.width / img.height - SLIDE_W / SLIDE_H) < 0.04:
                img = img.resize((SLIDE_W, SLIDE_H), Image.LANCZOS)
            else:  # different aspect → letterbox using the edge colour, never crop text
                edge = img.getpixel((2, 2))
                img = ImageOps.pad(img, (SLIDE_W, SLIDE_H), Image.LANCZOS, color=edge)
            buf = io.BytesIO()
            img.save(buf, "PNG")
            return buf.getvalue()

        final = await asyncio.to_thread(_normalise)
        img_path.write_bytes(final)
        return final
    except Exception as exc:
        print(f"[VisualPodcast] Slide enhancement failed, keeping plain slide: {exc}")
        return None


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

            # 1b. One LLM call decides the theme that every slide must share
            yield (
                f"data: {json.dumps({'type': 'progress', 'slide': 0, 'total': num, 'heading': 'Designing the look of your video…'})}"
                "\n\n"
            )
            theme = await _decide_theme(ctx, topic, body.style_notes)
            print(f"[VisualPodcast] Theme: {theme[:120]}…")

            sem = asyncio.Semaphore(MAX_PARALLEL_SLIDES)

            async def build_slide(n: int, anchor: Optional[bytes]) -> dict:
                """Text → heading → plain slide → GPT image edit → TTS for one slide."""
                async with sem:
                    slide_body = await _gen_body(ctx, n, num, body.style_notes)
                    print(f"[VisualPodcast] Slide {n} body ({len(slide_body)} chars)")
                    heading = await _gen_heading(slide_body, n, num)

                    img_path   = tmp / f"slide_{n:02d}.png"        # plain Pillow slide (fallback)
                    blank_path = tmp / f"blank_{n:02d}.png"        # template only, input for the image model
                    await asyncio.to_thread(
                        _render_slide_sync, heading, slide_body, n, num, img_path
                    )
                    await asyncio.to_thread(
                        _render_slide_sync, heading, slide_body, n, num, blank_path, True
                    )
                    enhanced = await _enhance_slide(
                        img_path, blank_path, heading, slide_body, n, num, theme, anchor
                    )

                    wav_path = tmp / f"audio_{n:02d}.wav"
                    wav_path.write_bytes(await _tts(slide_body))
                return {
                    "n": n, "heading": heading, "body": slide_body,
                    "img": img_path, "wav": wav_path, "enhanced": enhanced,
                }

            def progress_event(done: int, message: str) -> str:
                # `heading` carries a user-facing status line (no slide counts / internals)
                return (
                    f"data: {json.dumps({'type': 'progress', 'slide': done, 'total': num, 'heading': message})}"
                    "\n\n"
                )

            def stage_message(done: int) -> str:
                return (
                    "Creating your scenes and visuals…"
                    if done / num < 0.5
                    else "Adding narration and final touches…"
                )

            results: List[dict] = []

            # Slide 1 runs alone: its finished image becomes the style anchor that
            # every other slide is shown, so the whole deck shares one look.
            first = await build_slide(1, None)
            results.append(first)
            anchor_bytes: Optional[bytes] = first["enhanced"]
            yield progress_event(len(results), stage_message(len(results)))

            # Slides 2..N run concurrently (capped by MAX_PARALLEL_SLIDES); progress
            # is reported as each one finishes, whatever its position.
            tasks = [asyncio.create_task(build_slide(n, anchor_bytes)) for n in range(2, num + 1)]
            try:
                for fut in asyncio.as_completed(tasks):
                    res = await fut
                    results.append(res)
                    if len(results) < num:
                        yield progress_event(len(results), stage_message(len(results)))
            finally:
                for t in tasks:
                    if not t.done():
                        t.cancel()

            results.sort(key=lambda r: r["n"])
            for r in results:
                clips_data.append((r["img"], r["wav"]))
                meta.append({"slide_num": r["n"], "heading": r["heading"], "body": r["body"], "narration": r["body"]})

            # 6. MoviePy → MP4
            yield progress_event(num, "Putting your video together…")
            final_path = tmp / "podcast.mp4"
            build = asyncio.create_task(asyncio.to_thread(_make_video_sync, clips_data, final_path))
            t0 = time.monotonic()
            while True:
                done_set, _ = await asyncio.wait({build}, timeout=10)
                if done_set:
                    break
                yield ": keepalive\n\n"   # SSE comment — keeps proxies from closing the idle stream
            await build                   # re-raises any encoding error
            print(f"[VisualPodcast] Video encoded in {time.monotonic() - t0:.1f}s")
            mp4_bytes = final_path.read_bytes()
            print(f"[VisualPodcast] MP4 built — {len(mp4_bytes)//1024} KB, {num} slides")
            yield progress_event(num, "Saving your video…")

            # 7. Upload to Firebase, get download URL
            firebase_url = await _upload_to_firebase(mp4_bytes, user_id, body.notebook_id)

            # ── Final done event ──────────────────────────────────────────────
            yield (
                f"data: {json.dumps({'type': 'done', 'url': firebase_url, 'size': len(mp4_bytes), 'slides': meta, 'topic': topic})}"
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
    update: dict = {"$set": {"visual_podcast_url": body.url, "updated_at": datetime.now(timezone.utc)}}
    if body.size is not None:
        update["$set"]["visual_podcast_size"] = max(body.size, 0)
    else:
        update["$unset"] = {"visual_podcast_size": ""}
    await _notebooks.update_one({"_id": oid, "user_id": user_id}, update)
    await refresh_storage_used(user_id)
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
        {"$unset": {"visual_podcast_url": "", "visual_podcast_size": ""}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    await refresh_storage_used(user_id)
    return {"ok": True}
