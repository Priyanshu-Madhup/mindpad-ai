/**
 * VideoSuggestionsModal — YouTube video suggestions viewer.
 * Matches MindMapModal: same backdrop, header chrome, Framer Motion animations, dark/light palette.
 *
 * Props:
 *   topic      {string}         — Research topic used to generate suggestions
 *   videos     {Array}          — Array of { title, channel, duration, thumbnail, video_id, url, query }
 *   queries    {Array<string>}  — The LLM-generated queries used
 *   loading    {boolean}        — True while fetching
 *   onClose    {function}       — Called when the user closes the modal
 *   onRefresh  {function}       — Called when the user hits refresh
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Film, Play, ExternalLink, RefreshCw,
  Maximize2, Minimize2, ChevronLeft, ChevronRight,
  Search, Clock, Tv2,
} from 'lucide-react';

const QUERY_COLOURS = [
  'bg-[#0D1B2A] text-white',
  'bg-[#163552] text-white',
  'bg-[#1e5082] text-white',
  'bg-[#2a72b8] text-white',
  'bg-[#3b8fd4] text-white',
];

function buildEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

// ─── VideoCard ────────────────────────────────────────────────────────────────
function VideoCard({ video, index, onPlay, isActive }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.34, 1.1, 0.64, 1], delay: Math.min(index * 0.04, 0.4) }}
      className={`group relative rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer
        ${isActive
          ? 'border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10'
          : 'border-slate-200 dark:border-slate-700 hover:border-primary/40 dark:hover:border-primary/40 hover:shadow-md'
        } bg-white dark:bg-slate-800`}
      onClick={() => onPlay(video)}
    >
      <div className="relative aspect-video overflow-hidden bg-slate-100 dark:bg-slate-900">
        {!imgErr && video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgErr(true)} loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-700">
            <Film className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-200">
          <div className="w-10 h-10 rounded-full bg-white/90 dark:bg-slate-900/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
            <Play className="w-4 h-4 text-primary fill-primary ml-0.5" />
          </div>
        </div>
        {video.duration && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
            {video.duration}
          </span>
        )}
        {isActive && <div className="absolute inset-0 border-2 border-primary pointer-events-none" />}
      </div>
      <div className="p-3">
        <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-tight line-clamp-2 mb-1.5">{video.title}</p>
        <div className="flex items-center gap-1.5">
          <Tv2 className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{video.channel}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── VideoPlayer — top-level fixed overlay, NO pointer-events-none wrapper ────
// The outer flex container uses style pointerEvents none so clicks fall through
// to the backdrop; only the inner card re-enables pointer events.
function VideoPlayer({ video, filteredVideos, activeIdx, onClose, onNext, onPrev }) {
  const playerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const embedUrl = video.video_id ? buildEmbedUrl(video.video_id) : null;

  return (
    <>
      {/* Darkening backdrop — click closes only the player */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Player card — pointer-events-none on the centering wrapper,
          pointer-events-auto re-enabled on the card itself */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed inset-0 z-[301] flex items-center justify-center p-4"
        style={{ pointerEvents: 'none' }}
      >
        <div
          ref={playerRef}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl overflow-hidden flex flex-col"
          style={{ maxHeight: '90vh', pointerEvents: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                <Play className="w-3.5 h-3.5 text-primary fill-primary ml-0.5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate max-w-sm">{video.title}</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                  <Tv2 className="w-3 h-3 shrink-0" />
                  {video.channel}
                  {video.duration && (<><span className="mx-1 opacity-40">·</span><Clock className="w-3 h-3 shrink-0" />{video.duration}</>)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onPrev} disabled={activeIdx <= 0} title="Previous"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={onNext} disabled={activeIdx >= filteredVideos.length - 1} title="Next"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
              <a href={video.url} target="_blank" rel="noopener noreferrer" title="Open on YouTube"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={() => isFullscreen ? document.exitFullscreen() : playerRef.current?.requestFullscreen?.()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
              <button onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* iframe — key remounts the element when switching videos */}
          <div className="bg-black flex-1" style={{ minHeight: 0 }}>
            {embedUrl ? (
              <iframe
                key={video.video_id}
                src={embedUrl}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ width: '100%', height: '100%', minHeight: '360px', border: 'none', display: 'block' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-slate-400">
                <Film className="w-10 h-10" />
                <p className="text-sm">This video cannot be embedded.</p>
                <a href={video.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                  <ExternalLink className="w-4 h-4" />
                  Open on YouTube
                </a>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function VideoSuggestionsModal({
  topic = '',
  videos = [],
  queries = [],
  loading = false,
  onClose,
  onRefresh,
}) {
  const [activeVideo, setActiveVideo] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const modalRef = useRef(null);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const filteredVideos = filterQuery ? videos.filter(v => v.query === filterQuery) : videos;

  const openPlayer = useCallback((video, idx) => { setActiveVideo(video); setActiveIdx(idx); }, []);
  const closePlayer = useCallback(() => { setActiveVideo(null); setActiveIdx(-1); }, []);

  const goNext = useCallback(() => {
    if (activeIdx < filteredVideos.length - 1) openPlayer(filteredVideos[activeIdx + 1], activeIdx + 1);
  }, [activeIdx, filteredVideos, openPlayer]);

  const goPrev = useCallback(() => {
    if (activeIdx > 0) openPlayer(filteredVideos[activeIdx - 1], activeIdx - 1);
  }, [activeIdx, filteredVideos, openPlayer]);

  return (
    <>
      {/* Main backdrop */}
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
        onClick={() => { closePlayer(); onClose(); }} />

      {/* Main modal panel */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-6xl pointer-events-auto overflow-hidden flex flex-col"
          style={{ height: '90vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                <Film className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Video Suggestions</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-sm">
                  {topic ? `Based on: "${topic.slice(0, 70)}"` : 'AI-curated YouTube videos from your documents'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onRefresh} disabled={loading} title="Refresh"
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={() => isFullscreen ? document.exitFullscreen() : modalRef.current?.requestFullscreen?.()}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
              <button onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Query chips */}
          {queries.length > 0 && (
            <div className="px-6 pt-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Search className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mr-1">Queries</span>
                <button onClick={() => setFilterQuery('')}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all border ${filterQuery === '' ? 'bg-[#0D1B2A] text-white border-[#0D1B2A]' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                  All ({videos.length})
                </button>
                {queries.map((q, i) => (
                  <button key={i} onClick={() => setFilterQuery(filterQuery === q ? '' : q)} title={q}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all border max-w-52 truncate ${filterQuery === q ? `${QUERY_COLOURS[i % 5]} border-transparent` : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                    {q} ({videos.filter(v => v.query === q).length})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Video grid */}
          <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50 dark:bg-slate-950 min-h-0">
            <div
              aria-hidden="true"
              className="fixed inset-0 pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.18) 1px, transparent 1px)', backgroundSize: '28px 28px', zIndex: 0 }}
            />
            <div className="relative z-10">
              {loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Finding videos…</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Reading document summaries from MongoDB</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 w-full mt-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <motion.div key={i} animate={{ opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.1 }}
                        className="rounded-2xl bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div className="aspect-video bg-slate-300 dark:bg-slate-700" />
                        <div className="p-3 space-y-2">
                          <div className="h-3 bg-slate-300 dark:bg-slate-700 rounded-full w-4/5" />
                          <div className="h-2.5 bg-slate-200 dark:bg-slate-600 rounded-full w-3/5" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {!loading && filteredVideos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Film className="w-8 h-8 text-slate-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No videos found</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Make sure at least one PDF is selected, then try refreshing.</p>
                  </div>
                  <button onClick={onRefresh}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                    <RefreshCw className="w-4 h-4" /> Try again
                  </button>
                </div>
              )}

              {!loading && filteredVideos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredVideos.map((video, idx) => (
                    <VideoCard
                      key={video.video_id || video.url || idx}
                      video={video}
                      index={idx}
                      onPlay={(v) => openPlayer(v, idx)}
                      isActive={activeVideo?.video_id === video.video_id && activeIdx === idx}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Video player — z-[300+], outside any pointer-events-none container */}
      <AnimatePresence>
        {activeVideo && (
          <VideoPlayer
            key={activeVideo.video_id || activeIdx}
            video={activeVideo}
            filteredVideos={filteredVideos}
            activeIdx={activeIdx}
            onClose={closePlayer}
            onNext={goNext}
            onPrev={goPrev}
          />
        )}
      </AnimatePresence>
    </>
  );
}
