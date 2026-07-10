/**
 * FlashcardsModal — AI-generated flashcard viewer with 3D flip animation.
 *
 * Props:
 *   topic     {string}  — Document name / topic label
 *   cards     {Array}   — [{ question, answer }, ...]
 *   loading   {boolean} — True while generating
 *   onClose   {function}
 *   onRefresh {function}
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Layers, RefreshCw, ChevronLeft, ChevronRight,
  RotateCcw, Eye, EyeOff, Maximize2,
} from 'lucide-react';

// ─── FlipCard ─────────────────────────────────────────────────────────────────
function FlipCard({ card, index, isFlipped, onClick, isCurrent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.34, 1.1, 0.64, 1], delay: Math.min(index * 0.03, 0.3) }}
      className="w-full"
      style={{ perspective: '1200px' }}
    >
      {/* Card shell — fixed aspect ratio so flipping stays proportional */}
      <div
        onClick={onClick}
        className={`relative w-full cursor-pointer select-none`}
        style={{ minHeight: '220px' }}
      >
        {/* Inner rotating layer */}
        <motion.div
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformStyle: 'preserve-3d', width: '100%', height: '100%', minHeight: '220px', position: 'relative' }}
        >
          {/* FRONT — Question */}
          <div
            className={`absolute inset-0 rounded-2xl border-2 flex flex-col items-center justify-center p-6 text-center
              ${isCurrent
                ? 'border-primary bg-gradient-to-br from-[#0D1B2A] to-[#163552] shadow-xl shadow-primary/20'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm'}
              `}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className={`text-[9px] font-bold uppercase tracking-widest mb-3 ${isCurrent ? 'text-primary/60' : 'text-slate-400'}`}>
              Question
            </div>
            <p className={`text-[15px] font-semibold leading-snug ${isCurrent ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
              {card.question}
            </p>
            <div className={`mt-4 flex items-center gap-1.5 text-[10px] font-medium ${isCurrent ? 'text-primary/50' : 'text-slate-400'}`}>
              <Eye className="w-3 h-3" />
              Tap to reveal answer
            </div>
          </div>

          {/* BACK — Answer */}
          <div
            className="absolute inset-0 rounded-2xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-950/90 to-teal-900/80 dark:from-emerald-900/80 dark:to-teal-800/70 flex flex-col items-center justify-center p-6 text-center shadow-xl"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="text-[9px] font-bold uppercase tracking-widest mb-3 text-emerald-400/70">
              Answer
            </div>
            <p className="text-[14px] leading-relaxed text-emerald-50 font-medium">
              {card.answer}
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function CardSkeleton({ i }) {
  return (
    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 animate-pulse"
      style={{ minHeight: '220px' }}>
      <div className="flex flex-col items-center gap-3 h-full justify-center">
        <div className="h-2.5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
        <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="h-3 w-24 bg-slate-100 dark:bg-slate-750 rounded-full mt-2" />
      </div>
    </div>
  );
}

// ─── FlashcardsModal ──────────────────────────────────────────────────────────
export default function FlashcardsModal({ topic, cards = [], loading = false, onClose, onRefresh }) {
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState({});         // { [index]: true }
  const [revealAll, setRevealAll] = useState(false);
  const [viewMode, setViewMode] = useState('single'); // 'single' | 'grid'

  // Reset state when cards change (new generation)
  useEffect(() => {
    setCurrent(0);
    setFlipped({});
    setRevealAll(false);
  }, [cards]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose?.();
      if (e.key === ' ') { e.preventDefault(); toggleFlip(current); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, flipped]);

  const toggleFlip = useCallback((idx) => {
    setFlipped(prev => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const next = () => {
    if (current < cards.length - 1) setCurrent(c => c + 1);
  };
  const prev = () => {
    if (current > 0) setCurrent(c => c - 1);
  };

  const toggleRevealAll = () => {
    if (revealAll) {
      setFlipped({});
      setRevealAll(false);
    } else {
      const all = {};
      cards.forEach((_, i) => { all[i] = true; });
      setFlipped(all);
      setRevealAll(true);
    }
  };

  const seenCount = Object.keys(flipped).filter(k => flipped[k]).length;
  const progress = cards.length > 0 ? (seenCount / cards.length) * 100 : 0;

  return (
    <AnimatePresence>
      <motion.div
        key="flashcards-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[290] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.25, ease: [0.34, 1.1, 0.64, 1] }}
          className="relative bg-slate-50 dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
          style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80">
            <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
              <Layers className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">Flashcards</h2>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                Based on: &ldquo;{topic}&rdquo;
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {/* View toggle */}
              <button
                onClick={() => setViewMode(v => v === 'single' ? 'grid' : 'single')}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                title={viewMode === 'single' ? 'Grid view' : 'Single view'}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              {/* Refresh */}
              <button
                onClick={onRefresh}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                title="Regenerate"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {/* Close */}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Progress bar ── */}
          {!loading && cards.length > 0 && (
            <div className="h-1 bg-slate-200 dark:bg-slate-700">
              <motion.div
                className="h-full bg-emerald-500"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          )}

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <CardSkeleton key={i} i={i} />)}
              </div>
            )}

            {/* Empty state */}
            {!loading && cards.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Layers className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No cards generated</p>
                <p className="text-xs text-slate-400 text-center max-w-xs">
                  Make sure at least one indexed PDF is selected, then try again.
                </p>
                <button
                  onClick={onRefresh}
                  className="mt-1 px-4 py-2 bg-[#0D1B2A] text-white text-xs font-bold rounded-full hover:bg-[#163552] transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Single card view */}
            {!loading && cards.length > 0 && viewMode === 'single' && (
              <div className="flex flex-col gap-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={current}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.18, ease: 'easeInOut' }}
                  >
                    <FlipCard
                      card={cards[current]}
                      index={current}
                      isFlipped={!!(flipped[current] || revealAll)}
                      onClick={() => toggleFlip(current)}
                      isCurrent
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            {/* Grid view */}
            {!loading && cards.length > 0 && viewMode === 'grid' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {cards.map((card, i) => (
                  <FlipCard
                    key={i}
                    card={card}
                    index={i}
                    isFlipped={!!(flipped[i] || revealAll)}
                    onClick={() => toggleFlip(i)}
                    isCurrent={false}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          {!loading && cards.length > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex items-center justify-between gap-3">
              {/* Prev / counter / Next */}
              <div className="flex items-center gap-2">
                <button
                  onClick={prev}
                  disabled={viewMode === 'grid' || current === 0}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors text-slate-600 dark:text-slate-300"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 min-w-[52px] text-center">
                  {viewMode === 'grid' ? `${cards.length} cards` : `${current + 1} / ${cards.length}`}
                </span>

                <button
                  onClick={next}
                  disabled={viewMode === 'grid' || current === cards.length - 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors text-slate-600 dark:text-slate-300"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Progress label */}
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {seenCount} / {cards.length} revealed
              </span>

              {/* Reveal all / Reset */}
              <button
                onClick={toggleRevealAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors"
              >
                {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {revealAll ? 'Hide All' : 'Reveal All'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
