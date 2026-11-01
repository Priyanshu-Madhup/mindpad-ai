/**
 * MindSpeak — hands-free voice conversation with Midy.
 *
 * Opened from the AI Studio "MindSpeak" tile. It is NOT a separate screen: the overlay is
 * transparent so the app's own background shows through, and App.jsx collapses the sidebars
 * and the chat bar into the point where the orb is born (data-ms-wrap elements). The orb
 * then rises slowly to the centre.
 *
 * While mounted it keeps the mic open, detects when you start and stop talking, sends each
 * utterance to POST /mindspeak/turn and plays the reply as it streams back (sentence by
 * sentence, gapless, via Web Audio). The Stop button (or Space, or a tap on the orb)
 * interrupts Midy at any time. Voice detection is paused while Midy is thinking or speaking
 * so the speakers can never cut the reply off.
 *
 * Props:
 *   notebookId   string
 *   getToken     async () => Clerk JWT
 *   pdfIds       string[]   selected PDF doc_ids used as grounding context
 *   language     string     reply language (e.g. "English")
 *   origin       {x, y}     viewport point the UI collapsed into (orb start)
 *   onClose      function
 *
 * Orb palette is strictly black / grey / white (no halo or shadow); chrome uses the app's own slate theme.
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Square, Mic, MicOff, History, Trash2 } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// ── Voice-activity tuning ─────────────────────────────────────────────────────
const SPEECH_MIN_MS      = 350;    // shorter bursts are treated as noise
const SILENCE_END_MS     = 700;    // quiet this long after speech = end of turn
const MAX_UTTERANCE_MS   = 30000;
const PRE_ROLL_RESTART   = 2200;   // while idle, recycle the recorder so leading silence stays short
const PLAYBACK_RATE     = 1.08;   // a touch quicker than the voice's natural pace
const RESUME_LISTEN_MS   = 450;    // ignore the mic briefly after Midy stops so room echo is not heard as you

const PHASE_LABEL = {
  starting:  'Getting ready…',
  listening: 'Listening',
  thinking:  'Thinking',
  speaking:  'Speaking',
  error:     'Microphone unavailable',
};

// ── The orb ───────────────────────────────────────────────────────────────────
// A deformable sphere drawn on canvas in black, grey and white only. Its outline
// is a sum of slow sine waves whose amplitude follows the voice level, and a few
// soft blobs swirl inside it. `live.current` = { phase, level } is written by the
// modal and read here every frame, so React never re-renders for animation.
function Orb({ live }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf, t = 0, last = performance.now();
    let lv = 0, amp = 0.05, speed = 0.6, size = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // clientWidth ignores CSS transforms; getBoundingClientRect would read the tiny
      // size the orb has while it is still scaled down at the start of its entrance
      size = canvas.clientWidth;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const { phase, level } = live.current;

      // Target look per phase
      let target = level, tAmp = 0.05, tSpeed = 0.55;
      if (phase === 'listening') { tAmp = 0.05 + level * 0.30; tSpeed = 0.7 + level * 2.2; }
      else if (phase === 'speaking') { tAmp = 0.06 + level * 0.34; tSpeed = 1.0 + level * 2.4; }
      else if (phase === 'thinking') { target = 0.16 + 0.08 * Math.sin(now / 380); tAmp = 0.10; tSpeed = 1.5; }
      else if (phase === 'error') { target = 0; tAmp = 0.02; tSpeed = 0.2; }
      if (reduce) { tSpeed *= 0.3; tAmp *= 0.5; }

      // Ease toward the target so motion never snaps
      lv += (target - lv) * Math.min(1, dt * 9);
      amp += (tAmp - amp) * Math.min(1, dt * 6);
      speed += (tSpeed - speed) * Math.min(1, dt * 4);
      t += dt * speed;

      const W = size, H = size;
      const cx = W / 2, cy = H / 2;
      const R = W * 0.29 * (1 + 0.035 * Math.sin(now / 900) + 0.20 * lv);
      ctx.clearRect(0, 0, W, H);

      // Deformed outline
      const N = 120;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wob =
          0.50 * Math.sin(2 * a + t * 0.9) +
          0.34 * Math.sin(3 * a - t * 1.3 + 1.7) +
          0.22 * Math.sin(5 * a + t * 1.9 + 0.6) +
          0.12 * Math.sin(7 * a - t * 2.4);
        const r = R * (1 + amp * wob);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Base sphere shading: white highlight → grey → black rim
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.42, R * 0.08, cx, cy, R * 1.12);
      body.addColorStop(0.00, '#ffffff');
      body.addColorStop(0.28, '#dcdcdc');
      body.addColorStop(0.62, '#7a7a7a');
      body.addColorStop(0.88, '#262626');
      body.addColorStop(1.00, '#050505');
      ctx.fillStyle = body;
      ctx.fill();

      // Swirling blobs, clipped to the sphere
      ctx.save();
      ctx.clip();
      const blobs = [
        { fx: 0.9, fy: 1.3, px: 0.0, py: 0.5, rad: 0.78, c: '255,255,255', a: 0.70 },
        { fx: 1.4, fy: 0.8, px: 2.1, py: 1.0, rad: 0.70, c: '0,0,0',       a: 0.42 },
        { fx: 0.7, fy: 1.1, px: 4.0, py: 2.6, rad: 0.62, c: '210,210,210', a: 0.50 },
        { fx: 1.2, fy: 1.6, px: 5.2, py: 3.3, rad: 0.58, c: '20,20,20',    a: 0.40 },
      ];
      for (const b of blobs) {
        const reach = R * (0.38 + 0.22 * lv);
        const bx = cx + Math.sin(t * b.fx + b.px) * reach;
        const by = cy + Math.cos(t * b.fy + b.py) * reach;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, R * b.rad);
        g.addColorStop(0, `rgba(${b.c},${b.a})`);
        g.addColorStop(1, `rgba(${b.c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);
      }
      ctx.restore();

      // Rim light
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wob =
          0.50 * Math.sin(2 * a + t * 0.9) +
          0.34 * Math.sin(3 * a - t * 1.3 + 1.7) +
          0.22 * Math.sin(5 * a + t * 1.9 + 0.6) +
          0.12 * Math.sin(7 * a - t * 2.4);
        const r = R * (1 + amp * wob);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      rim.addColorStop(0, 'rgba(255,255,255,0.55)');
      rim.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      rim.addColorStop(1, 'rgba(255,255,255,0.25)');
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = rim;
      ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [live]);

  return <canvas ref={canvasRef} className="w-full h-full block" aria-hidden="true" />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const b64ToArrayBuffer = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const rmsOf = (analyser, buf) => {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
};

// ── Modal ─────────────────────────────────────────────────────────────────────
const RISE_DELAY = 0.9;      // s — orb is born while the UI is still collapsing into it
const UI_IN_DELAY = 2.7;     // s — controls and captions appear once the orb has settled

export default function MindSpeakModal({ notebookId, getToken, pdfIds = [], language = 'English', origin, onClose }) {
  const [phase, setPhaseState] = useState('starting');
  const [messages, setMessages] = useState([]);        // saved + live conversation
  const [showHistory, setShowHistory] = useState(false);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState('');
  const [startY, setStartY] = useState(null);          // how far below its resting place the orb is born

  const live = useRef({ phase: 'starting', level: 0 }); // read by the orb every frame
  const phaseRef = useRef('starting');
  const mutedRef = useRef(false);
  const propsRef = useRef({});
  propsRef.current = { notebookId, getToken, pdfIds, language };

  const ac = useRef({});                 // audio graph: ctx, mic analyser, out analyser…
  const vad = useRef({ resumeAt: 0 });   // voice-activity bookkeeping
  const turn = useRef({ id: 0, abort: null, sources: new Set(), nextTime: 0, streamDone: true, chain: Promise.resolve() });
  const historyEndRef = useRef(null);
  const slotRef = useRef(null);

  const setPhase = useCallback((p) => {
    phaseRef.current = p;
    live.current.phase = p;
    setPhaseState(p);
  }, []);

  // Where the orb starts: the point the sidebars and chat bar collapsed into
  useLayoutEffect(() => {
    const r = slotRef.current?.getBoundingClientRect();
    const oy = origin?.y ?? window.innerHeight - 80;
    setStartY(r ? oy - (r.top + r.height / 2) : window.innerHeight * 0.35);
  }, [origin]);

  // ── Playback ────────────────────────────────────────────────────────────────
  const backToListening = useCallback(() => {
    if (phaseRef.current === 'error') return;
    vad.current.resumeAt = performance.now() + RESUME_LISTEN_MS;
    setPhase('listening');
  }, [setPhase]);

  const maybeFinishSpeaking = useCallback(() => {
    const T = turn.current;
    if (T.streamDone && T.sources.size === 0) backToListening();
  }, [backToListening]);

  const stopAssistant = useCallback(() => {
    const T = turn.current;
    T.id += 1;                               // invalidates anything still in flight
    try { T.abort?.abort(); } catch { /* already finished */ }
    T.abort = null;
    T.sources.forEach((s) => { s.onended = null; try { s.stop(); } catch { /* not started */ } });
    T.sources.clear();
    T.nextTime = 0;
    T.streamDone = true;
    T.chain = Promise.resolve();
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.live) {
        return [...prev.slice(0, -1), { ...lastMsg, live: false, interrupted: true }];
      }
      return prev;
    });
    if (phaseRef.current !== 'error') {
      vad.current.resumeAt = performance.now() + RESUME_LISTEN_MS;
      setPhase('listening');
    }
  }, [setPhase]);

  const playChunk = useCallback(async (b64, myId) => {
    const { ctx, outGain } = ac.current;
    if (!ctx) return;
    // Browsers can leave a context suspended until a gesture; wake it before every clip
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* needs a tap */ } }
    let buffer;
    try {
      buffer = await ctx.decodeAudioData(b64ToArrayBuffer(b64));
    } catch (e) {
      console.error('[MindSpeak] could not decode audio', e);
      setNotice('Could not play the voice. Please try again.');
      return;
    }
    const T = turn.current;
    if (T.id !== myId) return;               // user pressed Stop meanwhile
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = PLAYBACK_RATE;
    src.connect(outGain);
    const startAt = Math.max(ctx.currentTime + 0.04, T.nextTime);
    src.start(startAt);
    T.nextTime = startAt + buffer.duration / PLAYBACK_RATE;
    T.sources.add(src);
    src.onended = () => { T.sources.delete(src); if (T.id === myId) maybeFinishSpeaking(); };
    if (phaseRef.current !== 'speaking') setPhase('speaking');
    if (ctx.state !== 'running') setNotice('Tap the orb to turn sound on.');
  }, [maybeFinishSpeaking, setPhase]);

  // ── One spoken turn ─────────────────────────────────────────────────────────
  const sendTurn = useCallback(async (blob) => {
    stopAssistant();
    const T = turn.current;
    const myId = T.id;
    const controller = new AbortController();
    T.abort = controller;
    T.streamDone = false;
    setNotice('');
    setPhase('thinking');

    try {
      const { notebookId: nb, getToken: gt, pdfIds: ids, language: lang } = propsRef.current;
      const form = new FormData();
      form.append('audio', blob, 'speech.webm');
      form.append('notebook_id', nb);
      form.append('selected_pdf_ids', (ids || []).join(','));
      form.append('language', lang || 'English');
      const token = await gt();
      const res = await fetch(`${BACKEND_URL}/mindspeak/turn`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!raw.startsWith('data:')) continue;
          let ev;
          try { ev = JSON.parse(raw.slice(5)); } catch { continue; }
          if (T.id !== myId) return;

          if (ev.type === 'transcript') {
            setMessages((prev) => [...prev, { role: 'user', content: ev.text }, { role: 'assistant', content: '', live: true }]);
          } else if (ev.type === 'token') {
            setMessages((prev) => {
              const lastMsg = prev[prev.length - 1];
              if (!lastMsg || lastMsg.role !== 'assistant') return prev;
              return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + ev.text }];
            });
          } else if (ev.type === 'audio') {
            T.chain = T.chain.then(() => playChunk(ev.b64, myId));
          } else if (ev.type === 'tts_error') {
            setNotice(ev.detail || 'The voice is unavailable right now.');
          } else if (ev.type === 'error') {
            setNotice(ev.detail || 'Something went wrong.');
            setMessages((prev) => {
              const lastMsg = prev[prev.length - 1];
              return lastMsg && lastMsg.role === 'assistant' && !lastMsg.content ? prev.slice(0, -1) : prev;
            });
          } else if (ev.type === 'done') {
            setMessages((prev) => {
              const lastMsg = prev[prev.length - 1];
              return lastMsg && lastMsg.role === 'assistant'
                ? [...prev.slice(0, -1), { ...lastMsg, live: false }]
                : prev;
            });
          }
        }
      }
      if (T.id !== myId) return;
      await T.chain;
      T.streamDone = true;
      maybeFinishSpeaking();
    } catch (e) {
      if (e.name === 'AbortError' || T.id !== myId) return;
      console.error('[MindSpeak]', e);
      setNotice(e.message || 'Connection problem. Please try again.');
      T.streamDone = true;
      backToListening();
    }
  }, [backToListening, maybeFinishSpeaking, playChunk, setPhase, stopAssistant]);

  // ── Microphone + voice-activity detection ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let stream, loop, recStart = 0;
    const V = vad.current;
    Object.assign(V, { floor: 0.012, speaking: false, speechStart: 0, lastLoud: 0, loudSince: 0, discard: false, chunks: [], resumeAt: 0 });

    // Create the audio context right now, while the click that opened MindSpeak still
    // counts as a user gesture — otherwise the browser can keep playback muted.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    ctx.resume?.().catch(() => {});
    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 1024;
    const outGain = ctx.createGain();
    outGain.gain.value = 1.3;   // the voice peaks near 47 % of full scale; a modest lift keeps it clear without clipping
    outGain.connect(outAnalyser);
    outAnalyser.connect(ctx.destination);
    ac.current = { ctx, outAnalyser, outGain };

    const startRecorder = () => {
      if (!stream || cancelled) return;
      const rec = new MediaRecorder(stream);
      V.chunks = [];
      V.discard = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) V.chunks.push(e.data); };
      rec.onstop = () => {
        const chunks = V.chunks;
        V.chunks = [];
        if (!V.discard && V.sendOnStop && chunks.length) {
          V.sendOnStop = false;
          sendTurn(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        }
        V.sendOnStop = false;
        if (!cancelled) startRecorder();
      };
      rec.start();
      V.rec = rec;
      recStart = performance.now();
    };

    const endUtterance = (send) => {
      V.speaking = false;
      V.discard = !send;
      V.sendOnStop = send;
      V.lastLoud = 0;
      V.loudSince = 0;
      try { V.rec?.stop(); } catch { /* recorder already inactive */ }
    };
    V.endUtterance = endUtterance;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        const micAnalyser = ctx.createAnalyser();
        micAnalyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(micAnalyser);
        ac.current = { ...ac.current, micAnalyser, stream };

        const micBuf = new Float32Array(micAnalyser.fftSize);
        const outBuf = new Float32Array(outAnalyser.fftSize);

        startRecorder();
        setPhase('listening');

        loop = setInterval(() => {
          const now = performance.now();
          const ph = phaseRef.current;
          const micLevel = mutedRef.current ? 0 : rmsOf(micAnalyser, micBuf);

          // Orb level: your voice while listening, Midy's while speaking
          const raw = ph === 'speaking' ? rmsOf(outAnalyser, outBuf) * 5 : micLevel * 7;
          live.current.level = Math.min(1, raw);

          // Only hear the mic while it is the user's turn — Midy's own voice coming out
          // of the speakers must never be mistaken for the user (or cut the reply off).
          if (mutedRef.current || ph !== 'listening' || now < V.resumeAt) {
            V.speaking = false;
            V.loudSince = 0;
            if (now - recStart > PRE_ROLL_RESTART) {      // keep the idle recording short
              V.discard = true;
              try { V.rec?.stop(); } catch { /* recorder already inactive */ }
            }
            return;
          }

          if (!V.speaking) {
            V.floor = V.floor * 0.97 + micLevel * 0.03;           // follow room noise
            const onset = Math.max(0.028, V.floor * 3);
            if (micLevel > onset) {
              V.loudSince = V.loudSince || now;
              if (now - V.loudSince >= 90) {
                V.speaking = true;
                V.speechStart = V.loudSince;
                V.lastLoud = now;
              }
            } else {
              V.loudSince = 0;
              if (now - recStart > PRE_ROLL_RESTART) {            // keep leading silence short
                V.discard = true;
                try { V.rec?.stop(); } catch { /* recorder already inactive */ }
              }
            }
          } else {
            const hold = Math.max(0.016, V.floor * 1.8);
            if (micLevel > hold) V.lastLoud = now;
            const spokeFor = now - V.speechStart;
            if (now - V.lastLoud > SILENCE_END_MS || spokeFor > MAX_UTTERANCE_MS) {
              endUtterance(spokeFor >= SPEECH_MIN_MS);
            }
          }
        }, 40);
      } catch (e) {
        console.error('[MindSpeak mic]', e);
        if (!cancelled) {
          setNotice('Allow microphone access in your browser to talk with Midy.');
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(loop);
      V.discard = true;
      try { V.rec?.stop(); } catch { /* recorder already inactive */ }
      stream?.getTracks().forEach((t) => t.stop());
      stopAssistant();
      ctx.close().catch(() => {});
      ac.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Saved conversation ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${BACKEND_URL}/notebooks/${notebookId}/mindspeak`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setMessages((prev) => [
          ...(data.messages || []).map((m) => ({ role: m.role, content: m.content, interrupted: m.interrupted })),
          ...prev,
        ]);
      } catch { /* history is a nice-to-have */ }
    })();
    return () => { alive = false; };
  }, [notebookId, getToken]);

  useEffect(() => {
    if (showHistory) historyEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, showHistory]);

  const clearHistory = async () => {
    setMessages([]);
    try {
      const token = await getToken();
      await fetch(`${BACKEND_URL}/notebooks/${notebookId}/mindspeak`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
  };

  // ── Controls ────────────────────────────────────────────────────────────────
  const handleStop = () => {
    stopAssistant();
    vad.current.endUtterance?.(false);       // also drop anything you were mid-way through saying
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    ac.current.stream?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    if (next) vad.current.endUtterance?.(false);
  };

  // Tapping the orb: wake the speakers if the browser muted them, interrupt Midy,
  // or send what you have said so far.
  const handleOrbTap = () => {
    const { ctx } = ac.current;
    if (ctx && ctx.state !== 'running') ctx.resume().then(() => setNotice('')).catch(() => {});
    const ph = phaseRef.current;
    if (ph === 'speaking' || ph === 'thinking') handleStop();
    else if (ph === 'listening' && vad.current.speaking) vad.current.endUtterance?.(true);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === ' ' && (phaseRef.current === 'speaking' || phaseRef.current === 'thinking')) {
        e.preventDefault();
        handleStop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // ── Caption under the orb ───────────────────────────────────────────────────
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  let caption = '';
  if (phase === 'speaking' || (phase === 'thinking' && lastAssistant?.live)) caption = lastAssistant?.content || '';
  else if (phase === 'thinking') caption = lastUser?.content || '';
  else if (notice) caption = notice;
  else if (phase === 'listening') caption = messages.length ? 'Go ahead — I’m listening.' : 'Say something to begin.';
  else if (phase === 'error') caption = notice;
  if (caption.length > 260) caption = '…' + caption.slice(-260);

  const busy = phase === 'thinking' || phase === 'speaking';
  const chromeIn = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.25 } } };

  return (
    // Transparent on purpose: the app's own background (light / dark / black) shows through,
    // so this feels like the same screen, not a new one. Starts below the navbar.
    <motion.div
      className="fixed inset-x-0 bottom-0 top-[57px] z-[60] flex flex-col overflow-hidden select-none text-slate-900 dark:text-slate-100"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      role="dialog"
      aria-label="MindSpeak voice conversation"
    >
      {/* Header */}
      <motion.div
        {...chromeIn}
        transition={{ duration: 0.5, delay: UI_IN_DELAY }}
        className="relative z-10 flex items-center justify-between px-5 sm:px-8 pt-4"
      >
        <div>
          <p className="font-display font-bold text-sm tracking-widest uppercase text-slate-700 dark:text-slate-200">MindSpeak</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {pdfIds.length ? `Grounded in ${pdfIds.length} selected document${pdfIds.length > 1 ? 's' : ''}` : 'Open conversation'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`p-2.5 rounded-full transition-colors ${showHistory ? 'bg-slate-900 text-white dark:bg-white dark:text-black' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            aria-label="Conversation history"
            title="Conversation history"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close MindSpeak"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* Orb + status */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0 px-6">
        <div ref={slotRef} className="relative w-[min(78vw,46vh,440px)] aspect-square">
          {startY !== null && (
            <motion.button
              onClick={handleOrbTap}
              data-ms-orb
              className="absolute inset-0 cursor-default focus:outline-none"
              aria-label={PHASE_LABEL[phase]}
              initial={{ opacity: 0, scale: 0.1, y: startY }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}   // the three blobs in App.jsx take over from here
              transition={{
                opacity: { duration: 0.7, delay: 0.45 },
                scale:   { duration: 2.1, delay: 0.45, ease: [0.22, 1, 0.36, 1] },
                y:       { duration: 2.6, delay: RISE_DELAY, ease: [0.45, 0, 0.15, 1] },
              }}
            >
              <Orb live={live} />
            </motion.button>
          )}
        </div>

        <motion.div {...chromeIn} transition={{ duration: 0.6, delay: UI_IN_DELAY }} className="flex flex-col items-center w-full">
          <div className="mt-2 h-5 flex items-center gap-2">
            <motion.span
              key={phase}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500"
            >
              {PHASE_LABEL[phase]}
            </motion.span>
          </div>

          <div className="mt-4 h-24 w-full max-w-xl flex items-start justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={phase + (caption ? caption.slice(0, 1) : '')}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`text-center text-[15px] leading-relaxed ${phase === 'speaking' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {caption}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Controls */}
      <motion.div
        {...chromeIn}
        transition={{ duration: 0.6, delay: UI_IN_DELAY }}
        className="relative z-10 pb-8 sm:pb-10 flex items-center justify-center gap-5"
      >
        <button
          onClick={toggleMute}
          disabled={phase === 'error'}
          className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors disabled:opacity-30 ${
            muted
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-black dark:border-white'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
          }`}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <motion.button
          onClick={handleStop}
          whileTap={{ scale: 0.94 }}
          animate={{ opacity: busy ? 1 : 0.55 }}
          transition={{ duration: 0.25 }}
          className={`h-14 px-7 rounded-full flex items-center gap-2.5 font-bold text-xs uppercase tracking-widest transition-colors ${
            busy
              ? 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-black dark:hover:bg-slate-200'
              : 'bg-white dark:bg-slate-900 text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
          }`}
          aria-label="Stop"
          title="Stop (Space)"
        >
          <Square className="w-4 h-4 fill-current" />
          Stop
        </motion.button>
      </motion.div>

      {/* History drawer */}
      <AnimatePresence>
        {showHistory && (
          <motion.aside
            key="history"
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="absolute z-20 top-0 right-0 bottom-0 w-full sm:w-[360px] bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border-l border-slate-100 dark:border-slate-800 flex flex-col"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Saved conversation</p>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clearHistory} className="p-2 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" title="Clear conversation" aria-label="Clear conversation">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setShowHistory(false)} className="p-2 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors" aria-label="Close history">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.length === 0 && (
                <p className="text-xs text-slate-400 text-center mt-10">Your voice conversations with this notebook are saved here.</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{m.role === 'user' ? 'You' : 'Midy'}</p>
                  <p className={`inline-block max-w-[90%] text-[13px] leading-relaxed px-3.5 py-2 rounded-2xl text-left ${
                    m.role === 'user'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                  }`}>
                    {m.content || '…'}
                    {m.interrupted && <span className="block text-[10px] text-slate-400 mt-1">interrupted</span>}
                  </p>
                </div>
              ))}
              <div ref={historyEndRef} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
