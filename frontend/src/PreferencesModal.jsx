import React, { useState, useEffect, useCallback } from 'react';
import {
  X, SlidersHorizontal, HardDrive, FileText,
  Image as ImageIcon, Loader2, RefreshCw,
  Trash2, ChevronRight, AlertTriangle,
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

export default function PreferencesModal({
  open, onClose,
  user, getToken,
  onPdfDeleted, onCanvasDeleted,
  userPlan = 'free',
}) {
  const MAX_BYTES = (PLAN_STORAGE_MB[userPlan] || 50) * 1024 * 1024;
  const [storageData, setStorageData]         = useState(null);
  const [loadingStorage, setLoadingStorage]   = useState(false);
  const [expandedPdfs, setExpandedPdfs]       = useState(false);
  const [expandedCanvas, setExpandedCanvas]   = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null); // { type, id, name, url }
  const [deletingId, setDeletingId]           = useState(null);

  // â”€â”€ Fetch sizes from Firebase for each URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      // PDFs â€” getMetadata per firebase_pdf_url
      let pdfBytes = 0;
      const pdfFiles = [];
      for (const pdf of (data.pdfs || [])) {
        let size = 0;
        try { const m = await getMetadata(ref(storage, pdf.firebase_pdf_url)); size = m.size || 0; } catch { /* orphaned */ }
        pdfFiles.push({ ...pdf, size });
        pdfBytes += size;
      }

      // Insight Canvas â€” getMetadata per url
      let canvasBytes = 0;
      const canvasFiles = [];
      for (const canvas of (data.canvas_urls || [])) {
        let size = 0;
        try { const m = await getMetadata(ref(storage, canvas.url)); size = m.size || 0; } catch { /* orphaned */ }
        canvasFiles.push({ ...canvas, size });
        canvasBytes += size;
      }

      setStorageData({ pdfFiles, canvasFiles, pdfBytes, canvasBytes, totalBytes: pdfBytes + canvasBytes });
    } catch (e) {
      console.error('[Storage usage]', e);
      setStorageData({ error: true });
    } finally {
      setLoadingStorage(false);
    }
  }, [user?.id, getToken]);

  useEffect(() => {
    if (open) {
      fetchStorageUsage();
    } else {
      setExpandedPdfs(false);
      setExpandedCanvas(false);
      setConfirmingDelete(null);
    }
  }, [open, fetchStorageUsage]);

  // â”€â”€ Delete handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDeletePdf = async (doc_id, firebase_pdf_url) => {
    setDeletingId(doc_id);
    try {
      try { await deleteObject(ref(storage, firebase_pdf_url)); } catch { /* already gone */ }
      const token = await getToken();
      await fetch(`${BACKEND_URL}/storage/pdf/${doc_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onPdfDeleted?.(doc_id);
      await fetchStorageUsage();
    } catch (e) {
      console.error('[Storage] PDF delete failed:', e);
    } finally {
      setDeletingId(null);
      setConfirmingDelete(null);
    }
  };

  const handleDeleteCanvas = async (notebook_id, url) => {
    setDeletingId(notebook_id);
    try {
      try { await deleteObject(ref(storage, url)); } catch { /* already gone */ }
      const token = await getToken();
      await fetch(`${BACKEND_URL}/storage/canvas/${notebook_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onCanvasDeleted?.(notebook_id);
      await fetchStorageUsage();
    } catch (e) {
      console.error('[Storage] Canvas delete failed:', e);
    } finally {
      setDeletingId(null);
      setConfirmingDelete(null);
    }
  };

  // â”€â”€ Derived metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const docPct    = storageData && !storageData.error ? Math.min((storageData.pdfBytes    / MAX_BYTES) * 100, 100) : 0;
  const canvasPct = storageData && !storageData.error ? Math.min((storageData.canvasBytes / MAX_BYTES) * 100, 100) : 0;
  const usedPct   = docPct + canvasPct;
  const usedColor = usedPct > 90 ? 'text-red-500' : usedPct > 70 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200';

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
                <SlidersHorizontal className="w-4 h-4 text-primary" />
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
            <div className="flex-1 flex flex-col overflow-y-auto p-5">
              <div className="mt-auto rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-4">

                {/* Section header row */}
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
                        className="p-0.5 rounded text-slate-400 hover:text-primary transition-colors ml-1.5"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )
                  }
                </div>

                {/* Loading skeleton */}
                {loadingStorage && (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
                    <div className="flex justify-between">
                      <div className="h-2.5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                      <div className="h-2.5 w-10 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                    <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                    <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                  </div>
                )}

                {/* Error */}
                {!loadingStorage && storageData?.error && (
                  <p className="text-xs text-red-500">Could not load storage data. Check your connection and try again.</p>
                )}

                {/* Data */}
                {!loadingStorage && storageData && !storageData.error && (
                  <div className="space-y-3">

                    {/* Progress bar */}
                    <div className="space-y-2">
                      <div className="relative h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        {/* Documents â€” darker grey */}
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${docPct}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut' }}
                          className="absolute left-0 top-0 h-full bg-slate-600 dark:bg-slate-300"
                        />
                        {/* Canvas â€” medium grey, starts after docs */}
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${canvasPct}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                          className="absolute top-0 h-full bg-slate-400 dark:bg-slate-500"
                          style={{ left: `${docPct}%` }}
                        />
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
                    </div>

                    {/* â”€â”€ Documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    <div>
                      <button
                        onClick={() => setExpandedPdfs(p => !p)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors text-left"
                      >
                        <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${expandedPdfs ? 'rotate-90' : ''}`} />
                        <span className="w-2.5 h-2.5 rounded-sm bg-slate-600 dark:bg-slate-300 shrink-0" />
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex-1">Documents</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(storageData.pdfBytes)}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1.5">
                          {storageData.pdfFiles.length} file{storageData.pdfFiles.length !== 1 ? 's' : ''}
                        </span>
                      </button>

                      <AnimatePresence>
                        {expandedPdfs && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="ml-5 mt-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3 space-y-0.5 pb-1">
                              {storageData.pdfFiles.length === 0 && (
                                <p className="text-xs text-slate-400 px-2 py-1.5">No documents stored.</p>
                              )}
                              {storageData.pdfFiles.map(pdf => (
                                <div
                                  key={pdf.doc_id}
                                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                                >
                                  {confirmingDelete?.id === pdf.doc_id ? (
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      <span className="text-xs text-slate-600 dark:text-slate-300 flex-1 truncate">Permanently delete?</span>
                                      <button
                                        onClick={() => setConfirmingDelete(null)}
                                        className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-0.5 rounded transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleDeletePdf(pdf.doc_id, pdf.firebase_pdf_url)}
                                        disabled={!!deletingId}
                                        className="flex items-center gap-1 text-[11px] bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded disabled:opacity-50 transition-colors"
                                      >
                                        {deletingId === pdf.doc_id && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                        Delete
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1" title={pdf.name}>{pdf.name}</span>
                                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatBytes(pdf.size)}</span>
                                      <button
                                        onClick={() => setConfirmingDelete({ type: 'pdf', id: pdf.doc_id, name: pdf.name, url: pdf.firebase_pdf_url })}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* â”€â”€ Insight Canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    <div>
                      <button
                        onClick={() => setExpandedCanvas(p => !p)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors text-left"
                      >
                        <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${expandedCanvas ? 'rotate-90' : ''}`} />
                        <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 dark:bg-slate-500 shrink-0" />
                        <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex-1">Insight Canvas</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(storageData.canvasBytes)}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1.5">
                          {storageData.canvasFiles.length} image{storageData.canvasFiles.length !== 1 ? 's' : ''}
                        </span>
                      </button>

                      <AnimatePresence>
                        {expandedCanvas && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="ml-5 mt-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3 space-y-0.5 pb-1">
                              {storageData.canvasFiles.length === 0 && (
                                <p className="text-xs text-slate-400 px-2 py-1.5">No canvas images stored.</p>
                              )}
                              {storageData.canvasFiles.map(canvas => (
                                <div
                                  key={canvas.notebook_id}
                                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                                >
                                  {confirmingDelete?.id === canvas.notebook_id ? (
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      <span className="text-xs text-slate-600 dark:text-slate-300 flex-1 truncate">Permanently delete?</span>
                                      <button
                                        onClick={() => setConfirmingDelete(null)}
                                        className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-0.5 rounded transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleDeleteCanvas(canvas.notebook_id, canvas.url)}
                                        disabled={!!deletingId}
                                        className="flex items-center gap-1 text-[11px] bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded disabled:opacity-50 transition-colors"
                                      >
                                        {deletingId === canvas.notebook_id && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                        Delete
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <ImageIcon className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1" title={canvas.name}>{canvas.name}</span>
                                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatBytes(canvas.size)}</span>
                                      <button
                                        onClick={() => setConfirmingDelete({ type: 'canvas', id: canvas.notebook_id, name: canvas.name, url: canvas.url })}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Near-limit warning */}
                    {usedPct > 80 && (
                      <p className={`text-[11px] font-medium pt-1 ${usedPct > 90 ? 'text-red-500' : 'text-amber-500'}`}>
                        {usedPct > 90
                          ? 'âš  Almost out of storage. Delete unused documents or canvas images.'
                          : 'âš¡ Storage filling up. Consider removing old files.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
