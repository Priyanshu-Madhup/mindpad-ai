# Backend — How Each File Works

A file-by-file guide to the FastAPI backend: what every file is for and what each function in it does.

**Conventions**

- **Entry point:** `main.py` starts Uvicorn on `chat:app`. `chat.py` is the FastAPI app; every other module exposes an `APIRouter` that `chat.py` mounts with `app.include_router(...)`.
- **Auth:** every protected route reads `Authorization: Bearer <Clerk JWT>` and resolves a `user_id`. Each router keeps its own tiny auth helper (`_auth`, `_get_current_user`) that wraps `chat.get_current_user()` or decodes the JWT directly.
- **Data stores:** MongoDB (collections `notebooks`, `pdf_docs`, `users_meta`, `notifications`, `coupons`, `deep_research_docs`, `notion_connections`), Pinecone (index `mindpad-ai`, namespaces `{user_id}` and `{user_id}_dr`), Firebase Storage (files uploaded by the browser, or by the backend for visual-podcast MP4s).
- **Models:** all LLM / vision / image / TTS calls go through OpenRouter via `llm.py`. Groq is used only for Whisper transcription.
- **Naming:** a leading underscore (`_name`) marks a module-private helper. Functions with a router decorator are HTTP endpoints; the route is shown in brackets.
- **`_Stripper` / `_strip_html`:** several files carry the same small `HTMLParser` subclass (`__init__`, `handle_data`, `get_text`) that turns stored HTML summaries into plain text. It is documented once under `audio_podcast.py` and referred to afterwards.

---

## main.py

Launcher only; it has no functions. When run directly (`python main.py`) it reads `PORT` (default 8000) and starts `uvicorn.run("chat:app", host="0.0.0.0")`.

---

## chat.py — main FastAPI app

Creates the `app`, sets up CORS, mounts all other routers, opens the MongoDB connection (`notebooks_col`, `notifications_col`, `users_meta_col`), and holds core features: auth, notebooks CRUD, chat streaming, mind map, insight canvas, TTS, STT, notifications, broadcast email, and the Clerk webhook.

### Email / image generation
| Function | What it does |
|---|---|
| `_send_welcome_email_sync(to_email, user_id)` | Builds and sends the branded welcome email via Gmail SMTP (SSL). Runs in a background thread on a user's first login. |
| `generate_image(prompt)` | Calls `llm.generate_image_bytes()` and returns a base64 data URL. Used only by the Insight Canvas; normal chat never generates images. |

### Auth
| Function | What it does |
|---|---|
| `get_jwks()` | Fetches and caches Clerk's JWKS (public keys) so tokens can be verified locally. |
| `startup_event()` | On boot, pre-warms the JWKS cache to cut first-request latency. |
| `get_current_user(authorization)` | Decodes the Clerk RS256 JWT and returns `(user_id, email)`. Used as the shared auth function by most routers. |
| `get_clerk_user_email(user_id)` | Looks up a user's primary email through the Clerk Backend API. |

### Request models (Pydantic)
`Message`, `ChatRequest`, `NotebookCreate`, `NotebookUpdate`, `SpeechRequest`, `NotificationCreate`, `InsightCanvasRequest`, `VideoSuggestionsDataUpdate`, `FlashcardsDataUpdate`, `QuizDataUpdate`, `BroadcastEmailRequest`, `InsightCanvasUrlUpdate` — validate request bodies for the endpoints below.

### General
| Function | What it does |
|---|---|
| `fmt_notebook(doc)` | Converts a MongoDB notebook document into the JSON shape sent to the frontend (id, name, messages, AI Studio data, podcast URLs, etc.). |
| `health()` `[GET / , /health]` | Health check for the deployment platform. |
| `clerk_webhook(request)` `[POST /webhooks/clerk]` | Verifies the Svix signature; on `user.deleted` removes the user's notebooks, `users_meta`, PDFs and Pinecone vectors (`cleanup_user_all_data`, `cleanup_notion_connection`). |
| `text_to_speech(body)` `[POST /tts]` | Strips HTML, calls `llm.synthesize_wav()` (Kokoro), and returns a base64 WAV data URL. |

### Notifications and broadcast
| Function | What it does |
|---|---|
| `get_notifications()` `[GET /notifications]` | Lists all global notifications, newest first. |
| `create_notification(body)` `[POST /notifications]` | Adds a global in-app notification (admin-only in the UI). |
| `delete_notification(id)` `[DELETE /notifications/{id}]` | Removes a notification. |
| `_build_broadcast_html(subject, body_text)` | Wraps admin text in the branded HTML email template. |
| `_send_broadcast_email_sync(to_emails, subject, html)` | Sends one SMTP message to many recipients via BCC. |
| `broadcast_email(body)` `[POST /broadcast-email]` | Admin-only (checked by hard-coded admin user id / email). Pages through all Clerk users to collect emails, then sends the broadcast in a background thread. |

### Notebooks
| Function | What it does |
|---|---|
| `list_notebooks()` `[GET /notebooks]` | Returns the user's notebooks (oldest first) plus the active `plan` and `plan_expires_at`. Also stores the user's email, auto-downgrades expired plans, and sends the welcome email on first login. |
| `create_notebook(body)` `[POST /notebooks]` | Creates an empty notebook. |
| `rename_notebook(id, body)` `[PATCH /notebooks/{id}]` | Renames a notebook. |
| `delete_notebook(id)` `[DELETE /notebooks/{id}]` | Deletes a notebook, cleans up its PDFs / vectors (`cleanup_notebook_pdfs`) and refreshes storage usage. |
| `get_history(id)` `[GET /history/{id}]` | Returns the notebook's saved chat messages. |
| `save_insight_canvas_url(id, body)` `[PATCH .../insight-canvas]` | Saves the Insight Canvas Firebase URL and file size. |
| `save_video_suggestions_data(id, body)` `[PATCH .../video-suggestions]` | Saves videos, queries and topic. |
| `save_flashcards_data(id, body)` `[PATCH .../flashcards]` | Saves the flashcard deck. |
| `save_quiz_data(id, body)` `[PATCH .../quiz]` | Saves quiz questions, evaluations and progress. |

### AI features
| Function | What it does |
|---|---|
| `transcribe_audio(audio)` `[POST /transcribe]` | Sends uploaded audio to Groq Whisper (`whisper-large-v3-turbo`) in a worker thread (inner `_transcribe`). |
| `fetch_web_results(query, num_results)` | Calls Serper.dev and formats the featured snippet, knowledge-graph text and top organic results as a context block. |
| `chat(request)` `[POST /chat]` | The main chat endpoint. Gathers context (PDF RAG, web search, deep research), picks the normal or Research-Mode system prompt and language, builds multimodal input if an image is attached, and streams the answer as SSE. Inner `stream_response()` produces the stream; inner `save_to_db()` persists the conversation as an independent task so it survives client disconnects. |
| `generate_insight_canvas(body)` `[POST /insight-canvas]` | Retrieves top RAG chunks, has the LLM write a 16:9 infographic prompt (inner `_generate_image_prompt`), renders it with the image model, and returns a base64 data URL. |

---

## llm.py — OpenRouter gateway

One place for every model call so keys, defaults and request quirks live together.

| Function | What it does |
|---|---|
| `llm_complete(**kwargs)` | Chat completion against the shared Qwen model (text and vision). Accepts the usual OpenAI-style kwargs (messages, max_tokens, temperature…). |
| `generate_image_bytes(prompt, references, aspect_ratio)` | Calls OpenRouter's `/images` endpoint with `gpt-image-2`; optionally passes reference images for editing and an aspect-ratio hint (retried without the hint if rejected). Returns `(image_bytes, mime_type)`. |
| `_split_for_tts(text)` | Splits text on sentence boundaries into pieces under the TTS character limit. |
| `synthesize_wav(text, voice, speed)` | Runs Kokoro-82M through OpenRouter's `/audio/speech` for each piece, joins the raw PCM and wraps it in a WAV container. |

---

## rag.py — PDF ingestion and retrieval

Handles PDF upload, chunking, embedding, summaries, retrieval, and cleanup. Router has no prefix.

| Function | What it does |
|---|---|
| `ensure_indexes()` | Creates the MongoDB indexes used for deduplication and listing. |
| `count_tokens(text)` | Token count using tiktoken `cl100k_base`. |
| `split_into_token_chunks(text, max_tokens)` | Splits text into chunks of at most `max_tokens`, on whitespace boundaries. |
| `_init_index()` / `get_index()` | Create (if missing) and return the cached Pinecone serverless index. |
| `decide_chunk_count(total_tokens, pdf_name)` | Asks the LLM how many chunks the document should be split into; the result is clamped to 100–1000 tokens per chunk. |
| `_embed_sync(texts, input_type)` / `embed_texts(...)` | Embed texts with Pinecone-hosted `multilingual-e5-large` (sync worker and async wrapper). |
| `generate_pdf_summary(doc_id, user_id, filename)` | One LLM call that returns an HTML summary and a suggested notebook name; both are stored on the `pdf_docs` row. |
| `retrieve_rag_context(query, user_id, doc_ids, top_k, namespace)` | Embeds the query and queries Pinecone (default namespace = user, optionally `{user}_dr`), filtered by `doc_ids`; returns a formatted context string. |
| `upload_pdf(file, ...)` `[POST /upload-pdf]` | Full ingestion: storage-cap check (413 if exceeded) → SHA-256 dedup → text extraction → token count → chunking → embedding → Pinecone upsert → `pdf_docs` row → summary and auto-rename. |
| `extract_and_index_images(pdf_bytes, ...)` | Pulls images out of a PDF with PyMuPDF, describes each with the vision model, and indexes the descriptions so figures are searchable. |
| `list_pdfs(notebook_id)` `[GET /pdfs/{notebook_id}]` | Lists a notebook's PDFs. |
| `save_pdf_firebase_url(doc_id, body)` `[PATCH /pdfs/{doc_id}/firebase-url]` | Stores the Firebase URL of the raw PDF after the browser uploads it. |
| `delete_pdf(doc_id)` `[DELETE /pdfs/{doc_id}]` | Removes a PDF from a notebook; deletes vectors only if no other notebook references it. |
| `cleanup_notebook_pdfs(notebook_id, user_id)` | On notebook deletion, deletes or promotes its PDFs to dedup anchors (`notebook_id="__dedup__"`) so re-uploads are instant. |
| `cleanup_user_all_data(user_id)` | On account deletion, wipes the user's `pdf_docs` and both Pinecone namespaces. |

`_FirebaseUrlBody` is the request model for the Firebase-URL endpoint.

---

## deep_research.py — web research pipeline

Serper → Firecrawl → chunk → embed → Pinecone `{user}_dr`.

| Function | What it does |
|---|---|
| `fetch_serper_links(query, num)` | Returns the top organic result URLs from Serper.dev. |
| `scrape_url_firecrawl(url)` | Scrapes one URL to Markdown through Firecrawl's REST API (async, 1-hour cache, errors skipped). |
| `scrape_all_urls(urls)` | Scrapes all URLs concurrently with `asyncio.gather`. |
| `index_scraped_content(content, query, user_id, notebook_id, urls)` | Truncates to 40,000 chars, asks the LLM for a chunk count, chunks, embeds, upserts to Pinecone, and records metadata in `deep_research_docs`. |
| `run_deep_research(query, user_id, notebook_id, num_results)` | Orchestrates the above steps end to end. |
| `deep_research_index(body)` `[POST /deep-research/index]` | HTTP wrapper around `run_deep_research`. |

---

## notion.py — Notion integration (prefix `/notion`)

OAuth 2.0 connection plus syncing Notion pages into notebooks / the RAG index.

| Function | What it does |
|---|---|
| `_make_state(user_id)` / `_parse_state(state)` | Create and verify an HMAC-signed OAuth `state` value so the callback can trust which user it belongs to. |
| `_headers(access_token)` | Standard Notion API headers. |
| `_exchange_code(code)` | Exchanges the OAuth code for access and refresh tokens. |
| `_do_refresh(refresh_token)` | Exchanges a refresh token for a new token pair. |
| `_refresh_and_store(user_id, refresh_token)` | Refreshes, saves the new pair in `notion_connections`, returns the new access token. |
| `_rich_text(arr)` | Joins the plain text of a Notion rich-text array. |
| `_escape(text)` | HTML-escapes `& < >`. |
| `_blocks_to_plain_text(blocks)` | Converts Notion blocks (headings, lists, code, tables…) to clean plain text for embedding. |
| `_index_notion_to_rag(plain_text, page_id, page_title, user_id, notebook_id)` | Chunks, embeds and upserts a page into Pinecone and records a `pdf_docs` entry, using the same dynamic chunking as PDFs. |
| `_delete_notion_page_rag_data(user_id, notion_page_id, notebook_id)` | Removes vectors and records for one synced page. |
| `_delete_notion_rag_data(user_id)` | Removes all Notion-sourced vectors and records for a user. |
| `_fetch_all_blocks(page_id, access_token)` | Fetches every block of a page, following cursor pagination. |
| `notion_status()` `[GET /status]` | Whether the user is connected, and to which workspace. |
| `notion_connect()` `[GET /connect]` | Returns the Notion consent URL. |
| `notion_callback(code, state, error)` `[GET /callback]` | Unauthenticated redirect target: validates state, exchanges the code, stores tokens, redirects back to the frontend. |
| `notion_disconnect()` `[DELETE /disconnect]` | Deletes the connection and purges Notion RAG data. |
| `notion_list_pages()` `[GET /pages]` | Lists pages and databases the user shared with the integration. |
| `notion_sync_page(body)` `[POST /sync]` | Fetches a page and indexes it (or attaches it) in the chosen notebook, refreshing tokens if needed. |
| `cleanup_notion_connection(user_id)` | Called on account deletion to drop tokens and RAG data. |

---

## plans.py — subscriptions, coupons, Razorpay (prefix `/plans`)

| Function | What it does |
|---|---|
| `_get_jwks()` / `_get_current_user(authorization)` | Local copy of the Clerk JWT decoding logic; returns `user_id`. |
| `_apply_coupon(plan_id, coupon_code)` | Looks up the coupon in MongoDB, checks plan applicability and `max_uses`, atomically `$inc`s `use_count`, returns the discount %. |
| `_is_admin(authorization)` | Verifies the caller is the admin (by id or stored email); raises 403 otherwise. |
| `list_plans()` `[GET /plans]` | Returns the plan catalogue (Free / Plus / Pro). |
| `get_my_plan()` `[GET /my-plan]` | Returns the user's active plan and auto-downgrades to free if expired. |
| `validate_coupon(body)` `[POST /validate-coupon]` | Previews a coupon's discount without consuming a use. |
| `list_coupons()` / `create_coupon(body)` / `delete_coupon(code)` `[GET / POST /coupons, DELETE /coupons/{code}]` | Admin coupon management. |
| `create_order(body)` `[POST /create-order]` | Applies any coupon, creates a Razorpay order (amount in paise). |
| `_build_upgrade_email_html(plan_id, plan_name, expires_at)` | Branded plan-upgrade email body. |
| `_send_upgrade_email_sync(to_email, plan_id, plan_name, expires_at)` | Sends that email over Gmail SMTP in a background thread. |
| `verify_payment(body)` `[POST /verify-payment]` | Verifies the Razorpay HMAC-SHA256 signature, writes plan, expiry (+30 days), payment id and storage limit to `users_meta`, then triggers the upgrade email. |

Request models: `CouponRequest`, `CouponResponse`, `CreateCouponRequest`, `CreateOrderRequest`, `VerifyPaymentRequest`.

---

## storage.py — storage tracking and deletion

Keeps `users_meta.storage_used_bytes` / `storage_breakdown` up to date from sizes stored in MongoDB (no Firebase calls) and exposes delete endpoints.

| Function | What it does |
|---|---|
| `_is_size(v)` | True if a value is a usable byte count. |
| `compute_breakdown(user_id)` | Sums stored sizes per category (PDFs, canvas, audio, visual); returns `None` if any file has no recorded size yet. |
| `refresh_storage_used(user_id)` | Recomputes and persists the tracked variable; never raises, so callers can fire and forget. |
| `_summary_payload(bd)` | Shapes the breakdown for the API response. |
| `get_storage_summary()` `[GET /storage/summary]` | Fast read of the tracked variable (nulls until first computed). |
| `sync_storage_sizes(body)` `[POST /storage/sync]` | One-time backfill of file sizes measured client-side from Firebase metadata. |
| `get_storage_usage()` `[GET /storage/usage]` | Lists PDFs, canvases, and all AI Studio items with sizes, and refreshes the variable. |
| `_count_nodes(node)` | Recursively counts mind-map nodes for display. |
| `delete_pdf_storage(doc_id)` `[DELETE /storage/pdf/{doc_id}]` | Deletes every `pdf_docs` row for the doc and returns the Firebase URL for client-side removal. |
| `delete_canvas_storage` / `delete_mind_map_storage` / `delete_flashcards_storage` / `delete_quiz_storage` / `delete_video_suggestions_storage` / `delete_audio_podcast_storage` / `delete_visual_podcast_storage` `[DELETE /storage/<feature>/{notebook_id}]` | Each clears that feature's field(s) from the notebook and refreshes usage. |

Request models: `_SyncItem`, `_SyncBody`.

---

## audio_podcast.py — Audio Podcast

RAG → lecture script → humanised narration → Kokoro TTS → WAV.

| Function | What it does |
|---|---|
| `_auth(authorization)` | Resolves the `user_id`. |
| `_Stripper` (`__init__`, `handle_data`, `get_text`) / `_strip_html(html)` | HTML-to-text helper (shared pattern, see conventions). |
| `_fetch_summaries(user_id, notebook_id, doc_ids)` | Reads up to 10 PDF summaries (1,200 chars each, 6,000 total); returns `(text, names)`. |
| `_retrieve_chunks(user_id, doc_ids)` | Top-6 Pinecone chunks for a "summarise the whole document in detail" query. |
| `_generate_lecture_script(context, topic)` | Pass 1: long-form, markdown-free lecture (Qwen, temp 0.55). |
| `_humanise_script(lecture_script)` | Pass 2: rewrites it as warm spoken narration; falls back to pass 1 on failure. |
| `_tts(text)` | `llm.synthesize_wav()` with a 5,000-char cap. |
| `generate_audio_podcast(body)` `[POST /audio-podcast]` | Runs the full pipeline; returns `{audio_b64, script, topic, word_count}`. |
| `save_audio_podcast_url(id, body)` `[PATCH /notebooks/{id}/audio-podcast]` | Stores the Firebase URL and size. |
| `delete_audio_podcast_url(id)` `[DELETE /notebooks/{id}/audio-podcast]` | Clears them. |

Request models: `AudioPodcastRequest`, `SaveAudioPodcastUrl`.

---

## visual_podcast.py — Visual Podcast (SSE)

Theme → per-slide text → image-model slide → TTS → MP4 → Firebase.

| Function | What it does |
|---|---|
| `_auth`, `_Stripper`, `_strip_html`, `_fetch_summaries` | Auth and summary helpers (up to 5 summaries, 800 chars each, 4,000 total). |
| `_load_font(size, bold)` / `_is_truetype(font)` | Load a TrueType font with fallbacks, and detect whether the result is a real TrueType font. |
| `_wrap_text(draw, text, font, max_w)` | Word-wraps text to a pixel width. |
| `_put_text(draw, xy, text, font, fill, stroke_w, stroke_fill)` | Draws text, optionally with an outline. |
| `_render_slide_sync(heading, body, slide_num, total_slides, out_path, blank)` | Pillow render of either the blank template (reference for the image model) or a plain text slide (fallback). |
| `_tts(text)` | Narration WAV via Kokoro. |
| `_make_video_sync(clips_data, final)` | MoviePy: joins each image with its audio (min 3 s) into an MP4. |
| `_clean_llm(raw)` | Strips `<think>` blocks and fences from LLM output. |
| `_gen_body(ctx, slide_num, total, style)` | LLM writes one slide's narration paragraph. |
| `_gen_heading(body, slide_num, total)` | LLM writes a slide heading. |
| `_decide_theme(ctx, topic, style_notes)` | LLM decides one shared visual theme for the whole deck (default theme on failure). |
| `_enhance_slide(img_path, blank_path, heading, body, slide_num, total, theme, anchor)` | Image model composes the entire slide on the template following the theme; inner `_normalise` resizes to 1280×720 (letterboxed). Failures keep the Pillow version. |
| `_upload_to_firebase(mp4_bytes, user_id, notebook_id)` | Uploads the MP4 via Firebase's REST API. |
| `generate_visual_podcast(body)` `[POST /visual-podcast/generate]` | Returns an SSE stream (`progress`, `done`, `error`). Inner `event_stream()` runs the pipeline; `build_slide(n, anchor)` makes one slide (text → heading → plain slide → image edit → TTS); `progress_event` / `stage_message` produce the user-facing progress lines. Slide 1 runs alone to become the style anchor, then slides 2…N run in parallel (`VISUAL_PODCAST_PARALLEL`). |
| `save_visual_podcast_url(id, body)` `[PATCH /notebooks/{id}/visual-podcast]` | Stores URL and size. |
| `delete_visual_podcast_url(id)` `[DELETE /notebooks/{id}/visual-podcast]` | Clears them. |

Request models: `VisualPodcastRequest`, `SaveVisualPodcastUrl`.

---

## mindspeak.py — MindSpeak live voice conversation

Hands-free voice chat with Midy. One spoken turn is streamed back as Server-Sent Events so the reply starts playing before the model has finished writing it. Pipeline: Whisper → (RAG) → streamed Qwen reply → per-sentence fast TTS (`x-ai/grok-voice-tts-1.0` via OpenRouter) → save to notebook.

| Function | What it does |
|---|---|
| `_auth(authorization)` | Resolves the `user_id` through `chat.get_current_user()`. |
| `_oid(notebook_id)` | Parses a notebook id into an `ObjectId`; 400 if invalid. |
| `_sse(payload)` | Formats a dict as one `data: {json}

` SSE frame. |
| `_transcribe(audio_bytes, filename)` | Groq Whisper (`whisper-large-v3-turbo`) in a worker thread; returns the transcript. |
| `_speakable(text)` | Strips markdown, HTML, code and citation markers so the TTS voice never reads symbols aloud. |
| `_pop_sentences(buffer, first)` | Splits streamed text into finished sentences plus the unfinished tail. The first chunk is released early at a comma once long enough, so audio starts sooner. |
| `_pieces(sentence)` | Splits a very long sentence into ≤300-character pieces on word boundaries so no single TTS call runs long. |
| `_synth(text)` | One TTS clip: OpenRouter `x-ai/grok-voice-tts-1.0` (voice `eve`, about 1–2 s; override with `MINDSPEAK_TTS_MODEL` / `MINDSPEAK_TTS_VOICE`), falling back to Kokoro at 1.15× speed if it fails. |
| `_load_history(oid, user_id)` | Fetches the last 8 saved voice messages for conversational continuity (404 if the notebook is not the user's). |
| `_save_turn(oid, user_id, user_text, reply, interrupted)` | Appends the user turn and the reply to `notebooks.mindspeak_messages` (keeps the last 400); marks the reply `interrupted` if it was cut off. |
| `mindspeak_turn(audio, notebook_id, selected_pdf_ids, language)` `[POST /mindspeak/turn]` | Validates the upload (≤10 MB) and returns the SSE stream. Inner `event_stream()` runs two cooperating tasks: `producer()` transcribes, retrieves RAG context, streams the LLM and queues each completed sentence for TTS (inner `queue_sentence`); `tts_worker()` returns the WAV clips strictly in order while later sentences are still rendering. `save_turn_once()` guarantees the turn is stored exactly once, including when the client presses Stop or disconnects (tasks are cancelled, the partial reply is kept). Events: `transcript`, `token`, `audio`, `tts_error` (voice failed, text continues), `done`, `error`. |
| `get_mindspeak(notebook_id)` `[GET /notebooks/{id}/mindspeak]` | Returns the saved voice conversation. |
| `delete_mindspeak(notebook_id)` `[DELETE /notebooks/{id}/mindspeak]` | Clears it. |

Frontend counterpart: `frontend/src/MindSpeakModal.jsx` (transparent overlay on the app's own background, orb that rises from the collapsed sidebars and chat bar, voice-activity detection, gapless playback, Stop button).

---

## mindmap.py — Mind Map

Builds the interactive mind map tree from the selected PDFs and saves it on the notebook. Pipeline: RAG retrieval → Qwen → JSON tree. Rendered by `frontend/src/MindMapModal.jsx` (d3-hierarchy). Clearing a map lives in `storage.py` (`DELETE /storage/mind-map/{notebook_id}`).

| Function | What it does |
|---|---|
| `_auth(authorization)` | Resolves the `user_id` through `chat.get_current_user()`. |
| `_build_user_prompt(rag_context)` | The instruction prompt: root plus 4–7 branches, 2–5 sub-nodes each, optional leaves, 30–60 nodes, short labels, strict JSON shape. |
| `_parse_tree(original)` | Extracts the JSON tree from the model reply: strips `<think>` blocks and markdown fences, takes the outermost `{...}` (searching inside `<think>` as a last resort), and loads it. |
| `generate_mind_map(body)` `[POST /mind-map]` | 400 if no PDFs are selected; retrieves the top-5 chunks with a broad topic-extraction query (`MINDMAP_QUERY`); 422 if nothing is retrieved; asks Qwen (temperature 0.3, 4,096 tokens) and returns `{ tree }`. |
| `save_mind_map_data(id, body)` `[PATCH /notebooks/{id}/mind-map]` | Stores the tree as `mind_map_data` on the notebook. |

Request models: `MindMapRequest`, `MindMapDataUpdate`.

---

## flashcards.py — Flashcards

| Function | What it does |
|---|---|
| `_get_current_user(authorization)` | Resolves the user. |
| `_Stripper` / `_strip_html` | HTML-to-text helper. |
| `_fetch_summaries(user_id, notebook_id, doc_ids)` | PDF summaries as plain text (800 chars/doc, 3,000 total). |
| `_retrieve_chunks(user_id, doc_ids, top_k)` | Top-k Pinecone chunks for a "key concepts" query. |
| `_generate_cards(context, num_cards)` | LLM returns a strict JSON array of `{question, answer}`; `<think>` and fences are stripped, entries validated. |
| `generate_flashcards(body)` `[POST /flashcards]` | Merges chunks and summaries (4,000 chars), 422 if empty, returns `{cards, topic, num_cards}` (default 10, max 20). |

Request model: `FlashcardsRequest`.

---

## quiz.py — Quiz Mode

| Function | What it does |
|---|---|
| `_get_current_user`, `_Stripper`, `_strip_html`, `_fetch_summaries`, `_retrieve_chunks` | Same helpers as flashcards. |
| `_clean_llm(raw)` | Removes `<think>` blocks and markdown fences before JSON parsing. |
| `_generate_questions(context, num_q, difficulty)` | LLM writes `{question, context, hint}` items; the system prompt changes with difficulty (easy recall, medium application, hard analysis). |
| `_evaluate_answer(question, correct_context, user_answer, difficulty)` | LLM grades an answer and returns `{score (0–10), strengths, weaknesses, model_answer}`. |
| `generate_quiz(body)` `[POST /quiz/generate]` | Builds context (4,500 chars), generates 1–10 questions. |
| `evaluate_answer(body)` `[POST /quiz/evaluate]` | Grades a single typed or spoken answer. |

Request models: `QuizRequest`, `EvaluateRequest`.

---

## video_suggestions.py — Video Suggestions

| Function | What it does |
|---|---|
| `_get_current_user`, `_Stripper`, `_strip_html` | Auth and HTML helpers. |
| `_fetch_pdf_summaries(user_id, notebook_id, doc_ids)` | Plain-text PDF summaries and doc names; 422 later if none exist. |
| `_generate_keyword_queries(doc_context)` | LLM produces exactly four YouTube search queries (overview, deep-dive, tutorial, latest research). |
| `_search_videos_serper(query, num)` | Calls Serper.dev `/videos` for one query. |
| `get_video_suggestions(body)` `[POST /video-suggestions]` | Runs the four searches in parallel, de-duplicates by `video_id`, caps at `max_videos` (default 12, max 20). |

Request model: `VideoSuggestionsRequest`.

---

## support_chat.py — landing-page support bot

| Function | What it does |
|---|---|
| `warm_up()` | Makes a minimal OpenRouter call at startup to open the TCP/TLS connection. |
| `support_chat_warm()` `[GET /support-chat/warm]` | Same warm-up on demand from the frontend. |
| `support_chat(body)` `[POST /support-chat]` | Answers product questions using only `features.txt` as its system prompt; keeps the last 6 messages, non-streaming, 400-token cap. |

Request models: `SupportMessage`, `SupportRequest`.
