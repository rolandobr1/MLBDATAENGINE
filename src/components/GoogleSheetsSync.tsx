import React from "react";
import { CalendarDays, Database, FileSpreadsheet } from "lucide-react";
import { MLBGame } from "../types";

interface GoogleSheetsSyncProps {
  games: MLBGame[];
  selectedDate: string;
  compact?: boolean;
}

export const GoogleSheetsSync: React.FC<GoogleSheetsSyncProps> = ({ games, selectedDate, compact = false }) => {
  const fetchBattersCSV = async () => {
    const res = await fetch(`/api/batters-dataset/csv?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`);
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.text();
  };

  const handleDownloadBattersCSV = async () => {
    const csv = await fetchBattersCSV();
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
  };

  const handleDownloadDailyResultsCSV = () => {
    const link = document.createElement("a");
    link.setAttribute("href", `/api/daily-results/csv?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`);
    link.setAttribute("download", `MLB_RESULTADOS_DIA_${selectedDate}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-xl font-sans shadow-sm ${compact ? "p-4 space-y-4" : "p-6 space-y-6"}`}>
      <div className="flex items-center gap-3">
        <div className={`${compact ? "w-8 h-8" : "w-10 h-10"} bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center`}>
          <FileSpreadsheet size={20} />
        </div>
        <div>
          <h2 className={`font-display font-bold tracking-tight text-slate-800 ${compact ? "text-base" : "text-xl"}`}>
            Descarga de Conjuntos de Datos MLB
          </h2>
          <p className={`text-slate-500 text-xs mt-0.5 ${compact ? "hidden sm:block" : ""}`}>
            Genera los conjuntos de datos limpios en formato CSV para tu modelo de ML.
          </p>
        </div>
      </div>

      <div className={`bg-slate-50 border border-slate-150 rounded-xl ${compact ? "p-3" : "p-5 space-y-4"}`}>
        <div className={compact ? "hidden" : ""}>
          <h4 className="font-display font-semibold text-slate-800 text-sm flex items-center gap-1.5">
            <span>Descargas de Archivos CSV</span>
            <span className="bg-blue-100 text-blue-800 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">
              Directo
            </span>
          </h4>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed">
            Descarga o copia el dataset unificado de bateadores y partidos listo para importar.
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Dataset Unificado
          </span>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleDownloadDailyResultsCSV}
              disabled={games.length === 0}
              className="flex-1 py-2 px-3 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <CalendarDays size={14} />
              <span>Descargar resultados del día</span>
            </button>

            <button
              onClick={handleDownloadBattersCSV}
              disabled={games.length === 0}
              className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <Database size={14} />
              <span>Descargar CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
