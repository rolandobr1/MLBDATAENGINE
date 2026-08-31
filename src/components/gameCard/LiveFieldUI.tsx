/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { getTeamLogo, getTeamAbbr } from "../../utils/teamLogos";

const LiveFieldUI: React.FC<{ linescore: any, liveBoxscore: any, gameStatus?: string, homeTeam: any, awayTeam: any }> = ({ linescore, liveBoxscore, gameStatus = '', homeTeam, awayTeam }) => {
  if (!linescore) return null;

  const b = linescore.balls || 0;
  const s = linescore.strikes || 0;
  const o = linescore.outs || 0;

  const first = !!linescore.offense?.first;
  const second = !!linescore.offense?.second;
  const third = !!linescore.offense?.third;

  const currentPitcherId = linescore.defense?.pitcher?.id;
  const currentBatterId = linescore.offense?.batter?.id;
  
  let currentPitcher: any = null;
  let currentBatter: any = null;
  
  if (liveBoxscore) {
    currentPitcher = liveBoxscore.home?.pitchers?.find((p: any) => p.id === currentPitcherId) || 
                     liveBoxscore.away?.pitchers?.find((p: any) => p.id === currentPitcherId);
    
    currentBatter = liveBoxscore.home?.batters?.find((b: any) => b.id === currentBatterId) || 
                    liveBoxscore.away?.batters?.find((b: any) => b.id === currentBatterId);
  }

  const pitcherName = currentPitcher?.name || linescore.defense?.pitcher?.fullName;
  const batterName = currentBatter?.name || linescore.offense?.batter?.fullName;

  const isTopInning = linescore.inningHalf === "Top" || linescore.isTopInning === true;
  const batterTeam = isTopInning ? awayTeam : homeTeam;
  const pitcherTeam = isTopInning ? homeTeam : awayTeam;


  const formatName = (fullName: string) => {
    if (!fullName) return '';
    const parts = fullName.split(' ');
    if (parts.length === 1) return fullName;
    const lastName = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map((n: string) => n.charAt(0) + '.').join(' ');
    return `${initials} ${lastName}`;
  };

  const StatPill = ({ label, value, accent }: { label: string, value: string | number, accent?: string }) => (
    <div className={`flex flex-col items-center px-1 py-1 rounded-md min-w-0 ${accent || 'bg-white/5'} border border-white/10`}>
      <span className="text-white/40 text-[7px] uppercase tracking-widest font-bold leading-none">{label}</span>
      <span className="text-white font-mono font-bold text-[10px] leading-tight mt-0.5 whitespace-nowrap">{value}</span>
    </div>
  );

  const CountDot = ({ filled, activeColor, glowColor }: { filled: boolean, activeColor: string, glowColor: string }) => (
    <div className={`w-2.5 h-2.5 rounded-full border transition-all duration-300 ${filled
      ? `${activeColor} border-transparent shadow-[0_0_7px_2px_${glowColor}]`
      : 'bg-white/10 border-white/20'}`}
    />
  );

  return (
    <div className="relative mx-4 mt-3 rounded-xl overflow-hidden border border-white/10" style={{ background: 'linear-gradient(160deg, #0a1628 0%, #091520 50%, #0a1628 100%)' }}>
      {/* Ambient glow blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div className="absolute -top-4 left-1/4 w-48 h-24 bg-blue-700/15 blur-3xl rounded-full" />
        <div className="absolute -top-4 right-1/4 w-48 h-24 bg-amber-600/10 blur-3xl rounded-full" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-12 bg-red-900/20 blur-2xl rounded-full" />
      </div>

      {/* Top rainbow accent */}
      <div className="h-0.5 w-full bg-gradient-to-r from-blue-500 via-red-500 to-amber-500" />

      {/* Status pill */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
        {(() => {
          let label = 'EN VIVO';
          let bg = 'bg-red-600';
          let shadow = 'shadow-red-900/50';
          if (gameStatus.includes('Challenge')) {
            label = 'REVISIÓN'; bg = 'bg-orange-500'; shadow = 'shadow-orange-900/50';
          } else if (gameStatus.includes('Delayed')) {
            label = 'SUSPENDIDO'; bg = 'bg-yellow-600'; shadow = 'shadow-yellow-900/50';
          }
          return (
            <div className={`flex items-center gap-1.5 ${bg} px-3 py-0.5 rounded-full shadow-lg ${shadow}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-white text-[9px] font-black uppercase tracking-[0.15em]">{label}</span>
            </div>
          );
        })()}
      </div>

      <div className="relative z-10 flex items-stretch px-3 pb-3 pt-8 gap-1">

        {/* ── LEFT: PITCHER ── */}
        <div className="flex-1 flex flex-col gap-2 pr-3 border-r border-white/8">
          {/* Row 1: Label + Name */}
          <div className="min-h-[44px]">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
              <span className="text-blue-300/60 text-[8px] uppercase tracking-[0.18em] font-extrabold">Lanzador</span>
            </div>
            <div className="text-white font-bold text-sm leading-snug flex items-center gap-1.5">
              {pitcherName ? (
                <>
                  {pitcherTeam && <img src={getTeamLogo(pitcherTeam) || ''} className="w-4 h-4 opacity-90" alt={getTeamAbbr(pitcherTeam) || ''} title={pitcherTeam} />}
                  {formatName(pitcherName)}
                </>
              ) : <span className="text-white/25 italic text-xs">Sin datos</span>}
            </div>
            <div className="text-white/35 text-[9px] font-mono mt-0.5 h-[13px]">
              {currentPitcher ? `#${currentPitcher.pitches || 0} pitcheos` : ''}
            </div>
          </div>
          {/* Row 2: Progress bar */}
          <div className="h-[28px] flex flex-col justify-end">
            <div className="flex justify-between text-[8px] text-white/25 mb-1 font-mono">
              <span>Strike%</span>
              <span className="text-blue-300/60">
                {currentPitcher?.pitches ? Math.round((currentPitcher.strikes / currentPitcher.pitches) * 100) : 0}%
              </span>
            </div>
            <div className="h-1 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-blue-600 to-blue-400"
                style={{ width: `${currentPitcher?.pitches ? Math.round((currentPitcher.strikes / currentPitcher.pitches) * 100) : 0}%` }}
              />
            </div>
          </div>
          {/* Row 3: Stat pills */}
          <div className="grid gap-1" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr' }}>
            <StatPill label="IL" value={currentPitcher?.ip || '0.0'} />
            <StatPill label="H" value={currentPitcher?.h ?? '-'} />
            <StatPill label="CL" value={currentPitcher?.er ?? '-'} />
            <StatPill label="SO" value={currentPitcher?.k ?? '-'} accent="bg-blue-500/15" />
          </div>
        </div>

        {/* ── CENTER ── */}
        <div className="flex flex-col items-center justify-between px-2 shrink-0 min-w-[96px] gap-2">
          {/* SVG Diamond */}
          <div className="w-16 h-16">
            <svg viewBox="0 0 80 80" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="glow-base">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              {/* Grass outline */}
              <polygon points="40,5 75,40 40,75 5,40" stroke="rgba(255,255,255,0.1)" strokeWidth="1" fill="rgba(255,255,255,0.02)" />
              {/* Baselines */}
              <line x1="40" y1="68" x2="68" y2="40" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
              <line x1="40" y1="68" x2="12" y2="40" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
              <line x1="68" y1="40" x2="40" y2="12" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
              <line x1="12" y1="40" x2="40" y2="12" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
              {/* Home plate */}
              <polygon points="40,74 36,70 36,66 44,66 44,70" fill="rgba(255,255,255,0.3)" />
              {/* 1B */}
              <rect x="62" y="36" width="10" height="10" rx="1.5" transform="rotate(45 67 41)"
                fill={first ? '#f59e0b' : 'rgba(255,255,255,0.07)'} filter={first ? 'url(#glow-base)' : ''} className="transition-all duration-500" />
              {/* 2B */}
              <rect x="36" y="9" width="10" height="10" rx="1.5" transform="rotate(45 41 14)"
                fill={second ? '#f59e0b' : 'rgba(255,255,255,0.07)'} filter={second ? 'url(#glow-base)' : ''} className="transition-all duration-500" />
              {/* 3B */}
              <rect x="9" y="36" width="10" height="10" rx="1.5" transform="rotate(45 14 41)"
                fill={third ? '#f59e0b' : 'rgba(255,255,255,0.07)'} filter={third ? 'url(#glow-base)' : ''} className="transition-all duration-500" />
            </svg>
          </div>

          {/* Ball-Strike dots */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-full border transition-all duration-300 ${i < b ? 'bg-emerald-400 border-emerald-300' : 'bg-white/8 border-white/15'}`} />
                ))}
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex gap-0.5">
                {[0,1,2].map(i => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-full border transition-all duration-300 ${i < s ? 'bg-yellow-400 border-yellow-300' : 'bg-white/8 border-white/15'}`} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest">
              <span className="text-emerald-400/70">{b}B</span>
              <span className="text-white/20">·</span>
              <span className="text-yellow-400/70">{s}S</span>
            </div>
          </div>

          {/* Outs */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full border transition-all duration-300 ${i < o
                  ? 'bg-red-500 border-red-400 shadow-[0_0_6px_2px_rgba(239,68,68,0.5)]'
                  : 'bg-white/8 border-white/15'}`}
                />
              ))}
            </div>
            <span className="text-white/25 text-[7px] font-bold uppercase tracking-widest">{o} out{o !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* ── RIGHT: BATTER ── */}
        <div className="flex-1 flex flex-col gap-2 pl-3 border-l border-white/8 items-end text-right">
          {/* Row 1: Label + Name */}
          <div className="min-h-[44px] w-full">
            <div className="flex items-center justify-end gap-1.5 mb-1">
              <span className="text-amber-300/60 text-[8px] uppercase tracking-[0.18em] font-extrabold">Bateador</span>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            </div>
            <div className="text-white font-bold text-sm leading-snug flex items-center gap-1.5">
              {batterName ? (
                <>
                  {batterTeam && <img src={getTeamLogo(batterTeam) || ''} className="w-4 h-4 opacity-90" alt={getTeamAbbr(batterTeam) || ''} title={batterTeam} />}
                  {formatName(batterName)}
                </>
              ) : <span className="text-white/25 italic text-xs">Sin datos</span>}
            </div>
            <div className="text-white/35 text-[9px] font-mono mt-0.5 h-[13px]">
              {currentBatter ? (currentBatter.position || 'DH') : ''}
            </div>
          </div>
          {/* Row 2: Progress bar */}
          <div className="h-[28px] flex flex-col justify-end w-full">
            <div className="flex justify-between text-[8px] text-white/25 mb-1 font-mono">
              <span className="text-amber-300/60">
                {currentBatter?.ab ? (Math.round((currentBatter.h / currentBatter.ab) * 1000) / 1000).toFixed(3).replace('0.', '.') : '.000'}
              </span>
              <span>Hoy {currentBatter?.h ?? 0}/{currentBatter?.ab ?? 0}</span>
            </div>
            <div className="h-1 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-amber-600 to-amber-400"
                style={{ width: `${currentBatter?.ab ? Math.min(100, Math.round((currentBatter.h / currentBatter.ab) * 100 * 3)) : 0}%` }}
              />
            </div>
          </div>
          {/* Row 3: Stat pills */}
          <div className="grid grid-cols-4 gap-1 w-full">
            <StatPill label="AB" value={currentBatter?.ab ?? '-'} />
            <StatPill label="H" value={currentBatter?.h ?? '-'} accent="bg-amber-500/15" />
            <StatPill label="RBI" value={currentBatter?.rbi ?? '-'} />
            <StatPill label="BB" value={currentBatter?.bb ?? '-'} />
          </div>
        </div>

      </div>

      {/* Bottom faint accent */}
      <div className="h-px w-full bg-gradient-to-r from-blue-500/30 via-transparent to-amber-500/30" />
    </div>
  );
};


export default LiveFieldUI;
