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
import { BetTracking } from "./components/BetTracking";
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
  Search,
  TrendingUp,
  Eye,
  EyeOff
} from "lucide-react";

function getLocalDateString(): string {
  const localDate = new Date();
  const tzOffset = localDate.getTimezoneOffset() * 60000;
  return new Date(localDate.getTime() - tzOffset).toISOString().split("T")[0];
}

export default function App() {
  const [selectedDate, setSelectedDate] = React.useState<string>(() => getLocalDateString());
  const [games, setGames] = React.useState<MLBGame[]>([]);
  const [totalDatabaseGames, setTotalDatabaseGames] = React.useState<number>(0);
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
  const [showBetTracking, setShowBetTracking] = React.useState<boolean>(false);
  const [globalExpandToggle, setGlobalExpandToggle] = React.useState<number>(0);
  const [globalExpandTarget, setGlobalExpandTarget] = React.useState<boolean>(false);

  const handleToggleExpandAll = () => {
    const newTarget = !globalExpandTarget;
    setGlobalExpandTarget(newTarget);
    setGlobalExpandToggle(prev => prev + 1);
  };

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
        if (data.totalGames !== undefined) {
          setTotalDatabaseGames(data.totalGames);
        }
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
        return dates as string[];
      }
    } catch (err) {
      console.error("Fallo al conectar con el servidor local para fechas extraídas:", err);
    }
    return [] as string[];
  }, []);

  React.useEffect(() => {
    fetchLocalDB(selectedDate);
    fetchErrorsDB();
    fetchExtractedDates();
  }, [selectedDate, fetchLocalDB, fetchErrorsDB, fetchExtractedDates]);

  // Calculate total props extracted
  const propsCount = React.useMemo(() => {
    let ks = 0;
    let tb = 0;
    games.forEach(game => {
      if (game.pitchers?.home?.strikeoutProp != null) ks++;
      if (game.pitchers?.away?.strikeoutProp != null) ks++;
      if (game.lineups?.home) {
        game.lineups.home.forEach(batter => {
          if (batter.totalBasesProp != null) tb++;
        });
      }
      if (game.lineups?.away) {
        game.lineups.away.forEach(batter => {
          if (batter.totalBasesProp != null) tb++;
        });
      }
    });
    return { total: ks + tb, ks, tb };
  }, [games]);

  // Calculate missing pitchers for props tooltip
  const missingPitchers = React.useMemo(() => {
    const missing: { name: string, team: string }[] = [];
    games.forEach(game => {
      if (game.pitchers?.home && game.pitchers.home.strikeoutProp == null) {
        missing.push({ name: game.pitchers.home.name, team: game.metadata.homeTeam });
      }
      if (game.pitchers?.away && game.pitchers.away.strikeoutProp == null) {
        missing.push({ name: game.pitchers.away.name, team: game.metadata.awayTeam });
      }
    });
    return missing;
  }, [games]);

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
  const handleHarvest = async (date: string, refreshOdds: boolean = true) => {
    // Mark that user has explicitly selected this date — prevent auto-redirect
    userHasSelectedDate.current = true;
    setIsLoading(true);
    setHarvestProgress({ pct: 2, step: "Iniciando conexión con MLB Stats API..." });

    try {
      const res = await fetch("/api/harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, refreshOdds }),
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
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      
      {/* Platform Header */}
      <Header
        gamesCount={games.length}
        totalGamesCount={totalDatabaseGames}
        errorsCount={errors.length}
        propsCount={propsCount}
        missingPitchers={missingPitchers}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
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
              Estado API: <strong className="text-emerald-400">Conectado</strong>
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

          {/* Bet Tracking Toggle Button */}
          <div className="px-6 pb-6">
            <button
              onClick={() => setShowBetTracking(prev => !prev)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-lg shadow transition-all duration-200"
            >
              <TrendingUp size={16} />
              {showBetTracking ? "Ocultar Bet Tracking" : "📊 Bet Tracking"}
            </button>
          </div>
        </section>

        {/* Bet Tracking Panel */}
        {showBetTracking && (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-violet-700 to-indigo-700 border-b border-violet-800 p-4 text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-violet-200" />
              <h2 className="font-display font-medium text-sm uppercase tracking-wider">Bet Tracking</h2>
            </div>
            <div className="p-6">
              <BetTracking
                games={games}
                onRefreshGame={(gameId) => handleRefreshGame(gameId, selectedDate)}
              />
            </div>
          </section>
        )}

        {/* Row 2: Active Harvested MLB Games Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="font-display font-bold text-2xl tracking-tight text-slate-800 flex items-center gap-2.5">
                <Award className="text-baseball-blue" />
                <span>Datos de Enfrentamientos Diarios</span>
                {games.length > 0 && (
                  <button
                    onClick={handleToggleExpandAll}
                    className="ml-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-colors"
                  >
                    {globalExpandTarget ? (
                      <>
                        <EyeOff size={14} className="text-slate-500" />
                        Contraer todos
                      </>
                    ) : (
                      <>
                        <Eye size={14} className="text-slate-500" />
                        Mostrar todos
                      </>
                    )}
                  </button>
                )}
              </h2>
              <p className="text-slate-500 text-xs mt-0.5">
                Juegos registrados para la fecha: <strong className="text-slate-800">{selectedDate}</strong>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto mt-3 sm:mt-0">
              {games.length > 0 && (
                <div className="relative w-full sm:w-auto">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <Search size={14} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar equipo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs font-sans border border-slate-200 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-48 transition-colors"
                  />
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono font-medium text-slate-600 shadow-sm shrink-0">
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
            <>
              {/* Match grid lists with Masonry effect */}
              {(() => {
              const filteredGames = sortedGames.filter(g => {
                if (!searchQuery) return true;
                const searchLower = searchQuery.toLowerCase();
                return (
                  g.metadata.homeTeam.toLowerCase().includes(searchLower) ||
                  g.metadata.awayTeam.toLowerCase().includes(searchLower)
                );
              });

              if (filteredGames.length === 0) {
                return (
                  <div className="text-center py-8 text-slate-500 text-sm italic border border-dashed border-slate-300 rounded-lg bg-slate-50">
                    No se encontraron partidos que coincidan con "{searchQuery}".
                  </div>
                );
              }

              const leftCol = filteredGames.filter((_, i) => i % 2 === 0);
              const rightCol = filteredGames.filter((_, i) => i % 2 === 1);

              return (
                <div className="flex flex-col xl:flex-row gap-6 items-start">
                  <div className="flex-1 flex flex-col gap-6 w-full xl:w-1/2">
                    {leftCol.map((game) => (
                      <GameCard 
                        key={game.id} 
                        game={game} 
                        onRefresh={() => handleRefreshGame(game.id, game.metadata.date)} 
                        isPinned={pinnedGames.includes(String(game.id))}
                        onTogglePin={() => togglePin(String(game.id))}
                        globalExpandToggle={globalExpandToggle}
                        globalExpandTarget={globalExpandTarget}
                      />
                    ))}
                  </div>
                  {rightCol.length > 0 && (
                    <div className="flex-1 flex flex-col gap-6 w-full xl:w-1/2">
                      {rightCol.map((game) => (
                        <GameCard 
                          key={game.id} 
                          game={game} 
                          onRefresh={() => handleRefreshGame(game.id, game.metadata.date)} 
                          isPinned={pinnedGames.includes(String(game.id))}
                          onTogglePin={() => togglePin(String(game.id))}
                          globalExpandToggle={globalExpandToggle}
                          globalExpandTarget={globalExpandTarget}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            </>
          )}
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
