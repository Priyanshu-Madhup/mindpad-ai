# Mindpad AI

> **An AI-powered research workspace for scholars, students, and lifelong learners.**

[![Live Demo](https://img.shields.io/badge/Live-mindpad--ai.vercel.app-0D1B2A?style=flat-square)](https://mindpad-ai.vercel.app)
[![Frontend](https://img.shields.io/badge/Frontend-Vercel-black?style=flat-square)](https://vercel.com)
[![Backend](https://img.shields.io/badge/Backend-Railway-7B2D8B?style=flat-square)](https://railway.app)

---

## What is Mindpad AI?

Mindpad AI is a full-stack AI research workspace. You create isolated notebooks, each with its own persistent chat history, and can answer questions using:

- **RAG over PDFs** — upload documents via the sidebar source panel **or the chat bar attach button**; the AI retrieves the most relevant chunks before answering
- **PDF deduplication** — SHA-256 hash check reuses existing Pinecone vectors when the same PDF is re-uploaded, eliminating redundant embedding API calls
- **Notion Integration** — import Notion pages directly into a notebook via OAuth 2.0; pages are indexed into Pinecone with an AI-generated summary
- **Live Web Search** — Serper.dev-powered Google search injected into the prompt
- **Deep Research Mode** — Serper → Firecrawl scraping → dual-namespace Pinecone RAG (top 3 web chunks + top 2 PDF chunks)
- **AI Image Generation** — Gemini image model, persisted to Firebase Storage
- **Voice Input / TTS** — Groq Whisper STT and Gemini TTS
- **Mind Map Generator** — D3-powered interactive mind map from your PDFs
- **Video Suggestions** — AI Studio feature that reads your PDF summaries from MongoDB, uses GPT-OSS-20B to craft 4 focused YouTube search queries via Serper.dev, and surfaces relevant educational videos in an in-app player (persists per notebook across page reloads)
- **Flashcards** — AI-generated Q&A flip cards from your PDFs; persists per notebook
- **Quiz Mode** — AI Studio feature that generates configurable multiple-difficulty quizzes (1–10 questions, Easy/Medium/Hard) from PDF summaries + Pinecone chunks. Users type **or speak** (Whisper) answers; each is evaluated by the LLM for score/10, strengths, and areas to improve. Full session — questions, answers, evaluations, and progress — is persisted to MongoDB so reopening the modal resumes exactly where the user left off. Results panel shows per-question breakdown with delete option.
- **Multilingual Responses** — 12 Indian and global languages
- **Subscription Plans** — Free / Plus (₹49/mo) / Pro (₹99/mo) via Razorpay; plan stored in MongoDB and enforced on every login
- **Storage Caps** — 50 MB (Free) · 200 MB (Plus) · 500 MB (Pro) — enforced at PDF upload; displayed live in Preferences
- **Storage Usage Dashboard** — Preferences panel shows real-time Firebase storage consumption (PDFs + Insight Canvas) with segmented progress bar, per-file breakdown, and one-click permanent deletion
- **Coupon Management** — admin-only panel (accessible via the navbar Tag icon) to create, list, and delete percentage-based discount coupons; coupons are stored in MongoDB with per-coupon usage counts, optional max-use caps, and plan-scoped applicability (All / Plus / Pro)
- **Welcome & Upgrade Emails** — branded HTML emails via Gmail SMTP on first login and after plan upgrade
- **Admin Broadcast** — admin can push in-app notifications **or** send branded emails to all registered users

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
# create .env.local — see Environment Variables below
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
| Payments | Razorpay (HMAC-SHA256 signature verification) |
| Notion | Notion OAuth 2.0, Notion API v1 |
| Search / Scrape | Serper.dev, Firecrawl |
| Storage | Firebase Storage (generated images + PDFs) |
| Email | Gmail SMTP SSL — welcome + plan upgrade + admin broadcast |
| Hosting | Vercel (frontend), Railway (backend) |

---

## Project Structure

```
mindpad_ai/
├── backend/
│   ├── main.py              # Uvicorn entry point
│   ├── chat.py              # FastAPI app — all core routes
│   ├── rag.py               # PDF RAG pipeline (upload, chunk, embed, retrieve, delete)
│   ├── plans.py             # Subscription plans, Razorpay order creation & verification,
│   │                        #   MongoDB-backed coupon CRUD (admin), usage tracking
│   ├── deep_research.py     # Deep Research pipeline (Serper → Firecrawl → Pinecone _dr namespace)
│   ├── notion.py            # Notion OAuth 2.0 + sync + RAG + summary
│   ├── storage.py           # Storage usage & deletion API (GET /storage/usage, DELETE /storage/pdf|canvas)
│   ├── video_suggestions.py # Video Suggestions router — fetches PDF summaries from MongoDB,
│   │                        #   generates YouTube search queries via GPT-OSS-20B + Serper.dev /videos
│   ├── flashcards.py        # Flashcards router — PDF summary + Pinecone → LLM → Q&A cards
│   ├── quiz.py              # Quiz Mode router — generates difficulty-aware questions from PDF
│   │                        #   summaries + Pinecone chunks; evaluates typed/spoken answers
│   │                        #   via LLM (score/10, strengths, weaknesses, model answer)
│   ├── support_chat.py      # Landing-page support chatbot
│   ├── features.txt         # Product reference for support bot
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx              # Main app shell, chat UI, plan badge
│       ├── PaymentPage.jsx      # Razorpay checkout flow
│       ├── PricingModal.jsx     # Plan comparison modal
│       ├── PreferencesModal.jsx # Storage usage dashboard + theme/language/AI toggles
│       ├── CouponManagerModal.jsx # Admin-only coupon management panel
│       ├── VideoSuggestionsModal.jsx # AI Studio video player — grid, query filters, inline iframe
│       ├── FlashcardsModal.jsx  # AI Studio flashcard flip-card viewer
│       ├── QuizModal.jsx        # AI Studio quiz — settings, Q&A with voice input, evaluation,
│       │                        #   prev/next navigation, results breakdown, delete
│       ├── LandingPage.jsx
│       ├── MindMapModal.jsx
│       ├── AuthPage.jsx
│       └── firebase.jsx
├── README.md
└── DETAILED_README.md
```

---

## Subscription Plans

| Feature | Free | Plus (₹49/mo) | Pro (₹99/mo) |
|---|---|---|---|
| Storage | 50 MB | 200 MB | 500 MB |
| AI Model | Standard | Better (2×) | Best (3×) |
| Deep Research | 5/day | Unlimited | Unlimited |
| Image Generation | 5/day | 50/day | Unlimited |
| AI Studio | Basic | Expanded | Full |
| Languages | 10 | 12 | 12 |
| Support | Standard | Priority | Dedicated |

Payments are processed by **Razorpay** (live keys). On successful payment, the plan is stored in MongoDB `users_meta` with a 30-day expiry and a `storage_limit_mb` field enforced at PDF upload. A branded upgrade confirmation email is sent automatically.

---

## Environment Variables

### Backend (`.env`)

```env
GROQ_API_KEY=
GEMINI_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX_NAME=mindpad-ai
MONGODB_URI=
CLERK_FRONTEND_API=https://<your-clerk-domain>
CLERK_SECRET_KEY=
SERPER_API_KEY=
FIRECRAWL_API_KEY=
MAIL_USER=                    # Gmail address
MAIL_PASS=                    # Gmail App Password
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=https://<your-backend>/notion/callback
NOTION_STATE_SECRET=
FRONTEND_URL=https://mindpad-ai.vercel.app
ALLOWED_ORIGINS=https://mindpad-ai.vercel.app
```

### Frontend (`.env.local`)

```env
VITE_BACKEND_URL=https://<your-railway-backend>.up.railway.app
VITE_CLERK_PUBLISHABLE_KEY=
VITE_RAZORPAY_KEY_ID=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

---

## Deployment

### Frontend → Vercel

```bash
cd frontend
vercel deploy --prod
```

Set all `VITE_*` environment variables in the Vercel project settings.

### Backend → Railway

1. Create a new **Railway** service pointing to the `backend/` directory.
2. Build command: `pip install -r requirements.txt`
3. Start command: `python main.py`
4. Set all backend environment variables in Railway's Variables tab.
5. Set `ALLOWED_ORIGINS` to your Vercel frontend URL.
6. Set `NOTION_REDIRECT_URI` to your Railway backend URL + `/notion/callback`.

---

See [detailed_readme.md](detailed_readme.md) for the full architecture, API reference, data models, and security details.

---

*© 2025 Mindpad AI — mindpad.ai@gmail.com*
