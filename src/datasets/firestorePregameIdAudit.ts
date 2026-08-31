import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Side = "home" | "away";
type Classification = "VERIFIED" | "HIGH_BUT_NOT_TEMPORALLY_VERIFIED" | "AMBIGUOUS" | "NO_EVIDENCE";

type MissingRow = {
  game_id: string;
  game_date: string;
  side: Side;
  pregame_pitcher_name: string | null;
  scheduled_start: string;
};

type Evidence = {
  game_id: string;
  side: Side;
  pitcher_id: string;
  pitcher_name: string | null;
  snapshot_timestamp: string | null;
  scheduled_start: string;
  game_status: string | null;
  source: "PITCHERS_PITCHER_ID" | "LINESCORE_DEFENSE_PITCHER";
  evidence_reason: string;
  temporally_verified: boolean;
};

type AuditRow = MissingRow & {
  classification: Classification;
  pitcher_id: string | null;
  pitcher_name: string | null;
  snapshot_timestamp: string | null;
  game_status: string | null;
  source: Evidence["source"] | null;
  evidence_reason: string;
  evidence_count: number;
  distinct_ids: string;
  change_detected: boolean;
  identity_conflict: boolean;
};

type GameResult = {
  game_id: string;
  snapshots_examined: number;
  valid_pregame_snapshots: number;
  explicit_evidence_count: number;
  linescore_evidence_count: number;
  rows: AuditRow[];
};

type Manifest = {
  version: 1;
  created_at: string;
  updated_at: string;
  start_date: string;
  end_date: string;
  source_audit: string;
  firestore_mode: "REST_FIELD_MASK_READ_ONLY";
  batch_size: number;
  pause_ms: number;
  max_retries: number;
  target_rows: number;
  target_game_ids: number;
  processed_game_ids: string[];
  pending_game_ids: string[];
  retry_events: Array<{ game_id: string; attempt: number; status: number | null; backoff_ms: number; message: string; at: string }>;
  errors: Array<{ game_id: string; attempts: number; status: number | null; message: string; at: string }>;
  results: Record<string, GameResult>;
  complete: boolean;
};

const root = process.cwd();
const args = process.argv.slice(2);
const startDate = args.find(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || "2026-03-01";
const endDate = args.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))[1] || "2026-08-26";
const resume = args.includes("--resume");
const reportOnly = args.includes("--report-only");
const numberArg = (name: string, fallback: number) => {
  const direct = args.find(value => value.startsWith(`${name}=`));
  const index = args.indexOf(name);
  const raw = direct?.slice(name.length + 1) ?? (index >= 0 ? args[index + 1] : undefined);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};
const batchSize = numberArg("--batch-size", 6);
const pauseMs = numberArg("--pause-ms", 1500);
const maxRetries = numberArg("--max-retries", 5);

const outputDir = path.join(root, "datasets", "klab");
const sourceAuditPath = path.join(outputDir, `KLAB_PREGAME_FINAL_PITCHER_AUDIT_${startDate}_${endDate}.json`);
const jsonPath = path.join(outputDir, `KLAB_FIRESTORE_PREGAME_ID_AUDIT_${startDate}_${endDate}.json`);
const csvPath = path.join(outputDir, `KLAB_FIRESTORE_PREGAME_ID_AUDIT_${startDate}_${endDate}.csv`);
const manifestPath = path.join(outputDir, `KLAB_FIRESTORE_PREGAME_ID_AUDIT_MANIFEST_${startDate}_${endDate}.json`);
const historicalSnapshotPath = path.join(root, "mlb_pregame_training_snapshots.json");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "studio-207019270-ff455";
const API_KEY = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "AIzaSyABTa7InfS8xP9PAVACYxzk9kktbGVcFvg";
const FIELD_MASKS = [
  "timestamp", "game_status", "gameStatus", "status", "game_result.gameStatus",
  "metadata.date", "metadata.homeTeam", "metadata.awayTeam",
  "pitchers.home.name", "pitchers.home.pitcherId", "pitchers.away.name", "pitchers.away.pitcherId",
  "linescore.inningHalf", "linescore.isTopInning", "linescore.defense.pitcher.id", "linescore.defense.pitcher.fullName",
  "linescore.homeTotals.runs", "linescore.homeTotals.hits", "linescore.awayTotals.runs", "linescore.awayTotals.hits",
  "linescore.balls", "linescore.strikes", "linescore.outs", "balls", "strikes", "outs",
];

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
function atomicWrite(filePath: string, value: unknown) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, filePath);
}
function validId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value);
  return Number(id) > 0 ? id : null;
}
function exactName(a: unknown, b: unknown): boolean {
  return typeof a === "string" && a.length > 0 && a === b;
}
function zero(value: unknown): boolean { return value !== null && value !== undefined && Number(value) === 0; }
function statusOf(snapshot: any): string | null {
  const value = snapshot?.game_status ?? snapshot?.gameStatus ?? snapshot?.status ?? snapshot?.game_result?.gameStatus;
  return value === null || value === undefined || value === "" ? null : String(value);
}
function timestampOf(snapshot: any): string | null {
  const value = snapshot?.timestamp ?? snapshot?.__document_id;
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function decodeFirestoreValue(value: any): any {
  if (!value || typeof value !== "object") return value;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue?.fields || {});
  if ("arrayValue" in value) return (value.arrayValue?.values || []).map(decodeFirestoreValue);
  return null;
}
function decodeFirestoreFields(fields: Record<string, any>): any {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}
function decodeDocument(document: any): any {
  const decoded = decodeFirestoreFields(document?.fields || {});
  decoded.__document_id = String(document?.name || "").split("/").pop() || null;
  return decoded;
}

function expectedGameMetadata(gameId: string, historical: any): { date: string; homeTeam: string; awayTeam: string } | null {
  const game = historical?.games?.[gameId]?.game;
  if (!game?.metadata) return null;
  return { date: String(game.metadata.date || ""), homeTeam: String(game.metadata.homeTeam || ""), awayTeam: String(game.metadata.awayTeam || "") };
}
function correspondsToGame(snapshot: any, expected: ReturnType<typeof expectedGameMetadata>): boolean {
  if (!expected) return false;
  return String(snapshot?.metadata?.date || "") === expected.date &&
    String(snapshot?.metadata?.homeTeam || "") === expected.homeTeam &&
    String(snapshot?.metadata?.awayTeam || "") === expected.awayTeam;
}

export function extractEvidence(gameId: string, targets: MissingRow[], snapshots: any[], expected: ReturnType<typeof expectedGameMetadata>): GameResult {
  const scheduledStart = targets[0].scheduled_start;
  const startMs = new Date(scheduledStart).getTime();
  const validPregame = snapshots.filter(snapshot => {
    const timestamp = timestampOf(snapshot);
    return timestamp !== null && new Date(timestamp).getTime() < startMs && correspondsToGame(snapshot, expected);
  });
  const rows = targets.map(target => {
    const evidence: Evidence[] = [];
    const unverifiedExplicit: Evidence[] = [];
    for (const snapshot of snapshots) {
      if (!correspondsToGame(snapshot, expected)) continue;
      const timestamp = timestampOf(snapshot);
      const temporallyVerified = timestamp !== null && new Date(timestamp).getTime() < startMs;
      const pitcher = snapshot?.pitchers?.[target.side] || {};
      const explicitId = validId(pitcher.pitcherId);
      if (explicitId) {
        const item: Evidence = { game_id: gameId, side: target.side, pitcher_id: explicitId, pitcher_name: pitcher.name ?? null,
          snapshot_timestamp: timestamp, scheduled_start: scheduledStart, game_status: statusOf(snapshot), source: "PITCHERS_PITCHER_ID",
          evidence_reason: temporallyVerified ? "ID explícito presente en snapshot del juego capturado antes del inicio" : "ID explícito presente, pero sin evidencia temporal pregame válida",
          temporally_verified: temporallyVerified };
        (temporallyVerified ? evidence : unverifiedExplicit).push(item);
      }
      if (target.side !== "home" || !temporallyVerified) continue;
      const linescore = snapshot?.linescore || {};
      const defense = linescore?.defense?.pitcher || {};
      const linescoreId = validId(defense.id);
      const counters = [linescore.balls ?? snapshot?.balls, linescore.strikes ?? snapshot?.strikes, linescore.outs ?? snapshot?.outs,
        linescore?.homeTotals?.runs, linescore?.homeTotals?.hits, linescore?.awayTotals?.runs, linescore?.awayTotals?.hits];
      if (linescoreId && /^(Pre-Game|Warmup)$/i.test(String(statusOf(snapshot) || "")) && linescore.inningHalf === "Top" &&
          linescore.isTopInning === true && exactName(defense.fullName, snapshot?.pitchers?.home?.name) && counters.every(zero)) {
        evidence.push({ game_id: gameId, side: "home", pitcher_id: linescoreId, pitcher_name: defense.fullName,
          snapshot_timestamp: timestamp, scheduled_start: scheduledStart, game_status: statusOf(snapshot), source: "LINESCORE_DEFENSE_PITCHER",
          evidence_reason: "Linescore HOME cumple estado pregame, mitad Top, nombre exacto y marcador/conteo en cero", temporally_verified: true });
      }
    }
    const verifiedIds = [...new Set(evidence.map(item => item.pitcher_id))];
    const unverifiedIds = [...new Set(unverifiedExplicit.map(item => item.pitcher_id))];
    let classification: Classification = "NO_EVIDENCE";
    let selected: Evidence | undefined;
    let reason = "No se encontró ID explícito pregame ni linescore HOME que cumpla todas las reglas";
    if (verifiedIds.length > 1) {
      classification = "AMBIGUOUS"; reason = `Snapshots pregame contienen IDs diferentes: ${verifiedIds.join("|")}`;
    } else if (verifiedIds.length === 1) {
      classification = "VERIFIED";
      selected = evidence.find(item => item.pitcher_id === verifiedIds[0] && item.source === "PITCHERS_PITCHER_ID") ?? evidence.find(item => item.pitcher_id === verifiedIds[0]);
      reason = selected!.evidence_reason;
    } else if (unverifiedIds.length > 1) {
      classification = "AMBIGUOUS"; reason = `Evidencia no temporal contiene IDs diferentes: ${unverifiedIds.join("|")}`;
    } else if (unverifiedIds.length === 1) {
      classification = "HIGH_BUT_NOT_TEMPORALLY_VERIFIED"; selected = unverifiedExplicit[0]; reason = selected.evidence_reason;
    }
    const allIds = [...new Set([...verifiedIds, ...unverifiedIds])];
    return { ...target, classification, pitcher_id: selected?.pitcher_id ?? null, pitcher_name: selected?.pitcher_name ?? target.pregame_pitcher_name,
      snapshot_timestamp: selected?.snapshot_timestamp ?? null, game_status: selected?.game_status ?? null, source: selected?.source ?? null,
      evidence_reason: reason, evidence_count: evidence.length + unverifiedExplicit.length, distinct_ids: allIds.join("|"),
      change_detected: verifiedIds.length > 1, identity_conflict: allIds.length > 1 };
  });
  return { game_id: gameId, snapshots_examined: snapshots.length, valid_pregame_snapshots: validPregame.length,
    explicit_evidence_count: rows.filter(row => row.source === "PITCHERS_PITCHER_ID" && row.classification === "VERIFIED").length,
    linescore_evidence_count: rows.filter(row => row.source === "LINESCORE_DEFENSE_PITCHER" && row.classification === "VERIFIED").length, rows };
}

async function fetchSnapshots(gameId: string): Promise<any[]> {
  const documents: any[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/games/${encodeURIComponent(gameId)}/snapshots`);
    url.searchParams.set("key", API_KEY); url.searchParams.set("pageSize", "100");
    for (const field of FIELD_MASKS) url.searchParams.append("mask.fieldPaths", field);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      const error: any = new Error(`Firestore ${response.status}: ${body.slice(0, 500)}`); error.status = response.status; throw error;
    }
    const payload: any = await response.json();
    documents.push(...(payload.documents || []).map(decodeDocument));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return documents;
}

async function fetchWithBackoff(gameId: string, onRetry: (event: Manifest["retry_events"][number]) => void): Promise<{ snapshots?: any[]; error?: Manifest["errors"][number] }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return { snapshots: await fetchSnapshots(gameId) }; }
    catch (error: any) {
      const status = Number(error?.status) || null;
      if (attempt === maxRetries) return { error: { game_id: gameId, attempts: attempt, status, message: String(error?.message || error), at: new Date().toISOString() } };
      const backoff = Math.min(60_000, 1_500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      onRetry({ game_id: gameId, attempt, status, backoff_ms: backoff, message: String(error?.message || error).slice(0, 500), at: new Date().toISOString() });
      console.warn(`[K-Lab Audit] ${gameId} intento ${attempt}/${maxRetries}, status=${status ?? "network"}; pausa ${backoff}ms`);
      await sleep(backoff);
    }
  }
  return {};
}

function csvValue(value: unknown): string { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
const CSV_COLUMNS: Array<keyof AuditRow> = ["game_id", "game_date", "side", "pregame_pitcher_name", "classification", "pitcher_id", "pitcher_name",
  "snapshot_timestamp", "scheduled_start", "game_status", "source", "evidence_reason", "evidence_count", "distinct_ids", "change_detected", "identity_conflict"];
function writeFinalArtifacts(manifest: Manifest, targets: MissingRow[]) {
  const rows = Object.values(manifest.results).flatMap(result => result.rows).sort((a, b) => a.game_id.localeCompare(b.game_id) || a.side.localeCompare(b.side));
  const counts = Object.fromEntries((["VERIFIED", "HIGH_BUT_NOT_TEMPORALLY_VERIFIED", "AMBIGUOUS", "NO_EVIDENCE"] as Classification[])
    .map(status => [status, rows.filter(row => row.classification === status).length]));
  const verified = rows.filter(row => row.classification === "VERIFIED");
  const duplicateKeys = rows.map(row => `${row.game_id}:${row.side}`).filter((key, index, all) => all.indexOf(key) !== index);
  const report = { version: 1, created_at: new Date().toISOString(), read_only_firestore: true, start_date: startDate, end_date: endDate,
    methodology: { target: "Sólo filas PREGAME_ID_MISSING del audit previo", global_collection_scan: false, postgame_sources_used: false,
      name_to_id_matching: false, field_mask: FIELD_MASKS, identity_priority: ["PITCHERS_PITCHER_ID", "LINESCORE_DEFENSE_PITCHER_HOME_STRICT"] },
    summary: { target_rows_before: targets.length, target_game_ids: new Set(targets.map(row => row.game_id)).size,
      game_ids_processed: manifest.processed_game_ids.length, game_ids_pending: manifest.pending_game_ids.length,
      snapshots_examined: Object.values(manifest.results).reduce((sum, result) => sum + result.snapshots_examined, 0),
      valid_pregame_snapshots: Object.values(manifest.results).reduce((sum, result) => sum + result.valid_pregame_snapshots, 0),
      explicit_ids_found: rows.filter(row => row.source === "PITCHERS_PITCHER_ID").length,
      temporally_verified_explicit_ids: verified.filter(row => row.source === "PITCHERS_PITCHER_ID").length,
      linescore_ids_recovered: verified.filter(row => row.source === "LINESCORE_DEFENSE_PITCHER").length,
      new_home_ids: verified.filter(row => row.side === "home").length, new_away_ids: verified.filter(row => row.side === "away").length,
      ...counts, pitcher_changes_detected: rows.filter(row => row.change_detected).length, duplicates: duplicateKeys.length,
      identity_conflicts: rows.filter(row => row.identity_conflict).length,
      retry_events: manifest.retry_events.length, rate_limit_429_events: manifest.retry_events.filter(event => event.status === 429).length,
      coverage_before: { verified_rows: 265, home: 260, away: 5, missing_identity_rows: targets.length },
      potential_coverage_after_review: { verified_rows: 265 + verified.length, home: 260 + verified.filter(row => row.side === "home").length,
        away: 5 + verified.filter(row => row.side === "away").length, remaining_missing_identity_rows: targets.length - verified.length } },
    pending_game_ids: manifest.pending_game_ids, errors: manifest.errors, duplicate_keys: duplicateKeys, rows };
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(csvPath, [CSV_COLUMNS.join(","), ...rows.map(row => CSV_COLUMNS.map(column => csvValue(row[column])).join(","))].join("\n"), "utf8");
  console.log(JSON.stringify({ files: { json: jsonPath, csv: csvPath, manifest: manifestPath }, summary: report.summary }, null, 2));
}

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) throw new Error("Rango inválido");
  if (!fs.existsSync(sourceAuditPath) || !fs.existsSync(historicalSnapshotPath)) throw new Error("Faltan los artefactos fuente de auditoría histórica");
  if (!resume && (fs.existsSync(manifestPath) || fs.existsSync(jsonPath) || fs.existsSync(csvPath))) {
    throw new Error("Los artefactos de esta auditoría ya existen; use --resume para continuar sin sobrescribir el progreso");
  }
  const source = JSON.parse(fs.readFileSync(sourceAuditPath, "utf8"));
  const historical = JSON.parse(fs.readFileSync(historicalSnapshotPath, "utf8"));
  const targets: MissingRow[] = (source.rows || []).filter((row: any) => row.status === "PREGAME_ID_MISSING").map((row: any): MissingRow => ({
    game_id: String(row.game_id), game_date: String(row.game_date), side: row.side, pregame_pitcher_name: row.pregame_pitcher_name ?? null,
    scheduled_start: new Date(row.scheduled_start).toISOString(),
  }));
  if (targets.length !== 864) throw new Error(`El universo cambió: se esperaban 864 casos y se encontraron ${targets.length}`);
  const targetIds: string[] = [...new Set(targets.map(row => row.game_id))].sort();
  let manifest: Manifest;
  if (resume) {
    if (!fs.existsSync(manifestPath)) throw new Error("No existe manifest para reanudar");
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.start_date !== startDate || manifest.end_date !== endDate || manifest.target_rows !== targets.length) throw new Error("El manifest no corresponde al universo solicitado");
    manifest.retry_events ||= []; manifest.batch_size = batchSize; manifest.pause_ms = pauseMs; manifest.max_retries = maxRetries; manifest.complete = false;
  } else {
    manifest = { version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), start_date: startDate, end_date: endDate,
      source_audit: sourceAuditPath, firestore_mode: "REST_FIELD_MASK_READ_ONLY", batch_size: batchSize, pause_ms: pauseMs, max_retries: maxRetries,
      target_rows: targets.length, target_game_ids: targetIds.length, processed_game_ids: [], pending_game_ids: targetIds, retry_events: [], errors: [], results: {}, complete: false };
    fs.mkdirSync(outputDir, { recursive: true }); atomicWrite(manifestPath, manifest);
  }
  if (reportOnly) {
    manifest.updated_at = new Date().toISOString(); atomicWrite(manifestPath, manifest);
    writeFinalArtifacts(manifest, targets);
    return;
  }
  const processed = new Set(manifest.processed_game_ids);
  const work = targetIds.filter(id => !processed.has(id));
  for (let offset = 0; offset < work.length; offset += batchSize) {
    const batch = work.slice(offset, offset + batchSize);
    for (const gameId of batch) {
      const response = await fetchWithBackoff(gameId, event => {
        manifest.retry_events.push(event); manifest.updated_at = new Date().toISOString(); atomicWrite(manifestPath, manifest);
      });
      if (response.error) { manifest.errors = manifest.errors.filter(item => item.game_id !== gameId); manifest.errors.push(response.error); continue; }
      const gameTargets = targets.filter(row => row.game_id === gameId);
      manifest.results[gameId] = extractEvidence(gameId, gameTargets, response.snapshots || [], expectedGameMetadata(gameId, historical));
      processed.add(gameId);
    }
    manifest.processed_game_ids = [...processed].sort();
    manifest.pending_game_ids = targetIds.filter(id => !processed.has(id));
    manifest.updated_at = new Date().toISOString(); atomicWrite(manifestPath, manifest);
    console.log(`[K-Lab Audit] procesados=${manifest.processed_game_ids.length}/${targetIds.length}; pendientes=${manifest.pending_game_ids.length}`);
    if (offset + batchSize < work.length) await sleep(pauseMs);
  }
  manifest.complete = manifest.pending_game_ids.length === 0; manifest.updated_at = new Date().toISOString(); atomicWrite(manifestPath, manifest);
  writeFinalArtifacts(manifest, targets);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1; });
