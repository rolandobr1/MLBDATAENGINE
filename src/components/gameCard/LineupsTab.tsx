/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tab "Alineaciones" de GameCard — lineups de local y visitante.
 * Extraído de GameCard.tsx (Fase 6, punto 1 del plan de mejora). El estado
 * de qué jugador está expandido (`expandedPlayer`) es local de esta pestaña.
 */

import React from "react";
import { MLBGame } from "../../types";
import { formatOdds, getTrueKPercentage } from "./gameCardHelpers";

interface LineupsTabProps {
  game: MLBGame;
}

export const LineupsTab: React.FC<LineupsTabProps> = ({ game }) => {
  const [expandedPlayer, setExpandedPlayer] = React.useState<string | null>(null);

  const togglePlayerExpansion = (team: "home" | "away", idx: number) => {
    const key = `${team}-${idx}`;
    setExpandedPlayer(expandedPlayer === key ? null : key);
  };

  if (!game.lineups) return null;

  return (
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
  );
};

export default LineupsTab;
