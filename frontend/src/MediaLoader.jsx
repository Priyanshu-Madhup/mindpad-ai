import React from 'react';
import { motion } from 'motion/react';
import mindpadLogo from './mindpad_ai_logo.png';
import mindpadLogoDark from './mindpad_ai_logo_dark.png';

// Fills its (relatively positioned) parent while a video / image is still downloading:
// the Mindpad logo inside two counter-rotating arcs over a breathing glow, the name with a
// light sweeping across it.
export default function MediaLoader({ caption = 'Loading…', className = '' }) {
  return (
    <div
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-slate-50 dark:bg-slate-900 ${className}`}
      role="status"
      aria-label={caption}
    >
      <div className="relative w-24 h-24 flex items-center justify-center">
        <motion.div
          className="absolute inset-2 rounded-full bg-slate-300/60 dark:bg-slate-600/40 blur-xl"
          animate={{ scale: [0.9, 1.25, 0.9], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="70 220" className="stroke-slate-800 dark:stroke-slate-100" />
        </motion.svg>
        <motion.svg
          className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)]"
          viewBox="0 0 100 100"
          animate={{ rotate: -360 }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="40 250" className="stroke-slate-400 dark:stroke-slate-500" />
        </motion.svg>
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <img src={mindpadLogo} alt="" className="h-9 w-auto object-contain dark:hidden" />
          <img src={mindpadLogoDark} alt="" className="h-9 w-auto object-contain hidden dark:block" />
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="ml-shimmer-text text-lg font-black font-display uppercase tracking-widest">Mindpad AI</span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">{caption}</span>
      </div>
    </div>
  );
}
