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
  FileText,
  Download,
  Microscope,
  MicOff,
  Globe,
} from 'lucide-react';
import { motion } from 'motion/react';
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
import mindpadLogo from './mindpad_ai_logo.png';
import mindpadLogoDark from './mindpad_ai_logo_dark.png';
import { storage } from './firebase.jsx';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const LANGUAGES = [
  { code: 'en', label: 'English',   native: 'English'    },
  { code: 'hi', label: 'Hindi',     native: 'हिंदी'       },
  { code: 'bn', label: 'Bengali',   native: 'বাংলা'       },
  { code: 'ta', label: 'Tamil',     native: 'தமிழ்'      },
  { code: 'te', label: 'Telugu',    native: 'తెలుగు'     },
  { code: 'kn', label: 'Kannada',   native: 'ಕನ್ನಡ'     },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം'    },
  { code: 'mr', label: 'Marathi',   native: 'मराठी'      },
  { code: 'gu', label: 'Gujarati',  native: 'ગુજરાતી'    },
  { code: 'pa', label: 'Punjabi',   native: 'ਪੰਜਾਬੀ'    },
  { code: 'ur', label: 'Urdu',      native: 'اردو'       },
  { code: 'or', label: 'Odia',      native: 'ଓଡ଼ିଆ'      },
];

const SidebarItem = ({ icon: Icon, label, active = false, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-2.5 transition-colors rounded-lg group w-full text-left ${
      active
        ? 'text-slate-900 dark:text-slate-100 font-bold bg-slate-200/50 dark:bg-white/5'
        : 'text-slate-500 dark:text-slate-500 font-medium hover:bg-slate-200/50 dark:hover:bg-white/5'
    }`}
  >
    <Icon className={`w-5 h-5 ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`} />
    <span className="text-sm truncate">{label}</span>
  </button>
);

const StudioTool = ({ icon: Icon, label }) => (
  <button className="aspect-square bg-white dark:bg-slate-800 rounded-lg p-4 flex flex-col items-center justify-center text-center gap-3 hover:shadow-md transition-all border border-slate-100 dark:border-slate-700 group">
    <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-700/60 flex items-center justify-center group-hover:bg-primary/5 dark:group-hover:bg-slate-600/60 transition-colors">
      <Icon className="w-6 h-6 text-primary dark:text-slate-300" />
    </div>
    <span className="text-[10px] font-bold font-display text-primary dark:text-slate-300 uppercase tracking-tight">{label}</span>
  </button>
);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Mirror of backend IMAGE_INTENT_KEYWORDS
const IMAGE_INTENT_KEYWORDS = [
  'generate an image', 'generate a image', 'generate image',
  'create an image', 'create a image', 'create image',
  'make an image', 'make a image', 'make image',
  'draw an image', 'draw a image', 'draw an', 'draw a ',
  'draw the ', 'draw me ',
  'generate a picture', 'generate a photo', 'generate an illustration',
  'create a picture', 'create a photo', 'create an illustration',
  'make a picture', 'make a photo', 'make a drawing', 'make an illustration',
  'show me an image', 'show me a picture', 'show me a photo',
  'visualize this', 'illustrate this',
  'explain with an image', 'explain with image',
  'with a diagram', 'with a picture',
  'generate a drawing', 'create a drawing',
  'paint a ', 'paint an ',
  'sketch a ', 'sketch an ',
];
const _IMAGE_VERB_RE = /\b(generate|create|make|draw|paint|sketch|produce|render)\s+(a |an |me |the )?(image|picture|photo|photograph|illustration|drawing|artwork|visual|diagram)\b/i;
const isImageRequest = (text) =>
  IMAGE_INTENT_KEYWORDS.some(kw => text.toLowerCase().includes(kw)) || _IMAGE_VERB_RE.test(text);


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
  const [showSettings, setShowSettings] = useState(false);
  // colorMode: 'light' | 'dark' (navy) | 'black' (OLED true black)
  const [colorMode, setColorMode] = useState(() => {
    const saved = localStorage.getItem('mindpad_color_mode');
    if (saved === 'dark' || saved === 'black' || saved === 'light') return saved;
    // Legacy migration: if old 'mindpad_dark' was true, default to 'dark'
    return localStorage.getItem('mindpad_dark') === 'true' ? 'dark' : 'light';
  });
  const [isResearchMode, setIsResearchMode] = useState(() => localStorage.getItem('mindpad_research') === 'true');
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState(null); // index of message being synthesized
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);     // index of message whose text was copied
  const [openNotebookId, setOpenNotebookId] = useState(null); // which notebook's PDF drawer is open
  // notebookPdfs: { [notebookId]: [{ name, size, selected }] }
  const [notebookPdfs, setNotebookPdfs] = useState({});
  const pdfInputRef = useRef(null);
  const pdfUploadTargetRef = useRef(null);

  // ── Notifications ──────────────────────────────────────────────────────────
  const ADMIN_EMAIL = 'priyanshumadhup@gmail.com';
  const userEmail = user?.primaryEmailAddress?.emailAddress || '';
  const isAdmin = userEmail === ADMIN_EMAIL;
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [dismissedNotifs, setDismissedNotifs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mindpad_dismissed_notifs') || '[]'); }
    catch { return []; }
  });
  const [newNotifTitle, setNewNotifTitle] = useState('');
  const [newNotifMessage, setNewNotifMessage] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  const visibleNotifs = notifications.filter(n => !dismissedNotifs.includes(n.id));
  const unreadCount = visibleNotifs.length;

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
    } catch {}
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

  // Apply color mode classes on mount and toggle
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', colorMode === 'dark' || colorMode === 'black');
    root.classList.toggle('black', colorMode === 'black');
    localStorage.setItem('mindpad_color_mode', colorMode);
  }, [colorMode]);

  // Persist research mode
  useEffect(() => {
    localStorage.setItem('mindpad_research', isResearchMode);
  }, [isResearchMode]);

  // Fetch notifications when signed in
  useEffect(() => {
    if (isSignedIn) fetchNotifications();
  }, [isSignedIn, fetchNotifications]);

  // Notebooks state
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebookId, setActiveNotebookId] = useState(null);
  const [editingNotebookId, setEditingNotebookId] = useState(null);
  const [editingName, setEditingName] = useState('');

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
  const fileInputRef = React.useRef(null);

  const [attachedImage, setAttachedImage] = useState(null); // { dataUrl, base64, mimeType, name }

  // Load notebooks when view changes to workspace via manual navigation (e.g. login button).
  // Note: on auth-driven transitions (page load / sign-in), loadNotebooks is called
  // directly from the auth effect below to avoid waiting an extra render cycle.
  useEffect(() => {
    if (view === 'workspace' && isSignedIn && isLoaded) {
      loadNotebooks();
    }
  }, [view]);

  const loadNotebooks = async () => {
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

      if (list.length === 0) {
        // Auto-create first notebook
        await createNotebook('My Workspace', true);
      } else {
        // Open the most recent notebook
        const first = list[0];
        setActiveNotebookId(first.id);
        await loadHistory(first.id);
      }
    } catch (err) {
      console.error('Failed to load notebooks:', err);
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
      setNotebooks(prev => [newNb, ...prev]);
      setActiveNotebookId(nb.id);
      setChatHistory([]);
      if (!silent) setSidebarOpen(false);
    } catch (err) {
      console.error('Failed to create notebook:', err);
    }
  };

  const switchNotebook = async (id) => {
    if (id === activeNotebookId || isStreaming) return;
    setActiveNotebookId(id);
    setChatHistory([]);
    setSidebarOpen(false);
    await loadHistory(id);
  };

  const deleteNotebook = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this notebook and all its chats?')) return;
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`${BACKEND_URL}/notebooks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const remaining = notebooks.filter(n => n.id !== id);
      setNotebooks(remaining);
      if (activeNotebookId === id) {
        if (remaining.length > 0) {
          setActiveNotebookId(remaining[0].id);
          await loadHistory(remaining[0].id);
        } else {
          await createNotebook('My Workspace', true);
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isStreaming]);

  // Auth state drives view — sign in → workspace, sign out → landing.
  // We also call loadNotebooks() directly here to avoid waiting for the
  // notebooks useEffect to fire on the NEXT render cycle, which adds
  // noticeable delay on page load with an existing session.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      setView('workspace');
      loadNotebooks(); // fire immediately — don't wait for view state to propagate
    } else {
      setView('landing');
      setChatHistory([]); // Clear stale history on sign-out
    }
  }, [isSignedIn, isLoaded]);

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
    // If this looks like an image generation request, show crafting indicator
    if (isImageRequest(userText) && !attachedImage) setIsGeneratingImage(true);

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
          response_language: selectedLang.label,
          ...(currentImage ? { image_base64: currentImage.base64, image_mime_type: currentImage.mimeType } : {}),
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const contentType = response.headers.get('content-type') || '';
      const imageFallback = response.headers.get('x-image-fallback') === '1';

      if (contentType.includes('application/json')) {
        // Image generation response
        const data = await response.json();
        if (data.type === 'image') {
          // Show image immediately from base64 while we upload to Firebase in background
          setChatHistory(prev => [...prev, {
            role: 'assistant',
            type: 'image',
            content: '',
            src: data.url,   // base64 data URL — shown instantly
            prompt: data.prompt,
          }]);

          // Upload to Firebase Storage and persist URL to MongoDB
          (async () => {
            try {
              // Convert base64 data URL → Blob
              const base64 = data.url.split(',')[1];
              const mimeType = data.url.split(';')[0].split(':')[1] || 'image/jpeg';
              const byteChars = atob(base64);
              const byteArr = new Uint8Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
              const blob = new Blob([byteArr], { type: mimeType });

              // Upload to Firebase Storage
              const filename = `generated/${activeNotebookId}/${Date.now()}.jpg`;
              const storageRef = ref(storage, filename);
              await uploadBytes(storageRef, blob);
              const firebaseUrl = await getDownloadURL(storageRef);
              console.log('[Firebase] Uploaded image:', firebaseUrl);

              // Replace base64 src in chat with Firebase URL
              setChatHistory(prev => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].type === 'image' && updated[i].src === data.url) {
                    updated[i] = { ...updated[i], src: firebaseUrl };
                    break;
                  }
                }
                return updated;
              });

              // Save Firebase URL to MongoDB via backend
              const token = await getToken();
              await fetch(`${BACKEND_URL}/notebooks/${activeNotebookId}/save-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  messages: newHistory.map(m => ({ role: m.role, content: m.content })),
                  firebase_url: firebaseUrl,
                  prompt: data.prompt,
                }),
              });
              console.log('[MongoDB] Saved Firebase URL');
            } catch (fbErr) {
              console.error('[Firebase upload failed]', fbErr);
              // Image still displays from base64 — no UX disruption
            }
          })();
        }
      } else {
        // Streaming text response (or image-gen fallback)
        if (imageFallback) setIsGeneratingImage(false);
        setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setChatHistory(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: updated[updated.length - 1].content + chunk,
            };
            return updated;
          });
        }
      }
    } catch (err) {
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: `⚠️ Error: ${err.message}. Make sure the backend is running on port 8000.` },
      ]);
    } finally {
      setIsStreaming(false);
      setIsGeneratingImage(false);
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
        body: JSON.stringify({ text: content, voice: 'autumn' }),
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
      {/* ── Click-outside overlay — closes all dropdowns ───────────────────── */}
      {(showNotifs || showSettings || showLangMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setShowNotifs(false); setShowSettings(false); setShowLangMenu(false); }}
        />
      )}
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
              <span className="text-lg font-black text-slate-900 dark:text-slate-100 font-display uppercase tracking-widest">
                Mindpad AI
              </span>
            </span>

          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative hidden md:flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-slate-400" />
              <input
                className="bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary/10 w-64 outline-none"
                placeholder="Search knowledge base..."
                type="text"
              />
            </div>
            {/* Bell / Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs(prev => !prev)}
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
              {showNotifs && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden">
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
                      <button
                        onClick={sendNotification}
                        disabled={sendingNotif || !newNotifTitle.trim() || !newNotifMessage.trim()}
                        className="w-full py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                      >
                        {sendingNotif ? 'Sending...' : 'Send to Everyone'}
                      </button>
                    </div>
                  )}

                  {/* Notifications list — scrollable after ~3 items */}
                  <div className="max-h-[216px] overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
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
                                {new Date(n.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
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
                </div>
              )}
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
              onClick={() => setRightOpen(prev => !prev)}
              title={rightOpen ? 'Hide studio' : 'Show studio'}
            >
              <PanelRight className="w-5 h-5" />
            </button>
            <Show when="signed-in">
              <UserButton afterSignOutUrl="/" />
            </Show>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Column: Notebooks Sidebar */}
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <aside className={`
          fixed md:relative inset-y-0 left-0 z-50 flex-shrink-0
          flex flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800
          overflow-hidden transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full w-72'}
          ${leftOpen ? 'md:translate-x-0 md:w-64' : 'md:translate-x-0 md:w-0'}
        `}>
          <div className="w-72 md:w-64 flex-shrink-0 flex flex-col h-full py-6 px-4">
            <div className="flex items-center justify-end mb-6 px-2">
              <button
                className="md:hidden p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
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
                      <div key={nb.id} className="rounded-xl overflow-hidden">
                        {/* Notebook row */}
                        <div
                          onClick={() => !isEditing && switchNotebook(nb.id)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
                            isActive
                              ? 'bg-primary/10 dark:bg-primary/10 black:bg-white/[0.07]'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 black:hover:bg-white/[0.04]'
                          }`}
                        >
                          <BookOpen className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-primary dark:text-white' : 'text-slate-400 dark:text-slate-500'
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
                            <span className={`flex-1 text-sm truncate ${
                              isActive ? 'font-semibold text-primary dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'
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
                                setOpenNotebookId(isOpen ? null : nb.id);
                              }}
                              className={`p-1 rounded-lg transition-all ${
                                isOpen
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
                            {(notebookPdfs[nb.id] || []).length === 0 ? (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 py-1.5 italic">
                                No PDFs yet — upload to add sources
                              </p>
                            ) : (
                              (notebookPdfs[nb.id] || []).map((pdf, pIdx) => (
                                <label
                                  key={pIdx}
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
                                  <FileText className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                                  <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate flex-1" title={pdf.name}>{pdf.name}</span>
                                  <button
                                    onClick={e => {
                                      e.preventDefault();
                                      setNotebookPdfs(prev => {
                                        const list = (prev[nb.id] || []).filter((_, i) => i !== pIdx);
                                        return { ...prev, [nb.id]: list };
                                      });
                                    }}
                                    className="p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-red-400 transition-colors shrink-0"
                                    title="Remove"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </label>
                              ))
                            )}
                            {/* Upload PDF button */}
                            <button
                              onClick={() => {
                                pdfUploadTargetRef.current = nb.id;
                                pdfInputRef.current?.click();
                              }}
                              className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary dark:text-slate-400 dark:hover:text-slate-200 font-medium py-1 px-1.5 transition-colors w-full"
                            >
                              <Plus className="w-3 h-3" />
                              Upload PDF
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
              onChange={e => {
                const targetId = pdfUploadTargetRef.current;
                if (!targetId || !e.target.files?.length) return;
                const newFiles = Array.from(e.target.files).map(f => ({
                  name: f.name,
                  size: f.size,
                  selected: true,
                }));
                setNotebookPdfs(prev => ({
                  ...prev,
                  [targetId]: [...(prev[targetId] || []), ...newFiles],
                }));
                // Auto-open the drawer for this notebook
                setOpenNotebookId(targetId);
                e.target.value = ''; // reset so same file can be re-added
              }}
            />

            <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-700 space-y-1 relative">
              <SidebarItem icon={HelpCircle} label="Help" />

              {/* Settings with dark mode popover */}
              <div className="relative">
                {showSettings && (
                  <div className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-white dark:bg-slate-800 black:bg-black rounded-xl border border-slate-200 dark:border-slate-700 black:border-zinc-900 p-4 shadow-xl">
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
                            className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${
                              colorMode === mode
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
                        <div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Research Mode</span>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Uses GPT-OSS 120B — slower but deeper</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setIsResearchMode(prev => !prev)}
                        className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none shrink-0 ${
                          isResearchMode ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'
                        }`}
                      >
                        <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${
                          isResearchMode ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  </div>
                )}
                <SidebarItem
                  icon={Settings}
                  label="Settings"
                  active={showSettings}
                  onClick={() => setShowSettings(prev => !prev)}
                />
              </div>
            </div>
          </div>
        </aside>

        {/* Center Column: AI Chat Interface */}
        <section className="flex-1 flex flex-col bg-white dark:bg-slate-950 relative min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-10 pb-4">
            <div className="w-full space-y-8">
              {/* Welcome message — only when not loading and history is empty */}
              {!historyLoading && chatHistory.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-6 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/10">
                    <Sparkles className="w-5 h-5 text-white fill-white" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <header className="flex items-center justify-between">
                      <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">Midy AI</span>
                    </header>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 text-slate-800 dark:text-slate-200 leading-relaxed shadow-sm border border-slate-100 dark:border-slate-700/50">
                      <p>Hello! I'm Midy AI, your research curator. Ask me anything — I can help you synthesize research, explain concepts, generate study aids, and more.</p>
                    </div>
                  </div>
                </motion.div>
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
                      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5 text-slate-800 dark:text-slate-200 leading-relaxed inline-block text-left border-r-4 border-primary shadow-sm">
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
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200 pt-0.5">
                          <button
                            onClick={() => copyMessage(msg.content, idx)}
                            title="Copy"
                            className={`p-1.5 rounded-lg transition-all ${
                              copiedMsgIdx === idx
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
                            className={`p-1.5 rounded-lg transition-all disabled:cursor-not-allowed ${
                              speakingMsgIdx === idx
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
                    <div className="flex-1 space-y-2">
                      <header className="flex items-center justify-between">
                        <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">Midy AI</span>
                      </header>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 text-slate-800 dark:text-slate-200 leading-relaxed shadow-sm border border-slate-100 dark:border-slate-700/50">
                        {msg.type === 'image' ? (
                          <div className="space-y-3 relative group/img">
                            <img
                              src={msg.src}
                              alt={msg.prompt || 'Generated image'}
                              className="w-full rounded-xl shadow-md border border-slate-100 dark:border-slate-700"
                              onError={(e) => { e.target.style.opacity = '0.4'; }}
                            />
                            {/* Hover action buttons */}
                            <div className="absolute bottom-3 right-3 flex gap-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity duration-200">
                              {/* Copy image to clipboard */}
                              <button
                                title="Copy image"
                                onClick={() => {
                                  const image = new Image();
                                  image.crossOrigin = 'anonymous';
                                  image.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    canvas.width = image.naturalWidth;
                                    canvas.height = image.naturalHeight;
                                    canvas.getContext('2d').drawImage(image, 0, 0);
                                    canvas.toBlob(async (blob) => {
                                      try {
                                        await navigator.clipboard.write([
                                          new ClipboardItem({ 'image/png': blob })
                                        ]);
                                      } catch {
                                        // Clipboard API not supported — copy URL as fallback
                                        navigator.clipboard.writeText(msg.src);
                                      }
                                      setCopiedMsgIdx(idx);
                                      setTimeout(() => setCopiedMsgIdx(null), 2000);
                                    }, 'image/png');
                                  };
                                  image.onerror = () => {
                                    navigator.clipboard.writeText(msg.src);
                                    setCopiedMsgIdx(idx);
                                    setTimeout(() => setCopiedMsgIdx(null), 2000);
                                  };
                                  // Cache-bust to bypass CORS preflight cache
                                  image.src = msg.src + (msg.src.includes('?') ? '&' : '?') + '_cb=' + Date.now();
                                }}
                                className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-all"
                              >
                                {copiedMsgIdx === idx
                                  ? <Check className="w-3.5 h-3.5 text-green-400" />
                                  : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              {/* Download image */}
                              <button
                                title="Download image"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(msg.src);
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `mindpad-image-${Date.now()}.jpg`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  } catch {
                                    // Fallback: open in new tab
                                    window.open(msg.src, '_blank');
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-all"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="chat-html" dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
                        )}
                      </div>
                      {/* Assistant action buttons — icon only, transparent */}
                      {msg.type !== 'image' && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pt-0.5">
                          <button
                            onClick={() => copyMessage(msg.content, idx)}
                            title="Copy"
                            className={`p-1.5 rounded-lg transition-all ${
                              copiedMsgIdx === idx
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
                            className={`p-1.5 rounded-lg transition-all disabled:cursor-not-allowed ${
                              speakingMsgIdx === idx
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
              {(historyLoading || (isStreaming && !isGeneratingImage && (
                chatHistory[chatHistory.length - 1]?.role === 'user' ||
                chatHistory[chatHistory.length - 1]?.content === ''
              ))) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex gap-6"
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

              {/* Crafting image animation — shown while NVIDIA Stable Diffusion generates */}
              {isGeneratingImage && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex gap-6"
                >
                  <motion.div
                    animate={{ scale: [1, 1.12, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30"
                  >
                    <Wand2 className="w-5 h-5 text-white" />
                  </motion.div>
                  <div className="flex-1 space-y-2">
                    <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">Midy AI</span>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <motion.span
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                          className="text-xs font-semibold text-primary/70 font-display tracking-wide"
                        >
                          Crafting image
                        </motion.span>
                        <div className="flex gap-1">
                          {[0, 0.2, 0.4].map((delay, i) => (
                            <motion.span key={i} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay }} className="text-primary/70 text-sm font-bold leading-none">.</motion.span>
                          ))}
                        </div>
                      </div>
                      {/* Shimmering image canvas placeholder */}
                      <div className="w-full aspect-video rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden relative">
                        <motion.div
                          animate={{ x: ['-100%', '200%'] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent w-1/3"
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-30">
                          <ImageIcon className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Crafting your image</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">This may take up to 60 seconds…</p>
                    </div>
                  </div>
                </motion.div>
              )}


              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="p-3 md:p-8 md:pb-12 border-t border-slate-100 dark:border-slate-800 md:border-none bg-white dark:bg-slate-950">
            {/* Hidden file input — images only */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
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
                e.target.value = '';
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
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[140px]">{attachedImage.name}</span>
                </div>
              )}
              {/* Input box — flex-col: top row has paperclip + textarea, bottom row has lang pill + buttons */}
              <div
                className={`glass-input rounded-2xl flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.08)] border transition-all duration-300 ${
                  isRecording
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-slate-200 dark:border-white/20'
                }`}
              >
                {/* Top: Paperclip (top-aligned) + Textarea */}
                <div className="flex items-start gap-2 px-2 pt-2 pb-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`mt-1 p-2 rounded-xl transition-all shrink-0 ${
                      attachedImage
                        ? 'text-primary bg-primary/10'
                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title="Attach image"
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

                {/* Bottom row: language pill (left) + mic + send (right) */}
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  {/* Language pill */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowLangMenu(prev => !prev)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary dark:hover:text-primary transition-all border border-slate-200 dark:border-slate-700"
                    >
                      <Globe className="w-3 h-3" />
                      {selectedLang.label}
                      <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showLangMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showLangMenu && (
                      <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50 min-w-[160px]">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() => { setSelectedLang(lang); setShowLangMenu(false); }}
                            className={`w-full flex items-center justify-between px-4 py-2 text-xs transition-colors ${
                              selectedLang.code === lang.code
                                ? 'bg-primary/10 text-primary font-semibold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>{lang.label}</span>
                            <span className="text-slate-400 dark:text-slate-500 text-[11px]">{lang.native}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Mic + Send */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleRecording}
                      disabled={isTranscribing}
                      title={isRecording ? 'Stop recording' : (isTranscribing ? 'Transcribing...' : 'Voice input')}
                      className={`p-2 rounded-xl transition-all relative ${
                        isRecording
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
                        sendMessage();
                      }}
                      disabled={isStreaming || (!message.trim() && !attachedImage)}
                      className="w-9 h-9 bg-primary dark:bg-white/15 dark:hover:bg-white/25 text-white rounded-xl flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* Right Column: AI Studio Panel — hidden on mobile, collapses on toggle */}
        <aside className={`hidden lg:flex flex-shrink-0 flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800 overflow-hidden transition-[width] duration-300 ease-in-out ${rightOpen ? 'w-80' : 'w-0'}`}>
          <div className="w-80 h-full flex flex-col flex-shrink-0">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-bold text-lg text-primary dark:text-slate-100 tracking-tight">AI Studio</h3>
              <span className="bg-primary text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">Pro</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Transform your research into media assets.</p>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-4">
              <StudioTool icon={Network} label="Mind Map" />
              <StudioTool icon={Podcast} label="Audio Podcast" />
              <StudioTool icon={Video} label="Visual Podcast" />
              <StudioTool icon={Film} label="Video Suggestions" />
              <StudioTool icon={Layers} label="Flashcards" />
              <StudioTool icon={QuizIcon} label="Quiz Mode" />
            </div>

            <div className="mt-8 space-y-4">
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500">Contextual Reference</h4>
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-white dark:bg-slate-800 p-4 rounded-xl border-l-4 border-primary shadow-sm border border-slate-100 dark:border-slate-700"
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
            </div>
          </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
