/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AlertCircle, Trash2, X, RefreshCw, Layers } from "lucide-react";
import { LoggedError } from "../types";

interface DiagnosticsPanelProps {
  errors: LoggedError[];
  onClear: () => void;
  onRefresh: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  errors,
  onClear,
  onRefresh,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-end">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col font-sans animate-slide-in">
        
        {/* Panel Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-baseball-red" size={20} />
            <span className="font-display font-medium text-lg">Consola de Verificación y Calidad de BBDD</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-800 transition text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-slate-700 text-xs flex gap-3">
            <Layers className="text-blue-500 shrink-0" size={18} />
            <div>
              <p className="font-semibold text-blue-900">Validaciones en Tiempo Real (ETL Sanity Check)</p>
              <p className="mt-1 leading-relaxed text-blue-800">
                El motor verifica automáticamente los datos del MLB Stats API antes de confirmar el guardado. 
                Se analizan rangos realistas de pitcheo (ERA, WHIP), consistencia ofensiva (OPS) y consistencia en las líneas de apuestas.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-display font-medium text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
              <span>Bitácora de Eventos de Calidad</span>
              <span className="bg-slate-150 text-slate-700 text-xs px-2 py-0.5 rounded-full font-mono">
                {errors.length}
              </span>
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={onRefresh}
                className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 text-slate-600 transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>Actualizar</span>
              </button>

              {errors.length > 0 && (
                <button
                  onClick={onClear}
                  className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>Vaciar Registro</span>
                </button>
              )}
            </div>
          </div>

          {errors.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl space-y-3">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
                <span className="w-4 h-4 rounded-full bg-emerald-500"></span>
              </div>
              <div className="max-w-sm mx-auto">
                <p className="font-semibold text-slate-800 text-sm">Cero anomalías detectadas en la base de datos</p>
                <p className="text-slate-500 text-xs mt-1 px-4">
                  Todos los registros diarios de la tabla de datos MLB se han cargado completos, válidos y dentro de los rangos deportivos aceptados.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {errors.map((err) => (
                <div
                  key={err.id}
                  className={`p-3.5 rounded-lg border flex flex-col gap-2 transition ${
                    err.severity === "high"
                      ? "bg-red-50 border-red-200 text-red-900"
                      : err.severity === "medium"
                      ? "bg-amber-50 border-amber-200 text-amber-900"
                      : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-900/5 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          err.severity === "high"
                            ? "bg-red-500"
                            : err.severity === "medium"
                            ? "bg-amber-500"
                            : "bg-slate-500"
                        }`}
                      ></span>
                      <strong className="uppercase font-bold tracking-wide">
                        Gravedad: {err.severity}
                      </strong>
                    </div>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(err.timestamp).toLocaleTimeString("es-MX", { hour12: false })}
                    </span>
                  </div>

                  <p className="font-sans leading-relaxed text-slate-700">{err.message}</p>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900/5">
                    <span>Origen: {err.source}</span>
                    {err.gameId && <span className="font-bold">ID Juego: {err.gameId}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
