import React, { useState, useEffect, useRef } from 'react';
import { Trade } from '../types';
import { ICONS } from '../constants';
import {
  getCurrentWeekKey,
  isEndOfTradingWeek,
  getNextFriday,
  buildWeeklyPayload,
  generateWeeklyBriefing,
} from '../services/geminiService';
import { getSupabaseClient, getSession } from '../services/supabase';

interface AIPageProps { trades: Trade[]; }
interface CachedInsight { weekKey: string; content: string; generatedAt: string; tradeCount: number; }

const saveInsightToSupabase = async (insight: CachedInsight) => {
  const supabase = getSupabaseClient();
  const session  = await getSession();
  if (!supabase || !session?.user?.id) return;
  await supabase.from('profiles').upsert({
    id: session.user.id,
    ai_insight_content: insight.content,
    ai_insight_week:    insight.weekKey,
    ai_insight_updated: insight.generatedAt,
  }, { onConflict: 'id' });
};

const loadInsightFromSupabase = async (): Promise<CachedInsight | null> => {
  const supabase = getSupabaseClient();
  const session  = await getSession();
  if (!supabase || !session?.user?.id) return null;
  const { data } = await supabase
    .from('profiles')
    .select('ai_insight_content, ai_insight_week, ai_insight_updated')
    .eq('id', session.user.id)
    .single();
  if (!data?.ai_insight_content || !data?.ai_insight_week) return null;
  return { weekKey: data.ai_insight_week, content: data.ai_insight_content, generatedAt: data.ai_insight_updated || '', tradeCount: 0 };
};

const getThisWeekTrades = (trades: Trade[]): Trade[] => {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const mondayStr = monday.toISOString().split('T')[0];
  return trades.filter(t => t.date >= mondayStr);
};

const LOADING_PHRASES = [
  'Scanning trade patterns…',
  'Computing profit factor…',
  'Analysing emotional leaks…',
  'Mapping day-of-week bias…',
  'Identifying setup edge…',
  'Synthesising weekly data…',
  'Building performance model…',
  'Generating your debrief…',
];

const formatMarkdown = (text: string) =>
  text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim,  '<h2>$1</h2>')
    .replace(/^# (.*$)/gim,   '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim,     '<em>$1</em>')
    .replace(/^- (.*$)/gim,      '<li>$1</li>')
    .replace(/\n/gim,            '<br />');

// ── Generate Button ─────────────────────────────────────────────────────────
const GenerateButton: React.FC<{
  endOfWeek: boolean; weekTradeCount: number; nextFriday: string;
  isGenerating: boolean; onClick: () => void; variant?: 'full' | 'compact';
}> = ({ endOfWeek, weekTradeCount, nextFriday, isGenerating, onClick, variant = 'full' }) => {
  const canGenerate = endOfWeek && weekTradeCount >= 3 && !isGenerating;

  if (variant === 'compact') {
    return (
      <button onClick={onClick} disabled={!canGenerate}
        className="flex items-center gap-2 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest bg-black text-white shadow-xl active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        Regenerate This Week
      </button>
    );
  }

  if (!endOfWeek) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-black/[0.04] border border-black/[0.08] text-black/25 cursor-not-allowed select-none">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          <span className="text-[11px] font-black uppercase tracking-widest">Generate Weekly Report</span>
        </div>
        <p className="text-[9px] font-black uppercase tracking-widest text-black/20">🔒 Unlocks {nextFriday}</p>
      </div>
    );
  }

  if (weekTradeCount < 3) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-500 cursor-not-allowed select-none">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <span className="text-[11px] font-black uppercase tracking-widest">Need {3 - weekTradeCount} More Trade{3 - weekTradeCount === 1 ? '' : 's'}</span>
        </div>
        <p className="text-[9px] font-black uppercase tracking-widest text-black/20">{weekTradeCount}/3 trades logged this week</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button onClick={onClick} disabled={isGenerating}
        className="relative group/btn flex items-center gap-3 px-10 py-5 rounded-2xl bg-black text-white shadow-2xl active:scale-95 transition-all duration-200 disabled:opacity-50 hover:shadow-black/20 overflow-hidden">
        <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <svg className="w-4 h-4 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        <span className="text-[11px] font-black uppercase tracking-[0.2em] relative z-10">Generate Weekly Report</span>
      </button>
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-500">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        {weekTradeCount} trades ready · Window open until Sunday
      </div>
    </div>
  );
};

// ── Protocol Card ───────────────────────────────────────────────────────────
const ACCENT: Record<string, string> = {
  violet:  'bg-violet-500/[0.08] text-violet-500',
  amber:   'bg-amber-500/[0.08] text-amber-500',
  emerald: 'bg-emerald-500/[0.08] text-emerald-500',
};
const ProtocolCard = ({ icon, title, desc, accent = 'violet' }: { icon: React.ReactNode; title: string; desc: string; accent?: string }) => (
  <div className="apple-glass p-6 rounded-2xl border-white/60 space-y-3">
    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${ACCENT[accent]}`}>{icon}</div>
    <h4 className="text-[10px] font-black uppercase tracking-widest text-black">{title}</h4>
    <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-tight">{desc}</p>
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────
const AIPage: React.FC<AIPageProps> = ({ trades }) => {
  const [insight, setInsight]               = useState<string | null>(null);
  const [cachedWeek, setCachedWeek]         = useState<string | null>(null);
  const [generatedAt, setGeneratedAt]       = useState<string>('');
  const [isLoadingCache, setIsLoadingCache] = useState(true);
  const [isGenerating, setIsGenerating]     = useState(false);
  const [generateError, setGenerateError]   = useState<string | null>(null);
  const [loadingPhrase, setLoadingPhrase]   = useState(LOADING_PHRASES[0]);
  const [weekTrades, setWeekTrades]         = useState<Trade[]>([]);
  const [dots, setDots]                     = useState('');
  const phraseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotsRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentWeekKey   = getCurrentWeekKey();
  const endOfWeek        = isEndOfTradingWeek();
  const nextFriday       = getNextFriday();
  const cachedIsThisWeek = cachedWeek === currentWeekKey;

  useEffect(() => {
    const load = async () => {
      setIsLoadingCache(true);
      try {
        const remote = await loadInsightFromSupabase();
        if (remote) {
          setInsight(remote.content); setCachedWeek(remote.weekKey); setGeneratedAt(remote.generatedAt);
        } else {
          const local = localStorage.getItem('tf_weekly_insight');
          if (local) {
            const parsed: CachedInsight = JSON.parse(local);
            setInsight(parsed.content); setCachedWeek(parsed.weekKey); setGeneratedAt(parsed.generatedAt);
          }
        }
      } catch (e) { console.warn('Could not load cached insight:', e); }
      finally { setIsLoadingCache(false); }
    };
    load();
  }, []);

  useEffect(() => { setWeekTrades(getThisWeekTrades(trades)); }, [trades]);

  useEffect(() => {
    if (isGenerating) {
      let idx = 0;
      phraseRef.current = setInterval(() => { idx = (idx + 1) % LOADING_PHRASES.length; setLoadingPhrase(LOADING_PHRASES[idx]); }, 1800);
      dotsRef.current   = setInterval(() => { setDots(d => d.length >= 3 ? '' : d + '.'); }, 400);
    } else {
      if (phraseRef.current) clearInterval(phraseRef.current);
      if (dotsRef.current)   clearInterval(dotsRef.current);
      setLoadingPhrase(LOADING_PHRASES[0]); setDots('');
    }
    return () => { if (phraseRef.current) clearInterval(phraseRef.current); if (dotsRef.current) clearInterval(dotsRef.current); };
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (!endOfWeek) return;
    if (weekTrades.length < 3) { setGenerateError(`You need at least 3 trades this week. You have ${weekTrades.length}.`); return; }
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateWeeklyBriefing(weekTrades);
      if (result.startsWith('⚠️') || result.startsWith('🔑') || result.startsWith('⏱️') || result.startsWith('Insufficient')) {
        setGenerateError(result);
        return;
      }
      const now = new Date().toISOString();
      const cached: CachedInsight = { weekKey: currentWeekKey, content: result, generatedAt: now, tradeCount: weekTrades.length };
      await saveInsightToSupabase(cached);
      localStorage.setItem('tf_weekly_insight', JSON.stringify(cached));
      setInsight(result); setCachedWeek(currentWeekKey); setGeneratedAt(now);
    } catch (err: any) {
      setGenerateError(err?.message || 'Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const weekStats = weekTrades.length >= 3 ? (() => { try { return buildWeeklyPayload(weekTrades); } catch { return null; } })() : null;
  const formattedDate = generatedAt ? new Date(generatedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-700">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-black tracking-tighter uppercase leading-none">Cognitive Terminal</h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Weekly Performance Synthesis</p>
        </div>
        <div className="flex bg-white/40 backdrop-blur-xl border border-white/60 rounded-full px-5 py-2.5 items-center gap-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${endOfWeek ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[8px] font-black uppercase tracking-widest text-black/60">Gemini 2.0 Flash</span>
          </div>
          <div className="w-px h-3 bg-black/10" />
          <span className="text-[8px] font-black uppercase tracking-widest text-black/60">
            {endOfWeek ? '🟢 Window Open' : '🔒 Opens Friday'}
          </span>
        </div>
      </div>

      {/* Stats bar */}
      {weekStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Trades This Week', value: weekStats.totalTrades },
            { label: 'Win Rate',         value: `${weekStats.winRate.toFixed(0)}%` },
            { label: 'Total P&L',        value: `${weekStats.totalPnL >= 0 ? '+' : ''}$${weekStats.totalPnL.toFixed(0)}` },
            { label: 'Profit Factor',    value: weekStats.profitFactor === 999 ? '∞' : weekStats.profitFactor.toFixed(2) },
          ].map(s => (
            <div key={s.label} className="apple-glass rounded-2xl p-4 text-center border-white/60">
              <div className={`text-xl font-black tracking-tight ${s.label === 'Total P&L' ? weekStats.totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-500' : 'text-black'}`}>{s.value}</div>
              <div className="text-[8px] font-black uppercase tracking-widest text-black/30 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main card */}
      <div className="bg-white/80 backdrop-blur-3xl rounded-2xl border border-white/40 shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-violet-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-60 h-60 bg-blue-500/[0.03] rounded-full blur-[80px] pointer-events-none" />

        {/* Loading cache */}
        {isLoadingCache && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-20">
            <div className="w-8 h-8 border-2 border-black/10 border-t-black/40 rounded-full animate-spin" />
          </div>
        )}

        {/* Generating animation */}
        {!isLoadingCache && isGenerating && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 p-20 animate-in fade-in duration-500 min-h-[480px]">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 rounded-full border-2 border-violet-200 animate-ping opacity-30" />
              <div className="absolute inset-2 rounded-full border-2 border-violet-300 animate-ping opacity-20" style={{ animationDelay: '0.3s' }} />
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200/60 flex items-center justify-center shadow-xl">
                <div className="w-8 h-8 border-2 border-violet-400/40 border-t-violet-600 rounded-full animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-3 max-w-xs">
              <p className="text-sm font-black text-black tracking-tight">{loadingPhrase}{dots}</p>
              <div className="flex justify-center gap-1">
                {LOADING_PHRASES.map((_, i) => (
                  <div key={i} className={`w-1 h-1 rounded-full transition-all duration-300 ${LOADING_PHRASES.indexOf(loadingPhrase) === i ? 'bg-violet-500 scale-125' : 'bg-black/10'}`} />
                ))}
              </div>
              <p className="text-[9px] font-bold text-black/30 uppercase tracking-widest">Analysing {weekTrades.length} trades · Gemini 2.0 Flash</p>
            </div>
          </div>
        )}

        {/* Has insight */}
        {!isLoadingCache && !isGenerating && insight && (
          <div className="flex-1 p-8 md:p-14 animate-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
              <div className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest ${cachedIsThisWeek ? 'bg-emerald-500/10 text-emerald-600' : 'bg-black/5 text-black/40'}`}>
                {cachedIsThisWeek ? `✓ This Week · ${formattedDate}` : `↩ Last Week · ${formattedDate} — New report available`}
              </div>
              {endOfWeek && (
                <button onClick={handleGenerate} disabled={isGenerating || weekTrades.length < 3}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-black/5 hover:bg-black text-black/40 hover:text-white transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  Regenerate
                </button>
              )}
            </div>

            <div className="prose prose-sm max-w-none prose-p:text-[14px] prose-p:font-medium prose-p:leading-relaxed prose-p:text-slate-700 prose-headings:font-black prose-headings:uppercase prose-headings:tracking-widest prose-headings:text-black prose-h3:text-[11px] prose-h3:mt-8 prose-h3:mb-4 prose-h3:text-violet-600 prose-strong:text-black prose-strong:font-black prose-li:text-[14px] prose-li:font-medium prose-li:text-slate-600">
              <div dangerouslySetInnerHTML={{ __html: formatMarkdown(insight) }} />
            </div>

            <div className="mt-12 pt-8 border-t border-black/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 opacity-30">
                <ICONS.Logo className="w-5 h-5" />
                <span className="text-[9px] font-black uppercase tracking-widest">TradeFlow Weekly Audit · {cachedWeek}</span>
              </div>
              <div className="text-[8px] font-black uppercase tracking-widest text-black/20">{weekTrades.length} trades · Gemini 2.0 Flash</div>
            </div>
          </div>
        )}

        {/* No insight */}
        {!isLoadingCache && !isGenerating && !insight && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-8 min-h-[480px]">
            <div className={`w-24 h-24 rounded-2xl flex items-center justify-center transition-all duration-500 ${endOfWeek && weekTrades.length >= 3 ? 'bg-violet-500/10 shadow-lg shadow-violet-500/10' : 'bg-black/[0.03]'}`}>
              <ICONS.AIIntelligence className={`w-10 h-10 transition-colors duration-500 ${endOfWeek && weekTrades.length >= 3 ? 'text-violet-400' : 'text-black/10'}`} />
            </div>
            <div className="max-w-sm space-y-4">
              <h3 className="text-lg font-black uppercase tracking-tight text-black">
                {weekTrades.length < 3 ? 'Keep Trading' : endOfWeek ? 'Ready to Generate' : 'Weekly Synthesis Pending'}
              </h3>
              <p className="text-xs font-semibold text-slate-400 leading-relaxed">
                {weekTrades.length < 3
                  ? `You have ${weekTrades.length} trade${weekTrades.length === 1 ? '' : 's'} this week. Log at least 3 to unlock your AI debrief.`
                  : endOfWeek
                  ? `You have ${weekTrades.length} trades ready for analysis. Hit Generate to get your weekly debrief now.`
                  : `Your generate window opens Friday after market close. You have ${weekTrades.length} trade${weekTrades.length === 1 ? '' : 's'} logged — keep going.`}
              </p>
              {!endOfWeek && weekTrades.length >= 3 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-black/20">Unlocks: {nextFriday}</p>
              )}
            </div>

            <GenerateButton
              endOfWeek={endOfWeek} weekTradeCount={weekTrades.length} nextFriday={nextFriday}
              isGenerating={isGenerating} onClick={handleGenerate}
            />

            {generateError && (
              <div className="max-w-sm w-full bg-rose-50 border border-rose-200 rounded-2xl p-4 animate-in slide-in-from-bottom-2 duration-300">
                <p className="text-[11px] font-bold text-rose-600 leading-relaxed">{generateError}</p>
              </div>
            )}
          </div>
        )}

        {/* Error on regenerate (insight already showing) */}
        {!isLoadingCache && !isGenerating && insight && generateError && (
          <div className="mx-8 mb-6 bg-rose-50 border border-rose-200 rounded-2xl p-4 animate-in slide-in-from-bottom-2 duration-300">
            <p className="text-[11px] font-bold text-rose-600 leading-relaxed">{generateError}</p>
          </div>
        )}
      </div>

      {/* Regenerate button below card when insight exists and window is open */}
      {!isLoadingCache && !isGenerating && insight && endOfWeek && (
        <div className="flex justify-center">
          <GenerateButton variant="compact"
            endOfWeek={endOfWeek} weekTradeCount={weekTrades.length} nextFriday={nextFriday}
            isGenerating={isGenerating} onClick={handleGenerate}
          />
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ProtocolCard accent="violet"
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>}
          title="Weekend Generation"
          desc="The generate button unlocks every Friday after market close and stays active through Sunday — your weekly window to get a fresh AI debrief on demand."
        />
        <ProtocolCard accent="amber"
          icon={<ICONS.Target className="w-4 h-4" />}
          title="3 Trades Minimum"
          desc="You need at least 3 trades logged this week for the AI to produce meaningful analysis. Keep logging daily to build your performance data."
        />
        <ProtocolCard accent="emerald"
          icon={<ICONS.Zap className="w-4 h-4" />}
          title="Saved Instantly"
          desc="Your generated insight is saved to your account in real-time. Access it from any device, any browser — no re-generation needed."
        />
      </div>
    </div>
  );
};

export default AIPage;
