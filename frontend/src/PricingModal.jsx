import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Crown } from 'lucide-react';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    period: 'forever',
    borderClass: 'border-slate-200 dark:border-slate-700',
    headerClass: 'bg-slate-50 dark:bg-slate-800/50',
    btnClass: 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-default',
    features: [
      '50 MB storage',
      'Unlimited notebooks',
      'AI Chat (Midy AI)',
      'PDF upload & smart search',
      'Voice input & text-to-speech',
      'Web search',
      'Deep Research (5 per day)',
      'AI image generation (5 per day)',
      '10 languages',
      'Basic AI Studio access',
      'Mind Map generator',
    ],
    cta: 'Current Plan',
    disabled: true,
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '₹49',
    period: 'per month',
    badge: 'Popular',
    borderClass: 'border-slate-400 dark:border-slate-500',
    headerClass: 'bg-slate-100 dark:bg-slate-800',
    btnClass: 'bg-[#0D1B2A] dark:bg-slate-200 text-white dark:text-slate-900 hover:opacity-90',
    features: [
      '200 MB storage',
      'Unlimited notebooks',
      'AI Chat (Midy AI)',
      'PDF upload & smart search',
      'Voice input & text-to-speech',
      'Web search',
      'Deep Research (unlimited)',
      'AI image generation (50 per day)',
      '12 languages',
      'Expanded AI Studio access',
      'Mind Map + Insight Canvas',
      '2× more accurate AI responses',
      'Better AI model',
      'Priority support',
    ],
    cta: 'Upgrade to Plus',
    disabled: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹99',
    period: 'per month',
    badge: 'Best Value',
    borderClass: 'border-[#0D1B2A] dark:border-slate-300',
    headerClass: 'bg-[#0D1B2A] dark:bg-slate-800',
    headerTextClass: 'text-white',
    btnClass: 'bg-[#0D1B2A] dark:bg-white text-white dark:text-slate-900 hover:opacity-90',
    features: [
      '500 MB storage',
      'Unlimited notebooks',
      'AI Chat (Midy AI)',
      'PDF upload & smart search',
      'Voice input & text-to-speech',
      'Web search',
      'Deep Research (unlimited)',
      'AI image generation (unlimited)',
      '12 languages',
      'Full AI Studio access — all tools',
      'Mind Map + Insight Canvas',
      '3× accuracy — best AI model',
      'Notion integration',
      'Dedicated priority support',
      'Early access to new features',
    ],
    cta: 'Upgrade to Pro',
    disabled: false,
  },
];

export default function PricingModal({ open, onClose, onSelectPlan }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — starts below navbar, above sidebars */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 bottom-0 z-[55] bg-black/40 backdrop-blur-sm"
            style={{ top: 57 }}
            onClick={onClose}
          />

          {/* Centering container — full width, above sidebars */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 bottom-0 z-[55] flex items-center justify-center p-4 pointer-events-none"
            style={{ top: 57 }}
          >
            {/* Panel */}
            <div className="pointer-events-auto w-full max-w-4xl max-h-[82vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <Crown className="w-4 h-4 text-primary" />
                <span className="text-base font-bold font-display text-slate-900 dark:text-slate-100">Choose Your Plan</span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Plans grid */}
            <div className="overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-xl border-2 ${plan.borderClass} overflow-hidden`}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <div className="absolute top-2.5 right-2.5">
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900">
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  {/* Plan header */}
                  <div className={`px-4 pt-4 pb-3 ${plan.headerClass}`}>
                    <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${plan.headerTextClass || 'text-slate-500 dark:text-slate-400'}`}>
                      {plan.name}
                    </p>
                    <div className="flex items-end gap-1">
                      <span className={`text-2xl font-extrabold font-display ${plan.headerTextClass || 'text-slate-900 dark:text-white'}`}>
                        {plan.price}
                      </span>
                      <span className={`text-xs mb-0.5 ${plan.headerTextClass ? 'text-white/60' : 'text-slate-400'}`}>
                        /{plan.period}
                      </span>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="px-4 py-3 flex-1 space-y-1.5">
                    {plan.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <Check className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="px-4 pb-4 pt-2">
                    <button
                      disabled={plan.disabled}
                      onClick={() => !plan.disabled && onSelectPlan(plan)}
                      className={`w-full py-2 rounded-lg text-xs font-bold transition-all duration-150 ${plan.btnClass}`}
                    >
                      {plan.cta}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-center">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                All prices in INR · Cancel anytime · Payments are secure and encrypted
              </p>
            </div>
          </div>{/* end panel */}
          </motion.div>{/* end centering container */}
        </>
      )}
    </AnimatePresence>
  );
}
