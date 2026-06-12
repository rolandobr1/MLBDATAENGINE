/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Search, Calendar, Zap, Play, Loader2, Clock, CheckCircle, Database, Brain, HardDrive } from "lucide-react";

interface HarvesterPanelProps {
  onHarvest: (date: string, refreshOdds: boolean) => void;
  isLoading: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  harvestProgress: {
    pct: number;
    step: string;
    gameLabel?: string;
    gameIndex?: number;
    totalGames?: number;
    phase?: string;
  };
  extractedDates?: string[];
}

// Phase icon map for step dots
const PHASE_STEPS = [
  { phase: "schedule",  label: "Calendario",  icon: Calendar  },
  { phase: "real_data", label: "Datos MLB",    icon: Database  },
  { phase: "validate",  label: "Validación",   icon: Search    },
  { phase: "save",      label: "Base de datos",icon: HardDrive },
  { phase: "done",      label: "Completado",   icon: CheckCircle },
];

export const HarvesterPanel: React.FC<HarvesterPanelProps> = ({
  onHarvest,
  isLoading,
  selectedDate,
  setSelectedDate,
  harvestProgress,
  extractedDates,
}) => {
  const [refreshOdds, setRefreshOdds] = React.useState(false);

  const runHarvest = () => {
    onHarvest(selectedDate, refreshOdds);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
        
        {/* Date Selector & Engine Mode Column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-baseball-blue font-bold">
              1
            </div>
            <h3 className="font-display font-semibold text-slate-800 text-sm uppercase tracking-wide">
              Configurar Extracción
            </h3>
          </div>

          <div className="space-y-3">
            {/* Input Date selector */}
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {extractedDates && extractedDates.length > 0 && (
              <div className="relative">
                <Database className="absolute left-3 top-2.5 text-emerald-500" size={14} />
                <select
                  value={extractedDates.includes(selectedDate) ? selectedDate : ""}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="w-full bg-emerald-50 border border-emerald-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-medium appearance-none cursor-pointer"
                >
                  <option value="" disabled>Ver historial extraído...</option>
                  {extractedDates.map((date) => (
                    <option key={date} value={date}>{date} ({date === selectedDate ? "Actual" : "Ir"})</option>
                  ))}
                </select>
              </div>
            )}
            
            {extractedDates?.includes(selectedDate) && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <input
                  type="checkbox"
                  id="refreshOddsCheck"
                  checked={refreshOdds}
                  onChange={(e) => setRefreshOdds(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                />
                <label htmlFor="refreshOddsCheck" className="text-xs text-amber-800 font-medium cursor-pointer">
                  Refrescar cuotas (Consume The Odds API)
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Engine Launch Button + Progress Bar */}
        <div className="flex flex-col items-center justify-center space-y-3 lg:border-x lg:border-slate-200/70 lg:px-6">
          <button
            onClick={runHarvest}
            disabled={isLoading}
            className={`w-full py-4 rounded-xl font-display font-semibold text-white transition flex items-center justify-center gap-3 shadow-md ${
              isLoading
                ? "bg-slate-500 cursor-not-allowed"
                : "bg-baseball-red hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/10 active:scale-98 cursor-pointer"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin text-white" />
                <span className="text-sm">Extrayendo Datos...</span>
              </>
            ) : (
              <>
                <Play size={18} fill="currentColor" />
                <span className="text-sm">Ejecutar Extracción ETL</span>
              </>
            )}
          </button>

          {/* Progress Bar Block */}
          {isLoading ? (
            <HarvestProgressBar progress={harvestProgress} />
          ) : (
            <div className="text-slate-400 text-xs flex items-center gap-1.5 font-mono">
              <CheckCircle size={12} className="text-emerald-500" />
              <span>Base lista para consultas</span>
            </div>
          )}
        </div>

        {/* Scheduler / Automatic Flow Indicators (Requisito 6) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="text-indigo-600" size={16} />
            <h3 className="font-display font-semibold text-slate-800 text-sm uppercase tracking-wide">
              Estatus de Automatización (Cron)
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            {/* Morning check */}
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200/60 shadow-sm leading-none">
              <span className="text-slate-600 font-medium font-sans">1. Mañana (08:00 AM)</span>
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold uppercase text-[11px] tracking-wide text-right">
                Completado
              </span>
            </div>

            {/* Hourly Sync indicators */}
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200/60 shadow-sm leading-none">
              <span className="text-slate-600 font-medium font-sans">2. Sincronización Horaria</span>
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold uppercase text-[11px] tracking-wide text-right">
                Activa (Horario)
              </span>
            </div>

            {/* Lock Lines prior to Game */}
            <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200/60 shadow-sm leading-none">
              <span className="text-slate-600 font-medium font-sans">3. Cierre Líneas (T-35m)</span>
              <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold uppercase text-[11px] tracking-wide text-right">
                Programado
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

// -------------------------------------------------------
// Harvest Progress Bar — uses REAL server SSE progress
// -------------------------------------------------------
interface ProgressData {
  pct: number;
  step: string;
  gameLabel?: string;
  gameIndex?: number;
  totalGames?: number;
  phase?: string;
}

function HarvestProgressBar({ progress }: { progress: ProgressData }) {
  const { pct, step, gameLabel, gameIndex, totalGames, phase } = progress;

  // Find active phase index
  const activePhaseIdx = PHASE_STEPS.findIndex((p) => p.phase === phase);

  return (
    <div className="w-full space-y-2.5">

      {/* Top row: step label + percentage */}
      <div className="flex items-center justify-between text-xs font-mono gap-2">
        <span className="text-blue-600 font-semibold truncate flex-1 animate-pulse">
          {step || "Iniciando..."}
        </span>
        <span
          className="text-white font-bold text-xs bg-blue-600 px-2 py-0.5 rounded shrink-0 tabular-nums transition-all duration-500"
        >
          {pct}%
        </span>
      </div>

      {/* Glowing fill bar */}
      <div className="relative h-2.5 bg-slate-200 rounded-full overflow-hidden shadow-inner">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #3b82f6, #6366f1, #818cf8)",
            backgroundSize: "200% 100%",
            animation: "shimmerBar 2s linear infinite",
          }}
        />
      </div>

      {/* Phase step dots */}
      <div className="flex items-center justify-between gap-0.5">
        {PHASE_STEPS.map((s, i) => {
          const Icon = s.icon;
          const isDone = activePhaseIdx > i || phase === "done";
          const isActive = activePhaseIdx === i && phase !== "done";
          return (
            <div
              key={i}
              title={s.label}
              className={`flex-1 flex items-center justify-center transition-all duration-400 ${
                isDone || isActive ? "opacity-100" : "opacity-20"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-400 ${
                  isDone
                    ? "bg-emerald-100 text-emerald-600"
                    : isActive
                    ? "bg-blue-100 text-blue-600 ring-2 ring-blue-400 ring-offset-1"
                    : "bg-slate-100 text-slate-300"
                }`}
              >
                {isDone ? (
                  <CheckCircle size={10} />
                ) : (
                  <Icon size={10} className={isActive ? "animate-pulse" : ""} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Game counter row (only visible during per-game phases) */}
      {gameIndex && totalGames && (
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 border-t border-slate-200/60 pt-1.5">
          <span className="truncate max-w-[70%]">{gameLabel}</span>
          <span className="shrink-0 font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
            {gameIndex} / {totalGames}
          </span>
        </div>
      )}
    </div>
  );
}
