import fs from "fs";
import path from "path";
import { MLBGame } from "../types";

export interface PregameSnapshot {
  gameId: string;
  gameDate: string;
  capturedAt: string;
  game: MLBGame;
}

export interface HistoricalPregameSnapshot extends PregameSnapshot {
  audit: {
    game_id: string;
    game_date: string;
    scheduled_time: string;
    snapshot_captured_at: string;
    snapshot_status: string;
    classification: "A";
    reason: string;
    source: "Firestore";
  };
}

interface SnapshotStore {
  version: 1;
  games: Record<string, PregameSnapshot>;
}

const SNAPSHOT_PATH = path.join(process.cwd(), "mlb_pregame_snapshots.json");
export const HISTORICAL_SNAPSHOT_PATH = path.join(process.cwd(), "mlb_pregame_training_snapshots.json");

function readStore(): SnapshotStore {
  try {
    if (!fs.existsSync(SNAPSHOT_PATH)) return { version: 1, games: {} };
    const parsed = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
    return { version: 1, games: parsed?.games || {} };
  } catch (error) {
    console.error("Error reading pregame snapshots:", error);
    return { version: 1, games: {} };
  }
}

function readHistoricalStore(): SnapshotStore {
  try {
    if (!fs.existsSync(HISTORICAL_SNAPSHOT_PATH)) return { version: 1, games: {} };
    const parsed = JSON.parse(fs.readFileSync(HISTORICAL_SNAPSHOT_PATH, "utf-8"));
    return { version: 1, games: parsed?.games || {} };
  } catch (error) {
    console.error("Error reading historical pregame snapshots:", error);
    return { version: 1, games: {} };
  }
}

function writeStore(store: SnapshotStore) {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(store, null, 2));
}

function isFinalStatus(status: unknown): boolean {
  const normalized = String(status || "").toLowerCase();
  return normalized.includes("final") || normalized === "game over" || normalized === "completed early" || normalized === "completed";
}

function createPregameGameCopy(game: MLBGame): MLBGame {
  const copy = JSON.parse(JSON.stringify(game)) as MLBGame;
  // Never preserve outcomes or live boxscore data in the feature snapshot.
  delete (copy as any).game_result;
  delete (copy as any).boxscore_stats;
  delete (copy as any).liveBoxscore;
  delete (copy as any).playByPlay;
  for (const side of ["home", "away"] as const) {
    if (copy.advanced_pitching?.[side]) {
      delete (copy.advanced_pitching[side] as any).actualStrikeouts;
    }
  }
  return copy;
}

/**
 * Stores the first non-final representation of a game. It is immutable by
 * design: later live/final refreshes can only add targets to the current game,
 * never rewrite the training features captured here.
 */
export function capturePregameSnapshot(game: MLBGame): void {
  const gameId = String((game as any)?.id || game?.metadata?.id || "");
  if (!gameId || isFinalStatus((game as any)?.game_result?.gameStatus)) return;

  const store = readStore();
  if (store.games[gameId]) return;

  store.games[gameId] = {
    gameId,
    gameDate: game.metadata?.date || "",
    capturedAt: new Date().toISOString(),
    game: createPregameGameCopy(game),
  };
  writeStore(store);
}

export function getPregameSnapshot(gameId: string | number): PregameSnapshot | null {
  return readStore().games[String(gameId)] || null;
}

export function getPregameSnapshotsForGames(games: MLBGame[]): Map<string, PregameSnapshot> {
  // Historical, audited snapshots take precedence for training ranges. The
  // daily immutable store remains available for games not present there.
  const snapshots = { ...readStore().games, ...readHistoricalStore().games };
  const result = new Map<string, PregameSnapshot>();
  for (const game of games) {
    const gameId = String((game as any)?.id || game?.metadata?.id || "");
    if (snapshots[gameId]) result.set(gameId, snapshots[gameId]);
  }
  return result;
}

export { SNAPSHOT_PATH };
