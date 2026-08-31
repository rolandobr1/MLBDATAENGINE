/**
 * Panel de analíticas (tasa de acierto, ROI, racha, mejor categoría).
 * Extraído de BetTracking.tsx (Fase 6, punto 1 del plan de mejora).
 */

import React from "react";
import { Percent, TrendingUp, Flame, Award } from "lucide-react";
import { Bet, BetCategory } from "./betTrackingTypes";
import { CATEGORY_CFG } from "./betTrackingHelpers";

export const AnalyticsDashboard: React.FC<{ bets: Bet[] }> = ({ bets }) => {
  const closed = bets.filter(b => b.status !== "pending" && b.status !== "void");
  const wins = closed.filter(b => b.status === "won");
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const totalRisk = closed.reduce((s, b) => s + b.amount, 0);
  const totalReturn = wins.reduce((s, b) => s + b.potentialWin, 0) - closed.filter(b => b.status === "lost").reduce((s, b) => s + b.amount, 0);
  const roi = totalRisk > 0 ? Math.round((totalReturn / totalRisk) * 100) : 0;

  // Streak
  let streak = 0, streakType: "W" | "L" | null = null;
  for (let i = bets.filter(b => b.status !== "pending").length - 1; i >= 0; i--) {
    const b = bets.filter(b => b.status !== "pending")[i];
    const t = b.status === "won" ? "W" : "L";
    if (streakType === null) { streakType = t; streak = 1; }
    else if (t === streakType) streak++;
    else break;
  }

  // Best category
  const catWinRates = (["pitcher", "batter", "team"] as BetCategory[]).map(cat => {
    const c = closed.filter(b => b.betCategory === cat);
    const w = c.filter(b => b.status === "won");
    return { cat, rate: c.length > 0 ? Math.round((w.length / c.length) * 100) : 0, count: c.length };
  }).filter(x => x.count > 0).sort((a, b) => b.rate - a.rate);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 p-4 bg-slate-900 rounded-xl border border-slate-800">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-violet-900/60 rounded-lg flex items-center justify-center"><Percent size={16} className="text-violet-400" /></div>
        <div><p className="text-[10px] text-slate-500 font-semibold uppercase">Tasa de Acierto</p><p className="text-lg font-bold text-white">{winRate}%</p><p className="text-[10px] text-slate-500">{wins.length}/{closed.length} apuestas</p></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-emerald-900/60 rounded-lg flex items-center justify-center"><TrendingUp size={16} className="text-emerald-400" /></div>
        <div><p className="text-[10px] text-slate-500 font-semibold uppercase">ROI</p><p className={`text-lg font-bold ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>{roi >= 0 ? "+" : ""}{roi}%</p><p className="text-[10px] text-slate-500">retorno neto</p></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-amber-900/60 rounded-lg flex items-center justify-center"><Flame size={16} className="text-amber-400" /></div>
        <div><p className="text-[10px] text-slate-500 font-semibold uppercase">Racha</p>
          <p className={`text-lg font-bold ${streakType === "W" ? "text-emerald-400" : streakType === "L" ? "text-red-400" : "text-slate-400"}`}>
            {streak > 0 && streakType ? `${streak} ${streakType}` : "—"}
          </p>
          <p className="text-[10px] text-slate-500">consecutivas</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-blue-900/60 rounded-lg flex items-center justify-center"><Award size={16} className="text-blue-400" /></div>
        <div><p className="text-[10px] text-slate-500 font-semibold uppercase">Mejor Categoría</p>
          <p className="text-sm font-bold text-white">{catWinRates[0] ? CATEGORY_CFG[catWinRates[0].cat].label : "—"}</p>
          <p className="text-[10px] text-slate-500">{catWinRates[0] ? `${catWinRates[0].rate}% WR` : "sin datos"}</p>
        </div>
      </div>
    </div>
  );
};


export default AnalyticsDashboard;
