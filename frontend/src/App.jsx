/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  Bell,
  Plus,
  BookOpen,
  BrainCircuit,
  Palette,
  Database,
  Archive,
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
  HelpCircle as QuizIcon
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

const SidebarItem = ({ icon: Icon, label, active = false }) => (
  <a
    href="#"
    className={`flex items-center gap-3 px-3 py-2.5 transition-colors rounded-lg group ${active
        ? 'text-slate-900 font-bold border-r-2 border-slate-900 bg-slate-200/50'
        : 'text-slate-500 font-medium hover:bg-slate-200/50'
      }`}
  >
    <Icon className={`w-5 h-5 ${active ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`} />
    <span className="text-sm truncate">{label}</span>
  </a>
);

const StudioTool = ({ icon: Icon, label }) => (
  <button className="aspect-square bg-white rounded-lg p-4 flex flex-col items-center justify-center text-center gap-3 hover:shadow-md transition-all border border-slate-100 group">
    <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-primary/5 transition-colors">
      <Icon className="w-6 h-6 text-primary" />
    </div>
    <span className="text-[10px] font-bold font-display text-primary uppercase tracking-tight">{label}</span>
  </button>
);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export default function App() {
  const { isSignedIn, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { openSignIn, openSignUp } = useClerk();
  const [view, setView] = useState('landing');
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chatEndRef = React.useRef(null);

  // Load chat history from MongoDB when workspace is opened
  useEffect(() => {
    if (view === 'workspace') {
      loadHistory();
    }
  }, [view]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setChatHistory(data.messages || []);
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isStreaming]);

  // Auto-transition to workspace after Clerk modal auth completes
  useEffect(() => {
    if (awaitingAuth && isSignedIn) {
      setView('workspace');
      setAwaitingAuth(false);
    }
  }, [isSignedIn, awaitingAuth]);

  const sendMessage = async () => {
    const userText = message.trim();
    if (!userText || isStreaming) return;

    const userMsg = { role: 'user', content: userText };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setMessage('');
    setIsStreaming(true);

    try {
      const token = await getToken();
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: newHistory }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      // Add empty AI message placeholder
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
    } catch (err) {
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: `⚠️ Error: ${err.message}. Make sure the backend is running on port 8000.` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

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
            setAwaitingAuth(true);
            openSignUp();
          }
        }}
        onLogin={() => {
          if (isSignedIn) {
            setView('workspace');
          } else {
            setAwaitingAuth(true);
            openSignIn();
          }
        }}
      />
    );
  }


  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="w-full sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-100">
        <div className="flex justify-between items-center px-4 md:px-8 py-4 w-full">
          <div className="flex items-center gap-3 md:gap-10">
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <span
              onClick={() => setView('landing')}
              className="text-lg font-black text-slate-900 font-display uppercase tracking-widest cursor-pointer"
            >
              Mindpad AI
            </span>
            <nav className="hidden md:flex gap-8">
              <a className="text-slate-900 border-b-2 border-slate-900 pb-1 font-display text-sm font-semibold tracking-tight" href="#">Workspace</a>
              <a className="text-slate-500 hover:text-slate-900 transition-colors font-display text-sm font-semibold tracking-tight" href="#">AI Studio</a>
              <a className="text-slate-500 hover:text-slate-900 transition-colors font-display text-sm font-semibold tracking-tight" href="#">Analytics</a>
            </nav>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative hidden md:flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-slate-400" />
              <input
                className="bg-slate-100 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary/10 w-64 outline-none"
                placeholder="Search knowledge base..."
                type="text"
              />
            </div>
            <button className="p-2 text-slate-500 hover:bg-slate-100 transition-colors rounded-full">
              <Bell className="w-5 h-5" />
            </button>
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
            <Show when="signed-in">
              <UserButton afterSignOutUrl="/" />
            </Show>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Column: Notebooks Sidebar */}
        <aside className={`
          fixed md:relative inset-y-0 left-0 z-50
          w-72 md:w-64 flex flex-col bg-slate-50 border-r border-slate-100 flex-shrink-0
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}>
          <div className="flex flex-col h-full py-6 px-4">
            <div className="flex items-center justify-between mb-8 px-2">
              <div>
                <h2 className="text-lg font-bold font-display text-slate-900 mb-1">The Scholar</h2>
                <p className="text-xs font-medium text-slate-500">Digital Curator</p>
              </div>
              <button
                className="md:hidden p-2 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button className="mb-8 w-full py-3 px-4 bg-primary text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-[0.98]">
              <Plus className="w-5 h-5" />
              New Notebook
            </button>

            <nav className="flex-1 space-y-1 overflow-y-auto">
              <div className="px-2 py-3">
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-4 block">Recent Notebooks</span>
                <div className="space-y-1">
                  <SidebarItem icon={BookOpen} label="Quantum Physics" active />
                  <SidebarItem icon={BrainCircuit} label="Neural Networks" />
                  <SidebarItem icon={Palette} label="Renaissance Art" />
                  <SidebarItem icon={Database} label="Knowledge Base" />
                  <SidebarItem icon={Archive} label="Archive" />
                </div>
              </div>
            </nav>

            <div className="mt-auto pt-4 border-t border-slate-200 space-y-1">
              <SidebarItem icon={HelpCircle} label="Help" />
              <SidebarItem icon={Settings} label="Settings" />
            </div>
          </div>
        </aside>

        {/* Center Column: AI Chat Interface */}
        <section className="flex-1 flex flex-col bg-white relative min-w-0 overflow-hidden">
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
                    <div className="bg-slate-50 rounded-2xl p-6 text-slate-800 leading-relaxed shadow-sm border border-slate-100">
                      <p>Hello! I'm Midy AI, your research curator. Ask me anything — I can help you synthesize research, explain concepts, generate study aids, and more.</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Dynamic chat history — skip empty assistant placeholders to prevent ghost bubbles */}
              {chatHistory.filter(msg => !(msg.role === 'assistant' && msg.content === '')).map((msg, idx) => (
                msg.role === 'user' ? (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-6 flex-row-reverse group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                      <User className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="flex-1 space-y-2 text-right">
                      <header className="flex items-center justify-between flex-row-reverse">
                        <span className="text-[10px] font-bold font-display tracking-widest uppercase text-slate-400">You</span>
                      </header>
                      <div className="bg-white border border-slate-100 rounded-2xl p-5 text-slate-800 leading-relaxed inline-block text-left border-r-4 border-primary shadow-sm">
                        <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                      </div>
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
                      <div className="bg-slate-50 rounded-2xl p-6 text-slate-800 leading-relaxed shadow-sm border border-slate-100">
                        <div className="chat-html" dangerouslySetInnerHTML={{ __html: msg.content }} />
                      </div>
                    </div>
                  </motion.div>
                )
              ))}

              {/* Thinking animation — shown while loading history OR waiting for first AI token */}
              {(historyLoading || (isStreaming && chatHistory[chatHistory.length - 1]?.content === '')) && (
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
                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 shadow-sm space-y-3">
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
                        <motion.div
                          animate={{ opacity: [0.3, 0.7, 0.3] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                          className="h-2.5 bg-slate-200 rounded-full w-3/4"
                        />
                        <motion.div
                          animate={{ opacity: [0.3, 0.7, 0.3] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                          className="h-2.5 bg-slate-200 rounded-full w-1/2"
                        />
                        <motion.div
                          animate={{ opacity: [0.3, 0.7, 0.3] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                          className="h-2.5 bg-slate-200 rounded-full w-2/3"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="p-3 md:p-8 md:pb-12 border-t border-slate-100 md:border-none bg-white">
            <div className="w-full relative group">
              <div className="glass-input p-2 rounded-2xl flex items-end gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-slate-200">
                <button className="p-3 text-slate-400 hover:bg-slate-100 rounded-xl transition-all">
                  <Paperclip className="w-5 h-5" />
                </button>
                <textarea
                  className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-sm resize-none max-h-48 scrollbar-hide outline-none"
                  placeholder="Ask Midy AI..."
                  rows={1}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                />
                <div className="flex items-center gap-2 pb-1 pr-1">
                  <button className="p-3 text-slate-400 hover:bg-slate-100 rounded-xl transition-all">
                    <Mic className="w-5 h-5" />
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={isStreaming || !message.trim()}
                    className="w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: AI Studio Panel — hidden on mobile */}
        <aside className="hidden lg:flex w-80 h-full bg-slate-50 border-l border-slate-100 flex-shrink-0 flex-col">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-bold text-lg text-primary tracking-tight">AI Studio</h3>
              <span className="bg-primary text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">Pro</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">Transform your research into media assets.</p>
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
              <h4 className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Contextual Reference</h4>
              <motion.div
                whileHover={{ y: -2 }}
                className="bg-white p-4 rounded-xl border-l-4 border-primary shadow-sm border border-slate-100"
              >
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Decoherence in Qubits</p>
                <p className="text-xs text-slate-600 leading-relaxed">Environmental factors (temp, noise) leading to information loss in quantum systems...</p>
                <img
                  className="mt-3 rounded-lg w-full h-24 object-cover"
                  alt="Quantum particles"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAaJQNo9Aqcgrq_ao1grn4YLD8RgenX-FXCJJRbJXn2uIOVGY4Pwyg6JCG77YJA7njolIxEbbynzDhzHTuXERlSPlFvoVb3fUA4cp7vEbqzO3i2x3kTnLkA-B0jNb-REaWtyXQV488d9zJfaCPzNHv4IYxXH7qBkbBKK6tlax1lqBpeaxa1WIDh-l5N02MEGw3VG-Pk7mSteSUXop45QpLuNbH-teniH0mRvyUeowznAJXbx3eZKpPe-5IYbcBdjmyeQoGsUPvOFKTo"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
