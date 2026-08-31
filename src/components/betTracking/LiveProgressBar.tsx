/**
 * Barra de progreso en vivo de una apuesta (Ks acumulados, bases totales, o
 * marcador, según el tipo de apuesta).
 * Extraído de BetTracking.tsx (Fase 6, punto 1 del plan de mejora).
 */

import React from "react";
import { Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { LiveProgress, BetStatus } from "./betTrackingTypes";

export const LiveProgressBar: React.FC<{ progress: LiveProgress; betStatus: BetStatus; compact?: boolean }> = ({ progress, betStatus, compact }) => {
  const { pct, display, hint, startLabel, isLive, isFinal, autoStatus } = progress;
  const effectiveStatus = betStatus !== "pending" ? betStatus : autoStatus;
  let bar = "from-violet-500 to-indigo-500";
  let dot: React.ReactNode = <Clock size={11} className="text-amber-500" />;
  let label = "Esperando";
  if (effectiveStatus === "won") { bar = "from-emerald-400 to-emerald-600"; dot = <CheckCircle2 size={11} className="text-emerald-600" />; label = "¡Ganó!"; }
  else if (effectiveStatus === "lost") { bar = "from-red-400 to-red-500"; dot = <XCircle size={11} className="text-red-500" />; label = "Perdió"; }
  else if (effectiveStatus === "void") { bar = "from-slate-300 to-slate-450"; dot = <AlertTriangle size={11} className="text-slate-500" />; label = "Push / Nula"; }
  else if (isLive) { dot = <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse" />; label = "En vivo"; }
  else if (isFinal) { bar = "from-slate-400 to-slate-500"; label = "Finalizado"; }
  else if (startLabel) { label = startLabel; }
  return (
    <div className={`space-y-1.5 ${compact ? "mt-1.5" : "mt-3"}`}>
      <div className="flex justify-between items-center text-[11px]">
        <span className="font-bold text-slate-700">{display}</span>
        <span className="flex items-center gap-1 font-semibold text-slate-500">{dot} {label}</span>
      </div>
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${compact ? "h-1" : "h-2"}`}>
        <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      {!compact && <p className="text-[10px] text-slate-400 italic">{hint}</p>}
    </div>
  );
};

export default LiveProgressBar;
