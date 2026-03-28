import os
import asyncio
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import AsyncGroq
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from jose import jwt as jose_jwt, JWTError
import httpx

load_dotenv()

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

mongo_client = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
db = mongo_client["mindpad_ai"]
chats_col = db["chats"]

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

# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/")
@app.get("/health")
async def health():
    """Health check — used by deployment platforms to verify the service is running."""
    return {"status": "ok", "service": "mindpad-ai-backend"}


@app.get("/history")
async def get_history(authorization: Optional[str] = Header(None)):
    """Return the full chat history for the authenticated user."""
    user_id = await get_current_user(authorization)
    doc = await chats_col.find_one({"user_id": user_id})
    if doc:
        return {"messages": doc.get("messages", [])}
    return {"messages": []}


@app.post("/chat")
async def chat(request: ChatRequest, authorization: Optional[str] = Header(None)):
    """Stream AI response and persist full history to MongoDB."""
    user_id = await get_current_user(authorization)
    messages = request.messages

    async def save_to_db(all_messages: list):
        """Runs as an independent task — survives client disconnect."""
        try:
            await chats_col.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "user_id": user_id,
                        "messages": all_messages,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
                upsert=True,
            )
        except Exception as e:
            print(f"[DB save error] {e}")

    async def stream_response():
        full_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + [
            {"role": m.role, "content": m.content} for m in messages
        ]

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

        # Fire-and-forget save — asyncio.create_task survives client disconnect
        all_messages = [{"role": m.role, "content": m.content} for m in messages]
        all_messages.append({"role": "assistant", "content": full_response})
        asyncio.create_task(save_to_db(all_messages))

    return StreamingResponse(stream_response(), media_type="text/plain")


@app.delete("/history")
async def clear_history(authorization: Optional[str] = Header(None)):
    """Clear chat history for the authenticated user."""
    user_id = await get_current_user(authorization)
    await chats_col.delete_one({"user_id": user_id})
    return {"status": "cleared"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
