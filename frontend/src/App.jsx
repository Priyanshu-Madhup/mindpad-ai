/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Bell,
  Plus,
  BookOpen,
  HelpCircle,
  Settings,
  Paperclip,
  Mic,
  ArrowUp,
  Sparkles,
  User,
  Network,
  Podcast,
  Video,
  Film,
  Layers,
  Menu,
  X,
  Trash2,
  Pencil,
  Check,
  Moon,
  Sun,
  PanelLeft,
  PanelRight,
  Wand2,
  Image as ImageIcon,
  HelpCircle as QuizIcon,
  Copy,
  Volume2,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  Microscope,
  MicOff,
  Globe,
  Languages,
  Upload,
  Link,
  StopCircle,
  LayoutDashboard,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Brain,
  Crown,
  Tag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Show,
  UserButton,
  SignInButton,
  SignUpButton,
  useUser,
  useAuth,
  useClerk,
} from '@clerk/react';
import LandingPage from './LandingPage.jsx';
import MindMapModal from './MindMapModal.jsx';
import VideoSuggestionsModal from './VideoSuggestionsModal.jsx';
import FlashcardsModal from './FlashcardsModal.jsx';
import VisualPodcastModal from './VisualPodcastModal.jsx';
import AudioPodcastModal from './AudioPodcastModal.jsx';
import QuizModal from './QuizModal.jsx';
import PreferencesModal from './PreferencesModal.jsx';
import CouponManagerModal from './CouponManagerModal.jsx';
import PricingModal from './PricingModal.jsx';
import PaymentPage from './PaymentPage.jsx';
import GuidedTour from './GuidedTour.jsx';
import mindpadLogo from './mindpad_ai_logo.png';
import mindpadLogoDark from './mindpad_ai_logo_dark.png';
import { storage } from './firebase.jsx';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ' },
];

const SidebarItem = ({ icon: Icon, label, active = false, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-2.5 transition-colors rounded-lg group w-full text-left ${active
        ? 'text-slate-900 dark:text-slate-100 font-bold bg-slate-200/50 dark:bg-white/5'
        : 'text-slate-500 dark:text-slate-500 font-medium hover:bg-slate-200/50 dark:hover:bg-white/5'
      }`}
  >
    <Icon className={`w-5 h-5 ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`} />
    <span className="text-sm truncate">{label}</span>
  </button>
);

const StudioTool = ({ icon: Icon, label, onClick, loading = false, done = false, onAnimationComplete, externalFlash = false, onExternalFlashDone, suppressClickFlash = false }) => {
  const [flash, setFlash] = React.useState(false);
  // Trigger flash from outside (e.g. after user confirms config)
  React.useEffect(() => {
    if (externalFlash) {
      setFlash(true);
      const t = setTimeout(() => { setFlash(false); onExternalFlashDone?.(); }, 900);
      return () => clearTimeout(t);
    }
  }, [externalFlash]);
  const handleClick = () => {
    if (!suppressClickFlash) {
      setFlash(true);
      setTimeout(() => { setFlash(false); onAnimationComplete?.(); }, 900);
    }
    onClick?.();
  };
  return (
    <button
      onClick={handleClick}
      className="relative aspect-square bg-white dark:bg-slate-800 rounded-lg p-4 flex flex-col items-center justify-center text-center gap-3 hover:shadow-md transition-all border border-slate-100 dark:border-slate-700 group"
    >
      {done && (
        <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-800" />
      )}
      {/* One-shot perimeter trace on click */}
      <AnimatePresence>
        {flash && (
          <motion.svg
            key="flash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: '0.5rem', overflow: 'hidden' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M 10,1.5 H 90 Q 98.5,1.5 98.5,10 V 90 Q 98.5,98.5 90,98.5 H 10 Q 1.5,98.5 1.5,90 V 10 Q 1.5,1.5 10,1.5 Z"
              fill="none"
              stroke="#0D1B2A"
              strokeWidth="3.5"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.85, ease: 'easeInOut' }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
      <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-700/60 flex items-center justify-center group-hover:bg-primary/5 dark:group-hover:bg-slate-600/60 transition-colors">
        <Icon className="w-6 h-6 text-primary dark:text-slate-300" />
      </div>
      <span className="text-[10px] font-bold font-display text-primary dark:text-slate-300 uppercase tracking-tight">{label}</span>
    </button>
  );
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';


export default function App() {
  const { isSignedIn, isLoaded, user } = useUser();
  const { getToken } = useAuth();
  const { openSignIn, openSignUp } = useClerk();
  const [view, setView] = useState('landing');

  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [leftOpen, setLeftOpen] = useState(true);         // desktop left sidebar
  const [rightOpen, setRightOpen] = useState(true);       // desktop right sidebar
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false); // mobile right drawer
  const [isMd, setIsMd] = useState(() => window.innerWidth >= 768);  // ≥md breakpoint
  const [isLg, setIsLg] = useState(() => window.innerWidth >= 1024); // ≥lg breakpoint
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false); // mobile input-bar tools popover
  const [showSettings, setShowSettings] = useState(false);
  // colorMode: 'light' | 'dark' (navy) | 'black' (OLED true black)
  const [colorMode, setColorMode] = useState(() => {
    const saved = localStorage.getItem('mindpad_color_mode');
    if (saved === 'dark' || saved === 'black' || saved === 'light') return saved;
    // Legacy migration: if old 'mindpad_dark' was true, default to 'dark'
    return localStorage.getItem('mindpad_dark') === 'true' ? 'dark' : 'light';
  });
  const [isResearchMode, setIsResearchMode] = useState(() => localStorage.getItem('mindpad_research') === 'true');
  const [isDeepResearch, setIsDeepResearch] = useState(() => localStorage.getItem('mindpad_deep_research') === 'true');
  const [isMultimediaRetrieval, setIsMultimediaRetrieval] = useState(() => localStorage.getItem('mindpad_multimedia_retrieval') === 'true');
  const [isDeepResearching, setIsDeepResearching] = useState(false); // true while scraping pipeline runs
  const [isWebSearch, setIsWebSearch] = useState(false);
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [responseStyle, setResponseStyle] = useState(() => localStorage.getItem('mindpad_response_style') || '');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState(null); // index of message being synthesized
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);     // index of message whose text was copied
  const [openSourceKey, setOpenSourceKey] = useState(null);   // "msgIdx-srcIdx" for source popover on touch
  const [openNotebookId, setOpenNotebookId] = useState(null); // which notebook's PDF drawer is open
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sourceModalTargetId, setSourceModalTargetId] = useState(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  // ── Insight Canvas ──────────────────────────────────────────────────────────
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  // insightCanvasImages: { [notebookId]: imageUrl } — persists per notebook while session is active
  const [insightCanvasImages, setInsightCanvasImages] = useState({});
  const [showInsightModal, setShowInsightModal] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const canvasDragRef = useRef(null); // { startX, startY, originPanX, originPanY }
  const canvasContainerRef = useRef(null);
  const canvasPinchRef = useRef(null); // { startDist, startZoom }
  const canvasModalRef = useRef(null); // ref to the modal element for fullscreen API
  const [canvasIsFullscreen, setCanvasIsFullscreen] = useState(false);

  // ── Mind Map ────────────────────────────────────────────────────────────────
  const [isGeneratingMindMap, setIsGeneratingMindMap] = useState(false);
  // mindMapData: { [notebookId]: treeObject }
  const [mindMapData, setMindMapData] = useState({});
  const [showMindMapModal, setShowMindMapModal] = useState(false);

  // Video suggestions state
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [videoSuggestionsData, setVideoSuggestionsData] = useState({});
  // videoSuggestionsData: { [notebookId]: { videos, queries, topic } }

  // Flashcards state
  const [showFlashcardsModal, setShowFlashcardsModal] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [flashcardsData, setFlashcardsData] = useState({});
  // flashcardsData: { [notebookId]: { cards: [{question, answer}], topic } }

  // Visual Podcast state
  const [showVisualPodcastModal, setShowVisualPodcastModal] = useState(false);
  const [visualPodcastData, setVisualPodcastData] = useState({});
  // visualPodcastData: { [notebookId]: firebaseUrl }
  const [isGeneratingVisualPodcast, setIsGeneratingVisualPodcast] = useState(false);
  const [visualPodcastResults, setVisualPodcastResults] = useState({});
  // visualPodcastResults: { [notebookId]: { video_b64, slides, topic } }
  const [visualPodcastCardFlash, setVisualPodcastCardFlash] = useState(false); // triggers perimeter animation after config
  const [visualPodcastProgress, setVisualPodcastProgress] = useState({});
  // visualPodcastProgress: { [notebookId]: { slide: N, total: M, heading: '...' } }

  // Quiz state
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizData, setQuizData] = useState({}); // { [notebookId]: { questions, topic, difficulty } }
  const [quizCardFlash, setQuizCardFlash] = useState(false); // perimeter animation after settings confirm

  // Audio Podcast state
  const [showAudioPodcastModal, setShowAudioPodcastModal] = useState(false);
  const [audioPodcastData, setAudioPodcastData] = useState({});
  // audioPodcastData: { [notebookId]: firebaseUrl }
  const [isGeneratingAudioPodcast, setIsGeneratingAudioPodcast] = useState(false);
  const [audioPodcastResults, setAudioPodcastResults] = useState({});
  // audioPodcastResults: { [notebookId]: { audio_b64, script, topic, word_count } }
  // notebookPdfs: { [notebookId]: [{ doc_id, name, size, total_tokens, chunk_count, selected }] }
  const [notebookPdfs, setNotebookPdfs] = useState({});
  const [uploadingPdf, setUploadingPdf] = useState(false); // uploading+indexing in progress
  const pdfInputRef = useRef(null);
  const pdfUploadTargetRef = useRef(null);
  const streamReaderRef = useRef(null); // holds active stream reader so it can be cancelled
  const twQueueRef = useRef([]);   // characters waiting to be typed
  const twIntervalRef = useRef(null); // 5ms typewriter interval
  const twDisplayRef = useRef('');   // accumulated displayed text
  const studioScrollRef = useRef(null); // right sidebar scrollable container
  const [pdfInfoTooltip, setPdfInfoTooltip] = useState(null); // { pdf, x, y }

  // ── Notion integration ──────────────────────────────────────────────────────
  const [notionStatus, setNotionStatus] = useState(null); // null | { connected, workspace_name, workspace_icon }
  const [notionPages, setNotionPages] = useState([]);
  const [loadingNotionPages, setLoadingNotionPages] = useState(false);
  const [showNotionModal, setShowNotionModal] = useState(false);
  const [syncingPageId, setSyncingPageId] = useState(null); // page_id being synced
  const [notionToast, setNotionToast] = useState(null);     // { type: 'success'|'error', msg }
  const [notionImportTargetId, setNotionImportTargetId] = useState(null); // notebook to import into (null = create new)

  // ── Help popover + tour restart ───────────────────────────────────────
  const [showHelp, setShowHelp] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  // ── Preferences modal ────────────────────────────────────────────────────
  const [showPreferences, setShowPreferences] = useState(false);
  const [showCouponManager, setShowCouponManager] = useState(false);
  const [showPricing, setShowPricing]         = useState(false);
  const [selectedPlan, setSelectedPlan]       = useState(null);

  // ── Subscription plan ─────────────────────────────────────────────────────
  // Initialized from localStorage so the badge survives page refreshes instantly.
  // The API call in fetchMyPlan() validates and updates the cache on every login.
  const [userPlan, setUserPlan] = useState(() => {
    try { return localStorage.getItem('mindpad_user_plan') || 'free'; }
    catch { return 'free'; }
  });

  // ── Notifications ──────────────────────────────────────────────────────────
  const ADMIN_EMAIL = 'priyanshumadhup@gmail.com';
  const userEmail = user?.primaryEmailAddress?.emailAddress || '';
  const isAdmin = userEmail === ADMIN_EMAIL;
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [kbSearch, setKbSearch] = useState('');
  const [showKbDropdown, setShowKbDropdown] = useState(false);
  const [dismissedNotifs, setDismissedNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mindpad_dismissed_notifs') || '[]'); }
    catch { return []; }
  });
  const [newNotifTitle, setNewNotifTitle] = useState('');
  const [newNotifMessage, setNewNotifMessage] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const visibleNotifs = notifications.filter(n => !dismissedNotifs.includes(n.id));
  const unreadCount = visibleNotifs.length;

  // ── Notion helpers ─────────────────────────────────────────────────────────
  const fetchNotionStatus = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/notion/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotionStatus(data);
      }
    } catch { }
  }, [getToken]);

  const connectNotion = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/notion/connect`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { auth_url } = await res.json();
        window.location.href = auth_url;
      }
    } catch (err) {
      console.error('[Notion connect]', err);
    }
  };

  const disconnectNotion = async () => {
    try {
      const token = await getToken();
      await fetch(`${BACKEND_URL}/notion/disconnect`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotionStatus({ connected: false });
      setNotionPages([]);
      setNotionToast({ type: 'success', msg: 'Notion workspace disconnected.' });
      setTimeout(() => setNotionToast(null), 3500);
    } catch (err) {
      console.error('[Notion disconnect]', err);
    }
  };

  const openNotionPages = async () => {
    setShowNotionModal(true);
    if (notionPages.length > 0) return; // already loaded
    setLoadingNotionPages(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/notion/pages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotionPages(data.pages || []);
      }
    } catch (err) {
      console.error('[Notion pages]', err);
    } finally {
      setLoadingNotionPages(false);
    }
  };

  const syncNotionPage = async (pageId, pageTitle) => {
    setSyncingPageId(pageId);
    const targetNotebookId = notionImportTargetId; // capture before clearing
    setNotionImportTargetId(null);
    try {
      const token = await getToken();
      const body = { page_id: pageId, page_title: pageTitle };
      if (targetNotebookId) body.notebook_id = targetNotebookId;
      const res = await fetch(`${BACKEND_URL}/notion/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNotionModal(false);
        setNotionPages([]);
        await loadNotebooks();
        const notebookId = targetNotebookId || data.notebook_id;
        if (notebookId) {
          await Promise.all([loadHistory(notebookId), loadPdfs(notebookId)]);
          setActiveNotebookId(notebookId);
        }
        const successMsg = targetNotebookId
          ? `"${pageTitle}" added as a source!`
          : `"${pageTitle}" synced as a new notebook!`;
        setNotionToast({ type: 'success', msg: successMsg });
        setTimeout(() => setNotionToast(null), 4000);
      } else {
        const err = await res.json().catch(() => ({}));
        setNotionToast({ type: 'error', msg: err.detail || 'Sync failed. Try again.' });
        setTimeout(() => setNotionToast(null), 4000);
      }
    } catch (err) {
      console.error('[Notion sync]', err);
      setNotionToast({ type: 'error', msg: 'Sync failed. Check console for details.' });
      setTimeout(() => setNotionToast(null), 4000);
    } finally {
      setSyncingPageId(null);
    }
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch { }
  }, [getToken]);

  const dismissNotif = (id) => {
    const updated = [...dismissedNotifs, id];
    setDismissedNotifs(updated);
    localStorage.setItem('mindpad_dismissed_notifs', JSON.stringify(updated));
  };

  const deleteNotifForAll = async (id) => {
    try {
      const token = await getToken();
      await fetch(`${BACKEND_URL}/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Remove from local state too
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('[Delete notif]', err);
    }
  };

  const sendNotification = async () => {
    if (!newNotifTitle.trim() || !newNotifMessage.trim()) return;
    setSendingNotif(true);
    try {
      const token = await getToken();
      await fetch(`${BACKEND_URL}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newNotifTitle.trim(), message: newNotifMessage.trim() }),
      });
      setNewNotifTitle('');
      setNewNotifMessage('');
      await fetchNotifications();
    } finally {
      setSendingNotif(false);
    }
  };

  const broadcastEmail = async () => {
    if (!newNotifTitle.trim() || !newNotifMessage.trim()) return;
    if (!window.confirm(`Send email to ALL users?\nSubject: ${newNotifTitle.trim()}`)) return;
    setSendingBroadcast(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/broadcast-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: newNotifTitle.trim(), body: newNotifMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      alert(`✅ Email sent to ${data.recipients} recipient(s).`);
    } catch (err) {
      alert(`❌ Broadcast failed: ${err.message}`);
    } finally {
      setSendingBroadcast(false);
    }
  };

  // Track breakpoints for sidebar spring-margin push
  useEffect(() => {
    const md = window.matchMedia('(min-width: 768px)');
    const lg = window.matchMedia('(min-width: 1024px)');
    const onMd = (e) => setIsMd(e.matches);
    const onLg = (e) => setIsLg(e.matches);
    md.addEventListener('change', onMd);
    lg.addEventListener('change', onLg);
    return () => { md.removeEventListener('change', onMd); lg.removeEventListener('change', onLg); };
  }, []);

  // Apply color mode classes on mount and toggle
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', colorMode === 'dark' || colorMode === 'black');
    root.classList.toggle('black', colorMode === 'black');
    localStorage.setItem('mindpad_color_mode', colorMode);
  }, [colorMode]);

  // Persist research mode + deep research preference
  useEffect(() => {
    localStorage.setItem('mindpad_research', isResearchMode);
  }, [isResearchMode]);

  useEffect(() => {
    localStorage.setItem('mindpad_deep_research', isDeepResearch);
  }, [isDeepResearch]);

  // Close source popover when tapping outside (mobile)
  useEffect(() => {
    if (!openSourceKey) return;
    const handler = (e) => {
      if (!e.target.closest('[data-source-popover]')) {
        setOpenSourceKey(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [openSourceKey]);

  // Fetch notifications when signed in
  useEffect(() => {
    if (isSignedIn) fetchNotifications();
  }, [isSignedIn, fetchNotifications]);

  // Fetch Notion connection status when signed in
  useEffect(() => {
    if (isSignedIn) fetchNotionStatus();
  }, [isSignedIn, fetchNotionStatus]);

  // Handle ?notion=connected / ?notion=error redirect from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notionParam = params.get('notion');
    if (!notionParam) return;
    // Strip the query param from the URL without a page reload
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);
    if (notionParam === 'connected') {
      fetchNotionStatus();
      setNotionToast({ type: 'success', msg: 'Notion workspace connected successfully!' });
      setTimeout(() => setNotionToast(null), 4000);
    } else if (notionParam === 'error') {
      const reason = params.get('reason') || 'unknown';
      setNotionToast({ type: 'error', msg: `Notion connection failed: ${reason.replace(/_/g, ' ')}.` });
      setTimeout(() => setNotionToast(null), 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notebooks state
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [editingNotebookId, setEditingNotebookId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const loadingNotebooksRef = useRef(false); // guard: prevent concurrent loadNotebooks calls

  // ── Voice recording (Speech-to-Text) ──────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');
          const token = await getToken();
          const res = await fetch(`${BACKEND_URL}/transcribe`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          if (res.ok) {
            const data = await res.json();
            if (data.text) setMessage(prev => prev ? `${prev} ${data.text}` : data.text);
          }
        } catch (err) {
          console.error('[STT]', err);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('[Mic]', err);
      alert('Microphone access denied. Please allow microphone in browser settings.');
    }
  };

  const chatEndRef = React.useRef(null);
  const chatScrollRef = React.useRef(null);
  const fileInputRef = React.useRef(null);

  const [attachedImage, setAttachedImage] = useState(null); // { dataUrl, base64, mimeType, name }

  // Load notebooks when manually navigating to workspace (e.g. after sign-in button press).
  // The auth effect below already handles the automatic sign-in case directly.
  useEffect(() => {
    if (view === 'workspace' && isSignedIn && isLoaded && !loadingNotebooksRef.current) {
      loadNotebooks();
    }
  }, [view]);

  const loadNotebooks = async () => {
    if (loadingNotebooksRef.current) return; // already in flight
    loadingNotebooksRef.current = true;
    try {
      // getToken() may return null briefly when Clerk is freshly hydrated from a
      // cached session (page load / mobile). Retry once after 1 s before giving up.
      let token = await getToken();
      if (!token) {
        await new Promise(r => setTimeout(r, 1000));
        token = await getToken();
      }
      if (!token) return;
      const userEmail = user?.primaryEmailAddress?.emailAddress || '';
      const resp = await fetch(`${BACKEND_URL}/notebooks`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(userEmail && { 'X-User-Email': userEmail }),
        },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const list = data.notebooks || [];
      setNotebooks(list);

      // Sync plan from backend (includes auto-downgrade check)
      if (data.plan) setUserPlan(data.plan);

      // Restore persisted Insight Canvas URLs for all notebooks
      const savedCanvases = {};
      list.forEach(nb => { if (nb.insight_canvas_url) savedCanvases[nb.id] = nb.insight_canvas_url; });
      if (Object.keys(savedCanvases).length > 0) {
        setInsightCanvasImages(prev => ({ ...savedCanvases, ...prev }));
      }

      // Restore persisted Mind Map data for all notebooks
      const savedMaps = {};
      list.forEach(nb => { if (nb.mind_map_data) savedMaps[nb.id] = nb.mind_map_data; });
      if (Object.keys(savedMaps).length > 0) {
        setMindMapData(prev => ({ ...savedMaps, ...prev }));
      }

      // Restore persisted Video Suggestions data for all notebooks
      const savedVideos = {};
      list.forEach(nb => { if (nb.video_suggestions_data) savedVideos[nb.id] = nb.video_suggestions_data; });
      if (Object.keys(savedVideos).length > 0) {
        setVideoSuggestionsData(prev => ({ ...savedVideos, ...prev }));
      }

      // Restore persisted Flashcards data for all notebooks
      const savedCards = {};
      list.forEach(nb => { if (nb.flashcards_data) savedCards[nb.id] = nb.flashcards_data; });
      if (Object.keys(savedCards).length > 0) {
        setFlashcardsData(prev => ({ ...savedCards, ...prev }));
      }

      // Restore persisted Visual Podcast URLs for all notebooks
      const savedPodcasts = {};
      list.forEach(nb => { if (nb.visual_podcast_url) savedPodcasts[nb.id] = nb.visual_podcast_url; });
      if (Object.keys(savedPodcasts).length > 0) {
        setVisualPodcastData(prev => ({ ...savedPodcasts, ...prev }));
      }

      // Restore persisted Audio Podcast URLs for all notebooks
      const savedAudioPodcasts = {};
      list.forEach(nb => { if (nb.audio_podcast_url) savedAudioPodcasts[nb.id] = nb.audio_podcast_url; });
      if (Object.keys(savedAudioPodcasts).length > 0) {
        setAudioPodcastData(prev => ({ ...savedAudioPodcasts, ...prev }));
      }

      // Restore persisted Quiz data for all notebooks
      const savedQuiz = {};
      list.forEach(nb => {
        if (nb.quiz_data && nb.quiz_data.questions?.length > 0) {
          savedQuiz[nb.id] = {
            questions: nb.quiz_data.questions,
            topic: nb.quiz_data.topic || '',
            difficulty: nb.quiz_data.difficulty || 'medium',
            evaluations: nb.quiz_data.evaluations || [],
            currentQ: nb.quiz_data.current_q || 0,
          };
        }
      });
      if (Object.keys(savedQuiz).length > 0) {
        setQuizData(prev => ({ ...savedQuiz, ...prev }));
      }

      if (list.length === 0) {
        // Auto-create first notebook
        await createNotebook('My Workspace', true);
      } else {
        // Open the most recently created notebook (last in ASC sorted list)
        const last = list[list.length - 1];
        setActiveNotebookId(last.id);
        await Promise.all([loadHistory(last.id), loadPdfs(last.id)]);
      }
    } catch (err) {
      console.error('Failed to load notebooks:', err);
    } finally {
      loadingNotebooksRef.current = false;
    }
  };

  const createNotebook = async (name = 'Untitled Notebook', silent = false) => {
    try {
      const token = await getToken();
      if (!token) return;
      const resp = await fetch(`${BACKEND_URL}/notebooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (!resp.ok) return;
      const nb = await resp.json();
      const newNb = { id: nb.id, name: nb.name, updated_at: new Date().toISOString() };
      setNotebooks(prev => [...prev, newNb]); // append to end — preserve creation order
      setActiveNotebookId(nb.id);
      setChatHistory([]);
      if (!silent) setSidebarOpen(false);
    } catch (err) {
      console.error('Failed to create notebook:', err);
    }
  };

  // ── PDF helpers ─────────────────────────────────────────────────────────────
  const loadPdfs = async (notebookId) => {
    if (!notebookId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/pdfs/${notebookId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const pdfs = (data.pdfs || []).map(p => ({ ...p, selected: p.selected ?? true }));
      setNotebookPdfs(prev => ({ ...prev, [notebookId]: pdfs }));
    } catch (err) {
      console.error('[PDF list]', err);
    }
  };

  const uploadPdfToNotebook = async (notebookId, file) => {
    setUploadingPdf(true);
    let uploaded = null;
    try {
      const token = await getToken();
      if (!token) return null;
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${BACKEND_URL}/upload-pdf`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Notebook-Id': notebookId,
          ...(isMultimediaRetrieval ? { 'X-Multimedia-Retrieval': 'true' } : {}),
        },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`PDF upload failed: ${err.detail || res.status}`);
        return null;
      }
      const pdf = await res.json();
      setNotebookPdfs(prev => ({
        ...prev,
        [notebookId]: [{ ...pdf, selected: true }, ...(prev[notebookId] || [])],
      }));
      setOpenNotebookId(notebookId);
      uploaded = pdf;

      // ── Upload raw PDF to Firebase Storage ─────────────────────────────────
      // Skip Firebase upload only if the backend reused vectors AND a valid URL already exists.
      // If firebase_pdf_url is empty (dedup anchor after notebook deletion), re-upload the file.
      if (pdf.reused && pdf.firebase_pdf_url) {
        console.log('[Firebase] Skipping upload — PDF already indexed & stored (reused vectors).');
      } else if (pdf.doc_id && user?.id) {
        // Run in background so it doesn't block the summary display
        (async () => {
          try {
            const storagePath = `pdfs/${user.id}/${pdf.doc_id}/${file.name}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file, { contentType: 'application/pdf' });
            const firebaseUrl = await getDownloadURL(storageRef);
            console.log('[Firebase] PDF uploaded:', firebaseUrl);

            // Save Firebase URL back to MongoDB via backend
            const t = await getToken();
            if (t) {
              await fetch(`${BACKEND_URL}/pdfs/${pdf.doc_id}/firebase-url`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
                body: JSON.stringify({ firebase_pdf_url: firebaseUrl }),
              });
              console.log('[MongoDB] Firebase PDF URL saved for doc_id:', pdf.doc_id);
            }
          } catch (fbErr) {
            console.error('[Firebase PDF upload failed]', fbErr);
            // Non-fatal — Pinecone embeddings still work; PDF just won't be re-downloadable
          }
        })();
      }
      // ───────────────────────────────────────────────────────────────────────
    } catch (err) {
      console.error('[PDF upload]', err);
      alert('PDF upload failed. Check backend logs.');
    } finally {
      setUploadingPdf(false);
    }
    return uploaded;
  };

  const deletePdf = async (notebookId, docId, e) => {
    e.preventDefault();
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/pdfs/${docId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Notebook-Id': notebookId,
        },
      });

      // Update local UI immediately regardless of Firebase outcome
      setNotebookPdfs(prev => ({
        ...prev,
        [notebookId]: (prev[notebookId] || []).filter(p => p.doc_id !== docId),
      }));

      // Delete raw PDF from Firebase Storage (Pinecone vectors are kept for dedup reuse)
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const firebaseUrl = data.firebase_pdf_url;
        if (firebaseUrl) {
          (async () => {
            try {
              // Firebase Storage SDK can delete by full download URL via ref(storage, url)
              const fileRef = ref(storage, firebaseUrl);
              await deleteObject(fileRef);
              console.log('[Firebase] PDF file deleted from Storage:', docId);
            } catch (fbErr) {
              // Non-fatal — MongoDB row is already gone; orphaned file is harmless
              console.warn('[Firebase] PDF Storage delete failed (non-fatal):', fbErr.message);
            }
          })();
        }
      }
    } catch (err) {
      console.error('[PDF delete]', err);
    }
  };

  const switchNotebook = async (id) => {
    if (id === activeNotebookId || isStreaming) return;
    setActiveNotebookId(id);
    setChatHistory([]);
    setSidebarOpen(false);
    await Promise.all([loadHistory(id), loadPdfs(id)]);
  };

  const deleteNotebook = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this notebook and all its chats?')) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/notebooks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      // Update UI immediately
      const remaining = notebooks.filter(n => n.id !== id);
      setNotebooks(remaining);
      // Clear PDF state for deleted notebook
      setNotebookPdfs(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (activeNotebookId === id) {
        if (remaining.length > 0) {
          setActiveNotebookId(remaining[0].id);
          await loadHistory(remaining[0].id);
        } else {
          await createNotebook('My Workspace', true);
        }
      }

      // Clean up Firebase Storage files in the background (non-blocking)
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const urls = data.firebase_pdf_urls || [];
        if (urls.length > 0) {
          (async () => {
            for (const url of urls) {
              try {
                await deleteObject(ref(storage, url));
                console.log('[Firebase] Deleted PDF from storage:', url.slice(0, 60));
              } catch (fbErr) {
                // Non-fatal — MongoDB + Pinecone already cleaned up
                console.warn('[Firebase] Storage delete failed (non-fatal):', fbErr.message);
              }
            }
          })();
        }
      }
    } catch (err) {
      console.error('Failed to delete notebook:', err);
    }
  };

  const startRename = (id, currentName, e) => {
    e.stopPropagation();
    setEditingNotebookId(id);
    setEditingName(currentName);
  };

  const commitRename = async (id) => {
    const trimmed = editingName.trim();
    setEditingNotebookId(null);
    if (!trimmed) return;
    setNotebooks(prev => prev.map(n => n.id === id ? { ...n, name: trimmed } : n));
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`${BACKEND_URL}/notebooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch (err) {
      console.error('Failed to rename notebook:', err);
    }
  };

  const loadHistory = async (notebookId) => {
    if (!notebookId) return;
    setHistoryLoading(true);

    const safetyTimer = setTimeout(() => setHistoryLoading(false), 10000);

    try {
      const token = await getToken();
      if (!token) return;

      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(`${BACKEND_URL}/history/${notebookId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(fetchTimer);

      if (!resp.ok) {
        console.warn(`History fetch failed: ${resp.status}`);
        return;
      }
      const data = await resp.json();
      // Restore image messages stored as __FBIMG__ (Firebase URL) or legacy __IMG__ (base64) in DB
      const restored = (data.messages || []).map(msg => {
        if (msg.role === 'assistant' && typeof msg.content === 'string') {
          if (msg.content.startsWith('__FBIMG__')) {
            return { role: 'assistant', type: 'image', content: '', src: msg.content.slice(9), prompt: '' };
          }
          if (msg.content.startsWith('__IMG__')) {
            return { role: 'assistant', type: 'image', content: '', src: msg.content.slice(7), prompt: '' };
          }
        }
        return msg;
      });
      setChatHistory(restored);
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      clearTimeout(safetyTimer);
      setHistoryLoading(false);
    }
  };

  // Auto-scroll to bottom on new messages.
  // During streaming we scroll the container directly (instant) so repeated
  // smooth-scroll animations don't fight each other and create a wobble.
  useEffect(() => {
    if (isStreaming) {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } else {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isStreaming]);

  // ── Standalone plan fetch ─────────────────────────────────────────────────────────────
  // Hits /plans/my-plan directly so the navbar badge is always accurate,
  // independent of whether loadNotebooks succeeded.
  // Also writes to localStorage so the badge is instant on the NEXT refresh.
  const fetchMyPlan = async () => {
    try {
      let token = await getToken();
      if (!token) {
        await new Promise(r => setTimeout(r, 1000));
        token = await getToken();
      }
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/plans/my-plan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const plan = data.plan || 'free';
      console.log(`[Plan] Fetched from MongoDB: ${plan}`);
      setUserPlan(plan);
      // Cache so next page refresh shows badge immediately
      try { localStorage.setItem('mindpad_user_plan', plan); } catch {}
    } catch (err) {
      console.warn('[Plan] fetchMyPlan error:', err);
    }
  };

  // Auth state drives view — sign in → workspace, sign out → landing.
  // We also call loadNotebooks() directly here to avoid waiting for the
  // notebooks useEffect to fire on the NEXT render cycle, which adds
  // noticeable delay on page load with an existing session.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      setView('workspace');
      loadNotebooks(); // fire immediately — don't wait for view state to propagate
      fetchMyPlan();   // fetch plan badge from MongoDB independently
    } else {
      setView('landing');
      setChatHistory([]); // Clear stale history on sign-out
      setUserPlan('free'); // reset badge on sign-out
      try { localStorage.setItem('mindpad_user_plan', 'free'); } catch {} // clear cache
    }
  }, [isSignedIn, isLoaded]);

  const stopStreaming = () => {
    if (streamReaderRef.current) {
      streamReaderRef.current.cancel();
      streamReaderRef.current = null;
    }
    // Flush remaining queued chars instantly so message isn't truncated
    if (twIntervalRef.current) {
      clearInterval(twIntervalRef.current);
      twIntervalRef.current = null;
      const remaining = twQueueRef.current.join('');
      twQueueRef.current = [];
      if (remaining) {
        const full = twDisplayRef.current + remaining;
        twDisplayRef.current = full;
        setChatHistory(prev => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === 'assistant') {
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: full };
          }
          return updated;
        });
      }
    }
  };

  const sendMessage = async () => {
    const userText = message.trim();
    if ((!userText && !attachedImage) || isStreaming || !activeNotebookId) return;

    const userMsg = {
      role: 'user',
      content: userText || '(image attached)',
      ...(attachedImage ? { imageUrl: attachedImage.dataUrl } : {}),
    };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setMessage('');
    const currentImage = attachedImage;
    setAttachedImage(null);
    setIsStreaming(true);
    // Deep research mode: show special searching indicator
    if (isDeepResearch && !attachedImage) setIsDeepResearching(true);

    try {
      const token = await getToken();
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
          notebook_id: activeNotebookId,
          research_mode: isResearchMode,
          web_search: isWebSearch,
          deep_research: isDeepResearch,
          response_language: selectedLang.label,
          response_style: responseStyle,
          // RAG: send the doc_ids the user has checked
          selected_pdf_ids: (notebookPdfs[activeNotebookId] || [])
            .filter(p => p.selected)
            .map(p => p.doc_id)
            .filter(Boolean),
          ...(currentImage ? { image_base64: currentImage.base64, image_mime_type: currentImage.mimeType } : {}),
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);

      // Reset typewriter state for this response
      twQueueRef.current = [];
      twDisplayRef.current = '';
      twIntervalRef.current = null;

      // Start the 5ms drainer
      const startDrainer = () => {
        if (twIntervalRef.current) return;
        twIntervalRef.current = setInterval(() => {
          if (twQueueRef.current.length === 0) return;
          const ch = twQueueRef.current.shift();
          twDisplayRef.current += ch;
          const snap = twDisplayRef.current;
          setChatHistory(prev => {
            const updated = [...prev];
            if (updated[updated.length - 1]?.role === 'assistant') {
              updated[updated.length - 1] = { ...updated[updated.length - 1], content: snap };
            }
            return updated;
          });
        }, 5);
      };

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      const SOURCES_MARKER = '\n__SOURCES_JSON__:';
      let rawAccumulated = ''; // full raw stream including sources marker
      // Track first chunk: when deep research is active the DR indicator stays
      // visible until the LLM actually starts streaming.  Dismissing it here
      // (rather than in `finally`) prevents the DR bubble and the assistant
      // bubble from appearing simultaneously.
      let deepResearchDismissed = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // Dismiss the deep-research loading indicator as soon as the first
        // token arrives — this is the precise moment the DR pipeline is done
        // and the LLM has started responding.
        if (!deepResearchDismissed) {
          deepResearchDismissed = true;
          setIsDeepResearching(false);
        }
        const chunk = decoder.decode(value, { stream: true });
        rawAccumulated += chunk;
        // Derive display content directly from rawAccumulated so a marker
        // that spans a chunk boundary never appears in the bubble even briefly.
        const displayMarkerIdx = rawAccumulated.indexOf(SOURCES_MARKER);
        const displayContent = displayMarkerIdx !== -1
          ? rawAccumulated.slice(0, displayMarkerIdx)
          : rawAccumulated;
        // Push only new characters into the typewriter queue
        const newChars = displayContent.slice(twDisplayRef.current.length + twQueueRef.current.length);
        if (newChars) {
          twQueueRef.current.push(...newChars);
          startDrainer();
        }
      }

      // Wait for the typewriter queue to fully drain before parsing sources
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (twQueueRef.current.length === 0) {
            clearInterval(check);
            if (twIntervalRef.current) {
              clearInterval(twIntervalRef.current);
              twIntervalRef.current = null;
            }
            resolve();
          }
        }, 10);
      });

      // ── Parse RAG sources from the raw accumulated response ────────────────
      // The displayed content already has the marker stripped; parse it from
      // rawAccumulated so sources are never lost even if they span chunk boundaries.
      const markerIdx = rawAccumulated.indexOf(SOURCES_MARKER);
      if (markerIdx !== -1) {
        try {
          const sources = JSON.parse(rawAccumulated.slice(markerIdx + SOURCES_MARKER.length));
          setChatHistory(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              updated[updated.length - 1] = { ...lastMsg, sources };
            }
            return updated;
          });
        } catch {/* malformed JSON — skip sources */ }
      }
    } catch (err) {
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: `⚠️ Error: ${err.message}. Make sure the backend is running on port 8000.` },
      ]);
    } finally {
      streamReaderRef.current = null;
      setIsStreaming(false);
      setIsDeepResearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Strip HTML tags to get plain text for copy/TTS
  const stripHtml = (html) => {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  // Convert markdown to HTML for models that ignore the HTML system prompt (e.g. vision model)
  const markdownToHtml = (md) => {
    if (!md) return '';
    let html = md
      // Escape bare < and > that are not part of HTML tags (prevent double-encoding real HTML)
      // Code blocks first (protect content inside them)
      .replace(/```([\w]*)?\n([\s\S]*?)```/g, (_, lang, code) =>
        `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
      )
      // Inline code
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`)
      // Headers
      .replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#{1}\s+(.+)$/gm, '<h2>$1</h2>')
      // Bold + italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Blockquotes
      .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      // HR
      .replace(/^[-*_]{3,}$/gm, '<hr>')
      // Unordered lists — wrap consecutive li items
      .replace(/^[-*+]\s+(.+)$/gm, '<li>$1</li>')
      // Ordered lists
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      // Wrap consecutive <li> blocks in <ul>
      .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
      // Paragraphs: double newlines
      .replace(/\n{2,}/g, '</p><p>')
      // Single newlines → <br> inside paragraphs  
      .replace(/\n/g, '<br>');
    // Wrap in paragraph if not already block-level
    if (!html.startsWith('<')) html = `<p>${html}</p>`;
    return html;
  };

  // Auto-detect HTML vs markdown and render appropriately
  const renderContent = (content) => {
    if (!content) return '';
    const trimmed = content.trimStart();
    // If it starts with an HTML tag, treat as HTML directly
    if (trimmed.startsWith('<')) return content;
    // Otherwise convert markdown → HTML
    return markdownToHtml(content);
  };

  const copyMessage = useCallback(async (content, idx) => {
    const plain = stripHtml(content);
    try {
      await navigator.clipboard.writeText(plain);
      setCopiedMsgIdx(idx);
      setTimeout(() => setCopiedMsgIdx(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = plain;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedMsgIdx(idx);
      setTimeout(() => setCopiedMsgIdx(null), 2000);
    }
  }, []);

  const speakMessage = useCallback(async (content, idx) => {
    if (speakingMsgIdx === idx) return; // already speaking this one
    setSpeakingMsgIdx(idx);
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: content }),
      });
      if (!resp.ok) throw new Error(`TTS failed: ${resp.status}`);
      const data = await resp.json();
      const audio = new Audio(data.audio);
      audio.onended = () => setSpeakingMsgIdx(null);
      audio.onerror = () => setSpeakingMsgIdx(null);
      await audio.play();
    } catch (err) {
      console.error('[TTS]', err);
      setSpeakingMsgIdx(null);
    }
  }, [speakingMsgIdx, getToken]);

  // ── Insight Canvas ──────────────────────────────────────────────────────────
  const generateInsightCanvas = async () => {
    if (isGeneratingInsight || !activeNotebookId) return;

    const selectedPdfIds = (notebookPdfs[activeNotebookId] || [])
      .filter(p => p.selected)
      .map(p => p.doc_id)
      .filter(Boolean);

    if (selectedPdfIds.length === 0) {
      alert('Please select at least one PDF source in the left sidebar to generate an Insight Canvas.');
      return;
    }

    const notebookId = activeNotebookId; // capture for async closure
    setIsGeneratingInsight(true);

    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/insight-canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          notebook_id: notebookId,
          selected_pdf_ids: selectedPdfIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error: ${res.status}`);
      }

      const data = await res.json();

      // Upload infographic to Firebase Storage
      const base64 = data.data_url.split(',')[1];
      const mimeType = data.data_url.split(';')[0].split(':')[1] || 'image/png';
      const byteChars = atob(base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: mimeType });

      const filename = `insight-canvas/${notebookId}/${Date.now()}.png`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const firebaseUrl = await getDownloadURL(storageRef);

      console.log('[Insight Canvas] Uploaded to Firebase:', firebaseUrl);
      setInsightCanvasImages(prev => ({ ...prev, [notebookId]: firebaseUrl }));

      // Persist to MongoDB so it survives page refresh
      const saveToken = await getToken();
      fetch(`${BACKEND_URL}/notebooks/${notebookId}/insight-canvas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saveToken}` },
        body: JSON.stringify({ url: firebaseUrl }),
      }).catch(e => console.warn('[Insight Canvas] Failed to persist URL:', e));
    } catch (err) {
      console.error('[Insight Canvas]', err);
      alert(`Insight Canvas generation failed: ${err.message}`);
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const generateMindMap = async () => {
    if (isGeneratingMindMap || !activeNotebookId) return;

    const selectedPdfIds = (notebookPdfs[activeNotebookId] || [])
      .filter(p => p.selected)
      .map(p => p.doc_id)
      .filter(Boolean);

    if (selectedPdfIds.length === 0) {
      alert('Please select at least one PDF source in the left sidebar to generate a Mind Map.');
      return;
    }

    const notebookId = activeNotebookId;
    setIsGeneratingMindMap(true);

    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/mind-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notebook_id: notebookId, selected_pdf_ids: selectedPdfIds }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setMindMapData(prev => ({ ...prev, [notebookId]: data.tree }));

      // Persist to MongoDB
      const saveToken = await getToken();
      fetch(`${BACKEND_URL}/notebooks/${notebookId}/mind-map`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saveToken}` },
        body: JSON.stringify({ tree: data.tree }),
      }).catch(e => console.warn('[MindMap] Failed to persist:', e));
    } catch (err) {
      console.error('[MindMap]', err);
      alert(`Mind Map generation failed: ${err.message}`);
    } finally {
      setIsGeneratingMindMap(false);
    }
  };

  // ── Video Suggestions ────────────────────────────────────────────────────────
  const generateVideoSuggestions = async () => {
    if (isGeneratingVideos || !activeNotebookId) return;

    // Pass selected PDFs so the backend can read their stored summaries from MongoDB
    const selectedPdfIds = (notebookPdfs[activeNotebookId] || [])
      .filter(p => p.selected)
      .map(p => p.doc_id)
      .filter(Boolean);

    const notebookId = activeNotebookId;
    setIsGeneratingVideos(true);

    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/video-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          notebook_id: notebookId,
          selected_pdf_ids: selectedPdfIds,
          max_videos: 12,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setVideoSuggestionsData(prev => ({
        ...prev,
        [notebookId]: { videos: data.videos, queries: data.queries_used, topic: data.topic },
      }));

      // Persist to MongoDB
      const saveToken = await getToken();
      fetch(`${BACKEND_URL}/notebooks/${notebookId}/video-suggestions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saveToken}` },
        body: JSON.stringify({
          videos: data.videos,
          queries: data.queries_used,
          topic: data.topic,
        }),
      }).catch(e => console.warn('[VideoSuggestions] Failed to persist:', e));
    } catch (err) {
      console.error('[VideoSuggestions]', err);
      alert(`Video Suggestions failed: ${err.message}`);
    } finally {
      setIsGeneratingVideos(false);
    }
  };

  // ── Flashcards ─────────────────────────────────────────────────────────────────────
  const generateFlashcards = async () => {
    if (isGeneratingFlashcards || !activeNotebookId) return;

    const selectedPdfIds = (notebookPdfs[activeNotebookId] || [])
      .filter(p => p.selected)
      .map(p => p.doc_id)
      .filter(Boolean);

    const notebookId = activeNotebookId;
    setIsGeneratingFlashcards(true);

    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          notebook_id: notebookId,
          selected_pdf_ids: selectedPdfIds,
          num_cards: 10,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error: ${res.status}`);
      }

      const data = await res.json();
      setFlashcardsData(prev => ({
        ...prev,
        [notebookId]: { cards: data.cards, topic: data.topic },
      }));

      // Persist to MongoDB (fire-and-forget)
      const saveToken = await getToken();
      fetch(`${BACKEND_URL}/notebooks/${notebookId}/flashcards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saveToken}` },
        body: JSON.stringify({ cards: data.cards, topic: data.topic }),
      }).catch(e => console.warn('[Flashcards] Failed to persist:', e));

    } catch (err) {
      console.error('[Flashcards]', err);
      alert(`Flashcards generation failed: ${err.message}`);
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  // ── Quiz ─────────────────────────────────────────────────────────────────────────
  const generateQuiz = async (numQuestions = 5, difficulty = 'medium') => {
    if (isGeneratingQuiz || !activeNotebookId) return;

    const selectedPdfIds = (notebookPdfs[activeNotebookId] || [])
      .filter(p => p.selected)
      .map(p => p.doc_id)
      .filter(Boolean);

    const notebookId = activeNotebookId;
    setIsGeneratingQuiz(true);
    // Close the settings modal immediately — loading shown in sidebar card
    setShowQuizModal(false);

    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          notebook_id: notebookId,
          selected_pdf_ids: selectedPdfIds,
          num_questions: numQuestions,
          difficulty,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error: ${res.status}`);
      }

      const data = await res.json();
      const newQuizEntry = {
        questions: data.questions,
        topic: data.topic,
        difficulty: data.difficulty,
        evaluations: [],
        currentQ: 0,
      };
      setQuizData(prev => ({ ...prev, [notebookId]: newQuizEntry }));

      // Persist to MongoDB (fire-and-forget)
      const saveToken = await getToken();
      fetch(`${BACKEND_URL}/notebooks/${notebookId}/quiz`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saveToken}` },
        body: JSON.stringify({
          questions: data.questions,
          topic: data.topic,
          difficulty: data.difficulty,
          evaluations: [],
          current_q: 0,
        }),
      }).catch(e => console.warn('[Quiz] Failed to persist:', e));

    } catch (err) {
      console.error('[Quiz]', err);
      alert(`Quiz generation failed: ${err.message}`);
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Save a quiz evaluation for one question to local state + MongoDB
  const saveQuizEvaluation = async (notebookId, qIdx, evaluation) => {
    setQuizData(prev => {
      const existing = prev[notebookId] || {};
      const evaluations = [...(existing.evaluations || [])];
      evaluations[qIdx] = evaluation;
      const newCurrentQ = Math.max(existing.currentQ || 0, qIdx + 1);
      const updated = { ...existing, evaluations, currentQ: newCurrentQ };

      // Persist to MongoDB async — use updated values inside closure
      getToken().then(token => {
        fetch(`${BACKEND_URL}/notebooks/${notebookId}/quiz`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            questions: updated.questions || [],
            topic: updated.topic || '',
            difficulty: updated.difficulty || 'medium',
            evaluations,
            current_q: newCurrentQ,
          }),
        }).catch(e => console.warn('[Quiz] Eval persist failed:', e));
      });

      return { ...prev, [notebookId]: updated };
    });
  };
  useEffect(() => {
    if (activeNotebookId && quizData[activeNotebookId] && studioScrollRef.current) {
      studioScrollRef.current.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [quizData, activeNotebookId]);

  // Auto-scroll right sidebar to bottom when an insight canvas image becomes ready
  useEffect(() => {
    if (activeNotebookId && insightCanvasImages[activeNotebookId] && studioScrollRef.current) {
      studioScrollRef.current.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [insightCanvasImages, activeNotebookId]);

  // Auto-scroll right sidebar to bottom when mind map data becomes ready
  useEffect(() => {
    if (activeNotebookId && mindMapData[activeNotebookId] && studioScrollRef.current) {
      studioScrollRef.current.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [mindMapData, activeNotebookId]);

  // Auto-scroll right sidebar when video suggestions are ready
  useEffect(() => {
    if (activeNotebookId && videoSuggestionsData[activeNotebookId] && studioScrollRef.current) {
      studioScrollRef.current.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [videoSuggestionsData, activeNotebookId]);

  // Auto-scroll right sidebar when flashcards are ready
  useEffect(() => {
    if (activeNotebookId && flashcardsData[activeNotebookId] && studioScrollRef.current) {
      studioScrollRef.current.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [flashcardsData, activeNotebookId]);

  // ── Visual Podcast ────────────────────────────────────────────────────────────────────
  const generateVisualPodcast = async (numSlides = 5, styleNotes = '') => {
    if (isGeneratingVisualPodcast || !activeNotebookId) return;
    const notebookId = activeNotebookId;
    const selectedPdfIds = (notebookPdfs[notebookId] || [])
      .filter(p => p.selected).map(p => p.doc_id).filter(Boolean);
    setIsGeneratingVisualPodcast(true);
    setVisualPodcastProgress(prev => ({ ...prev, [notebookId]: { slide: 0, total: numSlides, heading: 'Starting…' } }));
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/visual-podcast/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          notebook_id: notebookId,
          selected_pdf_ids: selectedPdfIds,
          num_slides: numSlides,
          style_notes: styleNotes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      // ── Read SSE stream ──────────────────────────────────────────────────────
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneData = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let parsed;
          try { parsed = JSON.parse(line.slice(6)); } catch { continue; }
          if (parsed.type === 'progress') {
            setVisualPodcastProgress(prev => ({
              ...prev,
              [notebookId]: { slide: parsed.slide, total: parsed.total, heading: parsed.heading },
            }));
          } else if (parsed.type === 'done') {
            doneData = parsed; // { url, slides, topic }
          } else if (parsed.type === 'error') {
            throw new Error(parsed.detail);
          }
        }
      }

      if (!doneData) throw new Error('No response received from server.');

      // Backend already uploaded to Firebase — store URL directly
      setVisualPodcastData(prev => ({ ...prev, [notebookId]: doneData.url }));
      setVisualPodcastResults(prev => ({ ...prev, [notebookId]: { url: doneData.url, slides: doneData.slides, topic: doneData.topic } }));

      // Persist Firebase URL to MongoDB notebook
      (async () => {
        try {
          const saveToken = await getToken();
          await fetch(`${BACKEND_URL}/notebooks/${notebookId}/visual-podcast`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saveToken}` },
            body: JSON.stringify({ url: doneData.url }),
          });
          console.log('[VisualPodcast] Saved Firebase URL to MongoDB:', notebookId);
        } catch (saveErr) {
          console.error('[VisualPodcast auto-save]', saveErr);
        }
      })();
    } catch (err) {
      console.error('[VisualPodcast]', err);
      alert(`Visual Podcast generation failed: ${err.message}`);
    } finally {
      setIsGeneratingVisualPodcast(false);
      setVisualPodcastProgress(prev => { const n = { ...prev }; delete n[notebookId]; return n; });
    }
  };

  // Auto-scroll right sidebar when a visual podcast result is ready
  useEffect(() => {
    if (activeNotebookId && (visualPodcastResults[activeNotebookId] || visualPodcastData[activeNotebookId]) && studioScrollRef.current) {
      studioScrollRef.current.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [visualPodcastResults, visualPodcastData, activeNotebookId]);

  const deleteVisualPodcast = async (notebookId) => {
    try {
      const token = await getToken();
      await fetch(`${BACKEND_URL}/notebooks/${notebookId}/visual-podcast`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('[VisualPodcast delete]', err);
    }
    setVisualPodcastData(prev => { const n = { ...prev }; delete n[notebookId]; return n; });
    setVisualPodcastResults(prev => { const n = { ...prev }; delete n[notebookId]; return n; });
  };

  // ── Audio Podcast ─────────────────────────────────────────────────────────────────────
  const generateAudioPodcast = async () => {
    if (isGeneratingAudioPodcast || !activeNotebookId) return;
    const notebookId = activeNotebookId;
    const selectedPdfIds = (notebookPdfs[notebookId] || [])
      .filter(p => p.selected).map(p => p.doc_id).filter(Boolean);
    setIsGeneratingAudioPodcast(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/audio-podcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          notebook_id: notebookId,
          selected_pdf_ids: selectedPdfIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      setAudioPodcastResults(prev => ({ ...prev, [notebookId]: data }));

      // Auto-save to Firebase + MongoDB in background
      (async () => {
        try {
          const raw = atob(data.audio_b64);
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          const blob = new Blob([arr], { type: 'audio/wav' });
          const storagePath = `audio-podcasts/${user?.id}/${notebookId}/${Date.now()}.wav`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, blob, { contentType: 'audio/wav' });
          const firebaseUrl = await getDownloadURL(storageRef);
          const saveToken = await getToken();
          await fetch(`${BACKEND_URL}/notebooks/${notebookId}/audio-podcast`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saveToken}` },
            body: JSON.stringify({ url: firebaseUrl }),
          });
          setAudioPodcastData(prev => ({ ...prev, [notebookId]: firebaseUrl }));
          console.log('[AudioPodcast] Auto-saved to Firebase:', notebookId);
        } catch (saveErr) {
          console.error('[AudioPodcast auto-save]', saveErr);
        }
      })();
    } catch (err) {
      console.error('[AudioPodcast]', err);
      alert(`Audio Podcast generation failed: ${err.message}`);
    } finally {
      setIsGeneratingAudioPodcast(false);
    }
  };

  const deleteAudioPodcast = async (notebookId) => {
    try {
      const token = await getToken();
      await fetch(`${BACKEND_URL}/notebooks/${notebookId}/audio-podcast`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('[AudioPodcast delete]', err);
    }
    setAudioPodcastData(prev => { const n = { ...prev }; delete n[notebookId]; return n; });
    setAudioPodcastResults(prev => { const n = { ...prev }; delete n[notebookId]; return n; });
  };

  // Attach non-passive wheel listener to the canvas viewport so preventDefault() works
  useEffect(() => {
    const handler = () => setCanvasIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Attach non-passive wheel listener to the canvas viewport so preventDefault() works
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el || !showInsightModal) return;
    const handler = e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setCanvasZoom(z => Math.min(5, Math.max(0.25, parseFloat((z + delta).toFixed(2)))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [showInsightModal]);

  // Show nothing while Clerk loads auth state
  if (!isLoaded) return null;

  // Always show landing page first
  if (view === 'landing') {
    return (
      <LandingPage
        onGetStarted={() => {
          if (isSignedIn) {
            setView('workspace');
          } else {
            openSignUp();
          }
        }}
        onLogin={() => {
          if (isSignedIn) {
            setView('workspace');
          } else {
            openSignIn();
          }
        }}
      />
    );
  }


  return (
    <div className="flex flex-col h-dvh bg-white dark:bg-slate-950 overflow-hidden">
      {/* ── Fixed PDF info tooltip — renders outside sidebar overflow ───────── */}
      {pdfInfoTooltip && (
        <div
          className="fixed z-9999 pointer-events-none"
          style={{ top: pdfInfoTooltip.y, left: pdfInfoTooltip.x }}
        >
          <div className="flex items-center">
            <div className="w-0 h-0 border-t-[5px] border-b-[5px] border-r-[6px] border-t-transparent border-b-transparent border-r-white dark:border-r-slate-800 shrink-0" />
            <div className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[11px] rounded-lg px-3 py-2 shadow-2xl border border-slate-200 dark:border-slate-700 min-w-41.25">
              <p className="font-semibold text-slate-900 dark:text-white text-[11px] mb-1 break-all leading-tight">{pdfInfoTooltip.pdf.name}</p>
              <div className="space-y-0.5 text-slate-500 dark:text-slate-400">
                <p>{(pdfInfoTooltip.pdf.total_tokens || 0).toLocaleString()} tokens</p>
                <p>{pdfInfoTooltip.pdf.chunk_count} chunks</p>
                <p>{pdfInfoTooltip.pdf.tokens_per_chunk || '—'} tok / chunk</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Click-outside overlay — closes all dropdowns ───────────────────── */}
      {(showNotifs || showSettings || showLangMenu || showKbDropdown) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setShowNotifs(false); setShowSettings(false); setShowLangMenu(false); setShowKbDropdown(false); }}
        />
      )}

      {/* ── Upload Source Modal ───────────────────────────────────────────── */}
      {showSourceModal && (
        <>
          <div
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowSourceModal(false); setShowUrlInput(false); }}
          />
          <div className="fixed inset-0 z-101 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl pointer-events-auto overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between px-10 pt-9 pb-2">
                <div>
                  <h2 className="text-2xl font-black font-display tracking-tight text-slate-900 dark:text-slate-100 leading-snug">
                    Add a source
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                    Upload a file to your notebook — Midy AI will index it for chat.
                  </p>
                </div>
                <button
                  onClick={() => { setShowSourceModal(false); setShowUrlInput(false); }}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-6 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* URL input row — only visible when Website is toggled */}
              {showUrlInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="px-10 pt-4"
                >
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-primary/40 focus-within:border-primary bg-slate-50 dark:bg-slate-800 px-4 py-3 transition-colors">
                    <Link className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="url"
                      placeholder="Paste a website URL…"
                      className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
                      autoFocus
                    />
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Coming&nbsp;soon</span>
                  </div>
                </motion.div>
              )}

              {/* Drop zone */}
              <div className="px-10 py-5">
                <div
                  onClick={() => {
                    setShowSourceModal(false);
                    setShowUrlInput(false);
                    pdfUploadTargetRef.current = sourceModalTargetId;
                    pdfInputRef.current?.click();
                  }}
                  className="group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-primary dark:hover:border-primary bg-slate-50 dark:bg-slate-800/50 hover:bg-primary/5 dark:hover:bg-primary/10 transition-all cursor-pointer py-14"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all">
                    <Upload className="w-6 h-6 text-slate-500 dark:text-slate-300 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Drop your file here</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">or click to browse &mdash; PDF supported</p>
                  </div>
                </div>
              </div>

              {/* Bottom action pills */}
              <div className="flex items-center gap-3 px-10 pb-9 flex-wrap">
                {/* Upload PDF — active */}
                <button
                  onClick={() => {
                    setShowSourceModal(false);
                    setShowUrlInput(false);
                    pdfUploadTargetRef.current = sourceModalTargetId;
                    pdfInputRef.current?.click();
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-sm"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Upload PDF
                </button>
                {/* MP3 — disabled */}
                <button
                  disabled
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-xs font-bold cursor-not-allowed opacity-50"
                  title="Coming soon"
                >
                  <Podcast className="w-3.5 h-3.5" />
                  MP3
                  <span className="ml-1 text-[9px] font-bold uppercase tracking-wider opacity-70">Soon</span>
                </button>
                {/* Notion — import page as source */}
                {notionStatus?.connected && (
                  <button
                    onClick={() => {
                      setNotionImportTargetId(sourceModalTargetId);
                      setShowSourceModal(false);
                      setShowUrlInput(false);
                      openNotionPages();
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 text-xs font-bold transition-all"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
                      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
                    </svg>
                    Notion
                  </button>
                )}
                {/* Website — toggles URL input */}
                <button
                  onClick={() => setShowUrlInput(prev => !prev)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-xs font-bold transition-all ${showUrlInput
                      ? 'border-primary bg-primary/10 dark:bg-primary/20 text-primary'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500'
                    }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Website
                  <span className="ml-1 text-[9px] font-bold uppercase tracking-wider opacity-70">Soon</span>
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* ── Insight Canvas Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showInsightModal && insightCanvasImages[activeNotebookId] && (
          <>
            <div
              className="fixed inset-0 z-100 bg-black/70 backdrop-blur-sm"
              onClick={() => { setShowInsightModal(false); setCanvasZoom(1); setCanvasPan({ x: 0, y: 0 }); if (document.fullscreenElement) document.exitFullscreen(); }}
            />
            <div className="fixed inset-0 z-101 flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl pointer-events-auto overflow-hidden flex flex-col max-h-[92vh]"
                ref={canvasModalRef}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                      <LayoutDashboard className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">Insight Canvas</h2>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">AI-generated infographic from your selected PDFs</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Zoom controls */}
                    <button
                      title="Zoom out"
                      onClick={() => setCanvasZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))))}
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-10 text-center tabular-nums">
                      {Math.round(canvasZoom * 100)}%
                    </span>
                    <button
                      title="Zoom in"
                      onClick={() => setCanvasZoom(z => Math.min(5, parseFloat((z + 0.25).toFixed(2))))}
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      title={canvasIsFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                      onClick={() => {
                        if (!canvasIsFullscreen) {
                          canvasModalRef.current?.requestFullscreen();
                          setCanvasZoom(1);
                          setCanvasPan({ x: 0, y: 0 });
                        } else {
                          document.exitFullscreen();
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {canvasIsFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                    <button
                      title="Download infographic"
                      onClick={async () => {
                        const imgUrl = insightCanvasImages[activeNotebookId];
                        try {
                          const res = await fetch(imgUrl);
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `insight-canvas-${activeNotebookId}-${Date.now()}.png`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch {
                          window.open(imgUrl, '_blank');
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setShowInsightModal(false); setCanvasZoom(1); setCanvasPan({ x: 0, y: 0 }); if (document.fullscreenElement) document.exitFullscreen(); }}
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Image viewport — zoom + pan */}
                <div
                  ref={canvasContainerRef}
                  className="overflow-hidden flex-1 relative bg-slate-50 dark:bg-slate-950"
                  style={{ cursor: canvasZoom > 1 ? (canvasDragRef.current ? 'grabbing' : 'grab') : 'default', minHeight: 0 }}
                  /* ── Mouse scroll wheel zoom handled via non-passive native listener in useEffect ── */
                  /* ── Mouse drag pan ── */
                  onMouseDown={e => {
                    if (canvasZoom <= 1) return;
                    e.preventDefault();
                    canvasDragRef.current = { startX: e.clientX, startY: e.clientY, originPanX: canvasPan.x, originPanY: canvasPan.y };
                  }}
                  onMouseMove={e => {
                    if (!canvasDragRef.current) return;
                    const dx = e.clientX - canvasDragRef.current.startX;
                    const dy = e.clientY - canvasDragRef.current.startY;
                    setCanvasPan({ x: canvasDragRef.current.originPanX + dx, y: canvasDragRef.current.originPanY + dy });
                  }}
                  onMouseUp={() => { canvasDragRef.current = null; }}
                  onMouseLeave={() => { canvasDragRef.current = null; }}
                  /* ── Touch pinch-to-zoom + drag ── */
                  onTouchStart={e => {
                    if (e.touches.length === 2) {
                      const dx = e.touches[0].clientX - e.touches[1].clientX;
                      const dy = e.touches[0].clientY - e.touches[1].clientY;
                      canvasPinchRef.current = { startDist: Math.hypot(dx, dy), startZoom: canvasZoom };
                      canvasDragRef.current = null;
                    } else if (e.touches.length === 1 && canvasZoom > 1) {
                      canvasDragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, originPanX: canvasPan.x, originPanY: canvasPan.y };
                    }
                  }}
                  onTouchMove={e => {
                    e.preventDefault();
                    if (e.touches.length === 2 && canvasPinchRef.current) {
                      const dx = e.touches[0].clientX - e.touches[1].clientX;
                      const dy = e.touches[0].clientY - e.touches[1].clientY;
                      const dist = Math.hypot(dx, dy);
                      const newZoom = Math.min(5, Math.max(0.25, parseFloat((canvasPinchRef.current.startZoom * (dist / canvasPinchRef.current.startDist)).toFixed(2))));
                      setCanvasZoom(newZoom);
                    } else if (e.touches.length === 1 && canvasDragRef.current) {
                      const dx = e.touches[0].clientX - canvasDragRef.current.startX;
                      const dy = e.touches[0].clientY - canvasDragRef.current.startY;
                      setCanvasPan({ x: canvasDragRef.current.originPanX + dx, y: canvasDragRef.current.originPanY + dy });
                    }
                  }}
                  onTouchEnd={() => { canvasDragRef.current = null; canvasPinchRef.current = null; }}
                >
                  <div
                    style={{
                      transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
                      transformOrigin: 'center center',
                      transition: canvasDragRef.current ? 'none' : 'transform 0.1s ease-out',
                      willChange: 'transform',
                    }}
                    className="w-full h-full flex items-center justify-center p-6"
                  >
                    <img
                      src={insightCanvasImages[activeNotebookId]}
                      alt="Insight Canvas infographic"
                      draggable={false}
                      className="max-w-full rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 select-none"
                      style={{ userSelect: 'none', WebkitUserDrag: 'none' }}
                    />
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ── Mind Map Modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showMindMapModal && mindMapData[activeNotebookId] && (
          <MindMapModal
            data={mindMapData[activeNotebookId]}
            onClose={() => setShowMindMapModal(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Video Suggestions Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showVideoModal && videoSuggestionsData[activeNotebookId] && (
          <VideoSuggestionsModal
            topic={videoSuggestionsData[activeNotebookId]?.topic || ''}
            videos={videoSuggestionsData[activeNotebookId]?.videos || []}
            queries={videoSuggestionsData[activeNotebookId]?.queries || []}
            loading={isGeneratingVideos}
            onClose={() => setShowVideoModal(false)}
            onRefresh={() => { generateVideoSuggestions(); }}
          />
        )}
      </AnimatePresence>

      {/* ── Flashcards Modal ───────────────────────────────────────────────────── */}
      {showFlashcardsModal && (
        <FlashcardsModal
          topic={flashcardsData[activeNotebookId]?.topic || ''}
          cards={flashcardsData[activeNotebookId]?.cards || []}
          loading={isGeneratingFlashcards}
          onClose={() => setShowFlashcardsModal(false)}
          onRefresh={() => { setShowFlashcardsModal(false); generateFlashcards(); }}
        />
      )}

      {/* ── Quiz Modal ─────────────────────────────────────────────────────────── */}
      <QuizModal
        open={showQuizModal}
        onClose={() => setShowQuizModal(false)}
        onConfirm={(numQ, diff) => {
          // generateQuiz closes the modal itself and triggers perimeter flash
          generateQuiz(numQ, diff);
          setTimeout(() => setQuizCardFlash(true), 100);
          setTimeout(() => studioScrollRef.current?.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' }), 1050);
        }}
        questions={quizData[activeNotebookId]?.questions || []}
        topic={quizData[activeNotebookId]?.topic || ''}
        difficulty={quizData[activeNotebookId]?.difficulty || 'medium'}
        savedEvaluations={quizData[activeNotebookId]?.evaluations || []}
        savedCurrentQ={quizData[activeNotebookId]?.currentQ || 0}
        loading={isGeneratingQuiz}
        getToken={getToken}
        onEvaluationSave={(qIdx, evaluation) => saveQuizEvaluation(activeNotebookId, qIdx, evaluation)}
        onDelete={async () => {
          const notebookId = activeNotebookId;
          setShowQuizModal(false);
          setQuizData(prev => { const next = { ...prev }; delete next[notebookId]; return next; });
          try {
            const token = await getToken();
            await fetch(`${BACKEND_URL}/notebooks/${notebookId}/quiz`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ questions: [], topic: '', difficulty: 'medium', evaluations: [], current_q: 0 }),
            });
          } catch (e) { console.warn('[Quiz] Delete failed:', e); }
        }}
      />

      {/* ── Visual Podcast Modal ─────────────────────────────────────────────── */}
      {showVisualPodcastModal && (
        <VisualPodcastModal
          notebookId={activeNotebookId}
          getToken={getToken}
          user={user}
          existingUrl={visualPodcastData[activeNotebookId] || null}
          result={visualPodcastResults[activeNotebookId] || null}
          onClose={() => setShowVisualPodcastModal(false)}
          onGenerate={(numSlides, styleNotes) => { generateVisualPodcast(numSlides, styleNotes); setTimeout(() => setVisualPodcastCardFlash(true), 100); setTimeout(() => studioScrollRef.current?.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' }), 1050); }}
          onSaved={(nbId, url) => setVisualPodcastData(prev => ({ ...prev, [nbId]: url }))}
        />
      )}

      {/* ── Audio Podcast Modal ──────────────────────────────────────────────── */}
      {showAudioPodcastModal && (audioPodcastData[activeNotebookId] || audioPodcastResults[activeNotebookId]) && (
        <AudioPodcastModal
          notebookId={activeNotebookId}
          getToken={getToken}
          user={user}
          existingUrl={audioPodcastData[activeNotebookId] || null}
          result={audioPodcastResults[activeNotebookId] || null}
          onClose={() => setShowAudioPodcastModal(false)}
          onSaved={(nbId, url) => setAudioPodcastData(prev => ({ ...prev, [nbId]: url }))}
        />
      )}

      {/* ── Preferences Modal ─────────────────────────────────────────────────── */}
      <PreferencesModal
        open={showPreferences}
        onClose={() => setShowPreferences(false)}
        colorMode={colorMode}
        setColorMode={setColorMode}
        isResearchMode={isResearchMode}
        setIsResearchMode={setIsResearchMode}
        isDeepResearch={isDeepResearch}
        setIsDeepResearch={setIsDeepResearch}
        isWebSearch={isWebSearch}
        setIsWebSearch={setIsWebSearch}
        isMultimediaRetrieval={isMultimediaRetrieval}
        setIsMultimediaRetrieval={setIsMultimediaRetrieval}
        selectedLang={selectedLang}
        setSelectedLang={setSelectedLang}
        user={user}
        getToken={getToken}
        userPlan={userPlan}
        responseStyle={responseStyle}
        onSaveResponseStyle={(val) => {
          setResponseStyle(val);
          localStorage.setItem('mindpad_response_style', val);
        }}
        onPdfDeleted={(docId) => {
          setNotebookPdfs(prev => {
            const next = {};
            for (const [nbId, pdfs] of Object.entries(prev)) {
              next[nbId] = pdfs.filter(p => p.doc_id !== docId);
            }
            return next;
          });
        }}
        onCanvasDeleted={(notebookId) => {
          setInsightCanvasImages(prev => {
            const next = { ...prev };
            delete next[notebookId];
            return next;
          });
        }}
        onAudioPodcastDeleted={(notebookId) => {
          setAudioPodcastData(prev => {
            const next = { ...prev };
            delete next[notebookId];
            return next;
          });
        }}
        onVisualPodcastDeleted={(notebookId) => {
          setVisualPodcastData(prev => {
            const next = { ...prev };
            delete next[notebookId];
            return next;
          });
        }}
      />

      {/* ── Coupon Manager Modal (admin only) ──────────────────────────────────────── */}
      {isAdmin && (
        <CouponManagerModal
          open={showCouponManager}
          onClose={() => setShowCouponManager(false)}
          getToken={getToken}
        />
      )}

      {/* ── Pricing Modal ─────────────────────────────────────────────────────── */}
      <PricingModal
        open={showPricing}
        onClose={() => setShowPricing(false)}
        currentPlan={userPlan}
        onSelectPlan={(plan) => {
          setSelectedPlan(plan);
          setShowPricing(false);
        }}
      />

      {/* ── Payment Page (full-screen overlay) ───────────────────────────────── */}
      <AnimatePresence>
        {selectedPlan && (
          <motion.div
            key="payment-page"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-60 overflow-y-auto"
          >
            <PaymentPage
              plan={selectedPlan}
              onBack={() => {
                setSelectedPlan(null);
                setShowPricing(true);
              }}
              getToken={getToken}
              userEmail={userEmail}
              userName={user?.fullName || user?.firstName || ''}
              onPaymentSuccess={(planId) => {
                setUserPlan(planId);
                try { localStorage.setItem('mindpad_user_plan', planId); } catch {}
                setSelectedPlan(null);
                // Reload workspace state — backend may have restarted during checkout
                loadNotebooks();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Notion Pages Modal ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNotionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowNotionModal(false); setNotionPages([]); } }}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-800 dark:text-slate-200" fill="currentColor" aria-hidden="true">
                    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
                  </svg>
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Import from Notion</h2>
                </div>
                <button
                  onClick={() => { setShowNotionModal(false); setNotionPages([]); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-3">
                {loadingNotionPages ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-slate-400">Loading pages…</p>
                  </div>
                ) : notionPages.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-400 text-sm">No pages found.</p>
                    <p className="text-slate-400 text-xs mt-1">Make sure you've shared pages with the Mindpad integration in Notion.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {notionPages.map(page => (
                      <li key={page.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {page.icon ? (
                            <span className="text-base shrink-0">{page.icon}</span>
                          ) : (
                            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-slate-400" fill="currentColor" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                            </svg>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{page.title}</p>
                            {page.last_edited && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                Edited {new Date(page.last_edited).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => syncNotionPage(page.id, page.title)}
                          disabled={syncingPageId === page.id}
                          className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                        >
                          {syncingPageId === page.id ? (
                            <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Syncing…</>
                          ) : 'Import'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Notion toast notification ─────────────────────────────────────────── */}
      <AnimatePresence>
        {notionToast && (
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.95 }}
            className={`fixed bottom-6 right-6 z-300 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm
              ${notionToast.type === 'success'
                ? 'bg-emerald-500 text-white'
                : 'bg-red-500 text-white'
              }`}
          >
            {notionToast.type === 'success' ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{notionToast.msg}</span>
            <button
              onClick={() => setNotionToast(null)}
              className="ml-auto p-0.5 opacity-80 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Navigation Bar */}
      <header className="w-full sticky top-0 z-50 bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800">
        <div className="flex justify-between items-center px-4 md:px-8 py-4 w-full">
          <div className="flex items-center gap-3 md:gap-10">
          {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              onClick={() => setSidebarOpen(prev => !prev)}
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Desktop left sidebar toggle */}
            <button
              className="hidden md:flex items-center justify-center p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              onClick={() => setLeftOpen(prev => !prev)}
              title={leftOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <span
              onClick={() => setView('landing')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <img
                src={colorMode === 'dark' || colorMode === 'black' ? mindpadLogoDark : mindpadLogo}
                alt="Mindpad AI logo"
                className="h-7 w-auto object-contain"
              />
              {/* Hide brand text on very small screens to save horizontal space */}
              <span className="hidden xs:inline text-lg font-black text-slate-900 dark:text-slate-100 font-display uppercase tracking-widest">
                Mindpad AI
              </span>
            </span>

          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative hidden md:flex items-center z-50">
              <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary/10 w-64 outline-none"
                placeholder="Search knowledge base..."
                type="text"
                value={kbSearch}
                onChange={e => { setKbSearch(e.target.value); setShowKbDropdown(true); }}
                onFocus={() => { if (kbSearch) setShowKbDropdown(true); }}
              />
              <AnimatePresence>
                {showKbDropdown && kbSearch.trim().length > 0 && (() => {
                  const q = kbSearch.trim().toLowerCase();
                  const results = notebooks.filter(nb => {
                    if (nb.name?.toLowerCase().includes(q)) return true;
                    const pdfs = notebookPdfs[nb.id] || [];
                    return pdfs.some(p => p.name?.toLowerCase().includes(q));
                  });
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden"
                    >
                      {results.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">No notebooks found</p>
                      ) : (
                        <ul className="max-h-72 overflow-y-auto py-1">
                          {results.map(nb => {
                            const q2 = kbSearch.trim().toLowerCase();
                            const matchedPdfs = (notebookPdfs[nb.id] || []).filter(p => p.name?.toLowerCase().includes(q2) && !nb.name?.toLowerCase().includes(q2));
                            return (
                              <li key={nb.id}>
                                <button
                                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                                  onClick={() => { switchNotebook(nb.id); setKbSearch(''); setShowKbDropdown(false); }}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-primary/8 dark:bg-primary/15 flex items-center justify-center shrink-0">
                                      <svg className="w-3.5 h-3.5 text-primary dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{nb.name}</p>
                                      {matchedPdfs.length > 0 && (
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">PDF: {matchedPdfs[0].name}</p>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>
            {/* Crown / Upgrade button — hidden on mobile to save space */}
            <button
              onClick={() => {
                setSidebarOpen(false);
                setRightDrawerOpen(false);
                setShowPricing(true);
              }}
              title="Upgrade plan"
              className="hidden sm:flex p-2 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors rounded-full"
            >
              <Crown className="w-5 h-5" />
            </button>

            {/* Preferences — hidden on mobile (accessible via sidebar) */}
            <button
              onClick={() => setShowPreferences(prev => !prev)}
              title="Preferences"
              className="hidden sm:flex p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-full"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>

            {/* Coupon Manager — admin only */}
            {isAdmin && (
              <button
                onClick={() => setShowCouponManager(prev => !prev)}
                title="Coupon Manager"
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-full"
              >
                <Tag className="w-5 h-5" />
              </button>
            )}

            {/* Bell / Notifications */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifs(prev => {
                    if (!prev) { setRightOpen(false); setRightDrawerOpen(false); }
                    return !prev;
                  });
                }}
                className="relative p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-full"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications dropdown */}
              <AnimatePresence>
                {showNotifs && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-full sm:mt-2 w-[calc(100vw-1rem)] sm:w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-sm font-bold font-display text-slate-800 dark:text-slate-100">Notifications</span>
                      <button onClick={() => setShowNotifs(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Admin: create notification form */}
                    {isAdmin && (
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-2 bg-primary/5 dark:bg-primary/10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Admin — Broadcast</p>
                        <input
                          value={newNotifTitle}
                          onChange={e => setNewNotifTitle(e.target.value)}
                          placeholder="Title"
                          className="w-full text-xs rounded-lg px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary/30 text-slate-800 dark:text-slate-100"
                        />
                        <textarea
                          value={newNotifMessage}
                          onChange={e => setNewNotifMessage(e.target.value)}
                          placeholder="Message..."
                          rows={2}
                          className="w-full text-xs rounded-lg px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary/30 text-slate-800 dark:text-slate-100 resize-none"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={sendNotification}
                            disabled={sendingNotif || !newNotifTitle.trim() || !newNotifMessage.trim()}
                            className="flex-1 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                          >
                            {sendingNotif ? 'Sending...' : 'Notify Everyone'}
                          </button>
                          <button
                            onClick={broadcastEmail}
                            disabled={sendingBroadcast || !newNotifTitle.trim() || !newNotifMessage.trim()}
                            title="Send email to all users"
                            className="flex-1 py-1.5 text-xs font-semibold bg-slate-800 dark:bg-slate-700 text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                          >
                            {sendingBroadcast ? 'Mailing...' : 'Mail Everyone'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Notifications list — scrollable after ~3 items */}
                    <div className="max-h-54 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
                      {visibleNotifs.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">No notifications</p>
                      ) : (
                        visibleNotifs.map(n => (
                          <div key={n.id} className="flex items-start gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{n.title}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{n.message}</p>
                              {n.created_at && (
                                <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">
                                  {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                              {/* Admin: delete for everyone */}
                              {isAdmin && (
                                <button
                                  onClick={() => deleteNotifForAll(n.id)}
                                  className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors"
                                  title="Remove for all users"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                              {/* Personal dismiss */}
                              <button
                                onClick={() => dismissNotif(n.id)}
                                className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
                                title="Dismiss"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="px-3 md:px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors rounded-xl border border-slate-200">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="hidden md:block px-4 py-2 text-sm font-semibold text-white bg-primary hover:opacity-90 transition-all rounded-xl shadow-md shadow-primary/20">
                  Sign Up
                </button>
              </SignUpButton>
            </Show>
            {/* Right sidebar toggle — desktop only */}
            <button
              className="hidden lg:flex items-center justify-center p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              onClick={() => { setRightOpen(prev => { if (!prev) setShowNotifs(false); return !prev; }); }}
              title={rightOpen ? 'Hide studio' : 'Show studio'}
            >
              <PanelRight className="w-5 h-5" />
            </button>
            {/* AI Studio button — mobile only, opens right drawer */}
            <button
              className="flex lg:hidden items-center justify-center p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              onClick={() => { setRightDrawerOpen(prev => { if (!prev) setShowNotifs(false); return !prev; }); }}
              title="AI Studio"
            >
              <PanelRight className="w-5 h-5" />
            </button>
            <Show when="signed-in">
              {/* Plan badge — shows Plus or Pro next to avatar */}
              {userPlan !== 'free' && (
                <button
                  onClick={() => setShowPricing(true)}
                  title={`${userPlan === 'plus' ? 'Plus' : 'Pro'} plan — click to manage`}
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all hover:opacity-80 ${
                    userPlan === 'pro'
                      ? 'bg-[#0D1B2A] text-white dark:bg-white dark:text-slate-900'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}
                >
                  <Crown className="w-3 h-3" />
                  {userPlan === 'pro' ? 'Pro' : 'Plus'}
                </button>
              )}
              <UserButton afterSignOutUrl="/" />
            </Show>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Column: Notebooks Sidebar */}
        {/* Left sidebar — mobile overlay */}
        <AnimatePresence>
          {(!isMd && sidebarOpen && !showPricing) && (
            <motion.div
              key="left-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Left sidebar panel */}
        <AnimatePresence>
          {(isMd ? leftOpen : sidebarOpen) && !showPricing && (
            <motion.aside
              key="left-sidebar"
              initial={{ x: -256, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -256, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="fixed md:absolute inset-y-0 left-0 z-50 md:z-50 shrink-0 flex flex-col w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 overflow-hidden">
              <div
                className="w-64 shrink-0 flex flex-col h-full py-6 px-4">
                <div className="flex items-center justify-end mb-6 px-2">
                  <button
                    className="md:hidden p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <button
                  data-tour="new-notebook"
                  onClick={() => createNotebook()}
                  className="mb-8 w-full py-3 px-4 bg-primary text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-[0.98]"
                >
                  <Plus className="w-5 h-5" />
                  New Notebook
                </button>

                <nav className="flex-1 overflow-y-auto">
                  <div className="px-2 py-3">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-600 mb-3 block">Notebooks</span>
                    <div className="space-y-1.5">
                      {notebooks.map(nb => {
                        const isActive = activeNotebookId === nb.id;
                        const isEditing = editingNotebookId === nb.id;
                        const isOpen = openNotebookId === nb.id;

                        return (
                          <div key={nb.id} data-notebook-id={nb.id} className="rounded-xl overflow-hidden">
                            {/* Notebook row */}
                            <div
                              onClick={() => !isEditing && switchNotebook(nb.id)}
                              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${isActive
                                  ? 'bg-primary/10 dark:bg-primary/10 black:bg-white/[0.07]'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 black:hover:bg-white/4'
                                }`}
                            >
                              <BookOpen className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary dark:text-white' : 'text-slate-400 dark:text-slate-500'
                                }`} />

                              {isEditing ? (
                                <input
                                  autoFocus
                                  className="min-w-0 flex-1 text-sm bg-transparent border-b border-primary outline-none py-0 leading-tight text-slate-900 dark:text-slate-100"
                                  value={editingName}
                                  onChange={e => setEditingName(e.target.value)}
                                  onBlur={() => commitRename(nb.id)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') commitRename(nb.id);
                                    if (e.key === 'Escape') setEditingNotebookId(null);
                                  }}
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : (
                                <span className={`flex-1 text-sm truncate ${isActive ? 'font-semibold text-primary dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'
                                  }`}>
                                  {nb.name}
                                </span>
                              )}

                              {/* 3 action buttons — always visible */}
                              <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                                {/* Edit / Rename */}
                                <button
                                  onClick={e => startRename(nb.id, nb.name, e)}
                                  className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                  title="Rename notebook"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                {/* Delete */}
                                <button
                                  onClick={e => deleteNotebook(nb.id, e)}
                                  className="p-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                  title="Delete notebook"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                                {/* PDF Dropdown toggle */}
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    const opening = !isOpen;
                                    setOpenNotebookId(opening ? nb.id : null);
                                    // Lazily load PDFs the first time this drawer is opened
                                    if (opening && notebookPdfs[nb.id] === undefined) {
                                      loadPdfs(nb.id);
                                    }
                                  }}
                                  className={`p-1 rounded-lg transition-all ${isOpen
                                      ? 'text-primary bg-primary/10 dark:text-slate-200 dark:bg-white/10'
                                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                  title="Show PDFs"
                                >
                                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                                </button>
                              </div>
                            </div>

                            {/* PDF dropdown panel */}
                            {isOpen && (
                              <div className="ml-4 mt-0.5 mb-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3 py-1 space-y-1">
                                {/* Uploading indicator */}
                                {uploadingPdf && openNotebookId === nb.id && (
                                  <div className="flex items-center gap-1.5 py-1 px-1.5">
                                    <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                                    <span className="text-[11px] text-primary font-medium">Processing PDF…</span>
                                  </div>
                                )}
                                {/* Loading indicator — PDFs not fetched yet for this notebook */}
                                {notebookPdfs[nb.id] === undefined && !uploadingPdf && (
                                  <div className="flex items-center gap-1.5 py-1 px-1.5">
                                    <Loader2 className="w-3 h-3 animate-spin text-slate-400 shrink-0" />
                                    <span className="text-[11px] text-slate-400">Loading…</span>
                                  </div>
                                )}
                                {notebookPdfs[nb.id] !== undefined && (notebookPdfs[nb.id] || []).length === 0 && !uploadingPdf ? (
                                  <p className="text-[11px] text-slate-400 dark:text-slate-500 py-1.5 italic">
                                    No PDFs yet — upload to add sources
                                  </p>
                                ) : (
                                  (notebookPdfs[nb.id] || []).map((pdf, pIdx) => (
                                    <label
                                      key={pdf.doc_id || pIdx}
                                      className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        className="w-3.5 h-3.5 accent-primary cursor-pointer shrink-0"
                                        checked={pdf.selected}
                                        onChange={() => {
                                          setNotebookPdfs(prev => {
                                            const list = [...(prev[nb.id] || [])];
                                            list[pIdx] = { ...list[pIdx], selected: !list[pIdx].selected };
                                            return { ...prev, [nb.id]: list };
                                          });
                                        }}
                                      />
                                      {pdf.source === 'notion' ? (
                                        <svg className="w-3 h-3 shrink-0" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="Notion">
                                          <rect width="100" height="100" rx="18" fill="#1A1A1A" />
                                          <path d="M28 26.5c1.8 1.4 2.5 1.3 5.9 1.1l32-1.9c.6 0 .1-.6-.1-.7l-5.4-3.9c-1-.8-2.4-1.7-5-.5l-31 2.3c-1.1.1-1.3.6-.8 1.1l5.4 1.5zm2.3 9v33.6c0 1.8 1 2.5 2.9 2.4l35.2-2c1.9-.1 2.4-1.1 2.4-2.5V33.6c0-1.4-.6-2.1-1.8-2l-36.4 2.1c-1.4.1-2.3.9-2.3 1.8zm34.5 1.7c.2.9 0 1.8-.9 1.9l-1.5.2v22c-1.3.7-2.5 1.1-3.5 1.1-1.6 0-2-.5-3.2-2l-9.8-15.4v14.9L50 61.5s0 2-2.8 2.4L40 64.4c-.2-.4 0-1.4.6-1.6l1.7-.5V43.1l-2.4-.2c-.2-.9.2-2.2 1.5-2.3l7.9-.5 10.2 15.6V41.3l-2.7-.3c-.2-1.1.5-1.9 1.5-2l7.5-.5z" fill="white" />
                                        </svg>
                                      ) : (
                                        <FileText className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                                      )}
                                      <div className="flex items-center gap-1 min-w-0 flex-1">
                                        <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate" title={pdf.name}>{pdf.name}</span>
                                        {pdf.total_tokens && (
                                          <svg
                                            className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition-colors cursor-default"
                                            viewBox="0 0 16 16"
                                            fill="currentColor"
                                            onMouseEnter={e => {
                                              const r = e.currentTarget.getBoundingClientRect();
                                              setPdfInfoTooltip({ pdf, x: r.right + 8, y: r.top + r.height / 2 - 40 });
                                            }}
                                            onMouseLeave={() => setPdfInfoTooltip(null)}
                                          >
                                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                                            <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
                                          </svg>
                                        )}
                                      </div>
                                      <button
                                        onClick={e => deletePdf(nb.id, pdf.doc_id, e)}
                                        className="p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-red-400 transition-colors shrink-0"
                                        title="Remove"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </label>
                                  ))
                                )}
                                {/* Upload Source button */}
                                <button
                                  onClick={() => {
                                    setSourceModalTargetId(nb.id);
                                    setShowSourceModal(true);
                                  }}
                                  disabled={uploadingPdf}
                                  className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary dark:text-slate-400 dark:hover:text-slate-200 font-medium py-1 px-1.5 transition-colors w-full disabled:opacity-50"
                                >
                                  <Plus className="w-3 h-3" />
                                  Upload Source
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {notebooks.length === 0 && !historyLoading && (
                        <p className="text-xs text-slate-400 px-3 py-2">No notebooks yet</p>
                      )}
                    </div>
                  </div>
                </nav>

                {/* Hidden PDF file input */}
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const targetId = pdfUploadTargetRef.current;
                    if (!targetId || !e.target.files?.length) return;
                    const files = Array.from(e.target.files);
                    e.target.value = ''; // reset immediately
                    for (const f of files) {
                      const result = await uploadPdfToNotebook(targetId, f);

                      // ── Auto-rename notebook from LLM-suggested name ────────────
                      if (result?.suggested_name && targetId) {
                        const newName = result.suggested_name;
                        // Update sidebar instantly
                        setNotebooks(prev =>
                          prev.map(n => n.id === targetId ? { ...n, name: newName } : n)
                        );
                        // Persist to MongoDB via the existing PATCH endpoint
                        try {
                          const token = await getToken();
                          if (token) {
                            await fetch(`${BACKEND_URL}/notebooks/${targetId}`, {
                              method: 'PATCH',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                              },
                              body: JSON.stringify({ name: newName }),
                            });
                          }
                        } catch (err) {
                          console.error('[Auto-rename notebook]', err);
                        }
                      }

                      // Reload history from MongoDB so the summary always appears
                      // immediately — fixes the need-to-refresh bug for reused/dedup PDFs.
                      if (targetId === activeNotebookId) {
                        await loadHistory(targetId);
                      }
                    }
                  }}
                />

                <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-700 space-y-1 relative">

                  {/* Help with popover */}
                  <div className="relative">
                    <AnimatePresence>
                      {showHelp && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.97 }}
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl"
                        >
                          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 px-4 pt-4 pb-2">Help</p>

                          {/* Start Tour row */}
                          <button
                            onClick={() => {
                              setShowHelp(false);
                              setTourActive(false);
                              // Small tick so state resets before re-triggering
                              requestAnimationFrame(() => setTourActive(true));
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                          >
                            <Sparkles className="w-4 h-4 text-primary shrink-0" />
                            Start Guided Tour
                          </button>

                          <div className="mx-4 border-t border-slate-100 dark:border-slate-700" />

                          {/* Keyboard shortcuts hint */}
                          <div className="px-4 py-3">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-2">Shortcuts</p>
                            <div className="space-y-1.5">
                              {[
                                ['Enter', 'Send message'],
                                ['Shift + Enter', 'New line'],
                              ].map(([key, label]) => (
                                <div key={key} className="flex items-center justify-between gap-3">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                                  <kbd className="text-[10px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 shrink-0">{key}</kbd>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <SidebarItem
                      icon={HelpCircle}
                      label="Help"
                      active={showHelp}
                      onClick={() => { setShowHelp(prev => !prev); setShowSettings(false); }}
                    />
                  </div>

                  {/* Settings with dark mode popover */}
                  <div className="relative">
                    <AnimatePresence>
                      {showSettings && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.97 }}
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-white dark:bg-slate-800 black:bg-black rounded-xl border border-slate-200 dark:border-slate-700 black:border-zinc-900 px-4 pt-4 pb-2 shadow-xl">
                          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mb-3">Settings</p>

                          {/* ── 3-way colour mode toggle ─────────────────── */}
                          <div className="mb-1">
                            <div className="flex items-center gap-2 mb-2">
                              {colorMode === 'light'
                                ? <Sun className="w-4 h-4 text-slate-500" />
                                : colorMode === 'dark'
                                  ? <Moon className="w-4 h-4 text-slate-400" />
                                  : <Moon className="w-4 h-4 text-zinc-400" />}
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Appearance</span>
                            </div>
                            <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 text-[11px] font-bold">
                              {[['light', 'Light', Sun], ['dark', 'Dark', Moon], ['black', 'Black', Moon]].map(([mode, label, Icon]) => (
                                <button
                                  key={mode}
                                  onClick={() => setColorMode(mode)}
                                  className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${colorMode === mode
                                      ? 'bg-primary text-white'
                                      : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
                                    }`}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                              <Microscope className="w-4 h-4 text-primary/70" />
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Research Mode</span>
                                <div className="relative group">
                                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-500 text-slate-400 dark:text-slate-500 text-[9px] font-bold cursor-default leading-none select-none">i</span>
                                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-44 rounded-lg bg-slate-800 dark:bg-slate-900 text-white text-[10px] leading-snug px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                                    GPT-OSS 120B · top-5 chunks · detailed answers
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => setIsResearchMode(prev => !prev)}
                              className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none shrink-0 ${isResearchMode ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'
                                }`}
                            >
                              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${isResearchMode ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                            </button>
                          </div>

                          {/* ── Deep Research toggle ─────────────────── */}
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-primary/70" />
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Deep Research</span>
                                <div className="relative group">
                                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-500 text-slate-400 dark:text-slate-500 text-[9px] font-bold cursor-default leading-none select-none">i</span>
                                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-44 rounded-lg bg-slate-800 dark:bg-slate-900 text-white text-[10px] leading-snug px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                                    Scrapes &amp; vectorises web — answers from RAG
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => setIsDeepResearch(prev => !prev)}
                              className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none shrink-0 ${isDeepResearch ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'
                                }`}
                            >
                              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${isDeepResearch ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                            </button>
                          </div>

                          {/* ── Multimedia Retrieval toggle ─────────────────── */}
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                              <ImageIcon className="w-4 h-4 text-primary/70" />
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Multimedia Retrieval</span>
                                <div className="relative group">
                                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-500 text-slate-400 dark:text-slate-500 text-[9px] font-bold cursor-default leading-none select-none">i</span>
                                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 rounded-lg bg-slate-800 dark:bg-slate-900 text-white text-[10px] leading-snug px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                                    Extracts &amp; indexes PDF images via Llama 4 Scout
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const next = !isMultimediaRetrieval;
                                setIsMultimediaRetrieval(next);
                                localStorage.setItem('mindpad_multimedia_retrieval', String(next));
                              }}
                              className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none shrink-0 ${isMultimediaRetrieval ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'
                                }`}
                            >
                              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${isMultimediaRetrieval ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                            </button>
                          </div>

                          {/* ── Notion Integration ─────────────────────────── */}
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                            {/* Workspace name above — only when connected */}
                            {notionStatus?.connected && (
                              <span className="block text-[10px] text-emerald-500 font-medium truncate mb-1.5" title={notionStatus.workspace_name}>
                                {notionStatus.workspace_icon ? `${notionStatus.workspace_icon} ` : ''}
                                {notionStatus.workspace_name || 'Connected'}
                              </span>
                            )}

                            {/* Notion label row */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-slate-800 dark:text-slate-200" fill="currentColor" aria-hidden="true">
                                  <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
                                </svg>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notion</span>
                                  <div className="relative group">
                                    <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-500 text-slate-400 dark:text-slate-500 text-[9px] font-bold cursor-default leading-none select-none">i</span>
                                    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-40 rounded-lg bg-slate-800 dark:bg-slate-900 text-white text-[10px] leading-snug px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                                      Import Notion pages as notebooks
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Connect button (disconnected state only — sits inline) */}
                              {!notionStatus?.connected && (
                                <button
                                  onClick={() => { setShowSettings(false); connectNotion(); }}
                                  className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors font-medium"
                                >
                                  Connect
                                </button>
                              )}
                            </div>

                            {/* Sync + Disconnect side by side — only when connected */}
                            {notionStatus?.connected && (
                              <div className="flex gap-1.5 mt-1.5">
                                <button
                                  onClick={() => { setShowSettings(false); openNotionPages(); }}
                                  className="flex-1 text-[9px] py-1 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors font-medium"
                                >
                                  Sync Notes
                                </button>
                                <button
                                  onClick={disconnectNotion}
                                  className="flex-1 text-[9px] py-1 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:border-red-200 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:border-red-800 dark:hover:text-red-400 transition-colors font-medium"
                                >
                                  Disconnect
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div data-tour="settings">
                    <SidebarItem
                      icon={Settings}
                      label="Settings"
                      active={showSettings}
                      onClick={() => setShowSettings(prev => !prev)}
                    />
                    </div>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Center Column: AI Chat Interface */}
        <motion.section
          animate={{ marginLeft: (isMd && leftOpen && !showPricing && !selectedPlan) ? 256 : 0, marginRight: (isLg && rightOpen && !showPricing && !selectedPlan) ? 320 : 0 }}
          transition={{
            marginLeft: { type: 'tween', duration: 0.55, ease: [0.22, 1, 0.36, 1] },
            marginRight: { type: 'tween', duration: 0.55, ease: [0.22, 1, 0.36, 1] },
          }}
          className="flex-1 flex flex-col bg-white dark:bg-slate-950 relative min-w-0 overflow-hidden" style={{ willChange: 'margin-left, margin-right' }}>
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-10 pb-4">
            <div className="w-full max-w-full space-y-8 overflow-x-hidden">
              {/* Welcome / Analysing state — empty chat + no history loading */}
              {!historyLoading && chatHistory.length === 0 && (
                uploadingPdf ? (
                  /* ── Analysing PDF animation ───────────────────────────── */
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex gap-6"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.12, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30"
                    >
                      <Sparkles className="w-5 h-5 text-white fill-white" />
                    </motion.div>
                    <div className="flex-1 space-y-4">
                      <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">Midy AI</span>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-4">
                        <div className="flex items-center gap-2">
                          <motion.span
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                            className="text-xs font-semibold text-primary/70 font-display tracking-wide"
                          >
                            Analysing PDF
                          </motion.span>
                          <div className="flex gap-1">
                            {[0, 0.2, 0.4].map((delay, i) => (
                              <motion.span
                                key={i}
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ duration: 1.2, repeat: Infinity, delay }}
                                className="text-primary/70 text-sm font-bold leading-none"
                              >.</motion.span>
                            ))}
                          </div>
                        </div>
                        {/* Shimmer bars */}
                        <div className="space-y-2.5">
                          {[3 / 4, 1 / 2, 2 / 3, 5 / 8, 3 / 5].map((w, i) => (
                            <motion.div
                              key={i}
                              animate={{ opacity: [0.25, 0.6, 0.25] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                              className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full"
                              style={{ width: `${w * 100}%` }}
                            />
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          Chunking, embedding and generating summary — this takes a few seconds…
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  /* ── Default welcome dashboard ───────────────────────────── */
                  <div className="w-full space-y-8">
                    {/* Greeting */}
                    <div>
                      <h1 className="text-2xl sm:text-4xl font-bold font-display text-slate-800 dark:text-white leading-tight">
                        {(() => { const h = new Date().getHours(); const greeting = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'; const name = user?.firstName; return name ? `${greeting}, ${name}` : greeting; })()}
                      </h1>
                      <p className="mt-1.5 sm:mt-2 text-sm sm:text-base text-slate-500 dark:text-slate-400">What would you like to do?</p>
                    </div>

                    {/* Feature grid — 2 cols on mobile, 4 on desktop */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { icon: <Sparkles className="w-5 h-5 text-slate-900 dark:text-white" />, title: 'AI Chat', desc: 'Ask Midy AI anything about your notebooks', action: () => document.querySelector('textarea')?.focus() },
                        { icon: <FileText className="w-5 h-5 text-slate-900 dark:text-white" />, title: 'Upload PDF', desc: 'Chat with your research documents via RAG', action: () => pdfInputRef.current?.click() },
                        { icon: <Globe className="w-5 h-5 text-slate-900 dark:text-white" />, title: 'Web Search', desc: 'Get real-time answers from the live web', action: () => { setIsWebSearch(true); document.querySelector('textarea')?.focus(); } },
                        { icon: <Microscope className="w-5 h-5 text-slate-900 dark:text-white" />, title: 'Deep Research', desc: 'Multi-source web scraping with AI synthesis', action: () => { setIsDeepResearch(true); document.querySelector('textarea')?.focus(); } },
                        { icon: <Network className="w-5 h-5 text-slate-900 dark:text-white" />, title: 'Mind Map', desc: 'Visualize concepts and relationships', action: () => setRightOpen(true) },
                        { icon: <Layers className="w-5 h-5 text-slate-900 dark:text-white" />, title: 'Flashcards', desc: 'Create AI-generated study flashcards', action: () => setRightOpen(true) },
                        { icon: <QuizIcon className="w-5 h-5 text-slate-900 dark:text-white" />, title: 'Quiz Mode', desc: 'Test your knowledge with AI-generated quizzes', action: () => setRightOpen(true) },
                        { icon: <LayoutDashboard className="w-5 h-5 text-slate-900 dark:text-white" />, title: 'Insight Canvas', desc: 'Generate a visual infographic from your notebook', action: () => setRightOpen(true) },
                      ].map((card, i) => (
                        <button
                          key={i}
                          onClick={card.action}
                          className="h-auto min-h-[7rem] sm:h-36 overflow-hidden p-3 sm:p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-primary/30 dark:hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 text-left group"
                        >
                          <motion.div
                            initial={{ x: i % 4 < 2 ? -20 : 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ type: 'tween', duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
                          >
                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-primary/10 dark:group-hover:bg-primary/10 transition-colors">
                              {card.icon}
                            </div>
                            <h3 className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-white mb-1">{card.title}</h3>
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{card.desc}</p>
                          </motion.div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}

              {/* Dynamic chat history — skip empty assistant placeholders to prevent ghost bubbles (but keep image messages which intentionally have empty content) */}
              {chatHistory.filter(msg => !(msg.role === 'assistant' && msg.content === '' && msg.type !== 'image')).map((msg, idx) => (
                msg.role === 'user' ? (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-6 flex-row-reverse group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                      <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div className="flex-1 space-y-2 text-right">
                      <header className="flex items-center justify-between flex-row-reverse">
                        <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">You</span>
                      </header>
                      <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl p-5 text-slate-800 dark:text-slate-200 leading-relaxed inline-block text-left border-r-4 border-primary shadow-sm">
                        {msg.imageUrl && (
                          <img
                            src={msg.imageUrl}
                            alt="attached"
                            className="max-h-52 rounded-xl object-contain mb-3 border border-slate-200 dark:border-slate-700"
                          />
                        )}
                        {msg.content !== '(image attached)' && (
                          <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                        )}
                      </div>
                      {/* User action buttons — icon only, right-aligned */}
                      {msg.content && msg.content !== '(image attached)' && (
                        <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 pt-0.5">
                          <button
                            onClick={() => copyMessage(msg.content, idx)}
                            title="Copy"
                            className={`p-1.5 rounded-lg transition-all ${copiedMsgIdx === idx
                                ? 'text-emerald-500'
                                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                              }`}
                          >
                            {copiedMsgIdx === idx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => speakMessage(msg.content, idx)}
                            disabled={speakingMsgIdx !== null}
                            title="Read aloud"
                            className={`p-1.5 rounded-lg transition-all disabled:cursor-not-allowed ${speakingMsgIdx === idx
                                ? 'text-primary'
                                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40'
                              }`}
                          >
                            {speakingMsgIdx === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-6 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
                      <Sparkles className="w-5 h-5 text-white fill-white" />
                    </div>
                    <div className="flex-1 space-y-2 min-w-0">
                      <header className="flex items-center justify-between">
                        <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">Midy AI</span>
                      </header>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 text-slate-800 dark:text-slate-200 leading-relaxed shadow-sm border border-slate-100 dark:border-slate-700/50 overflow-hidden min-w-0">
                        <div className="chat-html" dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
                      </div>
                      {/* RAG source citation dots */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 mr-0.5">Sources</span>
                          {msg.sources.map((src, si) => {
                            const srcKey = `${idx}-${si}`;
                            const isOpen = openSourceKey === srcKey;
                            return (
                              <div
                                key={si}
                                className="relative"
                                data-source-popover
                                onMouseEnter={() => setOpenSourceKey(srcKey)}
                                onMouseLeave={() => setOpenSourceKey(null)}
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenSourceKey(isOpen ? null : srcKey)}
                                  className="w-6 h-4 flex items-center justify-center rounded text-[11px] font-bold text-slate-400 dark:text-slate-500 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-all tracking-widest leading-none"
                                  title={`${src.pdf_name} — chunk ${src.chunk_index + 1}`}
                                >
                                  ···
                                </button>
                                {/* Hover (desktop) / click (mobile) popover */}
                                <div className={`absolute bottom-full left-0 pb-2 w-72 sm:w-80 z-50 ${isOpen ? 'block' : 'hidden'}`}>
                                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                      <span className="text-[10px] font-bold text-primary truncate flex-1">{src.pdf_name}</span>
                                      <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 shrink-0">chunk {src.chunk_index + 1} · {Math.round(src.score * 100)}% match</span>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto px-3 py-2">
                                      <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{src.text}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Assistant action buttons — icon only, transparent */}
                      {msg.type !== 'image' && (
                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 pt-0.5">
                          <button
                            onClick={() => copyMessage(msg.content, idx)}
                            title="Copy"
                            className={`p-1.5 rounded-lg transition-all ${copiedMsgIdx === idx
                                ? 'text-emerald-500'
                                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                              }`}
                          >
                            {copiedMsgIdx === idx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => speakMessage(msg.content, idx)}
                            disabled={speakingMsgIdx !== null}
                            title="Read aloud"
                            className={`p-1.5 rounded-lg transition-all disabled:cursor-not-allowed ${speakingMsgIdx === idx
                                ? 'text-primary'
                                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40'
                              }`}
                          >
                            {speakingMsgIdx === idx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              ))}

              {/* Thinking animation — shown while waiting for first streamed chunk */}
              {(historyLoading || (isStreaming && !isDeepResearching && (
                chatHistory[chatHistory.length - 1]?.role === 'user' ||
                chatHistory[chatHistory.length - 1]?.content === ''
              ))) && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex gap-6 pl-0.5"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.12, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30"
                    >
                      <Sparkles className="w-5 h-5 text-white fill-white" />
                    </motion.div>
                    <div className="flex-1 space-y-2">
                      <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">Midy AI</span>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-3">
                        <div className="flex items-center gap-2">
                          <motion.span
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                            className="text-xs font-semibold text-primary/70 font-display tracking-wide"
                          >
                            Thinking
                          </motion.span>
                          <div className="flex gap-1">
                            {[0, 0.2, 0.4].map((delay, i) => (
                              <motion.span
                                key={i}
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ duration: 1.2, repeat: Infinity, delay }}
                                className="text-primary/70 text-sm font-bold leading-none"
                              >
                                .
                              </motion.span>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full w-3/4" />
                          <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }} className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full w-1/2" />
                          <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }} className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full w-2/3" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

              {/* ── Deep Research animation — shown while Serper+Firecrawl+Pinecone runs ── */}
              {isDeepResearching && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex gap-6 pl-0.5"
                >
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30"
                  >
                    <Globe className="w-5 h-5 text-white" />
                  </motion.div>
                  <div className="flex-1 space-y-3">
                    <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">Midy AI — Deep Research</span>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-4">
                      {/* Animated phase label */}
                      <div className="flex items-center gap-2">
                        <motion.span
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                          className="text-xs font-semibold text-primary/70 dark:text-slate-300 font-display tracking-wide"
                        >
                          Searching · scraping · vectorising
                        </motion.span>
                        <div className="flex gap-1">
                          {[0, 0.25, 0.5].map((delay, i) => (
                            <motion.span key={i} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay }} className="text-primary/70 text-sm font-bold leading-none">.</motion.span>
                          ))}
                        </div>
                      </div>
                      {/* Phase steps */}
                      <div className="space-y-2.5">
                        {[
                          { label: 'Searching web via Serper', delay: 0 },
                          { label: 'Scraping top pages with Firecrawl', delay: 0.3 },
                          { label: 'Chunking & embedding content', delay: 0.6 },
                          { label: 'Retrieving top-3 relevant chunks', delay: 0.9 },
                        ].map(({ label, delay }, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <motion.div
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay }}
                              className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0"
                            />
                            <motion.span
                              animate={{ opacity: [0.4, 0.9, 0.4] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay }}
                              className="text-[11px] text-slate-500 dark:text-slate-400"
                            >
                              {label}
                            </motion.span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">This may take 20–60 seconds — scraping live web pages…</p>
                    </div>
                  </div>
                </motion.div>
              )}



              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div
            className="p-3 md:p-8 md:pb-12 border-t border-slate-100 dark:border-slate-800 md:border-none bg-white dark:bg-slate-950">
            {/* Hidden file input — images and PDFs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = '';

                // PDF → upload via the same pipeline used by the sidebar Sources button
                if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                  if (!activeNotebookId) {
                    alert('Please select or create a notebook first.');
                    return;
                  }
                  // If PDFs for this notebook haven't been loaded yet, initialise the list
                  // to an empty array so the dropdown doesn't show the generic "Loading…"
                  // spinner while the upload is in flight.
                  if (notebookPdfs[activeNotebookId] === undefined) {
                    setNotebookPdfs(prev => ({ ...prev, [activeNotebookId]: [] }));
                    // Also kick off a background fetch so older PDFs appear alongside the new one
                    loadPdfs(activeNotebookId);
                  }
                  const result = await uploadPdfToNotebook(activeNotebookId, file);

                  // ── Auto-rename notebook from LLM-suggested name (mirrors sidebar handler) ──
                  if (result?.suggested_name && activeNotebookId) {
                    const newName = result.suggested_name;
                    setNotebooks(prev =>
                      prev.map(n => n.id === activeNotebookId ? { ...n, name: newName } : n)
                    );
                    try {
                      const token = await getToken();
                      if (token) {
                        await fetch(`${BACKEND_URL}/notebooks/${activeNotebookId}`, {
                          method: 'PATCH',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ name: newName }),
                        });
                      }
                    } catch (err) {
                      console.error('[Auto-rename notebook]', err);
                    }
                  }

                  // ── Reload history from MongoDB so the chat always reflects what the
                  // backend saved — handles both new uploads and dedup/reused cases where
                  // setChatHistory on the response could miss an empty-summary anchor. ──
                  await loadHistory(activeNotebookId);

                  // ── Scroll the notebook item into view in the sidebar ──
                  // Small delay lets React flush the setOpenNotebookId re-render first
                  setTimeout(() => {
                    document
                      .querySelector(`[data-notebook-id="${activeNotebookId}"]`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 80);

                  return;
                }

                // Image → multimodal input (existing behaviour)
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const dataUrl = ev.target.result;
                  setAttachedImage({
                    dataUrl,
                    base64: dataUrl.split(',')[1],
                    mimeType: file.type,
                    name: file.name,
                  });
                };
                reader.readAsDataURL(file);
              }}
            />
            <div className="w-full relative group">
              {/* Image preview above the input */}
              {attachedImage && (
                <div className="mb-2 flex items-center gap-2 px-1">
                  <div className="relative inline-block">
                    <img
                      src={attachedImage.dataUrl}
                      alt="preview"
                      className="h-16 w-24 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-sm"
                    />
                    <button
                      onClick={() => setAttachedImage(null)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-700 dark:bg-slate-600 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-35">{attachedImage.name}</span>
                </div>
              )}
              {/* Input box — flex-col: top row has paperclip + textarea, bottom row has lang pill + buttons */}
              <div
                data-tour="chat-input"
                className={`glass-input rounded-2xl flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.08)] border transition-all duration-300 ${isRecording
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-slate-200 dark:border-white/20'
                  }`}
              >
                {/* Top: Paperclip (top-aligned) + Textarea */}
                <div className="flex items-start gap-2 px-2 pt-2 pb-0">
                  <button
                    data-tour="pdf-upload"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`mt-1 p-2 rounded-xl transition-all shrink-0 ${attachedImage || uploadingPdf
                        ? 'text-primary bg-primary/10'
                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    title="Attach image or PDF"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  {isRecording ? (
                    <div className="flex-1 flex items-center gap-2 py-3 px-1">
                      <span className="text-sm font-semibold text-red-500 dark:text-red-400">Listening</span>
                      <span className="flex gap-0.5 items-end">
                        {[0, 0.15, 0.3].map((delay, i) => (
                          <motion.span
                            key={i}
                            animate={{ scaleY: [0.4, 1.2, 0.4] }}
                            transition={{ duration: 0.7, repeat: Infinity, delay, ease: 'easeInOut' }}
                            className="inline-block w-0.5 h-3 bg-red-400 rounded-full origin-bottom"
                          />
                        ))}
                      </span>
                    </div>
                  ) : (
                    <textarea
                      className="flex-1 bg-transparent border-none focus:ring-0 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none max-h-48 scrollbar-hide outline-none"
                      placeholder={isTranscribing ? 'Transcribing…' : 'Ask Midy AI...'}
                      rows={2}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isStreaming || isTranscribing}
                      enterKeyHint="send"
                    />
                  )}
                </div>

                {/* Bottom row: language pill + web search (left, adjacent) · mic + send (right) */}
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  {/* Left group: Language pill + toggles */}
                  <div className="flex items-center gap-2">
                    {/* Language pill — always visible */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowLangMenu(prev => !prev)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary dark:hover:text-primary transition-all border border-slate-200 dark:border-slate-700"
                      >
                        <Languages className="w-3 h-3" />
                        {selectedLang.label}
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showLangMenu ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showLangMenu && (
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.97 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className="absolute bottom-full mb-2 left-0 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden z-60 min-w-40">
                            {LANGUAGES.map(lang => (
                              <button
                                key={lang.code}
                                type="button"
                                onClick={() => { setSelectedLang(lang); setShowLangMenu(false); }}
                                className={`w-full flex items-center justify-between px-4 py-2 text-xs transition-colors ${selectedLang.code === lang.code
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                              >
                                <span>{lang.label}</span>
                                <span className="text-slate-400 dark:text-slate-500 text-[11px]">{lang.native}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Desktop: Web Search + Deep Research pills always visible */}
                    <div className="hidden md:flex items-center gap-2">
                      {/* Web Search toggle pill */}
                      <button
                        data-tour="web-search"
                        type="button"
                        onClick={() => setIsWebSearch(prev => !prev)}
                        title={isWebSearch ? 'Web Search ON — click to disable' : 'Enable Web Search'}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all border ${isWebSearch
                            ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                      >
                        <Globe className="w-3 h-3" />
                        Web Search
                      </button>

                      {/* Deep Research toggle pill */}
                      <button
                        data-tour="deep-research"
                        type="button"
                        onClick={() => setIsDeepResearch(prev => !prev)}
                        title={isDeepResearch ? 'Deep Research ON — click to disable' : 'Enable Deep Research'}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all border ${isDeepResearch
                            ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                      >
                        <Microscope className="w-3 h-3" />
                        Deep Research
                      </button>
                    </div>

                    {/* Mobile: + button that opens a popover with Web Search + Deep Research */}
                    <div className="relative md:hidden">
                      <button
                        type="button"
                        onClick={() => setMobileToolsOpen(prev => !prev)}
                        className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold transition-all border ${(isWebSearch || isDeepResearch)
                            ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        title="More options"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {mobileToolsOpen && (
                        <>
                          {/* Backdrop */}
                          <div className="fixed inset-0 z-40" onClick={() => setMobileToolsOpen(false)} />
                          {/* Popover */}
                          <div className="absolute bottom-full mb-2 left-0 z-50 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2 min-w-45">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400 px-1 mb-1">Search & Research</p>
                            {/* Web Search option */}
                            <button
                              type="button"
                              onClick={() => { setIsWebSearch(prev => !prev); setMobileToolsOpen(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${isWebSearch
                                  ? 'bg-primary text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                              <Globe className="w-3.5 h-3.5 shrink-0" />
                              Web Search
                              {isWebSearch && <span className="ml-auto text-[9px] font-bold opacity-80">ON</span>}
                            </button>
                            {/* Deep Research option */}
                            <button
                              type="button"
                              onClick={() => { setIsDeepResearch(prev => !prev); setMobileToolsOpen(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${isDeepResearch
                                  ? 'bg-primary text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                              <Microscope className="w-3.5 h-3.5 shrink-0" />
                              Deep Research
                              {isDeepResearch && <span className="ml-auto text-[9px] font-bold opacity-80">ON</span>}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mic + Send */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleRecording}
                      disabled={isTranscribing}
                      title={isRecording ? 'Stop recording' : (isTranscribing ? 'Transcribing...' : 'Voice input')}
                      className={`p-2 rounded-xl transition-all relative ${isRecording
                          ? 'text-white bg-red-500 shadow-lg shadow-red-500/30'
                          : isTranscribing
                            ? 'text-slate-400 dark:text-slate-300 animate-pulse'
                            : 'text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 shadow-sm'
                        }`}
                    >
                      {isRecording && (
                        <span className="absolute inset-0 rounded-xl animate-ping bg-red-400/40" />
                      )}
                      {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (isStreaming) { stopStreaming(); } else { sendMessage(); }
                      }}
                      disabled={!isStreaming && !message.trim() && !attachedImage}
                      className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
                      style={{
                        backgroundColor: isStreaming
                          ? (colorMode === 'light' ? '#0f172a' : '#ffffff')
                          : 'var(--color-primary)',
                        transition: 'background-color 0ms',
                      }}
                    >
                      {isStreaming
                        ? <StopCircle className="w-4 h-4" style={{ color: colorMode === 'light' ? '#ffffff' : '#0f172a' }} />
                        : <ArrowUp className="w-4 h-4 text-white" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>


        {/* Right panel — mobile overlay */}
        <AnimatePresence>
          {(!isLg && rightDrawerOpen) && (
            <motion.div
              key="right-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setRightDrawerOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Right Column: AI Studio Panel */}
        <AnimatePresence>
          {(isLg ? rightOpen : rightDrawerOpen) && !showPricing && !selectedPlan && (
            <motion.aside
              key="right-sidebar"
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="fixed lg:absolute inset-y-0 right-0 z-50 lg:z-50 flex shrink-0 flex-col w-80 bg-slate-50 dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800 overflow-hidden">
              <div
                className="w-80 h-full flex flex-col shrink-0">
                <div data-tour="ai-studio" className="p-6 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display font-bold text-lg text-primary dark:text-slate-100 tracking-tight">AI Studio</h3>
                    <div className="flex items-center gap-2">
                      <span className="bg-primary text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">Pro</span>
                      {/* Mobile close button */}
                      <button
                        className="lg:hidden p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        onClick={() => setRightDrawerOpen(false)}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Transform your research into media assets.</p>
                </div>

                <div ref={studioScrollRef} className="p-6 overflow-y-auto flex-1">
                  <div className="grid grid-cols-2 gap-4">
                    {(() => {
                      const scrollDown = () => setTimeout(() => studioScrollRef.current?.scrollTo({ top: studioScrollRef.current.scrollHeight, behavior: 'smooth' }), 950);
                      return (<>
                        <StudioTool icon={Network} label="Mind Map" onClick={() => { generateMindMap(); scrollDown(); }} />
                        <StudioTool icon={Podcast} label="Audio Podcast" loading={isGeneratingAudioPodcast} onClick={() => { generateAudioPodcast(); scrollDown(); }} />
                        <StudioTool icon={Video} label="Visual Podcast" loading={isGeneratingVisualPodcast} suppressClickFlash externalFlash={visualPodcastCardFlash} onExternalFlashDone={() => setVisualPodcastCardFlash(false)} onClick={() => setShowVisualPodcastModal(true)} />
                        <StudioTool icon={Film} label="Video Suggestions" loading={isGeneratingVideos} onClick={() => { generateVideoSuggestions(); scrollDown(); }} />
                        <StudioTool icon={Layers} label="Flashcards" loading={isGeneratingFlashcards} onClick={() => { generateFlashcards(); scrollDown(); }} />
                        <StudioTool icon={QuizIcon} label="Quiz Mode" loading={isGeneratingQuiz} suppressClickFlash externalFlash={quizCardFlash} onExternalFlashDone={() => setQuizCardFlash(false)} onClick={() => setShowQuizModal(true)} />
                        <StudioTool icon={LayoutDashboard} label="Insight Canvas" onClick={() => { generateInsightCanvas(); scrollDown(); }} />
                        <StudioTool icon={Brain} label="MindSpeak" onClick={scrollDown} />
                      </>);
                    })()}
                  </div>

                  <div className="mt-8 space-y-4">
                    <h4 className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">Contextual Reference</h4>
                    <motion.div
                      whileHover={{ y: -2 }}
                      className="bg-white dark:bg-slate-800 p-4 rounded-xl border-l-4 border-l-primary shadow-sm border border-slate-100 dark:border-slate-700"
                    >
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wider">Decoherence in Qubits</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">Environmental factors (temp, noise) leading to information loss in quantum systems...</p>
                      <img
                        className="mt-3 rounded-lg w-full h-24 object-cover"
                        alt="Quantum particles"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAaJQNo9Aqcgrq_ao1grn4YLD8RgenX-FXCJJRbJXn2uIOVGY4Pwyg6JCG77YJA7njolIxEbbynzDhzHTuXERlSPlFvoVb3fUA4cp7vEbqzO3i2x3kTnLkA-B0jNb-REaWtyXQV488d9zJfaCPzNHv4IYxXH7qBkbBKK6tlax1lqBpeaxa1WIDh-l5N02MEGw3VG-Pk7mSteSUXop45QpLuNbH-teniH0mRvyUeowznAJXbx3eZKpPe-5IYbcBdjmyeQoGsUPvOFKTo"
                        referrerPolicy="no-referrer"
                      />
                    </motion.div>

                    {/* ── Insight Canvas result box — per notebook ───────────── */}
                    <AnimatePresence>
                      {(isGeneratingInsight || insightCanvasImages[activeNotebookId]) && (
                        <motion.button
                          key={`ic-${activeNotebookId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          disabled={isGeneratingInsight}
                          onClick={() => { if (!isGeneratingInsight) { setCanvasZoom(1); setCanvasPan({ x: 0, y: 0 }); setShowInsightModal(true); } }}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all disabled:cursor-default text-left group"
                        >
                          {/* Icon area */}
                          <div className="relative w-10 h-10 rounded-full bg-primary/8 dark:bg-primary/15 flex items-center justify-center shrink-0">
                            <LayoutDashboard className="w-5 h-5 text-primary" />
                            {isGeneratingInsight && (
                              <span className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            )}
                          </div>
                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Insight Canvas</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                              {isGeneratingInsight ? 'Crafting infographic…' : 'Tap to view infographic'}
                            </p>
                          </div>
                          {/* Arrow when ready */}
                          {!isGeneratingInsight && (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    {/* ── Mind Map result box — per notebook ─────────────────── */}
                    <AnimatePresence>
                      {(isGeneratingMindMap || mindMapData[activeNotebookId]) && (
                        <motion.button
                          key={`mm-${activeNotebookId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          disabled={isGeneratingMindMap}
                          onClick={() => { if (!isGeneratingMindMap) setShowMindMapModal(true); }}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all disabled:cursor-default text-left group"
                        >
                          <div className="relative w-10 h-10 rounded-full bg-primary/8 dark:bg-primary/15 flex items-center justify-center shrink-0">
                            <Network className="w-5 h-5 text-primary dark:text-slate-300" />
                            {isGeneratingMindMap && (
                              <span className="absolute inset-0 rounded-full border-2 border-primary dark:border-slate-300 border-t-transparent animate-spin" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Mind Map</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                              {isGeneratingMindMap ? 'Building mind map…' : 'Tap to explore map'}
                            </p>
                          </div>
                          {!isGeneratingMindMap && (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    {/* ── Video Suggestions result box — per notebook ────────── */}
                    <AnimatePresence>
                      {(isGeneratingVideos || videoSuggestionsData[activeNotebookId]) && (
                        <motion.button
                          key={`vs-${activeNotebookId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          disabled={isGeneratingVideos}
                          onClick={() => { if (!isGeneratingVideos) setShowVideoModal(true); }}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all disabled:cursor-default text-left group"
                        >
                          <div className="relative w-10 h-10 rounded-full bg-primary/8 dark:bg-primary/15 flex items-center justify-center shrink-0">
                            <Film className="w-5 h-5 text-primary dark:text-slate-300" />
                            {isGeneratingVideos && (
                              <span className="absolute inset-0 rounded-full border-2 border-primary dark:border-slate-300 border-t-transparent animate-spin" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Video Suggestions</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                              {isGeneratingVideos ? 'Finding videos…' : `${videoSuggestionsData[activeNotebookId]?.videos?.length || 0} videos ready`}
                            </p>
                          </div>
                          {!isGeneratingVideos && (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    {/* ── Flashcards result box — per notebook ──────────────── */}
                    <AnimatePresence>
                      {(isGeneratingFlashcards || flashcardsData[activeNotebookId]) && (
                        <motion.button
                          key={`fc-${activeNotebookId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          disabled={isGeneratingFlashcards}
                          onClick={() => { if (!isGeneratingFlashcards) setShowFlashcardsModal(true); }}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all disabled:cursor-default text-left group"
                        >
                          <div className="relative w-10 h-10 rounded-full bg-primary/8 dark:bg-primary/15 flex items-center justify-center shrink-0">
                            <Layers className="w-5 h-5 text-primary dark:text-slate-300" />
                            {isGeneratingFlashcards && (
                              <span className="absolute inset-0 rounded-full border-2 border-primary dark:border-slate-300 border-t-transparent animate-spin" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Flashcards</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                              {isGeneratingFlashcards ? 'Generating cards…' : `${flashcardsData[activeNotebookId]?.cards?.length || 0} cards ready`}
                            </p>
                          </div>
                          {!isGeneratingFlashcards && (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    {/* ── Quiz result box — per notebook ────────────────── */}
                    <AnimatePresence>
                      {(isGeneratingQuiz || quizData[activeNotebookId]) && (
                        <motion.button
                          key={`qz-${activeNotebookId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          disabled={isGeneratingQuiz}
                          onClick={() => { if (!isGeneratingQuiz) setShowQuizModal(true); }}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all disabled:cursor-default text-left group"
                        >
                          <div className="relative w-10 h-10 rounded-full bg-primary/8 dark:bg-primary/15 flex items-center justify-center shrink-0">
                            <QuizIcon className="w-5 h-5 text-primary dark:text-slate-300" />
                            {isGeneratingQuiz && (
                              <span className="absolute inset-0 rounded-full border-2 border-primary dark:border-slate-300 border-t-transparent animate-spin" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Quiz Mode</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                              {isGeneratingQuiz ? 'Generating questions…' : `${quizData[activeNotebookId]?.questions?.length || 0} questions ready`}
                            </p>
                          </div>
                          {!isGeneratingQuiz && (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    {/* ── Audio Podcast result box — per notebook ─────────── */}
                    <AnimatePresence>
                      {(isGeneratingAudioPodcast || audioPodcastData[activeNotebookId] || audioPodcastResults[activeNotebookId]) && (
                        <motion.div
                          key={`ap-${activeNotebookId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all text-left group"
                        >
                          {/* Clickable main area */}
                          <button
                            disabled={isGeneratingAudioPodcast}
                            onClick={() => { if (!isGeneratingAudioPodcast) setShowAudioPodcastModal(true); }}
                            className="flex items-center gap-3 flex-1 min-w-0 disabled:cursor-default text-left"
                          >
                            <div className="relative w-10 h-10 rounded-full bg-primary/8 dark:bg-primary/15 flex items-center justify-center shrink-0">
                              <Podcast className="w-5 h-5 text-primary dark:text-slate-300" />
                              {isGeneratingAudioPodcast && (
                                <span className="absolute inset-0 rounded-full border-2 border-primary dark:border-slate-300 border-t-transparent animate-spin" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Audio Podcast</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                                {isGeneratingAudioPodcast ? 'Generating podcast…' : 'Tap to play'}
                              </p>
                            </div>
                          </button>
                          {/* Delete button — hover-reveal */}
                          {!isGeneratingAudioPodcast && (
                            <button
                              onClick={e => { e.stopPropagation(); deleteAudioPodcast(activeNotebookId); }}
                              title="Remove"
                              className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* ── Visual Podcast result box — per notebook ──────────── */}
                    <AnimatePresence>
                      {(isGeneratingVisualPodcast || visualPodcastData[activeNotebookId] || visualPodcastResults[activeNotebookId]) && (
                        <motion.div
                          key={`vp-${activeNotebookId}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all text-left group"
                        >
                          {/* Clickable main area */}
                          <button
                            disabled={isGeneratingVisualPodcast}
                            onClick={() => { if (!isGeneratingVisualPodcast) setShowVisualPodcastModal(true); }}
                            className="flex items-center gap-3 flex-1 min-w-0 disabled:cursor-default text-left"
                          >
                            <div className="relative w-10 h-10 rounded-full bg-primary/8 dark:bg-primary/15 flex items-center justify-center shrink-0">
                              <Video className="w-5 h-5 text-primary dark:text-slate-300" />
                              {isGeneratingVisualPodcast && (
                                <span className="absolute inset-0 rounded-full border-2 border-primary dark:border-slate-300 border-t-transparent animate-spin" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">Visual Podcast</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                              {isGeneratingVisualPodcast ? (
                                visualPodcastProgress[activeNotebookId]?.slide > 0
                                  ? `Slide ${visualPodcastProgress[activeNotebookId].slide} / ${visualPodcastProgress[activeNotebookId].total} — ${visualPodcastProgress[activeNotebookId].heading}`
                                  : 'Starting…'
                              ) : 'Tap to play'}
                              </p>
                            </div>
                          </button>
                          {/* Delete button — hover-reveal */}
                          {!isGeneratingVisualPodcast && (
                            <button
                              onClick={e => { e.stopPropagation(); deleteVisualPodcast(activeNotebookId); }}
                              title="Remove"
                              className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
      <GuidedTour forceActive={tourActive} />
    </div>
  );
}
