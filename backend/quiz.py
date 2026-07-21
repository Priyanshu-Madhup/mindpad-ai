"""
quiz.py
-------
FastAPI router — Quiz AI Studio feature.

Pipeline (generation):
  1. Auth — Clerk JWT via get_current_user().
  2. Fetch HTML summaries from MongoDB pdf_docs (same helper as flashcards.py).
  3. Retrieve top-5 Pinecone chunks for broad topic query.
  4. Combine summaries + chunks → rich context.
  5. Fail-fast HTTP 422 if context is empty.
  6. GPT-OSS-20B generates N questions (difficulty-aware) as strict JSON array.
  7. Return { questions, topic, num_questions, difficulty }.

Pipeline (evaluation):
  1. Auth — Clerk JWT.
  2. Receive { question, correct_context, user_answer, difficulty }.
  3. GPT-OSS-20B evaluates the answer → { score, strengths, weaknesses, model_answer }.
  4. Return the evaluation JSON.
"""

import os
import re as _re
import json as _json
from html.parser import HTMLParser
from typing import List, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from groq import AsyncGroq
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# ── Clients ───────────────────────────────────────────────────────────────────
_groq = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY", ""))

# ── MongoDB ───────────────────────────────────────────────────────────────────
_mongo = AsyncIOMotorClient(os.environ.get("MONGODB_URI"))
_db = _mongo["mindpad_ai"]
_pdf_docs_col = _db["pdf_docs"]


# ── Request / response models ─────────────────────────────────────────────────
class QuizRequest(BaseModel):
    notebook_id: str
    selected_pdf_ids: Optional[List[str]] = []
    num_questions: int = 5       # 1–10
    difficulty: str = "medium"   # "easy" | "medium" | "hard"


class EvaluateRequest(BaseModel):
    question: str
    correct_context: str          # the context chunk that the question is based on
    user_answer: str
    difficulty: str = "medium"


# ── Auth proxy ────────────────────────────────────────────────────────────────
async def _get_current_user(authorization: Optional[str]):
    from chat import get_current_user
    return await get_current_user(authorization)


# ── HTML stripper ─────────────────────────────────────────────────────────────
class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: List[str] = []

    def handle_data(self, data: str):
        t = data.strip()
        if t:
            self._parts.append(t)

    def get_text(self) -> str:
        return " ".join(self._parts)


def _strip_html(html: str) -> str:
    s = _Stripper()
    s.feed(html)
    return s.get_text()


# ── Fetch PDF summaries from MongoDB ─────────────────────────────────────────
async def _fetch_summaries(
    user_id: str, notebook_id: str, doc_ids: List[str]
) -> Tuple[str, List[str]]:
    if doc_ids:
        query: dict = {"doc_id": {"$in": doc_ids}}
    else:
        query = {"user_id": user_id, "notebook_id": notebook_id}

    docs = await _pdf_docs_col.find(
        query, {"_id": 0, "name": 1, "summary": 1}
    ).limit(10).to_list(10)

    parts: List[str] = []
    names: List[str] = []
    for doc in docs:
        name = doc.get("name", "Document")
        raw = doc.get("summary", "")
        if not raw:
            continue
        plain = _strip_html(raw)[:800]
        if plain:
            parts.append(f"[{name}]: {plain}")
            names.append(name)

    return "\n\n".join(parts)[:3000], names


# ── Retrieve top-N Pinecone chunks ────────────────────────────────────────────
async def _retrieve_chunks(user_id: str, doc_ids: List[str], top_k: int = 5) -> str:
    if not doc_ids:
        return ""
    try:
        from rag import retrieve_rag_context
        context, _ = await retrieve_rag_context(
            query="important topics concepts definitions principles facts",
            user_id=user_id,
            doc_ids=doc_ids,
            top_k=top_k,
        )
        return context
    except Exception as exc:
        print(f"[Quiz] Pinecone retrieval failed: {exc}")
        return ""


# ── Clean LLM output ──────────────────────────────────────────────────────────
def _clean_llm(raw: str) -> str:
    raw = _re.sub(r"<think>.*?</think>", "", raw, flags=_re.DOTALL).strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return raw


# ── Difficulty descriptors ────────────────────────────────────────────────────
_DIFF_DESC = {
    "easy": (
        "factual recall, straightforward definitions, and basic comprehension. "
        "Questions should have short, direct answers."
    ),
    "medium": (
        "application, comparison, and explanation. "
        "Questions should require understanding of concepts, not just memorisation."
    ),
    "hard": (
        "deep analysis, synthesis, critical thinking, and multi-step reasoning. "
        "Questions should challenge the student to connect concepts and evaluate trade-offs."
    ),
}


# ── Generate quiz questions via LLM ──────────────────────────────────────────
async def _generate_questions(context: str, num_q: int, difficulty: str) -> List[dict]:
    diff_desc = _DIFF_DESC.get(difficulty, _DIFF_DESC["medium"])
    system_prompt = (
        "You are an expert academic examiner creating quiz questions. "
        "Respond ONLY with a valid JSON array — no markdown fences, no explanation. "
        f"Produce exactly {num_q} objects. Each object has:\n"
        '  "question": string — the question text\n'
        '  "context":  string — a 1-3 sentence excerpt from the document that '
        "contains the answer (used for evaluation later; do NOT reveal to the student)\n"
        '  "hint":     string — a subtle one-line hint (no direct answer)\n\n'
        f"Difficulty level: {difficulty.upper()} — questions should focus on {diff_desc}\n"
        'Example: [{"question": "What is X?", "context": "X is Y because Z.", "hint": "Think about the relationship between X and Z."}]'
    )
    user_prompt = (
        f"Based on the following research document content, generate exactly {num_q} "
        f"{difficulty}-difficulty quiz questions.\n\n"
        "DOCUMENT CONTENT:\n" + context
    )

    completion = await _groq.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.4,
        max_tokens=3000,
    )

    raw = (completion.choices[0].message.content or "").strip()
    raw = _clean_llm(raw)

    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("LLM did not return a JSON array")

    questions = _json.loads(raw[start: end + 1])
    if not isinstance(questions, list):
        raise ValueError("Parsed result is not a list")

    valid = [
        q for q in questions
        if isinstance(q, dict)
        and isinstance(q.get("question"), str) and q["question"].strip()
        and isinstance(q.get("context"), str) and q["context"].strip()
    ]
    # Ensure hint exists
    for q in valid:
        if not isinstance(q.get("hint"), str) or not q["hint"].strip():
            q["hint"] = "Think carefully about the key concept being asked."

    return valid[:num_q]


# ── Evaluate a user answer via LLM ───────────────────────────────────────────
async def _evaluate_answer(
    question: str, correct_context: str, user_answer: str, difficulty: str
) -> dict:
    diff_desc = _DIFF_DESC.get(difficulty, _DIFF_DESC["medium"])

    system_prompt = (
        "You are a strict but fair academic evaluator. "
        "Given a question, the correct source context, and a student's answer, "
        "evaluate the answer and respond ONLY with a valid JSON object (no markdown fences):\n"
        '{\n'
        '  "score": <integer 0-10>,\n'
        '  "strengths": <string — what the student got right, or "None" if score is 0>,\n'
        '  "weaknesses": <string — specific gaps or errors, or "None" if score is 10>,\n'
        '  "model_answer": <string — a concise ideal answer (2-4 sentences)>\n'
        '}\n\n'
        f"Difficulty level: {difficulty.upper()} — {diff_desc}\n"
        "Scoring guide:\n"
        "  10 = perfect, complete answer\n"
        "  7-9 = mostly correct with minor omissions\n"
        "  4-6 = partially correct\n"
        "  1-3 = minimal understanding shown\n"
        "  0 = completely wrong or blank\n"
        "Be specific in strengths/weaknesses — name exact concepts."
    )
    user_prompt = (
        f"QUESTION: {question}\n\n"
        f"SOURCE CONTEXT (not shown to student): {correct_context}\n\n"
        f"STUDENT ANSWER: {user_answer or '(no answer provided)'}\n\n"
        "Evaluate the student's answer against the source context."
    )

    completion = await _groq.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=600,
    )

    raw = (completion.choices[0].message.content or "").strip()
    raw = _clean_llm(raw)

    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("LLM did not return a JSON object")

    result = _json.loads(raw[start: end + 1])

    # Sanitise
    score = int(result.get("score", 0))
    score = max(0, min(10, score))

    return {
        "score": score,
        "strengths": str(result.get("strengths", "")).strip() or "None provided.",
        "weaknesses": str(result.get("weaknesses", "")).strip() or "None provided.",
        "model_answer": str(result.get("model_answer", "")).strip(),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/quiz/generate")
async def generate_quiz(
    body: QuizRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate quiz questions from the stored PDF summaries + Pinecone chunks
    for the selected documents in the given notebook.
    """
    user_id, _ = await _get_current_user(authorization)

    num_q = max(1, min(body.num_questions, 10))
    difficulty = body.difficulty if body.difficulty in ("easy", "medium", "hard") else "medium"
    doc_ids = [d for d in (body.selected_pdf_ids or []) if d]

    # 1. Fetch MongoDB summaries
    summary_ctx, doc_names = await _fetch_summaries(user_id, body.notebook_id, doc_ids)

    # 2. Retrieve Pinecone chunks
    chunk_ctx = await _retrieve_chunks(user_id, doc_ids, top_k=5) if doc_ids else ""

    # 3. Combine — chunks first (most specific), then summaries
    combined = "\n\n".join(filter(None, [chunk_ctx, summary_ctx]))[:4500]

    if not combined.strip():
        raise HTTPException(
            status_code=422,
            detail="No document content found. Please select indexed PDFs and try again.",
        )

    topic = doc_names[0] if doc_names else "Research Document"
    print(f"[Quiz] {len(combined)} chars of context from: {doc_names}, {num_q} Qs, {difficulty}")

    # 4. Generate questions
    try:
        questions = await _generate_questions(combined, num_q, difficulty)
    except Exception as exc:
        print(f"[Quiz] LLM error: {exc}")
        raise HTTPException(status_code=500, detail=f"Question generation failed: {exc}")

    if not questions:
        raise HTTPException(status_code=500, detail="LLM returned no valid questions.")

    print(f"[Quiz] Generated {len(questions)} questions for '{topic}'")

    return {
        "questions": questions,
        "topic": topic,
        "num_questions": len(questions),
        "difficulty": difficulty,
    }


@router.post("/quiz/evaluate")
async def evaluate_answer(
    body: EvaluateRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Evaluate a student's typed answer against the source context.
    Returns { score, strengths, weaknesses, model_answer }.
    """
    await _get_current_user(authorization)  # auth check

    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if not body.correct_context.strip():
        raise HTTPException(status_code=400, detail="Context cannot be empty.")

    difficulty = body.difficulty if body.difficulty in ("easy", "medium", "hard") else "medium"

    try:
        result = await _evaluate_answer(
            body.question,
            body.correct_context,
            body.user_answer,
            difficulty,
        )
    except Exception as exc:
        print(f"[Quiz] Evaluation error: {exc}")
        raise HTTPException(status_code=500, detail=f"Answer evaluation failed: {exc}")

    return result
