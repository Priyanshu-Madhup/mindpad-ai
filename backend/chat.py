import os
import asyncio
import base64 as b64_lib
import uuid
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel
from groq import AsyncGroq, Groq
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from jose import jwt as jose_jwt, JWTError
from bson import ObjectId
import httpx

load_dotenv()

# ── Generated images storage ────────────────────────────────────────────────
IMAGES_DIR = Path(__file__).parent / "generated_images"
IMAGES_DIR.mkdir(exist_ok=True)

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI()

# CORS — restrict to your frontend origin in production via ALLOWED_ORIGINS env var
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Clients ────────────────────────────────────────────────────────────────────
groq_client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))
groq_sync = Groq(api_key=os.environ.get("GROQ_API_KEY"))  # sync client for audio transcription
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

mongo_client = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
db = mongo_client["mindpad_ai"]
notebooks_col = db["notebooks"]       # each doc = one notebook + its chat history
notifications_col = db["notifications"] # global broadcast notifications from admin
users_meta_col = db["users_meta"]      # tracks per-user metadata (welcome email sent, etc.)

CLERK_FRONTEND_API = os.environ.get("CLERK_FRONTEND_API", "").rstrip("/")
MAIL_USER = os.environ.get("MAIL_USER", "")
MAIL_PASS = os.environ.get("MAIL_PASS", "")

# ── Welcome email ──────────────────────────────────────────────────────────────
WELCOME_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Welcome to Mindpad AI</title></head>
<body style="margin:0;padding:0;background:#f6f7f8;font-family:'Inter','Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0D1B2A 0%,#1a3a5c 100%);padding:40px 48px;text-align:center;">
            <img src="https://raw.githubusercontent.com/Priyanshu-Madhup/mindpad-ai/master/frontend/src/mindpad_ai_logo.png"
                 alt="Mindpad AI" width="64" height="64"
                 style="border-radius:16px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;"/>
            <h1 style="margin:0;color:#fff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">Welcome to Mindpad AI</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:14px;">Your premium AI-powered research workspace</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 48px;">
            <p style="margin:0 0 20px;font-size:16px;color:#1e293b;line-height:1.7;">
              Hi there! &#128075;<br/><br/>
              We're thrilled to have you join <strong>Mindpad AI</strong> — a premium intellectual workspace built for scholars, students, and lifelong learners who demand more from their tools.
            </p>
            <!-- Features -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr><td style="background:#f0f4ff;border-radius:12px;padding:16px 20px;border-left:4px solid #4f6ef7;">
                <p style="margin:0;font-size:13px;font-weight:700;color:#0D1B2A;">&#129504; Midy AI &mdash; Intelligent Research Assistant</p>
                <p style="margin:4px 0 0;font-size:12px;color:#475569;line-height:1.6;">Ask anything &mdash; get deep answers, summaries, mind maps, quizzes and study aids powered by state-of-the-art AI.</p>
              </td></tr>
              <tr><td style="height:10px;"></td></tr>
              <tr><td style="background:#f0fff4;border-radius:12px;padding:16px 20px;border-left:4px solid #22c55e;">
                <p style="margin:0;font-size:13px;font-weight:700;color:#0D1B2A;">&#128211; Smart Notebooks</p>
                <p style="margin:4px 0 0;font-size:12px;color:#475569;line-height:1.6;">Organize research into private notebooks, each with its own AI chat history and persistent context.</p>
              </td></tr>
              <tr><td style="height:10px;"></td></tr>
              <tr><td style="background:#fff7f0;border-radius:12px;padding:16px 20px;border-left:4px solid #f97316;">
                <p style="margin:0;font-size:13px;font-weight:700;color:#0D1B2A;">&#127912; AI Image Generation</p>
                <p style="margin:4px 0 0;font-size:12px;color:#475569;line-height:1.6;">Generate stunning visuals from text prompts using Stable Diffusion 3 &mdash; right inside your notebook.</p>
              </td></tr>
              <tr><td style="height:10px;"></td></tr>
              <tr><td style="background:#fdf0ff;border-radius:12px;padding:16px 20px;border-left:4px solid #a855f7;">
                <p style="margin:0;font-size:13px;font-weight:700;color:#0D1B2A;">&#127908; Voice Input &amp; Text-to-Speech</p>
                <p style="margin:4px 0 0;font-size:12px;color:#475569;line-height:1.6;">Speak your questions with Whisper-powered transcription and listen to answers with Orpheus TTS.</p>
              </td></tr>
              <tr><td style="height:10px;"></td></tr>
              <tr><td style="background:#f0faff;border-radius:12px;padding:16px 20px;border-left:4px solid #06b6d4;">
                <p style="margin:0;font-size:13px;font-weight:700;color:#0D1B2A;">&#127760; Multi-language Support</p>
                <p style="margin:4px 0 0;font-size:12px;color:#475569;line-height:1.6;">Get AI responses in Hindi, Tamil, Bengali, Marathi &amp; more &mdash; Midy AI speaks your language.</p>
              </td></tr>
            </table>
            <!-- CTA -->
            <div style="text-align:center;margin:32px 0 8px;">
              <a href="https://mindpad-ai.vercel.app" target="_blank"
                 style="display:inline-block;background:#0D1B2A;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;">
                Open Mindpad AI &#8594;
              </a>
            </div>
            <p style="margin:28px 0 0;font-size:13px;color:#64748b;line-height:1.7;">
              Have questions or feedback? Just reply to this email &mdash; we read every message.<br/><br/>
              Happy researching,<br/>
              <strong style="color:#0D1B2A;">The Mindpad AI Team</strong>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 48px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">&copy; 2025 Mindpad AI &nbsp;&middot;&nbsp; mindpad.ai@gmail.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

def _send_welcome_email_sync(to_email: str):
    """Sends a welcome email via Gmail SMTP. Runs in a background thread."""
    if not MAIL_USER or not MAIL_PASS:
        print("[Welcome email] Credentials not set — skipping.")
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Welcome to Mindpad AI — Your Research Journey Begins!"
        msg["From"] = f"Mindpad AI <{MAIL_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(WELCOME_HTML, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(MAIL_USER, MAIL_PASS)
            server.sendmail(MAIL_USER, to_email, msg.as_string())
        print(f"[Welcome email] Sent to {to_email}")
    except Exception as e:
        print(f"[Welcome email error] {e}")


# ── System Prompt ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Midy AI, an intelligent research assistant inside Mindpad AI — a premium intellectual workspace for scholars, researchers, and lifelong learners.

Your role is to help users:
- Synthesize and summarize research papers, notes, and documents
- Answer academic and intellectual questions with depth and clarity
- Suggest connections between concepts across disciplines
- Generate mind maps, flashcard ideas, quiz questions, and study frameworks
- Guide users through complex topics step by step

Tone: Thoughtful, precise, and scholarly — but never condescending. Be concise when possible, thorough when needed.

FORMATTING RULES — CRITICAL:
- Always respond using clean, valid HTML only. Never use Markdown.
- Use these tags as appropriate: <h2>, <h3>, <p>, <strong>, <em>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <code>, <pre>, <blockquote>, <hr>
- Wrap all table headers in <thead><tr><th>...</th></tr></thead> and body rows in <tbody><tr><td>...</td></tr></tbody>
- For code, use <pre><code>...</code></pre>
- Do NOT include <html>, <head>, or <body> tags — only the inner content
- Do NOT use inline styles, classes, or any attributes
- Do NOT wrap the entire response in a single container div unnecessarily
- Keep HTML minimal and semantic"""

# ── Image generation intent detection ────────────────────────────────────────────
IMAGE_INTENT_KEYWORDS = [
    "generate an image", "generate a image", "generate image",
    "create an image", "create a image", "create image",
    "make an image", "make a image", "make image",
    "draw an image", "draw a image", "draw an", "draw a ",
    "draw the ", "draw me ",
    "generate a picture", "generate a photo", "generate an illustration",
    "create a picture", "create a photo", "create an illustration",
    "make a picture", "make a photo", "make a drawing", "make an illustration",
    "show me an image", "show me a picture", "show me a photo",
    "visualize this", "illustrate this",
    "explain with an image", "explain with image",
    "with a diagram", "with a picture",
    "generate a drawing", "create a drawing",
    "paint a ", "paint an ",
    "sketch a ", "sketch an ",
]

import re as _re
_IMAGE_VERB_RE = _re.compile(
    r"\b(generate|create|make|draw|paint|sketch|produce|render)\s+"
    r"(a |an |me |the )?"
    r"(image|picture|photo|photograph|illustration|drawing|artwork|visual|diagram)\b",
    _re.IGNORECASE,
)

def is_image_request(text: str) -> bool:
    lower = text.lower()
    if any(kw in lower for kw in IMAGE_INTENT_KEYWORDS):
        return True
    return bool(_IMAGE_VERB_RE.search(text))

async def generate_image_nvidia(prompt: str) -> tuple:
    """Call NVIDIA Stable Diffusion 3 Medium. Returns (filename, base64_data_url)."""
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    payload = {
        "prompt": prompt,
        "cfg_scale": 5,
        "aspect_ratio": "16:9",
        "seed": 0,
        "steps": 50,
        "negative_prompt": "",
    }
    print(f"[NVIDIA] Sending request with prompt: {prompt[:80]}...")
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium",
            headers=headers,
            json=payload,
        )
        print(f"[NVIDIA] Response status: {resp.status_code}")
        if not resp.is_success:
            error_body = resp.text
            print(f"[NVIDIA] Error body: {error_body}")
            resp.raise_for_status()
        data = resp.json()
        print(f"[NVIDIA] Response keys: {list(data.keys())}")

    # Extract base64 from response (handle multiple possible keys)
    img_b64: str = ""
    if "image" in data:
        img_b64 = data["image"]
    elif "artifacts" in data and data["artifacts"]:
        img_b64 = data["artifacts"][0].get("base64", "")
    elif "images" in data and data["images"]:
        img_b64 = data["images"][0].get("base64") or data["images"][0].get("blob", "")
    if not img_b64:
        raise ValueError(f"No image data in NVIDIA response: {list(data.keys())}")

    # Save to disk (best-effort — may not persist in production)
    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = IMAGES_DIR / filename
    try:
        await asyncio.to_thread(filepath.write_bytes, b64_lib.b64decode(img_b64))
        print(f"[Image saved] {filepath} ({len(img_b64)} b64 chars)")
    except Exception as e:
        print(f"[Image save skipped] {e}")

    data_url = f"data:image/jpeg;base64,{img_b64}"
    return filename, data_url


@app.get("/test-nvidia")
async def test_nvidia():
    """Debug endpoint: test NVIDIA image generation with a fixed prompt."""
    try:
        filename, data_url = await generate_image_nvidia("a beautiful sunset over the ocean, photorealistic")
        return {"status": "ok", "filename": filename, "data_url_length": len(data_url)}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

# ── Image file endpoint ────────────────────────────────────────────────
@app.get("/images/{filename}")
async def serve_image(filename: str):
    """Serve a previously generated image by filename."""
    # Sanitize filename to prevent path traversal
    safe_name = Path(filename).name
    filepath = IMAGES_DIR / safe_name
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(filepath), media_type="image/jpeg")


# ── JWT / Clerk Auth ───────────────────────────────────────────────────────────
_jwks_cache: Optional[dict] = None

async def get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{CLERK_FRONTEND_API}/.well-known/jwks.json")
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache

@app.on_event("startup")
async def startup_event():
    """Pre-warm JWKS cache on boot to cut first-request latency."""
    try:
        await get_jwks()
    except Exception:
        pass  # Non-fatal — will retry on first real request

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Decode Clerk JWT and return (user_id, email). Email may be empty string."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        jwks = await get_jwks()
        payload = jose_jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
        user_id = payload["sub"]  # Clerk user ID
        # Clerk embeds primary email in the token under various claim names
        email = (
            payload.get("email")
            or payload.get("primary_email_address", "")
            or ""
        )
        return user_id, email
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

# ── Models ─────────────────────────────────────────────────────────────────────
class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    notebook_id: str
    image_base64: Optional[str] = None
    image_mime_type: Optional[str] = "image/jpeg"
    research_mode: bool = False
    response_language: str = "English"

class NotebookCreate(BaseModel):
    name: str = "Untitled Notebook"

class NotebookUpdate(BaseModel):
    name: str

class SpeechRequest(BaseModel):
    text: str
    voice: str = "autumn"

class SaveImageRequest(BaseModel):
    messages: List[dict]
    firebase_url: str
    prompt: str = ""

class NotificationCreate(BaseModel):
    title: str
    message: str

# ── Helper ─────────────────────────────────────────────────────────────────────
def fmt_notebook(doc: dict) -> dict:
    updated = doc.get("updated_at")
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", "Untitled Notebook"),
        "updated_at": updated.isoformat() if updated else "",
    }

# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/")
@app.get("/health")
async def health():
    """Health check — used by deployment platforms to verify the service is running."""
    return {"status": "ok", "service": "mindpad-ai-backend"}


# ── Text-to-Speech ─────────────────────────────────────────────────────────────
@app.post("/tts")
async def text_to_speech(body: SpeechRequest, authorization: Optional[str] = Header(None)):
    """Convert text to speech using Groq Orpheus TTS model. Returns base64 WAV data URL."""
    # Auth check
    await get_current_user(authorization)  # auth check only

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    # Strip HTML tags for TTS — the AI returns HTML-formatted content
    import re
    clean_text = re.sub(r"<[^>]+>", " ", text)
    clean_text = re.sub(r"\s+", " ", clean_text).strip()
    # Truncate to ~4000 chars to keep TTS fast
    if len(clean_text) > 4000:
        clean_text = clean_text[:4000] + "..."

    try:
        # Use the synchronous Groq client in a thread to avoid blocking the event loop
        def _synthesize():
            sync_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
            response = sync_client.audio.speech.create(
                model="canopylabs/orpheus-v1-english",
                voice=body.voice,
                response_format="wav",
                input=clean_text,
            )
            # Collect all bytes from the stream
            audio_bytes = b"".join(response.iter_bytes())
            return audio_bytes

        audio_bytes = await asyncio.to_thread(_synthesize)
        audio_b64 = b64_lib.b64encode(audio_bytes).decode("utf-8")
        data_url = f"data:audio/wav;base64,{audio_b64}"
        return JSONResponse({"audio": data_url})
    except Exception as e:
        print(f"[TTS error] {e}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")


# ─── Notifications ─────────────────────────────────────────────────────────────

@app.get("/notifications")
async def get_notifications(authorization: Optional[str] = Header(None)):
    """Return all broadcast notifications, newest first."""
    await get_current_user(authorization)  # must be authenticated
    cursor = notifications_col.find({}, {"_id": 1, "title": 1, "message": 1, "created_at": 1})
    cursor.sort("created_at", -1)
    docs = await cursor.to_list(length=100)
    return {"notifications": [
        {
            "id": str(d["_id"]),
            "title": d.get("title", ""),
            "message": d.get("message", ""),
            "created_at": d.get("created_at", "").isoformat() if d.get("created_at") else "",
        }
        for d in docs
    ]}


@app.post("/notifications")
async def create_notification(body: NotificationCreate, authorization: Optional[str] = Header(None)):
    """Create a broadcast notification (admin only — enforced on frontend)."""
    await get_current_user(authorization)  # auth check only
    doc = {
        "title": body.title.strip(),
        "message": body.message.strip(),
        "created_at": datetime.now(timezone.utc),
    }
    result = await notifications_col.insert_one(doc)
    return {"id": str(result.inserted_id), "status": "created"}


@app.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, authorization: Optional[str] = Header(None)):
    """Delete a notification (admin only — enforced on frontend)."""
    await get_current_user(authorization)  # auth check only
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID")
    await notifications_col.delete_one({"_id": oid})
    return {"status": "deleted"}


# ─── Notebooks CRUD ────────────────────────────────────────────────────────────

@app.get("/notebooks")
async def list_notebooks(
    authorization: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),   # passed by frontend from Clerk's useUser()
):
    """Return all notebooks for the authenticated user, sorted by most recent."""
    user_id, jwt_email = await get_current_user(authorization)
    # Prefer the frontend-supplied header (always available) over the JWT claim (often absent)
    user_email = x_user_email or jwt_email or ""
    cursor = notebooks_col.find(
        {"user_id": user_id},
        {"_id": 1, "name": 1, "updated_at": 1}
    ).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)

    # ── First-time user: send welcome email once ───────────────────────────────
    if len(docs) == 0 and user_email:
        meta = await users_meta_col.find_one({"user_id": user_id})
        if not meta or not meta.get("welcomed"):
            await users_meta_col.update_one(
                {"user_id": user_id},
                {"$set": {"user_id": user_id, "welcomed": True,
                          "welcomed_at": datetime.now(timezone.utc)}},
                upsert=True,
            )
            threading.Thread(
                target=_send_welcome_email_sync, args=(user_email,), daemon=True
            ).start()
    # ───────────────────────────────────────────────────────────────────────────

    return {"notebooks": [fmt_notebook(d) for d in docs]}


@app.post("/notebooks")
async def create_notebook(body: NotebookCreate, authorization: Optional[str] = Header(None)):
    """Create a new notebook and return its ID."""
    user_id, _ = await get_current_user(authorization)
    now = datetime.now(timezone.utc)
    result = await notebooks_col.insert_one({
        "user_id": user_id,
        "name": body.name,
        "messages": [],
        "created_at": now,
        "updated_at": now,
    })
    return {"id": str(result.inserted_id), "name": body.name}


@app.patch("/notebooks/{notebook_id}")
async def rename_notebook(notebook_id: str, body: NotebookUpdate, authorization: Optional[str] = Header(None)):
    """Rename a notebook."""
    user_id, _ = await get_current_user(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    await notebooks_col.update_one(
        {"_id": oid, "user_id": user_id},
        {"$set": {"name": body.name, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"status": "ok"}


@app.delete("/notebooks/{notebook_id}")
async def delete_notebook(notebook_id: str, authorization: Optional[str] = Header(None)):
    """Delete a notebook and its chat history."""
    user_id, _ = await get_current_user(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    await notebooks_col.delete_one({"_id": oid, "user_id": user_id})
    return {"status": "deleted"}


# ─── Chat History per Notebook ────────────────────────────────────────────────

@app.get("/history/{notebook_id}")
async def get_history(notebook_id: str, authorization: Optional[str] = Header(None)):
    """Return chat history for a specific notebook."""
    user_id, _ = await get_current_user(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    doc = await notebooks_col.find_one({"_id": oid, "user_id": user_id})
    if doc:
        return {"messages": doc.get("messages", [])}
    return {"messages": []}


@app.post("/notebooks/{notebook_id}/save-image")
async def save_image_url(
    notebook_id: str,
    body: SaveImageRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Called by the frontend after uploading the generated image to Firebase Storage.
    Persists the full conversation including the Firebase image URL into MongoDB.
    """
    user_id, _ = await get_current_user(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    # Build the messages record: previous turns + assistant image entry
    record = [{"role": m["role"], "content": m["content"]} for m in body.messages]
    record.append({"role": "assistant", "content": f"__FBIMG__{body.firebase_url}"})

    try:
        await notebooks_col.update_one(
            {"_id": oid, "user_id": user_id},
            {"$set": {"messages": record, "updated_at": datetime.now(timezone.utc)}},
        )
        print(f"[Firebase] Saved image URL to notebook {notebook_id}: {body.firebase_url[:60]}...")
        return {"status": "ok"}
    except Exception as e:
        print(f"[Firebase save error] {e}")
        raise HTTPException(status_code=500, detail="Failed to save image URL")


# ─── Speech-to-Text (Whisper) ─────────────────────────────────────────────────

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    """Transcribe uploaded audio using Groq Whisper large-v3-turbo."""
    await get_current_user(authorization)  # auth check only
    audio_bytes = await audio.read()
    filename = audio.filename or "recording.webm"

    def _transcribe():
        transcription = groq_sync.audio.transcriptions.create(
            file=(filename, audio_bytes),
            model="whisper-large-v3-turbo",
            temperature=0,
            response_format="verbose_json",
        )
        return transcription.text

    try:
        text = await asyncio.to_thread(_transcribe)
        return {"text": text}
    except Exception as e:
        print(f"[Whisper error] {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


# ─── Streaming Chat ───────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(request: ChatRequest, authorization: Optional[str] = Header(None)):
    """Stream AI response (or return generated image) and persist history to the notebook."""
    user_id, _ = await get_current_user(authorization)
    messages = request.messages
    notebook_id = request.notebook_id

    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    # ── Image generation intent? ─────────────────────────────────────
    last_user_text = next((m.content for m in reversed(messages) if m.role == "user"), "")
    if is_image_request(last_user_text) and not request.image_base64:
        try:
            filename, data_url = await generate_image_nvidia(last_user_text)
            # Return base64 data URL to frontend — frontend will upload to Firebase
            # and then call /notebooks/{id}/save-image to persist the Firebase URL
            return JSONResponse({"type": "image", "url": data_url, "prompt": last_user_text})
        except Exception as e:
            print(f"[Image gen failed, falling back to text] {e}")
            image_gen_failed = True
    else:
        image_gen_failed = False

    async def save_to_db(all_messages: list):
        """Runs as an independent task — survives client disconnect."""
        try:
            await notebooks_col.update_one(
                {"_id": oid, "user_id": user_id},
                {
                    "$set": {
                        "messages": all_messages,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
        except Exception as e:
            print(f"[DB save error] {e}")

    async def stream_response():
        # Build base message list
        chat_msgs = [{"role": m.role, "content": m.content} for m in messages]

        # If image attached, convert the last user message to multimodal format
        if request.image_base64:
            for i in range(len(chat_msgs) - 1, -1, -1):
                if chat_msgs[i]["role"] == "user":
                    chat_msgs[i]["content"] = [
                        {"type": "text", "text": chat_msgs[i]["content"]},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{request.image_mime_type or 'image/jpeg'};base64,{request.image_base64}"
                            },
                        },
                    ]
                    break

        full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + chat_msgs

        # Language instruction — injected when user selects a non-English language
        if request.response_language and request.response_language.lower() != "english":
            full_messages.append({
                "role": "system",
                "content": f"IMPORTANT: You must respond entirely in {request.response_language}. Do not use English unless quoting technical terms."
            })

        # Vision model for images, reasoning model for text-only
        if request.image_base64:
            completion = await groq_client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=full_messages,
                temperature=1,
                max_completion_tokens=8192,
                top_p=1,
                stream=True,
                stop=None,
            )
        else:
            # Pick model: Research Mode → 120b, default → 20b
            text_model = "openai/gpt-oss-120b" if request.research_mode else "openai/gpt-oss-20b"
            completion = await groq_client.chat.completions.create(
                model=text_model,
                messages=full_messages,
                temperature=1,
                max_completion_tokens=8192,
                top_p=1,
                reasoning_effort="high" if request.research_mode else "medium",
                stream=True,
                stop=None,
            )

        full_response = ""
        async for chunk in completion:
            content = chunk.choices[0].delta.content
            if content:
                full_response += content
                yield content

        # Save only text messages — images are NOT stored in MongoDB
        save_messages = [{"role": m.role, "content": m.content} for m in messages]
        save_messages.append({"role": "assistant", "content": full_response})
        asyncio.create_task(save_to_db(save_messages))

    headers_out = {}
    if image_gen_failed:
        headers_out["X-Image-Fallback"] = "1"
    return StreamingResponse(stream_response(), media_type="text/plain", headers=headers_out)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
