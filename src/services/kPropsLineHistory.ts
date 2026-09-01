/**
 * kPropsLineHistory.ts
 *
 * Bitácora de movimientos de línea para el prop de ponches (K's) de lanzadores.
 * El refresco periódico (ver `kPropsLineRefresher.ts` y
 * `src/routes/kPropsLineHistoryRoutes.ts`) solo agrega una fila aquí cuando la
 * línea, la cuota Over o la cuota Under realmente cambiaron respecto a la
 * última captura — no en cada corrida. Cada fila queda con su hora exacta,
 * pensado para exportarse como CSV (`generateKPropsLineHistoryCSV`) y ver la
 * evolución de una línea a lo largo del día.
 *
 * Sigue el mismo patrón que `pipelineRunLog.ts` (JSON plano en disco, tope de
 * filas para que no crezca sin límite) para no introducir una dependencia
 * nueva (una base de datos, etc.) solo para esto.
 */

import fs from "fs";
import path from "path";
import { escapeCsvValue } from "../utils";

const HISTORY_PATH = path.join(process.cwd(), "k_props_line_history.json");
const MAX_RECORDS_KEPT = 20000; // ~ años de historial con el volumen actual de juegos/día

export interface KPropsLineChangeRecord {
  recordedAt: string; // ISO — momento exacto en que se detectó el cambio
  date: string; // fecha del juego (YYYY-MM-DD)
  gameId: string;
  side: "home" | "away";
  pitcherName: string;
  team: string;
  opponent: string;
  oldLine: number | null;
  newLine: number | null;
  oldOverOdds: number | null;
  newOverOdds: number | null;
  oldUnderOdds: number | null;
  newUnderOdds: number | null;
  source: string | null; // "the_odds_api" | "datastreak" | ...
}

function readAllRecords(): KPropsLineChangeRecord[] {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[KPropsLineHistory] Error leyendo k_props_line_history.json, se empieza de cero:", err);
    return [];
  }
}

function writeAllRecords(records: KPropsLineChangeRecord[]) {
  try {
    const trimmed = records.slice(-MAX_RECORDS_KEPT);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2));
  } catch (err) {
    console.error("[KPropsLineHistory] Error escribiendo k_props_line_history.json:", err);
  }
}

/** Agrega uno o más cambios detectados a la bitácora. No hace nada si el arreglo viene vacío. */
export function appendLineChanges(newRecords: KPropsLineChangeRecord[]): void {
  if (!newRecords.length) return;
  const all = readAllRecords();
  all.push(...newRecords);
  writeAllRecords(all);
}

/** Historial completo (o filtrado por fecha de juego), más reciente primero. */
export function getLineHistory(opts: { date?: string; limit?: number } = {}): KPropsLineChangeRecord[] {
  let records = readAllRecords();
  if (opts.date) records = records.filter((r) => r.date === opts.date);
  records = records.slice().reverse();
  if (opts.limit) records = records.slice(0, opts.limit);
  return records;
}

const CSV_HEADERS = [
  "recorded_at", "date", "game_id", "side", "pitcher_name", "team", "opponent",
  "old_line", "new_line", "old_over_odds", "new_over_odds", "old_under_odds", "new_under_odds", "source",
];

export function generateKPropsLineHistoryCSV(records: KPropsLineChangeRecord[]): string {
  const rows = records.map((r) => [
    r.recordedAt,
    r.date,
    r.gameId,
    r.side,
    escapeCsvValue(r.pitcherName),
    escapeCsvValue(r.team),
    escapeCsvValue(r.opponent),
    r.oldLine ?? "",
    r.newLine ?? "",
    r.oldOverOdds ?? "",
    r.newOverOdds ?? "",
    r.oldUnderOdds ?? "",
    r.newUnderOdds ?? "",
    r.source ? escapeCsvValue(r.source) : "",
  ]);
  return [CSV_HEADERS.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
