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
  X
} from "lucide-react";

interface GameCardProps {
  game: MLBGame;
  onRefresh?: () => Promise<void>;
  isPinned?: boolean;
  onTogglePin?: () => void;
  globalExpandToggle?: number;
  globalExpandTarget?: boolean;
}


const LiveFieldUI: React.FC<{ linescore: any, liveBoxscore: any }> = ({ linescore, liveBoxscore }) => {
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

  const InningDot = ({ count, max, color }: { count: number, max: number, color: string }) => (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i < count ? color : 'bg-slate-700'}`}
        />
      ))}
    </div>
  );

  return (
    <div className="bg-slate-900 rounded-lg p-3 mx-4 mt-4 flex items-center justify-between border border-slate-700 shadow-inner overflow-hidden relative">
      {/* Background field lines */}
      <div className="absolute inset-0 opacity-20 flex justify-center items-center pointer-events-none">
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M0 100 L50 50 L100 100" stroke="white" strokeWidth="1" fill="none" />
        </svg>
      </div>

      <div className="w-full flex items-center justify-between z-10 px-2 md:px-6 py-2">
        {/* Left side: Pitcher */}
        <div className="flex flex-col flex-1">
          {pitcherName && (
            <>
              <div className="text-white font-bold text-sm md:text-base flex items-center gap-1">
                {pitcherName.split(' ').map((n: string, i: number, arr: any[]) => i === arr.length - 1 ? n.charAt(0) : n).join(', ')}
                <span className="text-slate-400 text-[10px] md:text-xs uppercase ml-1">{currentPitcher?.position || "P"}</span>
              </div>
              <div className="text-slate-300 text-[10px] md:text-xs font-mono mt-1">
                {currentPitcher ? `${currentPitcher.pitches} P - ${currentPitcher.strikes} S` : '- P - - S'}
              </div>
              <div className="text-slate-400 text-[10px] md:text-xs font-mono">
                {currentPitcher ? `${currentPitcher.ip} IL, ${currentPitcher.h} H, ${currentPitcher.er} CL` : '- IL, - H, - CL'}
              </div>
            </>
          )}
        </div>

        {/* Center: Count and Diamond */}
        <div className="flex flex-col items-center shrink-0 px-4">
          <div className="relative w-14 h-14 md:w-16 md:h-16 transform -rotate-45 mb-2 mt-2">
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1">
              <div className={`w-full h-full rounded-sm ${third ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-slate-700/60'}`} />
              <div className={`w-full h-full rounded-sm ${second ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-slate-700/60'}`} />
              <div className="w-full h-full" />
              <div className={`w-full h-full rounded-sm ${first ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-slate-700/60'}`} />
            </div>
          </div>
          <div className="flex gap-2 text-white font-bold text-sm md:text-base font-mono mb-1">
            <span className="text-emerald-400">{b}</span>
            <span className="text-slate-500">-</span>
            <span className="text-red-400">{s}</span>
          </div>
          <div className="flex gap-1 justify-center">
            <InningDot count={o} max={3} color="bg-red-500" />
          </div>
        </div>

        {/* Right side: Batter */}
        <div className="flex flex-col flex-1 items-end text-right">
          {batterName && (
            <>
              <div className="text-white font-bold text-sm md:text-base flex items-center justify-end gap-1">
                {batterName.split(' ').map((n: string, i: number, arr: any[]) => i === arr.length - 1 ? n.charAt(0) : n).join(', ')}
                <span className="text-slate-400 text-[10px] md:text-xs uppercase ml-1">{currentBatter?.position || "B"}</span>
              </div>
              <div className="text-slate-300 text-xs md:text-sm font-mono mt-1 font-bold">
                {b} - {s}
              </div>
              <div className="text-slate-400 text-[10px] md:text-xs font-mono">
                {currentBatter ? `${currentBatter.h} - ${currentBatter.ab}` : '-'}
              </div>
            </>
          )}
        </div>
      </div>
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
                <span className="text-[9px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-white/80 drop-shadow-md mt-1 bg-black/20 px-1.5 py-0.5 rounded backdrop-blur-sm">
                  Visitante
                </span>
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
                <span className="text-[9px] sm:text-[11px] font-mono font-bold uppercase tracking-widest text-white/80 drop-shadow-md mt-1 bg-black/20 px-1.5 py-0.5 rounded backdrop-blur-sm text-right">
                  Local
                </span>
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
                  {game.game_result.awayScore} - {game.game_result.homeScore}
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
          
          {/* Live Progress Indicator */}
          {game.game_result?.gameStatus?.includes("In Progress") && game.linescore && (
            <div className="mb-4">
              <LiveFieldUI linescore={game.linescore} liveBoxscore={game.liveBoxscore} />
            </div>
          )}

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

      {/* Injuries ticker banner if present */}
      {game.injuries && game.injuries.length > 0 && (
        <div className="bg-red-50/50 border-t border-red-100 px-6 py-2.5 flex flex-wrap gap-x-6 gap-y-1.5 items-center justify-start text-[11px]">
          <span className="font-display font-semibold text-red-800 uppercase tracking-wider flex items-center gap-1 shrink-0">
            <ShieldAlert size={12} className="text-red-600" />
            <span>Alerta de Lesiones:</span>
          </span>
          <div className="flex flex-wrap gap-2 text-slate-600 font-mono">
            {game.injuries.slice(0, 3).map((inj, i) => (
              <span key={i} className="bg-white px-2 py-0.5 rounded border border-red-100/60 shadow-sm">
                <strong>{inj.player}</strong> ({inj.team}) - <span className="text-red-700">{inj.status}</span>
              </span>
            ))}
          </div>
        </div>
      )}

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
                      <span className="w-9 text-red-700">{(game.lineups.away.reduce((sum, p) => sum + (p.strikeout_pct ?? p.kPct ?? 0), 0) / game.lineups.away.length).toFixed(1)}%</span>
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
                      <span className="w-9 text-red-700">{(game.lineups.home.reduce((sum, p) => sum + (p.strikeout_pct ?? p.kPct ?? 0), 0) / game.lineups.home.length).toFixed(1)}%</span>
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
                {game.playByPlay && (
                  <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                    <div className="flex items-center justify-between border-b pb-1.5">
                      <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-800">
                        Registro de Jugadas (Play-by-Play)
                      </h5>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-slate-500">Mostrar jugadas</span>
                        <button
                          type="button"
                          onClick={() => setShowAllPlays(!showAllPlays)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showAllPlays ? "bg-blue-600" : "bg-slate-200"
                            }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showAllPlays ? "translate-x-4" : "translate-x-0"
                              }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={handleRefreshClick}
                          disabled={isRefreshing}
                          className="p-1 rounded hover:bg-slate-200"
                        >
                          <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                        </button>
                      </div>
                    </div>

                    {game.playByPlay.currentPlay && (
                      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex gap-3 items-center">
                        <div className="bg-yellow-100 text-yellow-800 font-bold px-2 py-1 rounded text-[10px] shrink-0 font-mono uppercase tracking-wider">
                          Actual ({game.playByPlay.currentPlay.inning})
                        </div>
                        <div className="text-sm font-sans text-slate-800 flex-1 text-left">
                          {game.playByPlay.currentPlay.description}
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
                        game.game_result.gameStatus !== "Postponed";
                      
                      const allPlays = isGameInProgress && game.playByPlay.allPlays ? [...game.playByPlay.allPlays].reverse() : game.playByPlay.allPlays;

                      return (
                        <div className="space-y-2 mt-2 max-h-96 overflow-y-auto pr-1">
                          {showAllPlays ? (
                            !allPlays || allPlays.length === 0 ? (
                              <div className="text-xs text-slate-400 italic text-center py-4">No hay jugadas registradas aún.</div>
                            ) : (
                              allPlays.map((play: any, idx: number) => {
                                const isScoring = play.isScoringPlay;
                                return (
                                  <div key={idx} className={`flex gap-3 items-start border-b border-slate-100 pb-2 last:border-0 p-1.5 rounded transition text-left ${isScoring ? "bg-yellow-50/70 border-l-2 border-l-yellow-400" : "hover:bg-slate-50/50"
                                    }`}>
                                    <div className={`font-bold px-2 py-0.5 rounded text-[9px] shrink-0 font-mono mt-0.5 w-14 text-center ${isScoring ? "bg-yellow-100 text-yellow-800" : "bg-slate-100 text-slate-600"
                                      }`}>
                                      {play.inning}
                                    </div>
                                    <div className="text-xs font-sans text-slate-700 flex-1">
                                      {play.description}
                                    </div>
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
                )}
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
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-850 border-b pb-1.5">
                    Reporte de Lesiones y Bajas
                  </h5>

                  {!game.injuries || game.injuries.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-4 text-center bg-slate-50 rounded border border-slate-200 border-dashed">
                      No hay lesiones reportadas para este encuentro.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Away Injuries */}
                      <div>
                        <h6 className="font-bold text-[11px] text-blue-900 uppercase mb-2 border-b border-blue-100 pb-1 flex items-center justify-between">
                          <span>Visitante ({game.metadata.awayTeam})</span>
                          <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 rounded-full">{game.injuries.filter((inj: any) => inj.team === game.metadata.awayTeam).length}</span>
                        </h6>
                        <div className="space-y-2">
                          {game.injuries.filter((inj: any) => inj.team === game.metadata.awayTeam).length === 0 ? (
                            <div className="text-[10px] text-slate-400 italic">Roster limpio.</div>
                          ) : (
                            game.injuries.filter((inj: any) => inj.team === game.metadata.awayTeam).map((inj: any, idx: number) => (
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
                          <span className="bg-red-100 text-red-800 text-[9px] px-1.5 rounded-full">{game.injuries.filter((inj: any) => inj.team === game.metadata.homeTeam).length}</span>
                        </h6>
                        <div className="space-y-2">
                          {game.injuries.filter((inj: any) => inj.team === game.metadata.homeTeam).length === 0 ? (
                            <div className="text-[10px] text-slate-400 italic">Roster limpio.</div>
                          ) : (
                            game.injuries.filter((inj: any) => inj.team === game.metadata.homeTeam).map((inj: any, idx: number) => (
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
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
