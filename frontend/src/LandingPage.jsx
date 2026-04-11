/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Share2, 
  MoreVertical, 
  FileText, 
  Network, 
  MessageSquare, 
  Settings, 
  Mic, 
  Podcast, 
  Eye, 
  Film, 
  Palette, 
  CheckSquare,
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  X,
  Send,
  ArrowUp
} from 'lucide-react';
import { motion } from 'motion/react';
import mindpadLogo from './mindpad_ai_logo.png';

const FeatureCard = ({ icon: Icon, title, description, colorClass }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="bg-slate-50 p-5 sm:p-8 rounded-2xl hover:bg-white hover:shadow-xl transition-all duration-300 group border border-slate-100"
  >
    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-4 sm:mb-6 group-hover:scale-110 transition-transform ${colorClass}`}>
      <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
    </div>
    <h3 className="text-base sm:text-xl font-bold font-display mb-2 sm:mb-3 text-slate-900">{title}</h3>
    <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
  </motion.div>
);

const SUGGESTIONS = ['What can Mindpad do?', 'How does Mind Map work?', 'Is it free?'];

function mdToHtml(raw) {
  if (!raw) return '';
  // 1. Escape HTML entities in the raw text
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 2. Apply inline formatting (bold, italic) to an already-escaped string
  const inline = (s) =>
    s
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  const lines = raw.split('\n');
  const parts = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length) {
      parts.push(`<ul style="list-style:disc;padding-left:1.2em;margin:6px 0">${listItems.join('')}</ul>`);
      listItems = [];
    }
  };

  for (const line of lines) {
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      listItems.push(`<li>${inline(esc(listMatch[1]))}</li>`);
    } else {
      flushList();
      const trimmed = line.trim();
      if (trimmed === '') {
        parts.push('<br>');
      } else {
        parts.push(`<p style="margin:2px 0">${inline(esc(trimmed))}</p>`);
      }
    }
  }
  flushList();
  return parts.join('');
}

export default function LandingPage({ onGetStarted, onLogin }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'ai', text: 'Hi there! 👋 How can I help you learn more about Mindpad AI?' }
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);

  const BACKEND = import.meta.env.VITE_API_URL || 'https://mindpad-ai.onrender.com';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = async (overrideText) => {
    const text = (overrideText ?? chatMessage).trim();
    if (!text || isStreaming) return;
    setChatMessage('');
    setIsStreaming(true);

    const history = [...chatMessages, { role: 'user', text }];
    setChatMessages([...history, { role: 'ai', text: '...' }]);

    try {
      const res = await fetch(`${BACKEND}/support-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.text,
          })),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply = data.reply || '';
      if (!reply) throw new Error('empty response');
      setChatMessages([...history, { role: 'ai', text: reply }]);
    } catch {
      setChatMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'ai', text: 'Sorry, something went wrong. Please try again!' },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="bg-white text-slate-900 font-body selection:bg-primary/10">
      {/* Top Navigation Bar */}
      <nav className="bg-white/70 backdrop-blur-xl sticky top-0 z-50 border-b border-slate-100">
        <div className="flex justify-between items-center px-4 sm:px-8 py-3 sm:py-4 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-2">
            <img src={mindpadLogo} alt="Mindpad AI" className="h-6 sm:h-7 w-auto object-contain" />
            <span className="text-base sm:text-xl font-black tracking-tighter text-slate-900 font-display uppercase">
              Mindpad AI
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={onLogin}
              className="text-slate-500 font-bold text-sm hover:text-slate-900 transition-colors"
            >
              Log In
            </button>
            <button 
              onClick={onGetStarted}
              className="bg-primary text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all active:scale-95"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative pt-10 pb-16 sm:pt-20 sm:pb-32 overflow-hidden bg-gradient-to-b from-slate-50 to-white">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 items-center">
            <div className="lg:col-span-5 space-y-8">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 bg-primary/5 text-primary rounded-full text-[10px] font-bold tracking-widest uppercase font-display"
              >
                <Sparkles className="w-3 h-3 fill-primary" />
                The Digital Curator
              </motion.div>
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black font-display tracking-tighter leading-[1.05] text-slate-900"
              >
                Your Intellectual Workspace
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base sm:text-xl text-slate-500 font-medium leading-relaxed max-w-xl"
              >
                A modern research journal for the digital age. Curate, synthesize, and expand your knowledge with an AI companion designed for scholarly focus.
              </motion.p>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4 pt-4"
              >
                <button 
                  onClick={onGetStarted}
                  className="bg-primary text-white px-8 py-4 rounded-xl text-lg font-bold shadow-xl shadow-primary/20 hover:translate-y-[-2px] transition-all"
                >
                  Get Started
                </button>
                <button className="border border-slate-200 text-slate-900 px-8 py-4 rounded-xl text-lg font-bold hover:bg-slate-50 transition-all">
                  View Studio Demo
                </button>
              </motion.div>
            </div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="lg:col-span-7 relative"
            >
              <div className="bg-slate-100 p-2 rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
                <div className="bg-white rounded-xl h-[260px] sm:h-[380px] lg:h-[500px] flex flex-col shadow-inner">
                  {/* Workspace UI Header */}
                  <div className="px-6 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-400/20"></div>
                      <div className="w-3 h-3 rounded-full bg-blue-400/20"></div>
                      <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                    </div>
                    <div className="bg-white border border-slate-100 px-4 py-1.5 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Research Project: Quantum Ethics.pdf
                    </div>
                    <div className="flex gap-2 text-slate-300">
                      <Share2 className="w-4 h-4" />
                      <MoreVertical className="w-4 h-4" />
                    </div>
                  </div>
                  {/* Workspace Canvas */}
                  <div className="flex-1 flex overflow-hidden">
                    <div className="w-16 bg-slate-50/30 border-r border-slate-100 flex flex-col items-center py-6 gap-6 text-slate-300">
                      <FileText className="w-5 h-5" />
                      <Network className="w-5 h-5" />
                      <MessageSquare className="w-5 h-5 text-primary" />
                      <Settings className="w-5 h-5" />
                    </div>
                    <div className="flex-1 p-4 sm:p-8 lg:p-12 flex flex-col items-center justify-center relative">
                      <div className="max-w-md w-full space-y-6">
                        <div className="p-6 bg-slate-50 rounded-xl border-l-4 border-primary shadow-sm">
                          <p className="text-sm italic text-slate-500">"Synthesize the core arguments regarding temporal displacement in the last three chapters..."</p>
                        </div>
                        <div className="bg-white/80 backdrop-blur-md p-6 rounded-xl shadow-lg border border-slate-100">
                          <p className="text-sm font-bold text-slate-900">Mindpad AI is analyzing 42 sources...</p>
                          <div className="mt-4 flex gap-2">
                            <div className="h-1 bg-primary w-1/3 rounded-full"></div>
                            <div className="h-1 bg-slate-100 flex-1 rounded-full"></div>
                          </div>
                        </div>
                      </div>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 space-y-3 hidden sm:block">
                        <div className="p-3 bg-primary text-white rounded-xl shadow-lg flex items-center gap-3 scale-90 opacity-80">
                          <Network className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Generate Map</span>
                        </div>
                        <div className="p-3 bg-white text-slate-900 rounded-xl shadow-lg flex items-center gap-3 border border-slate-100">
                          <Mic className="w-4 h-4 text-slate-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Audio Podcast</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 sm:py-32 bg-white">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-8">
            <div className="mb-10 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-slate-900">The AI Studio Suite</h2>
              <p className="text-slate-500 mt-3 sm:mt-4 text-base sm:text-lg">Powerful transformation tools to reshape your research data.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <FeatureCard 
                icon={Network} 
                title="Mind Map" 
                description="Visualize complex connections between theories and sources in a dynamic graph layout."
                colorClass="bg-slate-100 text-slate-800"
              />
              <FeatureCard 
                icon={Podcast} 
                title="Audio Podcast" 
                description="Turn your research papers into engaging audio summaries for learning on the go."
                colorClass="bg-slate-100 text-slate-800"
              />
              <FeatureCard 
                icon={Eye} 
                title="Visual Podcast" 
                description="Generate cinematic slides and visual aids that synchronize with your research narrative."
                colorClass="bg-slate-100 text-slate-800"
              />
              <FeatureCard 
                icon={Film} 
                title="Video Suggestions" 
                description="AI-curated video content from scholarly archives that deepens your understanding."
                colorClass="bg-slate-100 text-slate-800"
              />
              <FeatureCard 
                icon={Palette} 
                title="Flashcards" 
                description="Automatically extract key terminology and concepts into active-recall study sets."
                colorClass="bg-slate-100 text-slate-800"
              />
              <FeatureCard 
                icon={CheckSquare} 
                title="Quiz Mode" 
                description="Test your synthesis with AI-generated questions tailored to your specific source library."
                colorClass="bg-slate-100 text-slate-800"
              />
            </div>
          </div>
        </section>

        {/* Value Prop Section */}
        <section className="py-16 sm:py-32 bg-slate-50">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-20">
              <div className="flex-1">
                <div className="relative">
                  <img 
                    alt="Research workspace" 
                    className="rounded-2xl shadow-2xl grayscale hover:grayscale-0 transition-all duration-700 border border-slate-200" 
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAHGBs6ImQsOPT-wfaZIXnRTacG4gWcObOB5nHg2CX8uW1NYZUDIL005xIu7CwBjSSxfcy_f7GCq_r3xCE7IVRP9AOjaOIaeQu0AcodGf_dRvw9iWQEIdWlNTOMAu8mH_JsUZryaq_-l4VsFLxmDdm3uqSMxbz3qIrG3NURB0jclIruOu7P7NK2nHWi77kU6p07GhDAsP2xgAK0kPHnwgsUVljtftu6FZwKanC8Vc19NFTjwbySxLyR4ndq05kby_Yv1VtamJPNiyUR"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-primary/5 rounded-2xl pointer-events-none"></div>
                </div>
              </div>
              <div className="flex-1 space-y-8">
                <h2 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-slate-900 leading-tight">A New Way to Research</h2>
                <div className="space-y-8">
                  <div className="flex gap-6">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 text-sm font-bold shadow-lg shadow-primary/20">1</div>
                    <div>
                      <h4 className="font-bold text-xl mb-2 text-slate-900">Contextual Navigation</h4>
                      <p className="text-slate-500 leading-relaxed">Mindpad doesn't just store files; it understands the hierarchy of your intent. The UI shifts based on whether you are ingesting data or producing insight.</p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 text-sm font-bold shadow-lg shadow-primary/20">2</div>
                    <div>
                      <h4 className="font-bold text-xl mb-2 text-slate-900">Centered Chat Experience</h4>
                      <p className="text-slate-500 leading-relaxed">Your focus remains at the center. The AI companion lives alongside your documents, providing instant cross-referencing without tab-switching.</p>
                    </div>
                  </div>
                </div>
                <button className="bg-primary text-white px-8 py-4 rounded-xl text-sm font-bold mt-4 shadow-lg shadow-primary/10 hover:opacity-90 transition-all">
                  Learn About Semantic Search
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="py-12 sm:py-24 border-y border-slate-100">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 text-center">
            <h3 className="text-[10px] font-bold tracking-widest uppercase font-display text-slate-400 mb-8 sm:mb-12">Built for Scholars, Researchers, and Lifelong Learners.</h3>
            <div className="flex flex-wrap justify-center gap-6 sm:gap-12 md:gap-20 opacity-30 grayscale contrast-125">
              <div className="text-lg sm:text-2xl font-black tracking-tighter text-slate-900">STANFORD</div>
              <div className="text-lg sm:text-2xl font-black tracking-tighter text-slate-900">OXFORD UNIV.</div>
              <div className="text-lg sm:text-2xl font-black tracking-tighter text-slate-900">MIT MEDIA LAB</div>
              <div className="text-lg sm:text-2xl font-black tracking-tighter text-slate-900">ETH ZURICH</div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 sm:py-32 bg-primary text-white overflow-hidden relative">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent"></div>
          </div>
          <div className="max-w-3xl mx-auto px-5 sm:px-8 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black font-display tracking-tighter mb-5 sm:mb-8 leading-tight">Start Your Research Journey</h2>
            <p className="text-base sm:text-xl text-white/70 font-medium mb-8 sm:mb-12">Join over 50,000 scholars curating the future of human knowledge.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <input 
                className="bg-white/10 border border-white/20 text-white px-6 py-4 rounded-xl w-full sm:w-80 focus:ring-2 focus:ring-white/50 outline-none placeholder:text-white/40 font-medium" 
                placeholder="Enter your academic email" 
                type="email"
              />
              <button 
                onClick={onGetStarted}
                className="bg-white text-primary px-10 py-4 rounded-xl text-lg font-black hover:bg-slate-100 transition-all active:scale-95"
              >
                Join Beta
              </button>
            </div>
            <p className="mt-6 text-[10px] text-white/40 uppercase tracking-widest font-bold">Free for registered scholarship students.</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white py-10 px-4 sm:py-16 sm:px-8 border-t border-slate-100">
        <div className="max-w-screen-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <img src={mindpadLogo} alt="Mindpad AI" className="h-6 w-auto object-contain" />
              <div className="text-xl font-black text-slate-900 font-display uppercase tracking-tighter">Mindpad AI</div>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">© 2024 Mindpad AI. The Intellectual Workspace.</p>
          </div>
          <div className="flex flex-wrap md:justify-end gap-x-8 gap-y-4">
            {['Privacy Policy', 'Terms of Service', 'Research Ethics', 'Contact Us'].map(link => (
              <a key={link} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors" href="#">{link}</a>
            ))}
          </div>
        </div>
      </footer>

      {/* Floating AI Support Chat */}
      <div className="fixed bottom-6 right-4 sm:right-6 z-[100] flex flex-col items-end gap-4">
        {/* Chat Window */}
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-[calc(100vw-2rem)] max-w-[360px] h-[75vh] max-h-[500px] min-h-[320px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Chat Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-primary">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white fill-white" />
                </div>
                <p className="text-sm font-bold text-white font-display">Mindpad Support</p>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mb-0.5">
                      <Sparkles className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-br-sm'
                      : 'bg-white text-slate-700 rounded-bl-sm shadow-sm border border-slate-100'
                  }`}>
                    {msg.text === '...' ? (
                      <span className="flex gap-1 items-center h-4">
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </span>
                    ) : msg.role === 'ai' ? (
                      <div dangerouslySetInnerHTML={{ __html: mdToHtml(msg.text) }} />
                    ) : msg.text}
                  </div>
                </div>
              ))}
              {chatMessages.length === 1 && !isStreaming && (
                <div className="pt-1 flex flex-wrap gap-2">
                  {SUGGESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => handleSendMessage(q)}
                      className="text-xs bg-white border border-slate-200 hover:bg-primary hover:text-white hover:border-primary text-slate-600 px-3 py-1.5 rounded-full transition-all shadow-sm"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-3 border-t border-slate-100 bg-white">
              <div className={`flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-1 border transition-colors ${isStreaming ? 'border-slate-100' : 'border-transparent focus-within:border-primary/30'}`}>
                <input
                  className="flex-1 bg-transparent border-none text-sm outline-none py-2.5 placeholder:text-slate-400 disabled:opacity-50"
                  placeholder={isStreaming ? 'Mindpad is typing…' : 'Ask anything about Mindpad…'}
                  value={chatMessage}
                  disabled={isStreaming}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!chatMessage.trim() || isStreaming}
                  className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Floating Button */}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
        >
          {chatOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <MessageCircle className="w-6 h-6" />
          )}
        </button>
      </div>
    </div>
  );
}
