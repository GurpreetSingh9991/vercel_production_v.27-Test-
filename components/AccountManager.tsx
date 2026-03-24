import React, { useState } from 'react';
import { Account } from '../types';
import { ICONS } from '../constants';
import { deleteSupabaseAccount } from '../services/supabase';

interface AccountManagerProps {
  accounts: Account[];
  onSave: (accounts: Account[]) => void;
  onClose: () => void;
  plan?: 'free' | 'pro';
}

// ── Prop Firm Template data (mirrors iOS PropFirmData.swift) ────────────────
type DrawdownApproach = 'Intraday Trailing' | 'End of Day (EOD)' | 'Static';

interface PropFirmTemplate {
  id: string;
  templateName: string;
  accountSize: number;
  profitTarget: number;
  maxDrawdownDollar: number;
  dailyLossLimit: number;
  drawdownApproach: DrawdownApproach;
  minTradingDays: number;
  profitSplitPct: number;
  hasConsistencyRule: boolean;
  keyFact: string;
}

const PROP_FIRM_TEMPLATES: PropFirmTemplate[] = [
  { id:'pf1',  templateName:'$25K · Standard DD',          accountSize:25000,  profitTarget:1500, maxDrawdownDollar:1500, dailyLossLimit:0,    drawdownApproach:'End of Day (EOD)',    minTradingDays:7,  profitSplitPct:90,  hasConsistencyRule:true,  keyFact:'1:1 profit-to-drawdown ratio. Floor updates at session close — intraday swings don\'t count against you.' },
  { id:'pf2',  templateName:'$25K · Intraday Trailing',    accountSize:25000,  profitTarget:1500, maxDrawdownDollar:1500, dailyLossLimit:0,    drawdownApproach:'Intraday Trailing',  minTradingDays:7,  profitSplitPct:90,  hasConsistencyRule:true,  keyFact:'Floor trails your peak equity in real time including open P&L. Requires disciplined intraday size management.' },
  { id:'pf3',  templateName:'$50K · Standard DD',          accountSize:50000,  profitTarget:3000, maxDrawdownDollar:2000, dailyLossLimit:0,    drawdownApproach:'End of Day (EOD)',    minTradingDays:0,  profitSplitPct:90,  hasConsistencyRule:false, keyFact:'1.5:1 profit-to-drawdown. Floor updates end of session. Most common structure in the futures prop space.' },
  { id:'pf4',  templateName:'$50K · Intraday Trailing',    accountSize:50000,  profitTarget:3000, maxDrawdownDollar:2500, dailyLossLimit:0,    drawdownApproach:'Intraday Trailing',  minTradingDays:7,  profitSplitPct:100, hasConsistencyRule:true,  keyFact:'Live trailing floor. Once you\'re $500 above floor, it locks and never goes below the safety level.' },
  { id:'pf5',  templateName:'$50K · With Daily Limit',     accountSize:50000,  profitTarget:3000, maxDrawdownDollar:2000, dailyLossLimit:1100, drawdownApproach:'End of Day (EOD)',    minTradingDays:10, profitSplitPct:80,  hasConsistencyRule:true,  keyFact:'Daily loss cap of $1,100 in addition to the overall drawdown. Session ends automatically if hit.' },
  { id:'pf6',  templateName:'$100K · Standard DD',         accountSize:100000, profitTarget:6000, maxDrawdownDollar:3000, dailyLossLimit:0,    drawdownApproach:'End of Day (EOD)',    minTradingDays:0,  profitSplitPct:90,  hasConsistencyRule:false, keyFact:'2:1 profit-to-drawdown. No daily limit and no minimum days makes this straightforward to plan around.' },
  { id:'pf7',  templateName:'$100K · Intraday Trailing',   accountSize:100000, profitTarget:6000, maxDrawdownDollar:3000, dailyLossLimit:0,    drawdownApproach:'Intraday Trailing',  minTradingDays:7,  profitSplitPct:100, hasConsistencyRule:true,  keyFact:'Live trailing stops in funded phase once account reaches $100,100 — floor never moves below that point.' },
  { id:'pf8',  templateName:'$100K · Conservative/Static', accountSize:100000, profitTarget:6000, maxDrawdownDollar:625,  dailyLossLimit:0,    drawdownApproach:'Static',             minTradingDays:7,  profitSplitPct:100, hasConsistencyRule:true,  keyFact:'Fixed floor at account − $625 from day one. Very tight room — size must be small and consistent.' },
  { id:'pf9',  templateName:'$100K · With Daily Limit',    accountSize:100000, profitTarget:6000, maxDrawdownDollar:3500, dailyLossLimit:2200, drawdownApproach:'End of Day (EOD)',    minTradingDays:10, profitSplitPct:80,  hasConsistencyRule:true,  keyFact:'Daily cap plus overall drawdown. Consistency rule: no single day can exceed 30% of total profit.' },
  { id:'pf10', templateName:'$150K · Standard DD',         accountSize:150000, profitTarget:9000, maxDrawdownDollar:4500, dailyLossLimit:0,    drawdownApproach:'End of Day (EOD)',    minTradingDays:0,  profitSplitPct:90,  hasConsistencyRule:false, keyFact:'2:1 profit-to-drawdown at scale. No daily limit or minimum days. Clean structure for systematic traders.' },
  { id:'pf11', templateName:'$150K · Intraday Trailing',   accountSize:150000, profitTarget:9000, maxDrawdownDollar:5000, dailyLossLimit:0,    drawdownApproach:'Intraday Trailing',  minTradingDays:7,  profitSplitPct:90,  hasConsistencyRule:true,  keyFact:'Live trailing floor. Larger capital means more contracts available — size management is critical.' },
];

const APPROACH_COLORS: Record<DrawdownApproach, { bg: string; text: string; dot: string }> = {
  'Intraday Trailing': { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  'End of Day (EOD)':  { bg: 'bg-blue-50 border-blue-200',   text: 'text-blue-700',  dot: 'bg-blue-500'  },
  'Static':            { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const SIZE_GROUPS = [25000, 50000, 100000, 150000];

// ── Sub-component: Prop Firm Picker ─────────────────────────────────────────
const PropFirmPicker: React.FC<{
  onSelect: (t: PropFirmTemplate) => void;
  onSkip: () => void;
}> = ({ onSelect, onSkip }) => {
  const [activeSize, setActiveSize] = useState<number>(25000);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = PROP_FIRM_TEMPLATES.filter(t => t.accountSize === activeSize);

  return (
    <div className="space-y-5">
      {/* Size tabs */}
      <div className="flex gap-2 flex-wrap">
        {SIZE_GROUPS.map(sz => (
          <button
            key={sz}
            type="button"
            onClick={() => { setActiveSize(sz); setExpanded(null); }}
            className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
              activeSize === sz
                ? 'bg-black text-white border-black'
                : 'bg-white border-black/10 text-black/40 hover:border-black/30 hover:text-black/70'
            }`}
          >
            ${(sz / 1000).toFixed(0)}K
          </button>
        ))}
      </div>

      {/* Template cards */}
      <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
        {filtered.map(t => {
          const col = APPROACH_COLORS[t.drawdownApproach];
          const isOpen = expanded === t.id;
          return (
            <div
              key={t.id}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${col.bg}`}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 p-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-black truncate ${col.text}`}>{t.templateName}</p>
                  <p className="text-[9px] font-bold text-black/30 uppercase tracking-widest mt-0.5">
                    {t.drawdownApproach} · {t.profitSplitPct}% payout
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  className="text-black/20 hover:text-black/60 transition-colors px-2 py-1 text-[10px] font-black uppercase tracking-widest"
                >
                  {isOpen ? '▲' : '▼'}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(t)}
                  className="px-4 py-2 bg-black text-white rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  Use
                </button>
              </div>

              {/* Expanded details */}
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Profit Target', value: `$${t.profitTarget.toLocaleString()}` },
                      { label: 'Max Drawdown', value: `$${t.maxDrawdownDollar.toLocaleString()}` },
                      { label: 'Daily Limit', value: t.dailyLossLimit > 0 ? `$${t.dailyLossLimit.toLocaleString()}` : 'None' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white/60 rounded-xl p-2.5 text-center">
                        <p className="text-[8px] font-black text-black/30 uppercase tracking-widest">{label}</p>
                        <p className="text-[11px] font-black text-black mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                  {(t.minTradingDays > 0 || t.hasConsistencyRule) && (
                    <div className="flex flex-wrap gap-1.5">
                      {t.minTradingDays > 0 && (
                        <span className="px-2 py-1 bg-white/60 rounded-lg text-[8px] font-black text-black/50 uppercase tracking-widest">
                          Min {t.minTradingDays} trading days
                        </span>
                      )}
                      {t.hasConsistencyRule && (
                        <span className="px-2 py-1 bg-white/60 rounded-lg text-[8px] font-black text-black/50 uppercase tracking-widest">
                          Consistency rule
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] font-semibold text-black/50 leading-relaxed">{t.keyFact}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="w-full py-3 text-[9px] font-black uppercase tracking-widest text-black/30 hover:text-black transition-colors"
      >
        Skip — enter details manually
      </button>
    </div>
  );
};

// ── Main AccountManager ──────────────────────────────────────────────────────
type AddStep = 'pick_type' | 'prop_picker' | 'manual_form';

const AccountManager: React.FC<AccountManagerProps> = ({ accounts, onSave, onClose, plan = 'free' }) => {
  const [editingAccounts, setEditingAccounts] = useState<Account[]>(accounts);
  const [addStep, setAddStep] = useState<AddStep | null>(null);
  const [newAccount, setNewAccount] = useState({ name: '', balance: 0, color: '#000000' });
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const canAddMore = plan === 'pro' || editingAccounts.length < 1;

  const startAdd = () => {
    if (!canAddMore) {
      alert('🔒 Free plan is limited to 1 account.\n\nUpgrade to Pro ($8.99/mo) to add unlimited broker accounts.');
      return;
    }
    setNewAccount({ name: '', balance: 0, color: '#000000' });
    setAddStep('pick_type');
  };

  const handlePropFirmSelect = (t: PropFirmTemplate) => {
    setNewAccount(prev => ({ ...prev, balance: t.accountSize }));
    setAddStep('manual_form');
  };

  const handleAdd = () => {
    if (!newAccount.name) return;
    const acc: Account = {
      id: crypto.randomUUID(),
      name: newAccount.name,
      initialBalance: Number(newAccount.balance),
      currency: 'USD',
      color: newAccount.color,
      createdAt: new Date().toISOString(),
    };
    const updated = [...editingAccounts, acc];
    setEditingAccounts(updated);
    onSave(updated);
    setAddStep(null);
    setNewAccount({ name: '', balance: 0, color: '#000000' });
  };

  const handleConfirmDelete = async (id: string) => {
    setIsDeletingId(id);
    setPendingDeleteId(null);
    try {
      const result = await deleteSupabaseAccount(id);
      if (result.success && result.count > 0) {
        const updated = editingAccounts.filter(a => a.id !== id);
        setEditingAccounts(updated);
        onSave(updated);
      } else if (result.success && result.count === 0) {
        const force = window.confirm('The server reported success but no rows were deleted.\n\nForce-remove from local view?');
        if (force) {
          const updated = editingAccounts.filter(a => a.id !== id);
          setEditingAccounts(updated);
          onSave(updated);
        }
      } else {
        if (result.error?.code === '23503') {
          alert('Cannot delete: This account has trades linked to it.\n\nMake sure your Supabase trades table has ON DELETE CASCADE set for account_id.');
        } else {
          alert(`Deletion failed: ${result.error?.message || 'Unknown error'}`);
        }
      }
    } catch (err: any) {
      alert(`Connection error: ${err.message || 'Check your internet connection and try again.'}`);
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-white/40 backdrop-blur-md z-[150] flex items-center justify-center p-4 pt-safe pb-safe">
      <div className="apple-glass w-full max-w-lg rounded-[3rem] shadow-2xl border border-white overflow-hidden animate-in zoom-in-95">

        {/* Header */}
        <div className="p-8 border-b border-black/5 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Account Hub</h2>
            <p className="text-[10px] font-black text-black/30 uppercase tracking-[0.2em] mt-1">Multi-Broker Management</p>
          </div>
          <button onClick={onClose} className="text-black/30 hover:text-black transition-colors p-2">
            <ICONS.Close className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 space-y-6 max-h-[65vh] overflow-y-auto custom-scrollbar">

          {/* ── Existing accounts list ── */}
          {editingAccounts.map(acc => (
            <div
              key={acc.id}
              className={`ceramic-white p-5 rounded-[2rem] flex items-center justify-between group transition-all ${
                isDeletingId === acc.id ? 'opacity-50 scale-[0.98]' : 'hover:scale-[1.01]'
              }`}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={{ backgroundColor: acc.color }}>
                  <ICONS.Zap className="w-5 h-5 text-white" />
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-sm font-bold truncate text-black">{acc.name}</h4>
                  <p className="text-[10px] font-bold text-black/20 uppercase tracking-widest">${acc.initialBalance.toLocaleString()} Equity</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {pendingDeleteId === acc.id ? (
                  <div className="flex items-center gap-1 animate-in slide-in-from-right-2">
                    <button onClick={() => setPendingDeleteId(null)} className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-black/40 hover:text-black transition-colors">Cancel</button>
                    <button onClick={() => handleConfirmDelete(acc.id)} className="px-4 py-2 bg-rose-500 text-white rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-95 transition-all">Confirm</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { if (!isDeletingId) setPendingDeleteId(acc.id); }}
                    disabled={isDeletingId !== null}
                    className={`p-3 rounded-xl transition-all disabled:opacity-50 active:scale-90 ${
                      isDeletingId === acc.id ? 'text-black/20' : 'text-rose-500 hover:bg-rose-50'
                    }`}
                  >
                    {isDeletingId === acc.id
                      ? <ICONS.Sync className="w-5 h-5 animate-spin" />
                      : <ICONS.Delete className="w-5 h-5" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {editingAccounts.length === 0 && addStep === null && (
            <div className="text-center py-10 opacity-20">
              <ICONS.Dollar className="w-10 h-10 mx-auto mb-2 text-black" />
              <p className="text-[10px] font-black uppercase tracking-widest text-black">No accounts registered</p>
            </div>
          )}

          {/* ── Step 1: Choose account type ── */}
          {addStep === 'pick_type' && (
            <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-200">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-black/40 text-center pb-1">What type of account?</p>

              <button
                type="button"
                onClick={() => setAddStep('prop_picker')}
                className="w-full flex items-center gap-4 p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl text-left active:scale-[0.98] transition-all hover:border-amber-300"
              >
                <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ICONS.Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-amber-800">Prop Firm Account</p>
                  <p className="text-[9px] font-bold text-amber-600/70 mt-0.5">Load from a firm template — auto-fills balance & rules</p>
                </div>
                <svg className="w-4 h-4 text-amber-400 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>

              <button
                type="button"
                onClick={() => setAddStep('manual_form')}
                className="w-full flex items-center gap-4 p-5 bg-black/[0.02] border border-black/10 rounded-2xl text-left active:scale-[0.98] transition-all hover:border-black/20"
              >
                <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center flex-shrink-0">
                  <ICONS.Dollar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[12px] font-black text-black">Personal / Broker Account</p>
                  <p className="text-[9px] font-bold text-black/40 mt-0.5">Enter your own name and starting capital</p>
                </div>
                <svg className="w-4 h-4 text-black/20 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>

              <button type="button" onClick={() => setAddStep(null)} className="w-full py-3 text-[9px] font-black uppercase tracking-widest text-black/20 hover:text-black/50 transition-colors">
                Cancel
              </button>
            </div>
          )}

          {/* ── Step 2a: Prop Firm Picker ── */}
          {addStep === 'prop_picker' && (
            <div className="animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-3 mb-5">
                <button type="button" onClick={() => setAddStep('pick_type')} className="text-black/30 hover:text-black transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Select a Prop Firm Template</p>
              </div>
              <PropFirmPicker
                onSelect={handlePropFirmSelect}
                onSkip={() => setAddStep('manual_form')}
              />
            </div>
          )}

          {/* ── Step 2b: Manual form ── */}
          {addStep === 'manual_form' && (
            <div className="bg-black/5 p-6 rounded-[2rem] space-y-4 animate-in slide-in-from-bottom-2 duration-200 border border-black/5">
              {/* Back button */}
              <button type="button" onClick={() => setAddStep('pick_type')} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-black/30 hover:text-black transition-colors mb-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                Back
              </button>

              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-black/30 ml-2">Display Name</label>
                <input
                  type="text"
                  placeholder="Prop Firm X, Personal, etc."
                  value={newAccount.name}
                  onChange={e => setNewAccount(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:border-black transition-colors text-black"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-black/30 ml-2">Starting Capital</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={newAccount.balance || ''}
                  onChange={e => setNewAccount(prev => ({ ...prev, balance: Number(e.target.value) }))}
                  className="w-full bg-white border border-black/5 rounded-xl p-3 text-xs font-bold outline-none focus:border-black transition-colors text-black"
                />
              </div>
              <div className="flex items-center justify-between px-2">
                <label className="text-[8px] font-black uppercase tracking-widest text-black/30">Interface Color</label>
                <input
                  type="color"
                  value={newAccount.color}
                  onChange={e => setNewAccount(prev => ({ ...prev, color: e.target.value }))}
                  className="w-10 h-10 rounded-xl overflow-hidden border-none bg-transparent cursor-pointer"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setAddStep(null)} className="flex-1 py-4 text-[9px] font-black uppercase tracking-widest text-black/40 hover:text-black">Abort</button>
                <button type="button" onClick={handleAdd} className="flex-1 py-4 bg-black text-white rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Register</button>
              </div>
            </div>
          )}

          {/* ── Add button (idle state) ── */}
          {addStep === null && (
            <button
              onClick={startAdd}
              className={`w-full py-5 border-2 border-dashed rounded-[2.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${
                canAddMore
                  ? 'border-black/10 text-black/20 hover:text-black hover:border-black/30 active:scale-[0.98]'
                  : 'border-black/5 text-black/10 cursor-not-allowed opacity-50'
              }`}
            >
              {canAddMore ? '+ Register New Broker Scope' : 'Broker Limit Reached (Free)'}
            </button>
          )}

          {!canAddMore && plan === 'free' && addStep === null && (
            <p className="text-[8px] font-bold text-center text-black/30 uppercase tracking-widest">Upgrade to Pro for unlimited accounts</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 bg-black/5 border-t border-black/5">
          <button onClick={onClose} className="w-full py-4 bg-black text-white rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-xl active:scale-95 transition-all">
            Confirm Portfolio
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountManager;
