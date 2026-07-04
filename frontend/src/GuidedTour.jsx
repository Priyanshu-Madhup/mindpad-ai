/**
 * GuidedTour.jsx — First-time user onboarding tour for Mindpad AI
 * Highlights key UI zones with a spotlight, animated arrow, and tooltip card.
 * Completion is persisted to localStorage (key: 'mindpad_tour_done').
 *
 * HOW TO USE IN App.jsx:
 *  1. Import this component:  import GuidedTour from './GuidedTour.jsx';
 *  2. Render it inside the authenticated app shell:  <GuidedTour />
 *  3. Add  data-tour="<id>"  attributes to the relevant DOM nodes:
 *       data-tour="new-notebook"   → the "+ New Notebook" button
 *       data-tour="chat-input"     → the textarea / chat input bar wrapper
 *       data-tour="pdf-upload"     → the paperclip / PDF upload button
 *       data-tour="web-search"     → the globe / Web Search toggle button
 *       data-tour="deep-research"  → the microscope / Deep Research toggle
 *       data-tour="ai-studio"      → the AI Studio right-panel header
 *       data-tour="settings"       → the Settings sidebar item
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  X,
  BookOpen,
  MessageSquare,
  Paperclip,
  Globe,
  Microscope,
  Network,
  Settings,
  Sparkles,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

// ── Tour step definitions ─────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    id: 'welcome',
    icon: Sparkles,
    title: 'Welcome to Mindpad AI 👋',
    description:
      "Your AI-powered research workspace. In just a few clicks we'll walk you through the key features. Let's go!",
    position: 'center',
    arrowDir: null,
    target: null,
  },
  {
    id: 'notebooks',
    icon: BookOpen,
    title: 'Notebooks',
    description:
      'Create isolated notebooks for each research topic. Every notebook keeps its own chat history, uploaded PDFs, mind maps, and canvas — neatly separated.',
    target: '[data-tour="new-notebook"]',
    position: 'right',
    arrowDir: 'left',
    spotlightPad: 14,
  },
  {
    id: 'chat',
    icon: MessageSquare,
    title: 'Chat with Midy AI',
    description:
      'Type any question here. Midy AI responds with rich HTML — tables, code blocks, headings — and streams the answer in real-time.',
    target: '[data-tour="chat-input"]',
    position: 'top',
    arrowDir: 'down',
    spotlightPad: 16,
  },
  {
    id: 'pdf-upload',
    icon: Paperclip,
    title: 'Upload PDFs (RAG)',
    description:
      'Attach research papers or any PDF. Midy AI chunks, embeds, and semantically searches through them — answering questions directly from your documents.',
    target: '[data-tour="pdf-upload"]',
    position: 'top',
    arrowDir: 'down',
    spotlightPad: 14,
  },
  {
    id: 'web-search',
    icon: Globe,
    title: 'Web Search',
    description:
      'Enable Web Search to ground answers in real-time Google results. Toggle it in the chat bar to pull live snippets alongside your PDFs.',
    target: '[data-tour="web-search"]',
    position: 'top',
    arrowDir: 'down',
    spotlightPad: 14,
  },
  {
    id: 'deep-research',
    icon: Microscope,
    title: 'Deep Research',
    description:
      'Deep Research scrapes up to 5 live web pages, vectorises their content, and merges it with your PDFs before answering. Perfect for comprehensive literature reviews.',
    target: '[data-tour="deep-research"]',
    position: 'top',
    arrowDir: 'down',
    spotlightPad: 14,
  },
  {
    id: 'ai-studio',
    icon: Network,
    title: 'AI Studio',
    description:
      'The right panel is your AI Studio — generate interactive Mind Maps, Insight Canvas infographics, Audio Podcasts, Flashcards, and Quizzes from your notebook content.',
    target: '[data-tour="ai-studio"]',
    position: 'left',
    arrowDir: 'right',
    spotlightPad: 14,
  },
  {
    id: 'settings',
    icon: Settings,
    title: 'Settings & Preferences',
    description:
      'Use Settings (bottom-left) to toggle Research Mode, Deep Research, appearance, and Notion sync. Open Preferences to manage storage and subscription.',
    target: '[data-tour="settings"]',
    position: 'right',
    arrowDir: 'left',
    spotlightPad: 14,
  },
  {
    id: 'done',
    icon: Sparkles,
    title: "You're all set! 🎉",
    description:
      "That's everything you need. Create your first notebook, upload a PDF, and ask Midy AI anything. Happy researching!",
    position: 'center',
    arrowDir: null,
    target: null,
  },
];

const STORAGE_KEY = 'mindpad_tour_done';

// ── Helper: get bounding rect of a CSS-selector element ───────────────────────
function getRect(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  return el ? el.getBoundingClientRect() : null;
}

// ── SVG Spotlight ─────────────────────────────────────────────────────────────
function Spotlight({ rect, pad = 14 }) {
  if (!rect) return null;
  const x = rect.left - pad;
  const y = rect.top - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  const r = 12;

  return (
    <svg
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9998,
      }}
    >
      <defs>
        <mask id="tour-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
        </mask>
      </defs>
      {/* Dimming overlay */}
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.58)"
        mask="url(#tour-mask)"
      />
      {/* Highlight ring */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        ry={r}
        fill="none"
        stroke="#0D1B2A"
        strokeWidth="2.5"
        opacity="0.75"
      />
    </svg>
  );
}

// ── Animated bounce arrow ─────────────────────────────────────────────────────
function BounceArrow({ direction, style }) {
  const rotMap = { right: 0, down: 90, left: 180, up: 270 };
  const deg = rotMap[direction] ?? 0;
  const animProps =
    direction === 'left' || direction === 'right'
      ? { x: direction === 'right' ? [0, 8, 0] : [0, -8, 0] }
      : { y: direction === 'down' ? [0, 8, 0] : [0, -8, 0] };

  return (
    <motion.div
      style={{ position: 'fixed', zIndex: 9999, ...style }}
      animate={animProps}
      transition={{ duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#0D1B2A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(13,27,42,0.35)',
          transform: `rotate(${deg}deg)`,
        }}
      >
        <ChevronRight size={20} color="#fff" />
      </div>
    </motion.div>
  );
}

// ── Arrow position calculator ─────────────────────────────────────────────────
function calcArrowStyle(direction, rect) {
  if (!rect || !direction) return null;
  const gap = 10;
  switch (direction) {
    case 'left':
      return { left: rect.left - 54, top: rect.top + rect.height / 2 - 20 };
    case 'right':
      return { left: rect.right + gap, top: rect.top + rect.height / 2 - 20 };
    case 'down':
      return { left: rect.left + rect.width / 2 - 20, top: rect.top - 54 };
    case 'up':
      return { left: rect.left + rect.width / 2 - 20, top: rect.bottom + gap };
    default:
      return null;
  }
}

// ── Card position calculator ──────────────────────────────────────────────────
const CARD_W = 336;

function calcCardStyle(position, rect) {
  if (position === 'center' || !rect) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 24;

  switch (position) {
    case 'right':
      return {
        left: Math.min(rect.right + gap, vw - CARD_W - 16),
        top: Math.max(8, Math.min(rect.top + rect.height / 2 - 130, vh - 320)),
      };
    case 'left':
      return {
        left: Math.max(16, rect.left - CARD_W - gap),
        top: Math.max(8, Math.min(rect.top + rect.height / 2 - 130, vh - 320)),
      };
    case 'bottom':
      return {
        left: Math.min(Math.max(16, rect.left + rect.width / 2 - CARD_W / 2), vw - CARD_W - 16),
        top: Math.min(rect.bottom + gap, vh - 300),
      };
    case 'top':
      return {
        left: Math.min(Math.max(16, rect.left + rect.width / 2 - CARD_W / 2), vw - CARD_W - 16),
        top: Math.max(8, rect.top - 280 - gap),
      };
    default:
      return null;
  }
}

// ── Tooltip card ──────────────────────────────────────────────────────────────
function TooltipCard({ step, stepIndex, total, rect, onNext, onPrev, onSkip }) {
  const Icon = step.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;
  const isCentered = step.position === 'center';

  const cardPos = isCentered
    ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
    : calcCardStyle(step.position, rect) || {};

  const arrowPos = calcArrowStyle(step.arrowDir, rect);

  return (
    <>
      {/* Bounce arrow */}
      {arrowPos && step.arrowDir && (
        <BounceArrow direction={step.arrowDir} style={arrowPos} />
      )}

      {/* Card */}
      <motion.div
        key={step.id}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 6 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'fixed',
          zIndex: 10000,
          width: CARD_W,
          ...cardPos,
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow:
              '0 24px 64px -12px rgba(13,27,42,0.22), 0 4px 16px -4px rgba(13,27,42,0.1)',
            border: '1px solid rgba(13,27,42,0.07)',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: '#0D1B2A',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={18} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#fff',
                  fontFamily: 'Manrope, Inter, sans-serif',
                  lineHeight: 1.3,
                }}
              >
                {step.title}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.45)',
                  fontFamily: 'Inter, sans-serif',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Step {stepIndex + 1} of {total}
              </p>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '18px 20px 20px' }}>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                color: '#334155',
                lineHeight: 1.65,
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {step.description}
            </p>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 5, marginTop: 18, marginBottom: 16 }}>
              {Array.from({ length: total }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 5,
                    width: i === stepIndex ? 22 : 5,
                    borderRadius: 3,
                    background: i === stepIndex ? '#0D1B2A' : '#e2e8f0',
                    transition: 'all 0.28s ease',
                  }}
                />
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {!isFirst && (
                <button
                  onClick={onPrev}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '8px 14px',
                    borderRadius: 9,
                    border: '1px solid #e2e8f0',
                    background: 'transparent',
                    color: '#64748b',
                    fontSize: 12.5,
                    fontWeight: 600,
                    fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.14s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.color = '#1e293b';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#64748b';
                  }}
                >
                  <ChevronLeft size={13} />
                  Back
                </button>
              )}

              <button
                onClick={isLast ? onSkip : onNext}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '8px 18px',
                  borderRadius: 9,
                  border: 'none',
                  background: '#0D1B2A',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'Manrope, Inter, sans-serif',
                  cursor: 'pointer',
                  transition: 'opacity 0.14s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.82')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {isLast ? (
                  <>
                    Get Started <Sparkles size={13} />
                  </>
                ) : (
                  <>
                    Next <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
// forceActive: when flipped to true by a parent, resets and relaunches the tour
export { STORAGE_KEY };
export default function GuidedTour({ forceActive = false }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const rafRef = useRef(null);

  // Show tour only if not yet completed (first visit)
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setActive(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  // Restart tour when parent flips forceActive to true
  useEffect(() => {
    if (forceActive) {
      setStepIndex(0);
      setActive(true);
    }
  }, [forceActive]);

  const step = TOUR_STEPS[stepIndex];

  // Live-track the target element's rect (handles responsive / animated layouts)
  const measure = useCallback(() => {
    setRect(step?.target ? getRect(step.target) : null);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    measure();
    let alive = true;
    const loop = () => {
      if (!alive) return;
      measure();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, measure]);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setActive(false);
  }, []);

  const next = useCallback(() => {
    stepIndex < TOUR_STEPS.length - 1 ? setStepIndex(i => i + 1) : finish();
  }, [stepIndex, finish]);

  const prev = useCallback(() => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  }, [stepIndex]);

  if (!active) return null;

  const isCentered = step.position === 'center';

  return (
    <>
      {/* Full-screen dim for centered steps */}
      <AnimatePresence>
        {isCentered && (
          <motion.div
            key="tour-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.58)',
              zIndex: 9997,
            }}
          />
        )}
      </AnimatePresence>

      {/* Spotlight (non-centered steps only) */}
      <AnimatePresence>
        {!isCentered && (
          <motion.div
            key={`sp-${step.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998 }}
          >
            <Spotlight rect={rect} pad={step.spotlightPad ?? 14} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip card + bounce arrow */}
      <AnimatePresence mode="wait">
        <TooltipCard
          key={step.id}
          step={step}
          stepIndex={stepIndex}
          total={TOUR_STEPS.length}
          rect={rect}
          onNext={next}
          onPrev={prev}
          onSkip={finish}
        />
      </AnimatePresence>

      {/* Skip Tutorial button — fixed top-right, always visible */}
      <motion.button
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: 0.35 }}
        onClick={finish}
        style={{
          position: 'fixed',
          top: 14,
          right: 14,
          zIndex: 10001,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 13px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.22)',
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          letterSpacing: '0.02em',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
      >
        <X size={12} />
        Skip Tutorial
      </motion.button>
    </>
  );
}
