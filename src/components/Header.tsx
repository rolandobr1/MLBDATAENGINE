/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Activity, Database, AlertCircle, FileSpreadsheet } from "lucide-react";

interface HeaderProps {
  gamesCount: number;
  totalGamesCount: number;
  errorsCount: number;
  onOpenDiagnostics: () => void;
  onScrollToSheets: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  gamesCount,
  totalGamesCount,
  errorsCount,
  onOpenDiagnostics,
  onScrollToSheets,
}) => {
  const [time, setTime] = React.useState<string>("");

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("es-MX", {
          timeZone: "America/Santo_Domingo",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 backdrop-blur-md bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand visual identities */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-baseball-red flex items-center justify-center font-display font-bold text-lg text-white shadow-lg shadow-red-900/30">
            MLB
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl tracking-tight flex items-center gap-2">
              MLB Data Engine
              <span className="text-xs bg-baseball-blue text-blue-200 uppercase px-2 py-0.5 rounded-full font-mono font-medium border border-blue-500/20">
                v1.0.0
              </span>
            </h1>
            <p className="text-slate-400 text-xs font-sans mt-0.5">
              Sistema Automatizado de Ingesta y Preparación de Datos MLB para Modelos Predictivos
            </p>
          </div>
        </div>

        {/* Realtime stats bar */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          {/* Dominican Republic clock */}
          <div className="bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800 flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Reloj RD: {time || "..."}</span>
          </div>

          {/* Database state indicator */}
          <div className="bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800 flex items-center gap-3 text-slate-300">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-blue-400" />
              <span>Día Actual: <strong className="text-white">{gamesCount}</strong> Juegos</span>
            </div>
            <div className="w-px h-4 bg-slate-800"></div>
            <div className="flex items-center gap-2" title="Total en la base de datos">
              <span>Total BD: <strong className="text-white">{totalGamesCount}</strong></span>
            </div>
          </div>

          {/* Verification Errors count triggers */}
          <button
            onClick={onOpenDiagnostics}
            className={`px-3 py-1.5 rounded-md border text-left transition-all ${
              errorsCount > 0
                ? "bg-red-950/40 border-red-900/30 hover:bg-red-950/60 text-red-300 cursor-pointer"
                : "bg-slate-950 border-slate-800 text-slate-400"
            } flex items-center gap-2`}
          >
            <AlertCircle size={14} className={errorsCount > 0 ? "text-baseball-red animate-pulse" : "text-slate-500"} />
            <span>Errores de Guardado/Rango: <strong className={errorsCount > 0 ? "text-red-400 font-bold" : "text-slate-400"}>{errorsCount}</strong></span>
          </button>

          {/* Sheet quick navigation links */}
          <button
            onClick={onScrollToSheets}
            className="bg-emerald-950/40 hover:bg-emerald-950/60 transition-all border border-emerald-900/40 px-3 py-1.5 rounded-md flex items-center gap-2 text-emerald-300 cursor-pointer"
          >
            <FileSpreadsheet size={14} className="text-emerald-400" />
            <span>Sheets Export</span>
          </button>
        </div>
      </div>
    </header>
  );
};
