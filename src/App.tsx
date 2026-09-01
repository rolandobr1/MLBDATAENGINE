/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Header } from "./components/Header";
import { HarvesterPanel } from "./components/HarvesterPanel";
import { GameCard } from "./components/GameCard";
import { GameCardCompact } from "./components/GameCardCompact";
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
  EyeOff,
  ChevronUp,
  ChevronDown,
  Clock,
  ListChecks,
  Landmark,
  Compass,
  Pin,
  X,
  LayoutGrid,
  Rows3
} from "lucide-react";

const mlbDivisions: Record<string, { league: string, division: string }> = {
  "Baltimore Orioles": { league: "AL", division: "East" },
  "Boston Red Sox": { league: "AL", division: "East" },
  "New York Yankees": { league: "AL", division: "East" },
  "Tampa Bay Rays": { league: "AL", division: "East" },
  "Toronto Blue Jays": { league: "AL", division: "East" },
  "Chicago White Sox": { league: "AL", division: "Central" },
  "Cleveland Guardians": { league: "AL", division: "Central" },
  "Detroit Tigers": { league: "AL", division: "Central" },
  "Kansas City Royals": { league: "AL", division: "Central" },
  "Minnesota Twins": { league: "AL", division: "Central" },
  "Houston Astros": { league: "AL", division: "West" },
  "Los Angeles Angels": { league: "AL", division: "West" },
  "Oakland Athletics": { league: "AL", division: "West" },
  "Seattle Mariners": { league: "AL", division: "West" },
  "Texas Rangers": { league: "AL", division: "West" },
  "Atlanta Braves": { league: "NL", division: "East" },
  "Miami Marlins": { league: "NL", division: "East" },
  "New York Mets": { league: "NL", division: "East" },
  "Philadelphia Phillies": { league: "NL", division: "East" },
  "Washington Nationals": { league: "NL", division: "East" },
  "Chicago Cubs": { league: "NL", division: "Central" },
  "Cincinnati Reds": { league: "NL", division: "Central" },
  "Milwaukee Brewers": { league: "NL", division: "Central" },
  "Pittsburgh Pirates": { league: "NL", division: "Central" },
  "St. Louis Cardinals": { league: "NL", division: "Central" },
  "Arizona Diamondbacks": { league: "NL", division: "West" },
  "Colorado Rockies": { league: "NL", division: "West" },
  "Los Angeles Dodgers": { league: "NL", division: "West" },
  "San Diego Padres": { league: "NL", division: "West" },
  "San Francisco Giants": { league: "NL", division: "West" }
};

function getLocalDateString(): string {
  const localDate = new Date();
  const tzOffset = localDate.getTimezoneOffset() * 60000;
  return new Date(localDate.getTime() - tzOffset).toISOString().split("T")[0];
}

/**
 * Fase 7 (Tanda D, mejora de rendimiento): en vez de reemplazar el array de
 * juegos completo con objetos nuevos en cada refresh, conserva la referencia
 * anterior de cada juego cuyo contenido no cambió. Así `React.memo` en
 * `GameCard` puede saltarse el re-render/recálculo de tarjetas sin cambios
 * reales (por ejemplo, el polling automático cada 60s de juegos en vivo).
 */
function mergeGamesById(prevGames: MLBGame[], newGames: MLBGame[]): MLBGame[] {
  const prevById = new Map(prevGames.map(g => [String(g.id), g]));
  return newGames.map(newGame => {
    const prevGame = prevById.get(String(newGame.id));
    if (prevGame && JSON.stringify(prevGame) === JSON.stringify(newGame)) {
      return prevGame;
    }
    return newGame;
  });
}

/**
 * Fase 7 (Tanda C): la grilla de juegos usa `columns` de CSS (estilo
 * Pinterest), que llena toda la columna izquierda antes de pasar a la
 * derecha. Si los juegos están ordenados cronológicamente y se pintan en ese
 * mismo orden, el orden visual "por fila" en 2 columnas no coincide con el
 * orden cronológico real. Esta función reordena el array antes de pintarlo
 * (repartiendo pares/impares como quien reparte cartas) para que, cuando el
 * navegador llene primero la columna izquierda y luego la derecha, el
 * resultado leído fila por fila sí sea cronológico. Solo debe aplicarse
 * cuando la grilla realmente está en 2 columnas (breakpoint `xl`).
 */
function interleaveForTwoColumnMasonry<T>(items: T[]): T[] {
  const left: T[] = [];
  const right: T[] = [];
  items.forEach((item, idx) => {
    (idx % 2 === 0 ? left : right).push(item);
  });
  return [...left, ...right];
}

/** Fase 7 (Tanda C): true cuando el viewport está en el breakpoint `xl` de Tailwind (1280px) o más ancho. */
function useIsXlScreen(): boolean {
  const [isXl, setIsXl] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const handler = (e: MediaQueryListEvent) => setIsXl(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isXl;
}

export default function App() {
  const isXlScreen = useIsXlScreen();
  const [selectedDate, setSelectedDate] = React.useState<string>("");
  const [games, setGames] = React.useState<MLBGame[]>([]);
  const [totalDatabaseGames, setTotalDatabaseGames] = React.useState<number>(0);
  const [errors, setErrors] = React.useState<LoggedError[]>([]);
  const [extractedDates, setExtractedDates] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [isFetchingDB, setIsFetchingDB] = React.useState<boolean>(true);
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
  const [pinnedGames, setPinnedGames] = React.useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mlb_pinned_games');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [filterTime, setFilterTime] = React.useState<string>("All");
  const [filterStatus, setFilterStatus] = React.useState<string>("All");
  const [filterLeague, setFilterLeague] = React.useState<string>("All");
  const [filterDivision, setFilterDivision] = React.useState<string>("All");

  React.useEffect(() => {
    localStorage.setItem('mlb_pinned_games', JSON.stringify(pinnedGames));
  }, [pinnedGames]);

  const [showBetTracking, setShowBetTracking] = React.useState<boolean>(false);
  const [globalExpandToggle, setGlobalExpandToggle] = React.useState<number>(0);
  const [globalExpandTarget, setGlobalExpandTarget] = React.useState<boolean>(false);
  const [isHarvesterExpanded, setIsHarvesterExpanded] = React.useState<boolean>(true);

  const handleToggleExpandAll = () => {
    const newTarget = !globalExpandTarget;
    setGlobalExpandTarget(newTarget);
    setGlobalExpandToggle(prev => prev + 1);
  };

  // Menú de navegación de juegos: "Vista Completa" (tarjetas de siempre, con
  // todo el detalle) vs "Vista Compacta" (mini-marcadores — logo, abreviación
  // y carrera/hora — para ver todos los juegos del día de un vistazo). Al
  // hacer click en un mini-marcador, `focusRequest` le indica a la tarjeta
  // completa de ese juego (en `GameCard`) que se expanda, y el efecto de más
  // abajo hace scroll hasta ella.
  const [viewMode, setViewMode] = React.useState<"full" | "compact">("full");
  const [focusRequest, setFocusRequest] = React.useState<{ gameId: string; token: number } | null>(null);

  const handleSelectGameFromCompactView = (gameId: string) => {
    setViewMode("full");
    setFocusRequest({ gameId, token: Date.now() });
  };

  React.useEffect(() => {
    if (!focusRequest || viewMode !== "full") return;
    const t = setTimeout(() => {
      document.getElementById(`game-card-${focusRequest.gameId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [focusRequest, viewMode]);

  React.useEffect(() => {
    if (!selectedDate) return;
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
  const fetchLocalDB = React.useCallback(async (dateToFetch: string, options?: { silent?: boolean }) => {
    if (!dateToFetch) return;
    if (!options?.silent) {
      setIsFetchingDB(true);
    }
    try {
      const res = await fetch(`/api/games?date=${dateToFetch}&_=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setGames(prev => mergeGamesById(prev, data.games || []));
        if (data.totalGames !== undefined) {
          setTotalDatabaseGames(data.totalGames);
        }
      }
    } catch (err) {
      console.error("Fallo al conectar con el servidor local para juegos:", err);
    } finally {
      if (!options?.silent) {
        setIsFetchingDB(false);
      }
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
  const harvesterSectionRef = React.useRef<HTMLDivElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Expande el panel de Harvester y hace scroll hacia él (usado por el CTA del estado vacío)
  const scrollToHarvester = () => {
    setIsHarvesterExpanded(true);
    harvesterSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fetchExtractedDates = React.useCallback(async (remote = false) => {
    try {
      const res = await fetch(`/api/extracted-dates?remote=${remote}&_=${Date.now()}`);
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
    let cancelled = false;

    const loadInitialDate = async () => {
      const today = getLocalDateString();
      setSelectedDate(today);
      // Fetch local extracted dates instantly
      const dates = await fetchExtractedDates(false);
      if (cancelled) return;
    };

    loadInitialDate();
    fetchErrorsDB();

    return () => {
      cancelled = true;
    };
  }, [fetchErrorsDB, fetchExtractedDates]);

  React.useEffect(() => {
    if (!selectedDate) return;
    fetchLocalDB(selectedDate);
    fetchErrorsDB();
  }, [selectedDate, fetchLocalDB, fetchErrorsDB]);

  // Calculate total props extracted
  const propsCount = React.useMemo(() => {
    let ks = 0;
    let tb = 0;
    let oddsApi = 0;
    let dataStreak = 0;
    let rotowire = 0;
    let unknown = 0;

    const countSource = (source?: string | null, book?: string | null) => {
      const normalizedSource = String(source || "").toLowerCase();
      const normalizedBook = String(book || "").toLowerCase();

      if (normalizedSource.includes("odds_api") || normalizedSource.includes("odds api") || normalizedSource.includes("theoddsapi")) {
        oddsApi++;
        return;
      }
      if (normalizedSource.includes("datastreak") || normalizedSource.includes("data streak")) {
        dataStreak++;
        return;
      }
      if (normalizedSource.includes("rotowire")) {
        rotowire++;
        return;
      }
      if (normalizedBook.includes("oddsapi") || normalizedBook.includes("odds api")) {
        oddsApi++;
        return;
      }
      if (normalizedBook) {
        dataStreak++;
        return;
      }
      unknown++;
    };

    games.forEach(game => {
      if (game.pitchers?.home?.strikeoutProp != null) {
        ks++;
        countSource(game.pitchers.home.strikeoutPropSource);
      }
      if (game.pitchers?.away?.strikeoutProp != null) {
        ks++;
        countSource(game.pitchers.away.strikeoutPropSource);
      }
      if (game.lineups?.home) {
        game.lineups.home.forEach(batter => {
          if (batter.totalBasesProp != null) {
            tb++;
            countSource(batter.totalBasesPropSource, batter.totalBasesPropBook);
          }
        });
      }
      if (game.lineups?.away) {
        game.lineups.away.forEach(batter => {
          if (batter.totalBasesProp != null) {
            tb++;
            countSource(batter.totalBasesPropSource, batter.totalBasesPropBook);
          }
        });
      }
    });
    return { total: ks + tb, ks, tb, oddsApi, dataStreak, rotowire, unknown };
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
      if (document.visibilityState !== "visible") return;
      console.log("[Auto-Polling] Refrescando partidos en vivo de la fecha seleccionada...");
      fetchLocalDB(selectedDate, { silent: true });
      fetchErrorsDB();
    }, 60000);

    return () => clearInterval(interval);
  }, [games, selectedDate, fetchLocalDB, fetchErrorsDB]);

  // Handle Extraction Trigger — reads real SSE progress from server
  const handleHarvest = React.useCallback(async (date: string, refreshOdds: boolean = true) => {
    // Mark that user has explicitly selected this date — prevent auto-redirect
    userHasSelectedDate.current = true;
    setIsLoading(true);
    setHarvestProgress({ pct: 2, step: "Iniciando conexión con MLB Stats API..." });
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch("/api/harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, refreshOdds }),
        signal: abortControllerRef.current.signal,
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
              setGames(prev => mergeGamesById(prev, event.games || []));
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
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Harvest abortado por el usuario.');
      } else {
        alert("Error en la recolección: " + (err.message || String(err)));
      }
    } finally {
      setIsLoading(false);
      setHarvestProgress({ pct: 0, step: "" });
    }
  }, [fetchErrorsDB, fetchExtractedDates, fetchLocalDB]);

  // Al abrir la aplicación, cosechar automáticamente el día MLB actual una sola vez
  // cuando nunca haya sido procesado. dateExtracted también cubre días sin juegos.
  const autoHarvestAttemptedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoHarvestAttemptedRef.current) return;
    autoHarvestAttemptedRef.current = true;
    let cancelled = false;

    const autoHarvestToday = async () => {
      const today = getLocalDateString();
      try {
        const res = await fetch(`/api/games?date=${today}&_=${Date.now()}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || data.dateExtracted === true || (data.games || []).length > 0) return;

        console.log(`[Auto-Harvest] No hay extracción para ${today}; iniciando ETL automáticamente.`);
        setSelectedDate(today);
        await handleHarvest(today, true);
      } catch (err) {
        console.error("[Auto-Harvest] No se pudo verificar/iniciar la extracción automática:", err);
      }
    };

    autoHarvestToday();
    return () => {
      cancelled = true;
      // React StrictMode desmonta y monta el efecto una vez en desarrollo.
      autoHarvestAttemptedRef.current = false;
    };
  }, [handleHarvest]);

  const handleCancelHarvest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleBatchHarvest = async (startDate: string, endDate: string, refreshOdds: boolean = true) => {
    userHasSelectedDate.current = true;
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      // 1. Calculate dates
      const datesToProcess: string[] = [];
      const start = new Date(startDate + "T12:00:00Z");
      const end = new Date(endDate + "T12:00:00Z");
      
      // Ensure start is before or equal to end
      const actualStart = start <= end ? start : end;
      const actualEnd = start <= end ? end : start;

      let current = new Date(actualStart);
      while (current <= actualEnd) {
        datesToProcess.push(current.toISOString().split("T")[0]);
        current.setUTCDate(current.getUTCDate() + 1);
      }

      // 2. Identify missing dates
      const currentExtracted = await fetchExtractedDates(false);
      const missingDates = datesToProcess.filter(d => !currentExtracted.includes(d));

      // 3. Extract missing dates sequentially
      for (let i = 0; i < missingDates.length; i++) {
        const date = missingDates[i];
        
        if (abortControllerRef.current.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        setHarvestProgress({ 
          pct: Math.round((i / missingDates.length) * 100), 
          step: `Extrayendo ${date} (${i + 1}/${missingDates.length})...` 
        });

        const res = await fetch("/api/harvest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, refreshOdds }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Error en fecha ${date}: ` + await res.text());
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.phase === "error") throw new Error(event.step || `Error extrayendo ${date}`);

              const dateProgress = Math.max(0, Math.min(100, Number(event.pct) || 0));
              const overallProgress = missingDates.length > 0
                ? Math.round(((i + dateProgress / 100) / missingDates.length) * 100)
                : 100;
              setHarvestProgress({
                pct: overallProgress,
                step: `[${i + 1}/${missingDates.length}] ${date}: ${event.step || "Procesando…"}`,
                gameLabel: event.gameLabel,
                gameIndex: event.gameIndex,
                totalGames: event.totalGames,
                phase: event.phase === "done" && i < missingDates.length - 1 ? "save" : event.phase,
              });
            } catch (eventError) {
              if (eventError instanceof SyntaxError) {
                console.error("Error parsing batch SSE event:", eventError);
              } else {
                throw eventError;
              }
            }
          }
        }
      }

      setHarvestProgress({ pct: 100, step: "Generando CSV unificado...", phase: "done" });
      
      // 4. Download unified CSV
      const datesQuery = datesToProcess.join(",");
      window.location.href = `/api/batters-dataset/csv?dates=${datesQuery}`;
      
      // Update local state
      await fetchLocalDB(startDate);
      await fetchErrorsDB();
      await fetchExtractedDates();

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Batch Harvest abortado por el usuario.');
      } else {
        alert("Error en la recolección por lote: " + (err.message || String(err)));
      }
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

  // Fase 7 (Tanda D): useCallback para que la referencia de esta función sea
  // estable entre renders de App — así el `onRefresh` que reciben las
  // GameCard memoizadas no cambia solo porque el padre se re-renderizó.
  const handleRefreshGame = React.useCallback(async (gameId: string, date: string) => {
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
          return data.game;
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
  }, [fetchErrorsDB]);

  const scrollToSheets = () => {
    sheetsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fase 7 (Tanda D): misma razón — referencia estable para el `onTogglePin`
  // que reciben las GameCard memoizadas.
  const togglePin = React.useCallback((gameId: string) => {
    setPinnedGames(prev => {
      if (prev.includes(gameId)) {
        return prev.filter(id => id !== gameId);
      } else {
        return [...prev, gameId];
      }
    });
  }, []);

  const sortedGames = [...games].sort((a, b) => {
    const indexA = pinnedGames.indexOf(String(a.id));
    const indexB = pinnedGames.indexOf(String(b.id));

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    // Parse time like "1:05 p.m." into total minutes for chronological sorting
    const parseTime = (t: string) => {
      if (!t) return Number.MAX_SAFE_INTEGER; // Put games with no time at the end
      const isPm = t.toLowerCase().includes("p");
      const match = t.match(/(\d+):(\d+)/);
      if (!match) return Number.MAX_SAFE_INTEGER;
      let hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      if (isPm && hours !== 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      return hours * 60 + mins;
    };

    return parseTime(a.metadata?.time) - parseTime(b.metadata?.time);
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      
      {/* Platform Header */}
      <Header
        gamesCount={games.length}
        totalGamesCount={totalDatabaseGames}
        isDatabaseLoading={isFetchingDB}
        errorsCount={errors.length}
        propsCount={propsCount}
        missingPitchers={missingPitchers}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
      />

      <main className="flex-1 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 w-full">
        
        {/* Row 1: Harvester Controls Dashboard */}
        <section ref={harvesterSectionRef} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsHarvesterExpanded(!isHarvesterExpanded)}
            aria-expanded={isHarvesterExpanded}
            className="w-full text-left bg-slate-900 border-b border-slate-800 p-4 text-white flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="text-amber-400" size={18} />
              <h2 className="font-display font-medium text-sm uppercase tracking-wider select-none">
                Panel de Control de Harvester de Datos MLB
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs text-slate-400 hidden sm:inline-block">
                Estado API: <strong className="text-emerald-400">Conectado</strong>
              </span>
              <div className="bg-slate-700/50 p-1 rounded hover:bg-slate-700 transition">
                {isHarvesterExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
          </button>

          {isHarvesterExpanded && (
            <>
              <div className="p-6">
                <HarvesterPanel
                  onHarvest={handleHarvest}
                  onBatchHarvest={handleBatchHarvest}
                  isLoading={isLoading}
                  selectedDate={selectedDate}
                  setSelectedDate={handleSetSelectedDate}
                  harvestProgress={harvestProgress}
                  extractedDates={extractedDates}
                  onCancel={handleCancelHarvest}
                  syncRemoteDates={() => fetchExtractedDates(true)}
                  games={games}
                >
                  {/* A pedido: las descargas de props/derivados/histórico van
                      justo debajo de las principales, en la misma columna
                      derecha, en vez de en un panel aparte más abajo. */}
                  <div ref={sheetsRef}>
                    <GoogleSheetsSync games={games} selectedDate={selectedDate} compact />
                  </div>
                </HarvesterPanel>
              </div>

            </>
          )}
        </section>

        {/* Bet Tracking Panel */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowBetTracking(!showBetTracking)}
            aria-expanded={showBetTracking}
            className="w-full text-left bg-gradient-to-r from-violet-700 to-indigo-700 border-b border-violet-800 p-4 text-white flex items-center justify-between cursor-pointer hover:from-violet-800 hover:to-indigo-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-violet-200" />
              <h2 className="font-display font-medium text-sm uppercase tracking-wider select-none">
                Bet Tracking
              </h2>
            </div>
            <div className="bg-violet-800/50 p-1 rounded hover:bg-violet-800 transition">
              {showBetTracking ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>
          {showBetTracking && (
            <div className="p-6">
              <BetTracking
                games={games}
                onRefreshGame={handleRefreshGame}
              />
            </div>
          )}
        </section>

        {/* Row 2: Active Harvested MLB Games Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="font-display font-bold text-2xl tracking-tight text-slate-800 flex items-center gap-2.5">
                <Award className="text-baseball-blue" />
                <span>Datos de Enfrentamientos Diarios</span>
                {games.length > 0 && (
                  <>
                    {/* Menú de navegación: Vista Completa (detalle de siempre) vs Vista
                        Compacta (mini-marcadores para ver todos los juegos de un vistazo) */}
                    <div className="ml-4 flex items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm" role="tablist" aria-label="Modo de vista de los juegos">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === "full"}
                        onClick={() => setViewMode("full")}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${viewMode === "full" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
                        title="Vista completa: una tarjeta detallada por juego"
                      >
                        <Rows3 size={13} />
                        Vista Completa
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === "compact"}
                        onClick={() => setViewMode("compact")}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${viewMode === "compact" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
                        title="Vista compacta: logo, abreviación y resultado de todos los juegos, para navegar rápido"
                      >
                        <LayoutGrid size={13} />
                        Vista Compacta
                      </button>
                    </div>
                    {viewMode === "full" && (
                      <button
                        onClick={handleToggleExpandAll}
                        className="ml-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-colors"
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
                  </>
                )}
              </h2>
              <p className="text-slate-500 text-xs mt-0.5">
                Juegos registrados para la fecha: <strong className="text-slate-800">{selectedDate || "detectando fecha reciente..."}</strong>
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 w-full mt-3 sm:mt-0">
              {games.length > 0 && (
                <div className="flex flex-col gap-2 w-full">

                  {/* Search — siempre en su propia fila, ancho completo */}
                  <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                      <Search size={13} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar equipo o jugador..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs font-sans border border-slate-200 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-full transition-colors"
                    />
                  </div>

                  {/* Selects: SIEMPRE cuadrícula 2x2, en cualquier ancho de pantalla — nada de
                      flex-wrap ni de "4 en una fila". Ya se intentaron ambas variantes:
                      flex-wrap desalineaba las columnas entre filas, y 4 columnas en una fila
                      no daba espacio suficiente y cortaba el texto ("Hora (Tod▾"). 2x2 fijo es
                      lo único que garantiza texto completo y columnas alineadas siempre. */}
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <div className="relative w-full">
                      <Clock size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <select value={filterTime} onChange={e => setFilterTime(e.target.value)} className="pl-7 pr-2 py-1.5 text-xs font-sans border border-slate-200 rounded shadow-sm text-slate-700 outline-none bg-white w-full">
                        <option value="All">Hora (Todas)</option>
                        <option value="Afternoon">Tarde (antes 6 PM)</option>
                        <option value="Night">Noche (desde 6 PM)</option>
                      </select>
                    </div>
                    <div className="relative w-full">
                      <ListChecks size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="pl-7 pr-2 py-1.5 text-xs font-sans border border-slate-200 rounded shadow-sm text-slate-700 outline-none bg-white w-full">
                        <option value="All">Estatus (Todos)</option>
                        <option value="Scheduled">Programado</option>
                        <option value="In Progress">En Vivo</option>
                        <option value="Final">Finalizado</option>
                      </select>
                    </div>
                    <div className="relative w-full">
                      <Landmark size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <select value={filterLeague} onChange={e => setFilterLeague(e.target.value)} className="pl-7 pr-2 py-1.5 text-xs font-sans border border-slate-200 rounded shadow-sm text-slate-700 outline-none bg-white w-full">
                        <option value="All">Liga (Ambas)</option>
                        <option value="AL">Americana (AL)</option>
                        <option value="NL">Nacional (NL)</option>
                      </select>
                    </div>
                    <div className="relative w-full">
                      <Compass size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <select value={filterDivision} onChange={e => setFilterDivision(e.target.value)} className="pl-7 pr-2 py-1.5 text-xs font-sans border border-slate-200 rounded shadow-sm text-slate-700 outline-none bg-white w-full">
                        <option value="All">División (Todas)</option>
                        <option value="East">Este</option>
                        <option value="Central">Central</option>
                        <option value="West">Oeste</option>
                      </select>
                    </div>
                  </div>

                  {(searchQuery !== "" || filterTime !== "All" || filterStatus !== "All" || filterLeague !== "All" || filterDivision !== "All") && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setFilterTime("All");
                        setFilterStatus("All");
                        setFilterLeague("All");
                        setFilterDivision("All");
                      }}
                      className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded shrink-0 transition-colors"
                      title="Limpiar filtros"
                    >
                      <X size={13} /> Limpiar filtros
                    </button>
                  )}

                </div>
              )}
            </div>
          </div>

          {isFetchingDB ? (
            <div className="bg-white border border-blue-100 rounded-xl p-16 text-center space-y-4 shadow-sm animate-fade-in">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                <Database size={24} className="absolute inset-0 m-auto text-blue-600" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="font-display font-semibold text-slate-800 text-base">
                  Cargando base de datos
                </h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Estamos detectando la fecha más reciente y cargando únicamente los juegos necesarios para abrir la vista.
                </p>
              </div>
            </div>
          ) : games.length === 0 ? (
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
                  Haz click en <strong>"Ejecutar Extracción ETL"</strong>. El software buscará los partidos oficiales del día en la API de MLB y los validará y estructurará para alimentar tu modelo predictivo.
                </p>
                <button
                  onClick={scrollToHarvester}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  <Sparkles size={13} />
                  Ir al Panel de Harvester
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Match grid lists with Masonry effect */}
              {(() => {
              const filteredGames = sortedGames.filter(g => {
                // Filtro de Búsqueda
                if (searchQuery) {
                  const searchLower = searchQuery.toLowerCase();
                  const matchesTeam =
                    g.metadata.homeTeam.toLowerCase().includes(searchLower) ||
                    g.metadata.awayTeam.toLowerCase().includes(searchLower);

                  const matchesPitcher =
                    g.pitchers?.home?.name?.toLowerCase().includes(searchLower) ||
                    g.pitchers?.away?.name?.toLowerCase().includes(searchLower);

                  const matchesLineup = [
                    ...(g.lineups?.home || []),
                    ...(g.lineups?.away || [])
                  ].some((p: any) => p?.name?.toLowerCase().includes(searchLower));

                  if (!matchesTeam && !matchesPitcher && !matchesLineup) {
                    return false;
                  }
                }

                // Filtro de Estatus
                if (filterStatus !== "All") {
                  const s = g.game_result?.gameStatus || "Scheduled";
                  if (filterStatus === "Final" && !s.includes("Final") && !s.includes("Game Over")) return false;
                  if (filterStatus === "In Progress" && !s.includes("In Progress") && !s.includes("Live")) return false;
                  if (filterStatus === "Scheduled" && s !== "Scheduled" && s !== "Pre-Game" && s !== "Warmup") return false;
                }

                // Filtro de Liga
                if (filterLeague !== "All") {
                  const homeLeague = mlbDivisions[g.metadata.homeTeam]?.league;
                  const awayLeague = mlbDivisions[g.metadata.awayTeam]?.league;
                  if (homeLeague !== filterLeague && awayLeague !== filterLeague) return false;
                }

                // Filtro de División
                if (filterDivision !== "All") {
                  const homeDiv = mlbDivisions[g.metadata.homeTeam]?.division;
                  const awayDiv = mlbDivisions[g.metadata.awayTeam]?.division;
                  if (homeDiv !== filterDivision && awayDiv !== filterDivision) return false;
                }

                // Filtro de Hora
                if (filterTime !== "All") {
                  const timeStr = g.metadata.time || "";
                  const isPm = timeStr.toLowerCase().includes("p");
                  let hoursStr = timeStr.split(":")[0];
                  if (hoursStr) {
                    let hours = parseInt(hoursStr, 10);
                    if (isPm && hours !== 12) hours += 12;
                    if (!isPm && hours === 12) hours = 0;
                    
                    if (filterTime === "Afternoon" && hours >= 18) return false;
                    if (filterTime === "Night" && hours < 18) return false;
                  }
                }

                return true;
              });

                if (filteredGames.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-500 text-sm italic border border-dashed border-slate-300 rounded-lg bg-slate-50">
                      No se encontraron partidos que coincidan con "{searchQuery}".
                    </div>
                  );
                }

                const pinnedInView = filteredGames.filter(g => pinnedGames.includes(String(g.id)));
                const restInView = filteredGames.filter(g => !pinnedGames.includes(String(g.id)));

                // Fase 7 (Tanda C): en 2 columnas (xl+), reordena para que el orden
                // visual por fila coincida con el orden cronológico. En 1 columna
                // (mobile/tablet) el orden natural ya es el correcto.
                const pinnedForDisplay = isXlScreen ? interleaveForTwoColumnMasonry(pinnedInView) : pinnedInView;
                const restForDisplay = isXlScreen ? interleaveForTwoColumnMasonry(restInView) : restInView;

                const renderGameCard = (game: MLBGame) => (
                  <div key={game.id} id={`game-card-${game.id}`} className="break-inside-avoid mb-6 scroll-mt-4">
                    <GameCard
                      game={game}
                      onRefresh={handleRefreshGame}
                      isPinned={pinnedGames.includes(String(game.id))}
                      onTogglePin={togglePin}
                      globalExpandToggle={globalExpandToggle}
                      globalExpandTarget={globalExpandTarget}
                      focusRequest={focusRequest}
                    />
                  </div>
                );

                if (viewMode === "compact") {
                  const renderGameCardCompact = (game: MLBGame) => (
                    <GameCardCompact
                      key={game.id}
                      game={game}
                      isPinned={pinnedGames.includes(String(game.id))}
                      onSelect={handleSelectGameFromCompactView}
                    />
                  );
                  return (
                    <>
                      {pinnedInView.length > 0 && (
                        <div className="space-y-2 mb-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                            <Pin size={12} className="fill-blue-600" /> Fijados
                          </h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {pinnedInView.map(renderGameCardCompact)}
                          </div>
                        </div>
                      )}
                      {restInView.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {restInView.map(renderGameCardCompact)}
                        </div>
                      )}
                    </>
                  );
                }

                return (
                  <>
                    {pinnedInView.length > 0 && (
                      <div className="space-y-3 mb-6">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                          <Pin size={12} className="fill-blue-600" /> Fijados
                        </h3>
                        <div className="columns-1 xl:columns-2 gap-6">
                          {pinnedForDisplay.map(renderGameCard)}
                        </div>
                      </div>
                    )}
                    {restInView.length > 0 && (
                      <div className="columns-1 xl:columns-2 gap-6">
                        {restForDisplay.map(renderGameCard)}
                      </div>
                    )}
                  </>
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
