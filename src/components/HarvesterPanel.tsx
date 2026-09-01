/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Search, Calendar, CalendarDays, Zap, Play, Loader2, Clock, CheckCircle, Database, Brain, HardDrive, Layers } from "lucide-react";
import { MLBGame } from "../types";

interface HarvesterPanelProps {
  onHarvest: (date: string, refreshOdds: boolean) => void;
  onBatchHarvest?: (startDate: string, endDate: string, refreshOdds: boolean) => void;
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
  onCancel?: () => void;
  syncRemoteDates?: () => void;
  /** Reorganización del panel: las descargas rápidas ("Datasets Principales")
   * que antes vivían en `GoogleSheetsSync` ahora se muestran acá, a la
   * derecha, en el espacio que dejó libre el botón de extracción al bajarlo
   * debajo de "Configurar Extracción". El resto de las descargas (props,
   * derivados, histórico K-lab) se quedaron en `GoogleSheetsSync`, ahora
   * colapsadas en menús desplegables. */
  games?: MLBGame[];
  /** `GoogleSheetsSync` (props/derivados/histórico K-lab), pasado por
   * App.tsx — se renderiza en la columna de "Descargas Rápidas", justo
   * debajo de los dos botones principales. */
  children?: React.ReactNode;
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
  onBatchHarvest,
  isLoading,
  selectedDate,
  setSelectedDate,
  harvestProgress,
  extractedDates,
  onCancel,
  syncRemoteDates,
  games,
  children,
}) => {
  const [refreshOdds, setRefreshOdds] = React.useState(false);
  const [isBatchMode, setIsBatchMode] = React.useState(false);
  const [batchEndDate, setBatchEndDate] = React.useState(new Date().toISOString().split("T")[0]);

  const runHarvest = () => {
    if (isBatchMode && onBatchHarvest) {
      onBatchHarvest(selectedDate, batchEndDate, refreshOdds);
    } else {
      onHarvest(selectedDate, refreshOdds);
    }
  };

  const hasGames = (games?.length ?? 0) > 0;

  const handleDownloadDailyResultsCSV = async () => {
    try {
      const res = await fetch(`/api/daily-results/csv?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`);
      if (!res.ok) throw new Error(await res.text());
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `MLB_RESULTADOS_DIA_${selectedDate}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading Daily Results CSV:", err);
    }
  };

  const handleDownloadBattersCSV = async () => {
    try {
      const res = await fetch(`/api/batters-dataset/csv?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`);
      if (!res.ok) throw new Error(await res.text());
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `MLB_BATTERS_DATASET_${selectedDate}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading Batters CSV:", err);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Column 1: Configurar Extracción (arriba) + botón de extracción y progreso (abajo) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-baseball-blue font-bold">
              1
            </div>
            <h3 className="font-display font-semibold text-slate-800 text-sm uppercase tracking-wide flex-1">
              Configurar Extracción
            </h3>
            
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button
                onClick={() => setIsBatchMode(false)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${!isBatchMode ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Simple
              </button>
              <button
                onClick={() => setIsBatchMode(true)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1 ${isBatchMode ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Layers size={12} />
                Lote
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {/* Input Date selector (Start Date) */}
            <div className="relative">
              <label className="text-xs text-slate-500 font-semibold mb-1 block">
                {isBatchMode ? "Desde:" : "Fecha:"}
              </label>
              <Calendar className="absolute left-3 top-8 text-slate-400" size={16} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {isBatchMode && (
              <div className="relative">
                <label className="text-xs text-slate-500 font-semibold mb-1 block">Hasta:</label>
                <Calendar className="absolute left-3 top-8 text-slate-400" size={16} />
                <input
                  type="date"
                  value={batchEndDate}
                  onChange={e => setBatchEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {!isBatchMode && extractedDates && extractedDates.length > 0 && (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Database className="absolute left-3 top-2.5 text-emerald-500" size={14} />
                  <select
                    value={extractedDates.includes(selectedDate) ? selectedDate : ""}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDate(e.target.value);
                    }}
                    className="w-full bg-emerald-50 border border-emerald-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-medium appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Ver historial local...</option>
                    {extractedDates.map((date) => (
                      <option key={date} value={date}>{date} ({date === selectedDate ? "Actual" : "Ir"})</option>
                    ))}
                  </select>
                </div>
                {syncRemoteDates && (
                  <button
                    onClick={syncRemoteDates}
                    className="shrink-0 px-3 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-100 transition shadow-sm"
                    title="Cargar fechas desde la nube (Firestore)"
                  >
                    ☁️ Nube
                  </button>
                )}
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

          {/* Botón de extracción + progreso: ahora debajo de la configuración
              (antes vivía en una columna aparte al lado derecho) */}
          <div className="flex flex-col items-center justify-center space-y-3 pt-2 border-t border-slate-200/70">
            {isLoading ? (
              <button
                onClick={() => onCancel && onCancel()}
                className="w-full py-4 rounded-xl font-display font-semibold text-white transition flex items-center justify-center gap-3 shadow-md bg-red-600 hover:bg-red-700 hover:shadow-lg active:scale-98 cursor-pointer"
              >
                <Loader2 size={18} className="animate-spin text-white" />
                <span className="text-sm">Detener Extracción</span>
              </button>
            ) : (
              <button
                onClick={runHarvest}
                className="w-full py-4 rounded-xl font-display font-semibold text-white transition flex items-center justify-center gap-3 shadow-md bg-baseball-red hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/10 active:scale-98 cursor-pointer"
              >
                <Play size={18} fill="currentColor" />
                <span className="text-sm">
                  {isBatchMode ? "Ejecutar Lote y Descargar CSV" : "Ejecutar Extracción ETL"}
                </span>
              </button>
            )}

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
        </div>

        {/* Column 2: Descargas rápidas — antes eran "Datasets Principales
            (Sin Props)" dentro de GoogleSheetsSync; se subieron acá, al
            espacio que dejó libre el botón de extracción al bajar a la
            columna 1. El resto de las descargas (props, derivados, histórico
            K-lab) se quedaron en GoogleSheetsSync, ahora en desplegables. */}
        <div className="lg:border-l lg:border-slate-200/70 lg:pl-6 space-y-3">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Descargas Rápidas (Datasets Principales)
          </span>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleDownloadDailyResultsCSV}
              disabled={!hasGames}
              className="w-full py-2.5 px-3 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <CalendarDays size={14} />
              <span>Descargar resultados del día</span>
            </button>
            <button
              onClick={handleDownloadBattersCSV}
              disabled={!hasGames}
              className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <Database size={14} />
              <span>Descargar CSV Bateadores</span>
            </button>
          </div>

          {/* Resto de las descargas (props, derivados, histórico K-lab) —
              `GoogleSheetsSync`, inyectado por App.tsx como children — se
              muestran justo debajo de las principales, en esta misma
              columna, en vez de en un panel aparte más abajo en la página. */}
          {children}
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
