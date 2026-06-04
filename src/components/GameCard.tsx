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
  AlertTriangle
} from "lucide-react";

interface GameCardProps {
  game: MLBGame;
}

export const GameCard: React.FC<GameCardProps> = ({ game }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"lineups" | "splits" | "fatigue" | "sabermetrics">("lineups");

  const getUsageBadgeClass = (usage: string) => {
    if (usage === "Alta") return "bg-red-100 text-red-800";
    if (usage === "Moderada") return "bg-amber-100 text-amber-800";
    return "bg-emerald-100 text-emerald-800";
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
                </div>
              </div>
            ) : (
              <div className="text-slate-300 font-bold mt-0.5 text-xs">Por Jugar</div>
            )}
          </div>
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
                <div className="flex justify-between"><span>ERA:</span> <strong className="text-slate-800">{game.pitchers.away.era?.toFixed(2)}</strong></div>
                <div className="flex justify-between"><span>WHIP:</span> <strong className="text-slate-800">{game.pitchers.away.whip?.toFixed(2)}</strong></div>
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
                <div className="flex justify-between"><span>ERA:</span> <strong className="text-slate-800">{game.pitchers.home.era?.toFixed(2)}</strong></div>
                <div className="flex justify-between"><span>WHIP:</span> <strong className="text-slate-800">{game.pitchers.home.whip?.toFixed(2)}</strong></div>
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
                Relevo y Bullpen (Últimos 3/7 días)
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
                <div>OPS: <strong className="text-slate-800">{game.offense.away.ops.toFixed(3)}</strong></div>
                <div>OBP: <strong className="text-slate-800">{game.offense.away.obp.toFixed(3)}</strong></div>
                <div>SLG: <strong className="text-slate-800">{game.offense.away.slg.toFixed(3)}</strong></div>
              </div>

              <div className="space-y-0.5">
                <div className="font-sans font-semibold text-red-900 truncate">Home Offense</div>
                <div>Carreras/G: <strong className="text-slate-800">{game.offense.home.runsPerGame}</strong></div>
                <div>OPS: <strong className="text-slate-800">{game.offense.home.ops.toFixed(3)}</strong></div>
                <div>OBP: <strong className="text-slate-800">{game.offense.home.obp.toFixed(3)}</strong></div>
                <div>SLG: <strong className="text-slate-800">{game.offense.home.slg.toFixed(3)}</strong></div>
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
                      <div className="bg-blue-950 text-white px-4 py-2 font-display font-bold text-[10px] uppercase tracking-wider flex justify-between">
                        <span>Bateadores Visitantes</span>
                        <span className="font-mono text-blue-300">AB R H RBI BB SO</span>
                      </div>
                      <div className="divide-y divide-slate-100 font-mono text-[10px]">
                        {game.liveBoxscore.away.batters.map((player: any, idx: number) => (
                          <div key={idx} className="px-4 py-1.5 flex justify-between items-center hover:bg-slate-50/50">
                            <div className="flex items-center gap-2 truncate">
                              <span className="bg-slate-100 text-slate-600 px-1 rounded text-[8px] font-bold shrink-0 w-6 text-center">{player.position}</span>
                              <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                            </div>
                            <div className="flex gap-2 text-right shrink-0">
                              <span className="w-4">{player.ab}</span>
                              <span className="w-4 font-bold text-slate-800">{player.r}</span>
                              <span className="w-4 font-bold text-blue-700">{player.h}</span>
                              <span className="w-4">{player.rbi}</span>
                              <span className="w-4 text-slate-400">{player.bb}</span>
                              <span className="w-4 text-slate-400">{player.k}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="bg-slate-100 text-slate-700 px-4 py-1.5 font-display font-bold text-[10px] uppercase tracking-wider flex justify-between mt-2">
                        <span>Lanzadores</span>
                        <span className="font-mono">IP H R ER BB SO</span>
                      </div>
                      <div className="divide-y divide-slate-100 font-mono text-[10px]">
                        {game.liveBoxscore.away.pitchers.map((player: any, idx: number) => (
                          <div key={idx} className="px-4 py-1.5 flex justify-between items-center hover:bg-slate-50/50">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                            </div>
                            <div className="flex gap-2 text-right shrink-0">
                              <span className="w-6 font-bold">{player.ip}</span>
                              <span className="w-4">{player.h || 0}</span>
                              <span className="w-4">{player.r || 0}</span>
                              <span className="w-4 text-red-600 font-bold">{player.er}</span>
                              <span className="w-4">{player.bb || 0}</span>
                              <span className="w-4 font-bold text-slate-800">{player.k || 0}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Home Live Stats */}
                    <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm">
                      <div className="bg-red-950 text-white px-4 py-2 font-display font-bold text-[10px] uppercase tracking-wider flex justify-between">
                        <span>Bateadores Locales</span>
                        <span className="font-mono text-red-300">AB R H RBI BB SO</span>
                      </div>
                      <div className="divide-y divide-slate-100 font-mono text-[10px]">
                        {game.liveBoxscore.home.batters.map((player: any, idx: number) => (
                          <div key={idx} className="px-4 py-1.5 flex justify-between items-center hover:bg-slate-50/50">
                            <div className="flex items-center gap-2 truncate">
                              <span className="bg-slate-100 text-slate-600 px-1 rounded text-[8px] font-bold shrink-0 w-6 text-center">{player.position}</span>
                              <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                            </div>
                            <div className="flex gap-2 text-right shrink-0">
                              <span className="w-4">{player.ab}</span>
                              <span className="w-4 font-bold text-slate-800">{player.r}</span>
                              <span className="w-4 font-bold text-red-700">{player.h}</span>
                              <span className="w-4">{player.rbi}</span>
                              <span className="w-4 text-slate-400">{player.bb}</span>
                              <span className="w-4 text-slate-400">{player.k}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="bg-slate-100 text-slate-700 px-4 py-1.5 font-display font-bold text-[10px] uppercase tracking-wider flex justify-between mt-2">
                        <span>Lanzadores</span>
                        <span className="font-mono">IP H R ER BB SO</span>
                      </div>
                      <div className="divide-y divide-slate-100 font-mono text-[10px]">
                        {game.liveBoxscore.home.pitchers.map((player: any, idx: number) => (
                          <div key={idx} className="px-4 py-1.5 flex justify-between items-center hover:bg-slate-50/50">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-slate-800 font-sans font-medium truncate" title={player.name}>{player.name}</span>
                            </div>
                            <div className="flex gap-2 text-right shrink-0">
                              <span className="w-6 font-bold">{player.ip}</span>
                              <span className="w-4">{player.h || 0}</span>
                              <span className="w-4">{player.r || 0}</span>
                              <span className="w-4 text-red-600 font-bold">{player.er}</span>
                              <span className="w-4">{player.bb || 0}</span>
                              <span className="w-4 font-bold text-slate-800">{player.k || 0}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Play by Play */}
                {game.playByPlay && (
                  <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                    <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-800 border-b pb-1.5">
                      Jugadas Destacadas (Play-by-Play)
                    </h5>
                    
                    {game.playByPlay.currentPlay && (
                      <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex gap-3 items-center">
                        <div className="bg-yellow-100 text-yellow-800 font-bold px-2 py-1 rounded text-[10px] shrink-0 font-mono uppercase tracking-wider">
                          Actual ({game.playByPlay.currentPlay.inning})
                        </div>
                        <div className="text-sm font-sans text-slate-800 flex-1">
                          {game.playByPlay.currentPlay.description}
                        </div>
                        <div className="font-mono font-bold text-slate-900 text-sm shrink-0">
                          {game.playByPlay.currentPlay.score}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2 mt-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Jugadas de Anotación</div>
                      {game.playByPlay.scoringPlays.length === 0 ? (
                        <div className="text-xs text-slate-400 italic">No hay carreras anotadas aún.</div>
                      ) : (
                        game.playByPlay.scoringPlays.map((play: any, idx: number) => (
                          <div key={idx} className="flex gap-3 items-start border-b border-slate-100 pb-2 last:border-0">
                            <div className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded text-[10px] shrink-0 font-mono mt-0.5 w-14 text-center">
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
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Offensive Splits vs RHP/LHP */}

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
                    Lanzadores Abridores - Sabermetría Avanzada
                  </h5>
                  <div className="grid grid-cols-2 gap-6 text-xs font-mono">
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-blue-900 uppercase mb-1">{game.pitchers.away.name}</div>
                      <div className="flex justify-between"><span>xERA (Proyectada):</span> <strong>{game.advanced_pitching.away.xEra.toFixed(2)}</strong></div>
                      <div className="flex justify-between"><span>FIP (Fórmula):</span> <strong>{game.advanced_pitching.away.fip.toFixed(2)}</strong></div>
                      <div className="flex justify-between"><span>xFIP:</span> <strong>{game.advanced_pitching.away.xFip.toFixed(2)}</strong></div>
                      <div className="flex justify-between"><span>SIERA:</span> <strong>{game.advanced_pitching.away.siera.toFixed(2)}</strong></div>
                      <div className="flex justify-between"><span>K% (Tasa SO):</span> <strong>{game.advanced_pitching.away.strikeoutRate}%</strong></div>
                      <div className="flex justify-between"><span>BB% (Tasa Base):</span> <strong>{game.advanced_pitching.away.walkRate}%</strong></div>
                      <div className="flex justify-between"><span>GB% (Groundball):</span> <strong>{game.advanced_pitching.away.groundBallPct}%</strong></div>
                      <div className="flex justify-between"><span>SwStr% (Swings fallidos):</span> <strong>{game.advanced_pitching.away.swingingStrikePct}%</strong></div>
                    </div>
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-red-900 uppercase mb-1">{game.pitchers.home.name}</div>
                      <div className="flex justify-between"><span>xERA (Proyectada):</span> <strong>{game.advanced_pitching.home.xEra.toFixed(2)}</strong></div>
                      <div className="flex justify-between"><span>FIP (Fórmula):</span> <strong>{game.advanced_pitching.home.fip.toFixed(2)}</strong></div>
                      <div className="flex justify-between"><span>xFIP:</span> <strong>{game.advanced_pitching.home.xFip.toFixed(2)}</strong></div>
                      <div className="flex justify-between"><span>SIERA:</span> <strong>{game.advanced_pitching.home.siera.toFixed(2)}</strong></div>
                      <div className="flex justify-between"><span>K% (Tasa SO):</span> <strong>{game.advanced_pitching.home.strikeoutRate}%</strong></div>
                      <div className="flex justify-between"><span>BB% (Tasa Base):</span> <strong>{game.advanced_pitching.home.walkRate}%</strong></div>
                      <div className="flex justify-between"><span>GB% (Groundball):</span> <strong>{game.advanced_pitching.home.groundBallPct}%</strong></div>
                      <div className="flex justify-between"><span>SwStr% (Swings fallidos):</span> <strong>{game.advanced_pitching.home.swingingStrikePct}%</strong></div>
                    </div>
                  </div>
                </div>

                {/* Advanced Offense */}
                <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden shadow-sm p-4 space-y-3">
                  <h5 className="font-display font-bold text-xs uppercase tracking-wider text-slate-850 border-b pb-1.5">
                    Ofensiva de Equipos - Sabermetría Avanzada
                  </h5>
                  <div className="grid grid-cols-2 gap-6 text-xs font-mono">
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-blue-900 uppercase mb-1">Ataque Visitante</div>
                      <div className="flex justify-between"><span>wOBA:</span> <strong>{game.advanced_offense.away.wOba.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>xwOBA:</span> <strong>{game.advanced_offense.away.xwOba.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>wRC+ (Ajustado):</span> <strong>{game.advanced_offense.away.wrcPlus}</strong></div>
                      <div className="flex justify-between"><span>ISO (Poder):</span> <strong>{game.advanced_offense.away.iso.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>BABIP:</span> <strong>{game.advanced_offense.away.babip.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>Hard Hit %:</span> <strong>{game.advanced_offense.away.hardHitPct}%</strong></div>
                      <div className="flex justify-between"><span>Contact %:</span> <strong>{game.advanced_offense.away.contactPct}%</strong></div>
                      <div className="flex justify-between"><span>Chase % (Swings fuera):</span> <strong>{game.advanced_offense.away.chasePct}%</strong></div>
                    </div>
                    <div className="space-y-1.5 bg-slate-50/50 p-2.5 rounded">
                      <div className="font-sans font-bold text-[10px] text-red-900 uppercase mb-1">Ataque Local</div>
                      <div className="flex justify-between"><span>wOBA:</span> <strong>{game.advanced_offense.home.wOba.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>xwOBA:</span> <strong>{game.advanced_offense.home.xwOba.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>wRC+ (Ajustado):</span> <strong>{game.advanced_offense.home.wrcPlus}</strong></div>
                      <div className="flex justify-between"><span>ISO (Poder):</span> <strong>{game.advanced_offense.home.iso.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>BABIP:</span> <strong>{game.advanced_offense.home.babip.toFixed(3)}</strong></div>
                      <div className="flex justify-between"><span>Hard Hit %:</span> <strong>{game.advanced_offense.home.hardHitPct}%</strong></div>
                      <div className="flex justify-between"><span>Contact %:</span> <strong>{game.advanced_offense.home.contactPct}%</strong></div>
                      <div className="flex justify-between"><span>Chase % (Swings fuera):</span> <strong>{game.advanced_offense.home.chasePct}%</strong></div>
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
