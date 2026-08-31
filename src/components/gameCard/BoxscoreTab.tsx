/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tab "Boxscore & PxP" de GameCard — línea de anotación, boxscore completo y
 * jugada por jugada. Extraído de GameCard.tsx (Fase 6, punto 1 del plan de
 * mejora). `showAllPlays`/`playSearch` son estado local de esta pestaña;
 * `isRefreshing`/`onRefreshClick` se reciben del padre porque el botón de acá
 * dispara el mismo refresh (y comparte el mismo spinner) que el del header.
 */

import React from "react";
import { MLBGame } from "../../types";
import { getTeamColor, getTeamAbbr } from "../../utils/teamLogos";
import { RefreshCw, Search, X } from "lucide-react";
import { getBattersTotals, getPitchersTotals } from "./gameCardHelpers";

interface BoxscoreTabProps {
  game: MLBGame;
  isRefreshing: boolean;
  onRefreshClick: (e: React.MouseEvent) => void;
}

export const BoxscoreTab: React.FC<BoxscoreTabProps> = ({ game, isRefreshing, onRefreshClick }) => {
  const [showAllPlays, setShowAllPlays] = React.useState(false);
  const [playSearch, setPlaySearch] = React.useState("");

  const awayBattersTotals = game.liveBoxscore ? getBattersTotals(game.liveBoxscore.away.batters) : null;
  const awayPitchersTotals = game.liveBoxscore ? getPitchersTotals(game.liveBoxscore.away.pitchers) : null;
  const homeBattersTotals = game.liveBoxscore ? getBattersTotals(game.liveBoxscore.home.batters) : null;
  const homePitchersTotals = game.liveBoxscore ? getPitchersTotals(game.liveBoxscore.home.pitchers) : null;

  return (
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
                          <button type="button" onClick={onRefreshClick} disabled={isRefreshing} className="p-1 rounded hover:bg-slate-200">
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
  );
};

export default BoxscoreTab;
