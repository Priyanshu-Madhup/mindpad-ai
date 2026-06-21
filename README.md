# Mindpad AI

> **An AI-powered research workspace for scholars, students, and lifelong learners.**

[![Live Demo](https://img.shields.io/badge/Live-mindpad--ai.vercel.app-0D1B2A?style=flat-square)](https://mindpad-ai.vercel.app)
[![Frontend](https://img.shields.io/badge/Frontend-Vercel-black?style=flat-square)](https://vercel.com)
[![Backend](https://img.shields.io/badge/Backend-Railway-7B2D8B?style=flat-square)](https://railway.app)

---

## What is Mindpad AI?

Mindpad AI is a full-stack AI research workspace. You create isolated notebooks, each with its own persistent chat history, and can answer questions using:

- **RAG over PDFs** — upload documents via the sidebar source panel **or the chat bar attach button**; the AI retrieves the most relevant chunks before answering
- **PDF deduplication** — SHA-256 hash check reuses existing Pinecone vectors when the same PDF is re-uploaded, eliminating redundant embedding API calls; dedup anchors preserve the vector index even after a notebook is deleted
- **Notion Integration** — import Notion pages directly into a notebook via OAuth 2.0; pages are indexed into Pinecone and come with an AI-generated summary
- **Live Web Search** — Serper.dev-powered Google search injected into the prompt
- **Deep Research Mode** — Serper → Firecrawl scraping → dual-namespace Pinecone RAG (top 3 web chunks + top 2 PDF chunks retrieved separately and merged)
- **AI Image Generation** — Gemini image model, persisted to Firebase Storage
- **Voice Input / TTS** — Groq Whisper STT and Gemini TTS
- **Mind Map Generator** — D3-powered interactive mind map from your PDFs
- **Multilingual Responses** — 12 Indian and global languages
- **Storage Usage Dashboard** — Preferences panel shows real-time Firebase storage consumption (PDFs + Insight Canvas) against a 200 MB cap with a segmented progress bar, per-file breakdown, and one-click permanent deletion with cascade cleanup across Firebase Storage and MongoDB
- **Preferences Panel** — quick-access modal for theme, language, AI behaviour toggles, and storage management
- **Admin Broadcast** — admin can push in-app notifications **or** send branded emails to all registered users via Gmail SMTP

---

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env           # fill in your API keys
python main.py                 # http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
# create .env.local with VITE_API_URL and VITE_CLERK_PUBLISHABLE_KEY etc.
npm run dev                    # http://localhost:3000
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Framer Motion, Clerk |
| Backend | Python 3.11+, FastAPI, Uvicorn |
| LLM / STT / TTS | Groq (GPT-OSS 20B/120B, Whisper), Google Gemini |
| Vector DB | Pinecone — `multilingual-e5-large` (1024-dim), dual namespaces |
| Database | MongoDB Atlas (motor 3.x async driver) |
| Auth | Clerk (RS256 JWT + webhooks + Backend API) |
| Notion | Notion OAuth 2.0, Notion API v1 |
| Search / Scrape | Serper.dev, Firecrawl |
| Storage | Firebase Storage (generated images) |
| Email | Gmail SMTP SSL — welcome emails + admin broadcast |
| Hosting | Vercel (frontend), Railway (backend) |

---

## Project Structure

```
mindpad_ai/
├── backend/
│   ├── main.py              # Uvicorn entry point
│   ├── chat.py              # FastAPI app — all core routes
│   ├── rag.py               # PDF RAG pipeline (upload, chunk, embed, retrieve, delete)
│   ├── deep_research.py     # Deep Research pipeline (Serper → Firecrawl → Pinecone _dr namespace)
│   ├── notion.py            # Notion OAuth 2.0 + sync + RAG + summary
│   ├── storage.py           # Storage usage & deletion API (GET /storage/usage, DELETE /storage/pdf|canvas)
│   ├── support_chat.py      # Landing-page support chatbot
│   ├── features.txt         # Product reference for support bot
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx              # Main app shell, chat UI
│       ├── PreferencesModal.jsx # Preferences panel — storage usage dashboard + theme/language/AI toggles
│       ├── LandingPage.jsx
│       ├── MindMapModal.jsx
│       ├── AuthPage.jsx
│       └── firebase.jsx
├── README.md
└── DETAILED_README.md
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```
GROQ_API_KEY=
GEMINI_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX_NAME=mindpad-ai
MONGODB_URI=
CLERK_FRONTEND_API=
CLERK_WEBHOOK_SECRET=
CLERK_SECRET_KEY=          # required for admin broadcast email (Clerk Backend API)
SERPER_API_KEY=
FIRECRAWL_API_KEY=
MAIL_USER=                 # Gmail address (e.g. mindpad.ai@gmail.com)
MAIL_PASS=                 # Gmail App Password
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_STATE_SECRET=
NOTION_REDIRECT_URI=https://<your-backend>/notion/callback
ALLOWED_ORIGINS=https://mindpad-ai.vercel.app
```

See [DETAILED_README.md](DETAILED_README.md) for the full architecture, API reference, data models, and deployment guide.

---

*© 2025 Mindpad AI — mindpad.ai@gmail.com*
