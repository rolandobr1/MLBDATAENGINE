/**
 * cronPipelineRoutes.ts — Fase 4, punto 1 del plan de mejora.
 *
 * Extracción incremental acotada: este archivo saca de `server.ts` (que ya
 * pasaba las 260KB) las rutas y helpers agregados en la Fase 3 para el
 * pipeline automatizado (`/api/cron/run-daily-pipeline`, `/api/cron/runs`),
 * SIN tocar el resto del monolito. `server.ts` sigue siendo el entrypoint
 * real y sigue teniendo todas sus demás rutas — esto es un primer paso
 * acotado, no una reescritura del archivo completo.
 *
 * Por qué con inyección de dependencias en vez de importar directo de
 * `server.ts`: varias funciones que este código necesita (`readGamesDB`,
 * `readPitLookups`, `getNewYorkDateString`, los enrichers de Savant/props)
 * son funciones locales de `server.ts` (no exportadas) con su propio estado
 * y caches internos. Exportarlas todas ensancharía la superficie pública de
 * `server.ts` solo para este archivo, y crearía un import circular
 * (`server.ts` necesita registrar estas rutas, y estas rutas necesitarían
 * importar de `server.ts`). Pasarlas como parámetros de una función
 * "factory" evita ambos problemas: `server.ts` sigue siendo dueño de esas
 * funciones y simplemente se las pasa a `registerCronPipelineRoutes` al
 * arrancar.
 */

import fs from "fs";
import path from "path";
import type { Express, Request, Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import type { PITLookups } from "../utils";
import { createRunRecorder, getRecentRuns } from "../services/pipelineRunLog";
import { validateDataset } from "../../validate_dataset";

const execFileAsync = promisify(execFile);

/** Resultado resumido del último evento SSE "done" del endpoint /api/harvest. */
export interface HarvestLoopbackResult {
  gamesCount: number;
  skippedGames: number;
  errorsCount: number;
  cached: boolean;
}

/**
 * Dependencias que `server.ts` inyecta al registrar estas rutas — todo lo
 * que este módulo necesita de "el resto del monolito", explícito en un solo
 * lugar en vez de imports implícitos.
 */
export interface CronPipelineDeps {
  /** Puerto en el que ya está escuchando este mismo proceso (para el loopback HTTP a /api/harvest). */
  port: number;
  readGamesDB: () => Record<string, any[]>;
  readPitLookups: () => PITLookups;
  generateBattersCSV: (games: any[], pitLookups: PITLookups) => string;
  enrichGamesWithSavantBatterContact: (games: any[]) => Promise<any[]>;
  enrichGamesWithTotalBasesProps: (games: any[]) => Promise<any[]>;
  getNewYorkDateString: () => string;
}

/** Corre el harvest de un día vía loopback HTTP a /api/harvest, consumiendo su stream SSE. */
async function runHarvestViaLoopback(port: number, date: string, timeoutMs = 15 * 60 * 1000): Promise<HarvestLoopbackResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`/api/harvest respondió ${res.status} para ${date}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastDone: any = null;
    let lastEvent: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice("data: ".length));
          lastEvent = event;
          if (event.phase === "done") lastDone = event;
        } catch {
          // línea SSE no parseable como JSON; se ignora
        }
      }
    }

    if (!lastDone) {
      throw new Error(`El stream de /api/harvest terminó sin emitir un evento "done" para ${date}. Último evento visto: ${JSON.stringify(lastEvent)}`);
    }
    return {
      gamesCount: Array.isArray(lastDone.games) ? lastDone.games.length : 0,
      skippedGames: lastDone.skippedGames ?? 0,
      errorsCount: lastDone.errorsCount ?? 0,
      cached: Boolean(lastDone.cached),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Corre el backfill de stats PIT (subproceso Python) para juegos desde `date` en
 * adelante. Exportado (sept. 2026) para que `/api/harvest` en server.ts también
 * lo llame al terminar una extracción manual — antes solo lo disparaba el
 * pipeline de cron, así que un "Ejecutar Extracción ETL" manual dejaba el día
 * recién extraído sin cobertura PIT hasta que alguien se acordara de correr
 * este script aparte. Ver conversación con el usuario, sept. 2026.
 */
export async function runBackfillPitSubprocess(
  date: string,
  timeoutMs = 10 * 60 * 1000,
  options: { reverify?: boolean } = {}
): Promise<{ exitCode: number; stdoutTail: string }> {
  const pythonBin = process.env.PYTHON_BIN || "python3";
  // Sept. 2026: para la fecha de HOY (juegos en curso todo el día) el backfill
  // puede correr varias veces mientras el partido avanza — vía el botón manual,
  // el nuevo botón de "actualización en vivo" (que nunca llama a este script,
  // pero sí puede correr antes de que MLB confirme los pitchers abridores) o el
  // auto-updater cada 2 min. Si la PRIMERA corrida del día cae antes de que
  // pitchers.home/away.pitcherId estén resueltos en mlb_database.json, el script
  // guarda {home: null, away: null} para ese game_id — y como la lógica normal es
  // "si el game_id ya existe, saltarlo" (pensada para no re-golpear la API de MLB
  // en corridas históricas ya cubiertas), ese null queda pegado para siempre,
  // aunque más tarde el juego ya tenga toda su información. Ver auditoría con el
  // usuario: columnas PIT vacías para 2026-09-12 pese a que el fix de `requests`
  // ya estaba desplegado y sin errores en el log. Por eso, solo para la fecha de
  // hoy, se fuerza --reverify (recalcula y sobreescribe aunque ya exista una
  // entrada) — para fechas pasadas se mantiene el salto incremental de siempre.
  const args = ["backfill_pitcher_stats_pit.py", "--from_date", date];
  if (options.reverify) {
    args.push("--reverify");
  }
  try {
    const { stdout } = await execFileAsync(
      pythonBin,
      args,
      { cwd: process.cwd(), timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }
    );
    return { exitCode: 0, stdoutTail: stdout.slice(-4000) };
  } catch (err: any) {
    // execFile lanza en exit code != 0; igual devolvemos la salida para el log estructurado.
    const stdoutTail = String(err?.stdout || "").slice(-4000);
    const stderrTail = String(err?.stderr || "").slice(-2000);
    throw new Error(`backfill_pitcher_stats_pit.py falló (código ${err?.code ?? "?"}): ${stderrTail || stdoutTail || err?.message || err}`);
  }
}

/** Exporta el CSV de bateadores (335 columnas) para una fecha y lo escribe a disco. */
async function exportBattersCsvForDate(date: string, deps: CronPipelineDeps): Promise<string> {
  const db = deps.readGamesDB();
  const games = db[date] || [];
  const pitLookups = deps.readPitLookups();
  const enrichedGames = await deps.enrichGamesWithSavantBatterContact(await deps.enrichGamesWithTotalBasesProps(games));
  const csvContent = deps.generateBattersCSV(enrichedGames, pitLookups);
  const csvPath = path.join(process.cwd(), `MLB_BATTERS_DATASET_${date}.csv`);
  fs.writeFileSync(csvPath, csvContent);
  return csvPath;
}

/**
 * Registra `/api/cron/run-daily-pipeline` y `/api/cron/runs` en la app de
 * Express ya creada en `server.ts`. Se llama una sola vez al arrancar,
 * pasando las dependencias del monolito (ver `CronPipelineDeps`).
 *
 * Deliberadamente NO se tocó el endpoint /api/harvest (SSE, usado por la UI
 * en vivo): el paso de "extracción" de abajo lo invoca por loopback HTTP y
 * consume su stream SSE, tratándolo como una caja negra ya probada, en vez
 * de duplicar ~500 líneas de lógica de extracción o arriesgar romper la UI
 * al refactorizarlo. Ver PLAN_DE_MEJORA_MLBDATAENGINE.md Fase 3.
 */
export function registerCronPipelineRoutes(app: Express, deps: CronPipelineDeps): void {
  app.post("/api/cron/run-daily-pipeline", async (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      res.status(503).json({ error: "CRON_SECRET no está configurado en el servidor; este endpoint está deshabilitado por seguridad hasta que se configure." });
      return;
    }
    if (req.headers["x-cron-secret"] !== secret) {
      res.status(401).json({ error: "No autorizado." });
      return;
    }

    const date = typeof req.body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
      ? req.body.date
      : deps.getNewYorkDateString();

    const recorder = createRunRecorder({ date, trigger: "cron" });

    // Responder de inmediato: el pipeline completo puede tardar varios minutos (rate
    // limit de la API de MLB + backfill), y un Cron Job externo no debería tener que
    // mantener la conexión HTTP abierta todo ese tiempo. El resultado real queda en
    // pipeline_runs.json (consultable por runId).
    res.status(202).json({ accepted: true, runId: recorder.runId, date });

    (async () => {
      // Paso 1: extracción
      const extractStep = recorder.startStep("extraccion");
      try {
        const harvestResult = await runHarvestViaLoopback(deps.port, date);
        recorder.finishStep(extractStep, "ok", harvestResult);
        recorder.setNewGames(harvestResult.gamesCount);
      } catch (err) {
        recorder.finishStep(extractStep, "error", undefined, err instanceof Error ? err.message : String(err));
        recorder.finish();
        console.error(`[CronPipeline] ${recorder.runId}: extracción falló, se aborta la corrida.`, err);
        return;
      }

      // Paso 2: backfill PIT — sept. 2026: desde que /api/harvest corre este mismo
      // backfill internamente al final de cada extracción (ver server.ts), este
      // paso ya suele ser un no-op casi instantáneo (el script salta los juegos
      // que el paso 1 ya cubrió). Se deja como red de seguridad explícita en el
      // log del pipeline en vez de quitarlo, por si el backfill interno de
      // /api/harvest llegó a fallar silenciosamente.
      const backfillStep = recorder.startStep("backfill_pit");
      try {
        const isToday = date === deps.getNewYorkDateString();
        const backfillResult = await runBackfillPitSubprocess(date, undefined, { reverify: isToday });
        recorder.finishStep(backfillStep, "ok", backfillResult);
      } catch (err) {
        // No abortamos: se exporta con la cobertura PIT que ya exista y quede constancia del fallo.
        recorder.finishStep(backfillStep, "error", undefined, err instanceof Error ? err.message : String(err));
        console.error(`[CronPipeline] ${recorder.runId}: backfill PIT falló, se continúa con el export de todos modos.`, err);
      }

      // Paso 3: export CSV
      const exportStep = recorder.startStep("export_csv");
      let csvPath: string | null = null;
      try {
        csvPath = await exportBattersCsvForDate(date, deps);
        recorder.finishStep(exportStep, "ok", { csvPath });
      } catch (err) {
        recorder.finishStep(exportStep, "error", undefined, err instanceof Error ? err.message : String(err));
        recorder.finish();
        console.error(`[CronPipeline] ${recorder.runId}: export de CSV falló, se aborta la corrida.`, err);
        return;
      }

      // Paso 4: validación (validate_dataset.ts, Fase 2 punto 4) — se importa como
      // módulo en vez de lanzar un subproceso, para no depender de parsear stdout.
      const validateStep = recorder.startStep("validacion");
      try {
        const validation = validateDataset(csvPath, { log: false });
        recorder.setValidation({ failures: validation.failures, warnings: validation.warnings.length, passed: validation.passed });
        recorder.finishStep(
          validateStep,
          validation.passed ? "ok" : "error",
          { failures: validation.failures, warnings: validation.warnings, rowCount: validation.rowCount },
          validation.passed ? undefined : `${validation.failures} falla(s) crítica(s) — ver detalle en el paso`
        );
      } catch (err) {
        recorder.finishStep(validateStep, "error", undefined, err instanceof Error ? err.message : String(err));
      }

      recorder.finish();
      console.log(`[CronPipeline] ${recorder.runId}: corrida completa para ${date}.`);
    })().catch((err) => {
      console.error(`[CronPipeline] ${recorder.runId}: error inesperado no capturado en la corrida en segundo plano:`, err);
    });
  });

  /** Últimas corridas del pipeline (Fase 3, punto 4) — para inspección manual o un futuro panel. */
  app.get("/api/cron/runs", (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers["x-cron-secret"] !== secret) {
      res.status(401).json({ error: "No autorizado." });
      return;
    }
    const limit = Number(req.query.limit) || 20;
    res.json({ runs: getRecentRuns(limit) });
  });
}
