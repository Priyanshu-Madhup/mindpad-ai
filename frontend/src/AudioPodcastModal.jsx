/**
 * AudioPodcastModal.jsx
 *
 * Pure result viewer — opened from the sidebar result card (same pattern as MindMapModal).
 * Generation is triggered directly by clicking the StudioTool in App.jsx.
 * This modal only renders when a result or existing URL is already available.
 *
 * Props:
 *   result       { audio_b64, script, topic, word_count } | null
 *   existingUrl  string | null
 *   getToken     async function
 *   user         object
 *   notebookId   string
 *   onClose      function
 *   onSaved      function(nbId, url)
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Podcast, Loader2, CheckCircle2, Download,
  BookmarkPlus, ChevronDown, ChevronUp, Volume2,
} from 'lucide-react';
import { storage } from './firebase.jsx';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Animated waveform bars shown while audio is playing
function WaveformBars({ playing }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {[3, 5, 7, 4, 6, 8, 5, 3, 6, 4, 7, 5].map((h, i) => (
        <motion.div
          key={i}
          className="w-0.5 rounded-full bg-primary"
          animate={playing
            ? { scaleY: [1, h / 4, 1, h / 6, 1], opacity: [0.7, 1, 0.7] }
            : { scaleY: 0.3, opacity: 0.35 }}
          transition={{ duration: 0.9 + (i % 4) * 0.15, repeat: Infinity, ease: 'easeInOut', delay: i * 0.06 }}
          style={{ height: `${h * 3}px`, originY: 1 }}
        />
      ))}
    </div>
  );
}

export default function AudioPodcastModal({
  result      = null,
  existingUrl = null,
  getToken,
  user,
  notebookId,
  onClose,
  onSaved,
}) {
  const [audioUrl, setAudioUrl]     = useState(existingUrl || null);
  const [isSaving, setIsSaving]     = useState(false);
  const [savedUrl, setSavedUrl]     = useState(existingUrl || null);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [isPlaying, setIsPlaying]   = useState(false);
  const audioRef                    = useRef(null);
  const blobUrlRef                  = useRef(null);

  // Decode fresh result audio_b64 into a Blob URL for the <audio> element
  useEffect(() => {
    if (!result?.audio_b64) return;
    const raw = atob(result.audio_b64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    const blob = new Blob([arr], { type: 'audio/wav' });
    const url  = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setAudioUrl(url);
  }, [result]);

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); }, []);

  // Keep savedUrl in sync with prop
  useEffect(() => { if (existingUrl) setSavedUrl(existingUrl); }, [existingUrl]);

  // Upload to Firebase Storage + PATCH MongoDB
  const save = async () => {
    if (!result?.audio_b64) return;
    setIsSaving(true);
    try {
      const raw = atob(result.audio_b64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      const blob        = new Blob([arr], { type: 'audio/wav' });
      const storagePath = `audio-podcasts/${user?.id}/${notebookId}/${Date.now()}.wav`;
      const storageRef  = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: 'audio/wav' });
      const firebaseUrl = await getDownloadURL(storageRef);
      const token       = await getToken();
      await fetch(`${BACKEND_URL}/notebooks/${notebookId}/audio-podcast`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ url: firebaseUrl }),
      });
      setSavedUrl(firebaseUrl);
      onSaved?.(notebookId, firebaseUrl);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Download audio file
  const download = () => {
    if (result?.audio_b64) {
      const raw = atob(result.audio_b64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: 'audio/wav' }));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `podcast-${(result.topic || 'mindpad').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } else if (existingUrl) {
      window.open(existingUrl, '_blank');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden"
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                <Podcast className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                  Audio Podcast
                </h2>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {result?.topic || 'Your audio podcast'}
                  {result?.word_count ? ` · ~${Math.ceil(result.word_count / 140)} min` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-7 py-5 space-y-5">

              {/* ── Audio Player Card ─────────────────────────────── */}
              {audioUrl && (
                <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/60 border border-slate-200 dark:border-slate-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">
                        Now Playing
                      </p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                        {result?.topic || 'Audio Podcast'}
                      </p>
                    </div>
                    <WaveformBars playing={isPlaying} />
                  </div>
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    className="w-full rounded-lg"
                    controls
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    style={{ height: '40px' }}
                  />
                </div>
              )}

              {/* ── Action Buttons ────────────────────────────────── */}
              <div className="flex items-center gap-3 flex-wrap">
                {result && !savedUrl && (
                  <button
                    onClick={save}
                    disabled={isSaving}
                    className="flex-1 min-w-0 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                    {isSaving ? 'Saving…' : 'Save to Notebook'}
                  </button>
                )}
                {savedUrl && (
                  <div className="flex-1 min-w-0 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-sm font-semibold border border-emerald-200 dark:border-emerald-700/40">
                    <CheckCircle2 className="w-4 h-4" /> Saved to Notebook
                  </div>
                )}
                <button
                  onClick={download}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
              </div>

              {/* ── Collapsible Script Viewer ─────────────────────── */}
              {result?.script && (
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setScriptOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Podcast Script</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">({result.word_count} words)</span>
                    </div>
                    {scriptOpen
                      ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>
                  <AnimatePresence>
                    {scriptOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <div className="max-h-64 overflow-y-auto">
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                              {result.script}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {!result && existingUrl && (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center pb-2">
                  Previously generated podcast. Generate a new one from AI Studio.
                </p>
              )}

            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
