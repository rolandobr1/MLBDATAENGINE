import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase/app";
import { collection, doc, getDoc, getDocs, getFirestore, limit, orderBy, query } from "firebase/firestore";
import { buildKlabTrainingDataset } from "./klabTrainingDataset";
import { HISTORICAL_SNAPSHOT_PATH } from "./pregameSnapshots";
import type { MLBGame } from "../types";

const START_DATE = process.argv[2] || "2026-03-01";
const END_DATE = process.argv[3] || "2026-08-26";
const MANIFEST_PATH = path.join(process.cwd(), `datasets/klab/KLAB_PREGAME_MANIFEST_${START_DATE}_${END_DATE}.json`);
const REPORT_PATH = path.join(process.cwd(), `datasets/klab/KLAB_PREGAME_AUDIT_${START_DATE}_${END_DATE}.json`);

const app = initializeApp({
  apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "AIzaSyABTa7InfS8xP9PAVACYxzk9kktbGVcFvg",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "studio-207019270-ff455.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "studio-207019270-ff455",
  appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || "1:1013252985995:web:9eef813ce94382d7c4b08e",
});
const db = getFirestore(app);

type Side = "home" | "away";
type AuditRow = {
  game_id: string; game_date: string; scheduled_time: string; snapshot_captured_at: string;
  snapshot_status: string; classification: "A"; reason: string; source: "Firestore";
};

function gameId(game: any): string { return String(game?.id || game?.metadata?.id || ""); }
function pitcherId(pitcher: any): string | null {
  const value = pitcher?.pitcherId ?? pitcher?.mlbId ?? pitcher?.id;
  return value !== null && value !== undefined && value !== "" && Number(value) > 0 ? String(value) : null;
}
function finalStatus(game: any): boolean {
  return /(final|game over|completed)/i.test(String(game?.game_result?.gameStatus || ""));
}
function scheduledIso(date: string, time: string): string | null {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*ET/i);
  if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  const offset = date >= "2026-03-08" ? "-04:00" : "-05:00";
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${match[2]}:00${offset}`).toISOString();
}
function statusOf(snapshot: any): string {
  return String(snapshot?.game_result?.gameStatus ?? snapshot?.game_result?.status ?? snapshot?.status ?? "").trim();
}
function hasActual(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}
function hasPostgameEvidence(snapshot: any): boolean {
  if (/(in progress|live|final|game over|completed)/i.test(statusOf(snapshot))) return true;
  if (snapshot?.boxscore && Object.keys(snapshot.boxscore).length > 0) return true;
  return Object.values(snapshot?.advanced_pitching || {}).some((pitcher: any) => hasActual(pitcher?.actualStrikeouts));
}
function sanitizedPregameCopy(snapshot: any): MLBGame {
  const copy = structuredClone(snapshot);
  delete copy.game_result;
  delete copy.boxscore;
  delete copy.boxscore_stats;
  delete copy.liveBoxscore;
  delete copy.playByPlay;
  for (const side of ["home", "away"] as Side[]) {
    if (copy.advanced_pitching?.[side]) delete copy.advanced_pitching[side].actualStrikeouts;
  }
  return copy;
}
async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  let cursor = 0; const output = new Array<R>(items.length);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) { const index = cursor++; if (index >= items.length) return; output[index] = await fn(items[index]); }
  }));
  return output;
}
async function selectClearPregame(game: any) {
  const id = gameId(game); const localDate = String(game.metadata?.date || "");
  if (!id) return null;
  // Use the schedule frozen inside each candidate snapshot. The mutable local
  // game may have been refreshed with a changed time while a batch is running.
  const docs = await getDocs(query(collection(db, "games", id, "snapshots"), orderBy("timestamp", "asc"), limit(10)));
  for (const doc of docs.docs) {
    const snapshot: any = { ...doc.data(), timestamp: doc.data()?.timestamp || doc.id };
    const date = String(snapshot?.metadata?.date || localDate);
    const time = String(snapshot?.metadata?.time || "");
    const start = scheduledIso(date, time);
    if (!start || snapshot.timestamp >= start) continue;
    const status = statusOf(snapshot);
    if (!/^(scheduled|preview|pre[- ]?game|warmup)$/i.test(status)) continue;
    if (/postpon/i.test(status) || hasPostgameEvidence(snapshot) || String(snapshot?.metadata?.date || "") !== date) continue;
    return { snapshot, audit: { game_id: id, game_date: date, scheduled_time: time, snapshot_captured_at: snapshot.timestamp,
      snapshot_status: status, classification: "A" as const, reason: "timestamp anterior al inicio + estado pregame explícito + sin evidencia live/postgame", source: "Firestore" as const } };
  }
  return null;
}

async function selectFinalGame(game: any): Promise<any | null> {
  const id = gameId(game);
  const current = (await getDoc(doc(db, "games", id))).data();
  if (finalStatus(current)) return current;
  return finalStatus(game) ? game : null;
}

async function recoverFrozenManifest(): Promise<NonNullable<Awaited<ReturnType<typeof selectClearPregame>>>[] | null> {
  if (!process.argv.includes("--resume") || !fs.existsSync(MANIFEST_PATH)) return null;
  const frozen = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  return (await mapLimit((frozen.games || []) as AuditRow[], 12, async audit => {
    const snapshotDoc = await getDoc(doc(db, "games", audit.game_id, "snapshots", audit.snapshot_captured_at));
    return snapshotDoc.exists() ? { snapshot: { ...snapshotDoc.data(), timestamp: audit.snapshot_captured_at }, audit } : null;
  })).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof selectClearPregame>>>[];
}

async function main() {
  const local = JSON.parse(fs.readFileSync(path.join(process.cwd(), "mlb_database.json"), "utf8")) as Record<string, MLBGame[]>;
  const universe = Object.entries(local).filter(([date]) => date >= START_DATE && date <= END_DATE).flatMap(([, games]) => games);
  const unique = [...new Map(universe.map(game => [gameId(game), game])).values()].filter(game => gameId(game));
  const selected = await recoverFrozenManifest() ??
    (await mapLimit(unique, 12, selectClearPregame)).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof selectClearPregame>>>[];
  const finalByGame = new Map<string, any>();
  const finals = await mapLimit(selected, 12, async item => ({ id: item.audit.game_id, game: await selectFinalGame(item.snapshot) }));
  for (const item of finals) if (item.game) finalByGame.set(item.id, item.game);

  const manifest = { version: 1, created_at: new Date().toISOString(), start_date: START_DATE, end_date: END_DATE,
    selection_method: "A: pre-start timestamp, explicit pregame status, matching game date, no postgame evidence", games: selected.map(item => item.audit) };
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const postponedOrReprogrammed: any[] = [];
  const storeGames: Record<string, any> = {};
  for (const item of selected) {
    const final = finalByGame.get(item.audit.game_id) || unique.find(game => gameId(game) === item.audit.game_id) as any;
    const dateMatches = String(final?.metadata?.date || "") === item.audit.game_date;
    const timeMatches = String(final?.metadata?.time || "") === item.audit.scheduled_time;
    if (!dateMatches || !timeMatches || /postpon/i.test(String(final?.game_result?.gameStatus || ""))) {
      postponedOrReprogrammed.push({ ...item.audit, final_date: final?.metadata?.date, final_time: final?.metadata?.time, final_status: final?.game_result?.gameStatus });
      continue;
    }
    storeGames[item.audit.game_id] = { gameId: item.audit.game_id, gameDate: item.audit.game_date, capturedAt: item.audit.snapshot_captured_at,
      audit: item.audit, game: sanitizedPregameCopy(item.snapshot) };
  }
  fs.writeFileSync(HISTORICAL_SNAPSHOT_PATH, JSON.stringify({ version: 1, created_at: new Date().toISOString(), source: "Firestore", games: storeGames }, null, 2));

  const frozenFinalGames = selected.map(item => finalByGame.get(item.audit.game_id) || unique.find(game => gameId(game) === item.audit.game_id)).filter(Boolean) as MLBGame[];
  const dataset = buildKlabTrainingDataset(frozenFinalGames, START_DATE, END_DATE);
  const outputPath = path.join(process.cwd(), "datasets/ml", dataset.report.outputFilename);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, dataset.csv, "utf8");

  const matchedGames = new Set<string>(); const gamesWithActualK = new Set<string>();
  for (const item of selected) {
    const final: any = finalByGame.get(item.audit.game_id) || unique.find(game => gameId(game) === item.audit.game_id); if (!final || !finalStatus(final) || postponedOrReprogrammed.some(row => row.game_id === item.audit.game_id)) continue;
    let matched = false, hasK = false;
    for (const side of ["home", "away"] as Side[]) {
      const sid = pitcherId(item.snapshot?.pitchers?.[side]);
      const fid = pitcherId(final?.pitchers?.[side]) ?? pitcherId({ id: final?.boxscore_stats?.[side]?.playerId });
      if (!sid || sid !== fid) continue; matched = true;
      const value = final?.boxscore_stats?.[side]?.strikeOuts ?? final?.advanced_pitching?.[side]?.actualStrikeouts;
      if (hasActual(value) && Number(value) >= 0) hasK = true;
    }
    if (matched) matchedGames.add(item.audit.game_id); if (hasK) gamesWithActualK.add(item.audit.game_id);
  }
  const report = { start_date: START_DATE, end_date: END_DATE, universe_games_at_freeze: unique.length,
    funnel: { category_a_manifest: selected.length, snapshots_recovered: selected.length, snapshots_valid: Object.keys(storeGames).length,
      games_with_final_matching: matchedGames.size, games_with_actual_k: gamesWithActualK.size, final_pitcher_game_observations: dataset.rows.length },
    postponed_or_reprogrammed: postponedOrReprogrammed, dataset_report: dataset.report, files: { manifest: MANIFEST_PATH, snapshots: HISTORICAL_SNAPSHOT_PATH, csv: outputPath } };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
