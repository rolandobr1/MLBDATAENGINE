/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { MLBGame } from "../types";
import { getTeamLogo, getTeamColor, getTeamAbbr } from "../utils/teamLogos";
import {
  TrendingUp,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Pin,
  Download,
  Eye,
  EyeOff,
  Search,
  X,
} from "lucide-react";

const getTrueKPercentage = (lineup: any[]) => {
  if (!lineup || lineup.length === 0) return "0.0";
  let totalPA = 0;
  let totalSO = 0;
  for (const p of lineup) {
    const pa = p.pa || 0;
    if (pa > 0) {
      totalPA += pa;
      totalSO += ((p.strikeout_pct ?? p.kPct ?? 0) / 100) * pa;
    }
  }
  if (totalPA === 0) {
    return (lineup.reduce((sum, p) => sum + (p.strikeout_pct ?? p.kPct ?? 0), 0) / lineup.length).toFixed(1);
  }
  return ((totalSO / totalPA) * 100).toFixed(1);
};

interface GameCardProps {
  game: MLBGame;
  onRefresh?: () => Promise<void>;
  isPinned?: boolean;
  onTogglePin?: () => void;
  globalExpandToggle?: number;
  globalExpandTarget?: boolean;
}


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

export const GameCard: React.FC<GameCardProps> = ({ game, onRefresh, isPinned, onTogglePin, globalExpandToggle, globalExpandTarget }) => {
  const [isCardExpanded, setIsCardExpanded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"resumen" | "lineups" | "boxscore" | "splits" | "fatigue" | "sabermetrics" | "injuries">("resumen");
  const [pitcherTab, setPitcherTab] = React.useState<"season" | "last7" | "vsOpp">("season");
  const [showAllPlays, setShowAllPlays] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [expandedPlayer, setExpandedPlayer] = React.useState<string | null>(null);
  const [selectedPitcherSide, setSelectedPitcherSide] = React.useState<"home" | "away" | null>(null);
  const [playSearch, setPlaySearch] = React.useState("");
  const [injurySearch, setInjurySearch] = React.useState("");

  React.useEffect(() => {
    if (globalExpandToggle !== undefined && globalExpandToggle > 0) {
      setIsCardExpanded(!!globalExpandTarget);
    }
  }, [globalExpandToggle, globalExpandTarget]);

  const togglePlayerExpansion = (team: "home" | "away", idx: number) => {
    const key = `${team}-${idx}`;
    setExpandedPlayer(expandedPlayer === key ? null : key);
  };

  const handleRefreshClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };


  const calcKMinusBb = (k: any, bb: any) => {
    if (!k || !bb || k === "-" || bb === "-") return "-";
    const kNum = parseFloat(String(k).replace("%", ""));
    const bbNum = parseFloat(String(bb).replace("%", ""));
    if (isNaN(kNum) || isNaN(bbNum)) return "-";
    return (kNum - bbNum).toFixed(1) + "%";
  };

  const handleExportGameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.setAttribute("href", `/api/game/${encodeURIComponent(String(game.id))}/csv?date=${encodeURIComponent(game.metadata.date)}&_=${Date.now()}`);
    link.setAttribute("download", `MLB_GAME_${game.id}_${game.metadata.date}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatOdds = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "N/D";
    if (value > 1 && value < 20) return value.toFixed(2);
    if (value > 0) return (1 + value / 100).toFixed(2);
    if (value < 0) return (1 + 100 / Math.abs(value)).toFixed(2);
    return "N/D";
  };

  const inningsToDecimal = (ip: string | number | undefined) => {
    const raw = String(ip ?? "0.0");
    const [wholeRaw, outsRaw = "0"] = raw.split(".");
    const whole = parseInt(wholeRaw, 10) || 0;
    const outs = Math.min(parseInt(outsRaw, 10) || 0, 2);
    return whole + outs / 3;
  };

  const formatKPerIp = (pitcher: any) => {
    const strikeouts = Number(pitcher.totalStrikeouts);
    const ip = inningsToDecimal(pitcher.ip);
    if (!Number.isFinite(strikeouts) || ip <= 0) return "N/D";
    return (strikeouts / ip).toFixed(2);
  };

  const formatPitcherValue = (value: any) => {
    if (value === null || value === undefined || value === "") return "N/D";
    return value;
  };

  const formatNumber = (value: any, decimals = 1, suffix = "") => {
    if (value === null || value === undefined || value === "" || value === "N/A") return "N/D";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return `${value}${suffix}`;
    return `${numeric.toFixed(decimals).replace(/\.0$/, "")}${suffix}`;
  };

  const formatPct = (value: any) => formatNumber(value, 1, "%");

  const getPitcherRoleLabel = (bfPerStart: any, projectedPitches: any) => {
    const bf = Number(bfPerStart);
    const projected = Number(projectedPitches);
    if ((Number.isFinite(bf) && bf < 15) || (Number.isFinite(projected) && projected < 55)) return "Short role / Opener";
    if (Number.isFinite(bf) && bf < 18) return "Limited starter";
    if (Number.isFinite(bf) && bf < 21) return "Low volume starter";
    if (Number.isFinite(bf) && bf < 24) return "Normal starter";
    if (Number.isFinite(bf)) return "High volume starter";
    return "N/D";
  };

  const getPitcherModalData = (side: "home" | "away") => {
    const pitcher = game.pitchers[side];
    const adv = game.advanced_pitching;
    const seasonAdv = side === "home" ? adv?.home : adv?.away;
    const last7 = side === "home" ? adv?.homeLast7 : adv?.awayLast7;
    const vsOpp = side === "home" ? adv?.homeVsOpp : adv?.awayVsOpp;
    const fatigue = game.fatigue_metrics?.pitchers?.[side];
    const teamName = side === "home" ? game.metadata.homeTeam : game.metadata.awayTeam;
    const opponentName = side === "home" ? game.metadata.awayTeam : game.metadata.homeTeam;
    const projected = seasonAdv?.projectedPitchCount;
    const projectedInnings = seasonAdv?.projectedInnings;
    const bfPerStart = seasonAdv?.battersFacedPerStart;
    const roleLabel = getPitcherRoleLabel(bfPerStart, projected);

    const totals = [
      ["Salidas", pitcher.starts],
      ["IP temporada", pitcher.ip],
      ["Ponches totales", pitcher.totalStrikeouts],
      ["Boletos totales", pitcher.totalWalks],
      ["Record", `${pitcher.wins ?? "N/D"}-${pitcher.losses ?? "N/D"}`],
      ["Ks reales hoy", seasonAdv?.actualStrikeouts],
    ];

    const averages = [
      ["ERA", typeof pitcher.era === "number" ? pitcher.era.toFixed(2) : pitcher.era],
      ["WHIP", typeof pitcher.whip === "number" ? pitcher.whip.toFixed(2) : pitcher.whip],
      ["K%", formatPct(pitcher.kPct)],
      ["BB%", formatPct(pitcher.bbPct)],
      ["K-BB%", calcKMinusBb(pitcher.kPct, pitcher.bbPct)],
      ["K/IP", formatKPerIp(pitcher)],
      ["FIP", formatNumber(seasonAdv?.fip, 2)],
      ["xFIP", formatNumber(seasonAdv?.xFip, 2)],
      ["SIERA", formatNumber(seasonAdv?.siera, 2)],
      ["xERA", formatNumber(seasonAdv?.xEra, 2)],
      ["SwStr%", formatPct(seasonAdv?.swingingStrikePct)],
      ["CSW%", formatPct(seasonAdv?.cswPct)],
      ["GB%", formatPct(seasonAdv?.groundBallPct)],
      ["FB%", formatPct(seasonAdv?.flyBallPct)],
      ["HardHit%", formatPct(seasonAdv?.hardHitPct)],
      ["Barrel%", formatPct(seasonAdv?.barrelPct)],
      ["Últ.5 K avg", formatNumber(seasonAdv?.last5KsAvg, 2)],
      ["Últ.5 IP avg", formatNumber(seasonAdv?.last5IpAvg, 1)],
      ["Últ.5 BF avg", formatNumber(seasonAdv?.last5BfAvg, 1)],
      ["Últ.5 pitcheos avg", formatNumber(seasonAdv?.last5PitchCountAvg, 0)],
      ["Vs rival K%", formatPct(vsOpp?.careerKPctVsTeam ?? vsOpp?.strikeoutRate)],
      ["Últ.3 vs rival K avg", formatNumber(seasonAdv?.last3VsTeamKsAvg, 2)],
      ["Últ.3 vs rival BF avg", formatNumber(seasonAdv?.last3VsTeamBfAvg, 1)],
    ];

    const projections = [
      ["Pitcheos proyectados", projected],
      ["Innings proyectados", formatNumber(projectedInnings, 1)],
      ["Rol estimado", roleLabel],
      ["BF/start", formatNumber(bfPerStart, 1)],
      ["Descanso", fatigue?.daysSinceLastStart != null ? `${fatigue.daysSinceLastStart} días` : "N/D"],
      ["Pitcheos última salida", fatigue?.pitchesLastStart],
      ["Pitcheos últimas 3", fatigue?.pitchesLast3Starts],
      ["Prom. últimas 3", fatigue?.pitchesLast3Starts != null ? formatNumber(Number(fatigue.pitchesLast3Starts) / 3, 1) : "N/D"],
      ["Línea Ks", pitcher.strikeoutProp ?? "N/D"],
      ["Odds Over Ks", formatOdds(pitcher.strikeoutPropOverOdds)],
      ["Odds Under Ks", formatOdds(pitcher.strikeoutPropUnderOdds)],
      ["Fuente línea Ks", pitcher.strikeoutPropSource || "N/D"],
      ["Fastball%", formatPct(seasonAdv?.fastballPct)],
      ["Slider%", formatPct(seasonAdv?.sliderPct)],
      ["Curve%", formatPct(seasonAdv?.curvePct)],
      ["Changeup%", formatPct(seasonAdv?.changeupPct)],
      ["Splitter%", formatPct(seasonAdv?.splitterPct)],
      ["Catcher", seasonAdv?.catcherName || "N/D"],
      ["Framing runs", formatNumber(seasonAdv?.catcherFramingRuns, 1)],
    ];

    return { pitcher, teamName, opponentName, last7, totals, averages, projections };
  };

  const getPitcherDisplayStats = (pitcherTeam: 'away' | 'home') => {
    const season = game.pitchers[pitcherTeam];
    const adv = game.advanced_pitching;
    if (!adv) return { era: typeof season.era === 'number' ? season.era.toFixed(2) : season.era, whip: typeof season.whip === 'number' ? season.whip.toFixed(2) : season.whip, kPct: season.kPct + "%", bbPct: season.bbPct + "%", kMinusBb: calcKMinusBb(season.kPct, season.bbPct), swStrPct: "-", record: `${season.wins}-${season.losses}`, ip: season.ip, fip: "-", gbPct: "-" };

    const advSeason = pitcherTeam === 'away' ? adv.away : adv.home;
    const last7 = pitcherTeam === 'away' ? adv.awayLast7 : adv.homeLast7;
    const vsOpp = pitcherTeam === 'away' ? adv.awayVsOpp : adv.homeVsOpp;

    if (pitcherTab === "season") {
      return {
        era: typeof season.era === 'number' ? season.era.toFixed(2) : season.era,
        whip: typeof season.whip === 'number' ? season.whip.toFixed(2) : season.whip,
        kPct: season.kPct + "%",
        bbPct: season.bbPct + "%",
        kMinusBb: calcKMinusBb(season.kPct, season.bbPct),
        swStrPct: advSeason?.swingingStrikePct ? advSeason.swingingStrikePct.toFixed(1) + "%" : "-",
        record: `${season.wins}-${season.losses}`,
        ip: season.ip,
        fip: advSeason?.fip ? advSeason.fip.toFixed(2) : "-",
        gbPct: advSeason?.groundBallPct ? advSeason.groundBallPct + "%" : "-"
      };
    } else if (pitcherTab === "last7") {
      return {
        era: last7?.era || "-",
        whip: last7?.whip || "-",
        kPct: last7?.strikeoutRate ? last7.strikeoutRate + "%" : "-",
        bbPct: last7?.walkRate ? last7.walkRate + "%" : "-",
        kMinusBb: calcKMinusBb(last7?.strikeoutRate, last7?.walkRate),
        swStrPct: last7?.swingingStrikePct ? last7.swingingStrikePct.toFixed(1) + "%" : "-",
        record: `${last7?.wins || 0}-${last7?.losses || 0}`,
        ip: last7?.ip || "-",
        fip: last7?.fip ? last7.fip.toFixed(2) : "-",
        gbPct: last7?.groundBallPct ? last7.groundBallPct + "%" : "-"
      };
    } else {
      return {
        era: vsOpp?.era || "-",
        whip: vsOpp?.whip || "-",
        kPct: vsOpp?.strikeoutRate ? vsOpp.strikeoutRate + "%" : "-",
        bbPct: vsOpp?.walkRate ? vsOpp.walkRate + "%" : "-",
        kMinusBb: calcKMinusBb(vsOpp?.strikeoutRate, vsOpp?.walkRate),
        swStrPct: vsOpp?.swingingStrikePct ? vsOpp.swingingStrikePct.toFixed(1) + "%" : "-",
        record: `${vsOpp?.wins || 0}-${vsOpp?.losses || 0}`,
        ip: vsOpp?.ip || "-",
        fip: vsOpp?.fip ? vsOpp.fip.toFixed(2) : "-",
        gbPct: vsOpp?.groundBallPct ? vsOpp.groundBallPct + "%" : "-"
      };
    }
  };

  const awayStats = getPitcherDisplayStats('away');
  const homeStats = getPitcherDisplayStats('home');

  const getUsageTooltip = (usage: string) => {
    if (usage === "Alta") return "Alta fatiga. Relevistas principales muy utilizados recientemente.";
    if (usage === "Moderada") return "Fatiga moderada. Uso intermedio del bullpen clave.";
    return "Baja fatiga. Bullpen descansado.";
  };

  const getUsageBadgeClass = (usage: string) => {
    if (usage === "Alta") return "bg-red-100 text-red-800";
    if (usage === "Moderada") return "bg-amber-100 text-amber-800";
    return "bg-emerald-100 text-emerald-800";
  };

  const sumIP = (pitchers: any[]) => {
    let totalOuts = 0;
    pitchers.forEach(p => {
      const ipStr = String(p.ip || "0.0");
      const parts = ipStr.split('.');
      const innings = parseInt(parts[0], 10) || 0;
      const outs = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
      totalOuts += innings * 3 + outs;
    });
    const totalInnings = Math.floor(totalOuts / 3);
    const remainingOuts = totalOuts % 3;
    return `${totalInnings}.${remainingOuts}`;
  };

  const getBattersTotals = (batters: any[]) => {
    let ab = 0, r = 0, h = 0, rbi = 0, bb = 0, k = 0;
    batters.forEach(p => {
      ab += parseInt(p.ab, 10) || 0;
      r += parseInt(p.r, 10) || 0;
      h += parseInt(p.h, 10) || 0;
      rbi += parseInt(p.rbi, 10) || 0;
      bb += parseInt(p.bb, 10) || 0;
      k += parseInt(p.k, 10) || 0;
    });
    return { ab, r, h, rbi, bb, k };
  };

  const getPitchersTotals = (pitchers: any[]) => {
    let h = 0, r = 0, er = 0, bb = 0, k = 0;
    pitchers.forEach(p => {
      h += parseInt(p.h, 10) || 0;
      r += parseInt(p.r, 10) || 0;
      er += parseInt(p.er, 10) || 0;
      bb += parseInt(p.bb, 10) || 0;
      k += parseInt(p.k, 10) || 0;
    });
    return { ip: sumIP(pitchers), h, r, er, bb, k };
  };

  const awayBattersTotals = game.liveBoxscore ? getBattersTotals(game.liveBoxscore.away.batters) : null;
  const awayPitchersTotals = game.liveBoxscore ? getPitchersTotals(game.liveBoxscore.away.pitchers) : null;
  const homeBattersTotals = game.liveBoxscore ? getBattersTotals(game.liveBoxscore.home.batters) : null;
  const homePitchersTotals = game.liveBoxscore ? getPitchersTotals(game.liveBoxscore.home.pitchers) : null;

  const PitcherMetricSection: React.FC<{ title: string; rows: Array<[string, any]> }> = ({ title, rows }) => (
    <section className="min-w-0">
      <h4 className="text-[11px] font-display font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1.5 mb-2">
        {title}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {rows.map(([label, value]) => (
          <div key={`${title}-${label}`} className="flex justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
            <span className="text-slate-500 truncate">{label}</span>
            <strong className="text-slate-800 font-mono text-right">{formatPitcherValue(value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );

  const selectedPitcherData = selectedPitcherSide ? getPitcherModalData(selectedPitcherSide) : null;

  const formatLastUpdate = () => {
    if (!game.timestamp) return "";
    try {
      const date = new Date(game.timestamp);
      return `${date.toLocaleTimeString("es-MX", {
        timeZone: "America/Santo_Domingo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })} RD`;
    } catch {
      return "";
    }
  };

  const formatFloat = (val: any, decimals: number = 2) => {
    return typeof val === 'number' ? val.toFixed(decimals) : 'N/D';
  };

  return (
    <div className="rounded-xl overflow-hidden shadow-sm hover:shadow-md transition duration-200 font-sans bg-white border border-slate-200">
      {selectedPitcherData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={() => setSelectedPitcherSide(null)}>
          <div
            className="w-full max-w-5xl max-h-[88vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {selectedPitcherSide === "home" ? "Local" : "Visitante"} · {selectedPitcherData.teamName} vs {selectedPitcherData.opponentName}
                </div>
                <h3 className="truncate text-lg font-display font-bold text-slate-900">
                  {selectedPitcherData.pitcher.name}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[11px] font-mono text-slate-600">
                    {selectedPitcherData.pitcher.pitchHand || "R"}
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPitcherSide(null)}
                className="shrink-0 rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Cerrar detalles del pitcher"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-5 px-5 py-4">
              <PitcherMetricSection title="Totales" rows={selectedPitcherData.totals} />
              <PitcherMetricSection title="Promedios" rows={selectedPitcherData.averages} />
              <PitcherMetricSection title="Proyecciones" rows={selectedPitcherData.projections} />
            </div>
          </div>
        </div>
      )}

      {/* Game Card Header Block (Colorful Banner) */}
      <div 
        className="text-white flex flex-row justify-between items-stretch overflow-hidden rounded-t-xl border-b border-slate-200 h-[100px] sm:h-[160px]"
        style={{
          background: `linear-gradient(110deg, ${getTeamColor(game.metadata.awayTeam)} 0%, ${getTeamColor(game.metadata.awayTeam)} 49.5%, #ffffff30 49.5%, #ffffff30 50%, ${getTeamColor(game.metadata.homeTeam)} 50%, ${getTeamColor(game.metadata.homeTeam)} 100%)`
        }}
      >
        <div className="w-full flex flex-row items-center justify-between px-3 sm:px-12 py-0 h-full">
            {/* Away Team */}
            <div className="flex items-center justify-start gap-2 sm:gap-4 w-1/2 pr-2">
              {getTeamLogo(game.metadata.awayTeam) && (
                <div className="w-12 h-12 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center p-1.5 sm:p-2 shadow-xl shrink-0 border-2 border-white/20">
                  <img src={getTeamLogo(game.metadata.awayTeam) as string} alt={game.metadata.awayTeam} className="w-full h-full object-contain" />
                </div>
              )}
              <div className="flex flex-col items-start">
                <h3 className="font-display font-bold text-xl leading-tight drop-shadow-lg tracking-tight sm:hidden">
                  {getTeamAbbr(game.metadata.awayTeam)}
                </h3>
                <h3 className="font-display font-bold text-3xl leading-tight drop-shadow-lg tracking-tight hidden sm:block">
                  {game.metadata.awayTeam}
                </h3>
                {game.trends?.away?.recordHome && game.trends.away.recordHome !== "N/D" && (
                  <span className="text-[10px] sm:text-xs font-mono font-bold tracking-wider text-white/90 drop-shadow-md mt-0.5">
                    {game.trends.away.recordHome}
                  </span>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[9px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-white/80 drop-shadow-md bg-black/20 px-1.5 py-0.5 rounded backdrop-blur-sm">
                    Visitante
                  </span>
                </div>
              </div>
            </div>

            {/* Home Team */}
            <div className="flex items-center justify-end gap-2 sm:gap-4 w-1/2 pl-2">
              <div className="flex flex-col items-end">
                <h3 className="font-display font-bold text-xl leading-tight drop-shadow-lg tracking-tight sm:hidden text-right">
                  {getTeamAbbr(game.metadata.homeTeam)}
                </h3>
                <h3 className="font-display font-bold text-3xl leading-tight drop-shadow-lg text-right tracking-tight hidden sm:block">
                  {game.metadata.homeTeam}
                </h3>
                {game.trends?.home?.recordHome && game.trends.home.recordHome !== "N/D" && (
                  <span className="text-[10px] sm:text-xs font-mono font-bold tracking-wider text-white/90 drop-shadow-md mt-0.5 text-right">
                    {game.trends.home.recordHome}
                  </span>
                )}
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  <span className="text-[9px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-white/80 drop-shadow-md bg-black/20 px-1.5 py-0.5 rounded backdrop-blur-sm text-right">
                    Local
                  </span>
                </div>
              </div>
              {getTeamLogo(game.metadata.homeTeam) && (
                <div className="w-12 h-12 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center p-1.5 sm:p-2 shadow-xl shrink-0 border-2 border-white/20">
                  <img src={getTeamLogo(game.metadata.homeTeam) as string} alt={game.metadata.homeTeam} className="w-full h-full object-contain" />
                </div>
              )}
            </div>
        </div>
      </div>

      {/* Game Info & Actions Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-col lg:flex-row justify-between items-center gap-4">
        {/* Left Side: Metadata */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-center lg:justify-start">
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
            Estadio: <strong className="text-slate-700">{game.metadata.venue}</strong>
          </span>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500">ID: {game.id}</span>
            {game.validation?.isValid ? (
              <span className="bg-emerald-100 border border-emerald-200 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <CheckCircle size={10} />
                <span>Validado</span>
              </span>
            ) : (
              <span className="bg-amber-100 border border-amber-200 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <AlertTriangle size={10} />
                <span>Error</span>
              </span>
            )}
          </div>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <div className="text-slate-500 text-[10px] uppercase font-mono">
            {game.metadata.date} • {game.metadata.time}
          </div>
        </div>

        {/* Right Side: Score & Buttons */}
        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-4 w-full lg:w-auto">
          {/* Score / Status */}
          <div className="flex items-center gap-3">
            {game.game_result && !["Scheduled", "Pre-Game", "Warmup"].includes(game.game_result.gameStatus) ? (
              <>
                <div className="font-display font-bold text-lg text-slate-800 leading-none">
                  {game.linescore?.awayTotals?.runs ?? game.game_result.awayScore} - {game.linescore?.homeTotals?.runs ?? game.game_result.homeScore}
                </div>
                <div className={`text-[9px] font-mono font-bold uppercase px-2 py-1 rounded shadow-sm ${game.game_result.gameStatus.includes("Final") || game.game_result.gameStatus === "Game Over"
                    ? "bg-slate-800 text-slate-100"
                    : "bg-red-100 text-red-700 animate-pulse border border-red-200"
                  }`}>
                  {game.game_result.gameStatus}
                  {game.linescore?.currentInning && !game.game_result.gameStatus.includes("Final") && game.game_result.gameStatus !== "Game Over" && (
                    ` • ${game.linescore.inningHalf === "Top" ? "Alta" : "Baja"} ${game.linescore.currentInning}°`
                  )}
                </div>
              </>
            ) : (
              <div className="text-slate-500 font-bold text-xs tracking-wide uppercase">Por Jugar</div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            <button
              onClick={(e) => { e.stopPropagation(); setIsCardExpanded(!isCardExpanded); }}
              className={`p-2 rounded-lg border transition duration-150 flex items-center justify-center shrink-0 cursor-pointer shadow-sm ${isCardExpanded ? "bg-emerald-100 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              title={isCardExpanded ? "Ocultar detalles del juego" : "Mostrar detalles del juego"}
            >
              {isCardExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {onTogglePin && (
              <button
                onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
                className={`p-2 rounded-lg border transition duration-150 flex items-center justify-center shrink-0 cursor-pointer shadow-sm ${isPinned ? "bg-blue-100 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                title={isPinned ? "Desfijar de la lista" : "Fijar arriba de la lista"}
              >
                <Pin size={14} className={isPinned ? "fill-blue-600" : ""} />
              </button>
            )}
            {onRefresh && (
              <button
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                className="p-2 rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition duration-150 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 shadow-sm"
                title="Actualizar datos de este encuentro"
              >
                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            )}
            <button
              onClick={handleExportGameClick}
              className="p-2 rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition duration-150 flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
              title="Exportar solo este juego"
            >
              <Download size={14} />
            </button>
          </div>
        </div>
      </div>

      {isCardExpanded && (
        <div className="bg-slate-50 border-t border-slate-200">
          
          {/* Live Progress Indicator — solo para juegos en curso */}
          {(() => {
            const status = game.game_result?.gameStatus || '';
            const isActuallyLive =
              status.includes('In Progress') ||
              status.includes('Challenge') ||
              status.includes('Delayed') ||
              status === 'Live' ||
              (status.includes('Postponed') && !!game.linescore?.currentInning);
            return isActuallyLive && game.linescore ? (
              <div className="mb-4">
                <LiveFieldUI
                  linescore={game.linescore}
                  liveBoxscore={game.liveBoxscore}
                  gameStatus={status}
                  homeTeam={game.teams.home}
                  awayTeam={game.teams.away}
                />
              </div>
            ) : null;
          })()}

          {/* Tab Selector */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 border-b border-slate-200 p-4 bg-slate-100/50">
            <button
              onClick={() => setActiveTab("resumen")}
              className={`col-span-2 sm:col-span-3 lg:col-span-1 px-2 py-2 rounded-lg text-[11px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "resumen" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
            >
              Resumen General
            </button>
            <button
              onClick={() => setActiveTab("lineups")}
              className={`col-span-1 px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "lineups" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
            >
              Alineaciones
            </button>
            <button
              onClick={() => setActiveTab("boxscore")}
              className={`col-span-1 px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "boxscore" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
            >
              Boxscore & PxP
            </button>
            <button
              onClick={() => setActiveTab("splits")}
              className={`col-span-1 px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "splits" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
            >
              Splits LHP/RHP
            </button>
            <button
              onClick={() => setActiveTab("fatigue")}
              className={`col-span-1 px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "fatigue" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
            >
              Descanso
            </button>
            <button
              onClick={() => setActiveTab("sabermetrics")}
              className={`col-span-1 px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "sabermetrics" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
            >
              Sabermetría
            </button>
            <button
              onClick={() => setActiveTab("injuries")}
              className={`col-span-1 px-1 py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition cursor-pointer flex items-center justify-center text-center shadow-sm ${activeTab === "injuries" ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
            >
              Lesiones
            </button>
          </div>

          <div className="p-0 sm:p-6 font-sans text-slate-700 text-sm leading-relaxed space-y-4">
            {activeTab === "resumen" && (
              <>
                {/* Main Stats Bento-Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 sm:p-0">

        {/* Column 1: Pitchers Matchup Comparison */}
        <div className="border border-slate-100 rounded-lg p-4 bg-slate-50/50 space-y-4">
          <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-700">
                Abridor Proyectado
              </h4>
              <div className="flex bg-slate-200/50 p-0.5 rounded border border-slate-200 w-fit">
                <button onClick={() => setPitcherTab("season")} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition ${pitcherTab === "season" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Temp</button>
                <button onClick={() => setPitcherTab("last7")} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition ${pitcherTab === "last7" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Últ. 7</button>
                <button onClick={() => setPitcherTab("vsOpp")} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition ${pitcherTab === "vsOpp" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>Vs Opp</button>
              </div>
            </div>
            <span className="text-[10px] font-mono font-medium text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded self-start mt-1">
              Savant / Fans
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            {/* Away Pitcher */}
            <div className="space-y-1.5 border-r border-slate-200/60 pr-2">
              <button
                type="button"
                onClick={() => setSelectedPitcherSide("away")}
                className="block max-w-full text-left text-blue-900 font-bold font-display truncate underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-300 rounded"
                title={game.pitchers.away.name}
              >
                {game.pitchers.away.name}
                <span className="ml-1 text-[9px] font-mono font-bold text-blue-700 bg-blue-100 px-1 rounded">
                  ({game.pitchers.away.pitchHand || "R"})
                </span>
              </button>
              <span className="text-[9px] font-bold font-mono tracking-wider bg-blue-100 uppercase text-blue-800 px-1.5 py-0.5 rounded flex items-center gap-1 w-fit">
                {getTeamLogo(game.metadata.awayTeam) && (
                  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center p-[2px] shadow-sm shrink-0">
                    <img src={getTeamLogo(game.metadata.awayTeam) as string} alt={game.metadata.awayTeam} className="w-full h-full object-contain" />
                  </div>
                )}
                Visitante
              </span>

              <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-mono">
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">Salidas</span><strong className="text-slate-800">{formatPitcherValue(game.pitchers.away.starts)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">K Tot</span><strong className="text-slate-800">{formatPitcherValue(game.pitchers.away.totalStrikeouts)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">BB Tot</span><strong className="text-slate-800">{formatPitcherValue(game.pitchers.away.totalWalks)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">IP</span><strong className="text-slate-800">{formatPitcherValue(game.pitchers.away.ip)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">K/IP</span><strong className="text-slate-800">{formatKPerIp(game.pitchers.away)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">Record</span><strong className="text-slate-800">{awayStats.record}</strong></div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Proyección de Hoy</div>
                <div className="grid grid-cols-4 gap-1 text-[10px] font-mono text-center">
                   <div className="bg-slate-100/80 border border-slate-100 rounded py-1 flex flex-col justify-center">
                      <span className="text-[8px] text-slate-400 uppercase leading-none mb-0.5" title="Innings Proyectados">IP</span>
                      <strong className="text-slate-800 leading-none">{game.advanced_pitching?.away?.projectedInnings != null ? formatNumber(game.advanced_pitching.away.projectedInnings, 1) : "-"}</strong>
                   </div>
                   <div className="bg-slate-100/80 border border-slate-100 rounded py-1 flex flex-col justify-center">
                      <span className="text-[8px] text-slate-400 uppercase leading-none mb-0.5" title="Pitcheos Proyectados">PITCH</span>
                      <strong className="text-slate-800 leading-none">{game.advanced_pitching?.away?.projectedPitchCount ?? "-"}</strong>
                   </div>
                   <div className="bg-slate-100/80 border border-slate-100 rounded py-1 flex flex-col justify-center">
                      <span className="text-[8px] text-slate-400 uppercase leading-none mb-0.5" title="Bateadores Enfrentados">BF</span>
                      <strong className="text-slate-800 leading-none">{game.advanced_pitching?.away?.battersFacedPerStart != null ? formatNumber(game.advanced_pitching.away.battersFacedPerStart, 1) : "-"}</strong>
                   </div>
                   <div className="bg-slate-100/80 border border-slate-100 rounded py-1 flex flex-col justify-center">
                      <span className="text-[8px] text-slate-400 uppercase leading-none mb-0.5" title="Ponches Proyectados">K's</span>
                      <strong className="text-slate-800 leading-none">{game.advanced_pitching?.away?.projectedStrikeoutsBase != null ? formatNumber(game.advanced_pitching.away.projectedStrikeoutsBase, 2) : "-"}</strong>
                   </div>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600">
                <div className="flex justify-between"><span title="Efectividad (Earned Run Average): Promedio de carreras limpias permitidas por cada 9 entradas." className="cursor-help border-b border-dotted border-slate-400">ERA:</span> <strong className="text-slate-800">{awayStats.era}</strong></div>
                <div className="flex justify-between"><span title="FIP (Fielding Independent Pitching): Estima la efectividad basada sólo en ponches, boletos, HBP y HR." className="cursor-help border-b border-dotted border-slate-400">FIP:</span> <strong className="text-slate-800">{awayStats.fip}</strong></div>
                <div className="flex justify-between"><span title="WHIP: Bases por bolas + Hits permitidos por entrada lanzada. Menor es mejor." className="cursor-help border-b border-dotted border-slate-400">WHIP:</span> <strong className="text-slate-800">{awayStats.whip}</strong></div>
                <div className="flex justify-between"><span title="Porcentaje de Ponches: Frecuencia con la que el lanzador poncha al bateador." className="cursor-help border-b border-dotted border-slate-400">K%:</span> <strong className="text-slate-800">{awayStats.kPct}</strong></div>
                {game.pitchers.away.strikeoutProp != null && (
                  <div className="flex justify-between items-center text-indigo-900 bg-indigo-50/50 -mx-1 px-1 rounded"><span title="Línea de Ponches de Las Vegas." className="cursor-help font-bold">Línea Ks:</span> 
                    <div className="text-right leading-tight">
                       <strong>{game.pitchers.away.strikeoutProp}</strong>
                       <div className="text-[8px] text-indigo-600 font-mono -mt-0.5">O:{formatOdds(game.pitchers.away.strikeoutPropOverOdds)} U:{formatOdds(game.pitchers.away.strikeoutPropUnderOdds)}</div>
                    </div>
                  </div>
                )}
                <div className="flex justify-between"><span title="Porcentaje de Boletos: Frecuencia con la que el lanzador otorga bases por bolas." className="cursor-help border-b border-dotted border-slate-400">BB%:</span> <strong className="text-slate-800">{awayStats.bbPct}</strong></div>
                <div className="flex justify-between"><span title="Ponches menos Boletos: Un indicador superior del dominio del lanzador." className="cursor-help border-b border-dotted border-slate-400">K-BB%:</span> <strong className="text-slate-800">{awayStats.kMinusBb}</strong></div>
                <div className="flex justify-between"><span title="Porcentaje de Strikes Abanicados (Swinging Strike %)." className="cursor-help border-b border-dotted border-slate-400">SwStr%:</span> <strong className="text-slate-800">{awayStats.swStrPct}</strong></div>
                <div className="flex justify-between"><span title="Ground Ball % (Porcentaje de roletazos permitidos)." className="cursor-help border-b border-dotted border-slate-400">GB%:</span> <strong className="text-slate-800">{awayStats.gbPct}</strong></div>
              </div>
            </div>

            {/* Home Pitcher */}
            <div className="space-y-1.5 pl-1">
              <button
                type="button"
                onClick={() => setSelectedPitcherSide("home")}
                className="block max-w-full text-left text-red-900 font-bold font-display truncate underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-red-300 rounded"
                title={game.pitchers.home.name}
              >
                {game.pitchers.home.name}
                <span className="ml-1 text-[9px] font-mono font-bold text-red-700 bg-red-100 px-1 rounded">
                  ({game.pitchers.home.pitchHand || "R"})
                </span>
              </button>
              <span className="text-[9px] font-bold font-mono tracking-wider bg-red-100 uppercase text-red-800 px-1.5 py-0.5 rounded flex items-center gap-1 w-fit">
                {getTeamLogo(game.metadata.homeTeam) && (
                  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center p-[2px] shadow-sm shrink-0">
                    <img src={getTeamLogo(game.metadata.homeTeam) as string} alt={game.metadata.homeTeam} className="w-full h-full object-contain" />
                  </div>
                )}
                Local
              </span>

              <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-mono">
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">Salidas</span><strong className="text-slate-800">{formatPitcherValue(game.pitchers.home.starts)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">K Tot</span><strong className="text-slate-800">{formatPitcherValue(game.pitchers.home.totalStrikeouts)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">BB Tot</span><strong className="text-slate-800">{formatPitcherValue(game.pitchers.home.totalWalks)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">IP</span><strong className="text-slate-800">{formatPitcherValue(game.pitchers.home.ip)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">K/IP</span><strong className="text-slate-800">{formatKPerIp(game.pitchers.home)}</strong></div>
                <div className="bg-white border border-slate-200 rounded px-1 py-1"><span className="block text-slate-400 uppercase">Record</span><strong className="text-slate-800">{homeStats.record}</strong></div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Proyección de Hoy</div>
                <div className="grid grid-cols-4 gap-1 text-[10px] font-mono text-center">
                   <div className="bg-slate-100/80 border border-slate-100 rounded py-1 flex flex-col justify-center">
                      <span className="text-[8px] text-slate-400 uppercase leading-none mb-0.5" title="Innings Proyectados">IP</span>
                      <strong className="text-slate-800 leading-none">{game.advanced_pitching?.home?.projectedInnings != null ? formatNumber(game.advanced_pitching.home.projectedInnings, 1) : "-"}</strong>
                   </div>
                   <div className="bg-slate-100/80 border border-slate-100 rounded py-1 flex flex-col justify-center">
                      <span className="text-[8px] text-slate-400 uppercase leading-none mb-0.5" title="Pitcheos Proyectados">PITCH</span>
                      <strong className="text-slate-800 leading-none">{game.advanced_pitching?.home?.projectedPitchCount ?? "-"}</strong>
                   </div>
                   <div className="bg-slate-100/80 border border-slate-100 rounded py-1 flex flex-col justify-center">
                      <span className="text-[8px] text-slate-400 uppercase leading-none mb-0.5" title="Bateadores Enfrentados">BF</span>
                      <strong className="text-slate-800 leading-none">{game.advanced_pitching?.home?.battersFacedPerStart != null ? formatNumber(game.advanced_pitching.home.battersFacedPerStart, 1) : "-"}</strong>
                   </div>
                   <div className="bg-slate-100/80 border border-slate-100 rounded py-1 flex flex-col justify-center">
                      <span className="text-[8px] text-slate-400 uppercase leading-none mb-0.5" title="Ponches Proyectados">K's</span>
                      <strong className="text-slate-800 leading-none">{game.advanced_pitching?.home?.projectedStrikeoutsBase != null ? formatNumber(game.advanced_pitching.home.projectedStrikeoutsBase, 2) : "-"}</strong>
                   </div>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600">
                <div className="flex justify-between"><span title="Efectividad (Earned Run Average): Promedio de carreras limpias permitidas por cada 9 entradas." className="cursor-help border-b border-dotted border-slate-400">ERA:</span> <strong className="text-slate-800">{homeStats.era}</strong></div>
                <div className="flex justify-between"><span title="FIP (Fielding Independent Pitching): Estima la efectividad basada sólo en ponches, boletos, HBP y HR." className="cursor-help border-b border-dotted border-slate-400">FIP:</span> <strong className="text-slate-800">{homeStats.fip}</strong></div>
                <div className="flex justify-between"><span title="WHIP: Bases por bolas + Hits permitidos por entrada lanzada. Menor es mejor." className="cursor-help border-b border-dotted border-slate-400">WHIP:</span> <strong className="text-slate-800">{homeStats.whip}</strong></div>
                <div className="flex justify-between"><span title="Porcentaje de Ponches: Frecuencia con la que el lanzador poncha al bateador." className="cursor-help border-b border-dotted border-slate-400">K%:</span> <strong className="text-slate-800">{homeStats.kPct}</strong></div>
                {game.pitchers.home.strikeoutProp != null && (
                  <div className="flex justify-between items-center text-indigo-900 bg-indigo-50/50 -mx-1 px-1 rounded"><span title="Línea de Ponches de Las Vegas." className="cursor-help font-bold">Línea Ks:</span> 
                    <div className="text-right leading-tight">
                       <strong>{game.pitchers.home.strikeoutProp}</strong>
                       <div className="text-[8px] text-indigo-600 font-mono -mt-0.5">O:{formatOdds(game.pitchers.home.strikeoutPropOverOdds)} U:{formatOdds(game.pitchers.home.strikeoutPropUnderOdds)}</div>
                    </div>
                  </div>
                )}
                <div className="flex justify-between"><span title="Porcentaje de Boletos: Frecuencia con la que el lanzador otorga bases por bolas." className="cursor-help border-b border-dotted border-slate-400">BB%:</span> <strong className="text-slate-800">{homeStats.bbPct}</strong></div>
                <div className="flex justify-between"><span title="Ponches menos Boletos: Un indicador superior del dominio del lanzador." className="cursor-help border-b border-dotted border-slate-400">K-BB%:</span> <strong className="text-slate-800">{homeStats.kMinusBb}</strong></div>
                <div className="flex justify-between"><span title="Porcentaje de Strikes Abanicados (Swinging Strike %)." className="cursor-help border-b border-dotted border-slate-400">SwStr%:</span> <strong className="text-slate-800">{homeStats.swStrPct}</strong></div>
                <div className="flex justify-between"><span title="Ground Ball % (Porcentaje de roletazos permitidos)." className="cursor-help border-b border-dotted border-slate-400">GB%:</span> <strong className="text-slate-800">{homeStats.gbPct}</strong></div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Bullpen & Offense Workload */}
        <div className="border border-slate-100 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between space-y-4">

          <div>
            <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
              <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-700">
                Relevo y Bullpen (Últimos 3 días)
              </h4>
            </div>

            <div className="mt-2 text-xs grid grid-cols-2 gap-3 font-sans">
              <div className="space-y-1">
                <div className="text-slate-500 font-semibold font-display text-[10px] uppercase">Bullpen Visitante</div>
                <div className="text-slate-700">ERA: <strong className="font-mono">{game.bullpen.away.era}</strong></div>
                <div className="flex gap-1 items-center">
                  <span className="text-slate-500">Uso:</span>
                  <span title={getUsageTooltip(game.bullpen.away.usageLast3Days)} className={`px-1 cursor-help border-b border-dotted border-slate-400/50 rounded text-[9px] uppercase font-bold font-mono ${getUsageBadgeClass(game.bullpen.away.usageLast3Days)}`}>
                    {game.bullpen.away.usageLast3Days}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Últ.3d: {game.bullpen.away.ipLast3Days} IP</div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-500 font-semibold font-display text-[10px] uppercase">Bullpen Local</div>
                <div className="text-slate-700">ERA: <strong className="font-mono">{game.bullpen.home.era}</strong></div>
                <div className="flex gap-1 items-center">
                  <span className="text-slate-500">Uso:</span>
                  <span title={getUsageTooltip(game.bullpen.home.usageLast3Days)} className={`px-1 cursor-help border-b border-dotted border-slate-400/50 rounded text-[9px] uppercase font-bold font-mono ${getUsageBadgeClass(game.bullpen.home.usageLast3Days)}`}>
                    {game.bullpen.home.usageLast3Days}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Últ.3d: {game.bullpen.home.ipLast3Days} IP</div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200/60 pt-3">
            <h5 className="text-[10px] font-display font-bold uppercase tracking-wider text-slate-500 pb-1.5">
              Ofensiva y Promedios (Vis. vs Loc.)
            </h5>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-0.5">
                <div className="font-sans font-bold text-blue-900 truncate flex items-center gap-1.5">
                  <span className="text-sm">{getTeamAbbr(game.metadata.awayTeam)}</span>
                  <span className="rounded bg-blue-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700">
                    Visitante
                  </span>
                </div>
                <div>Carreras/G: <strong className="text-slate-800">{game.offense.away.runsPerGame}</strong></div>
                <div>Ponches/G: <strong className="text-slate-800">{game.offense.away.strikeoutsPerGame ?? "N/D"}</strong></div>
                <div className="pt-1">OBP: <strong className="text-slate-800">{typeof game.offense.away.obp === 'number' ? game.offense.away.obp.toFixed(3) : game.offense.away.obp}</strong></div>
                <div>SLG: <strong className="text-slate-800">{typeof game.offense.away.slg === 'number' ? game.offense.away.slg.toFixed(3) : game.offense.away.slg}</strong></div>
                <div>OPS: <strong className="text-slate-800">{typeof game.offense.away.ops === 'number' ? game.offense.away.ops.toFixed(3) : game.offense.away.ops}</strong></div>
              </div>

              <div className="space-y-0.5">
                <div className="font-sans font-bold text-red-900 truncate flex items-center gap-1.5">
                  <span className="text-sm">{getTeamAbbr(game.metadata.homeTeam)}</span>
                  <span className="rounded bg-red-50 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                    Local
                  </span>
                </div>
                <div>Carreras/G: <strong className="text-slate-800">{game.offense.home.runsPerGame}</strong></div>
                <div>Ponches/G: <strong className="text-slate-800">{game.offense.home.strikeoutsPerGame ?? "N/D"}</strong></div>
                <div className="pt-1">OBP: <strong className="text-slate-800">{typeof game.offense.home.obp === 'number' ? game.offense.home.obp.toFixed(3) : game.offense.home.obp}</strong></div>
                <div>SLG: <strong className="text-slate-800">{typeof game.offense.home.slg === 'number' ? game.offense.home.slg.toFixed(3) : game.offense.home.slg}</strong></div>
                <div>OPS: <strong className="text-slate-800">{typeof game.offense.home.ops === 'number' ? game.offense.home.ops.toFixed(3) : game.offense.home.ops}</strong></div>
              </div>
            </div>
          </div>

        </div>



      </div>



              </>
            )}

            {/* TAB: Lineups Comparison */}
            {activeTab === "lineups" && game.lineups && (
              <div className="grid grid-cols-1 gap-6 mb-2">
                {/* Away Lineup */}
                <div className="overflow-x-auto w-full">
                  <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm">
                  <div className="bg-slate-800 text-white px-4 py-2.5 font-display font-bold text-xs md:text-sm uppercase tracking-wider flex justify-between">
                    <span>Alineación Visitante ({game.metadata.awayTeam})</span>
                    <div className="flex gap-2 text-right shrink-0 font-mono text-[10px] md:text-xs text-slate-300">
                      <span className="w-10 cursor-help border-b border-dotted border-slate-400" title="Promedio de Bateo (Batting Average).">AVG</span>
                      <span className="w-10 cursor-help border-b border-dotted border-slate-400" title="OPS (On-base Plus Slugging): Suma del porcentaje de embasado y el slugging.">OPS</span>
                      <span className="hidden md:inline-block w-9 cursor-help border-b border-dotted border-slate-400" title="Cuadrangulares (Home Runs).">HR</span>
                      <span className="hidden md:inline-block w-9 cursor-help border-b border-dotted border-slate-400" title="wOBA (Weighted On-Base Average): Métrica ponderada de embasado.">wOBA</span>
                      <span className="w-9 cursor-help border-b border-dotted border-slate-400" title="K% (Strikeout Percentage) del bateador.">K%</span>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 font-mono text-xs md:text-sm">
                    {game.lineups.away.map((player, idx) => (
                      <React.Fragment key={idx}>
                        <div 
                          onClick={() => togglePlayerExpansion("away", idx)}
                          className={`px-4 py-2.5 flex justify-between items-center hover:bg-slate-50/80 transition cursor-pointer ${expandedPlayer === `away-${idx}` ? "bg-slate-50 font-semibold" : ""}`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-slate-400 font-semibold w-3 text-right text-[11px] md:text-xs">{idx + 1}</span>
                            <span className="bg-slate-100 text-slate-600 px-1 rounded text-[10px] font-bold shrink-0 w-8 text-center">{player.position}</span>
                            <span className="text-slate-900 font-sans font-semibold text-xs md:text-sm truncate" title={player.name}>{player.name}</span>
                            {player.totalBasesProp != null && (
                              <span title={`Bases totales DataStreak: O ${formatOdds(player.totalBasesPropOverOdds)} / U ${formatOdds(player.totalBasesPropUnderOdds)}`} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                TB {player.totalBasesProp}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 text-right shrink-0">
                            <span className="text-slate-800 font-bold w-10">{player.avg.toFixed(3).substring(1)}</span>
                            <span className="text-blue-600 w-10">{player.ops.toFixed(3)}</span>
                            <span className="hidden md:inline-block text-slate-500 w-9">{player.hr}</span>
                            <span className="hidden md:inline-block text-slate-500 w-9">{player.woba != null ? player.woba.toFixed(3).substring(1) : "-"}</span>
                            <span className="text-red-600 w-9 font-bold">{player.strikeout_pct != null ? `${player.strikeout_pct.toFixed(0)}%` : (player.kPct != null ? `${Number(player.kPct).toFixed(0)}%` : "-")}</span>
                          </div>
                        </div>
                        {expandedPlayer === `away-${idx}` && (
                          <div className="bg-slate-50/70 border-t border-b border-slate-200/60 px-5 py-3 grid grid-cols-2 gap-4 text-[11px] md:text-xs font-sans text-slate-600 animate-fade-in">
                            <div className="space-y-1 pr-2 border-r border-slate-200/60">
                              <div className="font-bold text-slate-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                <span>Temporada</span>
                                <span className="bg-slate-200/60 text-slate-700 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono">BAT: {player.bat_side || "R"}</span>
                              </div>
                              <div className="flex justify-between"><span>OBP / SLG:</span> <strong className="font-mono text-slate-800">{player.obp != null ? player.obp.toFixed(3) : "N/D"} / {player.slg != null ? player.slg.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>wOBA:</span> <strong className="font-mono text-emerald-600">{player.woba != null ? player.woba.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>ISO (Poder):</span> <strong className="font-mono text-slate-800">{player.iso != null ? player.iso.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>BB% (Boletos):</span> <strong className="font-mono text-slate-800">{player.walk_pct != null ? player.walk_pct.toFixed(1) + "%" : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>K% (Ponches):</span> <strong className="font-mono text-slate-800">{player.strikeout_pct != null ? player.strikeout_pct.toFixed(1) + "%" : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>Apariciones (PA):</span> <strong className="font-mono text-slate-800">{player.pa || 0} PA ({player.hits || 0} H)</strong></div>
                              <div className="flex justify-between"><span>Extra-Bases (XBH):</span> <strong className="font-mono text-slate-850">2B: {player.doubles || 0} | 3B: {player.triples || 0} | HR: {player.home_runs || player.hr || 0}</strong></div>
                            </div>
                            <div className="space-y-1 pl-1">
                              <div className="font-bold text-slate-800 uppercase tracking-wider mb-1.5">Últimos 7 Juegos</div>
                              <div className="flex justify-between"><span>Average (AVG):</span> <strong className="font-mono text-slate-850">{player.last7_avg != null ? player.last7_avg.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>OPS / SLG:</span> <strong className="font-mono text-blue-600">{player.last7_ops != null ? player.last7_ops.toFixed(3) : "N/D"} / {player.last7_slg != null ? player.last7_slg.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>Hits:</span> <strong className="font-mono text-slate-800">{player.last7_hits || 0} H</strong></div>
                              <div className="flex justify-between"><span>Bases Totales (TB):</span> <strong className="font-mono text-slate-800">{player.last7_total_bases || 0} TB</strong></div>
                              {player.totalBasesProp != null && (
                                <div className="flex justify-between text-emerald-700 bg-emerald-50/80 -mx-1 px-1 rounded">
                                  <span>Línea TB:</span>
                                  <strong className="font-mono text-emerald-800">{player.totalBasesProp} | O:{formatOdds(player.totalBasesPropOverOdds)} U:{formatOdds(player.totalBasesPropUnderOdds)} {player.totalBasesPropBook ? `(${player.totalBasesPropBook})` : ""}</strong>
                                </div>
                              )}
                              <div className="flex justify-between"><span>Extra-Bases (XBH):</span> <strong className="font-mono text-slate-800">{player.last7_xbh || 0} XBH</strong></div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="bg-slate-50 px-4 py-2.5 flex justify-between items-center border-t border-slate-200/60 font-mono text-xs md:text-sm text-slate-700">
                    <span className="font-bold">Promedio Proyectado</span>
                    <div className="flex gap-2 text-right shrink-0 font-bold">
                      <span className="w-10 text-slate-800">{(game.lineups.away.reduce((sum, p) => sum + (p.avg || 0), 0) / game.lineups.away.length).toFixed(3).substring(1)}</span>
                      <span className="w-10 text-blue-600">{(game.lineups.away.reduce((sum, p) => sum + (p.ops || 0), 0) / game.lineups.away.length).toFixed(3)}</span>
                      <span className="hidden md:inline-block w-9">-</span>
                      <span className="hidden md:inline-block w-9">{(game.lineups.away.reduce((sum, p) => sum + (p.woba || 0), 0) / game.lineups.away.length).toFixed(3).substring(1)}</span>
                      <span className="w-9 text-red-700">{getTrueKPercentage(game.lineups.away)}%</span>
                    </div>
                  </div>
                </div>
                </div>

                {/* Home Lineup */}
                <div className="overflow-x-auto w-full">
                  <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm">
                  <div className="bg-red-950 text-white px-4 py-2.5 font-display font-bold text-xs md:text-sm uppercase tracking-wider flex justify-between">
                    <span>Alineación Local ({game.metadata.homeTeam})</span>
                    <div className="flex gap-2 text-right shrink-0 font-mono text-[10px] md:text-xs text-red-300">
                      <span className="w-10 cursor-help border-b border-dotted border-slate-400" title="Promedio de Bateo (Batting Average).">AVG</span>
                      <span className="w-10 cursor-help border-b border-dotted border-slate-400" title="OPS (On-base Plus Slugging): Suma del porcentaje de embasado y el slugging.">OPS</span>
                      <span className="hidden md:inline-block w-9 cursor-help border-b border-dotted border-slate-400" title="Cuadrangulares (Home Runs).">HR</span>
                      <span className="hidden md:inline-block w-9 cursor-help border-b border-dotted border-slate-400" title="wOBA (Weighted On-Base Average): Métrica ponderada de embasado.">wOBA</span>
                      <span className="w-9 cursor-help border-b border-dotted border-slate-400" title="K% (Strikeout Percentage) del bateador.">K%</span>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 font-mono text-xs md:text-sm">
                    {game.lineups.home.map((player, idx) => (
                      <React.Fragment key={idx}>
                        <div 
                          onClick={() => togglePlayerExpansion("home", idx)}
                          className={`px-4 py-2.5 flex justify-between items-center hover:bg-slate-50/80 transition cursor-pointer ${expandedPlayer === `home-${idx}` ? "bg-slate-50 font-semibold" : ""}`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-slate-400 font-semibold w-3 text-right text-[11px] md:text-xs">{idx + 1}</span>
                            <span className="bg-slate-100 text-slate-600 px-1 rounded text-[10px] font-bold shrink-0 w-8 text-center">{player.position}</span>
                            <span className="text-slate-900 font-sans font-semibold text-xs md:text-sm truncate" title={player.name}>{player.name}</span>
                            {player.totalBasesProp != null && (
                              <span title={`Bases totales DataStreak: O ${formatOdds(player.totalBasesPropOverOdds)} / U ${formatOdds(player.totalBasesPropUnderOdds)}`} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0">
                                TB {player.totalBasesProp}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 text-right shrink-0">
                            <span className="text-slate-800 font-bold w-10">{player.avg.toFixed(3).substring(1)}</span>
                            <span className="text-red-600 w-10">{player.ops.toFixed(3)}</span>
                            <span className="hidden md:inline-block text-slate-500 w-9">{player.hr}</span>
                            <span className="hidden md:inline-block text-slate-500 w-9">{player.woba != null ? player.woba.toFixed(3).substring(1) : "-"}</span>
                            <span className="text-red-600 w-9 font-bold">{player.strikeout_pct != null ? `${player.strikeout_pct.toFixed(0)}%` : (player.kPct != null ? `${Number(player.kPct).toFixed(0)}%` : "-")}</span>
                          </div>
                        </div>
                        {expandedPlayer === `home-${idx}` && (
                          <div className="bg-slate-50/70 border-t border-b border-slate-200/60 px-5 py-3 grid grid-cols-2 gap-4 text-[11px] md:text-xs font-sans text-slate-600 animate-fade-in">
                            <div className="space-y-1 pr-2 border-r border-slate-200/60">
                              <div className="font-bold text-slate-800 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                <span>Temporada</span>
                                <span className="bg-slate-200/60 text-slate-700 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono">BAT: {player.bat_side || "R"}</span>
                              </div>
                              <div className="flex justify-between"><span>OBP / SLG:</span> <strong className="font-mono text-slate-800">{player.obp != null ? player.obp.toFixed(3) : "N/D"} / {player.slg != null ? player.slg.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>wOBA:</span> <strong className="font-mono text-emerald-600">{player.woba != null ? player.woba.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>ISO (Poder):</span> <strong className="font-mono text-slate-800">{player.iso != null ? player.iso.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>BB% (Boletos):</span> <strong className="font-mono text-slate-800">{player.walk_pct != null ? player.walk_pct.toFixed(1) + "%" : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>K% (Ponches):</span> <strong className="font-mono text-slate-800">{player.strikeout_pct != null ? player.strikeout_pct.toFixed(1) + "%" : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>Apariciones (PA):</span> <strong className="font-mono text-slate-800">{player.pa || 0} PA ({player.hits || 0} H)</strong></div>
                              <div className="flex justify-between"><span>Extra-Bases (XBH):</span> <strong className="font-mono text-slate-850">2B: {player.doubles || 0} | 3B: {player.triples || 0} | HR: {player.home_runs || player.hr || 0}</strong></div>
                            </div>
                            <div className="space-y-1 pl-1">
                              <div className="font-bold text-slate-800 uppercase tracking-wider mb-1.5">Últimos 7 Juegos</div>
                              <div className="flex justify-between"><span>Average (AVG):</span> <strong className="font-mono text-slate-850">{player.last7_avg != null ? player.last7_avg.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>OPS / SLG:</span> <strong className="font-mono text-red-600">{player.last7_ops != null ? player.last7_ops.toFixed(3) : "N/D"} / {player.last7_slg != null ? player.last7_slg.toFixed(3) : "N/D"}</strong></div>
                              <div className="flex justify-between"><span>Hits:</span> <strong className="font-mono text-slate-800">{player.last7_hits || 0} H</strong></div>
                              <div className="flex justify-between"><span>Bases Totales (TB):</span> <strong className="font-mono text-slate-800">{player.last7_total_bases || 0} TB</strong></div>
                              {player.totalBasesProp != null && (
                                <div className="flex justify-between text-emerald-700 bg-emerald-50/80 -mx-1 px-1 rounded">
                                  <span>Línea TB:</span>
                                  <strong className="font-mono text-emerald-800">{player.totalBasesProp} | O:{formatOdds(player.totalBasesPropOverOdds)} U:{formatOdds(player.totalBasesPropUnderOdds)} {player.totalBasesPropBook ? `(${player.totalBasesPropBook})` : ""}</strong>
                                </div>
                              )}
                              <div className="flex justify-between"><span>Extra-Bases (XBH):</span> <strong className="font-mono text-slate-800">{player.last7_xbh || 0} XBH</strong></div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="bg-slate-50 px-4 py-2.5 flex justify-between items-center border-t border-slate-200/60 font-mono text-xs md:text-sm text-slate-700">
                    <span className="font-bold">Promedio Proyectado</span>
                    <div className="flex gap-2 text-right shrink-0 font-bold">
                      <span className="w-10 text-slate-800">{(game.lineups.home.reduce((sum, p) => sum + (p.avg || 0), 0) / game.lineups.home.length).toFixed(3).substring(1)}</span>
                      <span className="w-10 text-red-600">{(game.lineups.home.reduce((sum, p) => sum + (p.ops || 0), 0) / game.lineups.home.length).toFixed(3)}</span>
                      <span className="hidden md:inline-block w-9">-</span>
                      <span className="hidden md:inline-block w-9">{(game.lineups.home.reduce((sum, p) => sum + (p.woba || 0), 0) / game.lineups.home.length).toFixed(3).substring(1)}</span>
                      <span className="w-9 text-red-700">{getTrueKPercentage(game.lineups.home)}%</span>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* TAB: Boxscore & PxP */}
            {activeTab === "boxscore" && (
              <div className="space-y-6">
                {/* Linescore */}
                {game.linescore && (
                  <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm">
                    <div className="bg-slate-800 text-white px-4 py-2 font-display font-bold text-xs uppercase tracking-wider">
                      Pizarra (Linescore)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono text-center">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 text-left font-sans font-semibold">Equipo</th>
                            {game.linescore.innings.map(i => <th key={i.num} className="py-2 px-2">{i.num}</th>)}
                            <th className="py-2 px-3 bg-slate-100 font-bold text-slate-700">R</th>
                            <th className="py-2 px-3 bg-slate-100 font-bold text-slate-700">H</th>
                            <th className="py-2 px-3 bg-slate-100 font-bold text-slate-700">E</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="py-2 px-3 text-left font-sans font-bold text-blue-900">{game.metadata.awayTeam}</td>
                            {game.linescore.innings.map(i => <td key={i.num} className="py-2 px-2">{i.away.runs !== undefined ? i.away.runs : '-'}</td>)}
                            <td className="py-2 px-3 bg-slate-50 font-bold text-slate-800">{game.linescore.awayTotals?.runs || 0}</td>
                            <td className="py-2 px-3 bg-slate-50 font-bold text-slate-800">{game.linescore.awayTotals?.hits || 0}</td>
                            <td className="py-2 px-3 bg-slate-50 font-bold text-slate-800">{game.linescore.awayTotals?.errors || 0}</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3 text-left font-sans font-bold text-red-900">{game.metadata.homeTeam}</td>
                            {game.linescore.innings.map(i => <td key={i.num} className="py-2 px-2">{i.home.runs !== undefined ? i.home.runs : '-'}</td>)}
                            <td className="py-2 px-3 bg-slate-50 font-bold text-slate-800">{game.linescore.homeTotals?.runs || 0}</td>
                            <td className="py-2 px-3 bg-slate-50 font-bold text-slate-800">{game.linescore.homeTotals?.hits || 0}</td>
                            <td className="py-2 px-3 bg-slate-50 font-bold text-slate-800">{game.linescore.homeTotals?.errors || 0}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Live Boxscore */}
                {game.liveBoxscore && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Away Live Stats */}
                    <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse table-fixed">
                          <colgroup>
                            <col />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                          </colgroup>
                          <thead>
                            <tr className="bg-blue-950 text-white font-display font-bold text-[10px] uppercase tracking-wider">
                              <th className="py-2 px-2 text-left truncate">Bateadores Visitantes</th>
                              <th className="py-2 px-1 text-center font-mono text-blue-300">AB</th>
                              <th className="py-2 px-1 text-center font-mono text-blue-300">R</th>
                              <th className="py-2 px-1 text-center font-mono text-blue-300">H</th>
                              <th className="py-2 px-1 text-center font-mono text-blue-300">RBI</th>
                              <th className="py-2 px-1 text-center font-mono text-blue-300">BB</th>
                              <th className="py-2 px-1 text-center font-mono text-blue-300">SO</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                            {game.liveBoxscore.away.batters.map((player: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-2 truncate">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="bg-slate-100 text-slate-600 px-1 rounded text-[8px] font-bold shrink-0 w-6 text-center">{player.position}</span>
                                    <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                                  </div>
                                </td>
                                <td className="py-1.5 px-1 text-center text-slate-700">{player.ab}</td>
                                <td className="py-1.5 px-1 text-center font-bold text-slate-800">{player.r}</td>
                                <td className="py-1.5 px-1 text-center font-bold text-blue-700">{player.h}</td>
                                <td className="py-1.5 px-1 text-center text-slate-700">{player.rbi}</td>
                                <td className="py-1.5 px-1 text-center text-slate-400">{player.bb}</td>
                                <td className="py-1.5 px-1 text-center text-slate-400">{player.k}</td>
                              </tr>
                            ))}
                          </tbody>
                          {awayBattersTotals && (
                            <tfoot>
                              <tr className="bg-slate-100/80 font-bold border-t border-slate-300 text-slate-800 text-[10px]">
                                <td className="py-2 px-2 font-sans text-left uppercase text-[9px] tracking-wider">Totales</td>
                                <td className="py-2 px-1 text-center font-mono">{awayBattersTotals.ab}</td>
                                <td className="py-2 px-1 text-center font-mono">{awayBattersTotals.r}</td>
                                <td className="py-2 px-1 text-center font-mono">{awayBattersTotals.h}</td>
                                <td className="py-2 px-1 text-center font-mono">{awayBattersTotals.rbi}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-600">{awayBattersTotals.bb}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-600">{awayBattersTotals.k}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>

                        <table className="w-full text-left border-collapse table-fixed mt-2">
                          <colgroup>
                            <col />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                          </colgroup>
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-display font-bold text-[10px] uppercase tracking-wider">
                              <th className="py-1.5 px-2 text-left truncate">Lanzadores</th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Innings Pitched (Entradas Lanzadas)" className="cursor-help border-b border-dotted border-slate-400/50">IP</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Hits (Imparables permitidos)" className="cursor-help border-b border-dotted border-slate-400/50">H</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Runs (Carreras permitidas)" className="cursor-help border-b border-dotted border-slate-400/50">R</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Earned Runs (Carreras Limpias permitidas)" className="cursor-help border-b border-dotted border-slate-400/50">ER</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Base on Balls (Boletos otorgados)" className="cursor-help border-b border-dotted border-slate-400/50">BB</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Strikeouts (Ponches recetados)" className="cursor-help border-b border-dotted border-slate-400/50">SO</span></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                            {game.liveBoxscore.away.pitchers.map((player: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-2 truncate">
                                  <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                                </td>
                                <td className="py-1.5 px-1 text-center font-bold text-slate-800">{player.ip}</td>
                                <td className="py-1.5 px-1 text-center text-slate-700">{player.h || 0}</td>
                                <td className="py-1.5 px-1 text-center text-slate-700">{player.r || 0}</td>
                                <td className="py-1.5 px-1 text-center font-bold text-red-600">{player.er}</td>
                                <td className="py-1.5 px-1 text-center text-slate-400">{player.bb || 0}</td>
                                <td className="py-1.5 px-1 text-center font-bold text-slate-800">{player.k || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                          {awayPitchersTotals && (
                            <tfoot>
                              <tr className="bg-slate-100/85 font-bold border-t border-slate-200 text-slate-800 text-[10px]">
                                <td className="py-2 px-2 font-sans text-left uppercase text-[9px] tracking-wider">Totales</td>
                                <td className="py-2 px-1 text-center font-mono">{awayPitchersTotals.ip}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-600">{awayPitchersTotals.h}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-600">{awayPitchersTotals.r}</td>
                                <td className="py-2 px-1 text-center font-mono">{awayPitchersTotals.er}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-500">{awayPitchersTotals.bb}</td>
                                <td className="py-2 px-1 text-center font-mono">{awayPitchersTotals.k}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>

                    {/* Home Live Stats */}
                    <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse table-fixed">
                          <colgroup>
                            <col />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                          </colgroup>
                          <thead>
                            <tr className="bg-red-950 text-white font-display font-bold text-[10px] uppercase tracking-wider">
                              <th className="py-2 px-2 text-left truncate">Bateadores Locales</th>
                              <th className="py-2 px-1 text-center font-mono text-red-300">AB</th>
                              <th className="py-2 px-1 text-center font-mono text-red-300">R</th>
                              <th className="py-2 px-1 text-center font-mono text-red-300">H</th>
                              <th className="py-2 px-1 text-center font-mono text-red-300">RBI</th>
                              <th className="py-2 px-1 text-center font-mono text-red-300">BB</th>
                              <th className="py-2 px-1 text-center font-mono text-red-300">SO</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                            {game.liveBoxscore.home.batters.map((player: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-2 truncate">
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="bg-slate-100 text-slate-600 px-1 rounded text-[8px] font-bold shrink-0 w-6 text-center">{player.position}</span>
                                    <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                                  </div>
                                </td>
                                <td className="py-1.5 px-1 text-center text-slate-700">{player.ab}</td>
                                <td className="py-1.5 px-1 text-center font-bold text-slate-800">{player.r}</td>
                                <td className="py-1.5 px-1 text-center font-bold text-red-700">{player.h}</td>
                                <td className="py-1.5 px-1 text-center text-slate-700">{player.rbi}</td>
                                <td className="py-1.5 px-1 text-center text-slate-400">{player.bb}</td>
                                <td className="py-1.5 px-1 text-center text-slate-400">{player.k}</td>
                              </tr>
                            ))}
                          </tbody>
                          {homeBattersTotals && (
                            <tfoot>
                              <tr className="bg-slate-100/80 font-bold border-t border-slate-300 text-slate-800 text-[10px]">
                                <td className="py-2 px-2 font-sans text-left uppercase text-[9px] tracking-wider">Totales</td>
                                <td className="py-2 px-1 text-center font-mono">{homeBattersTotals.ab}</td>
                                <td className="py-2 px-1 text-center font-mono">{homeBattersTotals.r}</td>
                                <td className="py-2 px-1 text-center font-mono">{homeBattersTotals.h}</td>
                                <td className="py-2 px-1 text-center font-mono">{homeBattersTotals.rbi}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-600">{homeBattersTotals.bb}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-600">{homeBattersTotals.k}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>

                        <table className="w-full text-left border-collapse table-fixed mt-2">
                          <colgroup>
                            <col />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                            <col className="w-8" />
                          </colgroup>
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-display font-bold text-[10px] uppercase tracking-wider">
                              <th className="py-1.5 px-2 text-left truncate">Lanzadores</th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Innings Pitched (Entradas Lanzadas)" className="cursor-help border-b border-dotted border-slate-400/50">IP</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Hits (Imparables permitidos)" className="cursor-help border-b border-dotted border-slate-400/50">H</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Runs (Carreras permitidas)" className="cursor-help border-b border-dotted border-slate-400/50">R</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Earned Runs (Carreras Limpias permitidas)" className="cursor-help border-b border-dotted border-slate-400/50">ER</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Base on Balls (Boletos otorgados)" className="cursor-help border-b border-dotted border-slate-400/50">BB</span></th>
                              <th className="py-1.5 px-1 text-center font-mono"><span title="Strikeouts (Ponches recetados)" className="cursor-help border-b border-dotted border-slate-400/50">SO</span></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                            {game.liveBoxscore.home.pitchers.map((player: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-2 truncate">
                                  <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                                </td>
                                <td className="py-1.5 px-1 text-center font-bold text-slate-800">{player.ip}</td>
                                <td className="py-1.5 px-1 text-center text-slate-700">{player.h || 0}</td>
                                <td className="py-1.5 px-1 text-center text-slate-700">{player.r || 0}</td>
                                <td className="py-1.5 px-1 text-center font-bold text-red-600">{player.er}</td>
                                <td className="py-1.5 px-1 text-center text-slate-400">{player.bb || 0}</td>
                                <td className="py-1.5 px-1 text-center font-bold text-slate-800">{player.k || 0}</td>
                              </tr>
                            ))}
                          </tbody>
                          {homePitchersTotals && (
                            <tfoot>
                              <tr className="bg-slate-100/85 font-bold border-t border-slate-200 text-slate-800 text-[10px]">
                                <td className="py-2 px-2 font-sans text-left uppercase text-[9px] tracking-wider">Totales</td>
                                <td className="py-2 px-1 text-center font-mono">{homePitchersTotals.ip}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-600">{homePitchersTotals.h}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-600">{homePitchersTotals.r}</td>
                                <td className="py-2 px-1 text-center font-mono">{homePitchersTotals.er}</td>
                                <td className="py-2 px-1 text-center font-mono text-slate-500">{homePitchersTotals.bb}</td>
                                <td className="py-2 px-1 text-center font-mono">{homePitchersTotals.k}</td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Play by Play */}
                {game.playByPlay && (() => {
                  const translatePlay = (desc: string): string => {
                    if (!desc) return desc;
                    return desc
                      // Resultados de turno al bate
                      .replace(/strikes out swinging/gi, 'ponche (bateado en el aire)')
                      .replace(/strikes out looking/gi, 'ponche (llamado tercer strike)')
                      .replace(/(?<!\w)strikes out(?!\s+swinging|\s+looking)/gi, 'se poncha')
                      .replace(/walks/gi, 'base por bolas')
                      .replace(/intentional walk/gi, 'base por bolas intencional')
                      .replace(/singles(?: to (\w+))?/gi, (m, loc) => `sencillo${loc ? ` al ${loc === 'left' ? 'left field' : loc === 'right' ? 'right field' : loc === 'center' ? 'center field' : loc}` : ''}`)
                      .replace(/doubles(?: to (\w+))?/gi, 'doble')
                      .replace(/triples(?: to (\w+))?/gi, 'triple')
                      .replace(/homers? \(\d+\)/gi, (m) => `jonrón ${m.match(/\((\d+)\)/)?.[0] || ''}`)
                      .replace(/\bhomers?\b/gi, 'jonrón')
                      .replace(/grounds out/gi, 'roletazo de out')
                      .replace(/grounds into double play/gi, 'doble matanza por roletazo')
                      .replace(/grounds into fielders choice/gi, 'selección del fildeador')
                      .replace(/flies out/gi, 'elevado de out')
                      .replace(/lines out/gi, 'línea de out')
                      .replace(/pops out/gi, 'palomita de out')
                      .replace(/hit by pitch/gi, 'golpeado por pitcheo')
                      .replace(/reaches on a fielding error/gi, 'llega por error de fildeo')
                      .replace(/reaches on a throwing error/gi, 'llega por error de tiro')
                      .replace(/sac fly/gi, 'elevado de sacrificio')
                      .replace(/sacrifice bunt/gi, 'toque de sacrificio')
                      .replace(/bunt/gi, 'toque')
                      // Robos y carreras
                      .replace(/steals (\w+) base/gi, (_, b) => `roba ${b === 'second' ? 'segunda' : b === 'third' ? 'tercera' : b} base`)
                      .replace(/caught stealing/gi, 'atrapado robando')
                      .replace(/scores/gi, 'anota')
                      .replace(/wild pitch/gi, 'pitcheo descontrolado')
                      .replace(/passed ball/gi, 'bola pasada')
                      .replace(/balks/gi, 'balk')
                      // Direcciones y posiciones
                      .replace(/\bleft field\b/gi, 'jardín izquierdo')
                      .replace(/\bright field\b/gi, 'jardín derecho')
                      .replace(/\bcenter field\b/gi, 'jardín central')
                      .replace(/\bshortstop\b/gi, 'campo corto')
                      .replace(/\bthird base\b/gi, 'tercera base')
                      .replace(/\bsecond base\b/gi, 'segunda base')
                      .replace(/\bfirst base\b/gi, 'primera base')
                      .replace(/\bcatcher\b/gi, 'receptor')
                      .replace(/\bpitcher\b/gi, 'lanzador')
                      // Posiciones en base
                      .replace(/\bto first\b/gi, 'a primera')
                      .replace(/\bto second\b/gi, 'a segunda')
                      .replace(/\bto third\b/gi, 'a tercera')
                      .replace(/\bto home\b/gi, 'al plato');
                  };

                  const quickFilters = [
                    { label: '⚡ Carreras', kw: 'scores' },
                    { label: '🔥 Ponches', kw: 'strikes out' },
                    { label: '🏠 Jonrones', kw: 'homer' },
                    { label: '🚶 BB', kw: 'walks' },
                    { label: '🎯 Sencillos', kw: 'singles' },
                  ];

                  return (
                  <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                    <div className="flex flex-col gap-2 border-b pb-2">
                      {/* Row 1: title + toggle + refresh */}
                      <div className="flex items-center justify-between">
                        <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-800">
                          Registro de Jugadas (Play-by-Play)
                        </h5>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-slate-500">Mostrar jugadas</span>
                          <button
                            type="button"
                            onClick={() => setShowAllPlays(!showAllPlays)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showAllPlays ? "bg-blue-600" : "bg-slate-200"}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showAllPlays ? "translate-x-4" : "translate-x-0"}`} />
                          </button>
                          <button type="button" onClick={handleRefreshClick} disabled={isRefreshing} className="p-1 rounded hover:bg-slate-200">
                            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                          </button>
                        </div>
                      </div>
                      {/* Row 2: Search + quick chips */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="relative flex-1 min-w-[160px]">
                          <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                            <Search size={11} className="text-slate-400" />
                          </div>
                          <input
                            type="text"
                            value={playSearch}
                            onChange={e => setPlaySearch(e.target.value)}
                            placeholder="Buscar jugador o jugada..."
                            className="pl-6 pr-2 py-1 text-[10px] font-sans border border-slate-200 rounded-md w-full focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                          />
                          {playSearch && (
                            <button onClick={() => setPlaySearch('')} className="absolute inset-y-0 right-1 flex items-center text-slate-400 hover:text-slate-600">
                              <X size={10} />
                            </button>
                          )}
                        </div>
                        {quickFilters.map(f => (
                          <button
                            key={f.kw}
                            onClick={() => setPlaySearch(playSearch === f.kw ? '' : f.kw)}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition whitespace-nowrap ${
                              playSearch === f.kw
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {game.playByPlay.currentPlay && (
                      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex gap-3 items-center">
                        <div className="bg-yellow-100 text-yellow-800 font-bold px-2 py-1 rounded text-[10px] shrink-0 font-mono uppercase tracking-wider">
                          Actual ({game.playByPlay.currentPlay.inning})
                        </div>
                        <div className="text-sm font-sans text-slate-800 flex-1 text-left">
                          {translatePlay(game.playByPlay.currentPlay.description)}
                        </div>
                        <div className="font-mono font-bold text-slate-900 text-sm shrink-0">
                          {game.playByPlay.currentPlay.score}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const isGameInProgress = game.game_result && 
                        !["Scheduled", "Pre-Game", "Warmup"].includes(game.game_result.gameStatus) && 
                        !game.game_result.gameStatus.includes("Final") && 
                        game.game_result.gameStatus !== "Game Over" && 
                        (game.game_result.gameStatus !== "Postponed" || !!game.linescore?.currentInning);
                      
                      const allPlays = isGameInProgress && game.playByPlay.allPlays ? [...game.playByPlay.allPlays].reverse() : game.playByPlay.allPlays;

                      const searchLower = playSearch.toLowerCase().trim();
                      const filteredPlays = searchLower && allPlays
                        ? allPlays.filter((p: any) => p.description?.toLowerCase().includes(searchLower))
                        : allPlays;

                      return (
                        <div className="space-y-2 mt-2 max-h-96 overflow-y-auto pr-1">
                          {showAllPlays ? (
                            !filteredPlays || filteredPlays.length === 0 ? (
                              <div className="text-xs text-slate-400 italic text-center py-4">
                                {searchLower ? `No hay jugadas que coincidan con "${playSearch}".` : 'No hay jugadas registradas aún.'}
                              </div>
                            ) : (
                              filteredPlays.map((play: any, idx: number) => {
                                const isScoring = play.isScoringPlay;
                                const isTop = play.inning?.toLowerCase().startsWith('top');
                                const battingTeam = isTop ? game.metadata.awayTeam : game.metadata.homeTeam;
                                const teamAbbr = getTeamAbbr(battingTeam);
                                const teamColor = getTeamColor(battingTeam);
                                return (
                                  <div key={idx} className={`flex gap-2 items-start border-b border-slate-100 pb-2 last:border-0 p-1.5 rounded transition text-left ${isScoring ? "bg-yellow-50/70 border-l-2 border-l-yellow-400" : "hover:bg-slate-50/50"}`}>
                                    {/* Inning badge */}
                                    <div className={`font-bold px-2 py-0.5 rounded text-[9px] shrink-0 font-mono mt-0.5 w-14 text-center ${isScoring ? "bg-yellow-100 text-yellow-800" : "bg-slate-100 text-slate-600"}`}>
                                      {play.inning}
                                    </div>
                                    {/* Team badge */}
                                    <div
                                      className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide text-white font-mono"
                                      style={{ background: teamColor, minWidth: '32px', textAlign: 'center' }}
                                      title={battingTeam}
                                    >
                                      {teamAbbr}
                                    </div>
                                    {/* Description */}
                                    <div className="text-xs font-sans text-slate-700 flex-1">
                                      {translatePlay(play.description)}
                                    </div>
                                    {/* Score */}
                                    <div className="font-mono font-bold text-slate-800 text-xs shrink-0 mt-0.5 bg-slate-50 px-1.5 rounded">
                                      {play.score}
                                    </div>
                                  </div>
                                );
                              })
                            )
                          ) : (
                            <div className="text-xs text-slate-400 italic text-center py-4">
                              El historial de jugadas está oculto.<br/>
                              Activa el interruptor arriba para cargar y ver todas las jugadas del partido.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  );
                })()}

              </div>
            )}

            {activeTab === "splits" && game.offensive_splits && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Away Splits */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-blue-900">
                    Splits Visitante ({game.metadata.awayTeam})
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="bg-blue-50/30 p-2.5 rounded border border-blue-100/50 space-y-1">
                      <div className="font-sans font-bold text-[10px] uppercase text-blue-800 mb-1">vs RHP</div>
                      <div className="flex justify-between"><span>AVG:</span> <strong>{game.offensive_splits.away.vsRhp.avg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="OBP (On-Base Percentage): Porcentaje de embasado." className="cursor-help border-b border-dotted border-slate-400">OBP:</span> <strong>{game.offensive_splits.away.vsRhp.obp.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="SLG (Slugging Percentage): Promedio de bases alcanzadas por turno." className="cursor-help border-b border-dotted border-slate-400">SLG:</span> <strong>{game.offensive_splits.away.vsRhp.slg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="OPS (On-base Plus Slugging): Suma del porcentaje de embasado y el slugging." className="cursor-help border-b border-dotted border-slate-400">OPS:</span> <strong className="text-blue-700">{game.offensive_splits.away.vsRhp.ops.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>HR:</span> <strong>{game.offensive_splits.away.vsRhp.hr}</strong></div>
                    </div>
                    <div className="bg-blue-50/30 p-2.5 rounded border border-blue-100/50 space-y-1">
                      <div className="font-sans font-bold text-[10px] uppercase text-blue-800 mb-1">vs LHP</div>
                      <div className="flex justify-between"><span>AVG:</span> <strong>{game.offensive_splits.away.vsLhp.avg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="OBP (On-Base Percentage): Porcentaje de embasado." className="cursor-help border-b border-dotted border-slate-400">OBP:</span> <strong>{game.offensive_splits.away.vsLhp.obp.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="SLG (Slugging Percentage): Promedio de bases alcanzadas por turno." className="cursor-help border-b border-dotted border-slate-400">SLG:</span> <strong>{game.offensive_splits.away.vsLhp.slg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="OPS (On-base Plus Slugging): Suma del porcentaje de embasado y el slugging." className="cursor-help border-b border-dotted border-slate-400">OPS:</span> <strong className="text-blue-700">{game.offensive_splits.away.vsLhp.ops.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>HR:</span> <strong>{game.offensive_splits.away.vsLhp.hr}</strong></div>
                    </div>
                  </div>
                </div>

                {/* Home Splits */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-red-900">
                    Splits Local ({game.metadata.homeTeam})
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="bg-red-50/20 p-2.5 rounded border border-red-100/40 space-y-1">
                      <div className="font-sans font-bold text-[10px] uppercase text-red-800 mb-1">vs RHP</div>
                      <div className="flex justify-between"><span>AVG:</span> <strong>{game.offensive_splits.home.vsRhp.avg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="OBP (On-Base Percentage): Porcentaje de embasado." className="cursor-help border-b border-dotted border-slate-400">OBP:</span> <strong>{game.offensive_splits.home.vsRhp.obp.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="SLG (Slugging Percentage): Promedio de bases alcanzadas por turno." className="cursor-help border-b border-dotted border-slate-400">SLG:</span> <strong>{game.offensive_splits.home.vsRhp.slg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="OPS (On-base Plus Slugging): Suma del porcentaje de embasado y el slugging." className="cursor-help border-b border-dotted border-slate-400">OPS:</span> <strong className="text-red-700">{game.offensive_splits.home.vsRhp.ops.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>HR:</span> <strong>{game.offensive_splits.home.vsRhp.hr}</strong></div>
                    </div>
                    <div className="bg-red-50/20 p-2.5 rounded border border-red-100/40 space-y-1">
                      <div className="font-sans font-bold text-[10px] uppercase text-red-800 mb-1">vs LHP</div>
                      <div className="flex justify-between"><span>AVG:</span> <strong>{game.offensive_splits.home.vsLhp.avg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="OBP (On-Base Percentage): Porcentaje de embasado." className="cursor-help border-b border-dotted border-slate-400">OBP:</span> <strong>{game.offensive_splits.home.vsLhp.obp.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="SLG (Slugging Percentage): Promedio de bases alcanzadas por turno." className="cursor-help border-b border-dotted border-slate-400">SLG:</span> <strong>{game.offensive_splits.home.vsLhp.slg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span title="OPS (On-base Plus Slugging): Suma del porcentaje de embasado y el slugging." className="cursor-help border-b border-dotted border-slate-400">OPS:</span> <strong className="text-red-700">{game.offensive_splits.home.vsLhp.ops.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>HR:</span> <strong>{game.offensive_splits.home.vsLhp.hr}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Fatigue and Rest */}
            {activeTab === "fatigue" && game.fatigue_metrics && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Away Fatigue */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-blue-900 border-b pb-1.5">
                    Carga Física Visitante ({game.metadata.awayTeam})
                  </h5>
                  <div className="space-y-3 text-xs">
                    <div className="space-y-1 font-mono">
                      <div className="font-sans font-bold text-[10px] text-slate-500 uppercase">Abridor: {game.pitchers.away.name}</div>
                      <div className="flex justify-between"><span>Días de descanso:</span> <strong className="text-slate-800">{game.fatigue_metrics.pitchers.away.daysSinceLastStart} días</strong></div>
                      <div className="flex justify-between"><span>Pitches última salida:</span> <strong className="text-slate-800">{game.fatigue_metrics.pitchers.away.pitchesLastStart}</strong></div>
                      <div className="flex justify-between"><span>Pitches últimas 3:</span> <strong className="text-slate-800">{game.fatigue_metrics.pitchers.away.pitchesLast3Starts}</strong></div>
                    </div>
                    <div className="space-y-1 font-mono border-t pt-2">
                      <div className="font-sans font-bold text-[10px] text-slate-500 uppercase">Bullpen Reciente</div>
                      <div className="flex justify-between"><span>IP últimos 3 días:</span> <strong className="text-slate-800">{game.fatigue_metrics.bullpen.away.ipLast3Days} IP</strong></div>
                      <div className="flex justify-between"><span>IP últimos 7 días:</span> <strong className="text-slate-800">{game.fatigue_metrics.bullpen.away.ipLast7Days} IP</strong></div>
                      <div className="flex justify-between"><span>Relevistas ayer:</span> <strong className="text-slate-800">{game.fatigue_metrics.bullpen.away.relieversUsedYesterday}</strong></div>
                      <div className="flex justify-between"><span>Relevistas últ. 2 días:</span> <strong className="text-slate-800">{game.fatigue_metrics.bullpen.away.relieversUsedLast2Days}</strong></div>
                      <div className="flex justify-between"><span>Disponibles hoy (est.):</span> <strong className="text-emerald-700 font-bold">{game.fatigue_metrics.bullpen.away.availableCount}</strong></div>
                    </div>
                  </div>
                </div>

                {/* Home Fatigue */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-red-900 border-b pb-1.5">
                    Carga Física Local ({game.metadata.homeTeam})
                  </h5>
                  <div className="space-y-3 text-xs">
                    <div className="space-y-1 font-mono">
                      <div className="font-sans font-bold text-[10px] text-slate-500 uppercase">Abridor: {game.pitchers.home.name}</div>
                      <div className="flex justify-between"><span>Días de descanso:</span> <strong className="text-slate-800">{game.fatigue_metrics.pitchers.home.daysSinceLastStart} días</strong></div>
                      <div className="flex justify-between"><span>Pitches última salida:</span> <strong className="text-slate-800">{game.fatigue_metrics.pitchers.home.pitchesLastStart}</strong></div>
                      <div className="flex justify-between"><span>Pitches últimas 3:</span> <strong className="text-slate-800">{game.fatigue_metrics.pitchers.home.pitchesLast3Starts}</strong></div>
                    </div>
                    <div className="space-y-1 font-mono border-t pt-2">
                      <div className="font-sans font-bold text-[10px] text-slate-500 uppercase">Bullpen Reciente</div>
                      <div className="flex justify-between"><span>IP últimos 3 días:</span> <strong className="text-slate-800">{game.fatigue_metrics.bullpen.home.ipLast3Days} IP</strong></div>
                      <div className="flex justify-between"><span>IP últimos 7 días:</span> <strong className="text-slate-800">{game.fatigue_metrics.bullpen.home.ipLast7Days} IP</strong></div>
                      <div className="flex justify-between"><span>Relevistas ayer:</span> <strong className="text-slate-800">{game.fatigue_metrics.bullpen.home.relieversUsedYesterday}</strong></div>
                      <div className="flex justify-between"><span>Relevistas últ. 2 días:</span> <strong className="text-slate-800">{game.fatigue_metrics.bullpen.home.relieversUsedLast2Days}</strong></div>
                      <div className="flex justify-between"><span>Disponibles hoy (est.):</span> <strong className="text-emerald-700 font-bold">{game.fatigue_metrics.bullpen.home.availableCount}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Sabermetrics */}
            {activeTab === "sabermetrics" && game.advanced_offense && (
              <div className="space-y-4">
                {/* Advanced Offense */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-850 border-b pb-1.5">
                    Ofensiva de Equipos - Sabermetría Real Calculada
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-blue-900 uppercase mb-1">Ataque Visitante</div>
                      <div className="flex justify-between"><span>wOBA (Calculado):</span> <strong>{formatFloat(game.advanced_offense.away.wOba, 3)}</strong></div>
                      <div className="flex justify-between"><span title="BABIP: Bateo de bolas en juego. Ayuda a ver si hay suerte involucrada." className="cursor-help border-b border-dotted border-slate-400">BABIP:</span> <strong>{formatFloat(game.advanced_offense.away.babip, 3)}</strong></div>
                      <div className="flex justify-between"><span>ISO (Poder):</span> <strong>{formatFloat(game.advanced_offense.away.iso, 3)}</strong></div>
                    </div>
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-red-900 uppercase mb-1">Ataque Local</div>
                      <div className="flex justify-between"><span>wOBA (Calculado):</span> <strong>{formatFloat(game.advanced_offense.home.wOba, 3)}</strong></div>
                      <div className="flex justify-between"><span title="BABIP: Bateo de bolas en juego. Ayuda a ver si hay suerte involucrada." className="cursor-help border-b border-dotted border-slate-400">BABIP:</span> <strong>{formatFloat(game.advanced_offense.home.babip, 3)}</strong></div>
                      <div className="flex justify-between"><span>ISO (Poder):</span> <strong>{formatFloat(game.advanced_offense.home.iso, 3)}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Injuries */}
            {activeTab === "injuries" && (
              <div className="space-y-4">
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-850 flex items-center gap-1.5">
                      <ShieldAlert size={13} className="text-red-500" />
                      Reporte de Lesiones y Bajas
                    </h5>
                    {game.injuries && game.injuries.length > 0 && (
                      <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {game.injuries.length} bajas
                      </span>
                    )}
                  </div>

                  {/* Search bar */}
                  {game.injuries && game.injuries.length > 0 && (
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={injurySearch}
                        onChange={e => setInjurySearch(e.target.value)}
                        placeholder="Buscar jugador..."
                        className="w-full text-[11px] pl-7 pr-8 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-red-300 focus:border-red-300 placeholder:text-slate-400"
                      />
                      {injurySearch && (
                        <button
                          onClick={() => setInjurySearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  )}

                  {!game.injuries || game.injuries.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-4 text-center bg-slate-50 rounded border border-slate-200 border-dashed">
                      No hay lesiones reportadas para este encuentro.
                    </div>
                  ) : (() => {
                    const q = injurySearch.toLowerCase().trim();
                    const filtered = q
                      ? game.injuries.filter((inj: any) =>
                          (inj.player || "").toLowerCase().includes(q) ||
                          (inj.team || "").toLowerCase().includes(q) ||
                          (inj.status || "").toLowerCase().includes(q) ||
                          (inj.detail || "").toLowerCase().includes(q)
                        )
                      : game.injuries;

                    if (filtered.length === 0) return (
                      <div className="text-xs text-slate-500 italic py-4 text-center bg-slate-50 rounded border border-slate-200 border-dashed">
                        No se encontraron resultados para &ldquo;{injurySearch}&rdquo;.
                      </div>
                    );

                    const awayFiltered = filtered.filter((inj: any) => inj.team === game.metadata.awayTeam);
                    const homeFiltered = filtered.filter((inj: any) => inj.team === game.metadata.homeTeam);

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Away Injuries */}
                        <div>
                          <h6 className="font-bold text-[11px] text-blue-900 uppercase mb-2 border-b border-blue-100 pb-1 flex items-center justify-between">
                            <span>Visitante ({game.metadata.awayTeam})</span>
                            <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 rounded-full">{awayFiltered.length}</span>
                          </h6>
                          <div className="space-y-2">
                            {awayFiltered.length === 0 ? (
                              <div className="text-[10px] text-slate-400 italic">Roster limpio.</div>
                            ) : (
                              awayFiltered.map((inj: any, idx: number) => (
                                <div key={idx} className="bg-red-50/30 p-2 rounded border border-red-100 text-[11px] flex flex-col gap-1 hover:bg-red-50/70 transition">
                                  <div className="flex justify-between items-start">
                                    <strong className="text-slate-800 font-sans">{inj.player}</strong>
                                    <span className="bg-red-100 text-red-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap">{inj.status}</span>
                                  </div>
                                  <span className="text-slate-600 font-mono text-[10px]">{inj.detail || "Sin detalles adicionales."}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Home Injuries */}
                        <div>
                          <h6 className="font-bold text-[11px] text-red-900 uppercase mb-2 border-b border-red-100 pb-1 flex items-center justify-between">
                            <span>Local ({game.metadata.homeTeam})</span>
                            <span className="bg-red-100 text-red-800 text-[9px] px-1.5 rounded-full">{homeFiltered.length}</span>
                          </h6>
                          <div className="space-y-2">
                            {homeFiltered.length === 0 ? (
                              <div className="text-[10px] text-slate-400 italic">Roster limpio.</div>
                            ) : (
                              homeFiltered.map((inj: any, idx: number) => (
                                <div key={idx} className="bg-red-50/30 p-2 rounded border border-red-100 text-[11px] flex flex-col gap-1 hover:bg-red-50/70 transition">
                                  <div className="flex justify-between items-start">
                                    <strong className="text-slate-800 font-sans">{inj.player}</strong>
                                    <span className="bg-red-100 text-red-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider whitespace-nowrap">{inj.status}</span>
                                  </div>
                                  <span className="text-slate-600 font-mono text-[10px]">{inj.detail || "Sin detalles adicionales."}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
