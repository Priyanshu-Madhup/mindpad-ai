import os
import asyncio
import base64 as b64_lib
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel
from groq import AsyncGroq
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
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

mongo_client = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
db = mongo_client["mindpad_ai"]
notebooks_col = db["notebooks"]   # each doc = one notebook + its chat history

CLERK_FRONTEND_API = os.environ.get("CLERK_FRONTEND_API", "").rstrip("/")

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

# ── Image generation intent detection ─────────────────────────────────────────
IMAGE_INTENT_KEYWORDS = [
    "generate an image", "generate image", "create an image", "create image",
    "draw an image", "draw a picture", "draw the", "draw a ",
    "make an image", "make a picture", "make a drawing",
    "show me an image", "show me a picture", "visualize this",
    "illustrate this", "explain with an image", "explain with image",
    "with a diagram", "with a picture", "generate a picture",
    "create a picture", "generate a photo", "create a photo",
]

def is_image_request(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in IMAGE_INTENT_KEYWORDS)

async def generate_image_nvidia(prompt: str) -> str:
    """Call NVIDIA Stable Diffusion 3 Medium. Saves JPEG to disk and returns filename."""
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

    # Save to disk
    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = IMAGES_DIR / filename
    await asyncio.to_thread(filepath.write_bytes, b64_lib.b64decode(img_b64))
    print(f"[Image saved] {filepath} ({len(img_b64)} b64 chars)")
    return filename


@app.get("/test-nvidia")
async def test_nvidia():
    """Debug endpoint: test NVIDIA image generation with a fixed prompt."""
    try:
        filename = await generate_image_nvidia("a beautiful sunset over the ocean, photorealistic")
        return {"status": "ok", "filename": filename, "url": f"/images/{filename}"}
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

async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        jwks = await get_jwks()
        payload = jose_jwt.decode(token, jwks, algorithms=["RS256"], options={"verify_aud": False})
        return payload["sub"]  # Clerk user ID
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

class NotebookCreate(BaseModel):
    name: str = "Untitled Notebook"

class NotebookUpdate(BaseModel):
    name: str

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


# ─── Notebooks CRUD ────────────────────────────────────────────────────────────

@app.get("/notebooks")
async def list_notebooks(authorization: Optional[str] = Header(None)):
    """Return all notebooks for the authenticated user, sorted by most recent."""
    user_id = await get_current_user(authorization)
    cursor = notebooks_col.find(
        {"user_id": user_id},
        {"_id": 1, "name": 1, "updated_at": 1}
    ).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)
    return {"notebooks": [fmt_notebook(d) for d in docs]}


@app.post("/notebooks")
async def create_notebook(body: NotebookCreate, authorization: Optional[str] = Header(None)):
    """Create a new notebook and return its ID."""
    user_id = await get_current_user(authorization)
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
    user_id = await get_current_user(authorization)
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
    user_id = await get_current_user(authorization)
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
    user_id = await get_current_user(authorization)
    try:
        oid = ObjectId(notebook_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notebook ID")
    doc = await notebooks_col.find_one({"_id": oid, "user_id": user_id})
    if doc:
        return {"messages": doc.get("messages", [])}
    return {"messages": []}


# ─── Streaming Chat ───────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(request: ChatRequest, authorization: Optional[str] = Header(None)):
    """Stream AI response (or return generated image) and persist history to the notebook."""
    user_id = await get_current_user(authorization)
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
            filename = await generate_image_nvidia(last_user_text)
            img_url = f"/images/{filename}"  # relative path — frontend prepends BACKEND_URL

            # Save the image URL to MongoDB so it loads on history reload
            async def _save_img_record():
                record = [{"role": m.role, "content": m.content} for m in messages]
                record.append({"role": "assistant", "content": f"__IMG__{img_url}"})
                try:
                    await notebooks_col.update_one(
                        {"_id": oid, "user_id": user_id},
                        {"$set": {"messages": record, "updated_at": datetime.now(timezone.utc)}},
                    )
                except Exception as e:
                    print(f"[DB save error] {e}")
            asyncio.create_task(_save_img_record())
            return JSONResponse({"type": "image", "url": img_url, "prompt": last_user_text})
        except Exception as e:
            print(f"[Image gen failed, falling back to text] {e}")
            # Fall through to text streaming — signal fallback to frontend via header
            # We set a flag so stream_response can attach it
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
            completion = await groq_client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=full_messages,
                temperature=1,
                max_completion_tokens=8192,
                top_p=1,
                reasoning_effort="medium",
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
