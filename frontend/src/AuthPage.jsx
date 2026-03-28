/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Rocket, 
  FileEdit, 
  Lightbulb, 
  BookOpen, 
  Layout, 
  PenTool,
  ArrowRight
} from 'lucide-react';
import { motion } from 'motion/react';

const SketchIcon = ({ icon: Icon, className }) => (
  <div className={`fixed text-slate-900/5 pointer-events-none -z-10 ${className}`}>
    <Icon className="w-[480px] h-[480px] stroke-[0.5]" />
  </div>
);

export default function AuthPage({ initialMode = 'signup', onAuthSuccess, onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simulate auth success
    onAuthSuccess();
  };

  return (
    <div className="bg-[#f8f9fa] font-body text-slate-900 antialiased min-h-screen flex flex-col relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed top-[-10%] right-[-5%] w-[40%] h-[60%] rounded-full bg-blue-100/20 blur-[120px] -z-10 pointer-events-none"></div>
      <div className="fixed bottom-[-10%] left-[-5%] w-[30%] h-[50%] rounded-full bg-purple-100/20 blur-[120px] -z-10 pointer-events-none"></div>

      {/* Floating Giant Sketch Icons */}
      <SketchIcon icon={Rocket} className="top-[-10%] left-[-10%] animate-float" />
      <SketchIcon icon={FileEdit} className="bottom-[-15%] left-[-5%] animate-float-reverse" />
      <SketchIcon icon={Lightbulb} className="top-[-15%] right-[-5%] animate-float-delayed" />
      <SketchIcon icon={BookOpen} className="bottom-[-10%] right-[-10%] animate-float-reverse-delayed" />
      <SketchIcon icon={Layout} className="top-[30%] left-[60%] animate-float-slow opacity-[0.015]" />

      {/* TopNavBar */}
      <nav className="w-full top-0 left-0 bg-transparent flex justify-between items-center px-8 py-6 max-w-7xl mx-auto font-display relative z-10">
        <div 
          onClick={onBack}
          className="text-2xl font-black tracking-tighter text-slate-900 cursor-pointer"
        >
          Mindpad AI
        </div>
        <div className="hidden md:flex gap-8 items-center">
          <a className="text-slate-500 font-bold text-sm hover:text-slate-900 transition-colors" href="#">Research</a>
          <a className="text-slate-500 font-bold text-sm hover:text-slate-900 transition-colors" href="#">About</a>
          <button 
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
            className="bg-slate-900 text-white px-5 py-2 rounded-xl font-bold text-sm active:scale-95 transition-transform hover:opacity-80"
          >
            {mode === 'signup' ? 'Log In' : 'Sign Up'}
          </button>
        </div>
      </nav>

      {/* Main Auth Canvas */}
      <main className="flex-grow flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-md">
          {/* Brand Context */}
          <div className="text-center mb-10">
            <span className="font-display text-xs font-bold tracking-[0.2em] uppercase text-slate-400">Mindpad AI</span>
          </div>

          {/* Auth Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-md rounded-2xl p-10 editorial-shadow border border-white/50"
          >
            <div className="mb-8">
              <h1 className="font-display text-3xl font-black tracking-tight text-slate-900 mb-2">
                {mode === 'signup' ? 'Join the Library' : 'Welcome Back'}
              </h1>
              <p className="text-slate-500 font-body text-sm">
                {mode === 'signup' ? 'Create your scholarly workspace.' : 'Access your intellectual repository.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1" htmlFor="full-name">Full Name</label>
                  <input 
                    className="w-full bg-slate-100 border-none rounded-xl px-4 py-3.5 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 transition-all font-body text-sm outline-none" 
                    id="full-name" 
                    placeholder="Alexander von Humboldt" 
                    type="text"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1" htmlFor="email">Academic Email</label>
                <input 
                  className="w-full bg-slate-100 border-none rounded-xl px-4 py-3.5 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 transition-all font-body text-sm outline-none" 
                  id="email" 
                  placeholder="humboldt@oxford.ac.uk" 
                  type="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1" htmlFor="password">Password</label>
                <input 
                  className="w-full bg-slate-100 border-none rounded-xl px-4 py-3.5 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900/10 transition-all font-body text-sm outline-none" 
                  id="password" 
                  placeholder="••••••••••••" 
                  type="password"
                  required
                />
              </div>

              {mode === 'signup' && (
                <div className="pt-2">
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    By creating an account, you agree to our Research Ethics Policy and Institutional Data Terms.
                  </p>
                </div>
              )}

              <div className="pt-4">
                <button 
                  className="w-full bg-slate-900 text-white py-4 rounded-xl font-display font-black text-sm tracking-wide hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/10" 
                  type="submit"
                >
                  {mode === 'signup' ? 'Create Account' : 'Sign In'}
                </button>
              </div>
            </form>

            {/* Footer Link */}
            <div className="mt-8 pt-8 border-t border-slate-100 flex justify-center">
              <p className="text-xs text-slate-500 font-medium">
                {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
                <button 
                  onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
                  className="text-slate-900 font-black ml-1 hover:underline decoration-2 underline-offset-4"
                >
                  {mode === 'signup' ? 'Log in' : 'Sign up'}
                </button>
              </p>
            </div>
          </motion.div>

          {/* Asymmetric Aesthetic Detail */}
          <div className="mt-12 flex justify-between items-center opacity-40">
            <div className="flex gap-4 text-slate-900">
              <BookOpen className="w-4 h-4" />
              <Layout className="w-4 h-4" />
              <PenTool className="w-4 h-4" />
            </div>
            <div className="h-[1px] bg-slate-200 flex-grow mx-6"></div>
            <span className="text-[10px] font-display font-black tracking-widest uppercase text-slate-900">Est. 2024</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-transparent flex flex-col md:flex-row justify-between items-center px-10 py-8 font-display text-[10px] tracking-widest uppercase text-slate-400 relative z-10">
        <div className="mb-4 md:mb-0">
          © 2024 Mindpad AI. Precision in Research.
        </div>
        <div className="flex gap-6 items-center">
          <a className="hover:text-slate-900 transition-colors" href="#">Privacy Policy</a>
          <a className="hover:text-slate-900 transition-colors" href="#">Terms of Service</a>
          <a className="hover:text-slate-900 transition-colors" href="#">Institutional Access</a>
        </div>
      </footer>
    </div>
  );
}
