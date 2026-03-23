import React, { useMemo, useState, useEffect } from 'react';
import { Trade } from '../types';

interface Props { trades: Trade[]; userName: string; }

// ── XP & Level System ────────────────────────────────────────────────────────
const LEVELS = [
  { name: 'Recruit',      minXP: 0,     color: '#8896a8' },
  { name: 'Apprentice',   minXP: 200,   color: '#6c83f5' },
  { name: 'Trader',       minXP: 500,   color: '#4a9eff' },
  { name: 'Analyst',      minXP: 1000,  color: '#34d399' },
  { name: 'Strategist',   minXP: 2000,  color: '#f6c547' },
  { name: 'Professional', minXP: 4000,  color: '#fb923c' },
  { name: 'Expert',       minXP: 8000,  color: '#f87171' },
  { name: 'Master',       minXP: 16000, color: '#c084fc' },
  { name: 'Legend',       minXP: 32000, color: '#fbbf24' },
];

const calcXP = (trades: Trade[]) => {
  let xp = 0;
  trades.forEach(t => {
    xp += 10;
    if (t.pnl > 0) xp += 5;
    if (t.followedPlan === true) xp += 4;
    if (t.grade === 'A+') xp += 10;
    else if (t.grade === 'A') xp += 6;
    else if (t.grade === 'B') xp += 3;
    if (t.narrative?.trim().length > 20) xp += 3;
    if (t.tags?.length > 0) xp += 1;
    if (t.psychology?.states?.length > 0) xp += 2;
  });
  return xp;
};

const getLevel = (xp: number) => {
  let lvl = LEVELS[0]; let idx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) { lvl = LEVELS[i]; idx = i; break; }
  }
  const next = LEVELS[idx + 1] || null;
  const progress = next ? ((xp - lvl.minXP) / (next.minXP - lvl.minXP)) * 100 : 100;
  return { level: lvl, index: idx, next, progress: Math.min(progress, 100) };
};

const calcStreaks = (trades: Trade[]) => {
  if (!trades.length) return { current: 0, best: 0, currentWin: 0, bestWin: 0, activeDays: 0 };
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const days = [...new Set(sorted.map(t => t.date))].sort();
  let cur = 1, best = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i] + 'T12:00:00').getTime() - new Date(days[i - 1] + 'T12:00:00').getTime()) / 86400000;
    if (diff <= 1) { cur++; if (cur > best) best = cur; } else cur = 1;
  }
  const gap = (new Date(new Date().toISOString().split('T')[0] + 'T12:00:00').getTime() - new Date(days[days.length - 1] + 'T12:00:00').getTime()) / 86400000;
  const currentStreak = gap <= 1 ? cur : 0;
  const byResult = sorted.map(t => t.pnl > 0);
  let wCur = 0, wBest = 0, wRun = 0;
  byResult.forEach(w => { if (w) { wRun++; if (wRun > wBest) wBest = wRun; } else wRun = 0; });
  for (let i = byResult.length - 1; i >= 0; i--) { if (byResult[i]) wCur++; else break; }
  return { current: currentStreak, best, currentWin: wCur, bestWin: wBest, activeDays: days.length };
};

// ── Achievement Icons ─────────────────────────────────────────────────────────
const AchievementIcons: Record<string, React.FC<{ color: string; size?: number }>> = {
  first_trade:   ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5"/><path d="M8 12h8M12 8v8" stroke={color} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  hat_trick:     ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M5 21h14M12 3l1.5 4.5h4.5l-3.5 2.5 1.5 4.5L12 12l-4 2.5 1.5-4.5L6 7.5h4.5L12 3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  journaler:     ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="12" height="16" rx="2" stroke={color} strokeWidth="1.5"/><path d="M8 7h6M8 11h6M8 15h3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  discipline:    ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 3L4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7l-8-4z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ten_trades:    ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="3" height="9" rx="1" stroke={color} strokeWidth="1.4"/><rect x="8" y="8" width="3" height="13" rx="1" stroke={color} strokeWidth="1.4"/><rect x="13" y="4" width="3" height="17" rx="1" stroke={color} strokeWidth="1.4"/><rect x="18" y="6" width="3" height="15" rx="1" stroke={color} strokeWidth="1.4"/></svg>,
  fifty_trades:  ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5"/><circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill={color}/></svg>,
  century:       ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  five_hundred:  ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_rate_50:   ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M6 16l3-4 3 3 4-6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_rate_65:   ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 17l4-5 4 3 5-7 5 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_rate_75:   ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 21c5 0 9-4 9-9s-4-9-9-9-9 4-9 9 4 9 9 9z" stroke={color} strokeWidth="1.4"/><path d="M9 12.5l2 2 4-4.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  a_game:        ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M6 20l6-16 6 16M8.5 14h7" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  diversified:   ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.4"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke={color} strokeWidth="1.2"/><path d="M3 12h18" stroke={color} strokeWidth="1.2" strokeLinecap="round"/></svg>,
  streak_7:      ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2c-3 5-5 7-5 11a5 5 0 0010 0c0-4-2-6-5-11z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  streak_30:     ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2c-3 5-5 7-5 11a5 5 0 0010 0c0-4-2-6-5-11z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 16c0-2 1-3 2-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/></svg>,
  risk_manager:  ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 3L4 6.5v5.5c0 4.5 3.5 8.7 8 9.7 4.5-1 8-5.2 8-9.7V6.5L12 3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  self_aware:    ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.5"/><path d="M6 20v-1a6 6 0 0112 0v1" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  green_month:   ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2.5" stroke={color} strokeWidth="1.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke={color} strokeWidth="1.4" strokeLinecap="round"/><path d="M8 14l2.5 2.5L16 13" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_streak_5:  ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_streak_10: ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="21" cy="3" r="2" fill={color}/></svg>,
  legend:        ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M5 3h14l2 6-9 12L2 9l3-6z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 3l3 8 3-8M2 9h20" stroke={color} strokeWidth="1.3" strokeLinecap="round"/></svg>,
  perfect_week:  ({ color, size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17.2l-6.2 4.1 2.4-7.4L2 9.4h7.6L12 2z" stroke={color} strokeWidth="1.4" strokeLinejoin="round"/><path d="M9.5 12.5l1.5 1.5 3-3.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ── Achievements ──────────────────────────────────────────────────────────────
interface Achievement {
  id: string; title: string; desc: string; iconKey: string;
  check: (trades: Trade[], stats: any, xp?: number) => boolean;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_trade',   iconKey: 'first_trade',   title: 'First Entry',        desc: 'Log your very first trade',                    rarity: 'common',    check: (t) => t.length >= 1 },
  { id: 'hat_trick',     iconKey: 'hat_trick',      title: 'Hat Trick',          desc: '3 consecutive winning trades',                  rarity: 'common',    check: (_, s) => s.currentWin >= 3 },
  { id: 'journaler',     iconKey: 'journaler',      title: 'The Archivist',      desc: 'Add notes to 10 trades',                       rarity: 'common',    check: (t) => t.filter((x: Trade) => x.narrative?.trim().length > 10).length >= 10 },
  { id: 'discipline',    iconKey: 'discipline',     title: 'Iron Protocol',      desc: 'Follow your plan 10 consecutive times',         rarity: 'rare',      check: (t) => { let r = 0, b = 0; [...t].sort((a: Trade, b: Trade) => a.date.localeCompare(b.date)).forEach((x: Trade) => { if (x.followedPlan === true) { r++; if (r > b) b = r; } else r = 0; }); return b >= 10; } },
  { id: 'ten_trades',    iconKey: 'ten_trades',     title: 'Volume I',           desc: 'Log 10 trades',                                rarity: 'common',    check: (t) => t.length >= 10 },
  { id: 'fifty_trades',  iconKey: 'fifty_trades',   title: 'Volume II',          desc: 'Log 50 trades',                                rarity: 'rare',      check: (t) => t.length >= 50 },
  { id: 'century',       iconKey: 'century',        title: 'Century',            desc: 'Log 100 trades',                               rarity: 'epic',      check: (t) => t.length >= 100 },
  { id: 'five_hundred',  iconKey: 'five_hundred',   title: 'Five Hundred',       desc: 'Log 500 trades',                               rarity: 'legendary', check: (t) => t.length >= 500 },
  { id: 'win_rate_50',   iconKey: 'win_rate_50',    title: 'Edge Confirmed',     desc: '50%+ win rate across 20+ trades',              rarity: 'common',    check: (t) => t.length >= 20 && t.filter((x: Trade) => x.pnl > 0).length / t.length >= 0.5 },
  { id: 'win_rate_65',   iconKey: 'win_rate_65',    title: 'High Precision',     desc: '65%+ win rate across 30+ trades',              rarity: 'rare',      check: (t) => t.length >= 30 && t.filter((x: Trade) => x.pnl > 0).length / t.length >= 0.65 },
  { id: 'win_rate_75',   iconKey: 'win_rate_75',    title: 'Marksman',           desc: '75%+ win rate across 50+ trades',              rarity: 'epic',      check: (t) => t.length >= 50 && t.filter((x: Trade) => x.pnl > 0).length / t.length >= 0.75 },
  { id: 'a_game',        iconKey: 'a_game',         title: 'Grade A',            desc: 'Log 10 A+ grade trades',                       rarity: 'rare',      check: (t) => t.filter((x: Trade) => x.grade === 'A+').length >= 10 },
  { id: 'diversified',   iconKey: 'diversified',    title: 'Multi-Market',       desc: 'Trade 5+ different instruments',               rarity: 'common',    check: (t) => new Set(t.map((x: Trade) => x.symbol)).size >= 5 },
  { id: 'streak_7',      iconKey: 'streak_7',       title: 'One Week Solid',     desc: 'Maintain a 7-day trading streak',              rarity: 'rare',      check: (_, s) => s.best >= 7 },
  { id: 'streak_30',     iconKey: 'streak_30',      title: 'Monthly Discipline', desc: '30-day consecutive trading streak',            rarity: 'epic',      check: (_, s) => s.best >= 30 },
  { id: 'risk_manager',  iconKey: 'risk_manager',   title: 'Risk Protocol',      desc: '20+ trades with R:R ≥ 2.0',                   rarity: 'rare',      check: (t) => t.filter((x: Trade) => Number(x.rr) >= 2).length >= 20 },
  { id: 'self_aware',    iconKey: 'self_aware',     title: 'Self Aware',         desc: 'Log emotional state on 20 trades',             rarity: 'rare',      check: (t) => t.filter((x: Trade) => x.psychology?.states?.length > 0).length >= 20 },
  { id: 'green_month',   iconKey: 'green_month',    title: 'Green Month',        desc: 'Close any calendar month in profit',           rarity: 'epic',      check: (t) => { const m: Record<string, number> = {}; t.forEach((x: Trade) => { const k = x.date.slice(0, 7); m[k] = (m[k] || 0) + (Number(x.pnl) || 0); }); return Object.values(m).some(v => v > 0); } },
  { id: 'win_streak_5',  iconKey: 'win_streak_5',   title: 'Five Alive',         desc: '5 consecutive winning trades',                 rarity: 'rare',      check: (_, s) => s.bestWin >= 5 },
  { id: 'win_streak_10', iconKey: 'win_streak_10',  title: 'Unstoppable',        desc: '10 consecutive winning trades',                rarity: 'epic',      check: (_, s) => s.bestWin >= 10 },
  { id: 'legend',        iconKey: 'legend',         title: 'Legend Rank',        desc: 'Reach the Legend rank',                        rarity: 'legendary', check: (_, __, xp = 0) => xp >= 32000 },
  { id: 'perfect_week',  iconKey: 'perfect_week',   title: 'Flawless Week',      desc: '5+ winning trades in a single week, 0 losses', rarity: 'legendary', check: (t) => { const w: Record<string, { wn: number; l: number }> = {}; t.forEach((x: Trade) => { const d = new Date(x.date + 'T12:00:00'); const k = `${d.getFullYear()}-${Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 604800000)}`; if (!w[k]) w[k] = { wn: 0, l: 0 }; if (x.pnl > 0) w[k].wn++; else w[k].l++; }); return Object.values(w).some(v => v.wn >= 5 && v.l === 0); } },
];

const RARITY = {
  common:    { grad: 'linear-gradient(135deg,#64748b,#475569)', glow: 'none',                              border: 'rgba(100,116,139,0.4)' },
  rare:      { grad: 'linear-gradient(135deg,#f59e0b,#d97706)', glow: '0 0 16px rgba(245,158,11,0.35)',    border: 'rgba(245,158,11,0.5)'  },
  epic:      { grad: 'linear-gradient(135deg,#7c3aed,#6d28d9)', glow: '0 0 18px rgba(124,58,237,0.4)',     border: 'rgba(124,58,237,0.5)'  },
  legendary: { grad: 'linear-gradient(135deg,#f59e0b,#ef4444)', glow: '0 0 22px rgba(251,191,36,0.45)',    border: 'rgba(251,191,36,0.6)'  },
};

// ── Weekly Missions ───────────────────────────────────────────────────────────
const getWeeklyMissions = (trades: Trade[]) => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const wt = trades.filter(t => new Date(t.date + 'T12:00:00') >= start);
  const wr = wt.length > 0 ? (wt.filter(t => t.pnl > 0).length / wt.length) * 100 : 0;
  return [
    { id: 'c1', title: 'Active Trader',   desc: 'Log 5 trades this week',      goal: 5,  cur: wt.length,                                          xp: 50 },
    { id: 'c2', title: 'Accuracy Target', desc: 'Hit 55%+ win rate this week', goal: 55, cur: Math.round(wr),                                     xp: 75, isPercent: true },
    { id: 'c3', title: 'Full Journal',    desc: 'Add notes to 5 trades',       goal: 5,  cur: wt.filter(t => t.narrative?.trim().length > 10).length, xp: 60 },
    { id: 'c4', title: 'Rule-Based',      desc: 'Follow your plan on 5 trades',goal: 5,  cur: wt.filter(t => t.followedPlan).length,               xp: 65 },
  ];
};

// ── XP per action rows (for Missions tab) ────────────────────────────────────
const XP_ACTIONS = [
  { label: 'Log a trade',    xp: '+10', color: '#34d399', icon: 'M12 4v16M4 12h16' },
  { label: 'Winning trade',  xp: '+5',  color: '#34d399', icon: 'M3 17l4-5 4 3 5-7 5 4' },
  { label: 'Followed plan',  xp: '+4',  color: '#6c83f5', icon: 'M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'A+ grade trade', xp: '+10', color: '#fb923c', icon: 'M6 20l6-16 6 16M8.5 14h7' },
  { label: 'Added narrative',xp: '+3',  color: '#6c83f5', icon: 'M4 6h16M4 10h16M4 14h10' },
  { label: 'Tagged trade',   xp: '+1',  color: '#f6c547', icon: 'M7 7h.01M7 3h5l8.5 8.5a1.5 1.5 0 010 2.1L15 19a1.5 1.5 0 01-2.1 0L4 12V7a4 4 0 014-4z' },
];

// ── Animated counter ──────────────────────────────────────────────────────────
const AnimCounter: React.FC<{ value: number }> = ({ value }) => {
  const [d, setD] = useState(0);
  useEffect(() => {
    let v = 0;
    const step = value / 75;
    const id = setInterval(() => { v += step; if (v >= value) { setD(value); clearInterval(id); } else setD(Math.floor(v)); }, 16);
    return () => clearInterval(id);
  }, [value]);
  return <>{d}</>;
};

// ── Circular progress ring (for mission cards) ────────────────────────────────
const RingProgress: React.FC<{ pct: number; done: boolean }> = ({ pct, done }) => {
  const r = 22, circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <div className="relative flex-shrink-0" style={{ width: 56, height: 56 }}>
      <svg width={56} height={56} viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="3" />
        <circle cx="28" cy="28" r={r} fill="none"
          stroke={done ? '#34d399' : '#1a1a2e'}
          strokeWidth="3"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {done
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : <span className="text-[10px] font-black text-black/40">{Math.round(pct)}%</span>
        }
      </div>
    </div>
  );
};

// ── Badge circle ──────────────────────────────────────────────────────────────
const BadgeCircle: React.FC<{ a: Achievement & { unlocked: boolean }; size?: number; dark?: boolean }> = ({ a, size = 56, dark = false }) => {
  const rs = RARITY[a.rarity];
  const Icon = AchievementIcons[a.iconKey];
  const iSz = Math.round(size * 0.42);
  if (!a.unlocked) {
    const bg = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const stroke = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)';
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={iSz} height={iSz} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="11" width="18" height="11" rx="2" stroke={stroke} strokeWidth="1.8" />
          <path d="M7 11V7a5 5 0 0110 0v4" stroke={stroke} strokeWidth="1.8" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: rs.grad, boxShadow: rs.glow, border: `1.5px solid ${rs.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {Icon && <Icon color="rgba(255,255,255,0.92)" size={iSz} />}
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const Gamification: React.FC<Props> = ({ trades, userName }) => {
  const [tab, setTab] = useState<'overview' | 'badges' | 'missions'>('overview');

  const xp           = useMemo(() => calcXP(trades), [trades]);
  const lvl          = useMemo(() => getLevel(xp), [xp]);
  const streaks      = useMemo(() => calcStreaks(trades), [trades]);
  const missions     = useMemo(() => getWeeklyMissions(trades), [trades]);
  const achievements = useMemo(() =>
    ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.check(trades, streaks, xp) }))
      .sort((a, b) => {
        if (a.unlocked && !b.unlocked) return -1;
        if (!a.unlocked && b.unlocked) return 1;
        return ({ legendary: 0, epic: 1, rare: 2, common: 3 }[a.rarity]) - ({ legendary: 0, epic: 1, rare: 2, common: 3 }[b.rarity]);
      }),
    [trades, streaks, xp]);

  const unlocked  = achievements.filter(a => a.unlocked).length;
  const locked    = achievements.filter(a => !a.unlocked).length;
  const epicCount = achievements.filter(a => a.unlocked && a.rarity === 'epic').length;
  const rareCount = achievements.filter(a => a.unlocked && a.rarity === 'rare').length;
  const winRate   = trades.length > 0 ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100 : 0;
  const wins      = trades.filter(t => t.pnl > 0).length;
  const discPct   = trades.length > 0 ? (trades.filter(t => t.followedPlan === true).length / trades.length) * 100 : 0;

  const circ      = 2 * Math.PI * 52;
  const dashOff   = circ - (lvl.progress / 100) * circ;

  // ── Shared: dark hero card (same on all tabs) ─────────────────────────────
  const HeroCard = (
    <div className="rounded-[2rem] overflow-hidden"
      style={{ background: 'linear-gradient(145deg,#080810 0%,#10101e 55%,#080c14 100%)', border: `1px solid ${lvl.level.color}20` }}>

      {/* Hero body */}
      <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
        {/* Level ring */}
        <div className="relative flex-shrink-0" style={{ width: 128, height: 128 }}>
          {/* Outer decorative ring */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r="58" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="2" strokeDasharray="4 6" />
          </svg>
          {/* Progress ring */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120" style={{ left: 4, top: 4, width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            <circle cx="60" cy="60" r="52" fill="none"
              stroke={lvl.level.color} strokeWidth="8"
              strokeDasharray={circ} strokeDashoffset={dashOff}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1.8s cubic-bezier(0.34,1.56,0.64,1)', filter: `drop-shadow(0 0 8px ${lvl.level.color})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-black text-white leading-none">{lvl.index + 1}</span>
            <span className="text-[9px] font-black uppercase tracking-[0.22em] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>LVL</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-3 text-center sm:text-left">
          {/* Legend dots */}
          <div className="flex items-center justify-center sm:justify-start gap-4">
            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /><span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{streaks.current}d streak</span></div>
            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-400" /><span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{winRate.toFixed(0)}% win rate</span></div>
            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-orange-400" /><span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{xp} level xp</span></div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{userName}</h2>

          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em]"
              style={{ background: `${lvl.level.color}18`, color: lvl.level.color, border: `1px solid ${lvl.level.color}35` }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={lvl.level.color} strokeWidth="2" /></svg>
              {lvl.level.name}
            </span>
          </div>

          {/* XP progress bar */}
          <div className="max-w-xs mx-auto sm:mx-0">
            <div className="flex justify-between mb-1.5">
              <span className="text-[8px] font-bold text-white/25">{xp} XP</span>
              {lvl.next && <span className="text-[8px] font-bold text-white/20">{(lvl.next.minXP - xp).toLocaleString()} to {lvl.next.name}</span>}
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${lvl.progress}%`, background: `linear-gradient(90deg,${lvl.level.color},${lvl.next?.color || lvl.level.color})`, transition: 'width 1.5s ease', boxShadow: `0 0 8px ${lvl.level.color}80` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 border-t border-white/[0.05]">
        {[
          { val: trades.length, label: 'TRADES' },
          { val: `${wins}/${trades.length}`, label: 'BADGES', raw: true },
          { val: streaks.best, label: 'BEST STREAK', suffix: 'd' },
          { val: winRate.toFixed(0), label: 'WIN RATE', suffix: '%', raw: true },
        ].map((s, i) => (
          <div key={i} className="py-4 flex flex-col items-center gap-1 border-r border-white/[0.05] last:border-r-0">
            <span className="text-xl sm:text-2xl font-black text-white leading-none">
              {s.raw ? s.val : <AnimCounter value={Number(s.val)} />}{s.suffix || ''}
            </span>
            <span className="text-[7px] font-bold text-white/25 uppercase tracking-[0.15em]">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const TabBar = (
    <div className="flex p-1 rounded-2xl border border-black/[0.06]" style={{ background: 'rgba(0,0,0,0.04)' }}>
      {([
        { k: 'overview', label: 'Overview' },
        { k: 'badges',   label: 'Badges'   },
        { k: 'missions', label: 'Missions' },
      ] as const).map(({ k, label }) => (
        <button key={k} onClick={() => setTab(k)}
          className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.14em] transition-all"
          style={tab === k
            ? { background: '#000', color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }
            : { color: 'rgba(0,0,0,0.3)' }}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3 pb-20 animate-in fade-in duration-500">
      {HeroCard}
      {TabBar}

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-3 animate-in fade-in duration-300">

          {/* 2×2 stat cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2c-3 5-5 7-5 11a5 5 0 0010 0c0-4-2-6-5-11z" stroke="#fb923c" strokeWidth="1.7" strokeLinejoin="round"/></svg>, label: 'ACTIVE STREAK', value: streaks.current, suffix: 'DAYS', color: '#fb923c', sub: streaks.current === 0 ? 'Log today to start' : streaks.current >= 7 ? 'On fire!' : `${streaks.best}d best` },
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#34d399" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>, label: 'WIN STREAK', value: streaks.currentWin, suffix: 'W', color: '#34d399', sub: 'Current consecutive' },
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 17l4-5 4 3 5-7 5 4" stroke="#6c83f5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>, label: 'WIN RATE', value: Math.round(winRate), suffix: '%', color: '#6c83f5', sub: `${wins} wins total` },
              { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3L4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7l-8-4z" stroke="#c084fc" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="#c084fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>, label: 'DISCIPLINE', value: Math.round(discPct), suffix: '%', color: '#c084fc', sub: 'Plan adherence' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-[1.6rem] p-5 border border-black/[0.05]">
                <div className="mb-3">{c.icon}</div>
                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-black/35 mb-2">{c.label}</p>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-4xl font-black leading-none" style={{ color: c.color }}>{c.value}</span>
                  <span className="text-sm font-black text-black/25">{c.suffix}</span>
                </div>
                <p className="text-[9px] font-medium text-black/30">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Rank Ladder */}
          <div className="bg-white rounded-[1.6rem] p-5 sm:p-6 border border-black/[0.05]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[8px] font-black uppercase tracking-[0.22em] text-black/30">Rank Ladder</h3>
              <span className="text-[8px] font-black text-black/25">{lvl.index + 1}/{LEVELS.length}</span>
            </div>
            <div className="relative">
              <div className="absolute top-[20px] left-5 right-5 h-[2px] rounded-full bg-black/[0.06]" />
              <div className="absolute top-[20px] left-5 h-[2px] rounded-full transition-all duration-1000"
                style={{ width: `${Math.max(0, (lvl.index / (LEVELS.length - 1)) * 100)}%`, maxWidth: 'calc(100% - 40px)', background: `linear-gradient(90deg,${LEVELS[0].color},${lvl.level.color})`, boxShadow: `0 0 6px ${lvl.level.color}80` }} />
              <div className="flex justify-between relative z-10">
                {LEVELS.map((l, i) => {
                  const reached = i <= lvl.index, isCur = i === lvl.index;
                  return (
                    <div key={l.name} className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
                        style={{ background: reached ? l.color : 'rgba(0,0,0,0.06)', boxShadow: isCur ? `0 0 0 3px #fff,0 0 0 5px ${l.color},0 0 18px ${l.color}60` : 'none', transform: isCur ? 'scale(1.12)' : 'scale(1)' }}>
                        <span className="text-[10px] font-black" style={{ color: reached ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.15)' }}>{i + 1}</span>
                      </div>
                      <span className="text-[6px] font-black uppercase tracking-wide hidden sm:block" style={{ color: reached ? l.color : 'rgba(0,0,0,0.2)' }}>{l.name.slice(0, 5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {lvl.next && (
              <p className="text-[10px] font-medium text-black/30 text-center mt-5">
                <span className="font-black text-black/50">{(lvl.next.minXP - xp).toLocaleString()} XP</span> to unlock{' '}
                <span className="font-black" style={{ color: lvl.next.color }}>{lvl.next.name}</span>
              </p>
            )}
          </div>

          {/* Recent Badges */}
          {unlocked > 0 && (
            <div className="bg-white rounded-[1.6rem] p-5 border border-black/[0.05]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[8px] font-black uppercase tracking-[0.22em] text-black/30">Recent Badges</h3>
                <button className="text-[8px] font-black text-black/25 uppercase tracking-widest hover:text-black/50 transition-colors" onClick={() => setTab('badges')}>See All →</button>
              </div>
              <div className="flex gap-5 overflow-x-auto no-scrollbar pb-1">
                {achievements.filter(a => a.unlocked).slice(0, 8).map(a => (
                  <div key={a.id} className="flex-shrink-0 flex flex-col items-center gap-2">
                    <BadgeCircle a={a} size={52} />
                    <p className="text-[7px] font-black uppercase tracking-wide text-center text-black/35 w-14 leading-tight">{a.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BADGES ───────────────────────────────────────────────────────── */}
      {tab === 'badges' && (
        <div className="space-y-3 animate-in fade-in duration-300">

          {/* Summary bar */}
          <div className="bg-white rounded-[1.4rem] border border-black/[0.05]">
            <div className="grid grid-cols-4 divide-x divide-black/[0.05]">
              {[
                { v: unlocked,  l: 'Earned', c: '#34d399' },
                { v: locked,    l: 'Locked',  c: 'rgba(0,0,0,0.3)' },
                { v: epicCount, l: 'Epic',    c: '#c084fc' },
                { v: rareCount, l: 'Rare',    c: '#f59e0b' },
              ].map(s => (
                <div key={s.l} className="py-4 flex flex-col items-center gap-1">
                  <span className="text-xl font-black leading-none" style={{ color: s.c }}>{s.v}</span>
                  <span className="text-[7px] font-black uppercase tracking-[0.16em] text-black/25">{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Earned — dark background */}
          {unlocked > 0 && (
            <div className="rounded-[1.6rem] overflow-hidden" style={{ background: 'linear-gradient(145deg,#080810,#10101e)' }}>
              <div className="px-5 pt-5 pb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Earned — {unlocked} Badges</span>
              </div>
              <div className="px-5 pb-5 grid grid-cols-5 gap-4">
                {achievements.filter(a => a.unlocked).map(a => (
                  <div key={a.id} className="flex flex-col items-center gap-1.5">
                    <BadgeCircle a={a} size={52} dark />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locked — light background */}
          {locked > 0 && (
            <div className="bg-white rounded-[1.6rem] border border-black/[0.05]">
              <div className="px-5 pt-5 pb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-black/20" />
                <span className="text-[8px] font-black text-black/30 uppercase tracking-[0.2em]">Locked — {locked} Badges</span>
              </div>
              <div className="px-5 pb-5 grid grid-cols-5 gap-4">
                {achievements.filter(a => !a.unlocked).map(a => (
                  <div key={a.id} className="flex flex-col items-center gap-2">
                    <BadgeCircle a={a} size={52} />
                    <p className="text-[7px] font-medium text-black/30 text-center leading-tight w-14">{a.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MISSIONS ─────────────────────────────────────────────────────── */}
      {tab === 'missions' && (
        <div className="space-y-3 animate-in fade-in duration-300">

          {/* Header */}
          <div className="flex items-start justify-between px-1">
            <div>
              <p className="text-[10px] font-black text-black/40 uppercase tracking-[0.2em]">Weekly Missions</p>
              <p className="text-[9px] font-medium text-black/25 mt-0.5">Resets every Sunday</p>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-black text-white">This Week</span>
          </div>

          {/* Mission cards */}
          {missions.map(ch => {
            const pct = (ch.cur / ch.goal) * 100;
            const done = ch.cur >= ch.goal;
            return (
              <div key={ch.id} className="bg-white rounded-[1.6rem] p-5 border border-black/[0.05] flex items-center gap-4 relative overflow-hidden">
                {done && <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 90% 50%,rgba(52,211,153,0.06),transparent 60%)' }} />}
                {/* Circular progress */}
                <RingProgress pct={pct} done={done} />
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-black leading-tight">{ch.title}</p>
                  <p className="text-[9px] font-medium text-black/35 mt-0.5">{ch.desc}</p>
                </div>
                {/* XP */}
                <span className="text-sm font-black shrink-0" style={{ color: done ? '#34d399' : 'rgba(0,0,0,0.2)' }}>
                  {done ? '✓' : `+${ch.xp}`}
                </span>
              </div>
            );
          })}

          {/* XP per action */}
          <div className="bg-white rounded-[1.6rem] p-5 border border-black/[0.05]">
            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-black/30 mb-4">XP Per Action</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {XP_ACTIONS.map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d={row.icon} stroke={row.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[9px] font-medium text-black/50">{row.label}</span>
                  </div>
                  <span className="text-[10px] font-black" style={{ color: row.color }}>{row.xp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gamification;
