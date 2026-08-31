/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lista de apuestas de Bet Tracking: filtros (estado + usuario), tarjetas
 * colapsables con progreso en vivo, y acciones (actualizar/editar/eliminar).
 * Extraído de BetTracking.tsx (Fase 6, punto 1 del plan de mejora). El filtro
 * por estado (`filter`) y qué apuestas están expandidas (`expandedBets`) son
 * estado local de esta lista — nada fuera de acá los necesita. El filtro por
 * usuario (`userFilter`) sigue viviendo en el padre porque también alimenta
 * las tarjetas de resumen (ganado/perdido/neto).
 */

import React, { useMemo, useState } from "react";
import {
  Eye, EyeOff, Users, BarChart2, RefreshCw, ChevronDown, ChevronUp,
  StickyNote, Edit2, Trash2,
} from "lucide-react";
import { Bet, BetStatus, ResolvedBet } from "./betTrackingTypes";
import { CATEGORY_CFG, formatOddsDisplay, parseGameTimeToMinutes } from "./betTrackingHelpers";
import { StatusBadge } from "./StatusBadge";
import { LiveProgressBar } from "./LiveProgressBar";

interface BetListProps {
  resolvedBets: ResolvedBet[];
  userFilter: string;
  onUserFilterChange: (userName: string) => void;
  refreshingIds: Set<string>;
  onRefreshBet: (gameId: string) => void;
  onEditBet: (bet: Bet) => void;
  onDeleteBet: (id: number) => void;
}

export const BetList: React.FC<BetListProps> = ({
  resolvedBets,
  userFilter,
  onUserFilterChange,
  refreshingIds,
  onRefreshBet,
  onEditBet,
  onDeleteBet,
}) => {
  const [filter, setFilter] = useState<"all" | BetStatus>("all");
  const [expandedBets, setExpandedBets] = useState<Set<number>>(new Set());

  const toggleCollapse = (id: number) => {
    setExpandedBets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const uniqueUsers = Array.from(new Set(resolvedBets.map(r => r.bet.userName).filter(Boolean)));
  const filteredByUser = userFilter === "all" ? resolvedBets : resolvedBets.filter(r => r.bet.userName === userFilter);
  const allBets = filteredByUser.map(r => r.bet);
  const filtered = filter === "all" ? filteredByUser : filteredByUser.filter(r => r.bet.status === filter);

  // Organizado por hora del partido: activas (pendientes/en vivo) primero,
  // ordenadas de la más temprana a la más tardía; las resueltas (ganadas/
  // perdidas/nulas) bajan debajo del grupo activo, en el mismo orden por
  // hora. No es el orden en que se registró la apuesta, sino la hora del
  // partido al que corresponde.
  const sortedFiltered = useMemo(() => {
    const activeRank = (r: ResolvedBet) => (r.bet.status === "pending" ? 0 : 1);
    return [...filtered].sort((a, b) => {
      const rankDiff = activeRank(a) - activeRank(b);
      if (rankDiff !== 0) return rankDiff;
      const timeA = parseGameTimeToMinutes(a.game?.metadata?.time);
      const timeB = parseGameTimeToMinutes(b.game?.metadata?.time);
      return timeA - timeB;
    });
  }, [filtered]);

  return (
        <div className="lg:col-span-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit shrink-0">
                {(["all", "pending", "won", "lost"] as const).map(f => {
                  const fullLabel = f === "all" ? "Todas" : f === "pending" ? "Pendientes" : f === "won" ? "Ganadas" : "Perdidas";
                  const shortLabel = f === "won" ? "G" : f === "lost" ? "P" : fullLabel;
                  return (
                    <button key={f} onClick={() => setFilter(f)} title={fullLabel} aria-label={fullLabel}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all shrink-0 ${filter === f ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                      {shortLabel}
                      <span className={`ml-1 text-[10px] px-1 rounded-full ${filter === f ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-500"}`}>
                        {f === "all" ? allBets.length : allBets.filter(b => b.status === f).length}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  if (expandedBets.size === filtered.length && filtered.length > 0) {
                    setExpandedBets(new Set());
                  } else {
                    setExpandedBets(new Set(filtered.map(r => r.bet.id!)));
                  }
                }}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 transition border border-transparent hover:border-slate-300 shrink-0"
                title={expandedBets.size === filtered.length && filtered.length > 0 ? "Contraer Todas" : "Expandir Todas"}
              >
                {expandedBets.size === filtered.length && filtered.length > 0 ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {uniqueUsers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Users size={12} /> Filtro:</span>
                <select value={userFilter} onChange={e => onUserFilterChange(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="all">Todos los usuarios ({resolvedBets.length})</option>
                  {uniqueUsers.map(u => (
                    <option key={u} value={u}>{u} ({resolvedBets.filter(r => r.bet.userName === u).length})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {filtered.length === 0
            ? <div className="flex flex-col items-center justify-center py-14 text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <BarChart2 size={28} className="mb-2 opacity-40" />
              <p className="text-sm font-semibold">Sin apuestas para este día</p>
              <p className="text-xs mt-1">Registra tu primera jugada con el wizard</p>
            </div>
            : <div className="space-y-3 lg:max-h-[680px] lg:overflow-y-auto lg:pr-0.5">
              {sortedFiltered.map(({ bet, progress, game }) => {
                const catCfg = CATEGORY_CFG[bet.betCategory];
                const isRefreshing = refreshingIds.has(bet.gameId);

                let extraDetails = null;
                if (game && expandedBets.has(bet.id)) {
                  const isLiveOrFinal = game.game_result?.gameStatus?.includes("In Progress") || game.game_result?.gameStatus?.includes("Live") || game.game_result?.gameStatus?.includes("Final");
                  if (isLiveOrFinal) {
                    const ls = game.linescore;
                    const scoreText = ls ? `${game.teams.away} ${ls.awayTotals.runs} - ${ls.homeTotals.runs} ${game.teams.home}` : "";
                    const inningText = ls?.inningState ? `${ls.inningState === "Top" ? "Alta" : ls.inningState === "Bottom" ? "Baja" : ls.inningState === "Middle" ? "Mitad" : ls.inningState === "End" ? "Fin" : ls.inningState} ${ls.currentInning}` : "";

                    let statsText = "";
                    if (bet.betCategory === "pitcher") {
                      const side = bet.teamSide;
                      let p = game.liveBoxscore?.[side]?.pitchers?.find(p => p.name === bet.subject || (bet.subject.split(" ").length > 1 && p.name.toLowerCase().includes(bet.subject.split(" ").pop()!.toLowerCase())));
                      if (!p) {
                        const otherSide = side === "home" ? "away" : "home";
                        p = game.liveBoxscore?.[otherSide]?.pitchers?.find(p => p.name === bet.subject || (bet.subject.split(" ").length > 1 && p.name.toLowerCase().includes(bet.subject.split(" ").pop()!.toLowerCase())));
                      }
                      if (p) statsText = `IP: ${p.ip || "0.0"} | Picheos: ${p.pitches || 0} | ER: ${p.er || 0}`;
                    } else if (bet.betCategory === "batter") {
                      const side = bet.teamSide;
                      let b = game.liveBoxscore?.[side]?.batters?.find(b => b.name === bet.subject || (bet.subject.split(" ").length > 1 && b.name.toLowerCase().includes(bet.subject.split(" ").pop()!.toLowerCase())));
                      if (!b) {
                        const otherSide = side === "home" ? "away" : "home";
                        b = game.liveBoxscore?.[otherSide]?.batters?.find(b => b.name === bet.subject || (bet.subject.split(" ").length > 1 && b.name.toLowerCase().includes(bet.subject.split(" ").pop()!.toLowerCase())));
                      }
                      if (b) statsText = `AB: ${b.ab || 0} | H: ${b.h || 0} | R: ${b.r || 0} | RBI: ${b.rbi || 0} | K: ${b.k || 0}`;
                    }

                    extraDetails = (scoreText || statsText) ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 mt-3 bg-slate-50 p-2 rounded-lg border border-slate-100 font-semibold">
                        {scoreText && <span><span className="text-slate-400">Score:</span> {scoreText}</span>}
                        {inningText && <span><span className="text-slate-400">Inning:</span> {inningText}</span>}
                        {statsText && <span><span className="text-slate-400">Stats:</span> {statsText}</span>}
                      </div>
                    ) : null;
                  }
                }

                return (
                  <div key={bet.id}
                    className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${bet.status === "won" ? "border-emerald-200" : bet.status === "lost" ? "border-red-200" : "border-slate-200"}`}>

                    {!expandedBets.has(bet.id) ? (
                      <div className="cursor-pointer group" onClick={() => toggleCollapse(bet.id)}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate min-w-0">
                            <div className="shrink-0"><StatusBadge status={bet.status} /></div>
                            <span className="font-bold text-sm text-slate-800 truncate">{bet.subject}</span>
                            {/* Over/Under pill + label — compact */}
                            <span className="hidden sm:flex items-center gap-1 shrink-0">
                              {(bet.betTypeKey === "pitcher_k" || bet.betTypeKey === "batter_tb") && (
                                <span className={`text-[9px] font-extrabold px-1 py-0.5 rounded leading-tight ${
                                  bet.isOver
                                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                    : "bg-orange-100 text-orange-700 border border-orange-200"
                                }`}>
                                  {bet.isOver ? "▲ OVER" : "▼ UNDER"}
                                </span>
                              )}
                              <span className="text-xs text-slate-500 truncate">
                                {(() => {
                                  const lbl = (bet.betLabel || "")
                                    .replace(/más\s+de\s*(\(over\))?/gi, "")
                                    .replace(/menos\s+de\s*(\(under\))?/gi, "")
                                    .replace(/\(over\)/gi, "")
                                    .replace(/\(under\)/gi, "")
                                    .replace(/^(over|under)\s*/i, "")
                                    .trim();
                                  return lbl || bet.betLabel;
                                })()}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-sm text-slate-800">${bet.amount}</span>
                            {bet.status === "won" && bet.potentialWin > 0 && <span className="text-xs font-bold text-emerald-600 hidden sm:inline">+${bet.potentialWin.toFixed(2)}</span>}
                            {bet.status === "lost" && <span className="text-xs font-bold text-red-500 hidden sm:inline">-${bet.amount.toFixed(2)}</span>}
                            {bet.status === "pending" && bet.potentialWin > 0 && <span className="text-xs font-bold text-slate-400 hidden sm:inline">Pot: +${bet.potentialWin.toFixed(2)}</span>}
                            {bet.status === "void" && <span className="text-xs font-bold text-slate-500 hidden sm:inline">Void</span>}
                            <button onClick={(e) => { e.stopPropagation(); onRefreshBet(bet.gameId); }} disabled={isRefreshing}
                              className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-md text-slate-400 hover:text-violet-600 transition-colors disabled:opacity-40"
                              title="Actualizar">
                              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                            </button>
                            <button className="text-slate-400 hover:text-violet-600 transition-colors p-1.5">
                              <ChevronDown size={16} />
                            </button>
                          </div>
                        </div>
                        {bet.status === "pending" && (
                          <div className="pl-0 sm:pl-24">
                            <LiveProgressBar progress={progress} betStatus={bet.status} compact />
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 cursor-pointer group" onClick={() => toggleCollapse(bet.id)}>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${catCfg.bg} ${catCfg.color}`}>{catCfg.label}</span>
                              <StatusBadge status={bet.status} />
                              {bet.bookmaker && <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{bet.bookmaker}</span>}
                            </div>
                            <p className="font-bold text-sm text-slate-800 truncate">{bet.subject}</p>
                            <p className="text-xs text-slate-500">{bet.teamName} <span className="text-slate-300">vs</span> {bet.opponentName}</p>
                            {/* Rich bet label pill */}
                            {(() => {
                              const lbl = (bet.betLabel || "")
                                .replace(/más\s+de\s*(\(over\))?/gi, "Over ")
                                .replace(/menos\s+de\s*(\(under\))?/gi, "Under ")
                                .replace(/\(over\)/gi, "Over")
                                .replace(/\(under\)/gi, "Under")
                                .trim();
                              const isOv = bet.isOver;
                              const hasDir = /^(over|under)/i.test(lbl);
                              const dirWord = hasDir ? lbl.split(/\s/)[0] : (isOv ? "Over" : "Under");
                              const rest = hasDir ? lbl.slice(dirWord.length).trim() : lbl;
                              return (
                                <p className="flex items-center gap-1.5 mt-0.5">
                                  {(bet.betTypeKey === "pitcher_k" || bet.betTypeKey === "batter_tb") && (
                                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                      isOv
                                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                        : "bg-orange-100 text-orange-700 border border-orange-200"
                                    }`}>
                                      {isOv ? "▲ OVER" : "▼ UNDER"}
                                    </span>
                                  )}
                                  <span className="text-xs font-semibold text-slate-700">{rest || lbl}</span>
                                </p>
                              );
                            })()}
                            {bet.note && (
                              <p className="text-[10px] italic text-slate-400 flex items-start gap-1 mt-1">
                                <StickyNote size={10} className="shrink-0 mt-0.5" />{bet.note}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 mt-1 border-t border-slate-100 sm:pt-0 sm:mt-0 sm:border-t-0 sm:block sm:text-right sm:shrink-0 sm:space-y-0.5">
                            <p className="text-xs text-slate-400 font-semibold">{bet.userName}</p>
                            <p className="text-sm font-bold text-slate-800">{bet.amount > 0 ? `$${bet.amount}` : "—"}</p>
                            {bet.status === "won" && bet.potentialWin > 0 && (
                              <p className="text-[11px] font-bold text-emerald-600">+${bet.potentialWin.toFixed(2)}</p>
                            )}
                            {bet.status === "lost" && (
                              <p className="text-[11px] font-bold text-red-500">-${bet.amount.toFixed(2)}</p>
                            )}
                            {bet.status === "pending" && bet.potentialWin > 0 && (
                              <p className="text-[11px] font-bold text-slate-400">Pot: +${bet.potentialWin.toFixed(2)}</p>
                            )}
                            {bet.status === "void" && (
                              <p className="text-[11px] font-bold text-slate-500">Void</p>
                            )}
                            <p className="text-xs font-semibold text-slate-500">{formatOddsDisplay(bet.odds)}</p>
                            <p className="text-[10px] text-slate-400">{bet.createdAt}</p>
                            <div className="w-full flex items-center justify-start sm:justify-end gap-2 mt-2">
                              <button onClick={(e) => { e.stopPropagation(); onRefreshBet(bet.gameId); }} disabled={isRefreshing}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-md text-xs text-slate-500 hover:text-violet-600 transition-colors disabled:opacity-40 font-semibold border border-slate-200">
                                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                                <span>Actualizar</span>
                              </button>
                              <button className="inline-flex items-center text-slate-400 hover:text-violet-600 transition-colors p-1.5 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200">
                                <ChevronUp size={14} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <LiveProgressBar progress={progress} betStatus={bet.status} />

                        {extraDetails}

                        <div className="mt-3 flex justify-end gap-3 pt-3 border-t border-slate-100">
                          <button onClick={(e) => { e.stopPropagation(); onEditBet(bet); }}
                            className="text-[11px] text-slate-400 hover:text-violet-600 flex items-center gap-1 transition-colors font-semibold">
                            <Edit2 size={10} /> Editar
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); if (window.confirm("¿Estás seguro de que deseas eliminar esta apuesta? Esta acción no se puede deshacer.")) onDeleteBet(bet.id); }}
                            className="text-[11px] text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors font-semibold">
                            <Trash2 size={10} /> Eliminar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>}
        </div>
  );
};

export default BetList;
