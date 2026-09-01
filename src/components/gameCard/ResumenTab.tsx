/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tab "Resumen General" de GameCard — comparación de abridores, bullpen y
 * ofensiva. Extraído de GameCard.tsx (Fase 6, punto 1 del plan de mejora).
 * El toggle Temp/Últ.7/Vs Opp (`pitcherTab`) es estado puramente de esta
 * pestaña, así que vive acá en vez de en el componente padre.
 */

import React from "react";
import { MLBGame } from "../../types";
import { getTeamLogo, getTeamAbbr } from "../../utils/teamLogos";
import {
  calcKMinusBb,
  formatOdds,
  formatKPerIp,
  formatPitcherValue,
  formatNumber,
  getUsageTooltip,
  getUsageBadgeClass,
} from "./gameCardHelpers";

interface ResumenTabProps {
  game: MLBGame;
  onSelectPlayer: (side: "home" | "away", name: string) => void;
}

export const ResumenTab: React.FC<ResumenTabProps> = ({ game, onSelectPlayer }) => {
  const [pitcherTab, setPitcherTab] = React.useState<"season" | "last7" | "vsOpp">("season");

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

  return (
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
                onClick={() => onSelectPlayer("away", game.pitchers.away.name)}
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
                onClick={() => onSelectPlayer("home", game.pitchers.home.name)}
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
  );
};

export default ResumenTab;
