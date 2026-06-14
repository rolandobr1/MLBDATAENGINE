/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Activity, Database, AlertCircle, FileSpreadsheet, Info, X } from "lucide-react";

interface HeaderProps {
  gamesCount: number;
  totalGamesCount: number;
  errorsCount: number;
  propsCount?: { total: number, ks: number, tb: number, oddsApi?: number, dataStreak?: number, unknown?: number };
  missingPitchers?: { name: string, team: string }[];
  onOpenDiagnostics: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  gamesCount,
  totalGamesCount,
  errorsCount,
  propsCount,
  missingPitchers = [],
  onOpenDiagnostics,
}) => {
  const [time, setTime] = React.useState<string>("");
  const [isPropsInfoOpen, setIsPropsInfoOpen] = React.useState<boolean>(false);

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
    <header className="bg-slate-900 border-b border-slate-800 text-white relative md:sticky md:top-0 z-40 backdrop-blur-md bg-opacity-95">
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
            {gamesCount > 0 && propsCount !== undefined && (
              <>
                <div className="w-px h-4 bg-slate-800"></div>
                <div className={`flex items-center gap-2 ${propsCount.total === 0 ? "text-amber-400" : "text-slate-300"}`} title="Props extraídos de la API">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">Props:</span>
                    <span title="Ponches (Strikeouts) de Lanzadores" className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      <strong className={propsCount.ks === 0 ? "text-amber-400" : "text-blue-300"}>{propsCount.ks}</strong> Ks
                    </span>
                    <span title="Bases Totales (Total Bases) de Bateadores" className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      <strong className={propsCount.tb === 0 ? "text-amber-400" : "text-emerald-300"}>{propsCount.tb}</strong> TB
                    </span>
                    <span title="Props extraidos desde The Odds API" className="bg-blue-950/70 border border-blue-800/70 px-1.5 py-0.5 rounded text-[10px] font-mono text-blue-200">
                      API <strong className="text-white">{propsCount.oddsApi ?? 0}</strong>
                    </span>
                    <span title="Props extraidos desde DataStreak" className="bg-emerald-950/70 border border-emerald-800/70 px-1.5 py-0.5 rounded text-[10px] font-mono text-emerald-200">
                      DS <strong className="text-white">{propsCount.dataStreak ?? 0}</strong>
                    </span>
                    {(propsCount.unknown ?? 0) > 0 && (
                      <span title="Props existentes sin identificador de fuente guardado" className="bg-amber-950/70 border border-amber-800/70 px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-200">
                        Sin ID <strong className="text-white">{propsCount.unknown}</strong>
                      </span>
                    )}
                  </div>
                  {propsCount.total === 0 && <AlertCircle size={12} className="animate-pulse" />}
                  {missingPitchers.length > 0 && (
                    <div className="relative">
                      <button 
                        onClick={() => setIsPropsInfoOpen(!isPropsInfoOpen)}
                        className={`p-1 rounded hover:bg-slate-800 transition ${isPropsInfoOpen ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
                        title="Ver pitchers faltantes"
                      >
                        <Info size={14} />
                      </button>
                      {isPropsInfoOpen && (
                        <div className="absolute top-full mt-2 right-0 w-80 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg p-4 z-50 animate-fade-in text-slate-300 text-xs">
                          <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                            <h4 className="font-bold text-slate-100 flex items-center gap-1.5"><Info size={14} className="text-blue-400"/> ¿Por qué faltan Props?</h4>
                            <button onClick={() => setIsPropsInfoOpen(false)} className="text-slate-500 hover:text-white transition"><X size={14} /></button>
                          </div>
                          <p className="mb-3 leading-relaxed">
                            A <strong className="text-white">{missingPitchers.length} lanzadores</strong> no se les pudo asignar líneas de ponches. Esto <strong>NO</strong> es un error de extracción, sino que sus líneas aún no han sido publicadas en el mercado (The Odds API / DataStreak).
                          </p>
                          <p className="mb-2 text-[10px] text-slate-400">
                            Causas comunes: Abridor Por Definir (TBD), relevistas abriendo juegos (Openers), o decisión tardía.
                          </p>
                          <div className="bg-slate-950 p-2 rounded border border-slate-800 max-h-32 overflow-y-auto">
                            <ul className="space-y-1.5">
                              {missingPitchers.map((p, idx) => (
                                <li key={idx} className="flex flex-col border-b border-slate-800/50 pb-1 last:border-0 last:pb-0">
                                  <strong className="text-white truncate">{p.name}</strong>
                                  <span className="text-[9px] text-slate-500 font-mono truncate">{p.team}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
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
        </div>
      </div>
    </header>
  );
};
