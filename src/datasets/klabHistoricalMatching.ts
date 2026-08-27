import fs from "node:fs";
import path from "node:path";
import { KLAB_FEATURE_COLUMNS } from "./klabTrainingDataset";

type Side = "home" | "away";
type MatchStatus = "MATCHED" | "PITCHER_CHANGED" | "PREGAME_ID_MISSING" | "FINAL_ID_MISSING" | "IDENTITY_CONFLICT" | "NO_ACTUAL_K" | "POSTPONED" | "INVALID_SNAPSHOT" | "DUPLICATE";
type IdentitySource = "PITCHERS_PITCHER_ID" | "LINESCORE_DEFENSE_PITCHER" | "FINAL_PITCHERS_ID" | "FINAL_BOXSCORE_PLAYER_ID";
type Row = Record<string, string | number | boolean | null>;

const startDate = process.argv[2] || "2026-03-01";
const endDate = process.argv[3] || "2026-08-26";
const root = process.cwd();
const outputDir = path.join(root, "datasets", "klab");
const auditJsonPath = path.join(outputDir, `KLAB_PREGAME_FINAL_PITCHER_AUDIT_${startDate}_${endDate}.json`);
const auditCsvPath = path.join(outputDir, `KLAB_PREGAME_FINAL_PITCHER_AUDIT_${startDate}_${endDate}.csv`);
const matchedCsvPath = path.join(outputDir, `KLAB_PITCHER_TRAINING_DATASET_${startDate}_${endDate}.csv`);
const AUDIT_COLUMNS = ["game_id", "game_date", "side", "pregame_pitcher_name", "pregame_pitcher_id", "pregame_id_source", "pregame_id_confidence", "pregame_temporal_verification", "external_current_id_match", "final_pitcher_name", "final_pitcher_id", "final_id_source", "actual_k", "status", "snapshot_captured_at", "scheduled_start", "minutes_before_start", "identity_conflict_details", "change_detected", "target_source", "reason"];
const MATCHED_ADMIN_COLUMNS = ["game_id", "pitcher_id", "pitcher_name", "game_date", "snapshot_captured_at", "team", "opponent", "side", "match_status", "pregame_id_source", "pregame_id_confidence", "pregame_temporal_verification"];
const MATCHED_COLUMNS = [...MATCHED_ADMIN_COLUMNS, ...KLAB_FEATURE_COLUMNS, "projected_strikeouts", "actual_k"];

function csvValue(value: unknown): string { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function toCsv(columns: readonly string[], rows: Row[]): string { return [columns.join(","), ...rows.map(row => columns.map(column => csvValue(row[column])).join(","))].join("\n"); }
function gameId(game: any): string { return String(game?.id || game?.metadata?.id || ""); }
function validId(value: unknown): string | null { return value !== null && value !== undefined && value !== "" && Number(value) > 0 ? String(value) : null; }
function explicitPitcherId(pitcher: any): string | null { return validId(pitcher?.pitcherId ?? pitcher?.pitcher_id ?? pitcher?.mlbId ?? pitcher?.mlb_id ?? pitcher?.id); }
function validPitcherName(value: unknown): boolean { const name = String(value || "").trim().toLowerCase(); return name !== "" && name !== "tbd" && name !== "por definir" && name !== "n/a"; }
function isFinal(game: any): boolean { return /(final|game over|completed)/i.test(String(game?.game_result?.gameStatus || "")); }
function isPostponed(game: any): boolean { return /postpon/i.test(String(game?.game_result?.gameStatus || "")); }
function finiteActualK(value: unknown): number | null { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function scheduledStart(date: string, time: string): string | null {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*ET/i); if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  const offset = date >= "2026-03-08" ? "-04:00" : "-05:00";
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${match[2]}:00${offset}`).toISOString();
}
function zero(value: unknown): boolean { return value !== null && value !== undefined && Number(value) === 0; }
function verifiedLinescoreHomeId(snapshot: any, audit: any): string | null {
  const linescore = snapshot?.linescore; const defense = linescore?.defense?.pitcher;
  const id = validId(defense?.id); const start = scheduledStart(audit.game_date, audit.scheduled_time);
  if (!id || !defense?.fullName || defense.fullName !== snapshot?.pitchers?.home?.name) return null;
  if (linescore?.inningHalf !== "Top" || linescore?.isTopInning !== true) return null;
  if (!start || new Date(audit.snapshot_captured_at) >= new Date(start)) return null;
  if (!/^(Pre-Game|Warmup)$/i.test(String(audit.snapshot_status || ""))) return null;
  if (![linescore.balls, linescore.strikes, linescore.outs, linescore.homeTotals?.runs, linescore.homeTotals?.hits, linescore.awayTotals?.runs, linescore.awayTotals?.hits].every(zero)) return null;
  return id;
}
function pregameIdentity(snapshot: any, audit: any, side: Side): { id: string | null; source: IdentitySource | null } {
  const explicit = explicitPitcherId(snapshot?.pitchers?.[side]);
  if (explicit) return { id: explicit, source: "PITCHERS_PITCHER_ID" };
  if (side === "home") { const auxiliary = verifiedLinescoreHomeId(snapshot, audit); if (auxiliary) return { id: auxiliary, source: "LINESCORE_DEFENSE_PITCHER" }; }
  return { id: null, source: null };
}
function finalIdentity(final: any, side: Side): { id: string | null; name: string | null; source: IdentitySource | null; conflict: string | null } {
  const pitcherId = explicitPitcherId(final?.pitchers?.[side]);
  const boxId = validId(final?.boxscore_stats?.[side]?.playerId);
  if (boxId && pitcherId && boxId !== pitcherId) return { id: null, name: null, source: null, conflict: `boxscore_stats=${boxId}; pitchers=${pitcherId}` };
  if (boxId) return { id: boxId, name: final?.boxscore_stats?.[side]?.name ?? null, source: "FINAL_BOXSCORE_PLAYER_ID", conflict: null };
  if (pitcherId) return { id: pitcherId, name: final?.pitchers?.[side]?.name ?? null, source: "FINAL_PITCHERS_ID", conflict: null };
  return { id: null, name: final?.pitchers?.[side]?.name ?? final?.boxscore_stats?.[side]?.name ?? null, source: null, conflict: null };
}
function target(final: any, side: Side): number | null { return finiteActualK(final?.boxscore_stats?.[side]?.strikeOuts ?? final?.advanced_pitching?.[side]?.actualStrikeouts); }
function buildPregamePitcherFeatureRow(pregame: any, capturedAt: string, side: Side, id: string): Row {
  const pitcher = pregame?.pitchers?.[side] || {}; const opponent: Side = side === "home" ? "away" : "home";
  const adv = pregame?.advanced_pitching?.[side] || {}; const opp = pregame?.advanced_offense?.[opponent] || {};
  const fatigue = pregame?.fatigue_metrics?.pitchers?.[side] || {};
  return { game_id: gameId(pregame), pitcher_id: id, side, snapshot_captured_at: capturedAt, game_date: pregame.metadata?.date ?? null,
    team: pregame.metadata?.[side === "home" ? "homeTeam" : "awayTeam"] ?? null, opponent: pregame.metadata?.[opponent === "home" ? "homeTeam" : "awayTeam"] ?? null,
    pitcher_k_pct: pitcher.kPct ?? null, pitcher_so_rate: adv.strikeoutRate ?? null, pitcher_swstr_pct: adv.swingingStrikePct ?? null,
    pitcher_csw_pct: adv.cswPct ?? null, pitcher_bb_pct: pitcher.bbPct ?? null, pitcher_fip: adv.fip ?? null, pitcher_xfip: adv.xFip ?? null,
    pitcher_siera: adv.siera ?? null, pitcher_xera: adv.xEra ?? null, pitcher_last5_ks_avg: adv.last5KsAvg ?? null,
    pitcher_last5_ip_avg: adv.last5IpAvg ?? null, pitcher_last5_bf_avg: adv.last5BfAvg ?? null,
    pitcher_last5_pitch_count_avg: adv.last5PitchCountAvg ?? null, projected_pitches: adv.projectedPitchCount ?? null,
    projected_innings: adv.projectedInnings ?? null, pitches_last_start: fatigue.pitchesLastStart ?? null,
    pitches_last_3_starts: fatigue.pitchesLast3Starts ?? null, days_since_last_start: fatigue.daysSinceLastStart ?? null,
    opponent_lineup_k_pct: opp.projectedLineupKPct ?? null, opponent_offense_ops: pregame.offense?.[opponent]?.ops ?? null,
    opponent_offense_woba: opp.wOba ?? null, opponent_offense_xwoba: opp.xwOba ?? null, park_factor_k: pregame.park_factors?.index_so ?? null,
    weather_temp: pregame.weather?.temp ?? null, weather_wind_speed: pregame.weather?.windSpeed ?? null,
    projected_strikeouts: adv.projectedStrikeoutsBase ?? null };
}

function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) throw new Error("Rango inválido");
  const store = JSON.parse(fs.readFileSync(path.join(root, "mlb_pregame_training_snapshots.json"), "utf8"));
  const database = JSON.parse(fs.readFileSync(path.join(root, "mlb_database.json"), "utf8"));
  const finalById = new Map<string, any>();
  for (const game of Object.values(database).flat() as any[]) {
    const id = gameId(game); if (!id) continue; const previous = finalById.get(id);
    if (!previous || (!isFinal(previous) && isFinal(game))) finalById.set(id, game);
  }
  const snapshots = Object.values(store.games || {}).filter((entry: any) => entry?.audit?.classification === "A" && entry.gameDate >= startDate && entry.gameDate <= endDate) as any[];
  const auditRows: Row[] = []; const matchedRows: Row[] = []; let homeProcessed = 0; let awayProcessed = 0;
  for (const entry of snapshots) {
    const snapshot = entry.game; const audit = entry.audit; const final = finalById.get(String(entry.gameId));
    for (const side of ["home", "away"] as Side[]) {
      const announced = snapshot?.pitchers?.[side] || {};
      if (side === "home") homeProcessed++; else awayProcessed++;
      const pre = pregameIdentity(snapshot, audit, side); const fin = finalIdentity(final, side);
      const start = scheduledStart(audit.game_date, audit.scheduled_time);
      const minutes = start ? (new Date(start).getTime() - new Date(audit.snapshot_captured_at).getTime()) / 60000 : null;
      const snapshotValid = audit?.classification === "A" && String(entry.gameId) === gameId(snapshot) && audit.game_date === snapshot?.metadata?.date && Boolean(start) && new Date(audit.snapshot_captured_at) < new Date(start!);
      const namesChanged = validPitcherName(announced.name) && validPitcherName(fin.name) && announced.name !== fin.name;
      let status: MatchStatus; let actualK: number | null = null; let targetSource: string | null = null; let reason: string;
      if (!snapshotValid) { status = "INVALID_SNAPSHOT"; reason = "El snapshot no supera clasificación, game_id, fecha o temporalidad pregame"; }
      else if (isPostponed(final)) { status = "POSTPONED"; reason = "El documento persistente indica juego pospuesto"; }
      else if (!final || !isFinal(final)) { status = "FINAL_ID_MISSING"; reason = "No existe documento final válido para el game_id"; }
      else if (fin.conflict) { status = "IDENTITY_CONFLICT"; reason = "Las fuentes explícitas de identidad final contienen IDs diferentes"; }
      else if (namesChanged && (!pre.id || !fin.id || pre.id !== fin.id)) { status = "PITCHER_CHANGED"; reason = "El pitcher anunciado y el participante final del mismo lado son personas diferentes"; }
      else if (!pre.id) { status = "PREGAME_ID_MISSING"; reason = "El snapshot no contiene ID explícito ni ID auxiliar verificable para este lado"; }
      else if (!fin.id) { status = "FINAL_ID_MISSING"; reason = "El documento final no contiene un ID seguro para este lado"; }
      else if (pre.id !== fin.id) { status = "PITCHER_CHANGED"; reason = "pregame_pitcher_id difiere de final_pitcher_id"; }
      else {
        actualK = target(final, side);
        if (actualK === null) { status = "NO_ACTUAL_K"; reason = "Identidad coincidente, pero actual_k no es válido"; }
        else { status = "MATCHED"; targetSource = final?.boxscore_stats?.[side]?.strikeOuts !== null && final?.boxscore_stats?.[side]?.strikeOuts !== undefined ? "FINAL_BOXSCORE_STRIKEOUTS" : "FINAL_ADVANCED_PITCHING_ACTUAL_STRIKEOUTS"; reason = "game_id y pitcher_id coinciden; actual_k final válido"; }
      }
      auditRows.push({ game_id: String(entry.gameId), game_date: audit.game_date, side, pregame_pitcher_name: announced.name ?? null,
        pregame_pitcher_id: pre.id, pregame_id_source: pre.source,
        pregame_id_confidence: pre.id ? "HIGH" : null,
        pregame_temporal_verification: pre.source === "LINESCORE_DEFENSE_PITCHER" ? "NOT_VERIFIABLE" : null,
        external_current_id_match: pre.source === "LINESCORE_DEFENSE_PITCHER" ? true : null,
        final_pitcher_name: fin.name, final_pitcher_id: fin.id,
        final_id_source: fin.source, actual_k: actualK, status, snapshot_captured_at: audit.snapshot_captured_at,
        scheduled_start: start, minutes_before_start: minutes === null ? null : +minutes.toFixed(6), identity_conflict_details: fin.conflict,
        change_detected: status === "PITCHER_CHANGED", target_source: targetSource, reason });
      if (status === "MATCHED" && pre.id && actualK !== null) {
        const features = buildPregamePitcherFeatureRow(snapshot, audit.snapshot_captured_at, side, pre.id);
        const source = { ...features, pitcher_name: announced.name, match_status: status, pregame_id_source: pre.source,
          pregame_id_confidence: "HIGH", pregame_temporal_verification: pre.source === "LINESCORE_DEFENSE_PITCHER" ? "NOT_VERIFIABLE" : null, actual_k: actualK } as Row;
        const row: Row = {}; for (const column of MATCHED_COLUMNS) row[column] = source[column] ?? null; matchedRows.push(row);
      }
    }
  }
  const matchedKeyCounts = new Map<string, number>();
  for (const row of matchedRows) { const key = `${row.game_id}:${row.pitcher_id}`; matchedKeyCounts.set(key, (matchedKeyCounts.get(key) || 0) + 1); }
  const duplicateKeys = [...matchedKeyCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  if (duplicateKeys.length) {
    for (const row of auditRows) if (row.status === "MATCHED" && duplicateKeys.includes(`${row.game_id}:${row.pregame_pitcher_id}`)) {
      row.status = "DUPLICATE"; row.actual_k = null; row.reason = "Más de una observación final comparte game_id + pitcher_id";
    }
  }
  const outOfRange = matchedRows.filter(row => String(row.game_date) < startDate || String(row.game_date) > endDate).length;
  const leakageColumns = KLAB_FEATURE_COLUMNS.filter(column => ["actual_k", "match_status", "final_pitcher_id"].includes(column));
  const identityMismatchRows = auditRows.filter(row => row.status === "MATCHED" && row.pregame_pitcher_id !== row.final_pitcher_id).length;
  const invalidActualKRows = matchedRows.filter(row => !Number.isFinite(Number(row.actual_k)) || Number(row.actual_k) < 0).length;
  const invalidTemporalRows = auditRows.filter(row => row.status === "MATCHED" && (!row.scheduled_start || new Date(String(row.snapshot_captured_at)) >= new Date(String(row.scheduled_start)))).length;
  const changedWithTargetRows = auditRows.filter(row => row.status === "PITCHER_CHANGED" && row.actual_k !== null).length;
  const statuses = ["MATCHED", "PITCHER_CHANGED", "PREGAME_ID_MISSING", "FINAL_ID_MISSING", "IDENTITY_CONFLICT", "NO_ACTUAL_K", "POSTPONED", "INVALID_SNAPSHOT", "DUPLICATE"];
  const counts = Object.fromEntries(statuses.map(status => [status, auditRows.filter(row => row.status === status).length]));
  const report = { version: 1, created_at: new Date().toISOString(), start_date: startDate, end_date: endDate,
    funnel: { snapshots_pregame_initial: snapshots.length, pitcher_candidates: auditRows.length, pitchers_with_pregame_id: auditRows.filter(row => row.pregame_pitcher_id).length,
      pitchers_with_final_id: auditRows.filter(row => row.final_pitcher_id && row.status !== "FINAL_ID_MISSING").length, ...counts, final_valid_observations: matchedRows.length },
    process: { games_processed: snapshots.length, home_pitchers_processed: homeProcessed, away_pitchers_processed: awayProcessed,
      matched_rows: counts.MATCHED, pitcher_changed_rows: counts.PITCHER_CHANGED, discarded_rows: auditRows.length - matchedRows.length,
      final_rows_with_actual_k: matchedRows.length, games_represented: new Set(matchedRows.map(row => String(row.game_id))).size,
      pitchers_represented: new Set(matchedRows.map(row => String(row.pitcher_id))).size },
    validations: { duplicate_keys: duplicateKeys, duplicate_count: duplicateKeys.length, out_of_range_rows: outOfRange, leakage_columns: leakageColumns,
      identity_mismatch_rows: identityMismatchRows, invalid_actual_k_rows: invalidActualKRows, invalid_temporal_rows: invalidTemporalRows,
      pitcher_changed_with_target_rows: changedWithTargetRows, features_source: "mlb_pregame_training_snapshots.json", target_source: "mlb_database.json final only" },
    identity_source_counts: { pregame_explicit: auditRows.filter(row => row.pregame_id_source === "PITCHERS_PITCHER_ID").length,
      pregame_linescore: auditRows.filter(row => row.pregame_id_source === "LINESCORE_DEFENSE_PITCHER").length,
      pregame_missing: auditRows.filter(row => !row.pregame_pitcher_id).length,
      final_boxscore: auditRows.filter(row => row.final_id_source === "FINAL_BOXSCORE_PLAYER_ID").length,
      final_pitchers: auditRows.filter(row => row.final_id_source === "FINAL_PITCHERS_ID").length },
    case_822705: auditRows.filter(row => row.game_id === "822705"), examples: { matched: auditRows.filter(row => row.status === "MATCHED").slice(0, 10),
      pitcher_changed: auditRows.filter(row => row.status === "PITCHER_CHANGED").slice(0, 10), pregame_id_missing: auditRows.filter(row => row.status === "PREGAME_ID_MISSING").slice(0, 10),
      final_id_missing: auditRows.filter(row => row.status === "FINAL_ID_MISSING").slice(0, 10), identity_conflict: auditRows.filter(row => row.status === "IDENTITY_CONFLICT").slice(0, 10) },
    files: { audit_json: auditJsonPath, audit_csv: auditCsvPath, matched_csv: matchedCsvPath }, rows: auditRows };
  fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(auditJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(auditCsvPath, toCsv(AUDIT_COLUMNS, auditRows));
  if (duplicateKeys.length) throw new Error(`Generación detenida: duplicados game_id + pitcher_id: ${duplicateKeys.join(", ")}`);
  fs.writeFileSync(matchedCsvPath, toCsv(MATCHED_COLUMNS, matchedRows));
  console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
}

main();
