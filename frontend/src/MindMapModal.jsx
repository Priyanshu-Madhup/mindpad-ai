/**
 * MindMapModal — Interactive D3-powered mind map viewer.
 * Uses d3-hierarchy for tree layout; renders pure SVG via React.
 * Supports expand/collapse on click, pan, scroll-to-zoom, and fullscreen.
 */
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { hierarchy, tree } from 'd3-hierarchy';
import { motion, AnimatePresence } from 'motion/react';
import { X, ZoomIn, ZoomOut, Maximize2, Minimize2, Network, RotateCcw } from 'lucide-react';

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W = 176;   // rect width (non-root)
const NODE_H = 42;    // rect height
const ROOT_W = 210;   // wider rect for root
const ROOT_H = 52;
const NODE_RX = 11;   // border-radius
const LEVEL_SEP = 268; // horizontal gap between depth levels (d3 y-axis)
const NODE_SEP = 62;   // vertical gap between siblings (d3 x-axis, center-to-center)
const PADDING = 64;    // SVG outer padding

// ── Depth colour palette — monochromatic navy derived from app primary #0D1B2A
const PALETTE = [
  { fill: '#0D1B2A', stroke: '#0a141f', text: '#fff' }, // 0 – root    dark navy
  { fill: '#163552', stroke: '#102840', text: '#fff' }, // 1            navy-blue
  { fill: '#1e5082', stroke: '#174071', text: '#fff' }, // 2            medium navy
  { fill: '#2a72b8', stroke: '#2260a0', text: '#fff' }, // 3            steel blue
  { fill: '#3b8fd4', stroke: '#3179bb', text: '#fff' }, // 4+           sky-navy
];
function color(depth) { return PALETTE[Math.min(depth, PALETTE.length - 1)]; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/** Recursively annotate every node with a stable string _id and _hasChildren flag. */
function annotate(node, path = '0') {
  const kids = node.children || [];
  return {
    ...node,
    _id: path,
    _hasChildren: kids.length > 0,
    children: kids.map((c, i) => annotate(c, `${path}-${i}`)),
  };
}

/** Prune collapsed subtrees: replace children with [] but keep _hasChildren. */
function prune(node, collapsed) {
  if (collapsed.has(node._id)) return { ...node, children: [] };
  return { ...node, children: (node.children || []).map(c => prune(c, collapsed)) };
}

/** Cubic-bezier S-curve from right edge of source to left edge of target. */
function linkPath(link, offX, offY, isRootSource) {
  const sw = isRootSource ? ROOT_W : NODE_W;
  const sx = link.source.y + offX + sw / 2;
  const sy = link.source.x + offY;
  const tw = NODE_W;
  const tx = link.target.y + offX - tw / 2;
  const ty = link.target.x + offY;
  const mx = (sx + tx) / 2;
  return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MindMapModal({ data, onClose }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const [zoom, setZoom] = useState(0.82);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);

  // Annotate data once (adds _id + _hasChildren)
  const annotated = useMemo(() => annotate(data), [data]);

  // Prune collapsed subtrees then compute D3 layout
  const { nodes, links, svgW, svgH, offX, offY } = useMemo(() => {
    const visible = prune(annotated, collapsed);
    const root = hierarchy(visible);
    const layout = tree().nodeSize([NODE_SEP, LEVEL_SEP]);
    layout(root);

    const descs = root.descendants();
    const lnks = root.links();

    const minX = Math.min(...descs.map(n => n.x));
    const maxX = Math.max(...descs.map(n => n.x));
    const minY = Math.min(...descs.map(n => n.y));
    const maxY = Math.max(...descs.map(n => n.y));

    // offX/offY translate d3 coordinates to SVG pixel coords
    const offX = PADDING + ROOT_W / 2 - minY;
    const offY = PADDING + ROOT_H / 2 - minX;
    const svgW = (maxY - minY) + ROOT_W + PADDING * 2;
    const svgH = (maxX - minX) + ROOT_H + PADDING * 2;

    return { nodes: descs, links: lnks, svgW, svgH, offX, offY };
  }, [annotated, collapsed]);

  const toggleNode = useCallback((id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Non-passive wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom(z => Math.min(3, Math.max(0.15, parseFloat((z + delta).toFixed(2)))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onMouseDown = (e) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.ox + e.clientX - dragRef.current.sx, y: dragRef.current.oy + e.clientY - dragRef.current.sy });
  };
  const onMouseUp = () => { dragRef.current = null; };

  const resetView = () => { setZoom(0.82); setPan({ x: 0, y: 0 }); };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-100 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal wrapper */}
      <div className="fixed inset-0 z-101 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-6xl pointer-events-auto overflow-hidden flex flex-col"
          style={{ height: '90vh' }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                <Network className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">Mind Map</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Click nodes to expand/collapse · Scroll to zoom · Drag to pan</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Zoom out */}
              <button
                title="Zoom out"
                onClick={() => setZoom(z => Math.max(0.15, parseFloat((z - 0.12).toFixed(2))))}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-10 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              {/* Zoom in */}
              <button
                title="Zoom in"
                onClick={() => setZoom(z => Math.min(3, parseFloat((z + 0.12).toFixed(2))))}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              {/* Reset view */}
              <button
                title="Reset view"
                onClick={resetView}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              {/* Fullscreen */}
              <button
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={() => {
                  if (!isFullscreen) {
                    modalRef.current?.requestFullscreen();
                    resetView();
                  } else {
                    document.exitFullscreen();
                  }
                }}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
              {/* Close */}
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Canvas ── */}
          <div
            ref={containerRef}
            className="flex-1 overflow-hidden relative bg-slate-50 dark:bg-slate-950 min-h-0"
            style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={e => {
              if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                pinchRef.current = { startDist: Math.hypot(dx, dy), startZoom: zoom };
                dragRef.current = null;
              } else if (e.touches.length === 1) {
                dragRef.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, ox: pan.x, oy: pan.y };
              }
            }}
            onTouchMove={e => {
              e.preventDefault();
              if (e.touches.length === 2 && pinchRef.current) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                setZoom(Math.min(3, Math.max(0.15, parseFloat((pinchRef.current.startZoom * dist / pinchRef.current.startDist).toFixed(2)))));
              } else if (e.touches.length === 1 && dragRef.current) {
                setPan({ x: dragRef.current.ox + e.touches[0].clientX - dragRef.current.sx, y: dragRef.current.oy + e.touches[0].clientY - dragRef.current.sy });
              }
            }}
            onTouchEnd={() => { dragRef.current = null; pinchRef.current = null; }}
          >
            {/* Dot-grid background */}
            <svg
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            >
              <defs>
                <pattern id="mm-grid" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1.2" className="fill-slate-300 dark:fill-slate-800" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#mm-grid)" />
            </svg>

            {/* Zoomable / pannable container */}
            <div className="w-full h-full flex items-center justify-center" style={{ pointerEvents: 'none' }}>
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: dragRef.current ? 'none' : 'transform 0.12s ease-out',
                  willChange: 'transform',
                  pointerEvents: 'all',
                }}
              >
                <svg width={svgW} height={svgH} style={{ overflow: 'visible' }}>
                  {/* ── Links ── */}
                  <g>
                    <AnimatePresence>
                    {links.map((link) => {
                      const isRootSrc = link.source.depth === 0;
                      const c = color(link.target.depth);
                      const key = `${link.source.data._id}->${link.target.data._id}`;
                      return (
                        <motion.path
                          key={key}
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 0.45 }}
                          exit={{ pathLength: 0, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
                          transition={{ duration: 0.32, ease: 'easeOut' }}
                          d={linkPath(link, offX, offY, isRootSrc)}
                          fill="none"
                          stroke={c.stroke}
                          strokeWidth={link.target.depth === 1 ? 2 : 1.5}
                          strokeLinecap="round"
                        />
                      );
                    })}
                    </AnimatePresence>
                  </g>

                  {/* ── Nodes ── */}
                  <g>
                    <AnimatePresence>
                    {nodes.map(node => {
                      const isRoot = node.depth === 0;
                      const nw = isRoot ? ROOT_W : NODE_W;
                      const nh = isRoot ? ROOT_H : NODE_H;
                      const cx = node.y + offX;
                      const cy = node.x + offY;
                      const c = color(node.depth);
                      const hasKids = node.data._hasChildren;
                      const isCollapsed = collapsed.has(node.data._id);
                      const maxChars = isRoot ? 26 : node.depth === 1 ? 22 : 20;
                      const label = truncate(node.data.label, maxChars);
                      const fontSize = isRoot ? 13.5 : node.depth === 1 ? 12 : 11;
                      const fontWeight = isRoot ? 700 : node.depth === 1 ? 600 : 500;

                      return (
                        <motion.g
                          key={node.data._id}
                          initial={{ opacity: 0, scale: 0.55 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.55, transition: { duration: 0.18, ease: 'easeIn', delay: 0 } }}
                          transition={{ duration: 0.25, ease: [0.34, 1.4, 0.64, 1], delay: isRoot ? 0 : node.depth * 0.04 }}
                          style={{ transformBox: 'fill-box', transformOrigin: 'center', cursor: hasKids ? 'pointer' : 'default' }}
                          onClick={e => { e.stopPropagation(); if (hasKids) toggleNode(node.data._id); }}
                        >
                          {/* Drop shadow */}
                          <rect
                            x={cx - nw / 2 + 2} y={cy - nh / 2 + 3}
                            width={nw} height={nh} rx={NODE_RX}
                            fill="rgba(0,0,0,0.13)"
                          />
                          {/* Main rect */}
                          <rect
                            x={cx - nw / 2} y={cy - nh / 2}
                            width={nw} height={nh} rx={NODE_RX}
                            fill={c.fill}
                            stroke={c.stroke}
                            strokeWidth={isRoot ? 2.5 : 1.8}
                          />
                          {/* Label */}
                          <text
                            x={cx} y={cy}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={fontSize}
                            fontWeight={fontWeight}
                            fontFamily="Inter, system-ui, sans-serif"
                            fill={c.text}
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            {label}
                          </text>
                          {/* Expand / collapse badge (top-right corner of rect) */}
                          {hasKids && (
                            <g transform={`translate(${cx + nw / 2 - 1}, ${cy - nh / 2 - 1})`}>
                              <circle r={10} fill={c.stroke} />
                              <text
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={13}
                                fontWeight={700}
                                fill="#fff"
                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                              >
                                {isCollapsed ? '+' : '−'}
                              </text>
                            </g>
                          )}
                        </motion.g>
                      );
                    })}
                    </AnimatePresence>
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
