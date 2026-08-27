import { MLBGame } from "../types";
import { buildPitcherGameRows } from "./derivedDatasets";
import { getPregameSnapshotsForGames } from "./pregameSnapshots";

type Row = Record<string, string | number | null>;

export const KLAB_ADMIN_COLUMNS = [
  "game_id", "pitcher_id", "pitcher_name", "game_date", "snapshot_captured_at",
  "team", "opponent", "side",
] as const;

export const KLAB_FEATURE_COLUMNS = [
  "pitcher_k_pct", "pitcher_so_rate", "pitcher_swstr_pct", "pitcher_csw_pct",
  "pitcher_bb_pct", "pitcher_fip", "pitcher_xfip", "pitcher_siera", "pitcher_xera",
  "pitcher_last5_ks_avg", "pitcher_last5_ip_avg", "pitcher_last5_bf_avg",
  "pitcher_last5_pitch_count_avg", "projected_pitches", "projected_innings",
  "pitches_last_start", "pitches_last_3_starts", "days_since_last_start",
  "opponent_lineup_k_pct", "opponent_offense_ops", "opponent_offense_woba",
  "opponent_offense_xwoba", "park_factor_k", "weather_temp", "weather_wind_speed",
] as const;

export const KLAB_BENCHMARK_COLUMNS = ["projected_strikeouts"] as const;
export const KLAB_TARGET_COLUMNS = ["actual_k"] as const;
export const KLAB_COLUMNS = [
  ...KLAB_ADMIN_COLUMNS,
  ...KLAB_FEATURE_COLUMNS,
  ...KLAB_BENCHMARK_COLUMNS,
  ...KLAB_TARGET_COLUMNS,
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const POSTGAME_COLUMNS = new Set([
  "actual_ip", "actual_bf", "actual_pitches", "actual_er", "home_score", "away_score",
  "winner", "final_game_status", "game_status", "game_result",
]);

export interface KlabAnomaly {
  game_id: string;
  pitcher_id: string;
  column: string;
  value: number;
  reason: string;
}

export interface KlabTrainingReport {
  startDate: string;
  endDate: string;
  outputFilename: string;
  totalGames: number;
  totalPitchers: number;
  candidatePitchers: number;
  candidateRows: number;
  finalRows: number;
  observationsWithActualK: number;
  discardedWithoutActualK: number;
  discardedInvalidActualK: number;
  duplicateKeys: string[];
  outOfRangeRows: number;
  gamesWithoutPregameSnapshot: number;
  rowsWithPregameSnapshot: number;
  leakageColumns: string[];
  anomalies: KlabAnomaly[];
  featureColumns: string[];
  administrativeColumns: string[];
  benchmarkColumns: string[];
  targetColumns: string[];
  historicalFunnel: {
    manifestGames: number;
    snapshotsRecovered: number;
    validSnapshots: number;
    gamesWithFinalMatch: number;
    gamesWithActualK: number;
    finalPitcherGameObservations: number;
  } | null;
}

export interface KlabTrainingResult {
  rows: Row[];
  csv: string;
  report: KlabTrainingReport;
}

export function validateKlabDateRange(startDate: unknown, endDate: unknown): { startDate: string; endDate: string } {
  if (typeof startDate !== "string" || !ISO_DATE.test(startDate) || new Date(`${startDate}T00:00:00Z`).toISOString().slice(0, 10) !== startDate) {
    throw new Error("start_date es obligatoria y debe usar el formato YYYY-MM-DD");
  }
  if (typeof endDate !== "string" || !ISO_DATE.test(endDate) || new Date(`${endDate}T00:00:00Z`).toISOString().slice(0, 10) !== endDate) {
    throw new Error("end_date es obligatoria y debe usar el formato YYYY-MM-DD");
  }
  if (startDate > endDate) throw new Error("start_date debe ser menor o igual que end_date");
  return { startDate, endDate };
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(rows: Row[]): string {
  return [
    KLAB_COLUMNS.join(","),
    ...rows.map((row) => KLAB_COLUMNS.map((column) => csvValue(row[column])).join(",")),
  ].join("\n");
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function anomalyFor(row: Row, column: string, min: number, max: number): KlabAnomaly | null {
  const value = finiteNumber(row[column]);
  if (value === null || (value >= min && value <= max)) return null;
  return {
    game_id: String(row.game_id), pitcher_id: String(row.pitcher_id), column, value,
    reason: `fuera del rango de revisión ${min}..${max}`,
  };
}

export function buildKlabTrainingDataset(allGames: MLBGame[], rawStartDate: unknown, rawEndDate: unknown): KlabTrainingResult {
  const { startDate, endDate } = validateKlabDateRange(rawStartDate, rawEndDate);
  const rangeGames = allGames.filter((game) => {
    const date = game?.metadata?.date;
    return typeof date === "string" && date >= startDate && date <= endDate;
  });

  const snapshots = getPregameSnapshotsForGames(rangeGames);
  const pitcherNames = new Map<string, string>();
  for (const game of rangeGames) {
    const id = String((game as any)?.id || game?.metadata?.id || "");
    const pregame = snapshots.get(id)?.game as any;
    for (const side of ["home", "away"] as const) {
      const pitcher = pregame?.pitchers?.[side];
      const pitcherId = pitcher?.pitcherId ?? pitcher?.mlbId ?? pitcher?.id;
      if (pitcherId !== null && pitcherId !== undefined && pitcher?.name) {
        pitcherNames.set(`${id}:${String(pitcherId)}`, String(pitcher.name));
      }
    }
  }

  const sourceRows: Row[] = buildPitcherGameRows(rangeGames).map((row) => ({
    ...row,
    pitcher_name: pitcherNames.get(`${String(row.game_id)}:${String(row.pitcher_id)}`) ?? null,
  }));

  const gamesWithoutPregameSnapshot = rangeGames.filter((game) => {
    const id = String((game as any)?.id || game?.metadata?.id || "");
    return !snapshots.has(id);
  }).length;

  let discardedWithoutActualK = 0;
  let discardedInvalidActualK = 0;
  const eligibleRows: Row[] = [];
  for (const source of sourceRows) {
    if (source.actual_k === null || source.actual_k === undefined || source.actual_k === "") {
      discardedWithoutActualK += 1;
      continue;
    }
    const actualK = finiteNumber(source.actual_k);
    if (actualK === null || actualK < 0) {
      discardedInvalidActualK += 1;
      continue;
    }
    const row: Row = {};
    for (const column of KLAB_COLUMNS) row[column] = column === "actual_k" ? actualK : (source[column] ?? null);
    eligibleRows.push(row);
  }

  eligibleRows.sort((a, b) =>
    String(a.game_date).localeCompare(String(b.game_date)) ||
    String(a.snapshot_captured_at).localeCompare(String(b.snapshot_captured_at)) ||
    String(a.game_id).localeCompare(String(b.game_id)) ||
    String(a.pitcher_id).localeCompare(String(b.pitcher_id))
  );

  const seen = new Set<string>();
  const duplicateKeys: string[] = [];
  const rows: Row[] = [];
  for (const row of eligibleRows) {
    const key = `${row.game_id}:${row.pitcher_id}`;
    if (seen.has(key)) {
      duplicateKeys.push(key);
      continue;
    }
    seen.add(key);
    rows.push(row);
  }

  const anomalies = rows.flatMap((row) => [
    anomalyFor(row, "projected_pitches", 15, 130),
    anomalyFor(row, "projected_innings", 0, 9),
    anomalyFor(row, "pitcher_k_pct", 0, 60),
    anomalyFor(row, "opponent_lineup_k_pct", 0, 60),
  ].filter((value): value is KlabAnomaly => value !== null));

  const outOfRangeRows = rows.filter((row) => String(row.game_date) < startDate || String(row.game_date) > endDate).length;
  const leakageColumns = KLAB_FEATURE_COLUMNS.filter((column) => POSTGAME_COLUMNS.has(column));
  const uniquePitchers = new Set(rows.map((row) => String(row.pitcher_id)));
  const candidatePitchers = new Set(sourceRows.map((row) => String(row.pitcher_id)));
  const uniqueGames = new Set(rangeGames.map((game) => String((game as any)?.id || game?.metadata?.id || "")).filter(Boolean));
  const outputFilename = `KLAB_PITCHER_TRAINING_DATASET_${startDate}_${endDate}.csv`;
  const historicalGames = [...snapshots.values()].filter((snapshot: any) => snapshot?.audit?.classification === "A");
  const gamesWithRows = new Set(sourceRows.map((row) => String(row.game_id)));
  const gamesWithActualK = new Set(rows.map((row) => String(row.game_id)));
  const historicalFunnel = historicalGames.length ? {
    manifestGames: historicalGames.length,
    snapshotsRecovered: historicalGames.length,
    validSnapshots: historicalGames.length,
    gamesWithFinalMatch: gamesWithRows.size,
    gamesWithActualK: gamesWithActualK.size,
    finalPitcherGameObservations: rows.length,
  } : null;

  return {
    rows,
    csv: toCsv(rows),
    report: {
      startDate, endDate, outputFilename,
      totalGames: uniqueGames.size,
      totalPitchers: uniquePitchers.size,
      candidatePitchers: candidatePitchers.size,
      candidateRows: sourceRows.length,
      finalRows: rows.length,
      observationsWithActualK: rows.length,
      discardedWithoutActualK,
      discardedInvalidActualK,
      duplicateKeys,
      outOfRangeRows,
      gamesWithoutPregameSnapshot,
      rowsWithPregameSnapshot: sourceRows.length,
      leakageColumns,
      anomalies,
      featureColumns: [...KLAB_FEATURE_COLUMNS, "side"],
      administrativeColumns: [...KLAB_ADMIN_COLUMNS],
      benchmarkColumns: [...KLAB_BENCHMARK_COLUMNS],
      targetColumns: [...KLAB_TARGET_COLUMNS],
      historicalFunnel,
    },
  };
}
