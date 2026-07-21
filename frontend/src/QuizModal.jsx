/**
 * QuizModal.jsx — AI Quiz feature for Mindpad AI
 *
 * Phase 1 — Settings: shown when no questions exist yet.
 * Phase 2 — Quiz: one question at a time. Resumes from saved state.
 * Phase 3 — Results: shown when all questions are answered.
 *
 * No loading phase — generation is shown in the sidebar result card.
 * State (answers, evaluations, progress) is persisted to MongoDB on every answer.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, HelpCircle, ChevronRight, ChevronLeft, Loader2,
  CheckCircle2, Lightbulb, RefreshCw,
  Trophy, Target, TrendingUp, TrendingDown,
  BarChart3, BookOpen, Sparkles, ChevronDown,
  Mic, MicOff, Trash2,
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// ── Difficulty config ─────────────────────────────────────────────────────────
const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   desc: 'Definitions & basic recall' },
  { id: 'medium', label: 'Medium', desc: 'Application & explanation' },
  { id: 'hard',   label: 'Hard',   desc: 'Analysis & critical thinking' },
];

// ── Score helpers ─────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 8) return 'text-emerald-500';
  if (score >= 5) return 'text-amber-500';
  return 'text-rose-500';
}
function scoreBorder(score) {
  if (score >= 8) return 'border-emerald-200 dark:border-emerald-800';
  if (score >= 5) return 'border-amber-200 dark:border-amber-800';
  return 'border-rose-200 dark:border-rose-800';
}
function scoreLabel(score) {
  if (score >= 8) return 'Excellent';
  if (score >= 5) return 'Good effort';
  return 'Keep studying';
}

// ── Animated score ring ───────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const dash = (score / 10) * circ;
  const color = score >= 8 ? '#10b981' : score >= 5 ? '#f59e0b' : '#f43f5e';
  return (
    <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="5"
          className="stroke-slate-100 dark:stroke-slate-700" />
        <motion.circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="5"
          strokeLinecap="round" stroke={color}
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${dash} ${circ}` }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
        />
      </svg>
      <div className="flex flex-col items-center leading-none">
        <span className={`text-xl font-black ${scoreColor(score)}`}>{score}</span>
        <span className="text-[9px] font-semibold text-slate-400 tracking-wide mt-0.5">/10</span>
      </div>
    </div>
  );
}

// ── Settings (Phase 1) ────────────────────────────────────────────────────────
function QuizSettings({ onClose, onConfirm }) {
  const [numQ, setNumQ] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const diff = DIFFICULTIES.find(d => d.id === difficulty);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.22, ease: [0.34, 1.06, 0.64, 1] }}
      className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
      style={{ width: '100%', maxWidth: '420px' }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
          <HelpCircle className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Quiz Mode</h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Configure your quiz session</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        {/* Difficulty */}
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-3">
            Difficulty
          </p>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map(d => (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id)}
                className={`flex flex-col items-start gap-1 px-4 py-3.5 rounded-2xl border-2 transition-all text-left ${
                  difficulty === d.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
                }`}
              >
                <span className="text-[11px] font-bold">{d.label}</span>
                <span className="text-[9px] leading-tight opacity-60">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Number of questions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">
              Number of Questions
            </p>
            <span className="text-sm font-black text-slate-800 dark:text-slate-100">{numQ}</span>
          </div>
          <input
            type="range" min={1} max={10} value={numQ}
            onChange={e => setNumQ(Number(e.target.value))}
            className="w-full accent-primary h-1.5 rounded-full appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700"
          />
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-slate-400">1</span>
            <span className="text-[10px] text-slate-400">10</span>
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div>
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              {numQ} {diff?.label} question{numQ !== 1 ? 's' : ''}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{diff?.desc}</p>
          </div>
          <Target className="w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-6">
        <button
          onClick={() => onConfirm(numQ, difficulty)}
          className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate Quiz
        </button>
      </div>
    </motion.div>
  );
}

// ── Evaluation card ───────────────────────────────────────────────────────────
function EvaluationCard({ evaluation, onNext, isLast, showModelAnswer, onToggleModel }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.34, 1.06, 0.64, 1] }}
      className="space-y-3"
    >
      {/* Score */}
      <div className={`flex items-center gap-4 p-4 rounded-2xl border bg-white dark:bg-slate-800 ${scoreBorder(evaluation.score)}`}>
        <ScoreRing score={evaluation.score} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-1">Score</p>
          <p className={`text-2xl font-black ${scoreColor(evaluation.score)}`}>
            {evaluation.score}<span className="text-sm font-semibold text-slate-400 ml-0.5">/10</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            {scoreLabel(evaluation.score)}
          </p>
        </div>
      </div>

      {/* Strengths */}
      {evaluation.strengths && !['None', 'None provided.'].includes(evaluation.strengths) && (
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Strengths</p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{evaluation.strengths}</p>
        </div>
      )}

      {/* Weaknesses */}
      {evaluation.weaknesses && !['None', 'None provided.'].includes(evaluation.weaknesses) && (
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Areas to Improve</p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{evaluation.weaknesses}</p>
        </div>
      )}

      {/* Model answer toggle */}
      <button
        onClick={onToggleModel}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Model Answer</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${showModelAnswer ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {showModelAnswer && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {evaluation.model_answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={onNext}
        className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
      >
        {isLast
          ? <><Trophy className="w-3.5 h-3.5" /> See Results</>
          : <><ChevronRight className="w-3.5 h-3.5" /> Next Question</>
        }
      </button>
    </motion.div>
  );
}

// ── Results (Phase 3) ─────────────────────────────────────────────────────────
function ResultsSummary({ evaluations, questions, onClose, onRestart }) {
  const total = evaluations.length;
  const avg = total > 0 ? Math.round(evaluations.reduce((s, e) => s + e.score, 0) / total) : 0;
  const excellent = evaluations.filter(e => e.score >= 8).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.34, 1.06, 0.64, 1] }}
      className="space-y-4"
    >
      {/* Trophy */}
      <div className="flex flex-col items-center gap-3 py-2">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.1 }}
          className="w-16 h-16 rounded-full bg-slate-900 dark:bg-white flex items-center justify-center shadow-xl"
        >
          <Trophy className="w-8 h-8 text-white dark:text-slate-900" />
        </motion.div>
        <div className="text-center">
          <p className="text-base font-black text-slate-800 dark:text-slate-100">
            {avg >= 8 ? 'Outstanding!' : avg >= 5 ? 'Well Done!' : 'Keep Practising!'}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Quiz complete</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Avg Score', value: `${avg}/10`, color: scoreColor(avg) },
          { label: 'Questions', value: total, color: 'text-slate-700 dark:text-slate-200' },
          { label: 'Excellent', value: excellent, color: 'text-emerald-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center gap-1 px-2 py-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className={`text-base font-black ${color}`}>{value}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Per-question breakdown */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Breakdown</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {evaluations.map((ev, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[10px] font-bold text-slate-400 w-5 shrink-0">Q{i + 1}</span>
              <p className="flex-1 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                {questions[i]?.question || '—'}
              </p>
              <span className={`text-xs font-black shrink-0 ${scoreColor(ev.score)}`}>{ev.score}/10</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2.5">
        <button
          onClick={onRestart}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          New Quiz
        </button>
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-all shadow-md"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Done
        </button>
      </div>
    </motion.div>
  );
}

// ── Main QuizModal ─────────────────────────────────────────────────────────────
export default function QuizModal({
  open,
  onClose,
  onConfirm,
  questions = [],
  topic = '',
  difficulty = 'medium',
  savedEvaluations = [],
  savedCurrentQ = 0,
  loading = false,
  getToken,
  onEvaluationSave,
  onDelete,
}) {
  // Compute initial phase from saved state
  const getInitialPhase = () => {
    if (!questions.length) return 'settings';
    if (savedEvaluations.length >= questions.length) return 'results';
    return 'quiz';
  };

  const [phase, setPhase] = useState('settings');
  const [currentQ, setCurrentQ] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluations, setEvaluations] = useState([]);
  const [showModelAnswer, setShowModelAnswer] = useState(false);
  const [currentDifficulty, setCurrentDifficulty] = useState(difficulty);
  const textareaRef = useRef(null);

  // Voice recording state (mirrors main chat bar — Whisper transcription)
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/transcribe`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            if (data.text) setUserAnswer(prev => prev ? `${prev} ${data.text}` : data.text);
          }
        } catch (err) {
          console.error('[Quiz STT]', err);
        } finally {
          setIsTranscribing(false);
        }
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('[Quiz Mic]', err);
      alert('Microphone access denied. Please allow microphone in your browser settings.');
    }
  };

  // Stop recording when modal closes
  useEffect(() => {
    if (!open && isRecording) mediaRecorderRef.current?.stop();
  }, [open, isRecording]);

  // Re-initialise phase/state every time the modal opens
  useEffect(() => {
    if (open) {
      const initialPhase = getInitialPhase();
      setPhase(initialPhase);
      setEvaluations([...savedEvaluations]);
      const startQ = initialPhase === 'quiz' ? savedEvaluations.length : 0;
      setCurrentQ(startQ);
      setUserAnswer('');
      setShowHint(false);
      setShowModelAnswer(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { setCurrentDifficulty(difficulty); }, [difficulty]);

  // Focus textarea when entering quiz
  useEffect(() => {
    if (phase === 'quiz' && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [phase, currentQ]);

  const handleConfirm = (numQ, diff) => {
    setCurrentDifficulty(diff);
    onConfirm(numQ, diff); // App.jsx closes modal + starts generation
  };

  const handleSubmitAnswer = async () => {
    if (isEvaluating) return;
    const q = questions[currentQ];
    if (!q) return;
    setIsEvaluating(true);
    setShowModelAnswer(false);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/quiz/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question: q.question,
          correct_context: q.context,
          user_answer: userAnswer,
          difficulty: currentDifficulty,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Evaluation failed');
      }
      const data = await res.json();

      // Update local + persist via parent
      setEvaluations(prev => { const next = [...prev]; next[currentQ] = data; return next; });
      onEvaluationSave?.(currentQ, data);
    } catch (err) {
      console.error('[Quiz evaluate]', err);
      alert(`Evaluation failed: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNext = () => {
    // If we're reviewing a past answered question, go forward
    if (currentQ < evaluations.length - 1) {
      setCurrentQ(q => q + 1);
      setShowHint(false);
      setShowModelAnswer(false);
      return;
    }
    // Otherwise advance to next unanswered or results
    const nextIdx = currentQ + 1;
    if (nextIdx >= questions.length) {
      setPhase('results');
    } else {
      setCurrentQ(nextIdx);
      setUserAnswer('');
      setShowHint(false);
      setShowModelAnswer(false);
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  };

  const handlePrev = () => {
    if (currentQ > 0) {
      setCurrentQ(q => q - 1);
      setShowHint(false);
      setShowModelAnswer(false);
    }
  };

  const handleRestart = () => {
    // Trigger fresh settings from parent (which will generate a new quiz)
    onClose();
    // Small delay so the close animation plays before re-opening
    setTimeout(() => {
      setPhase('settings');
      setCurrentQ(0);
      setUserAnswer('');
      setShowHint(false);
      setEvaluations([]);
      setShowModelAnswer(false);
    }, 250);
  };

  if (!open) return null;

  const diff = DIFFICULTIES.find(d => d.id === currentDifficulty);
  const q = questions[currentQ];
  const currentEval = evaluations[currentQ];
  const isAnswered = !!currentEval;
  const progress = questions.length > 0
    ? ((currentQ + (isAnswered ? 1 : 0)) / questions.length) * 100
    : 0;

  return (
    <AnimatePresence>
      <motion.div
        key="quiz-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[290] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >

        {/* ── Settings ── */}
        {phase === 'settings' && (
          <QuizSettings onClose={onClose} onConfirm={handleConfirm} />
        )}

        {/* ── Quiz ── */}
        {phase === 'quiz' && questions.length > 0 && (
          <motion.div
            key="quiz-question-panel"
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.34, 1.06, 0.64, 1] }}
            className="relative bg-slate-50 dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
            style={{ width: '100%', maxWidth: '560px', maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                <HelpCircle className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Quiz Mode</h2>
                  {diff && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {diff.label}
                    </span>
                  )}
                </div>
                {topic && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{topic}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-bold text-slate-400 mr-1">
                  {currentQ + 1} / {questions.length}
                </span>
                {/* Back arrow */}
                <button
                  onClick={handlePrev}
                  disabled={currentQ === 0}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous question"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {/* Forward arrow — navigate to next answered Q, or disabled at boundary */}
                <button
                  onClick={handleNext}
                  disabled={currentQ >= evaluations.length && !evaluations[currentQ]}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next question"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onClose}
                  className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors ml-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-[3px] bg-slate-200 dark:bg-slate-700 shrink-0">
              <motion.div
                className="h-full bg-primary"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Question card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`q-${currentQ}`}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.16, ease: 'easeInOut' }}
                  className="rounded-2xl border-2 border-primary/15 dark:border-primary/20 bg-white dark:bg-slate-800/70 p-5"
                >
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-black text-white leading-none">{currentQ + 1}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                      {q?.question}
                    </p>
                  </div>

                  {/* Hint */}
                  {!isAnswered && (
                    <div className="mt-4 pl-9">
                      {showHint ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400"
                        >
                          <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                          <span>{q?.hint}</span>
                        </motion.div>
                      ) : (
                        <button
                          onClick={() => setShowHint(true)}
                          className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors font-medium"
                        >
                          <Lightbulb className="w-3 h-3" />
                          Show hint
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Answer area */}
              {!isAnswered && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 px-1">
                    Your Answer
                  </p>
                  <textarea
                    ref={textareaRef}
                    value={userAnswer}
                    onChange={e => setUserAnswer(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isEvaluating) {
                        handleSubmitAnswer();
                      }
                    }}
                    placeholder="Type your answer here…"
                    rows={5}
                    disabled={isEvaluating}
                    className="w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-4 py-3.5 outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all disabled:opacity-50 leading-relaxed"
                  />
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] text-slate-400">Ctrl + Enter to submit</span>
                    <div className="flex items-center gap-2">
                      {/* Mic / transcribing button */}
                      <button
                        type="button"
                        onClick={toggleRecording}
                        disabled={isTranscribing || isEvaluating}
                        title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing…' : 'Speak your answer'}
                        className={`relative p-2 rounded-xl transition-all ${
                          isRecording
                            ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                            : isTranscribing
                              ? 'text-slate-400 animate-pulse'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isRecording && (
                          <span className="absolute inset-0 rounded-xl animate-ping bg-red-400/40" />
                        )}
                        {isRecording
                          ? <MicOff className="w-3.5 h-3.5" />
                          : <Mic className="w-3.5 h-3.5" />}
                      </button>
                      {/* Submit button */}
                      <button
                        onClick={handleSubmitAnswer}
                        disabled={isEvaluating || isRecording || isTranscribing || !userAnswer.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 active:scale-[0.97] transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isEvaluating ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Evaluating</>
                        ) : (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> Submit</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Evaluation */}
              {isAnswered && currentEval && (
                <EvaluationCard
                  evaluation={currentEval}
                  onNext={handleNext}
                  isLast={currentQ === questions.length - 1}
                  showModelAnswer={showModelAnswer}
                  onToggleModel={() => setShowModelAnswer(v => !v)}
                />
              )}
            </div>
          </motion.div>
        )}

        {/* ── Results ── */}
        {phase === 'results' && (
          <motion.div
            key="quiz-results-panel"
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.25, ease: [0.34, 1.06, 0.64, 1] }}
            className="relative bg-slate-50 dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
            style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4 text-slate-700 dark:text-slate-200" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Results</h2>
                {topic && <p className="text-[10px] text-slate-400 truncate">{topic}</p>}
              </div>
              <div className="flex items-center gap-1.5">
                {/* Delete quiz */}
                {onDelete && (
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this quiz? Your answers will be lost.')) onDelete();
                    }}
                    title="Delete quiz"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <ResultsSummary
                evaluations={evaluations}
                questions={questions}
                onClose={onClose}
                onRestart={handleRestart}
              />
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
