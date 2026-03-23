import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trade } from '../types';

interface Props { trades: Trade[]; userName: string; }

// ── XP & Level System ──────────────────────────────────────────────────────────
const LEVELS = [
  { name: 'Recruit',      minXP: 0,     color: '#8896a8', ring1: '#8896a8', ring2: '#60708a', ring3: '#4a5568' },
  { name: 'Apprentice',   minXP: 200,   color: '#6c83f5', ring1: '#6c83f5', ring2: '#4a9eff', ring3: '#38bdf8' },
  { name: 'Trader',       minXP: 500,   color: '#4a9eff', ring1: '#4a9eff', ring2: '#06b6d4', ring3: '#0ea5e9' },
  { name: 'Analyst',      minXP: 1000,  color: '#34d399', ring1: '#34d399', ring2: '#10b981', ring3: '#059669' },
  { name: 'Strategist',   minXP: 2000,  color: '#f6c547', ring1: '#f6c547', ring2: '#fb923c', ring3: '#f97316' },
  { name: 'Professional', minXP: 4000,  color: '#fb923c', ring1: '#fb923c', ring2: '#f43f5e', ring3: '#ef4444' },
  { name: 'Expert',       minXP: 8000,  color: '#f87171', ring1: '#f87171', ring2: '#fb7185', ring3: '#f43f5e' },
  { name: 'Master',       minXP: 16000, color: '#c084fc', ring1: '#c084fc', ring2: '#a78bfa', ring3: '#818cf8' },
  { name: 'Legend',       minXP: 32000, color: '#fbbf24', ring1: '#fbbf24', ring2: '#f59e0b', ring3: '#fcd34d' },
];

const calcXP = (trades: Trade[]) => {
  let xp = 0;
  trades.forEach(t => {
    xp += 10;
    if (t.pnl > 0) xp += 5;
    if (t.followedPlan === true) xp += 4;
    if ((t as any).resultGrade === 'A+') xp += 10;
    else if ((t as any).resultGrade === 'A') xp += 6;
    else if ((t as any).resultGrade === 'B') xp += 3;
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
    const diff = (new Date(days[i]+'T12:00:00').getTime() - new Date(days[i-1]+'T12:00:00').getTime()) / 86400000;
    if (diff <= 1) { cur++; if (cur > best) best = cur; } else cur = 1;
  }
  const gapDays = (new Date(new Date().toISOString().split('T')[0]+'T12:00:00').getTime() - new Date(days[days.length-1]+'T12:00:00').getTime()) / 86400000;
  const currentStreak = gapDays <= 1 ? cur : 0;
  const byResult = sorted.map(t => t.pnl > 0);
  let wCur = 0, wBest = 0, wRun = 0;
  byResult.forEach(w => { if (w) { wRun++; if (wRun > wBest) wBest = wRun; } else wRun = 0; });
  for (let i = byResult.length - 1; i >= 0; i--) { if (byResult[i]) wCur++; else break; }
  return { current: currentStreak, best, currentWin: wCur, bestWin: wBest, activeDays: days.length };
};

// ── Animated Counter ───────────────────────────────────────────────────────────
const AnimCounter: React.FC<{value: number; duration?: number}> = ({ value, duration = 1200 }) => {
  const [d, setD] = useState(0);
  useEffect(() => {
    let v = 0; const step = value / (duration / 16);
    const id = setInterval(() => { v += step; if (v >= value) { setD(value); clearInterval(id); } else setD(Math.floor(v)); }, 16);
    return () => clearInterval(id);
  }, [value, duration]);
  return <>{d.toLocaleString()}</>;
};

// ── Three Activity Rings (Apple Watch style) ───────────────────────────────────
const ThreeRings: React.FC<{
  streakPct: number; winRatePct: number; xpPct: number;
  ring1: string; ring2: string; ring3: string; level: number;
}> = ({ streakPct, winRatePct, xpPct, ring1, ring2, ring3, level }) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 150); return () => clearTimeout(t); }, []);

  const cx = 120, cy = 120;
  // Outer ring r=90, middle r=70, inner r=50 — inner ring ends at r=45 from center
  // Center text sits at cy, well inside inner ring (r=50, strokeW=10 → inner edge at r=45)
  const rings = [
    { r: 90, pct: streakPct,  color: ring1, id: 'r1' },
    { r: 70, pct: winRatePct, color: ring2, id: 'r2' },
    { r: 50, pct: xpPct,      color: ring3, id: 'r3' },
  ];

  return (
    <svg viewBox="0 0 240 240" className="w-full h-full">
      <defs>
        {rings.map(ring => (
          <filter key={`f_${ring.id}`} id={`glow_${ring.id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        ))}
      </defs>

      {/* Track circles */}
      {rings.map(ring => (
        <circle key={`track_${ring.id}`} cx={cx} cy={cy} r={ring.r}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12"/>
      ))}

      {/* Progress arcs */}
      {rings.map((ring, i) => {
        const circ = 2 * Math.PI * ring.r;
        const offset = circ - (animated ? Math.min(ring.pct / 100, 1) : 0) * circ;
        return (
          <circle key={`arc_${ring.id}`} cx={cx} cy={cy} r={ring.r}
            fill="none" stroke={ring.color} strokeWidth="12"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            filter={`url(#glow_${ring.id})`}
            style={{ transition: `stroke-dashoffset ${1.8 - i * 0.2}s cubic-bezier(0.34,1.1,0.64,1) ${i * 0.15}s` }}
          />
        );
      })}

      {/* Center — sits inside inner ring (r=50 → inner edge at ~38), text well clear */}
      <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
        fill="white" fontSize="34" fontWeight="900" fontFamily="-apple-system, system-ui">{level}</text>
      <text x={cx} y={cy + 18} textAnchor="middle"
        fill="rgba(255,255,255,0.35)" fontSize="11" fontWeight="800"
        fontFamily="-apple-system, system-ui" letterSpacing="4">LVL</text>
    </svg>
  );
};

// ── Premium Badge SVG icons ────────────────────────────────────────────────────
const Icons: Record<string, (c: string, s: number) => React.ReactNode> = {
  first_trade:   (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5"/><path d="M8 12h8M12 8v8" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>,
  hat_trick:     (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M5 21h14M12 3l1.5 4.5h4.5l-3.5 2.5 1.5 4.5L12 12l-4 2.5 1.5-4.5L6 7.5h4.5L12 3z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  journaler:     (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="14" height="18" rx="2" stroke={c} strokeWidth="1.5"/><path d="M8 7h8M8 11h8M8 15h5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  discipline:    (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 3L4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7l-8-4z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ten_trades:    (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="3" height="9" rx="1" stroke={c} strokeWidth="1.4"/><rect x="8" y="8" width="3" height="13" rx="1" stroke={c} strokeWidth="1.4"/><rect x="13" y="4" width="3" height="17" rx="1" stroke={c} strokeWidth="1.4"/><rect x="18" y="6" width="3" height="15" rx="1" stroke={c} strokeWidth="1.4"/></svg>,
  fifty_trades:  (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="5" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill={c}/></svg>,
  century:       (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  five_hundred:  (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_rate_50:   (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M6 16l3-4 3 3 4-6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_rate_65:   (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M3 17l4-5 4 3 5-7 5 4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_rate_75:   (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.4"/><path d="M9 12.5l2 2 4-4.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  a_game:        (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M6 20l6-16 6 16M8.5 14h7" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  diversified:   (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.4"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke={c} strokeWidth="1.2"/><path d="M3 12h18" stroke={c} strokeWidth="1.2" strokeLinecap="round"/></svg>,
  streak_7:      (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2c-3 5-5 7-5 11a5 5 0 0010 0c0-4-2-6-5-11z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  streak_30:     (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2c-3 5-5 7-5 11a5 5 0 0010 0c0-4-2-6-5-11z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 16c0-2 1-3 2-4" stroke={c} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/></svg>,
  risk_manager:  (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 3L4 6.5v5.5c0 4.5 3.5 8.7 8 9.7 4.5-1 8-5.2 8-9.7V6.5L12 3z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  self_aware:    (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={c} strokeWidth="1.5"/><path d="M6 20v-1a6 6 0 0112 0v1" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>,
  green_month:   (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2.5" stroke={c} strokeWidth="1.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke={c} strokeWidth="1.4" strokeLinecap="round"/><path d="M8 14l2.5 2.5L16 13" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_streak_5:  (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  win_streak_10: (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="21" cy="3" r="2" fill={c}/></svg>,
  legend:        (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M5 3h14l2 6-9 12L2 9l3-6z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 3l3 8 3-8M2 9h20" stroke={c} strokeWidth="1.3" strokeLinecap="round"/></svg>,
  perfect_week:  (c,s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17.2l-6.2 4.1 2.4-7.4L2 9.4h7.6L12 2z" stroke={c} strokeWidth="1.4" strokeLinejoin="round"/><path d="M9.5 12.5l1.5 1.5 3-3.5" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ── Rarity styling ─────────────────────────────────────────────────────────────
const RARITY = {
  common:    { grad: ['#a0aec0','#718096','#4a5568'], bg: '#15181f', glow: 'rgba(160,174,192,0.3)', label: 'COMMON',    xp: 100,  labelColor: '#a0aec0' },
  rare:      { grad: ['#fbbf24','#f59e0b','#d97706'], bg: '#1a1810', glow: 'rgba(251,191,36,0.45)', label: 'RARE',      xp: 250,  labelColor: '#fbbf24' },
  epic:      { grad: ['#a78bfa','#7c3aed','#6d28d9'], bg: '#110e1e', glow: 'rgba(167,139,250,0.5)', label: 'EPIC',      xp: 600,  labelColor: '#a78bfa' },
  legendary: { grad: ['#fbbf24','#f97316','#ef4444','#fbbf24'], bg: '#1a1208', glow: 'rgba(251,191,36,0.6)', label: 'LEGENDARY', xp: 1500, labelColor: '#fbbf24' },
};

// ── Achievement definitions ────────────────────────────────────────────────────
interface Achievement {
  id: string; title: string; desc: string; iconKey: string;
  check: (trades: Trade[], stats: any, xp?: number) => boolean;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

const ACHIEVEMENTS: Achievement[] = [
  { id:'first_trade',   iconKey:'first_trade',   title:'First Entry',        desc:'Log your very first trade',                     rarity:'common',    check:(t)=>t.length>=1 },
  { id:'ten_trades',    iconKey:'ten_trades',     title:'Volume I',           desc:'Log 10 trades',                                 rarity:'common',    check:(t)=>t.length>=10 },
  { id:'journaler',     iconKey:'journaler',      title:'The Archivist',      desc:'Add notes to 10 trades',                        rarity:'common',    check:(t)=>t.filter(x=>x.narrative?.trim().length>10).length>=10 },
  { id:'fifty_trades',  iconKey:'fifty_trades',   title:'Volume II',          desc:'Log 50 trades',                                 rarity:'common',    check:(t)=>t.length>=50 },
  { id:'win_rate_50',   iconKey:'win_rate_50',    title:'Edge Confirmed',     desc:'50%+ win rate across 20+ trades',               rarity:'common',    check:(t)=>t.length>=20&&t.filter(x=>x.pnl>0).length/t.length>=0.5 },
  { id:'diversified',   iconKey:'diversified',    title:'Multi-Market',       desc:'Trade 5+ different instruments',                rarity:'common',    check:(t)=>new Set(t.map(x=>x.symbol)).size>=5 },
  { id:'hat_trick',     iconKey:'hat_trick',      title:'Hat Trick',          desc:'3 consecutive winning trades',                  rarity:'common',    check:(_,s)=>s.currentWin>=3 },
  { id:'discipline',    iconKey:'discipline',     title:'Iron Protocol',      desc:'Follow your plan 10 consecutive times',         rarity:'rare',      check:(t)=>{let r=0,b=0;[...t].sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{if(x.followedPlan===true){r++;if(r>b)b=r;}else r=0;});return b>=10;} },
  { id:'win_rate_65',   iconKey:'win_rate_65',    title:'High Precision',     desc:'65%+ win rate across 30+ trades',               rarity:'rare',      check:(t)=>t.length>=30&&t.filter(x=>x.pnl>0).length/t.length>=0.65 },
  { id:'risk_manager',  iconKey:'risk_manager',   title:'Risk Protocol',      desc:'20+ trades with R:R ≥ 2.0',                    rarity:'rare',      check:(t)=>t.filter(x=>Number(x.rr)>=2).length>=20 },
  { id:'a_game',        iconKey:'a_game',         title:'Grade A',            desc:'Log 10 A+ grade trades',                        rarity:'rare',      check:(t)=>t.filter(x=>(x as any).resultGrade==='A+').length>=10 },
  { id:'streak_7',      iconKey:'streak_7',       title:'One Week Solid',     desc:'Maintain a 7-day trading streak',               rarity:'rare',      check:(_,s)=>s.best>=7 },
  { id:'self_aware',    iconKey:'self_aware',     title:'Self Aware',         desc:'Log emotional state on 20 trades',              rarity:'rare',      check:(t)=>t.filter(x=>x.psychology?.states?.length>0).length>=20 },
  { id:'win_streak_5',  iconKey:'win_streak_5',   title:'Five Alive',         desc:'5 consecutive winning trades',                  rarity:'rare',      check:(_,s)=>s.bestWin>=5 },
  { id:'century',       iconKey:'century',        title:'Century',            desc:'Log 100 trades',                                rarity:'epic',      check:(t)=>t.length>=100 },
  { id:'win_rate_75',   iconKey:'win_rate_75',    title:'Marksman',           desc:'75%+ win rate across 50+ trades',               rarity:'epic',      check:(t)=>t.length>=50&&t.filter(x=>x.pnl>0).length/t.length>=0.75 },
  { id:'green_month',   iconKey:'green_month',    title:'Green Month',        desc:'Close any calendar month in profit',            rarity:'epic',      check:(t)=>{const m:Record<string,number>={};t.forEach(x=>{const k=x.date.slice(0,7);m[k]=(m[k]||0)+(Number(x.pnl)||0);});return Object.values(m).some(v=>v>0);} },
  { id:'win_streak_10', iconKey:'win_streak_10',  title:'Unstoppable',        desc:'10 consecutive winning trades',                 rarity:'epic',      check:(_,s)=>s.bestWin>=10 },
  { id:'streak_30',     iconKey:'streak_30',      title:'Monthly Discipline', desc:'30-day consecutive trading streak',             rarity:'epic',      check:(_,s)=>s.best>=30 },
  { id:'perfect_week',  iconKey:'perfect_week',   title:'Flawless Week',      desc:'5+ wins in a single week, 0 losses',            rarity:'legendary', check:(t)=>{const w:Record<string,{wn:number;l:number}>={};t.forEach(x=>{const d=new Date(x.date+'T12:00:00');const k=`${d.getFullYear()}-${Math.floor((d.getTime()-new Date(d.getFullYear(),0,1).getTime())/604800000)}`;if(!w[k])w[k]={wn:0,l:0};if(x.pnl>0)w[k].wn++;else w[k].l++;});return Object.values(w).some(v=>v.wn>=5&&v.l===0);} },
  { id:'five_hundred',  iconKey:'five_hundred',   title:'Five Hundred',       desc:'Log 500 trades',                                rarity:'legendary', check:(t)=>t.length>=500 },
  { id:'legend',        iconKey:'legend',         title:'Legend Rank',        desc:'Reach the Legend rank',                         rarity:'legendary', check:(_,__,xp=0)=>xp>=32000 },
];

// ── Premium Badge Circle ───────────────────────────────────────────────────────
const PremiumBadge: React.FC<{
  a: Achievement & { unlocked: boolean };
  size?: number;
  onClick?: () => void;
}> = ({ a, size = 76, onClick }) => {
  const rs = RARITY[a.rarity];
  const icon = Icons[a.iconKey];
  const iconSize = Math.round(size * 0.38);
  const gradId = `g_${a.id}`;
  const shineId = `s_${a.id}`;
  const locked = !a.unlocked;

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group" style={{ opacity: locked ? 0.42 : 1 }}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Glow */}
        {!locked && (
          <div className="absolute inset-0 rounded-full"
            style={{ background: rs.glow, filter: 'blur(10px)', transform: 'scale(0.8)', zIndex: 0 }}/>
        )}
        <svg width={size} height={size} viewBox="0 0 80 80" className="relative" style={{ zIndex: 1 }}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              {rs.grad.map((c, i) => (
                <stop key={i} offset={`${(i/(rs.grad.length-1))*100}%`} stopColor={c}/>
              ))}
            </linearGradient>
            <linearGradient id={shineId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.22)"/>
              <stop offset="45%" stopColor="rgba(255,255,255,0.04)"/>
              <stop offset="100%" stopColor="rgba(0,0,0,0.12)"/>
            </linearGradient>
          </defs>
          {/* Outer ring */}
          <circle cx="40" cy="40" r="38" fill={locked ? '#22223a' : `url(#${gradId})`}/>
          {/* Inner dark circle */}
          <circle cx="40" cy="40" r="29" fill={locked ? '#181828' : rs.bg}/>
          {/* Colour tint */}
          {!locked && <circle cx="40" cy="40" r="29" fill={rs.grad[0]} opacity="0.10"/>}
          {/* Shine */}
          <circle cx="40" cy="40" r="29" fill={`url(#${shineId})`}/>
          {/* Lock */}
          {locked && (
            <g>
              <rect x="27" y="35" width="26" height="18" rx="3" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"/>
              <path d="M31 35v-5a9 9 0 0118 0v5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeLinecap="round"/>
            </g>
          )}
        </svg>
        {/* Icon on top */}
        {!locked && icon && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
            {icon(rs.grad[0], iconSize)}
          </div>
        )}
      </div>
      <p className="text-[9px] font-black text-center leading-tight px-1"
        style={{ color: locked ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.65)', maxWidth: size + 8 }}>
        {a.title}
      </p>
    </button>
  );
};

// ── Particle burst ────────────────────────────────────────────────────────────
const Particle: React.FC<{ color: string; delay: number; angle: number; dist: number }> = ({ color, delay, angle, dist }) => {
  const rad = (angle * Math.PI) / 180;
  const tx = Math.cos(rad) * dist;
  const ty = Math.sin(rad) * dist;
  const size = 4 + Math.random() * 5;
  return (
    <div className="absolute rounded-full pointer-events-none"
      style={{
        width: size, height: size,
        backgroundColor: color,
        left: '50%', top: '50%',
        marginLeft: -size / 2, marginTop: -size / 2,
        animation: `tf_particle 1.4s cubic-bezier(0.22,1,0.36,1) ${delay}s both`,
        ['--tx' as any]: `${tx}px`,
        ['--ty' as any]: `${ty}px`,
        boxShadow: `0 0 5px 2px ${color}70`,
      }}
    />
  );
};

// ── BadgeSheet: Cinematic full-screen achievement reveal ──────────────────────
const BadgeSheet: React.FC<{ a: Achievement & { unlocked: boolean }; onClose: () => void }> = ({ a, onClose }) => {
  const rs = RARITY[a.rarity];
  const [phase, setPhase] = useState<'enter'|'show'|'exit'>('enter');
  const icon = Icons[a.iconKey];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPhase('show'), 280);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => { setPhase('exit'); setTimeout(onClose, 380); };

  const particles = useMemo(() => {
    if (!a.unlocked) return [];
    const colors = [...rs.grad, '#ffffff'];
    return Array.from({ length: 44 }, (_, i) => ({
      id: i, color: colors[i % colors.length],
      delay: 0.04 + (i / 44) * 0.45,
      angle: (i / 44) * 360 + (Math.random() - 0.5) * 18,
      dist: 90 + Math.random() * 150,
    }));
  }, [a.unlocked, rs]);

  const bgMap: Record<string, string> = {
    common:    'radial-gradient(ellipse at 50% 38%, #1a1f2e 0%, #080a0f 65%)',
    rare:      'radial-gradient(ellipse at 50% 38%, #1c1600 0%, #090700 65%)',
    epic:      'radial-gradient(ellipse at 50% 38%, #180c2c 0%, #07040e 65%)',
    legendary: 'radial-gradient(ellipse at 50% 38%, #1e1000 0%, #090400 65%)',
  };

  return createPortal(
    <>
      <style>{`
        @keyframes tf_particle { 0%{transform:translate(0,0) scale(1);opacity:1} 80%{opacity:.7} 100%{transform:translate(var(--tx),var(--ty)) scale(0);opacity:0} }
        @keyframes tf_badge_drop { 0%{transform:translateY(-70px) scale(0.5);opacity:0} 55%{transform:translateY(12px) scale(1.1);opacity:1} 75%{transform:translateY(-6px) scale(0.96)} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes tf_glow_pulse { 0%,100%{opacity:.55;transform:translate(-50%,-60%) scale(1)} 50%{opacity:.9;transform:translate(-50%,-60%) scale(1.18)} }
        @keyframes tf_text_rise { 0%{transform:translateY(22px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes tf_shimmer { 0%{transform:translateX(-120%) rotate(28deg)} 100%{transform:translateX(320%) rotate(28deg)} }
        @keyframes tf_legend_spin { from{transform:translate(-50%,-60%) rotate(0deg)} to{transform:translate(-50%,-60%) rotate(360deg)} }
        @keyframes tf_tap_pulse { 0%,100%{opacity:.18} 50%{opacity:.38} }
      `}</style>

      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer"
        style={{ background: bgMap[a.rarity], opacity: phase === 'exit' ? 0 : 1, transition: 'opacity 0.38s ease' }}
        onClick={handleClose}
      >
        {/* Radial glow */}
        {a.unlocked && (
          <div className="absolute pointer-events-none" style={{
            width: 420, height: 420, borderRadius: '50%',
            background: `radial-gradient(circle, ${rs.glow} 0%, transparent 68%)`,
            top: '50%', left: '50%',
            animation: 'tf_glow_pulse 2.8s ease-in-out infinite',
          }} />
        )}

        {/* Legendary spinning ring */}
        {a.rarity === 'legendary' && a.unlocked && (
          <div className="absolute pointer-events-none" style={{
            width: 340, height: 340, borderRadius: '50%',
            border: '1.5px solid transparent',
            backgroundImage: 'conic-gradient(#fbbf24, #f97316, #ef4444, #fbbf24)',
            backgroundOrigin: 'border-box',
            WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'destination-out',
            top: '50%', left: '50%',
            animation: 'tf_legend_spin 5s linear infinite',
            opacity: 0.35,
          }} />
        )}

        {/* Particles origin */}
        <div className="absolute pointer-events-none" style={{ top: '42%', left: '50%' }}>
          {phase === 'show' && particles.map(p => (
            <Particle key={p.id} color={p.color} delay={p.delay} angle={p.angle} dist={p.dist} />
          ))}
        </div>

        {/* Content */}
        <div className="relative flex flex-col items-center px-8 w-full max-w-[320px]" style={{ marginTop: '-6vh' }} onClick={e => e.stopPropagation()}>

          {/* Big badge */}
          <div style={{ marginBottom: 28, animation: phase === 'show' ? 'tf_badge_drop 0.72s cubic-bezier(0.22,1,0.36,1) both' : 'none' }}>
            <div className="relative" style={{ width: 168, height: 168 }}>
              {a.unlocked && <>
                <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: rs.glow, filter: 'blur(32px)', transform: 'scale(1.15)' }} />
                <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: rs.glow, filter: 'blur(14px)', opacity: 0.65 }} />
              </>}
              <svg width={168} height={168} viewBox="0 0 80 80" style={{ position: 'relative', filter: a.unlocked ? `drop-shadow(0 0 18px ${rs.grad[0]}90)` : 'none' }}>
                <defs>
                  <linearGradient id={`gbig2_${a.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    {rs.grad.map((c,i) => <stop key={i} offset={`${(i/(rs.grad.length-1))*100}%`} stopColor={c}/>)}
                  </linearGradient>
                  <linearGradient id={`sbig2_${a.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.32)"/>
                    <stop offset="50%" stopColor="rgba(255,255,255,0.04)"/>
                    <stop offset="100%" stopColor="rgba(0,0,0,0.18)"/>
                  </linearGradient>
                  <clipPath id={`cp_${a.id}`}><circle cx="40" cy="40" r="30"/></clipPath>
                </defs>
                <circle cx="40" cy="40" r="38" fill={!a.unlocked ? '#1c1c2e' : `url(#gbig2_${a.id})`}/>
                <circle cx="40" cy="40" r="30" fill={!a.unlocked ? '#13131f' : rs.bg}/>
                {a.unlocked && <circle cx="40" cy="40" r="30" fill={rs.grad[0]} opacity="0.11"/>}
                <circle cx="40" cy="40" r="30" fill={`url(#sbig2_${a.id})`}/>
                {a.unlocked && a.rarity !== 'common' && (
                  <rect x="-50" y="0" width="35" height="80" fill="rgba(255,255,255,0.13)" clipPath={`url(#cp_${a.id})`}
                    style={{ animation: 'tf_shimmer 2.8s ease-in-out 0.9s both' }}/>
                )}
                {!a.unlocked && (
                  <g>
                    <rect x="27" y="35" width="26" height="18" rx="3" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5"/>
                    <path d="M31 35v-5a9 9 0 0118 0v5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" strokeLinecap="round"/>
                  </g>
                )}
              </svg>
              {a.unlocked && icon && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
                  {icon(rs.grad[0], 68)}
                </div>
              )}
            </div>
          </div>

          {/* Rarity chip */}
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
            style={{ background: `${rs.grad[0]}20`, border: `1px solid ${rs.grad[0]}50`, animation: phase==='show' ? 'tf_text_rise 0.5s ease 0.5s both' : 'none' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: rs.grad[0] }}/>
            <span className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: rs.labelColor }}>{rs.label}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: rs.labelColor, opacity: 0.4 }}>· +{rs.xp} XP</span>
          </div>

          {/* Title */}
          <h2 className="text-[30px] font-black text-white text-center tracking-tight mb-2"
            style={{ animation: phase==='show' ? 'tf_text_rise 0.5s ease 0.62s both' : 'none', textShadow: `0 0 40px ${rs.grad[0]}60` }}>
            {a.title}
          </h2>

          {/* Desc */}
          <p className="text-[14px] text-white/40 text-center leading-relaxed mb-8"
            style={{ animation: phase==='show' ? 'tf_text_rise 0.5s ease 0.72s both' : 'none' }}>
            {a.desc}
          </p>

          {/* Status */}
          <div className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 mb-5"
            style={{
              background: a.unlocked ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
              border: a.unlocked ? '1px solid rgba(16,185,129,0.28)' : '1px solid rgba(255,255,255,0.08)',
              animation: phase==='show' ? 'tf_text_rise 0.5s ease 0.82s both' : 'none',
            }}>
            {a.unlocked ? (
              <>
                <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="text-[12px] font-black uppercase tracking-[0.2em] text-emerald-400">Achievement Unlocked</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-white/22" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                <span className="text-[12px] font-black uppercase tracking-[0.2em] text-white/22">Not Yet Unlocked</span>
              </>
            )}
          </div>

          <p className="text-[10px] text-white/18 uppercase tracking-[0.25em] font-bold"
            style={{ animation: 'tf_tap_pulse 2.5s ease-in-out infinite' }}>
            Tap anywhere to close
          </p>
        </div>
      </div>
    </>,
    document.body
  );
};


// ── Mission Ring ──────────────────────────────────────────────────────────────
const MissionRing: React.FC<{ pct: number; color: string; done: boolean }> = ({ pct, color, done }) => {
  const [anim, setAnim] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnim(true), 250); return () => clearTimeout(t); }, []);
  const r = 22; const circ = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="4.5"/>
      <circle cx="28" cy="28" r={r} fill="none"
        stroke={done ? '#34d399' : color} strokeWidth="4.5"
        strokeDasharray={circ}
        strokeDashoffset={circ - (anim ? Math.min(pct/100, 1) : 0) * circ}
        strokeLinecap="round" transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34,1.1,0.64,1)' }}
      />
      {done && <path d="M20 28l5 5 11-10" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
    </svg>
  );
};

// ── Weekly Missions data ───────────────────────────────────────────────────────
const getWeeklyChallenges = (trades: Trade[]) => {
  const now = new Date(); const start = new Date(now);
  start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0);
  const wt = trades.filter(t => new Date(t.date+'T12:00:00') >= start);
  const wr = wt.length > 0 ? (wt.filter(t => t.pnl > 0).length / wt.length) * 100 : 0;
  return [
    { id:'c1', title:'Active Trader',   desc:'Log 5 trades this week',      goal:5,  cur:wt.length,  xp:50,  color:'#34d399' },
    { id:'c2', title:'Accuracy Target', desc:'Hit 55%+ win rate this week',  goal:55, cur:Math.round(wr), xp:75, color:'#6c83f5', isPercent:true },
    { id:'c3', title:'Full Journal',    desc:'Add notes to 5 trades',        goal:5,  cur:wt.filter(t=>t.narrative?.trim().length>10).length, xp:60, color:'#fb923c' },
    { id:'c4', title:'Rule-Based',      desc:'Follow your plan on 5 trades', goal:5,  cur:wt.filter(t=>t.followedPlan).length, xp:65, color:'#c084fc' },
  ];
};

// ── Main ───────────────────────────────────────────────────────────────────────
const Gamification: React.FC<Props> = ({ trades, userName }) => {
  const [tab, setTab] = useState<'overview'|'badges'|'missions'>('overview');
  const [selectedBadge, setSelectedBadge] = useState<(Achievement & { unlocked: boolean })|null>(null);

  const xp       = useMemo(() => calcXP(trades), [trades]);
  const lvl      = useMemo(() => getLevel(xp), [xp]);
  const streaks  = useMemo(() => calcStreaks(trades), [trades]);
  const missions = useMemo(() => getWeeklyChallenges(trades), [trades]);

  const achievements = useMemo(() => ACHIEVEMENTS
    .map(a => ({ ...a, unlocked: a.check(trades, streaks, xp) }))
    .sort((a, b) => {
      if (a.unlocked && !b.unlocked) return -1;
      if (!a.unlocked && b.unlocked) return 1;
      return ({legendary:0,epic:1,rare:2,common:3}[a.rarity]) - ({legendary:0,epic:1,rare:2,common:3}[b.rarity]);
    }),
    [trades, streaks, xp]
  );

  const unlocked = achievements.filter(a => a.unlocked).length;
  const winRate  = trades.length > 0 ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100 : 0;
  const discScore = trades.length > 0 ? (trades.filter(t => t.followedPlan === true).length / trades.length) * 100 : 0;

  return (
    <div className="space-y-0 pb-24">

      {/* ── HERO CARD ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[2.5rem]"
        style={{
          background: 'linear-gradient(155deg,#0d0d1a 0%,#111220 55%,#09090f 100%)',
          border: `1px solid ${lvl.level.color}20`,
          boxShadow: `0 0 80px ${lvl.level.color}14, inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}>

        {/* Background glow orbs */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${lvl.level.ring1}12, transparent 60%)` }}/>
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${lvl.level.ring3}0c, transparent 60%)` }}/>

        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 px-6 sm:px-10 pt-8 pb-0">
          {/* Rings */}
          <div className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] flex-shrink-0">
            <ThreeRings
              streakPct={Math.min((streaks.current / 30) * 100, 100)}
              winRatePct={Math.min(winRate, 100)}
              xpPct={lvl.progress}
              ring1={lvl.level.ring1} ring2={lvl.level.ring2} ring3={lvl.level.ring3}
              level={lvl.index + 1}
            />
          </div>

          <div className="flex-1 text-center sm:text-left">
            {/* Ring legend */}
            <div className="flex justify-center sm:justify-start gap-4 mb-4 flex-wrap">
              {[
                { c: lvl.level.ring1, label: `${streaks.current}d STREAK` },
                { c: lvl.level.ring2, label: `${Math.round(winRate)}% WIN RATE` },
                { c: lvl.level.ring3, label: `${Math.round(lvl.progress)}% LEVEL XP` },
              ].map(dot => (
                <div key={dot.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: dot.c }}/>
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/35">{dot.label}</span>
                </div>
              ))}
            </div>

            <h2 className="text-[26px] sm:text-3xl font-black text-white tracking-tight mb-2">
              {userName || 'TradeFlow'}
            </h2>

            {/* Rank chip */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
              style={{ background: `${lvl.level.color}18`, border: `1px solid ${lvl.level.color}40` }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke={lvl.level.color} strokeWidth="1.5"/>
                <path d="M12 8v4l3 3" stroke={lvl.level.color} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: lvl.level.color }}>
                {lvl.level.name}
              </span>
            </div>

            {/* XP bar */}
            <div className="max-w-[270px] mx-auto sm:mx-0">
              <div className="flex justify-between mb-1.5">
                <span className="text-[8px] font-black text-white/30"><AnimCounter value={xp}/> XP</span>
                {lvl.next && <span className="text-[8px] font-black text-white/20">{(lvl.next.minXP-xp).toLocaleString()} TO {lvl.next.name.toUpperCase()}</span>}
              </div>
              <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{
                  width: `${lvl.progress}%`,
                  background: `linear-gradient(90deg,${lvl.level.color},${lvl.next?.color||lvl.level.color})`,
                  boxShadow: `0 0 8px ${lvl.level.color}90`,
                  transition: 'width 1.5s ease',
                }}/>
              </div>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative z-10 grid grid-cols-4 mt-6 mx-5 sm:mx-10 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          {[
            { v: trades.length, l: 'TRADES' },
            { v: `${unlocked}/${ACHIEVEMENTS.length}`, l: 'BADGES' },
            { v: `${streaks.best}d`, l: 'BEST STREAK' },
            { v: `${Math.round(winRate)}%`, l: 'WIN RATE' },
          ].map((s, i) => (
            <div key={s.l} className={`py-4 text-center ${i > 0 ? 'border-l' : ''}`}
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="text-[15px] font-black text-white leading-none mb-1">{s.v}</p>
              <p className="text-[7px] font-black uppercase tracking-[0.16em] text-white/22">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <div className="flex mt-5 p-1 bg-black/[0.04] border border-black/[0.05] rounded-2xl">
        {([{k:'overview',label:'Overview'},{k:'badges',label:'Badges'},{k:'missions',label:'Missions'}] as const).map(({k,label}) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-all"
            style={tab===k ? {background:'#000',color:'#fff',boxShadow:'0 2px 12px rgba(0,0,0,0.2)'} : {color:'rgba(0,0,0,0.28)'}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4 pt-4">
          {/* 2×2 stat cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><path d="M12 2c-3 5-5 7-5 11a5 5 0 0010 0c0-4-2-6-5-11z" stroke="#fb923c" strokeWidth="1.5" strokeLinejoin="round"/></svg>, label:'ACTIVE STREAK', v:streaks.current, unit:'DAYS', sub:streaks.current===0?'Log today to start':`${streaks.current}d running`, color:'#fb923c', bg:'rgba(251,146,60,0.08)' },
              { icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, label:'WIN STREAK', v:streaks.currentWin, unit:'W', sub:'Current consecutive', color:'#34d399', bg:'rgba(52,211,153,0.08)' },
              { icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><path d="M3 17l4-5 4 3 5-7 5 4" stroke="#6c83f5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>, label:'WIN RATE', v:Math.round(winRate), unit:'%', sub:`${trades.filter(t=>t.pnl>0).length} wins total`, color:'#6c83f5', bg:'rgba(108,131,245,0.08)' },
              { icon: <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><path d="M12 3L4 7v5c0 4.4 3.4 8.5 8 9.5 4.6-1 8-5.1 8-9.5V7l-8-4z" stroke="#c084fc" strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="#c084fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>, label:'DISCIPLINE', v:Math.round(discScore), unit:'%', sub:'Plan adherence', color:'#c084fc', bg:'rgba(192,132,252,0.08)' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-[1.8rem] p-5 shadow-sm border border-slate-100 overflow-hidden">
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-3" style={{ background: card.bg }}>
                  {card.icon}
                </div>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-black/28 mb-1">{card.label}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[28px] font-black leading-none" style={{ color: card.color }}>
                    <AnimCounter value={card.v}/>
                  </span>
                  <span className="text-[10px] font-black text-black/28">{card.unit}</span>
                </div>
                <p className="text-[9px] font-bold text-black/28">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Rank Ladder */}
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[9px] font-black uppercase tracking-widest text-black/28">RANK LADDER</p>
              <span className="text-[9px] font-black text-black/28">{lvl.index+1}/9</span>
            </div>
            <div className="relative">
              <div className="absolute top-[22px] left-5 right-5 h-[2px] rounded-full bg-black/[0.05]"/>
              <div className="absolute top-[22px] left-5 h-[2px] rounded-full transition-all duration-1000"
                style={{ width:`${Math.max(0,(lvl.index/(LEVELS.length-1))*100)}%`, maxWidth:'calc(100% - 40px)', background:`linear-gradient(90deg,${LEVELS[0].color},${lvl.level.color})`, boxShadow:`0 0 6px ${lvl.level.color}80` }}/>
              <div className="flex justify-between relative z-10">
                {LEVELS.map((l,i) => {
                  const reached=i<=lvl.index; const isCur=i===lvl.index;
                  return (
                    <div key={l.name} className="flex flex-col items-center gap-2">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center transition-all"
                        style={{ background:reached?l.color:'rgba(0,0,0,0.05)', boxShadow:isCur?`0 0 0 3px white,0 0 0 5px ${l.color},0 0 18px ${l.color}60`:'none', transform:isCur?'scale(1.15)':'scale(1)' }}>
                        <span className="text-[9px] font-black" style={{ color:reached?'white':'rgba(0,0,0,0.15)' }}>{i+1}</span>
                      </div>
                      <span className="text-[6px] font-black uppercase tracking-wide hidden sm:block" style={{ color:reached?l.color:'rgba(0,0,0,0.2)' }}>{l.name.slice(0,4)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {lvl.next && (
              <p className="text-[10px] font-bold text-black/28 text-center mt-5">
                <span className="font-black text-black/55">{(lvl.next.minXP-xp).toLocaleString()} XP</span> to unlock{' '}
                <span className="font-black" style={{ color:lvl.next.color }}>{lvl.next.name}</span>
              </p>
            )}
          </div>

          {/* Recent badges */}
          {unlocked > 0 && (
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-black/28">RECENT BADGES</p>
                <button onClick={() => setTab('badges')} className="text-[9px] font-black uppercase tracking-widest" style={{ color: lvl.level.color }}>SEE ALL →</button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth:'none' }}>
                {achievements.filter(a => a.unlocked).slice(0, 8).map(a => (
                  <div key={a.id} className="flex-shrink-0">
                    <PremiumBadge a={a} size={68} onClick={() => setSelectedBadge(a)}/>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BADGES ────────────────────────────────────────────────────────── */}
      {tab === 'badges' && (
        <div className="space-y-4 pt-4">
          {/* Counter row */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="grid grid-cols-4 divide-x divide-slate-100">
              {[
                { v: unlocked, l:'EARNED', color:'#34d399' },
                { v: ACHIEVEMENTS.length-unlocked, l:'LOCKED', color:'rgba(0,0,0,0.28)' },
                { v: achievements.filter(a=>a.rarity==='epic'&&a.unlocked).length, l:'EPIC', color:'#a78bfa' },
                { v: achievements.filter(a=>a.rarity==='rare'&&a.unlocked).length, l:'RARE', color:'#fbbf24' },
              ].map(s => (
                <div key={s.l} className="py-4 text-center">
                  <p className="text-xl font-black" style={{ color:s.color }}>{s.v}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-black/25 mt-0.5">{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Earned — dark bg like iOS */}
          {unlocked > 0 && (
            <>
              <div className="flex items-center gap-2 px-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400"/>
                <p className="text-[9px] font-black uppercase tracking-widest text-black/35">EARNED — {unlocked} BADGES</p>
              </div>
              <div className="rounded-[2rem] p-6 border border-white/5"
                style={{ background:'linear-gradient(145deg,#111520,#0c0f1a)' }}>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-6">
                  {achievements.filter(a => a.unlocked).map(a => (
                    <div key={a.id} className="flex justify-center">
                      <PremiumBadge a={a} size={72} onClick={() => setSelectedBadge(a)}/>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Locked */}
          {ACHIEVEMENTS.length - unlocked > 0 && (
            <>
              <div className="flex items-center gap-2 px-1 mt-2">
                <div className="w-2 h-2 rounded-full bg-black/20"/>
                <p className="text-[9px] font-black uppercase tracking-widest text-black/30">LOCKED — {ACHIEVEMENTS.length-unlocked} BADGES</p>
              </div>
              <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-6">
                  {achievements.filter(a => !a.unlocked).map(a => (
                    <div key={a.id} className="flex justify-center">
                      <PremiumBadge a={a} size={72} onClick={() => setSelectedBadge(a)}/>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MISSIONS ──────────────────────────────────────────────────────── */}
      {tab === 'missions' && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-black/35">WEEKLY MISSIONS</p>
              <p className="text-[10px] text-black/28 mt-0.5">Resets every Sunday</p>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-black text-white text-[8px] font-black uppercase tracking-widest">THIS WEEK</div>
          </div>

          {missions.map(ch => {
            const pct  = Math.min((ch.cur / ch.goal) * 100, 100);
            const done = ch.cur >= ch.goal;
            return (
              <div key={ch.id} className="bg-white rounded-[2rem] p-5 shadow-sm border overflow-hidden relative"
                style={{ borderColor: done ? `${ch.color}28` : '#f1f5f9' }}>
                {done && <div className="absolute inset-0 pointer-events-none" style={{ background:`radial-gradient(ellipse 60% 80% at 95% 50%,${ch.color}07,transparent 60%)` }}/>}
                <div className="flex items-center gap-4 relative">
                  <div className="flex-shrink-0">
                    <MissionRing pct={pct} color={ch.color} done={done}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[14px] font-black text-black">{ch.title}</p>
                      {done && (
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                          style={{ background:`${ch.color}18`, color:ch.color, border:`1px solid ${ch.color}28` }}>DONE</span>
                      )}
                    </div>
                    <p className="text-[11px] text-black/32">{ch.desc}</p>
                    <div className="h-[3px] rounded-full mt-3 overflow-hidden bg-black/[0.05]">
                      <div className="h-full rounded-full transition-all duration-1000"
                        style={{ width:`${pct}%`, background:done?`${ch.color}`:' #1a1a1a', boxShadow:done?`0 0 6px ${ch.color}60`:'none' }}/>
                    </div>
                  </div>
                  <span className="text-[13px] font-black flex-shrink-0" style={{ color:done?ch.color:'rgba(0,0,0,0.18)' }}>+{ch.xp}</span>
                </div>
              </div>
            );
          })}

          {/* XP per action */}
          <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-black/28 mb-4">XP PER ACTION</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                {a:'Log a trade',    xp:'+10', color:'#34d399', path:'M12 4v16M4 12h16'},
                {a:'Winning trade',  xp:'+5',  color:'#34d399', path:'M3 17l4-5 4 3 5-7 5 4'},
                {a:'Followed plan',  xp:'+4',  color:'#c084fc', path:'M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z'},
                {a:'A+ grade trade', xp:'+10', color:'#fb923c', path:'M6 20l6-16 6 16M8.5 14h7'},
                {a:'Added narrative',xp:'+3',  color:'#6c83f5', path:'M4 6h16M4 10h16M4 14h10'},
                {a:'Tagged trade',   xp:'+1',  color:'#f6c547', path:'M7 7h.01M7 3h5l8.5 8.5a1.5 1.5 0 010 2.1L15 19a1.5 1.5 0 01-2.1 0L4 12V7a4 4 0 014-4z'},
              ].map(row => (
                <div key={row.a} className="flex items-center justify-between px-3 py-2.5 rounded-2xl bg-black/[0.02] border border-black/[0.04]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:`${row.color}15` }}>
                      <svg viewBox="0 0 24 24" fill="none" style={{ width:12, height:12, color:row.color }}>
                        <path d={row.path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-[9px] font-bold text-black/42">{row.a}</span>
                  </div>
                  <span className="text-[10px] font-black" style={{ color:row.color }}>{row.xp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Badge detail sheet */}
      {selectedBadge && <BadgeSheet a={selectedBadge} onClose={() => setSelectedBadge(null)}/>}
    </div>
  );
};

export default Gamification;
