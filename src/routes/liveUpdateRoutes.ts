/**
 * liveUpdateRoutes.ts — sept. 2026.
 *
 * Endpoint para el botón "Actualizar juegos en vivo", separado a propósito
 * del botón de extracción completa ("Ejecutar Extracción ETL" → /api/harvest).
 *
 * Contexto (conversación con el usuario, sept. 2026): el usuario quería dos
 * botones independientes — uno que corra la extracción completa de siempre,
 * y otro que solo se habilite cuando los juegos del día ya arrancaron y que
 * únicamente traiga lo que cambia en vivo (marcador, boxscore, jugada por
 * jugada), sin rehacer todo el pipeline pregame (clima, splits, pitcheo
 * avanzado, cuotas, etc.) ni disparar el backfill PIT (que no cambia jugada a
 * jugada y no tiene sentido correr en cada refresco en vivo).
 *
 * Esa lógica de "refresco liviano" ya existía — no se creó nada nuevo aquí:
 * `updateSingleGameData` (server.ts) ya decide sola, para un juego puntual, si
 * alcanza con refrescar el resultado en vivo (`fetchGameResult` +
 * `fetchLiveResultOnly` + `getStarterBoxscoreStats` + `applyLiveResultRefresh`)
 * en vez de rehacer el pregame completo — lo hace cuando el juego no es final
 * Y ya tiene "cobertura pregame sólida" (`hasSolidPregameCoverage`). Ese mismo
 * criterio es el que ya usa `startLiveGamesAutoupdater` (el ciclo de fondo
 * cada 2 minutos) para decidir qué juegos re-consultar.
 *
 * Lo único que faltaba era un endpoint que aplique ese mismo criterio a TODOS
 * los juegos de una fecha de una sola vez, bajo demanda (en vez de esperar el
 * ciclo de 2 minutos), y que — a diferencia de llamar a
 * `updateSingleGameData` a ciegas — nunca caiga en la reconstrucción pregame
 * completa: un juego sin cobertura pregame sólida se reporta como "necesita
 * extracción completa primero" en vez de disparar ese pipeline caro sin que
 * el usuario lo pida explícitamente con el otro botón.
 *
 * Sept. 2026 — pedido del usuario: el botón "Actualizar Juegos en Vivo" solo
 * mostraba un spinner genérico mientras corría, sin ningún indicio de avance
 * real (a diferencia de "Ejecutar Extracción ETL", que sí muestra % + paso +
 * juego actual vía SSE). Como acá también se procesa juego por juego de forma
 * secuencial, se aplicó la misma lógica: el endpoint pasa a responder como
 * stream de eventos (`text/event-stream`, igual formato `data: {...}\n\n` que
 * ya usa /api/harvest) y emite un evento de progreso antes/después de cada
 * juego, en vez de esperar a que termine todo para responder un JSON único.
 * El frontend (App.tsx, handleLiveUpdate) reutiliza el mismo parser de SSE
 * que ya tenía para /api/harvest, así que ambos botones comparten la misma
 * barra de progreso (HarvesterPanel.tsx).
 */

import type { Express } from "express";
import { isFinalGameStatus, isNonActionableGameStatus } from "../utils/gameStatus";

export interface LiveUpdateDeps {
  readGamesDB: () => Record<string, any[]>;
  hasSolidPregameCoverage: (stored: any) => boolean;
  updateSingleGameData: (gameId: string, date: string, forceRefreshOdds?: boolean) => Promise<any>;
}

interface LiveUpdateGameResult {
  gameId: string;
  label: string;
  status: "updated" | "error";
  error?: string;
}

interface LiveUpdateSkipped {
  gameId: string;
  label: string;
  reason: "final" | "non_actionable" | "sin_cobertura_pregame";
}

export function registerLiveUpdateRoutes(app: Express, deps: LiveUpdateDeps): void {
  const { readGamesDB, hasSolidPregameCoverage, updateSingleGameData } = deps;

  app.post("/api/harvest-live", async (req, res) => {
    const { date } = req.body || {};
    if (!date || typeof date !== "string") {
      res.status(400).json({ error: "date es requerido" });
      return;
    }

    // Igual que /api/harvest: se pasa a modo SSE desde el arranque, para que
    // el frontend pueda leer progreso real en vez de esperar un JSON único al
    // final. Todas las respuestas de acá en adelante (incluidos los casos
    // "sin juegos"/"nada elegible") van como eventos `data: {...}\n\n`.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const emit = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const db = readGamesDB();
    const gamesForDate = db[date] || [];

    if (gamesForDate.length === 0) {
      emit({
        phase: "done",
        pct: 100,
        step: `No hay juegos guardados para ${date}. Corré la extracción completa primero.`,
        updated: [],
        skipped: [],
        message: `No hay juegos guardados para ${date}. Corré la extracción completa primero.`,
      });
      res.end();
      return;
    }

    // Mismo criterio que usa el auto-updater de fondo (server.ts,
    // startLiveGamesAutoupdater) para decidir qué juegos vale la pena
    // re-consultar — unificado a propósito para que este botón manual y el
    // ciclo automático de 2 minutos nunca diverjan sobre qué es "un juego en
    // vivo que hay que actualizar".
    const eligible: { gameId: string; label: string }[] = [];
    const skipped: LiveUpdateSkipped[] = [];

    for (const game of gamesForDate) {
      const gameId = String(game.id);
      const label = `${game.metadata?.awayTeam ?? "?"} @ ${game.metadata?.homeTeam ?? "?"}`;
      const status = game.game_result?.gameStatus || "";

      if (status === "" ? false : isFinalGameStatus(status)) {
        skipped.push({ gameId, label, reason: "final" });
        continue;
      }
      if (isNonActionableGameStatus(status)) {
        skipped.push({ gameId, label, reason: "non_actionable" });
        continue;
      }

      const isLiveStatus = status.includes("In Progress") || status.includes("Live") || status.includes("Delayed") || status.includes("Suspended");
      if (!isLiveStatus && !hasSolidPregameCoverage(game)) {
        // Deliberado: NO se cae al pipeline pregame completo acá. Ese caso
        // (abridor aún "Por definir", splits/clima sin traer) necesita el
        // botón de extracción completa — este endpoint es solo para el
        // refresco liviano en vivo.
        skipped.push({ gameId, label, reason: "sin_cobertura_pregame" });
        continue;
      }

      eligible.push({ gameId, label });
    }

    if (eligible.length === 0) {
      const message = "Ningún juego de esta fecha está en vivo ahora mismo (o los que faltan por terminar todavía no tienen cobertura pregame — corré la extracción completa primero).";
      emit({ phase: "done", pct: 100, step: message, updated: [], skipped, message });
      res.end();
      return;
    }

    emit({
      phase: "real_data",
      step: `${eligible.length} juego(s) en vivo encontrados — actualizando...`,
      pct: 3,
      totalGames: eligible.length,
    });

    // Secuencial (no Promise.all) a propósito: mismo criterio que el
    // auto-updater de fondo, para no ráfagas de llamadas simultáneas a la API
    // de MLB que puedan gatillar rate-limiting.
    const totalGames = eligible.length;
    const pctPerGame = Math.floor(94 / totalGames);
    const results: LiveUpdateGameResult[] = [];
    for (let gi = 0; gi < eligible.length; gi++) {
      const item = eligible[gi];
      const basePct = 3 + gi * pctPerGame;
      emit({
        phase: "real_data",
        step: `Actualizando: ${item.label}`,
        gameLabel: item.label,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct,
      });
      try {
        await updateSingleGameData(item.gameId, date, false);
        results.push({ gameId: item.gameId, label: item.label, status: "updated" });
        emit({
          phase: "real_data",
          step: `✓ ${item.label}`,
          gameLabel: item.label,
          gameIndex: gi + 1,
          totalGames,
          pct: basePct + pctPerGame,
        });
      } catch (err) {
        console.error(`[Live Update] Error al actualizar juego ${item.label} (${item.gameId}):`, err);
        results.push({
          gameId: item.gameId,
          label: item.label,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        emit({
          phase: "real_data",
          step: `✗ ${item.label} (falló)`,
          gameLabel: item.label,
          gameIndex: gi + 1,
          totalGames,
          pct: basePct + pctPerGame,
        });
      }
    }

    const failedCount = results.filter((r) => r.status === "error").length;
    emit({
      phase: "done",
      pct: 100,
      step: failedCount > 0
        ? `Actualización en vivo completada — ${totalGames - failedCount} de ${totalGames} juego(s) OK`
        : `Actualización en vivo completada — ${totalGames} juego(s)`,
      updated: results,
      skipped,
    });
    res.end();
  });
}
