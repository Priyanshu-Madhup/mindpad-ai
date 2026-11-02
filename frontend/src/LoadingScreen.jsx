import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import mindpadLogo from './mindpad_ai_logo.png';
import mindpadLogoDark from './mindpad_ai_logo_dark.png';

const MESSAGES = [
  'Bringing your notebooks together…',
  'Organising your documents…',
  'Waking up Midy AI…',
  'Indexing your knowledge…',
  'Sharpening your mind maps…',
  'Warming up the servers…',
  'Almost there — good things take a moment…',
  'Tidying up your research…',
];

const MIN_SHOW_MS = 5000; // always visible at least this long, even if the server is already awake

// Shown while the hosted backend wakes from its idle sleep. `ready` flips to true once the
// first data has arrived; the bar then fills and `onFinished` hands over to the app.
export default function LoadingScreen({ colorMode, ready, onFinished }) {
  const [progress, setProgress] = useState(4);
  const [finishing, setFinishing] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const dark = colorMode === 'dark' || colorMode === 'black';

  const [startedAt] = useState(() => Date.now());

  // Real progress is unknowable, so ease towards 92 % (never slower than a linear climb over
  // MIN_SHOW_MS) and only complete once data is in and the minimum display time has passed.
  useEffect(() => {
    if (finishing) return;
    const t = setInterval(() => {
      const linear = Math.min((Date.now() - startedAt) / MIN_SHOW_MS, 1) * 92;
      setProgress(p => Math.max(p + (92 - p) * 0.03, linear));
    }, 200);
    return () => clearInterval(t);
  }, [finishing]);

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_SHOW_MS - (Date.now() - startedAt));
    const t1 = setTimeout(() => { setFinishing(true); setProgress(100); }, wait);
    const t2 = setTimeout(onFinished, wait + 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [ready]);

  useEffect(() => {
    const t = setInterval(() => setMsgIndex(i => (i + 1) % MESSAGES.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 bg-white dark:bg-slate-950 black:bg-black px-6">
      <div className="relative px-9 py-6 sm:px-12 sm:py-7">
        <svg className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
          <rect
            x="0" y="0" width="100%" height="100%" rx="28" ry="28" fill="none" pathLength="100"
            className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="3"
          />
          <rect
            x="0" y="0" width="100%" height="100%" rx="28" ry="28" fill="none" pathLength="100"
            className="stroke-slate-900 dark:stroke-slate-100" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="100" strokeDashoffset={100 - progress}
            style={{ transition: 'stroke-dashoffset 0.4s ease-out' }}
          />
        </svg>
        <div className="relative flex items-center gap-3">
          <img src={dark ? mindpadLogoDark : mindpadLogo} alt="Mindpad AI logo" className="h-10 w-auto object-contain" />
          <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-display uppercase tracking-widest">
            Mindpad AI
          </span>
        </div>
      </div>

      <div className="h-6 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={msgIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-sm text-slate-500 dark:text-slate-400"
          >
            {MESSAGES[msgIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
