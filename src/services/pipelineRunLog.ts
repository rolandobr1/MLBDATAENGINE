/**
 * pipelineRunLog.ts — Fase 3, punto 4 del plan de mejora.
 *
 * Antes, cada corrida del pipeline solo dejaba rastro en console.log (perdido en
 * cuanto rota el log del proceso). Este módulo registra cada corrida en un archivo
 * JSON estructurado (pipeline_runs.json) con: fecha de corrida, rango procesado,
 * juegos nuevos, errores por paso, y el resultado de validate_dataset.ts. Esto es
 * justamente lo que hubiera permitido detectar el bug de ponches congelados de la
 * Fase 1 meses antes, revisando el historial en vez de logs efímeros.
 */

import fs from "fs";
import path from "path";

const RUN_LOG_PATH = path.join(process.cwd(), "pipeline_runs.json");
const MAX_RUNS_KEPT = 500; // evita que el archivo crezca sin límite

export type PipelineStepStatus = "ok" | "error" | "skipped";

export interface PipelineStepRecord {
  step: string;
  startedAt: string;
  finishedAt: string | null;
  status: PipelineStepStatus;
  details?: unknown;
  error?: string;
}

export interface ValidationSummary {
  failures: number;
  warnings: number;
  passed: boolean;
}

export interface PipelineRunRecord {
  runId: string;
  trigger: "manual" | "cron" | "sse";
  date: string;
  rangeStart?: string;
  rangeEnd?: string;
  startedAt: string;
  finishedAt: string | null;
  steps: PipelineStepRecord[];
  newGames: number;
  errors: number;
  validation: ValidationSummary | null;
}

function readAllRuns(): PipelineRunRecord[] {
  try {
    if (!fs.existsSync(RUN_LOG_PATH)) return [];
    const raw = fs.readFileSync(RUN_LOG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[PipelineRunLog] Error leyendo pipeline_runs.json, se empieza de cero:", err);
    return [];
  }
}

function writeAllRuns(runs: PipelineRunRecord[]) {
  try {
    const trimmed = runs.slice(-MAX_RUNS_KEPT);
    fs.writeFileSync(RUN_LOG_PATH, JSON.stringify(trimmed, null, 2));
  } catch (err) {
    console.error("[PipelineRunLog] Error escribiendo pipeline_runs.json:", err);
  }
}

/**
 * Recorder ergonómico para usar dentro de un endpoint/orquestador: crea el registro
 * de la corrida, expone startStep/finishStep para cada paso, y persiste en disco al
 * llamar finish(). Cada llamada a startStep/finishStep persiste de inmediato, así que
 * si el proceso se cae a la mitad, el archivo ya refleja los pasos completados hasta
 * ese punto (no se pierde todo el registro de la corrida).
 */
export function createRunRecorder(opts: { date: string; trigger: PipelineRunRecord["trigger"]; rangeStart?: string; rangeEnd?: string }) {
  const record: PipelineRunRecord = {
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trigger: opts.trigger,
    date: opts.date,
    rangeStart: opts.rangeStart,
    rangeEnd: opts.rangeEnd,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: [],
    newGames: 0,
    errors: 0,
    validation: null,
  };

  function persist() {
    const runs = readAllRuns();
    const idx = runs.findIndex((r) => r.runId === record.runId);
    if (idx >= 0) runs[idx] = record;
    else runs.push(record);
    writeAllRuns(runs);
  }

  persist(); // deja constancia de que la corrida arrancó, incluso si falla de inmediato

  return {
    runId: record.runId,
    startStep(step: string) {
      const entry: PipelineStepRecord = { step, startedAt: new Date().toISOString(), finishedAt: null, status: "skipped" };
      record.steps.push(entry);
      persist();
      return entry;
    },
    finishStep(entry: PipelineStepRecord, status: PipelineStepStatus, details?: unknown, error?: string) {
      entry.finishedAt = new Date().toISOString();
      entry.status = status;
      if (details !== undefined) entry.details = details;
      if (error) {
        entry.error = error;
        record.errors++;
      }
      persist();
    },
    setNewGames(count: number) {
      record.newGames = count;
      persist();
    },
    setValidation(validation: ValidationSummary) {
      record.validation = validation;
      persist();
    },
    finish() {
      record.finishedAt = new Date().toISOString();
      persist();
      return record;
    },
  };
}

/** Últimas N corridas registradas, más recientes primero — útil para un endpoint de estado. */
export function getRecentRuns(limit = 20): PipelineRunRecord[] {
  const runs = readAllRuns();
  return runs.slice(-limit).reverse();
}
