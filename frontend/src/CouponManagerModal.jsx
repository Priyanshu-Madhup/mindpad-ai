import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Tag, Plus, Trash2, Loader2, AlertTriangle, Check,
  ChevronDown, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const APPLIES_TO_OPTIONS = [
  { value: 'all',  label: 'All Plans' },
  { value: 'plus', label: 'Plus Only' },
  { value: 'pro',  label: 'Pro Only' },
];

function AppliesLabel({ applies_to }) {
  if (!applies_to || applies_to.includes('all'))
    return <span className="text-slate-500 dark:text-slate-400">All Plans</span>;
  return (
    <span className="text-slate-500 dark:text-slate-400">
      {applies_to.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}
    </span>
  );
}

export default function CouponManagerModal({ open, onClose, getToken }) {
  const [coupons, setCoupons]                   = useState([]);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(null); // code string
  const [deletingCode, setDeletingCode]         = useState(null);

  // Create form state
  const [form, setForm] = useState({
    code: '', discount_pct: '', applies_to: 'all', max_uses: '',
  });
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // ── Fetch coupons ────────────────────────────────────────────────────────
  const fetchCoupons = useCallback(async () => {
    if (!getToken) return;
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/plans/coupons`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCoupons(data.coupons || []);
    } catch (e) {
      setError('Could not load coupons. Check your connection.');
      console.error('[CouponManager] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (open) {
      fetchCoupons();
      setCreateError('');
      setCreateSuccess('');
      setConfirmingDelete(null);
    } else {
      setForm({ code: '', discount_pct: '', applies_to: 'all', max_uses: '' });
    }
  }, [open, fetchCoupons]);

  // ── Create coupon ────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');

    const code = form.code.trim().toUpperCase();
    const pct  = parseInt(form.discount_pct, 10);

    if (!code) return setCreateError('Coupon code is required.');
    if (isNaN(pct) || pct < 1 || pct > 100)
      return setCreateError('Discount must be between 1 and 100%.');

    const applies_to = form.applies_to === 'all' ? ['all'] : [form.applies_to];
    const max_uses   = form.max_uses.trim() ? parseInt(form.max_uses, 10) : null;
    if (form.max_uses.trim() && (isNaN(max_uses) || max_uses < 1))
      return setCreateError('Max uses must be a positive number, or leave blank for unlimited.');

    setCreating(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/plans/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, discount_pct: pct, applies_to, max_uses }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create coupon.');
      setCreateSuccess(`Coupon "${code}" created successfully.`);
      setForm({ code: '', discount_pct: '', applies_to: 'all', max_uses: '' });
      await fetchCoupons();
    } catch (e) {
      setCreateError(e.message || 'Failed to create coupon.');
    } finally {
      setCreating(false);
    }
  };

  // ── Delete coupon ────────────────────────────────────────────────────────
  const handleDelete = async (code) => {
    setDeletingCode(code);
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/plans/coupons/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'Delete failed.');
      }
      setCoupons(prev => prev.filter(c => c.code !== code));
    } catch (e) {
      console.error('[CouponManager] delete error:', e);
    } finally {
      setDeletingCode(null);
      setConfirmingDelete(null);
    }
  };

  const INPUT =
    'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 ' +
    'bg-white dark:bg-slate-800/60 text-sm text-slate-800 dark:text-slate-100 ' +
    'placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none ' +
    'focus:ring-2 focus:ring-[#0D1B2A]/20 focus:border-[#0D1B2A]/40 ' +
    'dark:focus:border-slate-500 transition';

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
            className="fixed z-40 inset-0 m-auto w-full max-w-2xl h-fit max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col"
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <Tag className="w-4 h-4 text-[#0D1B2A] dark:text-slate-300" />
                <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Coupon Manager
                </span>
                <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5" /> Admin
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={fetchCoupons}
                  title="Refresh"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#0D1B2A] dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Create Coupon Form */}
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3.5 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Create New Coupon
                </p>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Code */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Coupon Code <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. SAVE25"
                        value={form.code}
                        onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                        className={INPUT}
                        maxLength={30}
                      />
                    </div>
                    {/* Discount % */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Discount % <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 20"
                        min={1}
                        max={100}
                        value={form.discount_pct}
                        onChange={e => setForm(p => ({ ...p, discount_pct: e.target.value }))}
                        className={INPUT}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Applies To */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Applies To
                      </label>
                      <div className="relative">
                        <select
                          value={form.applies_to}
                          onChange={e => setForm(p => ({ ...p, applies_to: e.target.value }))}
                          className={`${INPUT} appearance-none pr-8 cursor-pointer`}
                        >
                          {APPLIES_TO_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    {/* Max Uses */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Max Uses{' '}
                        <span className="text-slate-400 font-normal normal-case">(blank = unlimited)</span>
                      </label>
                      <input
                        type="number"
                        placeholder="Unlimited"
                        min={1}
                        value={form.max_uses}
                        onChange={e => setForm(p => ({ ...p, max_uses: e.target.value }))}
                        className={INPUT}
                      />
                    </div>
                  </div>

                  {/* Feedback messages */}
                  <AnimatePresence mode="wait">
                    {createError && (
                      <motion.p
                        key="err"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-red-500 flex items-center gap-1.5 overflow-hidden"
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0" /> {createError}
                      </motion.p>
                    )}
                    {createSuccess && (
                      <motion.p
                        key="ok"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 overflow-hidden"
                      >
                        <Check className="w-3 h-3 shrink-0" /> {createSuccess}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0D1B2A] dark:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold hover:opacity-85 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                      : <><Plus className="w-3.5 h-3.5" /> Create Coupon</>
                    }
                  </button>
                </form>
              </div>

              {/* Active Coupons List */}
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Active Coupons
                    {!loading && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        {coupons.length}
                      </span>
                    )}
                  </p>
                </div>

                {loading && (
                  <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading coupons…
                  </div>
                )}

                {!loading && error && (
                  <p className="text-xs text-red-500 py-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0" /> {error}
                  </p>
                )}

                {!loading && !error && coupons.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">
                    No coupons yet. Create one above.
                  </p>
                )}

                {!loading && !error && coupons.length > 0 && (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          {['Code', 'Discount', 'Applies To', 'Used', 'Max Uses', ''].map(h => (
                            <th
                              key={h}
                              className={`py-2 px-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider ${h === '' ? '' : 'text-left'}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {coupons.map((c) => {
                          const exhausted = c.max_uses != null && (c.use_count ?? 0) >= c.max_uses;
                          return (
                            <tr
                              key={c.code}
                              className="group hover:bg-slate-100/60 dark:hover:bg-slate-700/40 transition-colors"
                            >
                              {/* Code */}
                              <td className="py-2.5 px-2">
                                <span className="font-mono font-bold text-[#0D1B2A] dark:text-slate-100 tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                                  {c.code}
                                </span>
                              </td>

                              {/* Discount */}
                              <td className="py-2.5 px-2">
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {c.discount_pct}%
                                </span>
                                <span className="text-slate-400 ml-0.5">off</span>
                              </td>

                              {/* Applies To */}
                              <td className="py-2.5 px-2">
                                <AppliesLabel applies_to={c.applies_to} />
                              </td>

                              {/* Use count */}
                              <td className="py-2.5 px-2">
                                <span className={`font-bold tabular-nums ${exhausted ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>
                                  {c.use_count ?? 0}
                                </span>
                                {exhausted && (
                                  <span className="ml-1 text-[9px] text-red-400 font-semibold uppercase tracking-wide">(limit reached)</span>
                                )}
                              </td>

                              {/* Max Uses */}
                              <td className="py-2.5 px-2 text-slate-400 dark:text-slate-500 tabular-nums">
                                {c.max_uses ?? '∞'}
                              </td>

                              {/* Delete */}
                              <td className="py-2.5 px-2 text-right">
                                {confirmingDelete === c.code ? (
                                  <div className="flex items-center gap-1.5 justify-end">
                                    <button
                                      onClick={() => setConfirmingDelete(null)}
                                      className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1.5 py-0.5 rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleDelete(c.code)}
                                      disabled={!!deletingCode}
                                      className="flex items-center gap-1 text-[10px] bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded disabled:opacity-50 transition-colors"
                                    >
                                      {deletingCode === c.code
                                        ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        : <Trash2 className="w-2.5 h-2.5" />
                                      }
                                      Delete
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmingDelete(c.code)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                    title="Delete coupon"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center pb-1">
                Usage count increments when a coupon is applied at checkout.
                Deleting a coupon invalidates it immediately for all users.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
