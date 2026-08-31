/**
 * Badge de estado de una apuesta (Pendiente/Ganada/Perdida/Nula).
 * Extraído de BetTracking.tsx (Fase 6, punto 1 del plan de mejora).
 */

import React from "react";
import { Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { BetStatus } from "./betTrackingTypes";

export const StatusBadge: React.FC<{ status: BetStatus }> = ({ status }) => {
  const cfg = {
    pending: { cls: "bg-amber-100 text-amber-700 border-amber-200", label: "Pendiente", Icon: Clock },
    won: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Ganada", Icon: CheckCircle2 },
    lost: { cls: "bg-red-100 text-red-600 border-red-200", label: "Perdida", Icon: XCircle },
    void: { cls: "bg-slate-100 text-slate-600 border-slate-200", label: "Nula / Push", Icon: AlertTriangle },
  }[status];
  return <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}><cfg.Icon size={11} />{cfg.label}</span>;
};

export default StatusBadge;
