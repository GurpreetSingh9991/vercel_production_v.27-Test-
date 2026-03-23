import React, { useState, useMemo } from 'react';
import { Trade } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Playbook {
  id: string;
  name: string;
  description: string;
  rules: string[];
  tags: string[];
  colorHex: string;
  createdAt: string;
}

interface PlaybookKPIs {
  tradeCount: number;
  winRate: number;
  avgRR: number;
  totalPnL: number;
  avgPnL: number;
}

const PLAYBOOK_COLORS = [
  { name: 'Indigo',  hex: '#6366F1' },
  { name: 'Blue',    hex: '#3B82F6' },
  { name: 'Cyan',    hex: '#06B6D4' },
  { name: 'Green',   hex: '#10B981' },
  { name: 'Gold',    hex: '#F59E0B' },
  { name: 'Orange',  hex: '#F97316' },
  { name: 'Red',     hex: '#EF4444' },
  { name: 'Pink',    hex: '#EC4899' },
  { name: 'Purple',  hex: '#8B5CF6' },
];

function getLinkedTrades(pb: Playbook, trades: Trade[]): Trade[] {
  return trades.filter(t =>
    (t as any).playbookId === pb.id ||
    t.setupType?.toLowerCase() === pb.name.toLowerCase()
  );
}

function computeKPIs(pb: Playbook, trades: Trade[]): PlaybookKPIs {
  const linked = getLinkedTrades(pb, trades);
  if (!linked.length) return { tradeCount: 0, winRate: 0, avgRR: 0, totalPnL: 0, avgPnL: 0 };
  const wins = linked.filter(t => t.result === 'WIN').length;
  const totalPnL = linked.reduce((s, t) => s + t.pnl, 0);
  const avgRR = linked.reduce((s, t) => s + (t.rr || 0), 0) / linked.length;
  return { tradeCount: linked.length, winRate: wins / linked.length, avgRR, totalPnL, avgPnL: totalPnL / linked.length };
}

function fmtPnl(v: number) {
  return `${v >= 0 ? '+$' : '-$'}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const PlaybookIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const BackBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-black transition-colors">
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
    Strategy Library
  </button>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageView = 'list' | 'detail' | 'form';

interface PlaybookPageProps {
  playbooks: Playbook[];
  trades: Trade[];
  onSave: (pb: Playbook) => void;
  onDelete: (id: string) => void;
}

const PlaybookPage: React.FC<PlaybookPageProps> = ({ playbooks, trades, onSave, onDelete }) => {
  const [view, setView] = useState<PageView>('list');
  const [editing, setEditing] = useState<Playbook | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? (playbooks.find(p => p.id === selectedId) ?? null) : null;

  const openNew  = () => { setEditing(null); setView('form'); };
  const openEdit = (pb: Playbook) => { setEditing(pb); setView('form'); };
  const openDetail = (pb: Playbook) => { setSelectedId(pb.id); setView('detail'); };
  const goBack   = () => { setView('list'); setSelectedId(null); setEditing(null); };

  if (view === 'form') return (
    <PlaybookFormPage
      playbook={editing}
      trades={trades}
      existingNames={playbooks.filter(p => p.id !== editing?.id).map(p => p.name)}
      onSave={(pb) => { onSave(pb); goBack(); }}
      onCancel={goBack}
    />
  );

  if (view === 'detail' && selected) return (
    <PlaybookDetailPage
      playbook={selected}
      trades={trades}
      onBack={goBack}
      onEdit={() => openEdit(selected)}
      onDelete={() => { onDelete(selected.id); goBack(); }}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-black/30 mb-1">Strategy Library</h2>
          <p className="text-[13px] text-slate-500">Define your setups — trades auto-link by name</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow active:scale-95 transition-transform">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          New Playbook
        </button>
      </div>

      {playbooks.length === 0 && (
        <div className="text-center py-24 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <PlaybookIcon className="w-12 h-12 mx-auto text-slate-200 mb-4" />
          <p className="text-[14px] font-bold text-slate-400 mb-1">No playbooks yet</p>
          <p className="text-[12px] text-slate-300 mb-6">Create your first strategy to start tracking performance</p>
          <button onClick={openNew} className="px-5 py-2.5 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-full active:scale-95 transition-transform">Create Playbook</button>
        </div>
      )}

      {playbooks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {playbooks.map(pb => (
            <PlaybookCard key={pb.id} playbook={pb} trades={trades}
              onOpen={() => openDetail(pb)} onEdit={() => openEdit(pb)} onDelete={() => onDelete(pb.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────────

const PlaybookCard: React.FC<{ playbook: Playbook; trades: Trade[]; onOpen: () => void; onEdit: () => void; onDelete: () => void }> = ({ playbook, trades, onOpen, onEdit, onDelete }) => {
  const kpis = useMemo(() => computeKPIs(playbook, trades), [playbook, trades]);
  const color = playbook.colorHex;
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-shadow group" onClick={onOpen}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-black text-black truncate">{playbook.name}</p>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-black transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button onClick={() => { if (confirm(`Delete "${playbook.name}"?`)) onDelete(); }} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
          {playbook.description && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{playbook.description}</p>}
        </div>
      </div>
      {playbook.tags.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {playbook.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}18`, color }}>{tag}</span>
          ))}
        </div>
      )}
      <div className="border-t border-slate-50 grid grid-cols-4 divide-x divide-slate-50">
        {[
          { label: 'TRADES', value: kpis.tradeCount.toString(), c: 'text-black' },
          { label: 'WIN %',  value: kpis.tradeCount ? `${Math.round(kpis.winRate * 100)}%` : '—', c: kpis.tradeCount ? (kpis.winRate >= 0.5 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-300' },
          { label: 'AVG R',  value: kpis.tradeCount ? `${kpis.avgRR.toFixed(2)}R` : '—', c: kpis.tradeCount ? (kpis.avgRR >= 1 ? 'text-emerald-600' : 'text-slate-500') : 'text-slate-300' },
          { label: 'P&L',    value: kpis.tradeCount ? (kpis.totalPnL >= 0 ? `+$${Math.round(kpis.totalPnL)}` : `-$${Math.round(Math.abs(kpis.totalPnL))}`) : '—', c: kpis.tradeCount ? (kpis.totalPnL >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-300' },
        ].map(({ label, value, c }) => (
          <div key={label} className="py-3 text-center">
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">{label}</p>
            <p className={`text-[13px] font-black ${c}`}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Detail Page ──────────────────────────────────────────────────────────────

const PlaybookDetailPage: React.FC<{ playbook: Playbook; trades: Trade[]; onBack: () => void; onEdit: () => void; onDelete: () => void }> = ({ playbook, trades, onBack, onEdit, onDelete }) => {
  const kpis   = useMemo(() => computeKPIs(playbook, trades), [playbook, trades]);
  const linked = useMemo(() => getLinkedTrades(playbook, trades), [playbook, trades]);
  const color  = playbook.colorHex;
  const winPct = kpis.tradeCount ? Math.round(kpis.winRate * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <BackBtn onClick={onBack} />
        <div className="flex gap-2">
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-black hover:text-black transition-colors shadow-sm">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            Edit
          </button>
          <button onClick={() => { if (confirm(`Delete "${playbook.name}"?`)) onDelete(); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-red-400 hover:border-red-300 hover:bg-red-50 transition-colors shadow-sm">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Delete
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <h1 className="text-[24px] font-black text-black tracking-tight">{playbook.name}</h1>
              </div>
              {playbook.description && <p className="text-[13px] text-slate-500 leading-relaxed mb-4">{playbook.description}</p>}
              {playbook.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {playbook.tags.map(tag => <span key={tag} className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${color}15`, color }}>{tag}</span>)}
                </div>
              )}
            </div>
            {kpis.tradeCount > 0 && (
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="8" />
                    <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 32}`}
                      strokeDashoffset={`${2 * Math.PI * 32 * (1 - kpis.winRate)}`}
                      strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[18px] font-black text-black leading-none">{winPct}%</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">WIN</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* KPI strip */}
        <div className="border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100">
          {[
            { label: 'Total Trades',     value: kpis.tradeCount.toString(),                                                sub: 'logged',                                                              c: 'text-black' },
            { label: 'Win Rate',         value: kpis.tradeCount ? `${winPct}%` : '—',                                     sub: kpis.tradeCount ? (kpis.winRate >= 0.5 ? 'above avg' : 'below avg') : 'no data', c: kpis.tradeCount ? (kpis.winRate >= 0.5 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-300' },
            { label: 'Avg Risk:Reward',  value: kpis.tradeCount ? `${kpis.avgRR.toFixed(2)}R` : '—',                      sub: kpis.tradeCount ? (kpis.avgRR >= 1 ? 'positive edge' : 'needs work') : 'no data', c: kpis.tradeCount ? (kpis.avgRR >= 1 ? 'text-emerald-600' : 'text-slate-600') : 'text-slate-300' },
            { label: 'Total P&L',        value: kpis.tradeCount ? fmtPnl(kpis.totalPnL) : '—',                            sub: kpis.tradeCount ? `avg ${fmtPnl(kpis.avgPnL)}/trade` : 'no data',     c: kpis.tradeCount ? (kpis.totalPnL >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-slate-300' },
          ].map(({ label, value, sub, c }) => (
            <div key={label} className="p-5 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
              <p className={`text-[22px] font-black leading-none mb-1 ${c}`}>{value}</p>
              <p className="text-[10px] text-slate-400">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rules */}
        {playbook.rules.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Playbook Rules</p>
            <div className="space-y-3">
              {playbook.rules.map((rule, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 mt-0.5" style={{ backgroundColor: color }}>{i + 1}</span>
                  <p className="text-[13px] text-slate-700 leading-relaxed pt-0.5">{rule}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trades */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">
            Linked Trades {linked.length > 0 && <span className="text-black ml-1">({linked.length})</span>}
          </p>
          {linked.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-2xl">
              <p className="text-[12px] font-semibold text-slate-400 mb-1">No trades linked yet</p>
              <p className="text-[11px] text-slate-300">Trades auto-link when Strategy Name = "{playbook.name}"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {linked.map(trade => {
                const isWin = trade.result === 'WIN', isLoss = trade.result === 'LOSS';
                return (
                  <div key={trade.id} className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: isWin ? '#10B981' : isLoss ? '#EF4444' : '#94a3b8' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-black text-black">{trade.symbol}</p>
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${isWin ? 'bg-emerald-100 text-emerald-600' : isLoss ? 'bg-red-100 text-red-500' : 'bg-slate-200 text-slate-500'}`}>{trade.result}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">{trade.date}{trade.setupType ? ` · ${trade.setupType}` : ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-[13px] font-black ${trade.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtPnl(trade.pnl)}</p>
                      <p className="text-[10px] text-slate-400">{trade.rr?.toFixed(2)}R</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Form Page ────────────────────────────────────────────────────────────────

const PlaybookFormPage: React.FC<{ playbook: Playbook | null; trades: Trade[]; existingNames: string[]; onSave: (pb: Playbook) => void; onCancel: () => void }> = ({ playbook, trades, existingNames, onSave, onCancel }) => {
  const [name, setName]               = useState(playbook?.name ?? '');
  const [description, setDescription] = useState(playbook?.description ?? '');
  const [rules, setRules]             = useState<string[]>(playbook?.rules.length ? playbook.rules : ['']);
  const [tags, setTags]               = useState(playbook?.tags.join(', ') ?? '');
  const [colorHex, setColorHex]       = useState(playbook?.colorHex ?? PLAYBOOK_COLORS[0].hex);
  const [nameError, setNameError]     = useState('');

  const preview = useMemo(() =>
    name.trim() ? trades.filter(t => t.setupType?.toLowerCase() === name.trim().toLowerCase() || (playbook && (t as any).playbookId === playbook.id)).slice(0, 5) : [],
    [name, trades, playbook]
  );

  const addRule    = () => setRules(r => [...r, '']);
  const updateRule = (i: number, v: string) => setRules(r => r.map((x, j) => j === i ? v : x));
  const removeRule = (i: number) => setRules(r => r.filter((_, j) => j !== i));

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Name is required'); return; }
    if (existingNames.some(n => n.toLowerCase() === trimmed.toLowerCase())) { setNameError('Name already exists'); return; }
    onSave({
      id: playbook?.id ?? crypto.randomUUID(),
      name: trimmed,
      description: description.trim(),
      rules: rules.map(r => r.trim()).filter(Boolean),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      colorHex,
      createdAt: playbook?.createdAt ?? new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <BackBtn onClick={onCancel} />
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 transition-colors shadow-sm">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()} className="px-5 py-2 rounded-xl bg-black text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/80 transition-colors shadow-sm">
            {playbook ? 'Save Changes' : 'Create Playbook'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: form fields */}
        <div className="lg:col-span-2 space-y-5">
          {/* Identity */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Strategy Library</p>
              <h2 className="text-[20px] font-black text-black">{playbook ? 'Edit Playbook' : 'New Playbook'}</h2>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Strategy Name *</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorHex }} />
                <input value={name} onChange={e => { setName(e.target.value); setNameError(''); }}
                  placeholder="e.g. VWAP Reclaim, ORB, Pullback"
                  className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[14px] font-semibold text-black placeholder:text-slate-300 focus:outline-none focus:border-black transition-colors" />
              </div>
              {nameError && <p className="text-[11px] text-red-500 mt-1.5">{nameError}</p>}
              {name.trim() && preview.length > 0 && <p className="text-[11px] text-emerald-600 font-semibold mt-1.5">✓ Will auto-link {preview.length} existing trade{preview.length !== 1 ? 's' : ''}</p>}
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-2">Accent Color</label>
              <div className="flex gap-2.5 flex-wrap">
                {PLAYBOOK_COLORS.map(c => (
                  <button key={c.hex} type="button" onClick={() => setColorHex(c.hex)}
                    className="w-8 h-8 rounded-full transition-all flex items-center justify-center"
                    style={{ backgroundColor: c.hex, boxShadow: colorHex === c.hex ? `0 0 0 3px white, 0 0 0 5px ${c.hex}` : 'none', transform: colorHex === c.hex ? 'scale(1.15)' : 'scale(1)' }}>
                    {colorHex === c.hex && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">How It Works</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Describe the setup, market conditions, entry triggers, your rationale..."
              rows={4} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] text-black placeholder:text-slate-300 focus:outline-none focus:border-black transition-colors resize-none leading-relaxed" />
          </div>

          {/* Rules */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Playbook Rules</label>
                <p className="text-[11px] text-slate-400 mt-0.5">Entry, exit & risk management rules</p>
              </div>
              <button type="button" onClick={addRule} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add
              </button>
            </div>
            <div className="space-y-2.5">
              {rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ backgroundColor: colorHex }}>{i + 1}</span>
                  <input value={rule} onChange={e => updateRule(i, e.target.value)} placeholder={`Rule ${i + 1}...`}
                    className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] text-black placeholder:text-slate-300 focus:outline-none focus:border-black transition-colors" />
                  {rules.length > 1 && (
                    <button type="button" onClick={() => removeRule(i)} className="p-1.5 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Tags <span className="normal-case font-normal text-slate-400">(comma separated)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="momentum, trend-following, scalp"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] text-black placeholder:text-slate-300 focus:outline-none focus:border-black transition-colors" />
            {tags.trim() && (
              <div className="flex gap-1.5 flex-wrap mt-3">
                {tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                  <span key={tag} className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${colorHex}15`, color: colorHex }}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: live preview */}
        <div>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden sticky top-4">
            <div className="h-1" style={{ backgroundColor: colorHex }} />
            <div className="p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Live Preview</p>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorHex }} />
                <p className="text-[16px] font-black text-black truncate">{name.trim() || <span className="text-slate-300">Untitled</span>}</p>
              </div>
              {description.trim() && <p className="text-[12px] text-slate-500 leading-relaxed mb-3 line-clamp-3">{description}</p>}
              {tags.split(',').filter(t => t.trim()).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 4).map(tag => (
                    <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${colorHex}15`, color: colorHex }}>{tag}</span>
                  ))}
                </div>
              )}
              {rules.filter(r => r.trim()).length > 0 && (
                <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-300 mb-2">Rules</p>
                  {rules.filter(r => r.trim()).slice(0, 4).map((rule, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black text-white flex-shrink-0 mt-0.5" style={{ backgroundColor: colorHex }}>{i + 1}</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{rule}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {preview.length > 0 && (
              <div className="border-t border-slate-100 p-5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Matching Trades ({preview.length})</p>
                <div className="space-y-1.5">
                  {preview.map(t => (
                    <div key={t.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-full" style={{ backgroundColor: t.result === 'WIN' ? '#10B981' : t.result === 'LOSS' ? '#EF4444' : '#94a3b8' }} />
                        <span className="text-[12px] font-bold text-black">{t.symbol}</span>
                      </div>
                      <span className={`text-[11px] font-black ${t.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtPnl(t.pnl)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Playbook Picker ──────────────────────────────────────────────────────────

interface PlaybookPickerProps {
  playbooks: Playbook[];
  setupType: string;
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}

export const PlaybookPicker: React.FC<PlaybookPickerProps> = ({ playbooks, setupType, value, onChange }) => {
  if (playbooks.length === 0) return null;
  const autoMatch = playbooks.find(pb => pb.name.toLowerCase() === setupType?.toLowerCase());
  const [showOverride, setShowOverride] = useState(!!value);

  if (autoMatch && !showOverride) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: `${autoMatch.colorHex}12` }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: autoMatch.colorHex }} />
        <span className="text-[10px] font-black uppercase tracking-widest flex-1" style={{ color: autoMatch.colorHex }}>Auto-linked: {autoMatch.name}</span>
        <button type="button" onClick={() => { setShowOverride(true); onChange(undefined); }} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-black transition-colors">Override</button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => { onChange(undefined); setShowOverride(false); }}
        className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${!value ? 'bg-black text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
        {autoMatch ? 'Auto' : 'None'}
      </button>
      {playbooks.map(pb => {
        const isSelected = value === pb.id;
        return (
          <button key={pb.id} type="button" onClick={() => { onChange(isSelected ? undefined : pb.id); setShowOverride(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
            style={{ backgroundColor: isSelected ? pb.colorHex : '#F1F5F9', color: isSelected ? 'white' : '#475569' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSelected ? 'white' : pb.colorHex }} />
            {pb.name}
          </button>
        );
      })}
    </div>
  );
};

export default PlaybookPage;
