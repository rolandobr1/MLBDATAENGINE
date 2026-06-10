/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Header } from "./components/Header";
import { HarvesterPanel } from "./components/HarvesterPanel";
import { GameCard } from "./components/GameCard";
import { GoogleSheetsSync } from "./components/GoogleSheetsSync";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { MLBGame, LoggedError } from "./types";
import { 
  Database, 
  HelpCircle, 
  FileSpreadsheet, 
  Award, 
  Sparkles, 
  Activity, 
  CheckCircle,
  FileCode,
  Search
} from "lucide-react";

function getLocalDateString(): string {
  const localDate = new Date();
  const tzOffset = localDate.getTimezoneOffset() * 60000;
  return new Date(localDate.getTime() - tzOffset).toISOString().split("T")[0];
}

export default function App() {
  const [selectedDate, setSelectedDate] = React.useState<string>(() => getLocalDateString());
  const [games, setGames] = React.useState<MLBGame[]>([]);
  const [errors, setErrors] = React.useState<LoggedError[]>([]);
  const [extractedDates, setExtractedDates] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [harvestProgress, setHarvestProgress] = React.useState<{
    pct: number;
    step: string;
    gameLabel?: string;
    gameIndex?: number;
    totalGames?: number;
    phase?: string;
  }>({ pct: 0, step: "" });
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [pinnedGames, setPinnedGames] = React.useState<string[]>([]);

  React.useEffect(() => {
    localStorage.setItem("mlb_selected_date", selectedDate);
  }, [selectedDate]);

  // Track whether the user has manually selected a date (prevent auto-redirect on harvest)
  const userHasSelectedDate = React.useRef(false);

  // Wrapper for setSelectedDate that prevents auto-redirect from overriding manual selection
  const handleSetSelectedDate = React.useCallback((date: string) => {
    userHasSelectedDate.current = true;
    setSelectedDate(date);
  }, []);

  // Fetch games and diagnostics logs on mount & date change
  const fetchLocalDB = React.useCallback(async (dateToFetch: string) => {
    try {
      const res = await fetch(`/api/games?date=${dateToFetch}&_=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setGames(data.games || []);
      }
    } catch (err) {
      console.error("Fallo al conectar con el servidor local para juegos:", err);
    }
  }, []);

  const fetchErrorsDB = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/errors?_=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setErrors(data.errors || []);
      }
    } catch (err) {
      console.error("Fallo al conectar con el servidor local para errores:", err);
    }
  }, []);

  // References for scrolling
  const sheetsRef = React.useRef<HTMLDivElement>(null);

  const fetchExtractedDates = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/extracted-dates?_=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const dates = data.dates || [];
        setExtractedDates(dates);

        // La fecha seleccionada se conserva; no redirigimos automaticamente a la ultima extraccion.
      }
    } catch (err) {
      console.error("Fallo al conectar con el servidor local para fechas extraídas:", err);
    }
  }, []);

  React.useEffect(() => {
    fetchLocalDB(selectedDate);
    fetchErrorsDB();
    // Only auto-redirect on first load
    fetchExtractedDates();
  }, [selectedDate, fetchLocalDB, fetchErrorsDB, fetchExtractedDates]);

  // Hook de consulta periódica (polling) automático para juegos activos en progreso
  React.useEffect(() => {
    const hasLiveGames = games.some(game => {
      const status = game.game_result?.gameStatus || "";
      return status.includes("In Progress") || status.includes("Live") || status.includes("Delayed") || status.includes("Suspended");
    });

    if (!hasLiveGames) return;

    // Ejecuta consulta cada 60 segundos si hay juegos en vivo en pantalla
    const interval = setInterval(() => {
      console.log("[Auto-Polling] Refrescando partidos en vivo de la fecha seleccionada...");
      fetchLocalDB(selectedDate);
      fetchErrorsDB();
    }, 60000);

    return () => clearInterval(interval);
  }, [games, selectedDate, fetchLocalDB, fetchErrorsDB]);

  // Handle Extraction Trigger — reads real SSE progress from server
  const handleHarvest = async (date: string) => {
    // Mark that user has explicitly selected this date — prevent auto-redirect
    userHasSelectedDate.current = true;
    setIsLoading(true);
    setHarvestProgress({ pct: 2, step: "Iniciando conexión con MLB Stats API..." });

    try {
      const res = await fetch("/api/harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      if (!res.ok || !res.body) {
        throw new Error(await res.text());
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline (SSE event separator)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.phase === "done") {
              setGames(event.games || []);
              setHarvestProgress({ pct: 100, step: event.step, phase: "done" });
            } else if (event.phase === "error") {
              alert("Error en la recolección: " + event.step);
            } else {
              setHarvestProgress({
                pct: event.pct ?? 0,
                step: event.step ?? "",
                gameLabel: event.gameLabel,
                gameIndex: event.gameIndex,
                totalGames: event.totalGames,
                phase: event.phase,
              });
            }
          } catch (e) {
            console.error("Error parsing SSE event:", e);
          }
        }
      }

      // Refrescar la BD local para asegurar que se muestran los juegos recién extraídos
      await fetchLocalDB(date);
      await fetchErrorsDB();
      await fetchExtractedDates();
    } catch (err) {
      alert("Error en la recolección: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
      setHarvestProgress({ pct: 0, step: "" });
    }
  };

  const handleClearErrors = async () => {
    try {
      const res = await fetch("/api/errors/clear", { method: "POST" });
      if (res.ok) {
        setErrors([]);
      }
    } catch (err) {
      console.error("Fallo al vaciar bitácora:", err);
    }
  };

  const handleRefreshGame = async (gameId: string, date: string) => {
    try {
      const res = await fetch("/api/harvest-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, date }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.game) {
          setGames(prevGames => prevGames.map(g => String(g.id) === String(gameId) ? data.game : g));
          fetchErrorsDB();
        } else {
          alert("Error al actualizar juego: " + (data.error || "Desconocido"));
        }
      } else {
        const errText = await res.text();
        alert("Error al actualizar juego: " + errText);
      }
    } catch (err) {
      console.error("Error actualizando juego:", err);
      alert("Error de red al actualizar juego");
    }
  };

  const scrollToSheets = () => {
    sheetsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const togglePin = (gameId: string) => {
    setPinnedGames(prev => {
      if (prev.includes(gameId)) {
        return prev.filter(id => id !== gameId);
      } else {
        return [...prev, gameId];
      }
    });
  };

  const sortedGames = [...games].sort((a, b) => {
    const indexA = pinnedGames.indexOf(String(a.id));
    const indexB = pinnedGames.indexOf(String(b.id));

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans select-none">
      
      {/* Platform Header */}
      <Header
        gamesCount={games.length}
        errorsCount={errors.length}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onScrollToSheets={scrollToSheets}
      />

      <main className="flex-1 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 w-full">
        
        {/* Row 1: Harvester Controls Dashboard */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 border-b border-slate-800 p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-amber-400" size={18} />
              <h2 className="font-display font-medium text-sm uppercase tracking-wider">
                Panel de Control de Harvester de Datos MLB
              </h2>
            </div>
            <span className="font-mono text-xs text-slate-400">
              API Status: <strong className="text-emerald-400">Conectado</strong>
            </span>
          </div>

          <div className="p-6">
            <HarvesterPanel
              onHarvest={handleHarvest}
              isLoading={isLoading}
              selectedDate={selectedDate}
              setSelectedDate={handleSetSelectedDate}
              harvestProgress={harvestProgress}
              extractedDates={extractedDates}
            />
          </div>

          <div ref={sheetsRef} className="px-6 pb-6">
            <GoogleSheetsSync games={games} selectedDate={selectedDate} compact />
          </div>
        </section>

        {/* Row 2: Active Harvested MLB Games Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="font-display font-bold text-2xl tracking-tight text-slate-800 flex items-center gap-2.5">
                <Award className="text-baseball-blue" />
                <span>Datos de Enfrentamientos Diarios</span>
              </h2>
              <p className="text-slate-500 text-xs mt-0.5">
                Juegos registrados para la fecha: <strong className="text-slate-800">{selectedDate}</strong>
              </p>
            </div>

            <div className="flex items-center gap-3">
              {games.length > 0 && (
                <div className="relative hidden sm:block">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <Search size={14} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar equipo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs font-sans border border-slate-200 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-48 transition-colors"
                  />
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono font-medium text-slate-600 shadow-sm">
                Extracción: <strong className="text-slate-800 uppercase">{games.length > 0 ? "Completado" : "Pendiente"}</strong>
              </div>
            </div>
          </div>

          {games.length === 0 ? (
            /* No games yet container */
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center space-y-4 shadow-sm animate-fade-in">
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
                <Database size={28} />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="font-display font-semibold text-slate-800 text-base">
                  No hay registros locales para esta fecha
                </h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Haz click en **"Ejecutar Extracción ETL"** arriba. El software buscará los partidos oficiales del día en la API de MLB y los validará y estructurará para alimentar tu modelo predictivo.
                </p>
              </div>
            </div>
          ) : (
            /* Match grid lists */
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {sortedGames.filter(g => {
                if (!searchQuery) return true;
                const searchLower = searchQuery.toLowerCase();
                return (
                  g.metadata.homeTeam.toLowerCase().includes(searchLower) ||
                  g.metadata.awayTeam.toLowerCase().includes(searchLower)
                );
              }).map((game) => (
                <GameCard 
                  key={game.id} 
                  game={game} 
                  onRefresh={() => handleRefreshGame(game.id, game.metadata.date)} 
                  isPinned={pinnedGames.includes(String(game.id))}
                  onTogglePin={() => togglePin(String(game.id))}
                />
              ))}

              {sortedGames.filter(g => {
                if (!searchQuery) return true;
                const searchLower = searchQuery.toLowerCase();
                return (
                  g.metadata.homeTeam.toLowerCase().includes(searchLower) ||
                  g.metadata.awayTeam.toLowerCase().includes(searchLower)
                );
              }).length === 0 && (
                <div className="text-center py-8 text-slate-500 text-sm italic border border-dashed border-slate-300 rounded-lg bg-slate-50">
                  No se encontraron partidos que coincidan con "{searchQuery}".
                </div>
              )}
            </div>
          )}
        </section>

        {/* Row 3: Machine learning ML Guidelines Card (Requisito 8) */}
        <section className="bg-slate-900 text-white rounded-xl p-6 font-sans border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <FileCode className="text-baseball-blue" size={20} />
            <h3 className="font-display font-bold text-lg tracking-tight">
              Arquitectura de Datos y Dataset de Machine Learning (ML)
            </h3>
          </div>
 
          <p className="text-slate-400 text-xs leading-relaxed">
            Cada registro de juego está enriquecido con un conjunto de variables de alta fidelidad, diseñado para alimentar directamente pipelines de modelado predictivo en Python (Pandas, Scikit-Learn, XGBoost, PyTorch, TensorFlow) para detectar valor esperado positivo (EV+):
          </p>
 
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-slate-300">
            <div className="bg-slate-950 p-3.5 rounded border border-slate-850">
              <strong className="text-blue-400 block mb-1">Sabermetría Avanzada</strong>
              FIP, xFIP, xERA, SIERA, Hard Hit %, barrel % y groundball % para abridores y wOBA, xwOBA, wRC+, ISO, y BABIP para la ofensiva completa de cada equipo.
            </div>
 
            <div className="bg-slate-950 p-3.5 rounded border border-slate-850">
              <strong className="text-blue-400 block mb-1">Clima, Splits y Carga Física</strong>
              Pronósticos de Open-Meteo (temperatura, viento, humedad), splits de bateo vs RHP/LHP por equipo, días de descanso y lanzamientos del abridor, y volumen de IP reciente en el bullpen.
            </div>
 
            <div className="bg-slate-950 p-3.5 rounded border border-slate-850">
              <strong className="text-blue-400 block mb-1">Líneas de Apuesta y Outcomes</strong>
              Historial de movimientos de líneas (Moneyline, Run Line, Totales), diferencias calculadas de rendimiento (Home - Away) e indicadores finales de resultado del juego para entrenamiento supervisado.
            </div>
          </div>
        </section>

      </main>

      {/* Diagnostics Side Drawer panel */}
      <DiagnosticsPanel
        errors={errors}
        onClear={handleClearErrors}
        onRefresh={fetchErrorsDB}
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />

    </div>
  );
}
