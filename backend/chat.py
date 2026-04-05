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

# RAG module — import after load_dotenv so env vars are available
from rag import router as rag_router, retrieve_rag_context, cleanup_notebook_pdfs

# Deep Research module — Serper + Firecrawl + Pinecone RAG pipeline
from deep_research import router as deep_research_router, run_deep_research

# Landing-page support chat — NVIDIA NIM grounded in features.txt
from support_chat import router as support_chat_router

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

# Mount the RAG router (PDF upload / list / delete endpoints)
app.include_router(rag_router)

# Mount the Deep Research router (/deep-research/index endpoint)
app.include_router(deep_research_router)

# Mount the Support Chat router (/support-chat endpoint)
app.include_router(support_chat_router)

# ── Clients ────────────────────────────────────────────────────────────────────
groq_client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))
groq_sync = Groq(api_key=os.environ.get("GROQ_API_KEY"))  # sync client for audio transcription
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
SERPER_API_KEY = os.environ.get("SERPER_API_KEY", "")

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
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Welcome to Mindpad AI</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f4;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f4;padding:48px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:#0D1B2A;border-radius:12px 12px 0 0;padding:48px 48px 40px;text-align:center;">
          <img src="https://raw.githubusercontent.com/Priyanshu-Madhup/mindpad-ai/master/frontend/src/mindpad_ai_logo.png"
               alt="Mindpad AI" width="52" height="52"
               style="display:block;margin:0 auto 20px;border-radius:10px;"/>
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#64748b;">Welcome aboard</p>
          <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">Mindpad AI</h1>
          <p style="margin:12px 0 0;color:#94a3b8;font-size:14px;line-height:1.6;">Your AI-powered research workspace is ready.</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="background:#ffffff;padding:44px 48px 36px;">

          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0D1B2A;letter-spacing:-0.1px;">Hello,</p>
          <p style="margin:0 0 32px;font-size:15px;color:#475569;line-height:1.75;">
            Your account has been created. Mindpad AI is a premium research workspace built for scholars, students, and professionals who need a smarter way to think, research, and create.
          </p>

          <!-- Divider -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="border-top:1px solid #e2e8f0;"></td>
            </tr>
          </table>

          <p style="margin:0 0 24px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">What you have access to</p>

          <!-- Feature 01 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;">
                <span style="display:inline-block;font-size:10px;font-weight:800;color:#0D1B2A;letter-spacing:0.05em;font-family:'Courier New',monospace;">01</span>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#0D1B2A;">Midy AI Research Assistant</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">In-depth answers, summaries, mind maps, and study aids powered by state-of-the-art language models.</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="border-top:1px solid #f1f5f9;"></td></tr></table>

          <!-- Feature 02 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;">
                <span style="display:inline-block;font-size:10px;font-weight:800;color:#0D1B2A;letter-spacing:0.05em;font-family:'Courier New',monospace;">02</span>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#0D1B2A;">Private Notebooks</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">Organize research into separate notebooks, each with its own persistent AI conversation history.</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="border-top:1px solid #f1f5f9;"></td></tr></table>

          <!-- Feature 03 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;">
                <span style="display:inline-block;font-size:10px;font-weight:800;color:#0D1B2A;letter-spacing:0.05em;font-family:'Courier New',monospace;">03</span>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#0D1B2A;">AI Image Generation</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">Generate professional visuals from natural language prompts using Stable Diffusion 3 inside your notebook.</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="border-top:1px solid #f1f5f9;"></td></tr></table>

          <!-- Feature 04 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;">
                <span style="display:inline-block;font-size:10px;font-weight:800;color:#0D1B2A;letter-spacing:0.05em;font-family:'Courier New',monospace;">04</span>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#0D1B2A;">Voice Input &amp; Text-to-Speech</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">Dictate queries with Whisper transcription and receive spoken responses via Orpheus TTS.</p>
              </td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="border-top:1px solid #f1f5f9;"></td></tr></table>

          <!-- Feature 05 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
            <tr>
              <td width="36" valign="top" style="padding-top:2px;">
                <span style="display:inline-block;font-size:10px;font-weight:800;color:#0D1B2A;letter-spacing:0.05em;font-family:'Courier New',monospace;">05</span>
              </td>
              <td valign="top">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#0D1B2A;">Multi-language Responses</p>
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.65;">Get responses in Hindi, Tamil, Bengali, Marathi and more — select your language from the input bar.</p>
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <a href="https://mindpad-ai.vercel.app" target="_blank"
                   style="display:inline-block;background:#0D1B2A;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:0.04em;padding:13px 32px;border-radius:8px;">
                  Open Mindpad AI &rarr;
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:36px 0 0;font-size:13px;color:#94a3b8;line-height:1.7;border-top:1px solid #f1f5f9;padding-top:24px;">
            Reply to this email if you have any questions. We read every message personally.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc;border-radius:0 0 12px 12px;padding:20px 48px;border-top:1px solid #e2e8f0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:11px;color:#94a3b8;">
                &copy; 2025 Mindpad AI
              </td>
              <td align="right" style="font-size:11px;color:#94a3b8;">
                mindpad.ai@gmail.com
              </td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>"""

def _send_welcome_email_sync(to_email: str, user_id: str = ""):
    """Sends a welcome email via Gmail SMTP. Runs in a background thread.
    Only marks the user as 'welcomed' in MongoDB AFTER the email is confirmed sent.
    """
    if not MAIL_USER or not MAIL_PASS:
        print("[Welcome email] MAIL_USER or MAIL_PASS not set — skipping.")
        return
    print(f"[Welcome email] Attempting to send to {to_email}…")
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Welcome to Mindpad AI — Your Research Journey Begins!"
        msg["From"] = f"Mindpad AI <{MAIL_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(WELCOME_HTML, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(MAIL_USER, MAIL_PASS)
            server.sendmail(MAIL_USER, to_email, msg.as_string())
        print(f"[Welcome email] ✅ Sent successfully to {to_email}")
    except smtplib.SMTPAuthenticationError as e:
        print(f"[Welcome email] ❌ SMTP auth failed — check MAIL_USER/MAIL_PASS: {e}")
    except smtplib.SMTPException as e:
        print(f"[Welcome email] ❌ SMTP error: {e}")
    except Exception as e:
        print(f"[Welcome email] ❌ Unexpected error: {e}")


# ── System Prompt ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Midy AI, a scholarly research assistant inside Mindpad AI. Help users research, summarize, and learn.
Tone: precise and thoughtful. Be concise when possible, thorough when needed.
FORMAT: Respond in clean HTML only — no Markdown. Use <h2>, <h3>, <p>, <strong>, <em>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <code>, <pre>, <blockquote>, <hr>. No <html>/<head>/<body> tags, no inline styles or classes."""

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
    """Pre-warm JWKS cache on boot to cut first-request latency.
    Also ensures MongoDB indexes needed for PDF deduplication."""
    try:
        await get_jwks()
    except Exception:
        pass  # Non-fatal — will retry on first real request

    # Ensure MongoDB indexes for RAG / dedup (idempotent)
    try:
        from rag import ensure_indexes
        await ensure_indexes()
    except Exception as exc:
        print(f"[Startup] Warning: could not ensure indexes: {exc}")

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
    # RAG: list of doc_ids the user has checked — retrieved from Pinecone at query time
    selected_pdf_ids: Optional[List[str]] = []
    # Web search: fetch live results via Serper.dev and inject as context
    web_search: bool = False
    # Deep Research: Serper → Firecrawl scraping → Pinecone RAG (answers from vector DB, not raw snippets)
    deep_research: bool = False

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


@app.post("/test-email")
async def test_email(authorization: Optional[str] = Header(None)):
    """
    Debug endpoint: send a test welcome email to the authenticated user's address.
    Useful for verifying SMTP credentials without needing a fresh signup.
    """
    user_id, jwt_email = await get_current_user(authorization)
    if not jwt_email:
        raise HTTPException(status_code=400, detail="No email in JWT — pass X-User-Email header instead")

    import threading as _threading
    _threading.Thread(
        target=_send_welcome_email_sync, args=(jwt_email, user_id), daemon=True
    ).start()
    return {"status": "queued", "to": jwt_email}


@app.post("/reset-welcome")
async def reset_welcome(authorization: Optional[str] = Header(None)):
    """
    Debug endpoint: clear the 'welcomed' flag so the welcome email fires again
    on the next GET /notebooks call. Useful for re-testing without a new account.
    """
    user_id, _ = await get_current_user(authorization)
    result = await users_meta_col.update_one(
        {"user_id": user_id},
        {"$set": {"welcomed": False}},
    )
    return {"status": "reset", "modified": result.modified_count}


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
        {"_id": 1, "name": 1, "updated_at": 1, "messages": 1}
    ).sort("created_at", 1)  # stable creation-time order — never shuffles
    docs = await cursor.to_list(length=100)

    # ── First-time user: send welcome email once ───────────────────────────────
    # Two-signal check for a truly new user:
    #   1. No welcomed flag in users_meta (primary gate against duplicates)
    #   2. Zero "role: user" messages across ALL notebooks (your idea — catches
    #      accounts where the flag was set before the email actually sent)
    if user_email:
        meta = await users_meta_col.find_one({"user_id": user_id})
        already_welcomed = meta.get("welcomed", False) if meta else False

        # Count total user messages across all notebooks
        total_user_messages = sum(
            1
            for doc in docs
            for msg in (doc.get("messages") or [])
            if msg.get("role") == "user"
        )

        is_new_user = not already_welcomed and total_user_messages == 0

        print(
            f"[Welcome email] user={user_id[:12]}… | welcomed={already_welcomed} | "
            f"user_msgs={total_user_messages} | will_send={is_new_user}"
        )

        if is_new_user:
            # Set flag BEFORE spawning thread to prevent race-condition duplicate sends
            await users_meta_col.update_one(
                {"user_id": user_id},
                {"$set": {"user_id": user_id, "welcomed": True,
                          "welcomed_at": datetime.now(timezone.utc)}},
                upsert=True,
            )
            threading.Thread(
                target=_send_welcome_email_sync, args=(user_email, user_id), daemon=True
            ).start()
    else:
        print(f"[Welcome email] No email for user {user_id[:12]}… — skipping")
    # ───────────────────────────────────────────────────────────────────────────

    # Strip messages from the response (frontend doesn't need them here)
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
    """Delete a notebook, its chat history, associated pdf_docs rows,
    and orphaned Pinecone vectors.  Returns firebase_pdf_urls for the frontend
    to clean up Firebase Storage."""
    user_id, _ = await get_current_user(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")

    # 1. Cascade-clean PDFs: collect firebase URLs, delete orphaned Pinecone vectors,
    #    delete all pdf_docs rows for this notebook
    firebase_urls = await cleanup_notebook_pdfs(notebook_id, user_id)

    # 2. Delete the notebook document itself (chat history etc.)
    await notebooks_col.delete_one({"_id": oid, "user_id": user_id})

    return {"status": "deleted", "firebase_pdf_urls": firebase_urls}


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


# ─── Web Search (Serper.dev) ─────────────────────────────────────────────────

async def fetch_web_results(query: str, num_results: int = 5) -> str:
    """Fetch top web search results from Serper.dev and return formatted context string."""
    if not SERPER_API_KEY:
        print("[Web Search] SERPER_API_KEY not set — skipping web search.")
        return ""
    try:
        payload = {"q": query, "num": num_results}
        headers = {
            "X-API-KEY": SERPER_API_KEY,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://google.serper.dev/search",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        lines = []
        # Knowledge Graph blurb (if present)
        if kg := data.get("knowledgeGraph", {}):
            title = kg.get("title", "")
            desc = kg.get("description", "")
            if title or desc:
                lines.append(f"[Knowledge Graph] {title}: {desc}")

        # Organic results
        for res in data.get("organic", [])[:num_results]:
            title = res.get("title", "")
            snippet = res.get("snippet", "")
            link = res.get("link", "")
            lines.append(f"- {title}\n  {snippet}\n  Source: {link}")

        # Answer box
        if ab := data.get("answerBox", {}):
            answer = ab.get("answer") or ab.get("snippet", "")
            if answer:
                lines.insert(0, f"[Featured Answer] {answer}")

        context = "\n\n".join(lines)
        print(f"[Web Search] Retrieved {len(lines)} results for query: {query[:60]}")
        return context
    except Exception as e:
        print(f"[Web Search error] {e}")
        return ""


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
        # Only send the latest user message — no conversation history — to stay within TPM limits
        last_user_msg = next((m for m in reversed(messages) if m.role == "user"), None)
        if last_user_msg is None:
            return

        # ── RAG: retrieve relevant chunks from selected PDFs ─────────────────
        # NOTE: when deep_research is on we skip this early retrieval and instead
        # do ONE unified query after indexing (PDF chunks + scraped chunks together).
        rag_context = ""
        rag_sources = []
        if request.selected_pdf_ids and not request.image_base64 and not request.deep_research:
            rag_context, rag_sources = await retrieve_rag_context(
                query=last_user_msg.content,
                user_id=user_id,
                doc_ids=request.selected_pdf_ids,
                top_k=3,
            )
            if rag_context:
                print(f"[RAG] Injecting {len(rag_context)} chars of context, {len(rag_sources)} sources for user {user_id[:8]}…")

        # ── Web Search: fetch live results if toggle is on ────────────────────
        web_context = ""
        if request.web_search and not request.image_base64:
            web_context = await fetch_web_results(last_user_msg.content)
            if web_context:
                print(f"[Web Search] Injecting {len(web_context)} chars of web context")

        # ── Deep Research: Serper → Firecrawl → Pinecone → unified RAG ───────
        # Scrape + index web content, then do ONE Pinecone query combining:
        #   • all selected PDF doc_ids  (may be empty)
        #   • the freshly-indexed deep-research doc_id
        # → top-3 chunks ranked together across ALL sources by cosine similarity.
        if request.deep_research and not request.image_base64:
            print(f"[DeepResearch] Running pipeline for notebook={notebook_id}")
            dr_doc_id, dr_urls = await run_deep_research(
                query=last_user_msg.content,
                user_id=user_id,
                notebook_id=notebook_id,
            )
            if dr_doc_id:
                # Combine PDF doc_ids + deep-research doc_id → single unified query
                combined_doc_ids = list(request.selected_pdf_ids or []) + [dr_doc_id]
                unified_context, unified_sources = await retrieve_rag_context(
                    query=last_user_msg.content,
                    user_id=user_id,
                    doc_ids=combined_doc_ids,
                    top_k=3,
                )
                if unified_context:
                    web_context = ""  # don't double-inject web snippets
                    rag_context = unified_context
                    rag_sources = unified_sources
                    for src in rag_sources:
                        src["scraped_urls"] = dr_urls
                    pdf_count = len(request.selected_pdf_ids or [])
                    print(f"[DeepResearch] Unified RAG: {len(unified_context)} chars from "
                          f"{pdf_count} PDF(s) + 1 deep-research doc → top-3 chunks")
                else:
                    print("[DeepResearch] Unified query returned no chunks — falling back to empty context")
            else:
                # Indexing failed — fall back to PDF-only RAG if PDFs are selected
                print("[DeepResearch] Pipeline returned no doc_id — falling back to PDF-only RAG")
                if request.selected_pdf_ids:
                    rag_context, rag_sources = await retrieve_rag_context(
                        query=last_user_msg.content,
                        user_id=user_id,
                        doc_ids=request.selected_pdf_ids,
                        top_k=3,
                    )


        # Build single-turn payload
        if request.image_base64:
            # Multimodal: wrap last user message with image
            user_content = [
                {"type": "text", "text": last_user_msg.content},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{request.image_mime_type or 'image/jpeg'};base64,{request.image_base64}"
                    },
                },
            ]
        else:
            user_content = last_user_msg.content

        # Build system prompt — prepend RAG context and/or web search context when available
        system_content = SYSTEM_PROMPT
        extra_context_parts = []
        if rag_context:
            # Check whether this context came from deep research or PDF
            dr_label = ""
            if request.deep_research:
                dr_label = (
                    "The following context was retrieved via DEEP RESEARCH: "
                    "real web pages were scraped and vectorised, then the top-3 most relevant chunks "
                    "were retrieved for your query. "
                    "Base your answer ONLY on these chunks. Do NOT answer from your training data alone. "
                    "Cite the [Source: ...] labels where relevant.\n\n"
                )
            extra_context_parts.append(
                dr_label
                + "IMPORTANT CONSTRAINT: Each retrieved chunk below contains at most 1000 tokens. "
                "Use ONLY the following document excerpts to answer the user's question. "
                "If the excerpts don't contain the answer, say so honestly.\n\n"
                "=== RETRIEVED DOCUMENT CONTEXT ===\n"
                + rag_context
                + "\n=== END OF DOCUMENT CONTEXT ==="
            )
        if web_context:
            extra_context_parts.append(
                "The following are LIVE WEB SEARCH RESULTS fetched right now for the user's query. "
                "Use these to provide an up-to-date, accurate answer. Always cite sources when referencing them.\n\n"
                "=== WEB SEARCH RESULTS ===\n"
                + web_context
                + "\n=== END OF WEB SEARCH RESULTS ==="
            )
        if extra_context_parts:
            system_content = SYSTEM_PROMPT + "\n\n" + "\n\n".join(extra_context_parts)

        full_messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ]

        # Language instruction — injected when user selects a non-English language
        if request.response_language and request.response_language.lower() != "english":
            full_messages.append({
                "role": "system",
                "content": f"IMPORTANT: You must respond entirely in {request.response_language}. Do not use English unless quoting technical terms."
            })

        # Vision model for images, reasoning model for text-only
        # NOTE: max_completion_tokens is capped at 1500 to stay within Groq's 8000 TPM
        # budget (input_tokens + max_completion_tokens must be < 8000).
        if request.image_base64:
            completion = await groq_client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=full_messages,
                temperature=1,
                max_completion_tokens=1500,
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
                max_completion_tokens=1500,
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

        # Yield RAG sources as a special end-of-stream marker so the frontend
        # can attach hover citations to this message. NOT included in full_response
        # so it is never saved to MongoDB.
        if rag_sources:
            import json as _json
            yield f"\n__SOURCES_JSON__:{_json.dumps(rag_sources)}"

        # Save only the clean text response (no sources marker) to MongoDB
        save_messages = [{"role": m.role, "content": m.content} for m in messages]
        save_messages.append({"role": "assistant", "content": full_response})
        await save_to_db(save_messages)

    headers_out = {}
    if image_gen_failed:
        headers_out["X-Image-Fallback"] = "1"
    return StreamingResponse(stream_response(), media_type="text/plain", headers=headers_out)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
