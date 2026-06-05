/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { MLBGame } from "../types";
import { 
  TrendingUp, 
  ShieldAlert, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle,
  AlertTriangle,
  RefreshCw
} from "lucide-react";

interface GameCardProps {
  game: MLBGame;
  onRefresh?: () => Promise<void>;
}

export const GameCard: React.FC<GameCardProps> = ({ game, onRefresh }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"lineups" | "boxscore" | "splits" | "fatigue" | "sabermetrics">("lineups");
  const [showAllPlays, setShowAllPlays] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

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

  const formatLastUpdate = () => {
    if (!game.timestamp) return "";
    try {
      const date = new Date(game.timestamp);
      return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatPct = (val: any) => {
    return typeof val === 'number' ? `${val.toFixed(1)}%` : 'N/D';
  };

  const formatFloat = (val: any, decimals: number = 2) => {
    return typeof val === 'number' ? val.toFixed(decimals) : 'N/D';
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition duration-200 font-sans">
      
      {/* Game Card Header Block */}
      <div className="bg-slate-900 text-white p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
              Stadium: {game.metadata.venue}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-[10px] font-mono text-blue-400">ID: {game.id}</span>
            <span className="text-slate-500">•</span>
            {game.validation?.isValid ? (
              <span className="bg-emerald-950/50 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <CheckCircle size={10} />
                <span>Validado</span>
              </span>
            ) : (
              <span className="bg-amber-950/50 border border-amber-500/20 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle size={10} />
                <span>Error Verificación</span>
              </span>
            )}
          </div>

          <div className="font-display font-bold text-xl tracking-tight mt-1">
            {game.metadata.awayTeam} <span className="text-slate-400 font-sans font-light">en</span> {game.metadata.homeTeam}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          {game.weather && (
            <div className="hidden lg:flex bg-slate-800 border border-slate-700/60 rounded px-2.5 py-1 text-slate-300 text-[10px] items-center gap-2">
              <span className="font-bold text-slate-100">{game.weather.temp}°C</span>
              <span className="text-slate-600">|</span>
              <span>Hum: {game.weather.humidity}%</span>
              <span className="text-slate-600">|</span>
              <span>Wind: {game.weather.windSpeed} km/h</span>
              <span className="text-slate-600">|</span>
              <span className="text-blue-400 font-medium">{game.weather.skyStatus}</span>
            </div>
          )}
          <div className="text-right shrink-0 flex flex-col items-end">
            <div className="text-slate-400 text-[10px] uppercase font-mono">
              {game.metadata.date} • {game.metadata.time}
            </div>
            {game.game_result && !["Scheduled", "Pre-Game", "Warmup"].includes(game.game_result.gameStatus) ? (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="text-white font-display font-bold text-lg bg-slate-800 px-2 py-0.5 rounded border border-slate-700 leading-none">
                  {game.game_result.awayScore} - {game.game_result.homeScore}
                </div>
                <div className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                  game.game_result.gameStatus.includes("Final") || game.game_result.gameStatus === "Game Over" 
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800" 
                    : "bg-amber-950 text-amber-400 border border-amber-800 animate-pulse"
                }`}>
                  {game.game_result.gameStatus}
                  {game.linescore?.currentInning && !game.game_result.gameStatus.includes("Final") && game.game_result.gameStatus !== "Game Over" && (
                    ` • ${game.linescore.inningHalf === "Top" ? "Alta" : "Baja"} ${game.linescore.currentInning}°`
                  )}
                </div>
              </div>
            ) : (
              <div className="text-slate-300 font-bold mt-0.5 text-xs">Por Jugar</div>
            )}
            {game.timestamp && (
              <div className="text-[9px] text-slate-400 mt-1 font-mono tracking-tighter">
                Act: {formatLastUpdate()}
              </div>
            )}
          </div>
          {onRefresh && (
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className={`p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition duration-150 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50`}
              title="Actualizar datos de este encuentro"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>

      {/* Main Stats Bento-Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Column 1: Pitchers Matchup Comparison */}
        <div className="border border-slate-100 rounded-lg p-4 bg-slate-50/50 space-y-4">
          <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
            <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-700">
              Abridor Proyectado
            </h4>
            <span className="text-[10px] font-mono font-medium text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
              Savant / Fans
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            {/* Away Pitcher */}
            <div className="space-y-1.5 border-r border-slate-200/60 pr-2">
              <div className="text-blue-900 font-bold font-display truncate" title={game.pitchers.away.name}>
                {game.pitchers.away.name}
              </div>
              <span className="text-[9px] font-bold font-mono tracking-wider bg-blue-105 uppercase text-blue-800 px-1.5 py-0.5 rounded">
                Visitante
              </span>

              <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600">
                <div className="flex justify-between"><span>ERA:</span> <strong className="text-slate-800">{typeof game.pitchers.away.era === 'number' ? game.pitchers.away.era.toFixed(2) : game.pitchers.away.era}</strong></div>
                <div className="flex justify-between"><span>WHIP:</span> <strong className="text-slate-800">{typeof game.pitchers.away.whip === 'number' ? game.pitchers.away.whip.toFixed(2) : game.pitchers.away.whip}</strong></div>
                <div className="flex justify-between"><span>K%:</span> <strong className="text-slate-800">{game.pitchers.away.kPct}%</strong></div>
                <div className="flex justify-between"><span>BB%:</span> <strong className="text-slate-800">{game.pitchers.away.bbPct}%</strong></div>
                <div className="flex justify-between"><span>Récord:</span> <strong className="text-slate-800">{game.pitchers.away.wins}-{game.pitchers.away.losses}</strong></div>
                <div className="flex justify-between"><span>IP:</span> <strong className="text-slate-800">{game.pitchers.away.ip}</strong></div>
              </div>
            </div>

            {/* Home Pitcher */}
            <div className="space-y-1.5 pl-1">
              <div className="text-red-900 font-bold font-display truncate" title={game.pitchers.home.name}>
                {game.pitchers.home.name}
              </div>
              <span className="text-[9px] font-bold font-mono tracking-wider bg-red-105 uppercase text-red-800 px-1.5 py-0.5 rounded">
                Local
              </span>

              <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600">
                <div className="flex justify-between"><span>ERA:</span> <strong className="text-slate-800">{typeof game.pitchers.home.era === 'number' ? game.pitchers.home.era.toFixed(2) : game.pitchers.home.era}</strong></div>
                <div className="flex justify-between"><span>WHIP:</span> <strong className="text-slate-800">{typeof game.pitchers.home.whip === 'number' ? game.pitchers.home.whip.toFixed(2) : game.pitchers.home.whip}</strong></div>
                <div className="flex justify-between"><span>K%:</span> <strong className="text-slate-800">{game.pitchers.home.kPct}%</strong></div>
                <div className="flex justify-between"><span>BB%:</span> <strong className="text-slate-800">{game.pitchers.home.bbPct}%</strong></div>
                <div className="flex justify-between"><span>Récord:</span> <strong className="text-slate-800">{game.pitchers.home.wins}-{game.pitchers.home.losses}</strong></div>
                <div className="flex justify-between"><span>IP:</span> <strong className="text-slate-800">{game.pitchers.home.ip}</strong></div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Bullpen & Offense Workload */}
        <div className="border border-slate-100 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between space-y-4">
          
          {/* Bullpen statistics container */}
          <div>
            <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
              <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-700">
                Relevo y Bullpen (Últimos 7 días)
              </h4>
            </div>

            <div className="mt-2 text-xs grid grid-cols-2 gap-3 font-sans">
              <div className="space-y-1">
                <div className="text-slate-500 font-semibold font-display text-[10px] uppercase">Away Bullpen</div>
                <div className="text-slate-700">ERA: <strong className="font-mono">{game.bullpen.away.era}</strong></div>
                <div className="flex gap-1 items-center">
                  <span className="text-slate-500">Uso:</span> 
                  <span className={`px-1 rounded text-[9px] uppercase font-bold font-mono ${getUsageBadgeClass(game.bullpen.away.usageLast3Days)}`}>
                    {game.bullpen.away.usageLast3Days}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Últ.7d: {game.bullpen.away.ipLast7Days} IP</div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-500 font-semibold font-display text-[10px] uppercase">Home Bullpen</div>
                <div className="text-slate-700">ERA: <strong className="font-mono">{game.bullpen.home.era}</strong></div>
                <div className="flex gap-1 items-center">
                  <span className="text-slate-500">Uso:</span> 
                  <span className={`px-1 rounded text-[9px] uppercase font-bold font-mono ${getUsageBadgeClass(game.bullpen.home.usageLast3Days)}`}>
                    {game.bullpen.home.usageLast3Days}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Últ.7d: {game.bullpen.home.ipLast7Days} IP</div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200/60 pt-3">
            <h5 className="text-[10px] font-display font-bold uppercase tracking-wider text-slate-500 pb-1.5">
              Ofensiva y Promedios (Vis. vs Loc.)
            </h5>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-0.5">
                <div className="font-sans font-semibold text-blue-900 truncate">Away Offense</div>
                <div>Carreras/G: <strong className="text-slate-800">{game.offense.away.runsPerGame}</strong></div>
                <div>OPS: <strong className="text-slate-800">{typeof game.offense.away.ops === 'number' ? game.offense.away.ops.toFixed(3) : game.offense.away.ops}</strong></div>
                <div>OBP: <strong className="text-slate-800">{typeof game.offense.away.obp === 'number' ? game.offense.away.obp.toFixed(3) : game.offense.away.obp}</strong></div>
                <div>SLG: <strong className="text-slate-800">{typeof game.offense.away.slg === 'number' ? game.offense.away.slg.toFixed(3) : game.offense.away.slg}</strong></div>
              </div>

              <div className="space-y-0.5">
                <div className="font-sans font-semibold text-red-900 truncate">Home Offense</div>
                <div>Carreras/G: <strong className="text-slate-800">{game.offense.home.runsPerGame}</strong></div>
                <div>OPS: <strong className="text-slate-800">{typeof game.offense.home.ops === 'number' ? game.offense.home.ops.toFixed(3) : game.offense.home.ops}</strong></div>
                <div>OBP: <strong className="text-slate-800">{typeof game.offense.home.obp === 'number' ? game.offense.home.obp.toFixed(3) : game.offense.home.obp}</strong></div>
                <div>SLG: <strong className="text-slate-800">{typeof game.offense.home.slg === 'number' ? game.offense.home.slg.toFixed(3) : game.offense.home.slg}</strong></div>
              </div>
            </div>
          </div>

        </div>

        {/* Column 3: Market betting odds movement */}
        <div className="border border-slate-100 rounded-lg p-4 bg-slate-50/50 space-y-4">
          
          <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
            <h4 className="text-xs font-display font-bold uppercase tracking-wider text-slate-700">
              Líneas de Apuestas y Movimientos
            </h4>
            <span className="text-[10px] font-mono font-medium text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
              Apertura vs Actual
            </span>
          </div>

          <div className="space-y-3 text-xs font-mono">
            {/* Money lines Table UI */}
            <div className="space-y-1 text-slate-700">
              <div className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200/50">
                <span className="font-sans font-medium text-slate-600">Moneyline Home:</span>
                <span className="font-bold flex items-center gap-1">
                  <span className="text-slate-400 font-normal">{game.betting_lines.openingMoneylineHome > 0 ? `+${game.betting_lines.openingMoneylineHome}` : game.betting_lines.openingMoneylineHome}</span>
                  <span>→</span>
                  <span className={game.betting_lines.currentMoneylineHome < game.betting_lines.openingMoneylineHome ? "text-emerald-700 font-bold" : "text-slate-850"}>
                    {game.betting_lines.currentMoneylineHome > 0 ? `+${game.betting_lines.currentMoneylineHome}` : game.betting_lines.currentMoneylineHome}
                  </span>
                </span>
              </div>

              <div className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200/50">
                <span className="font-sans font-medium text-slate-600">Moneyline Away:</span>
                <span className="font-bold flex items-center gap-1">
                  <span className="text-slate-400 font-normal">{game.betting_lines.openingMoneylineAway > 0 ? `+${game.betting_lines.openingMoneylineAway}` : game.betting_lines.openingMoneylineAway}</span>
                  <span>→</span>
                  <span className={game.betting_lines.currentMoneylineAway < game.betting_lines.openingMoneylineAway ? "text-emerald-700 font-bold" : "text-slate-850"}>
                    {game.betting_lines.currentMoneylineAway > 0 ? `+${game.betting_lines.currentMoneylineAway}` : game.betting_lines.currentMoneylineAway}
                  </span>
                </span>
              </div>
            </div>

            {/* Run Line and Totals */}
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div className="bg-slate-200/40 p-2 rounded border border-slate-300/30">
                <div className="font-semibold text-slate-700">Run Line (Local):</div>
                <div>{game.betting_lines.runLineHome > 0 ? `+${game.betting_lines.runLineHome}` : game.betting_lines.runLineHome} ({game.betting_lines.runLineHomeOdds > 0 ? `+${game.betting_lines.runLineHomeOdds}` : game.betting_lines.runLineHomeOdds})</div>
              </div>

              <div className="bg-slate-200/40 p-2 rounded border border-slate-300/30">
                <div className="font-semibold text-slate-700">Total Carreras:</div>
                <div className="font-bold">{game.betting_lines.totalRuns} U/O</div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded p-2 text-[11px] flex gap-2">
              <TrendingUp size={14} className="shrink-0 text-amber-700" />
              <div className="font-sans text-[10px] leading-tight">
                <strong>Fluidez mercado:</strong> {game.betting_lines.lineMovementSummary}
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
            <span>Lesiones Alert:</span>
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

      {/* Roster & Lineups Accordion Footer */}
      <div className="border-t border-slate-200">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full bg-slate-100/50 hover:bg-slate-100/80 transition px-6 py-3 flex justify-between items-center font-display font-medium text-xs text-slate-600 tracking-wider uppercase cursor-pointer"
        >
          <span>Alineaciones Titulares / Roster Activo</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {expanded && (
          <div className="p-6 bg-slate-50 font-sans text-slate-700 text-sm leading-relaxed border-t border-slate-200 border-dashed space-y-4">
            
            {/* Tab Selector */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 mb-2">
              <button
                onClick={() => setActiveTab("lineups")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${activeTab === "lineups" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
              >
                Alineaciones
              </button>
              <button
                onClick={() => setActiveTab("boxscore")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${activeTab === "boxscore" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
              >
                Boxscore & PxP
              </button>
              <button
                onClick={() => setActiveTab("splits")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${activeTab === "splits" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
              >
                Splits vs RHP/LHP
              </button>
              <button
                onClick={() => setActiveTab("fatigue")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${activeTab === "fatigue" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
              >
                Fatiga y Descanso
              </button>
              <button
                onClick={() => setActiveTab("sabermetrics")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${activeTab === "sabermetrics" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
              >
                Sabermetría Avanzada
              </button>
            </div>

            {/* TAB: Lineups Comparison */}
            {activeTab === "lineups" && game.lineups && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2">
                {/* Away Lineup */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm">
                  <div className="bg-slate-800 text-white px-4 py-2 font-display font-bold text-xs uppercase tracking-wider flex justify-between">
                    <span>Alineación Visitante ({game.metadata.awayTeam})</span>
                    <span className="font-mono text-[9px] text-slate-300">AVG / OPS / HR / RBI</span>
                  </div>
                  <div className="divide-y divide-slate-100 font-mono text-[11px]">
                    {game.lineups.away.map((player, idx) => (
                      <div key={idx} className="px-4 py-2 flex justify-between items-center hover:bg-slate-50/50 transition">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-slate-400 font-semibold w-3 text-right">{idx + 1}</span>
                          <span className="bg-slate-100 text-slate-600 px-1 rounded text-[8px] font-bold shrink-0 w-6 text-center">{player.position}</span>
                          <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                        </div>
                        <div className="flex gap-2 text-right shrink-0">
                          <span className="text-slate-800 font-bold w-10">{player.avg.toFixed(3).substring(1)}</span>
                          <span className="text-blue-600 w-10">{player.ops.toFixed(3)}</span>
                          <span className="text-slate-500 w-9">{player.hr} HR</span>
                          <span className="text-slate-500 w-11">{player.rbi} RBI</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Home Lineup */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm">
                  <div className="bg-red-950 text-white px-4 py-2 font-display font-bold text-xs uppercase tracking-wider flex justify-between">
                    <span>Alineación Local ({game.metadata.homeTeam})</span>
                    <span className="font-mono text-[9px] text-red-300">AVG / OPS / HR / RBI</span>
                  </div>
                  <div className="divide-y divide-slate-100 font-mono text-[11px]">
                    {game.lineups.home.map((player, idx) => (
                      <div key={idx} className="px-4 py-2 flex justify-between items-center hover:bg-slate-50/50 transition">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-slate-400 font-semibold w-3 text-right">{idx + 1}</span>
                          <span className="bg-slate-100 text-slate-600 px-1 rounded text-[8px] font-bold shrink-0 w-6 text-center">{player.position}</span>
                          <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                        </div>
                        <div className="flex gap-2 text-right shrink-0">
                          <span className="text-slate-800 font-bold w-10">{player.avg.toFixed(3).substring(1)}</span>
                          <span className="text-red-600 w-10">{player.ops.toFixed(3)}</span>
                          <span className="text-slate-500 w-9">{player.hr} HR</span>
                          <span className="text-slate-500 w-11">{player.rbi} RBI</span>
                        </div>
                      </div>
                    ))}
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
                      Linescore
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
                        <table className="w-full text-left border-collapse table-fixed min-w-[400px]">
                          <colgroup>
                            <col />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                          </colgroup>
                          <thead>
                            <tr className="bg-blue-950 text-white font-display font-bold text-[10px] uppercase tracking-wider">
                              <th className="py-2 px-4 text-left truncate">Bateadores Visitantes</th>
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
                                <td className="py-1.5 px-4 truncate">
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
                               <tr className="bg-slate-100/80 font-bold border-t border-slate-350 text-slate-800 text-[10px]">
                                 <td className="py-2 px-4 font-sans text-left uppercase text-[9px] tracking-wider">Totales</td>
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
                        
                        <table className="w-full text-left border-collapse table-fixed mt-2 min-w-[400px]">
                          <colgroup>
                            <col />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                          </colgroup>
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-display font-bold text-[10px] uppercase tracking-wider">
                              <th className="py-1.5 px-4 text-left truncate">Lanzadores</th>
                              <th className="py-1.5 px-1 text-center font-mono">IP</th>
                              <th className="py-1.5 px-1 text-center font-mono">H</th>
                              <th className="py-1.5 px-1 text-center font-mono">R</th>
                              <th className="py-1.5 px-1 text-center font-mono">ER</th>
                              <th className="py-1.5 px-1 text-center font-mono">BB</th>
                              <th className="py-1.5 px-1 text-center font-mono">SO</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                            {game.liveBoxscore.away.pitchers.map((player: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-4 truncate">
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
                                 <td className="py-2 px-4 font-sans text-left uppercase text-[9px] tracking-wider">Totales</td>
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
                        <table className="w-full text-left border-collapse table-fixed min-w-[400px]">
                          <colgroup>
                            <col />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                          </colgroup>
                          <thead>
                            <tr className="bg-red-950 text-white font-display font-bold text-[10px] uppercase tracking-wider">
                              <th className="py-2 px-4 text-left truncate">Bateadores Locales</th>
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
                                <td className="py-1.5 px-4 truncate">
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
                              <tr className="bg-slate-100/80 font-bold border-t border-slate-350 text-slate-800 text-[10px]">
                                <td className="py-2 px-4 font-sans text-left uppercase text-[9px] tracking-wider">Totales</td>
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
                        
                        <table className="w-full text-left border-collapse table-fixed mt-2 min-w-[400px]">
                          <colgroup>
                            <col />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                            <col className="w-10" />
                          </colgroup>
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-display font-bold text-[10px] uppercase tracking-wider">
                              <th className="py-1.5 px-4 text-left truncate">Lanzadores</th>
                              <th className="py-1.5 px-1 text-center font-mono">IP</th>
                              <th className="py-1.5 px-1 text-center font-mono">H</th>
                              <th className="py-1.5 px-1 text-center font-mono">R</th>
                              <th className="py-1.5 px-1 text-center font-mono">ER</th>
                              <th className="py-1.5 px-1 text-center font-mono">BB</th>
                              <th className="py-1.5 px-1 text-center font-mono">SO</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                            {game.liveBoxscore.home.pitchers.map((player: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-4 truncate">
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
                                <td className="py-2 px-4 font-sans text-left uppercase text-[9px] tracking-wider">Totales</td>
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
                        <span className="text-[10px] font-semibold text-slate-500">Todas las jugadas</span>
                        <button
                          type="button"
                          onClick={() => setShowAllPlays(!showAllPlays)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            showAllPlays ? "bg-blue-600" : "bg-slate-200"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              showAllPlays ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
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
                    
                    <div className="space-y-2 mt-2 max-h-96 overflow-y-auto pr-1">
                      {showAllPlays ? (
                        !game.playByPlay.allPlays || game.playByPlay.allPlays.length === 0 ? (
                          <div className="text-xs text-slate-400 italic text-center py-4">No hay jugadas registradas aún.</div>
                        ) : (
                          game.playByPlay.allPlays.map((play: any, idx: number) => {
                            const isScoring = play.isScoringPlay;
                            return (
                              <div key={idx} className={`flex gap-3 items-start border-b border-slate-100 pb-2 last:border-0 p-1.5 rounded transition text-left ${
                                isScoring ? "bg-yellow-50/70 border-l-2 border-l-yellow-400" : "hover:bg-slate-50/50"
                              }`}>
                                <div className={`font-bold px-2 py-0.5 rounded text-[9px] shrink-0 font-mono mt-0.5 w-14 text-center ${
                                  isScoring ? "bg-yellow-100 text-yellow-800" : "bg-slate-100 text-slate-600"
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
                        game.playByPlay.scoringPlays.length === 0 ? (
                          <div className="text-xs text-slate-400 italic text-center py-4">No hay carreras anotadas aún.</div>
                        ) : (
                          game.playByPlay.scoringPlays.map((play: any, idx: number) => (
                            <div key={idx} className="flex gap-3 items-start border-b border-slate-100 pb-2 last:border-0 p-1.5 bg-yellow-50/30 border-l-2 border-l-yellow-400 rounded text-left">
                              <div className="bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded text-[9px] shrink-0 font-mono mt-0.5 w-14 text-center">
                                {play.inning}
                              </div>
                              <div className="text-xs font-sans text-slate-700 flex-1">
                                {play.description}
                              </div>
                              <div className="font-mono font-bold text-slate-800 text-xs shrink-0 mt-0.5 bg-slate-50 px-1.5 rounded">
                                {play.score}
                              </div>
                            </div>
                          ))
                        )
                      )}
                    </div>
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
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div className="bg-blue-50/30 p-2.5 rounded border border-blue-100/50 space-y-1">
                      <div className="font-sans font-bold text-[10px] uppercase text-blue-800 mb-1">vs RHP</div>
                      <div className="flex justify-between"><span>AVG:</span> <strong>{game.offensive_splits.away.vsRhp.avg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>OBP:</span> <strong>{game.offensive_splits.away.vsRhp.obp.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>SLG:</span> <strong>{game.offensive_splits.away.vsRhp.slg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>OPS:</span> <strong className="text-blue-700">{game.offensive_splits.away.vsRhp.ops.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>HR/G:</span> <strong>{game.offensive_splits.away.vsRhp.hr}</strong></div>
                    </div>
                    <div className="bg-blue-50/30 p-2.5 rounded border border-blue-100/50 space-y-1">
                      <div className="font-sans font-bold text-[10px] uppercase text-blue-800 mb-1">vs LHP</div>
                      <div className="flex justify-between"><span>AVG:</span> <strong>{game.offensive_splits.away.vsLhp.avg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>OBP:</span> <strong>{game.offensive_splits.away.vsLhp.obp.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>SLG:</span> <strong>{game.offensive_splits.away.vsLhp.slg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>OPS:</span> <strong className="text-blue-700">{game.offensive_splits.away.vsLhp.ops.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>HR/G:</span> <strong>{game.offensive_splits.away.vsLhp.hr}</strong></div>
                    </div>
                  </div>
                </div>

                {/* Home Splits */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-red-900">
                    Splits Local ({game.metadata.homeTeam})
                  </h5>
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div className="bg-red-50/20 p-2.5 rounded border border-red-100/40 space-y-1">
                      <div className="font-sans font-bold text-[10px] uppercase text-red-800 mb-1">vs RHP</div>
                      <div className="flex justify-between"><span>AVG:</span> <strong>{game.offensive_splits.home.vsRhp.avg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>OBP:</span> <strong>{game.offensive_splits.home.vsRhp.obp.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>SLG:</span> <strong>{game.offensive_splits.home.vsRhp.slg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>OPS:</span> <strong className="text-red-700">{game.offensive_splits.home.vsRhp.ops.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>HR/G:</span> <strong>{game.offensive_splits.home.vsRhp.hr}</strong></div>
                    </div>
                    <div className="bg-red-50/20 p-2.5 rounded border border-red-100/40 space-y-1">
                      <div className="font-sans font-bold text-[10px] uppercase text-red-800 mb-1">vs LHP</div>
                      <div className="flex justify-between"><span>AVG:</span> <strong>{game.offensive_splits.home.vsLhp.avg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>OBP:</span> <strong>{game.offensive_splits.home.vsLhp.obp.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>SLG:</span> <strong>{game.offensive_splits.home.vsLhp.slg.toFixed(3).substring(1)}</strong></div>
                      <div className="flex justify-between"><span>OPS:</span> <strong className="text-red-700">{game.offensive_splits.home.vsLhp.ops.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>HR/G:</span> <strong>{game.offensive_splits.home.vsLhp.hr}</strong></div>
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
                      <div className="font-sans font-bold text-[10px] text-slate-500 uppercase">Starter: {game.pitchers.away.name}</div>
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
                      <div className="font-sans font-bold text-[10px] text-slate-500 uppercase">Starter: {game.pitchers.home.name}</div>
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
            {activeTab === "sabermetrics" && game.advanced_pitching && game.advanced_offense && (
              <div className="space-y-4">
                {/* Advanced Pitching */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-850 border-b pb-1.5">
                    Lanzadores Abridores - Sabermetría Real Calculada
                  </h5>
                  <div className="grid grid-cols-2 gap-6 text-xs font-mono">
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-blue-900 uppercase mb-1">{game.pitchers.away.name}</div>
                      <div className="flex justify-between"><span>FIP (Fórmula Real):</span> <strong>{formatFloat(game.advanced_pitching.away.fip, 2)}</strong></div>
                      <div className="flex justify-between"><span>K% (Tasa SO):</span> <strong>{formatPct(game.advanced_pitching.away.strikeoutRate)}</strong></div>
                      <div className="flex justify-between"><span>BB% (Tasa Base):</span> <strong>{formatPct(game.advanced_pitching.away.walkRate)}</strong></div>
                      <div className="flex justify-between"><span>GB% (Rodados):</span> <strong>{formatPct(game.advanced_pitching.away.groundBallPct)}</strong></div>
                      <div className="flex justify-between"><span>FB% (Elevados):</span> <strong>{formatPct(game.advanced_pitching.away.flyBallPct)}</strong></div>
                    </div>
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-red-900 uppercase mb-1">{game.pitchers.home.name}</div>
                      <div className="flex justify-between"><span>FIP (Fórmula Real):</span> <strong>{formatFloat(game.advanced_pitching.home.fip, 2)}</strong></div>
                      <div className="flex justify-between"><span>K% (Tasa SO):</span> <strong>{formatPct(game.advanced_pitching.home.strikeoutRate)}</strong></div>
                      <div className="flex justify-between"><span>BB% (Tasa Base):</span> <strong>{formatPct(game.advanced_pitching.home.walkRate)}</strong></div>
                      <div className="flex justify-between"><span>GB% (Rodados):</span> <strong>{formatPct(game.advanced_pitching.home.groundBallPct)}</strong></div>
                      <div className="flex justify-between"><span>FB% (Elevados):</span> <strong>{formatPct(game.advanced_pitching.home.flyBallPct)}</strong></div>
                    </div>
                  </div>
                </div>

                {/* Advanced Offense */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-850 border-b pb-1.5">
                    Ofensiva de Equipos - Sabermetría Real Calculada
                  </h5>
                  <div className="grid grid-cols-2 gap-6 text-xs font-mono">
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-blue-900 uppercase mb-1">Ataque Visitante</div>
                      <div className="flex justify-between"><span>wOBA (Calculado):</span> <strong>{formatFloat(game.advanced_offense.away.wOba, 3)}</strong></div>
                      <div className="flex justify-between"><span>BABIP:</span> <strong>{formatFloat(game.advanced_offense.away.babip, 3)}</strong></div>
                      <div className="flex justify-between"><span>ISO (Poder):</span> <strong>{formatFloat(game.advanced_offense.away.iso, 3)}</strong></div>
                    </div>
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-red-900 uppercase mb-1">Ataque Local</div>
                      <div className="flex justify-between"><span>wOBA (Calculado):</span> <strong>{formatFloat(game.advanced_offense.home.wOba, 3)}</strong></div>
                      <div className="flex justify-between"><span>BABIP:</span> <strong>{formatFloat(game.advanced_offense.home.babip, 3)}</strong></div>
                      <div className="flex justify-between"><span>ISO (Poder):</span> <strong>{formatFloat(game.advanced_offense.home.iso, 3)}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  );
};
