import React, { useState } from 'react';
import { Account } from '../types';
import { ICONS } from '../constants';
import { deleteSupabaseAccount, updateAccountInDB } from '../services/supabase';

interface AccountManagerProps {
  accounts: Account[];
  onSave: (accounts: Account[]) => void;
  activeAccountId: string;
  onSetActive: (id: string) => void;
  plan?: 'free' | 'pro';
}

type DrawdownApproach = 'Intraday Trailing' | 'End of Day (EOD)' | 'Static';
interface PropFirmTemplate {
  id: string; templateName: string; accountSize: number; profitTarget: number;
  maxDrawdownDollar: number; dailyLossLimit: number; drawdownApproach: DrawdownApproach;
  minTradingDays: number; profitSplitPct: number; hasConsistencyRule: boolean; keyFact: string;
}

const PROP_FIRM_TEMPLATES: PropFirmTemplate[] = [
  { id:'pf1',  templateName:'$25K · Standard DD',          accountSize:25000,  profitTarget:1500, maxDrawdownDollar:1500, dailyLossLimit:0,    drawdownApproach:'End of Day (EOD)',   minTradingDays:7,  profitSplitPct:90,  hasConsistencyRule:true,  keyFact:'1:1 profit-to-drawdown ratio. Floor updates at session close — intraday swings do not count.' },
  { id:'pf2',  templateName:'$25K · Intraday Trailing',    accountSize:25000,  profitTarget:1500, maxDrawdownDollar:1500, dailyLossLimit:0,    drawdownApproach:'Intraday Trailing', minTradingDays:7,  profitSplitPct:90,  hasConsistencyRule:true,  keyFact:'Floor trails your peak equity in real time. Requires disciplined intraday size management.' },
  { id:'pf3',  templateName:'$50K · Standard DD',          accountSize:50000,  profitTarget:3000, maxDrawdownDollar:2000, dailyLossLimit:0,    drawdownApproach:'End of Day (EOD)',   minTradingDays:0,  profitSplitPct:90,  hasConsistencyRule:false, keyFact:'1.5:1 profit-to-drawdown. Floor updates end of session. Most common futures prop structure.' },
  { id:'pf4',  templateName:'$50K · Intraday Trailing',    accountSize:50000,  profitTarget:3000, maxDrawdownDollar:2500, dailyLossLimit:0,    drawdownApproach:'Intraday Trailing', minTradingDays:7,  profitSplitPct:100, hasConsistencyRule:true,  keyFact:'Live trailing floor. Once above the floor by $500, it locks and never goes below that level.' },
  { id:'pf5',  templateName:'$50K · With Daily Limit',     accountSize:50000,  profitTarget:3000, maxDrawdownDollar:2000, dailyLossLimit:1100, drawdownApproach:'End of Day (EOD)',   minTradingDays:10, profitSplitPct:80,  hasConsistencyRule:true,  keyFact:'Daily loss cap of $1,100 on top of the overall drawdown. Session ends automatically if hit.' },
  { id:'pf6',  templateName:'$100K · Standard DD',         accountSize:100000, profitTarget:6000, maxDrawdownDollar:3000, dailyLossLimit:0,    drawdownApproach:'End of Day (EOD)',   minTradingDays:0,  profitSplitPct:90,  hasConsistencyRule:false, keyFact:'2:1 profit-to-drawdown. No daily limit and no minimum days — straightforward to plan around.' },
  { id:'pf7',  templateName:'$100K · Intraday Trailing',   accountSize:100000, profitTarget:6000, maxDrawdownDollar:3000, dailyLossLimit:0,    drawdownApproach:'Intraday Trailing', minTradingDays:7,  profitSplitPct:100, hasConsistencyRule:true,  keyFact:'Live trailing stops. Floor never moves below $100,100 once you reach that threshold.' },
  { id:'pf8',  templateName:'$100K · Conservative/Static', accountSize:100000, profitTarget:6000, maxDrawdownDollar:625,  dailyLossLimit:0,    drawdownApproach:'Static',            minTradingDays:7,  profitSplitPct:100, hasConsistencyRule:true,  keyFact:'Fixed floor at account minus $625 from day one. Very tight room — size must stay small.' },
  { id:'pf9',  templateName:'$100K · With Daily Limit',    accountSize:100000, profitTarget:6000, maxDrawdownDollar:3500, dailyLossLimit:2200, drawdownApproach:'End of Day (EOD)',   minTradingDays:10, profitSplitPct:80,  hasConsistencyRule:true,  keyFact:'Daily cap plus overall drawdown. No single day can exceed 30% of total profit.' },
  { id:'pf10', templateName:'$150K · Standard DD',         accountSize:150000, profitTarget:9000, maxDrawdownDollar:4500, dailyLossLimit:0,    drawdownApproach:'End of Day (EOD)',   minTradingDays:0,  profitSplitPct:90,  hasConsistencyRule:false, keyFact:'2:1 profit-to-drawdown at scale. Clean structure for systematic traders.' },
  { id:'pf11', templateName:'$150K · Intraday Trailing',   accountSize:150000, profitTarget:9000, maxDrawdownDollar:5000, dailyLossLimit:0,    drawdownApproach:'Intraday Trailing', minTradingDays:7,  profitSplitPct:90,  hasConsistencyRule:true,  keyFact:'Live trailing floor. Larger capital means more contracts — size management is critical.' },
];

const APPROACH_STYLE: Record<DrawdownApproach, { bg: string; text: string; dot: string }> = {
  'Intraday Trailing': { bg:'bg-amber-50 border-amber-200',     text:'text-amber-700',   dot:'bg-amber-500'   },
  'End of Day (EOD)':  { bg:'bg-blue-50 border-blue-200',       text:'text-blue-700',    dot:'bg-blue-500'    },
  'Static':            { bg:'bg-emerald-50 border-emerald-200', text:'text-emerald-700', dot:'bg-emerald-500' },
};

// ── Prop Firm Picker ──────────────────────────────────────────────────────────
const PropFirmPicker: React.FC<{ onSelect:(t:PropFirmTemplate)=>void; onSkip:()=>void; onBack:()=>void }> = ({ onSelect, onSkip, onBack }) => {
  const [activeSize, setActiveSize] = useState(25000);
  const [expanded, setExpanded] = useState<string|null>(null);
  const filtered = PROP_FIRM_TEMPLATES.filter(t => t.accountSize === activeSize);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <button type="button" onClick={onBack} className="text-black/30 hover:text-black transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Select a Prop Firm Template</h3>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[25000,50000,100000,150000].map(sz => (
          <button key={sz} type="button" onClick={() => { setActiveSize(sz); setExpanded(null); }}
            className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${activeSize===sz ? 'bg-black text-white border-black' : 'bg-white border-black/10 text-black/40 hover:border-black/30 hover:text-black/70'}`}>
            ${sz/1000}K
          </button>
        ))}
      </div>
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
        {filtered.map(t => {
          const col = APPROACH_STYLE[t.drawdownApproach]; const isOpen = expanded === t.id;
          return (
            <div key={t.id} className={`rounded-2xl border transition-all duration-200 overflow-hidden ${col.bg}`}>
              <div className="flex items-center gap-3 p-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-black truncate ${col.text}`}>{t.templateName}</p>
                  <p className="text-[9px] font-bold text-black/30 uppercase tracking-widest mt-0.5">{t.drawdownApproach} · {t.profitSplitPct}% payout</p>
                </div>
                <button type="button" onClick={() => setExpanded(isOpen ? null : t.id)} className="text-black/20 hover:text-black/60 transition-colors px-2 py-1 text-[10px] font-black">{isOpen ? '▲' : '▼'}</button>
                <button type="button" onClick={() => onSelect(t)} className="px-4 py-2 bg-black text-white rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">Use</button>
              </div>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-black/5 pt-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[{l:'Profit Target',v:`$${t.profitTarget.toLocaleString()}`},{l:'Max Drawdown',v:`$${t.maxDrawdownDollar.toLocaleString()}`},{l:'Daily Limit',v:t.dailyLossLimit>0?`$${t.dailyLossLimit.toLocaleString()}`:'None'}].map(({l,v}) => (
                      <div key={l} className="bg-white/60 rounded-xl p-2.5 text-center">
                        <p className="text-[8px] font-black text-black/30 uppercase tracking-widest">{l}</p>
                        <p className="text-[11px] font-black text-black mt-0.5">{v}</p>
                      </div>
                    ))}
                  </div>
                  {(t.minTradingDays > 0 || t.hasConsistencyRule) && (
                    <div className="flex flex-wrap gap-1.5">
                      {t.minTradingDays > 0 && <span className="px-2 py-1 bg-white/60 rounded-lg text-[8px] font-black text-black/50 uppercase tracking-widest">Min {t.minTradingDays} days</span>}
                      {t.hasConsistencyRule && <span className="px-2 py-1 bg-white/60 rounded-lg text-[8px] font-black text-black/50 uppercase tracking-widest">Consistency rule</span>}
                    </div>
                  )}
                  <p className="text-[10px] font-semibold text-black/50 leading-relaxed">{t.keyFact}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={onSkip} className="w-full py-3 text-[9px] font-black uppercase tracking-widest text-black/30 hover:text-black transition-colors">Skip — enter details manually</button>
    </div>
  );
};

// ── Edit form (inline) ────────────────────────────────────────────────────────
const EditAccountForm: React.FC<{ account:Account; onSave:(a:Account)=>void; onCancel:()=>void }> = ({ account, onSave, onCancel }) => {
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState(account.initialBalance);
  const [color, setColor] = useState(account.color);
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!name.trim()) return; setSaving(true);
    const updated: Account = { ...account, name: name.trim(), initialBalance: Number(balance), color };
    await updateAccountInDB(updated).catch(console.error);
    onSave(updated); setSaving(false);
  };
  return (
    <div className="bg-black/[0.03] rounded-2xl p-5 space-y-4 border border-black/5 animate-in slide-in-from-top-1 duration-200">
      <div className="space-y-1">
        <label className="text-[8px] font-black uppercase tracking-widest text-black/30 ml-1">Display Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          className="w-full bg-white border border-black/10 rounded-xl p-3 text-xs font-bold outline-none focus:border-black transition-colors text-black" />
      </div>
      <div className="space-y-1">
        <label className="text-[8px] font-black uppercase tracking-widest text-black/30 ml-1">Starting Capital</label>
        <input type="number" value={balance} onChange={e => setBalance(Number(e.target.value))}
          className="w-full bg-white border border-black/10 rounded-xl p-3 text-xs font-bold outline-none focus:border-black transition-colors text-black" />
      </div>
      <div className="flex items-center justify-between px-1">
        <label className="text-[8px] font-black uppercase tracking-widest text-black/30">Colour</label>
        <input type="color" value={color} onChange={e => setColor(e.target.value)}
          className="w-10 h-10 rounded-xl overflow-hidden border-none bg-transparent cursor-pointer" />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-3 text-[9px] font-black uppercase tracking-widest text-black/40 hover:text-black transition-colors">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving || !name.trim()}
          className="flex-1 py-3 bg-black text-white rounded-2xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <><div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"/>Saving…</> : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

// ── Main Account Page ─────────────────────────────────────────────────────────
type AddStep = 'pick_type' | 'prop_picker' | 'manual_form';

const AccountManager: React.FC<AccountManagerProps> = ({ accounts, onSave, activeAccountId, onSetActive, plan = 'free' }) => {
  const [localAccounts, setLocalAccounts] = useState<Account[]>(accounts);
  const [addStep, setAddStep] = useState<AddStep | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState({ name: '', balance: 0, color: '#111111' });
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const canAddMore = plan === 'pro' || localAccounts.length < 1;
  const push = (updated: Account[]) => { setLocalAccounts(updated); onSave(updated); };

  const startAdd = () => {
    if (!canAddMore) { alert('Free plan is limited to 1 account.\n\nUpgrade to Pro for unlimited accounts.'); return; }
    setNewAccount({ name: '', balance: 0, color: '#111111' });
    setAddStep('pick_type'); setEditingId(null);
  };

  const handleAdd = () => {
    if (!newAccount.name.trim()) return;
    const acc: Account = { id: crypto.randomUUID(), name: newAccount.name.trim(), initialBalance: Number(newAccount.balance), currency: 'USD', color: newAccount.color, createdAt: new Date().toISOString() };
    push([...localAccounts, acc]); setAddStep(null); setNewAccount({ name: '', balance: 0, color: '#111111' });
  };

  const handleEditSave = (updated: Account) => { push(localAccounts.map(a => a.id === updated.id ? updated : a)); setEditingId(null); };

  const handleConfirmDelete = async (id: string) => {
    setIsDeletingId(id); setPendingDeleteId(null);
    try {
      const result = await deleteSupabaseAccount(id);
      if (result.success && result.count > 0) { push(localAccounts.filter(a => a.id !== id)); }
      else if (result.success && result.count === 0) { if (window.confirm('0 rows deleted. Force-remove locally?')) push(localAccounts.filter(a => a.id !== id)); }
      else { alert(result.error?.code === '23503' ? 'Cannot delete: trades are linked to this account.' : `Deletion failed: ${result.error?.message || 'Unknown error'}`); }
    } catch (err: any) { alert(`Connection error: ${err.message}`); }
    finally { setIsDeletingId(null); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-24">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-black uppercase">Account Hub</h2>
          <p className="text-[10px] font-black text-black/30 uppercase tracking-[0.2em] mt-1">Multi-Broker Management</p>
        </div>
        {!addStep && (
          <button onClick={startAdd}
            className={`flex items-center gap-2 px-5 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${canAddMore ? 'bg-black text-white active:scale-95 hover:bg-black/80' : 'bg-black/10 text-black/30 cursor-not-allowed'}`}>
            <ICONS.Plus className="w-3.5 h-3.5" /> Add Account
          </button>
        )}
      </div>

      {/* ── Add flow ── */}
      {addStep === 'pick_type' && (
        <div className="apple-glass rounded-[2rem] p-6 border border-white/60 shadow-lg space-y-4 animate-in slide-in-from-top-2 duration-200">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-black/40 text-center pb-1">What type of account?</p>
          <button type="button" onClick={() => setAddStep('prop_picker')}
            className="w-full flex items-center gap-4 p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl text-left active:scale-[0.98] transition-all hover:border-amber-300">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0"><ICONS.Zap className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-[12px] font-black text-amber-800">Prop Firm Account</p>
              <p className="text-[9px] font-bold text-amber-600/70 mt-0.5">Load from a template — auto-fills balance & rules</p>
            </div>
            <svg className="w-4 h-4 text-amber-400 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
          <button type="button" onClick={() => setAddStep('manual_form')}
            className="w-full flex items-center gap-4 p-5 bg-black/[0.02] border border-black/10 rounded-2xl text-left active:scale-[0.98] transition-all hover:border-black/20">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center flex-shrink-0"><ICONS.Dollar className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-[12px] font-black text-black">Personal / Broker Account</p>
              <p className="text-[9px] font-bold text-black/40 mt-0.5">Enter your own name and starting capital</p>
            </div>
            <svg className="w-4 h-4 text-black/20 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
          <button type="button" onClick={() => setAddStep(null)} className="w-full py-3 text-[9px] font-black uppercase tracking-widest text-black/20 hover:text-black/50 transition-colors">Cancel</button>
        </div>
      )}

      {addStep === 'prop_picker' && (
        <div className="apple-glass rounded-[2rem] p-6 border border-white/60 shadow-lg animate-in slide-in-from-top-2 duration-200">
          <PropFirmPicker onSelect={t => { setNewAccount(p => ({ ...p, balance: t.accountSize })); setAddStep('manual_form'); }} onSkip={() => setAddStep('manual_form')} onBack={() => setAddStep('pick_type')} />
        </div>
      )}

      {addStep === 'manual_form' && (
        <div className="apple-glass rounded-[2rem] p-6 border border-white/60 shadow-lg space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => setAddStep('pick_type')} className="text-black/30 hover:text-black transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">New Account Details</h3>
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black uppercase tracking-widest text-black/30 ml-1">Display Name</label>
            <input type="text" placeholder="Apex, FTMO, Personal…" value={newAccount.name} onChange={e => setNewAccount(p => ({...p, name: e.target.value}))}
              className="w-full bg-white border border-black/10 rounded-xl p-3 text-xs font-bold outline-none focus:border-black transition-colors text-black" />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black uppercase tracking-widest text-black/30 ml-1">Starting Capital</label>
            <input type="number" placeholder="0.00" value={newAccount.balance || ''} onChange={e => setNewAccount(p => ({...p, balance: Number(e.target.value)}))}
              className="w-full bg-white border border-black/10 rounded-xl p-3 text-xs font-bold outline-none focus:border-black transition-colors text-black" />
          </div>
          <div className="flex items-center justify-between px-1">
            <label className="text-[8px] font-black uppercase tracking-widest text-black/30">Interface Colour</label>
            <input type="color" value={newAccount.color} onChange={e => setNewAccount(p => ({...p, color: e.target.value}))}
              className="w-10 h-10 rounded-xl overflow-hidden border-none bg-transparent cursor-pointer" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setAddStep(null)} className="flex-1 py-4 text-[9px] font-black uppercase tracking-widest text-black/40 hover:text-black">Abort</button>
            <button type="button" onClick={handleAdd} disabled={!newAccount.name.trim()}
              className="flex-1 py-4 bg-black text-white rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-40">Register Account</button>
          </div>
        </div>
      )}

      {/* ── Account cards ── */}
      <div className="space-y-4">
        {localAccounts.length === 0 && addStep === null && (
          <div className="apple-glass rounded-[2rem] border border-white/60 p-16 text-center opacity-40">
            <ICONS.Dollar className="w-10 h-10 mx-auto mb-3 text-black" />
            <p className="text-[10px] font-black uppercase tracking-widest text-black">No accounts registered</p>
            <p className="text-[9px] font-bold text-black/40 mt-1">Click Add Account above to get started</p>
          </div>
        )}
        {localAccounts.map(acc => {
          const isActive = acc.id === activeAccountId;
          const isEditing = editingId === acc.id;
          const isDeleting = isDeletingId === acc.id;
          const isPendingDelete = pendingDeleteId === acc.id;
          return (
            <div key={acc.id} className={`apple-glass rounded-[2rem] border shadow-lg transition-all duration-200 overflow-hidden ${isActive ? 'border-black/20 ring-2 ring-black/10' : 'border-white/60'} ${isDeleting ? 'opacity-50 scale-[0.99]' : ''}`}>
              <div className="flex items-center gap-4 p-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md" style={{ backgroundColor: acc.color }}>
                  <ICONS.Zap className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-black truncate">{acc.name}</h4>
                    {isActive && <span className="px-2 py-0.5 bg-black text-white rounded-full text-[7px] font-black uppercase tracking-widest flex-shrink-0">Active</span>}
                  </div>
                  <p className="text-[10px] font-bold text-black/30 uppercase tracking-widest mt-0.5">${acc.initialBalance.toLocaleString()} Starting Capital</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!isActive && (
                    <button onClick={() => onSetActive(acc.id)} title="Set as active"
                      className="px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest text-black/40 hover:text-black hover:bg-black/5 transition-all">
                      Switch
                    </button>
                  )}
                  {!isPendingDelete && (
                    <button onClick={() => setEditingId(isEditing ? null : acc.id)} title="Edit account"
                      className={`p-2.5 rounded-xl transition-all ${isEditing ? 'bg-black text-white' : 'text-black/30 hover:text-black hover:bg-black/5'}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                  )}
                  {isPendingDelete ? (
                    <div className="flex items-center gap-1 animate-in slide-in-from-right-2">
                      <button onClick={() => setPendingDeleteId(null)} className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-black/40 hover:text-black transition-colors">Cancel</button>
                      <button onClick={() => handleConfirmDelete(acc.id)} className="px-3 py-2 bg-rose-500 text-white rounded-xl text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all">Delete</button>
                    </div>
                  ) : (
                    <button onClick={() => { if (!isDeletingId) { setEditingId(null); setPendingDeleteId(acc.id); } }} disabled={isDeletingId !== null}
                      className={`p-2.5 rounded-xl transition-all disabled:opacity-40 ${isDeleting ? 'text-black/20' : 'text-rose-400 hover:text-rose-600 hover:bg-rose-50'}`}>
                      {isDeleting ? <ICONS.Sync className="w-4 h-4 animate-spin" /> : <ICONS.Delete className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
              {isEditing && (
                <div className="px-5 pb-5">
                  <EditAccountForm account={acc} onSave={handleEditSave} onCancel={() => setEditingId(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!canAddMore && plan === 'free' && addStep === null && (
        <p className="text-[8px] font-bold text-center text-black/30 uppercase tracking-widest">Upgrade to Pro for unlimited accounts</p>
      )}
    </div>
  );
};

export default AccountManager;
