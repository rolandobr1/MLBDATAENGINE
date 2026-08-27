import React, { useState } from "react";
import { CalendarDays, Database, FileSpreadsheet } from "lucide-react";
import { MLBGame } from "../types";

interface GoogleSheetsSyncProps {
  games: MLBGame[];
  selectedDate: string;
  compact?: boolean;
}

export const GoogleSheetsSync: React.FC<GoogleSheetsSyncProps> = ({ games, selectedDate, compact = false }) => {
  const [klabStartDate, setKlabStartDate] = useState("");
  const [klabEndDate, setKlabEndDate] = useState("");
  const [klabPreview, setKlabPreview] = useState<any>(null);
  const [klabError, setKlabError] = useState("");
  const [klabLoading, setKlabLoading] = useState(false);
  const [klabSyncResult, setKlabSyncResult] = useState<any>(null);

  const klabQuery = () => `start_date=${encodeURIComponent(klabStartDate)}&end_date=${encodeURIComponent(klabEndDate)}`;
  const previewMatchesRange = klabPreview?.startDate === klabStartDate && klabPreview?.endDate === klabEndDate;

  const handleKlabPreview = async () => {
    setKlabLoading(true);
    setKlabError("");
    try {
      const res = await fetch(`/api/datasets/klab-training/preview?${klabQuery()}&_=${Date.now()}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "No se pudo analizar el rango");
      setKlabPreview(payload.report);
    } catch (error) {
      setKlabPreview(null);
      setKlabError(error instanceof Error ? error.message : "No se pudo analizar el rango");
    } finally {
      setKlabLoading(false);
    }
  };

  const handleFirestoreRangeSync = async () => {
    setKlabLoading(true);
    setKlabError("");
    setKlabSyncResult(null);
    try {
      const syncRes = await fetch("/api/firestore/sync-local-range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: klabStartDate, end_date: klabEndDate }),
      });
      const syncPayload = await syncRes.json();
      if (!syncRes.ok) throw new Error(syncPayload.error || "No se pudo sincronizar Firestore");
      setKlabSyncResult(syncPayload);

      const previewRes = await fetch(`/api/datasets/klab-training/preview?${klabQuery()}&_=${Date.now()}`);
      const previewPayload = await previewRes.json();
      if (!previewRes.ok) throw new Error(previewPayload.error || "La sincronización terminó, pero falló la previsualización");
      setKlabPreview(previewPayload.report);
    } catch (error) {
      setKlabError(error instanceof Error ? error.message : "No se pudo sincronizar Firestore");
    } finally {
      setKlabLoading(false);
    }
  };

  const handleDownloadKlabCSV = async () => {
    setKlabLoading(true);
    setKlabError("");
    try {
      const res = await fetch(`/api/datasets/klab-training/csv?${klabQuery()}&_=${Date.now()}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "No se pudo generar el dataset");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `KLAB_PITCHER_TRAINING_DATASET_${klabStartDate}_${klabEndDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setKlabError(error instanceof Error ? error.message : "No se pudo generar el dataset");
    } finally {
      setKlabLoading(false);
    }
  };
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

  const handleDownloadKPropsCSV = async () => {
    try {
      const res = await fetch(`/api/k-props/csv?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`);
      if (!res.ok) throw new Error(await res.text());
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `k_props_lines_${selectedDate}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading K Props CSV:", err);
    }
  };

  const handleDownloadBatterTotalBasesCSV = async () => {
    try {
      const res = await fetch(`/api/batter-total-bases/csv?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`);
      if (!res.ok) throw new Error(await res.text());
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `batter_total_bases_lines_${selectedDate}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading Batter Total Bases CSV:", err);
    }
  };

  const handleDownloadDerivedCSV = async (dataset: "pitcher-game" | "game" | "batter-game" | "pitcher-props", filename: string) => {
    try {
      const res = await fetch(`/api/datasets/${dataset}/csv?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = new Blob([await res.text()], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading derived ML CSV:", err);
    }
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
            <span className="bg-blue-100 text-blue-800 text-xs uppercase font-bold px-1.5 py-0.5 rounded">
              Directo
            </span>
          </h4>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed">
            Descarga o copia el dataset unificado de bateadores y partidos listo para importar.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Datasets Principales (Sin Props)
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
                <span>Descargar CSV Bateadores</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Props de Jugadores (Líneas e Odds)
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleDownloadKPropsCSV}
                disabled={games.length === 0}
                className="flex-1 py-2 px-3 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Database size={14} />
                <span>Descargar K Props (Lanzadores)</span>
              </button>

              <button
                onClick={handleDownloadBatterTotalBasesCSV}
                disabled={games.length === 0}
                className="flex-1 py-2 px-3 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Database size={14} />
                <span>Descargar Bases Totales (Bateadores)</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Datasets ML derivados (snapshot pregame)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button onClick={() => handleDownloadDerivedCSV("pitcher-game", `MLB_PITCHER_GAME_DATASET_${selectedDate}.csv`)} disabled={games.length === 0} className="py-2 px-3 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer">Pitcher por juego</button>
              <button onClick={() => handleDownloadDerivedCSV("game", `MLB_GAME_DATASET_${selectedDate}.csv`)} disabled={games.length === 0} className="py-2 px-3 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer">Juego</button>
              <button onClick={() => handleDownloadDerivedCSV("batter-game", `MLB_BATTER_GAME_DATASET_${selectedDate}.csv`)} disabled={games.length === 0} className="py-2 px-3 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer">Bateador por juego</button>
              <button onClick={() => handleDownloadDerivedCSV("pitcher-props", `MLB_PITCHER_PROPS_DATASET_${selectedDate}.csv`)} disabled={games.length === 0} className="py-2 px-3 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer">Props de pitchers</button>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Histórico de entrenamiento K-lab
              </span>
              <p className="text-xs text-slate-500 mt-1">Selecciona un rango inclusivo. Primero se muestra la validación; no se usa todo el historial por defecto.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Fecha inicial
                <input type="date" required value={klabStartDate} onChange={(event) => { setKlabStartDate(event.target.value); setKlabPreview(null); setKlabSyncResult(null); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700" />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Fecha final
                <input type="date" required value={klabEndDate} onChange={(event) => { setKlabEndDate(event.target.value); setKlabPreview(null); setKlabSyncResult(null); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700" />
              </label>
            </div>
            <button onClick={handleFirestoreRangeSync} disabled={klabLoading || !klabStartDate || !klabEndDate} className="w-full py-2 px-3 border border-sky-300 bg-sky-50 hover:bg-sky-100 disabled:opacity-50 text-sky-800 text-xs font-semibold rounded-lg transition cursor-pointer">
              {klabLoading ? "Procesando…" : "Sincronizar rango desde Firestore al local"}
            </button>
            <button onClick={handleKlabPreview} disabled={klabLoading || !klabStartDate || !klabEndDate} className="w-full py-2 px-3 border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-800 text-xs font-semibold rounded-lg transition cursor-pointer">
              {klabLoading ? "Analizando…" : "Analizar rango antes de generar"}
            </button>
            {klabError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{klabError}</p>}
            {klabSyncResult && <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg p-2">Firestore: {klabSyncResult.remoteGames} juegos en {klabSyncResult.datesFound} fechas; agregados {klabSyncResult.added}, actualizados {klabSyncResult.updated}, sin cambios {klabSyncResult.unchanged}. Luego se recalculó la previsualización K-lab.</p>}
            {previewMatchesRange && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 text-xs text-slate-600">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <span><strong className="block text-slate-800">{klabPreview.totalGames}</strong> juegos</span>
                  <span><strong className="block text-slate-800">{klabPreview.candidatePitchers}</strong> pitchers candidatos</span>
                  <span><strong className="block text-slate-800">{klabPreview.candidateRows}</strong> filas candidatas</span>
                  <span><strong className="block text-emerald-700">{klabPreview.finalRows}</strong> filas finales</span>
                </div>
                <p>Descartadas sin K real: {klabPreview.discardedWithoutActualK}; K inválido: {klabPreview.discardedInvalidActualK}; duplicados: {klabPreview.duplicateKeys.length}; fuera de rango: {klabPreview.outOfRangeRows}.</p>
                <p>Juegos sin snapshot pregame: {klabPreview.gamesWithoutPregameSnapshot}; anomalías para revisión: {klabPreview.anomalies.length}; columnas con fuga: {klabPreview.leakageColumns.length}.</p>
                <button onClick={handleDownloadKlabCSV} disabled={klabLoading || klabPreview.finalRows === 0} className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition cursor-pointer">
                  Generar y descargar {klabPreview.outputFilename}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
