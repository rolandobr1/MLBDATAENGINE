/**
 * validate_dataset.ts — Fase 2, punto 4 del plan de mejora
 * (PLAN_DE_MEJORA_MLBDATAENGINE.md).
 *
 * Reemplaza las verificaciones manuales dispersas (verify_csv.ts, verify_csv_fast.ts,
 * verify_csv_local.ts, verify_batters_csv.ts, check_dups.ts) por un solo validador que
 * se puede correr automáticamente después de cada exportación del CSV y que reporta:
 *
 *   1. Encabezados duplicados en el CSV.
 *   2. % de nulos por bloque de columnas (bateador, lanzador estándar, props de
 *      apuestas, bullpen, ofensa, clima, splits, fatiga, avanzado de lanzador/ofensa
 *      derivado de Baseball Savant sin corte point-in-time, resultados del juego).
 *   3. Filas duplicadas (mismo game_id + player_name) y game_id que aparecen bajo
 *      más de una fecha dentro del mismo CSV (ver Fase 2, punto 2 — duplicados entre
 *      fechas en mlb_database.json).
 *   4. Distribución de resultado_estado / game_status.
 *   5. "Rachas congeladas": mismo lanzador con 3+ valores idénticos consecutivos
 *      (ordenado por fecha) en las columnas de temporada acumulada — la misma
 *      detección que se usó en la auditoría para encontrar el bug de la Fase 1.
 *
 * Uso por línea de comandos:
 *   npx tsx validate_dataset.ts <ruta-al-csv> [--max-null-pct=50] [--strict]
 *
 * Uso como módulo (Fase 3, puntos 1+3 — el endpoint de cron lo importa directo en vez
 * de lanzar un subproceso y parsear su stdout):
 *   import { validateDataset } from "./validate_dataset";
 *   const result = validateDataset(csvPath);
 *   if (!result.passed) { ... }
 *
 * Código de salida del CLI: 0 si no hay fallas críticas, 1 si las hay (encabezados
 * duplicados, filas duplicadas, game_id con fechas inconsistentes, o rachas
 * congeladas en juegos ya finalizados). Los avisos de % de nulos por bloque no
 * hacen fallar la corrida salvo que se pase --strict.
 */

import fs from "fs";
import { parse } from "csv-parse/sync";

export interface ValidateDatasetOptions {
  maxNullPct?: number;
  strict?: boolean;
  /** Si es false, no imprime nada por consola (útil cuando se llama como módulo). */
  log?: boolean;
}

export interface ValidateDatasetResult {
  csvPath: string;
  failures: number;
  warnings: string[];
  passed: boolean;
  rowCount: number;
  columnCount: number;
}

const NULL_LIKE = new Set(["", "n/a", "null", "nan", "undefined"]);
function isNullLike(v: string | undefined): boolean {
  if (v === undefined) return true;
  return NULL_LIKE.has(v.trim().toLowerCase());
}

// Orden de evaluación: la primera regla que matchea gana. Basado en los prefijos
// reales de generateBattersCSV / generateMLDatasetCSV (src/utils.ts).
const BLOCK_RULES: Array<{ name: string; test: (col: string) => boolean; critical?: boolean }> = [
  { name: "identificadores", test: (c) => ["game_id", "date", "player_name", "team", "batting_order", "bat_side", "position", "opposing_pitcher", "opposing_pitcher_hand", "hora", "equipo_home", "equipo_visitante", "estadio"].includes(c) },
  { name: "pitcher_props_apuestas", test: (c) => /strikeout_prop|total_bases_prop/.test(c) },
  { name: "pitcher_estandar_pit", test: (c) => /^(home|away)_pitcher_(era|whip|kPct|bbPct|wins|losses|ip|strikeouts|gs|ip_avg_start|stats_source)$/.test(c), critical: true },
  { name: "savant_sin_corte_pit", test: (c) => /^(home|away)_pitcher_(xera|hardhit_pct|barrel_pct|swstr_pct|csw_pct|fastball_pct|slider_pct|curve_pct|changeup_pct|splitter_pct)$/.test(c) || /^(home|away)_catcher_framing_runs$/.test(c) },
  { name: "savant_asof_metadata", test: (c) => c === "savant_metrics_asof_date" },
  { name: "pitcher_avanzado_otro", test: (c) => /^(home|away)_pitcher_/.test(c) },
  { name: "bullpen", test: (c) => /^(home|away)_bullpen_|^bullpen_/.test(c) },
  { name: "ofensa_equipo", test: (c) => /^ofensa_|^(home|away)_offense_kPct$/.test(c) },
  { name: "ofensa_avanzada_savant", test: (c) => /^(home|away)_offense_(woba|xwoba|hardhit_pct|barrel_pct)$/.test(c) },
  { name: "ofensa_avanzada_otro", test: (c) => /^(home|away)_offense_|^(home|away)_projected_lineup_/.test(c) },
  { name: "clima", test: (c) => /^weather_/.test(c) },
  { name: "splits_vs_mano", test: (c) => /_splits_vs_/.test(c) },
  { name: "fatiga", test: (c) => /pitcher_rest$|pitches_last|_ip_3d$|_ip_7d/.test(c) },
  { name: "bateador_stats", test: (c) => ["avg", "obp", "slg", "ops", "woba", "iso", "pa", "hits", "doubles", "triples", "home_runs", "strikeout_pct", "walk_pct"].includes(c) || /^last7_|_vs_rhp$|_vs_lhp$|^whiff_pct$|^chase_pct$/.test(c) },
  { name: "pitcher_allowed_vs_mano", test: (c) => /^pitcher_allowed_/.test(c) },
  { name: "modelo_features_diff", test: (c) => /^diff_|^line_source$/.test(c) },
  { name: "resultados_juego", test: (c) => /^resultado_|^game_status$|^home_score$|^away_score$|^winner$/.test(c), critical: true },
];

function classify(col: string): { name: string; critical: boolean } {
  for (const rule of BLOCK_RULES) {
    if (rule.test(col)) return { name: rule.name, critical: !!rule.critical };
  }
  return { name: "otros_sin_clasificar", critical: false };
}

const FROZEN_STREAK_MIN = 3;
const SEASON_FIELDS = ["era", "whip", "wins", "losses", "ip", "strikeouts", "gs"] as const;

/**
 * Corre todas las validaciones sobre un CSV ya exportado y devuelve el resultado.
 * No llama a process.exit — eso es responsabilidad del wrapper de CLI más abajo.
 */
export function validateDataset(csvPath: string, options: ValidateDatasetOptions = {}): ValidateDatasetResult {
  const maxNullPct = options.maxNullPct ?? 50;
  const strict = options.strict ?? false;
  const shouldLog = options.log ?? true;
  const log = (...args: unknown[]) => { if (shouldLog) console.log(...args); };
  const logErr = (...args: unknown[]) => { if (shouldLog) console.error(...args); };

  log(`\n=== validate_dataset.ts — validando ${csvPath} ===\n`);

  const raw = fs.readFileSync(csvPath, "utf-8");
  const firstLine = raw.split("\n")[0].replace(/\r$/, "");
  const rawHeaders = firstLine.split(",");

  let failures = 0;
  const warnings: string[] = [];

  // 1. Encabezados duplicados
  {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const h of rawHeaders) {
      if (seen.has(h)) dupes.add(h);
      seen.add(h);
    }
    log(`--- 1. Encabezados ---`);
    log(`Total columnas: ${rawHeaders.length}`);
    if (dupes.size > 0) {
      logErr(`FALLO: columnas duplicadas: ${Array.from(dupes).join(", ")}`);
      failures++;
    } else {
      log(`OK: no hay columnas duplicadas.`);
    }
    log();
  }

  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const columns = Object.keys(records[0] || {});
  log(`Filas de datos: ${records.length}\n`);

  // 2. % de nulos por bloque de columnas
  const blockStats = new Map<string, { total: number; nulls: number; critical: boolean }>();
  for (const col of columns) {
    const { name, critical } = classify(col);
    if (!blockStats.has(name)) blockStats.set(name, { total: 0, nulls: 0, critical });
    const stat = blockStats.get(name)!;
    for (const row of records) {
      stat.total++;
      if (isNullLike(row[col])) stat.nulls++;
    }
  }

  log(`--- 2. % de nulos por bloque de columnas (umbral de aviso: ${maxNullPct}%) ---`);
  const sortedBlocks = Array.from(blockStats.entries()).sort((a, b) => b[1].nulls / b[1].total - a[1].nulls / a[1].total);
  for (const [name, stat] of sortedBlocks) {
    const pct = stat.total > 0 ? (100 * stat.nulls) / stat.total : 0;
    const flag = pct >= maxNullPct ? (stat.critical ? " <-- CRÍTICO" : " <-- aviso") : "";
    log(`  ${name.padEnd(28)} ${pct.toFixed(1)}% nulos${flag}`);
    if (pct >= maxNullPct) {
      const msg = `${name}: ${pct.toFixed(1)}% de nulos (>= ${maxNullPct}%)`;
      if (stat.critical) {
        logErr(`FALLO: bloque crítico con demasiados nulos — ${msg}`);
        failures++;
      } else {
        warnings.push(msg);
      }
    }
  }
  log();

  // 3. Filas duplicadas y game_id con fechas inconsistentes dentro del mismo CSV
  log(`--- 3. Duplicados ---`);
  if (columns.includes("game_id") && columns.includes("player_name")) {
    const rowKeyCounts = new Map<string, number>();
    for (const row of records) {
      const key = `${row.game_id}|${row.player_name}`;
      rowKeyCounts.set(key, (rowKeyCounts.get(key) || 0) + 1);
    }
    const dupedRows = Array.from(rowKeyCounts.entries()).filter(([, n]) => n > 1);
    if (dupedRows.length > 0) {
      logErr(`FALLO: ${dupedRows.length} combinaciones (game_id, player_name) duplicadas. Ejemplos: ${dupedRows.slice(0, 5).map(([k]) => k).join("; ")}`);
      failures++;
    } else {
      log(`OK: no hay filas (game_id, player_name) duplicadas.`);
    }
  }

  if (columns.includes("game_id") && columns.includes("date")) {
    const idToDates = new Map<string, Set<string>>();
    for (const row of records) {
      if (!idToDates.has(row.game_id)) idToDates.set(row.game_id, new Set());
      idToDates.get(row.game_id)!.add(row.date);
    }
    const inconsistent = Array.from(idToDates.entries()).filter(([, dates]) => dates.size > 1);
    if (inconsistent.length > 0) {
      logErr(`FALLO: ${inconsistent.length} game_id aparecen bajo más de una fecha en este CSV (ver Fase 2, punto 2). Ejemplos: ${inconsistent.slice(0, 5).map(([id, dates]) => `${id}=[${Array.from(dates).join(",")}]`).join("; ")}`);
      failures++;
    } else {
      log(`OK: cada game_id tiene una sola fecha en este CSV.`);
    }
  }
  log();

  // 4. Distribución de resultado_estado / game_status
  const statusCol = columns.includes("resultado_estado") ? "resultado_estado" : columns.includes("game_status") ? "game_status" : null;
  log(`--- 4. Distribución de estado del juego ${statusCol ? `(${statusCol})` : ""} ---`);
  if (statusCol) {
    const counts = new Map<string, number>();
    for (const row of records) {
      const v = row[statusCol] || "(vacío)";
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    for (const [status, n] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1])) {
      log(`  ${status.padEnd(20)} ${n} filas (${((100 * n) / records.length).toFixed(1)}%)`);
    }
  } else {
    log(`(no se encontró columna resultado_estado ni game_status en este CSV)`);
  }
  log();

  // 5. Rachas congeladas — misma detección usada en la auditoría de la Fase 1
  log(`--- 5. Rachas congeladas (stats de temporada del lanzador repetidas 3+ veces seguidas) ---`);

  function detectFrozenStreaks(side: "home" | "away") {
    const nameCol = `${side}_pitcher`;
    const statusOk = (row: Record<string, string>) => {
      const status = (row[statusCol || ""] || "").toLowerCase();
      return status.includes("final") || status === "game over" || status === "completed" || status === "completed early";
    };
    const requiredCols = [nameCol, "date", ...SEASON_FIELDS.map((f) => `${side}_pitcher_${f}`)];
    if (!requiredCols.every((c) => columns.includes(c))) return { pitchersWithStreaks: 0, totalStreaks: 0 };

    const byPitcher = new Map<string, { date: string; tuple: string }[]>();
    for (const row of records) {
      const name = row[nameCol];
      if (!name || name === "Por definir" || name === "TBD") continue;
      if (statusCol && !statusOk(row)) continue; // solo juegos finalizados: en progreso/futuro es normal que se repita
      const tuple = SEASON_FIELDS.map((f) => row[`${side}_pitcher_${f}`] ?? "").join("|");
      if (!byPitcher.has(name)) byPitcher.set(name, []);
      byPitcher.get(name)!.push({ date: row.date, tuple });
    }

    let pitchersWithStreaks = 0;
    let totalStreaks = 0;
    for (const [name, entries] of byPitcher) {
      entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      let runLen = 1;
      let foundInThisPitcher = false;
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].tuple === entries[i - 1].tuple && entries[i].tuple.replace(/\|/g, "") !== "") {
          runLen++;
          if (runLen === FROZEN_STREAK_MIN) {
            totalStreaks++;
            foundInThisPitcher = true;
            logErr(`FALLO: racha congelada — ${side} pitcher "${name}" tiene ${runLen}+ valores idénticos de (${SEASON_FIELDS.join(",")}) en fechas consecutivas terminando en ${entries[i].date}.`);
          }
        } else {
          runLen = 1;
        }
      }
      if (foundInThisPitcher) pitchersWithStreaks++;
    }
    return { pitchersWithStreaks, totalStreaks };
  }

  const homeStreaks = detectFrozenStreaks("home");
  const awayStreaks = detectFrozenStreaks("away");
  const totalFrozenStreaks = homeStreaks.totalStreaks + awayStreaks.totalStreaks;
  if (totalFrozenStreaks > 0) {
    logErr(`FALLO: ${totalFrozenStreaks} racha(s) congelada(s) detectadas (${homeStreaks.pitchersWithStreaks} lanzadores locales, ${awayStreaks.pitchersWithStreaks} visitantes). Este es el criterio de salida de la Fase 1 — debería ser 0 para juegos ya reprocesados con la corrección de stats=byDateRange.`);
    failures++;
  } else {
    log(`OK: 0 rachas congeladas en juegos finalizados.`);
  }
  log();

  // Resumen
  log(`=== Resumen ===`);
  log(`Fallas críticas: ${failures}`);
  log(`Avisos (bloques no críticos con muchos nulos): ${warnings.length}`);
  if (warnings.length > 0) warnings.forEach((w) => log(`  - ${w}`));

  const passed = !(failures > 0 || (strict && warnings.length > 0));
  log(passed ? `\nvalidate_dataset.ts: OK.` : `\nvalidate_dataset.ts: FALLÓ.`);

  return { csvPath, failures, warnings, passed, rowCount: records.length, columnCount: columns.length };
}

function findLatestBattersCsv(): string | null {
  const files = fs.readdirSync(process.cwd()).filter((f) => /^MLB_BATTERS_DATASET_.*\.csv$/i.test(f));
  if (files.length === 0) return null;
  files.sort();
  return files[files.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: solo corre cuando el archivo se ejecuta directamente (tsx validate_dataset.ts),
// no cuando otro módulo lo importa (server.ts lo hace para el endpoint de cron).
// ─────────────────────────────────────────────────────────────────────────────

const isMainModule = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const flags = new Map<string, string>();
  for (const a of args) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags.set(k, v ?? "true");
    }
  }
  const strict = flags.get("strict") === "true";
  const maxNullPct = flags.has("max-null-pct") ? Number(flags.get("max-null-pct")) : 50;
  const csvPath = positional[0] || findLatestBattersCsv();

  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error(`No se encontró un CSV para validar. Pasa la ruta explícitamente:\n  npx tsx validate_dataset.ts <ruta-al-csv>`);
    process.exit(1);
  }

  const result = validateDataset(csvPath, { maxNullPct, strict });
  process.exit(result.passed ? 0 : 1);
}
