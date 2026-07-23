import React, { useState, useEffect, useCallback } from 'react';
import {
  X, SlidersHorizontal, HardDrive, FileText,
  Image as ImageIcon, Loader2, RefreshCw,
  Trash2, ChevronRight, AlertTriangle,
  Video, Mic, Save, Sparkles, Microscope, Globe, BrainCog,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { storage } from './firebase.jsx';
import { ref, getMetadata, deleteObject } from 'firebase/storage';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Storage cap per plan — must match backend PLAN_STORAGE_MB
const PLAN_STORAGE_MB = { free: 50, plus: 200, pro: 500 };

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Reusable expandable section ──────────────────────────────────────────────
function StorageSection({ expanded, onToggle, barColor, icon: Icon, label, metaLabel, metaCount, children }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors text-left"
      >
        <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${barColor}`} />
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex-1">{label}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{metaLabel}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1.5">{metaCount}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-5 mt-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3 space-y-0.5 pb-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Reusable file row ────────────────────────────────────────────────────────
// ── Selectable file row (checkbox-based) ────────────────────────────────────
function FileRow({ itemKey, icon: Icon, name, metaText, isSelected, onToggle }) {
  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors select-none ${
        isSelected
          ? 'bg-slate-100 dark:bg-slate-700/70'
          : 'hover:bg-slate-100 dark:hover:bg-slate-700/60'
      }`}
    >
      {/* Checkbox */}
      <span
        className={`shrink-0 w-3.5 h-3.5 rounded border transition-colors ${
          isSelected
            ? 'bg-slate-800 dark:bg-slate-100 border-slate-800 dark:border-slate-100'
            : 'border-slate-300 dark:border-slate-600'
        } flex items-center justify-center`}
      >
        {isSelected && (
          <svg className="w-2 h-2 text-white dark:text-slate-900" fill="none" viewBox="0 0 10 10">
            <path d="M1.5 5l2.5 2.5L8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <Icon className="w-3 h-3 text-slate-400 shrink-0" />
      <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1" title={name}>{name}</span>
      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{metaText}</span>
    </div>
  );
}


export default function PreferencesModal({
  open, onClose,
  user, getToken,
  responseStyle = '', onSaveResponseStyle,
  isResearchMode, setIsResearchMode,
  isDeepResearch, setIsDeepResearch,
  isWebSearch, setIsWebSearch,
  isMultimediaRetrieval, setIsMultimediaRetrieval,
  onPdfDeleted, onCanvasDeleted,
  onAudioPodcastDeleted, onVisualPodcastDeleted,
  userPlan = 'free',
}) {
  const MAX_BYTES = (PLAN_STORAGE_MB[userPlan] || 50) * 1024 * 1024;
  // Answer style draft — local edit buffer, synced from prop on open
  const [localStyle, setLocalStyle] = useState(responseStyle);
  const [styleSaved, setStyleSaved] = useState(false);

  const handleSaveStyle = () => {
    onSaveResponseStyle?.(localStyle.slice(0, 500));
    setStyleSaved(true);
    setTimeout(() => setStyleSaved(false), 2000);
  };
  const [storageData, setStorageData]       = useState(null);
  const [loadingStorage, setLoadingStorage] = useState(false);

  const [showSections,  setShowSections]   = useState(false);
  const [expandedPdfs,   setExpandedPdfs]   = useState(false);
  const [expandedCanvas, setExpandedCanvas] = useState(false);
  const [expandedAudio,  setExpandedAudio]  = useState(false);
  const [expandedVisual, setExpandedVisual] = useState(false);

  const [selectedForDelete, setSelectedForDelete] = useState(new Map()); // Map<key, {type,id,url,name}>
  const [bulkConfirming, setBulkConfirming]       = useState(false);
  const [bulkDeleting,   setBulkDeleting]         = useState(false);

  const toggleItem = (key, meta) => {
    setSelectedForDelete(prev => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key); else next.set(key, meta);
      return next;
    });
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchStorageUsage = useCallback(async () => {
    if (!user?.id || !getToken) return;
    setLoadingStorage(true);
    setStorageData(null);

    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/storage/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Backend ${res.status}`);
      const data = await res.json();

      // PDFs
      let pdfBytes = 0;
      const pdfFiles = [];
      for (const pdf of (data.pdfs || [])) {
        let size = 0;
        try { const m = await getMetadata(ref(storage, pdf.firebase_pdf_url)); size = m.size || 0; } catch { /* orphaned */ }
        pdfFiles.push({ ...pdf, size });
        pdfBytes += size;
      }

      // Insight Canvas
      let canvasBytes = 0;
      const canvasFiles = [];
      for (const canvas of (data.canvas_urls || [])) {
        let size = 0;
        try { const m = await getMetadata(ref(storage, canvas.url)); size = m.size || 0; } catch { /* orphaned */ }
        canvasFiles.push({ ...canvas, size });
        canvasBytes += size;
      }

      // Audio Podcasts
      let audioBytes = 0;
      const audioFiles = [];
      for (const ap of (data.audio_podcasts || [])) {
        let size = 0;
        try { const m = await getMetadata(ref(storage, ap.url)); size = m.size || 0; } catch { /* orphaned */ }
        audioFiles.push({ ...ap, size });
        audioBytes += size;
      }

      // Visual Podcasts
      let visualBytes = 0;
      const visualFiles = [];
      for (const vp of (data.visual_podcasts || [])) {
        let size = 0;
        try { const m = await getMetadata(ref(storage, vp.url)); size = m.size || 0; } catch { /* orphaned */ }
        visualFiles.push({ ...vp, size });
        visualBytes += size;
      }

      setStorageData({
        pdfFiles, pdfBytes,
        canvasFiles, canvasBytes,
        audioFiles, audioBytes,
        visualFiles, visualBytes,
        totalBytes: pdfBytes + canvasBytes + audioBytes + visualBytes,
      });
    } catch (e) {
      console.error('[Storage usage]', e);
      setStorageData({ error: true });
    } finally {
      setLoadingStorage(false);
    }
  }, [user?.id, getToken]);

  useEffect(() => {
    if (open) {
      setLocalStyle(responseStyle);
      setStyleSaved(false);
      fetchStorageUsage();
    } else {
      setShowSections(false);
      setExpandedPdfs(false);
      setExpandedCanvas(false);
      setExpandedAudio(false);
      setExpandedVisual(false);
      setSelectedForDelete(new Map());
      setBulkConfirming(false);
    }
  }, [open, fetchStorageUsage]);

  // ── Bulk Delete ───────────────────────────────────────────────────────────
  const doBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const token = await getToken();
      await Promise.all([...selectedForDelete.values()].map(async ({ type, id, url }) => {
        try {
          if (type === 'pdf') {
            try { await deleteObject(ref(storage, url)); } catch { /* gone */ }
            await fetch(`${BACKEND_URL}/storage/pdf/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            onPdfDeleted?.(id);
          } else if (type === 'canvas') {
            try { await deleteObject(ref(storage, url)); } catch { /* gone */ }
            await fetch(`${BACKEND_URL}/storage/canvas/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            onCanvasDeleted?.(id);
          } else if (type === 'audio') {
            try { await deleteObject(ref(storage, url)); } catch { /* gone */ }
            await fetch(`${BACKEND_URL}/storage/audio-podcast/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            onAudioPodcastDeleted?.(id);
          } else if (type === 'visual') {
            try { await deleteObject(ref(storage, url)); } catch { /* gone */ }
            await fetch(`${BACKEND_URL}/storage/visual-podcast/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            onVisualPodcastDeleted?.(id);
          }
        } catch (e) { console.error('[Storage] Delete failed:', type, id, e); }
      }));
      setSelectedForDelete(new Map());
      setBulkConfirming(false);
      await fetchStorageUsage();
    } finally {
      setBulkDeleting(false);
    }
  };

  // ── Derived metrics ───────────────────────────────────────────────────────
  const docPct    = storageData && !storageData.error ? Math.min((storageData.pdfBytes    / MAX_BYTES) * 100, 100) : 0;
  const canvasPct = storageData && !storageData.error ? Math.min((storageData.canvasBytes / MAX_BYTES) * 100, 100) : 0;
  const audioPct  = storageData && !storageData.error ? Math.min((storageData.audioBytes  / MAX_BYTES) * 100, 100) : 0;
  const visualPct = storageData && !storageData.error ? Math.min((storageData.visualBytes / MAX_BYTES) * 100, 100) : 0;
  const usedPct   = docPct + canvasPct + audioPct + visualPct;
  const usedColor = usedPct > 90 ? 'text-slate-900 dark:text-white' : usedPct > 70 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400';

  // Grey palette: dark → medium-dark → medium → light
  const SEGMENTS = [
    { key: 'doc',    pct: docPct,    bar: 'bg-slate-800 dark:bg-slate-100',  dot: 'bg-slate-800 dark:bg-slate-100',  label: 'Documents' },
    { key: 'canvas', pct: canvasPct, bar: 'bg-slate-500 dark:bg-slate-400',  dot: 'bg-slate-500 dark:bg-slate-400',  label: 'Insight Canvas' },
    { key: 'audio',  pct: audioPct,  bar: 'bg-slate-400 dark:bg-slate-500',  dot: 'bg-slate-400 dark:bg-slate-500',  label: 'Audio Podcast' },
    { key: 'visual', pct: visualPct, bar: 'bg-slate-300 dark:bg-slate-600',  dot: 'bg-slate-300 dark:bg-slate-600',  label: 'Visual Podcast' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 bottom-0 z-40 bg-black/40 backdrop-blur-sm"
            style={{ top: 57 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-40 inset-0 m-auto w-full max-w-2xl h-fit max-h-[80vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-base font-bold font-display text-slate-900 dark:text-slate-100">Preferences</span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col overflow-y-auto p-5 gap-4">

              {/* ── AI Settings ──────────────────────────────────────── */}
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BrainCog className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">AI Settings</span>
                </div>

                {/* Toggle row component (inline) */}
                {[
                  {
                    label: 'Research Mode',
                    desc: 'Gives longer, more detailed and thorough answers',
                    icon: Microscope,
                    value: isResearchMode,
                    set: setIsResearchMode,
                  },
                  {
                    label: 'Deep Research',
                    desc: 'Searches the web deeply and builds answers from live sources',
                    icon: Globe,
                    value: isDeepResearch,
                    set: setIsDeepResearch,
                  },
                  {
                    label: 'Web Search',
                    desc: 'Looks up the latest information online before answering',
                    icon: Globe,
                    value: isWebSearch,
                    set: setIsWebSearch,
                  },
                  {
                    label: 'Multimedia Retrieval',
                    desc: 'Reads and understands images inside your PDFs',
                    icon: ImageIcon,
                    value: isMultimediaRetrieval,
                    set: setIsMultimediaRetrieval,
                  },
                ].map(({ label, desc, icon: Icon, value, set }, idx, arr) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between py-2.5 ${
                      idx < arr.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-none mb-0.5">{label}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{desc}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => set(p => !p)}
                      className={`relative ml-4 w-9 h-5 rounded-full transition-colors duration-250 focus:outline-none shrink-0 ${
                        value ? 'bg-slate-800 dark:bg-slate-200' : 'bg-slate-200 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white dark:bg-slate-900 rounded-full shadow transition-transform duration-250 ${
                          value ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {/* ── Storage ───────────────────────────────────────────── */}
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-4">

                {/* Header row */}
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Storage Usage</span>
                  <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">{PLAN_STORAGE_MB[userPlan] || 50} MB limit</span>
                  {loadingStorage
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 ml-1.5" />
                    : (
                      <button
                        onClick={fetchStorageUsage}
                        title="Refresh"
                        className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ml-1.5"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )
                  }
                </div>

                {/* Loading skeleton */}
                {loadingStorage && (
                  <div className="space-y-2 animate-pulse">
                    {/* progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 shrink-0 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-2 flex-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
                    </div>
                    {/* usage text + pct */}
                    <div className="flex justify-between">
                      <div className="h-2 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
                      <div className="h-2 w-8 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                    {/* legend */}
                    <div className="flex gap-3">
                      {['4rem', '3.5rem', '5rem', '3.5rem'].map((w, i) => (
                        <div key={i} style={{ width: w }} className="h-2 bg-slate-200 dark:bg-slate-700 rounded" />
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {!loadingStorage && storageData?.error && (
                  <p className="text-xs text-slate-500">Could not load storage data. Check your connection and try again.</p>
                )}

                {/* Data */}
                {!loadingStorage && storageData && !storageData.error && (
                  <div className="space-y-3">

                    {/* Progress bar + toggle */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {/* Arrow toggle — left of bar */}
                        <button
                          onClick={() => setShowSections(p => !p)}
                          title={showSections ? 'Hide file list' : 'Show file list'}
                          className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${showSections ? 'rotate-90' : ''}`} />
                        </button>
                        <div className="relative h-2 flex-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        {(() => {
                          let offset = 0;
                          return SEGMENTS.map(seg => {
                            const el = (
                              <motion.div
                                key={seg.key}
                                initial={{ width: 0 }}
                                animate={{ width: `${seg.pct}%` }}
                                transition={{ duration: 0.7, ease: 'easeOut' }}
                                className={`absolute top-0 h-full ${seg.bar}`}
                                style={{ left: `${offset}%` }}
                              />
                            );
                            offset += seg.pct;
                            return el;
                          });
                        })()}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatBytes(storageData.totalBytes)}{' '}
                          <span className="text-slate-400 dark:text-slate-600">/ {PLAN_STORAGE_MB[userPlan] || 50} MB used</span>
                        </span>
                        <span className={`text-xs font-bold tabular-nums ${usedColor}`}>
                          {usedPct.toFixed(1)}%
                        </span>
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {SEGMENTS.map(seg => (
                          <span key={seg.key} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-sm ${seg.dot}`} />
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">{seg.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* ── Collapsible file sections ── */}
                    <AnimatePresence>
                      {showSections && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden space-y-1"
                        >
                    {/* ── Documents ── */}
                    <StorageSection
                      expanded={expandedPdfs} onToggle={() => setExpandedPdfs(p => !p)}
                      barColor="bg-slate-800 dark:bg-slate-100" icon={FileText}
                      label="Documents" metaLabel={formatBytes(storageData.pdfBytes)}
                      metaCount={`${storageData.pdfFiles.length} file${storageData.pdfFiles.length !== 1 ? 's' : ''}`}
                    >
                      {storageData.pdfFiles.length === 0 && <p className="text-xs text-slate-400 px-2 py-1.5">No documents stored.</p>}
                      {storageData.pdfFiles.map(pdf => {
                        const key = `pdf-${pdf.doc_id}`;
                        return (
                          <FileRow
                            key={key} itemKey={key} icon={FileText} name={pdf.name}
                            metaText={formatBytes(pdf.size)}
                            isSelected={selectedForDelete.has(key)}
                            onToggle={() => toggleItem(key, { type: 'pdf', id: pdf.doc_id, url: pdf.firebase_pdf_url, name: pdf.name })}
                          />
                        );
                      })}
                    </StorageSection>

                    {/* ── Insight Canvas ── */}
                    <StorageSection
                      expanded={expandedCanvas} onToggle={() => setExpandedCanvas(p => !p)}
                      barColor="bg-slate-500 dark:bg-slate-400" icon={ImageIcon}
                      label="Insight Canvas" metaLabel={formatBytes(storageData.canvasBytes)}
                      metaCount={`${storageData.canvasFiles.length} image${storageData.canvasFiles.length !== 1 ? 's' : ''}`}
                    >
                      {storageData.canvasFiles.length === 0 && <p className="text-xs text-slate-400 px-2 py-1.5">No canvas images stored.</p>}
                      {storageData.canvasFiles.map(canvas => {
                        const key = `canvas-${canvas.notebook_id}`;
                        return (
                          <FileRow
                            key={key} itemKey={key} icon={ImageIcon} name={canvas.name}
                            metaText={formatBytes(canvas.size)}
                            isSelected={selectedForDelete.has(key)}
                            onToggle={() => toggleItem(key, { type: 'canvas', id: canvas.notebook_id, url: canvas.url, name: canvas.name })}
                          />
                        );
                      })}
                    </StorageSection>

                    {/* ── Audio Podcasts ── */}
                    <StorageSection
                      expanded={expandedAudio} onToggle={() => setExpandedAudio(p => !p)}
                      barColor="bg-slate-400 dark:bg-slate-500" icon={Mic}
                      label="Audio Podcasts" metaLabel={formatBytes(storageData.audioBytes)}
                      metaCount={`${storageData.audioFiles.length} file${storageData.audioFiles.length !== 1 ? 's' : ''}`}
                    >
                      {storageData.audioFiles.length === 0 && <p className="text-xs text-slate-400 px-2 py-1.5">No audio podcasts stored.</p>}
                      {storageData.audioFiles.map(ap => {
                        const key = `audio-${ap.notebook_id}`;
                        return (
                          <FileRow
                            key={key} itemKey={key} icon={Mic} name={ap.name}
                            metaText={formatBytes(ap.size)}
                            isSelected={selectedForDelete.has(key)}
                            onToggle={() => toggleItem(key, { type: 'audio', id: ap.notebook_id, url: ap.url, name: ap.name })}
                          />
                        );
                      })}
                    </StorageSection>

                    {/* ── Visual Podcasts ── */}
                    <StorageSection
                      expanded={expandedVisual} onToggle={() => setExpandedVisual(p => !p)}
                      barColor="bg-slate-300 dark:bg-slate-600" icon={Video}
                      label="Visual Podcasts" metaLabel={formatBytes(storageData.visualBytes)}
                      metaCount={`${storageData.visualFiles.length} file${storageData.visualFiles.length !== 1 ? 's' : ''}`}
                    >
                      {storageData.visualFiles.length === 0 && <p className="text-xs text-slate-400 px-2 py-1.5">No visual podcasts stored.</p>}
                      {storageData.visualFiles.map(vp => {
                        const key = `visual-${vp.notebook_id}`;
                        return (
                          <FileRow
                            key={key} itemKey={key} icon={Video} name={vp.name}
                            metaText={formatBytes(vp.size)}
                            isSelected={selectedForDelete.has(key)}
                            onToggle={() => toggleItem(key, { type: 'visual', id: vp.notebook_id, url: vp.url, name: vp.name })}
                          />
                        );
                      })}
                    </StorageSection>

                    {/* ── Bulk delete bar ── */}
                    <AnimatePresence>
                      {selectedForDelete.size > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.18 }}
                          className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 mt-1"
                        >
                          {bulkConfirming ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">
                                Delete {selectedForDelete.size} item{selectedForDelete.size !== 1 ? 's' : ''}?
                              </span>
                              <button
                                onClick={() => setBulkConfirming(false)}
                                className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-0.5 rounded transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={doBulkDelete}
                                disabled={bulkDeleting}
                                className="flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-black dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white px-2.5 py-1 rounded-lg disabled:opacity-50 transition-colors"
                              >
                                {bulkDeleting && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                Confirm delete
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-slate-500 flex-1">
                                {selectedForDelete.size} selected
                              </span>
                              <button
                                onClick={() => setSelectedForDelete(new Map())}
                                className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-0.5 rounded transition-colors"
                              >
                                Clear
                              </button>
                              <button
                                onClick={() => setBulkConfirming(true)}
                                className="flex items-center gap-1.5 text-[11px] bg-slate-800 hover:bg-black dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white px-2.5 py-1 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete {selectedForDelete.size} selected
                              </button>
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Near-limit warning */}
                    {usedPct > 80 && (
                      <p className={`text-[11px] font-medium pt-1 ${usedPct > 90 ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {usedPct > 90
                          ? '⚠ Almost out of storage. Delete unused files to free up space.'
                          : '⚡ Storage filling up. Consider removing old files.'}
                      </p>
                    )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* ── Answer Style ──────────────────────────────────────── */}
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Answer Style</span>
                  <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">{localStyle.length}/500</span>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Tell Midy AI how to write its answers — tone, length, format, detail level, etc.
                </p>
                <textarea
                  value={localStyle}
                  onChange={e => setLocalStyle(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder={`e.g. "Always explain in simple language with short paragraphs. Use bullet points for lists. Avoid jargon."`}
                  className="w-full resize-none text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 transition-shadow"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveStyle}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-black dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 transition-colors"
                  >
                    {styleSaved
                      ? <><span className="text-green-400 dark:text-green-600">✓</span> Saved</>
                      : <><Save className="w-3 h-3" /> Save</>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
