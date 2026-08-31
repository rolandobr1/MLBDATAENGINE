/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tab "Lesiones" de GameCard — lista de lesionados con buscador.
 * Extraído de GameCard.tsx (Fase 6, punto 1 del plan de mejora). El estado
 * del buscador (`injurySearch`) es local de esta pestaña.
 */

import React from "react";
import { MLBGame } from "../../types";
import { ShieldAlert, Search, X } from "lucide-react";

interface InjuriesTabProps {
  game: MLBGame;
}

export const InjuriesTab: React.FC<InjuriesTabProps> = ({ game }) => {
  const [injurySearch, setInjurySearch] = React.useState("");

  return (
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
  );
};

export default InjuriesTab;
