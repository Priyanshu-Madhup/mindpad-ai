/**
 * VisualPodcastModal
 *
 * Config screen  — collect numSlides / styleNotes, call onGenerate, close.
 * Result screen  — play video (Firebase URL), download.
 * Generation lives in App.jsx; backend uploads to Firebase and returns URL.
 *
 * Props:
 *   result       { url, slides, topic } | null   — fresh generation result
 *   existingUrl  string | null                   — previously saved Firebase URL
 *   notebookId   string
 *   onClose      function
 *   onGenerate   function(numSlides, styleNotes)
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Podcast, Minus, Plus,
  Download, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const SECS_PER_SLIDE = 22;

export default function VisualPodcastModal({
  result      = null,
  existingUrl = null,
  notebookId,
  onClose,
  onGenerate,
}) {
  const [step, setStep]           = useState(result ? 'done' : existingUrl ? 'existing' : 'config');
  const [numSlides, setNumSlides]   = useState(5);
  const [styleNotes, setStyleNotes] = useState('');
  const [videoUrl, setVideoUrl]     = useState(result?.url || existingUrl || null);
  const [expanded, setExpanded]     = useState(null);

  // When a fresh result arrives, use its Firebase URL directly
  useEffect(() => {
    if (!result?.url) return;
    setVideoUrl(result.url);
    setStep('done');
  }, [result]);

  // When parent sets existingUrl (e.g. on load), reflect it
  useEffect(() => { if (existingUrl && !videoUrl) setVideoUrl(existingUrl); }, [existingUrl]);

  // Close modal and hand generation off to App.jsx
  const handleGenerate = () => { onGenerate?.(numSlides, styleNotes); onClose(); };

  // Download — open Firebase URL in new tab
  const download = () => {
    const url = videoUrl || existingUrl;
    if (url) window.open(url, '_blank');
  };

  const isReady = step === 'done' || step === 'existing';

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 pt-7 pb-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                <Podcast className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">Visual Podcast</h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {step === 'config' && 'Configure your narrated slide video'}
                  {isReady && (result?.topic ? `${result.topic} · ${result.slides?.length ?? 0} slides` : 'Your visual podcast')}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── CONFIG ───────────────────────────────────────────────── */}
            {step === 'config' && (
              <div className="px-8 py-6 space-y-6">

                {/* Slide count */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Number of Slides</p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setNumSlides(n => Math.max(1, n - 1))} disabled={numSlides <= 1}
                      className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    ><Minus className="w-4 h-4" /></button>
                    <span className="w-8 text-center text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums select-none">{numSlides}</span>
                    <button
                      onClick={() => setNumSlides(n => Math.min(8, n + 1))} disabled={numSlides >= 8}
                      className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    ><Plus className="w-4 h-4" /></button>
                    <span className="text-xs text-slate-400 dark:text-slate-500">≈ {Math.ceil(numSlides * SECS_PER_SLIDE / 60)} min</span>
                  </div>
                  {/* Dot indicator */}
                  <div className="flex gap-1.5 mt-3">
                    {Array.from({ length: 8 }, (_, i) => (
                      <button key={i} onClick={() => setNumSlides(i + 1)}
                        className={`h-1.5 rounded-full transition-all duration-200 ${i < numSlides ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'} ${i + 1 === numSlides ? 'w-5' : 'w-3'}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Style notes */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Style Notes <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
                  </p>
                  <textarea
                    value={styleNotes} onChange={e => setStyleNotes(e.target.value)}
                    placeholder="e.g. beginner-friendly, focus on practical examples, include key statistics…"
                    rows={3}
                    className="w-full text-sm rounded-xl px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 resize-none transition-colors"
                  />
                </div>

                <button onClick={handleGenerate}
                  className="w-full py-3.5 bg-primary text-white rounded-xl font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20">
                  Generate Visual Podcast
                </button>
                <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
                  Generation runs in the background (~{Math.ceil(numSlides * SECS_PER_SLIDE / 60)} min). Watch progress in AI Studio.
                </p>
              </div>
            )}

            {/* ── RESULT ───────────────────────────────────────────────── */}
            {isReady && videoUrl && (
              <div className="px-8 py-6 space-y-5">

                {/* Video player */}
                <div className="rounded-2xl overflow-hidden bg-black border border-slate-200 dark:border-slate-700 shadow-lg">
                  <video src={videoUrl} controls className="w-full" style={{ maxHeight: '300px' }} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={download}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <Download className="w-4 h-4" /> Open / Download
                  </button>
                  <button onClick={() => setStep('config')} title="Regenerate"
                    className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <RefreshCw className="w-4 h-4" /> Regenerate
                  </button>
                </div>

                {/* Slide accordion */}
                {result?.slides?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">Slides</p>
                    {result.slides.map((slide, i) => (
                      <div key={i} className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                        <button onClick={() => setExpanded(expanded === i ? null : i)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{slide.slide_num}</span>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{slide.heading}</span>
                          </div>
                          {expanded === i ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                        </button>
                        <AnimatePresence>
                          {expanded === i && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100 dark:border-slate-800">
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{slide.body}</p>
                                <div className="flex items-start gap-2">
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0 mt-0.5">Narration</span>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic leading-relaxed">"{slide.narration}"</p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}

                {step === 'existing' && !result && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center pb-2">
                    Previously generated podcast — click Regenerate to create a new one.
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}
