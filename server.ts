/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ─── CARGAR VARIABLES DE ENTORNO PRIMERO ─────────────────────────────────────
// CRÍTICO: dotenv debe cargarse ANTES de importar firebase.ts y otros módulos
// que leen process.env en su inicialización.
import { format } from "date-fns";
import { getRecentStatcast } from './src/etl/extractors/pybaseballApi';
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const envPaths = [
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), "env.local"),
  path.join("/etc", "secrets", ".env.local"),
  path.join("/etc", "secrets", "env.local"),
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[ENV] Cargado desde: ${envPath}`);
  }
}
dotenv.config(); // fallback a .env si existe

// Sanitizar process.env para eliminar retornos de carro (\r), saltos de línea (\n) y espacios al inicio/final
for (const key in process.env) {
  if (typeof process.env[key] === "string") {
    process.env[key] = process.env[key]!.trim().replace(/[\r\n]/g, "");
  }
}
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import { createServer as createViteServer } from "vite";
import { saveGameData, loadAllGamesFromFirestore, loadGamesByDateFromFirestore, loadLatestGamesFromFirestore, loadExtractedDatesFromFirestore } from "./src/services/firestoreService";
import { scrapeStrikeoutProps } from "./src/etl/extractors/rotowireScraper";
import {
  WeatherData,
  LineMovement,
  OffensiveSplits,
  FatigueMetrics,
  AdvancedPitching,
  AdvancedOffense,
  AdvancedPitchingStats,
  AdvancedOffenseStats,
  ModelFeatures,
  MLGameResult,
  MLBGame,
  BettingLines
} from "./src/types";
import { generateMLDatasetCSV, generateBattersCSV, generateSingleGameCSV, generateDailyPlayerResultsCSV, generateKPropsLinesCSV, generateBatterTotalBasesLinesCSV } from "./src/utils";
import { savantCache } from "./src/etl/extractors/savantScraper";

const app = express();
app.use(express.json());

// Servir favicon para evitar error 404
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(process.cwd(), "src", "favicon.svg"));
});

const PORT = Number(process.env.PORT || 3001);
const DB_PATH = path.join(process.cwd(), "mlb_database.json");
const ERRORS_PATH = path.join(process.cwd(), "mlb_errors.json");
let gamesDbCache: Record<string, any[]> | null = null;
let gamesDbCacheMtime = 0;
let latestFirestoreRestoreInFlight: Promise<void> | null = null;
const oddsApiBackfillsInFlight = new Set<string>();

// Ensure files exist
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
}
if (!fs.existsSync(ERRORS_PATH)) {
  fs.writeFileSync(ERRORS_PATH, JSON.stringify([], null, 2));
}

// DB Helper Functions
function readGamesDB(): Record<string, any[]> {
  try {
    const stat = fs.statSync(DB_PATH);
    if (gamesDbCache && stat.mtimeMs === gamesDbCacheMtime) {
      return gamesDbCache;
    }
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    gamesDbCache = JSON.parse(raw);
    gamesDbCacheMtime = stat.mtimeMs;
    return gamesDbCache || {};
  } catch (err) {
    console.error("Error reading database:", err);
    return {};
  }
}

function writeGamesDB(data: Record<string, any[]>) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    const stat = fs.statSync(DB_PATH);
    gamesDbCache = data;
    gamesDbCacheMtime = stat.mtimeMs;
  } catch (err) {
    console.error("Error writing database:", err);
  }
}

function countLocalGames(db: Record<string, any[]>): number {
  return Object.values(db).reduce((total, games) => total + (Array.isArray(games) ? games.length : 0), 0);
}

function restoreLatestFromFirestoreInBackground(reason: string) {
  if (latestFirestoreRestoreInFlight) return latestFirestoreRestoreInFlight;
  latestFirestoreRestoreInFlight = loadLatestGamesFromFirestore()
    .then((latestGames) => {
      if (latestGames.length > 0) {
        mergeGamesIntoLocalDB(latestGames);
        console.log(`[Firestore Restore] Fecha reciente restaurada (${reason}): ${latestGames.length} juegos.`);
      }
    })
    .catch((err) => {
      console.error(`[Firestore Restore] Error restaurando fecha reciente (${reason}):`, err);
    })
    .finally(() => {
      latestFirestoreRestoreInFlight = null;
    });
  return latestFirestoreRestoreInFlight;
}

function mergeGamesIntoLocalDB(games: any[]): { games: number; dates: number } {
  const localDB = readGamesDB();
  const mergedDB: Record<string, any[]> = { ...localDB };

  for (const game of games) {
    const date = game?.metadata?.date;
    const id = String(game?.id || game?.metadata?.id || "");
    if (!date || !id) continue;

    const dateGames = Array.isArray(mergedDB[date]) ? [...mergedDB[date]] : [];
    const existingIndex = dateGames.findIndex((g: any) => String(g?.id || g?.metadata?.id || "") === id);

    if (existingIndex === -1) {
      dateGames.push(game);
    } else {
      const localGame = dateGames[existingIndex];
      dateGames[existingIndex] = pickSyncedGame(game, localGame);
    }

    mergedDB[date] = dateGames;
  }

  writeGamesDB(mergedDB);
  const dates = Object.keys(mergedDB).filter(date => Array.isArray(mergedDB[date]) && mergedDB[date].length > 0);
  return { games: games.length, dates: dates.length };
}

function getGameTimestamp(game: any): number {
  const value = game?.timestamp || game?.updatedAt || game?.createdAt;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getTheOddsApiPropsCount(game: any): number {
  let count = 0;
  for (const side of ["home", "away"]) {
    if (game?.pitchers?.[side]?.strikeoutPropSource === "the_odds_api") count += 1;
    for (const player of game?.lineups?.[side] || []) {
      if (player?.totalBasesPropSource === "the_odds_api") count += 1;
    }
  }
  return count;
}

function getTheOddsApiPropsCountForGames(games: any[]): number {
  return (games || []).reduce((total, game) => total + getTheOddsApiPropsCount(game), 0);
}

function maybeBackfillTheOddsApiForDate(date: string, dateGames: any[]) {
  if (!date || !Array.isArray(dateGames) || dateGames.length === 0) return;
  if (!process.env.ODDS_API_KEY) return;
  if (oddsApiBackfillsInFlight.has(date)) return;

  const cacheFile = path.join(process.cwd(), `odds_cache_${date}.json`);
  const hasOddsCache = fs.existsSync(cacheFile);
  const apiPropsCount = getTheOddsApiPropsCountForGames(dateGames);
  if (hasOddsCache && apiPropsCount > 0) return;

  oddsApiBackfillsInFlight.add(date);
  const forceFirstOddsFetch = !hasOddsCache || apiPropsCount === 0;
  console.log(`[Odds Backfill] Iniciando verificacion de The Odds API para ${date}. Cache=${hasOddsCache}, apiProps=${apiPropsCount}.`);

  (async () => {
    try {
      let forceRefreshOdds = forceFirstOddsFetch;
      for (const game of dateGames) {
        const gameId = String(game?.id || game?.metadata?.id || "");
        if (!gameId) continue;
        await updateSingleGameData(gameId, date, forceRefreshOdds);
        forceRefreshOdds = false;
      }
      console.log(`[Odds Backfill] Completado para ${date}.`);
    } catch (err) {
      console.error(`[Odds Backfill] Error actualizando cuotas para ${date}:`, err);
    } finally {
      oddsApiBackfillsInFlight.delete(date);
    }
  })();
}

function getPitcherLast3DetailsCount(game: any): number {
  const fields = ["last3Ks1", "last3Ks2", "last3Ks3", "last3Ip1", "last3Ip2", "last3Ip3", "last3Bf1", "last3Bf2", "last3Bf3"];
  let count = 0;
  for (const side of ["home", "away"]) {
    const pitching = game?.advanced_pitching?.[side] || {};
    for (const field of fields) {
      if (pitching[field] !== undefined && pitching[field] !== null && pitching[field] !== "") count += 1;
    }
  }
  return count;
}

function pickSyncedGame(remoteGame: any, localGame: any) {
  const remotePropsCount = getTheOddsApiPropsCount(remoteGame);
  const localPropsCount = getTheOddsApiPropsCount(localGame);
  if (localPropsCount > remotePropsCount) return localGame;
  if (remotePropsCount > localPropsCount) return remoteGame;
  const remoteLast3Count = getPitcherLast3DetailsCount(remoteGame);
  const localLast3Count = getPitcherLast3DetailsCount(localGame);
  if (localLast3Count > remoteLast3Count) return localGame;
  if (remoteLast3Count > localLast3Count) return remoteGame;
  return getGameTimestamp(remoteGame) >= getGameTimestamp(localGame) ? remoteGame : localGame;
}

async function syncFirestoreToLocalDB(reason = "manual"): Promise<{ synced: boolean; games: number; dates: number }> {
  try {
    const firestoreGames = await loadAllGamesFromFirestore();
  if (!firestoreGames || firestoreGames.length === 0) {
    console.log(`[Firestore Sync] No se encontraron juegos en Firestore (${reason}).`);
    return { synced: false, games: 0, dates: 0 };
  }

  const { dates } = mergeGamesIntoLocalDB(firestoreGames);
  console.log(`[Firestore Sync] Sync completado (${reason}): ${firestoreGames.length} juegos remotos, ${dates} fechas locales.`);
  return { synced: true, games: firestoreGames.length, dates };
  } catch (error) {
    console.error(`[Firestore Sync] Error during sync:`, error);
    return { synced: false, games: 0, dates: 0 };
  }
}

function readErrorsDB(): any[] {
  try {
    const raw = fs.readFileSync(ERRORS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading errors database:", err);
    return [];
  }
}

function writeErrorsDB(errors: any[]) {
  try {
    fs.writeFileSync(ERRORS_PATH, JSON.stringify(errors, null, 2));
  } catch (err) {
    console.error("Error writing errors database:", err);
  }
}

// --------------------------------------------------------------------
// Validation Logic (Requisito 3)
// --------------------------------------------------------------------
function validateGamePayload(game: any, errorsLog: any[]): any {
  const gameId = game.id || "unknown";
  const gameErrors: string[] = [];

  const checkRange = (val: any, min: number, max: number, name: string, severity: "low" | "medium" | "high") => {
    if (val === "N/A") return;
    const num = Number(val);
    if (isNaN(num)) {
      gameErrors.push(`[${name}] Valor no numérico: '${val}'`);
      errorsLog.push({
        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        gameId,
        source: "Validator",
        message: `El campo ${name} tiene un valor no numérico: ${val}`,
        severity,
      });
    } else if (num < min || num > max) {
      gameErrors.push(`[${name}] Valor ${num} fuera de rango límite (${min} - ${max})`);
      errorsLog.push({
        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        gameId,
        source: "Validator",
        message: `Campo ${name} con valor ${num} fuera de rango esperado (${min} y ${max})`,
        severity,
      });
    }
  };

  const checkEmpty = (val: any, name: string, severity: "low" | "medium" | "high") => {
    if (val === undefined || val === null || String(val).trim() === "") {
      gameErrors.push(`[${name}] Campo vacío o nulo`);
      errorsLog.push({
        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        gameId,
        source: "Validator",
        message: `El campo requerido (${name}) está ausente o vacío.`,
        severity,
      });
    }
  };

  // Perform Validations
  checkEmpty(game.metadata?.venue, "metadata.venue", "low");
  checkEmpty(game.pitchers?.home?.name, "pitchers.home.name", "medium");
  checkEmpty(game.pitchers?.away?.name, "pitchers.away.name", "medium");

  // Pitchers stats ranges
  checkRange(game.pitchers?.home?.era, 0, 20, "pitchers.home.era", "medium");
  checkRange(game.pitchers?.home?.whip, 0.4, 4.0, "pitchers.home.whip", "medium");
  checkRange(game.pitchers?.home?.kPct, 0, 100, "pitchers.home.kPct", "low");
  checkRange(game.pitchers?.home?.bbPct, 0, 100, "pitchers.home.bbPct", "low");

  checkRange(game.pitchers?.away?.era, 0, 20, "pitchers.away.era", "medium");
  checkRange(game.pitchers?.away?.whip, 0.4, 4.0, "pitchers.away.whip", "medium");
  checkRange(game.pitchers?.away?.kPct, 0, 100, "pitchers.away.kPct", "low");
  checkRange(game.pitchers?.away?.bbPct, 0, 100, "pitchers.away.bbPct", "low");

  // Offense ranges
  checkRange(game.offense?.home?.runsPerGame, 0, 15, "offense.home.runsPerGame", "medium");
  checkRange(game.offense?.home?.ops, 0.2, 1.5, "offense.home.ops", "medium");

  checkRange(game.offense?.away?.runsPerGame, 0, 15, "offense.away.runsPerGame", "medium");
  checkRange(game.offense?.away?.ops, 0.2, 1.5, "offense.away.ops", "medium");

  // Lineup validation
  if (!game.lineups || !Array.isArray(game.lineups.home) || !Array.isArray(game.lineups.away)) {
    gameErrors.push(`[lineups] Alineaciones titulares incompletas o ausentes`);
    errorsLog.push({
      id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      gameId,
      source: "Validator",
      message: `El campo lineups está ausente o no contiene arreglos válidos de jugadores.`,
      severity: "medium",
    });
  }

  return {
    isValid: gameErrors.length === 0,
    errors: gameErrors,
  };
}

// --------------------------------------------------------------------
// API Routes
// --------------------------------------------------------------------

// Get games schedule for a specific date
app.get("/api/games", async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") {
    res.status(400).json({ error: "Parámetro 'date' es requerido (formato YYYY-MM-DD)" });
    return;
  }

  let db = readGamesDB();
  let dateGames = db[date] || [];

  // Si hay datos locales, respondemos INMEDIATAMENTE sin esperar a Firestore
  if (dateGames.length > 0) {
    maybeBackfillTheOddsApiForDate(date, dateGames);
    res.json({ games: dateGames, totalGames: countLocalGames(db) });
    return;
  }

  // Solo si no hay datos locales, consultamos Firestore (bloqueante)
  const firestoreGames = await loadGamesByDateFromFirestore(date);
  if (firestoreGames.length > 0) {
    mergeGamesIntoLocalDB(firestoreGames);
    db = readGamesDB();
    dateGames = db[date] || [];
  }
  maybeBackfillTheOddsApiForDate(date, dateGames);
  res.json({ games: dateGames, totalGames: countLocalGames(db) });
});

// Helper function to flatten games for ML JSON endpoint
function flattenGameToJSON(g: MLBGame): Record<string, any> {
  const hSplitRhp = g.offensive_splits?.home?.vsRhp;
  const hSplitLhp = g.offensive_splits?.home?.vsLhp;
  const aSplitRhp = g.offensive_splits?.away?.vsRhp;
  const aSplitLhp = g.offensive_splits?.away?.vsLhp;
  const fPitchers = g.fatigue_metrics?.pitchers;
  const fBullpen = g.fatigue_metrics?.bullpen;
  const canUseActualKs = isFinalGameStatus(g.game_result?.gameStatus);
  const canUseBettingLines = hasRealBettingLines(g);

  return {
    game_id: g.id,
    fecha: g.metadata.date,
    hora: g.metadata.time,
    equipo_local: g.metadata.homeTeam,
    equipo_visitante: g.metadata.awayTeam,
    estadio: g.metadata.venue,
    local_pitcher: g.pitchers.home.name,
    local_pitcher_era: g.pitchers.home.era,
    local_pitcher_whip: g.pitchers.home.whip,
    local_pitcher_kPct: g.pitchers.home.kPct,
    local_pitcher_bbPct: g.pitchers.home.bbPct,
    local_pitcher_wins: g.pitchers.home.wins,
    local_pitcher_losses: g.pitchers.home.losses,
    local_pitcher_ip: g.pitchers.home.ip,
    away_pitcher: g.pitchers.away.name,
    away_pitcher_era: g.pitchers.away.era,
    away_pitcher_whip: g.pitchers.away.whip,
    away_pitcher_kPct: g.pitchers.away.kPct,
    away_pitcher_bbPct: g.pitchers.away.bbPct,
    away_pitcher_wins: g.pitchers.away.wins,
    away_pitcher_losses: g.pitchers.away.losses,
    away_pitcher_ip: g.pitchers.away.ip,
    bullpen_era_local: g.bullpen.home.era,
    bullpen_usage_local: g.bullpen.home.usageLast3Days,
    bullpen_ip_7d_local: g.bullpen.home.ipLast7Days,
    bullpen_era_away: g.bullpen.away.era,
    bullpen_usage_away: g.bullpen.away.usageLast3Days,
    bullpen_ip_7d_away: g.bullpen.away.ipLast7Days,
    ofensa_run_g_local: g.offense.home.runsPerGame,
    ofensa_ops_local: g.offense.home.ops,
    ofensa_obp_local: g.offense.home.obp,
    ofensa_slg_local: g.offense.home.slg,
    home_offense_kPct: g.lineups?.home && g.lineups.home.length > 0 
      ? parseFloat((g.lineups.home.reduce((sum, p) => sum + (p.strikeout_pct ?? p.kPct ?? 0), 0) / g.lineups.home.length).toFixed(2)) 
      : null,
    ofensa_run_g_away: g.offense.away.runsPerGame,
    ofensa_ops_away: g.offense.away.ops,
    ofensa_obp_away: g.offense.away.obp,
    ofensa_slg_away: g.offense.away.slg,
    away_offense_kPct: g.lineups?.away && g.lineups.away.length > 0 
      ? parseFloat((g.lineups.away.reduce((sum, p) => sum + (p.strikeout_pct ?? p.kPct ?? 0), 0) / g.lineups.away.length).toFixed(2)) 
      : null,
    weather_temp: g.weather?.temp ?? null,
    weather_humidity: g.weather?.humidity ?? null,
    weather_wind_speed: g.weather?.windSpeed ?? null,
    weather_wind_dir: g.weather?.windDirection ?? null,
    weather_pressure: g.weather?.pressure ?? null,
    weather_rain_prob: g.weather?.rainProbability ?? null,
    weather_sky: g.weather?.skyStatus ?? null,
    weather_apparent_temp: g.weather?.apparentTemp ?? null,
    home_splits_vs_rhp_avg: hSplitRhp?.avg ?? null,
    home_splits_vs_rhp_ops: hSplitRhp?.ops ?? null,
    home_splits_vs_rhp_obp: hSplitRhp?.obp ?? null,
    home_splits_vs_rhp_slg: hSplitRhp?.slg ?? null,
    home_splits_vs_rhp_rpg: hSplitRhp?.runsPerGame ?? null,
    home_splits_vs_rhp_hr: hSplitRhp?.hr ?? null,
    home_splits_vs_lhp_avg: hSplitLhp?.avg ?? null,
    home_splits_vs_lhp_ops: hSplitLhp?.ops ?? null,
    home_splits_vs_lhp_obp: hSplitLhp?.obp ?? null,
    home_splits_vs_lhp_slg: hSplitLhp?.slg ?? null,
    home_splits_vs_lhp_rpg: hSplitLhp?.runsPerGame ?? null,
    home_splits_vs_lhp_hr: hSplitLhp?.hr ?? null,
    away_splits_vs_rhp_avg: aSplitRhp?.avg ?? null,
    away_splits_vs_rhp_ops: aSplitRhp?.ops ?? null,
    away_splits_vs_rhp_obp: aSplitRhp?.obp ?? null,
    away_splits_vs_rhp_slg: aSplitRhp?.slg ?? null,
    away_splits_vs_rhp_rpg: aSplitRhp?.runsPerGame ?? null,
    away_splits_vs_rhp_hr: aSplitRhp?.hr ?? null,
    away_splits_vs_lhp_avg: aSplitLhp?.avg ?? null,
    away_splits_vs_lhp_ops: aSplitLhp?.ops ?? null,
    away_splits_vs_lhp_obp: aSplitLhp?.obp ?? null,
    away_splits_vs_lhp_slg: aSplitLhp?.slg ?? null,
    away_splits_vs_lhp_rpg: aSplitLhp?.runsPerGame ?? null,
    away_splits_vs_lhp_hr: aSplitLhp?.hr ?? null,
    home_pitcher_rest: fPitchers?.home?.daysSinceLastStart ?? null,
    home_pitcher_pitches_last: fPitchers?.home?.pitchesLastStart ?? null,
    home_pitcher_pitches_last_3: fPitchers?.home?.pitchesLast3Starts ?? null,
    away_pitcher_rest: fPitchers?.away?.daysSinceLastStart ?? null,
    away_pitcher_pitches_last: fPitchers?.away?.pitchesLastStart ?? null,
    away_pitcher_pitches_last_3: fPitchers?.away?.pitchesLast3Starts ?? null,
    home_bullpen_ip_3d: fBullpen?.home?.ipLast3Days ?? null,
    home_bullpen_ip_7d_recent: fBullpen?.home?.ipLast7Days ?? null,
    home_bullpen_relievers_yesterday: fBullpen?.home?.relieversUsedYesterday ?? null,
    home_bullpen_relievers_2d: fBullpen?.home?.relieversUsedLast2Days ?? null,
    home_bullpen_available: fBullpen?.home?.availableCount ?? null,
    away_bullpen_ip_3d: fBullpen?.away?.ipLast3Days ?? null,
    away_bullpen_ip_7d_recent: fBullpen?.away?.ipLast7Days ?? null,
    away_bullpen_relievers_yesterday: fBullpen?.away?.relieversUsedYesterday ?? null,
    away_bullpen_relievers_2d: fBullpen?.away?.relieversUsedLast2Days ?? null,
    away_bullpen_available: fBullpen?.away?.availableCount ?? null,
    home_pitcher_xera: g.advanced_pitching?.home?.xEra ?? null,
    home_pitcher_fip: g.advanced_pitching?.home?.fip ?? null,
    home_pitcher_xfip: g.advanced_pitching?.home?.xFip ?? null,
    home_pitcher_siera: g.advanced_pitching?.home?.siera ?? null,
    home_pitcher_hardhit_pct: g.advanced_pitching?.home?.hardHitPct ?? null,
    home_pitcher_barrel_pct: g.advanced_pitching?.home?.barrelPct ?? null,
    home_pitcher_gb_pct: g.advanced_pitching?.home?.groundBallPct ?? null,
    home_pitcher_fb_pct: g.advanced_pitching?.home?.flyBallPct ?? null,
    home_pitcher_so_rate: g.advanced_pitching?.home?.strikeoutRate ?? null,
    home_pitcher_bb_rate: g.advanced_pitching?.home?.walkRate ?? null,
    home_pitcher_swstr_pct: g.advanced_pitching?.home?.swingingStrikePct ?? null,
    home_pitcher_csw_pct: g.advanced_pitching?.home?.cswPct ?? null,
    home_pitcher_actual_ks: canUseActualKs ? (g.advanced_pitching?.home?.actualStrikeouts ?? null) : null,
    home_pitcher_last5_ks_avg: g.advanced_pitching?.home?.last5KsAvg ?? null,
    home_pitcher_last5_ks_std: g.advanced_pitching?.home?.last5KsStd ?? null,
    home_pitcher_last5_ip_avg: g.advanced_pitching?.home?.last5IpAvg ?? null,
    home_pitcher_last5_bf_avg: g.advanced_pitching?.home?.last5BfAvg ?? null,
    home_pitcher_last5_pitch_count_avg: g.advanced_pitching?.home?.last5PitchCountAvg ?? null,
    home_pitcher_last3_ks_1: g.advanced_pitching?.home?.last3Ks1 ?? null,
    home_pitcher_last3_ks_2: g.advanced_pitching?.home?.last3Ks2 ?? null,
    home_pitcher_last3_ks_3: g.advanced_pitching?.home?.last3Ks3 ?? null,
    home_pitcher_last3_ip_1: g.advanced_pitching?.home?.last3Ip1 ?? null,
    home_pitcher_last3_ip_2: g.advanced_pitching?.home?.last3Ip2 ?? null,
    home_pitcher_last3_ip_3: g.advanced_pitching?.home?.last3Ip3 ?? null,
    home_pitcher_last3_bf_1: g.advanced_pitching?.home?.last3Bf1 ?? null,
    home_pitcher_last3_bf_2: g.advanced_pitching?.home?.last3Bf2 ?? null,
    home_pitcher_last3_bf_3: g.advanced_pitching?.home?.last3Bf3 ?? null,
    home_pitcher_career_k_pct_vs_team: g.advanced_pitching?.home?.careerKPctVsTeam ?? null,
    home_pitcher_last3_vs_team_ks_avg: g.advanced_pitching?.home?.last3VsTeamKsAvg ?? null,
    home_pitcher_last3_vs_team_bf_avg: g.advanced_pitching?.home?.last3VsTeamBfAvg ?? null,
    home_pitcher_projected_pitches: g.advanced_pitching?.home?.projectedPitchCount ?? null,
    home_pitcher_bf_per_start: g.advanced_pitching?.home?.battersFacedPerStart ?? null,
    away_pitcher_xera: g.advanced_pitching?.away?.xEra ?? null,
    away_pitcher_fip: g.advanced_pitching?.away?.fip ?? null,
    away_pitcher_xfip: g.advanced_pitching?.away?.xFip ?? null,
    away_pitcher_siera: g.advanced_pitching?.away?.siera ?? null,
    away_pitcher_hardhit_pct: g.advanced_pitching?.away?.hardHitPct ?? null,
    away_pitcher_barrel_pct: g.advanced_pitching?.away?.barrelPct ?? null,
    away_pitcher_gb_pct: g.advanced_pitching?.away?.groundBallPct ?? null,
    away_pitcher_fb_pct: g.advanced_pitching?.away?.flyBallPct ?? null,
    away_pitcher_so_rate: g.advanced_pitching?.away?.strikeoutRate ?? null,
    away_pitcher_bb_rate: g.advanced_pitching?.away?.walkRate ?? null,
    away_pitcher_swstr_pct: g.advanced_pitching?.away?.swingingStrikePct ?? null,
    away_pitcher_csw_pct: g.advanced_pitching?.away?.cswPct ?? null,
    away_pitcher_actual_ks: canUseActualKs ? (g.advanced_pitching?.away?.actualStrikeouts ?? null) : null,
    away_pitcher_last5_ks_avg: g.advanced_pitching?.away?.last5KsAvg ?? null,
    away_pitcher_last5_ks_std: g.advanced_pitching?.away?.last5KsStd ?? null,
    away_pitcher_last5_ip_avg: g.advanced_pitching?.away?.last5IpAvg ?? null,
    away_pitcher_last5_bf_avg: g.advanced_pitching?.away?.last5BfAvg ?? null,
    away_pitcher_last5_pitch_count_avg: g.advanced_pitching?.away?.last5PitchCountAvg ?? null,
    away_pitcher_last3_ks_1: g.advanced_pitching?.away?.last3Ks1 ?? null,
    away_pitcher_last3_ks_2: g.advanced_pitching?.away?.last3Ks2 ?? null,
    away_pitcher_last3_ks_3: g.advanced_pitching?.away?.last3Ks3 ?? null,
    away_pitcher_last3_ip_1: g.advanced_pitching?.away?.last3Ip1 ?? null,
    away_pitcher_last3_ip_2: g.advanced_pitching?.away?.last3Ip2 ?? null,
    away_pitcher_last3_ip_3: g.advanced_pitching?.away?.last3Ip3 ?? null,
    away_pitcher_last3_bf_1: g.advanced_pitching?.away?.last3Bf1 ?? null,
    away_pitcher_last3_bf_2: g.advanced_pitching?.away?.last3Bf2 ?? null,
    away_pitcher_last3_bf_3: g.advanced_pitching?.away?.last3Bf3 ?? null,
    away_pitcher_career_k_pct_vs_team: g.advanced_pitching?.away?.careerKPctVsTeam ?? null,
    away_pitcher_last3_vs_team_ks_avg: g.advanced_pitching?.away?.last3VsTeamKsAvg ?? null,
    away_pitcher_last3_vs_team_bf_avg: g.advanced_pitching?.away?.last3VsTeamBfAvg ?? null,
    away_pitcher_projected_pitches: g.advanced_pitching?.away?.projectedPitchCount ?? null,
    away_pitcher_bf_per_start: g.advanced_pitching?.away?.battersFacedPerStart ?? null,
    home_offense_woba: g.advanced_offense?.home?.wOba ?? null,
    home_offense_xwoba: g.advanced_offense?.home?.xwOba ?? null,
    home_offense_wrcplus: g.advanced_offense?.home?.wrcPlus ?? null,
    home_offense_iso: g.advanced_offense?.home?.iso ?? null,
    home_offense_babip: g.advanced_offense?.home?.babip ?? null,
    home_offense_hardhit_pct: g.advanced_offense?.home?.hardHitPct ?? null,
    home_offense_barrel_pct: g.advanced_offense?.home?.barrelPct ?? null,
    home_offense_contact_pct: g.advanced_offense?.home?.contactPct ?? null,
    home_offense_chase_pct: g.advanced_offense?.home?.chasePct ?? null,
    home_offense_k_pct_vs_pitch_hand: g.advanced_offense?.home?.kPctVsPitchHand ?? null,
    home_offense_projected_lineup_k_pct: g.advanced_offense?.home?.projectedLineupKPct ?? null,
    home_projected_lineup_k_pct_vs_hand: g.advanced_offense?.home?.projectedLineupKPct ?? null,
    home_projected_lineup_contact_pct_vs_hand: g.advanced_offense?.home?.projectedLineupContactPctVsHand ?? null,
    away_offense_woba: g.advanced_offense?.away?.wOba ?? null,
    away_offense_xwoba: g.advanced_offense?.away?.xwOba ?? null,
    away_offense_wrcplus: g.advanced_offense?.away?.wrcPlus ?? null,
    away_offense_iso: g.advanced_offense?.away?.iso ?? null,
    away_offense_babip: g.advanced_offense?.away?.babip ?? null,
    away_offense_hardhit_pct: g.advanced_offense?.away?.hardHitPct ?? null,
    away_offense_barrel_pct: g.advanced_offense?.away?.barrelPct ?? null,
    away_offense_contact_pct: g.advanced_offense?.away?.contactPct ?? null,
    away_offense_chase_pct: g.advanced_offense?.away?.chasePct ?? null,
    away_offense_k_pct_vs_pitch_hand: g.advanced_offense?.away?.kPctVsPitchHand ?? null,
    away_offense_projected_lineup_k_pct: g.advanced_offense?.away?.projectedLineupKPct ?? null,
    away_projected_lineup_k_pct_vs_hand: g.advanced_offense?.away?.projectedLineupKPct ?? null,
    away_projected_lineup_contact_pct_vs_hand: g.advanced_offense?.away?.projectedLineupContactPctVsHand ?? null,
    diff_era: g.model_features?.diffEra ?? null,
    diff_xera: g.model_features?.diffXera ?? null,
    diff_fip: g.model_features?.diffFip ?? null,
    diff_ops: g.model_features?.diffOps ?? null,
    diff_xwoba: g.model_features?.diffXwoba ?? null,
    diff_bullpen_era: g.model_features?.diffBullpenEra ?? null,
    diff_runs_per_game: g.model_features?.diffRunsPerGame ?? null,
    diff_record_last10: g.model_features?.diffRecordLast10 ?? null,
    diff_record_home_away: g.model_features?.diffRecordHomeAway ?? null,
    diff_starter_rest: g.model_features?.diffStarterRest ?? null,
    diff_bullpen_fatigue: g.model_features?.diffBullpenFatigue ?? null,
    line_source: getBettingLineSource(g),
    resultado_carreras_local: g.game_result?.homeScore ?? null,
    resultado_carreras_visitante: g.game_result?.awayScore ?? null,
    resultado_ganador: g.game_result?.winner ?? null,
    resultado_runline_cubierto: g.game_result?.runLineCovered ?? null,
    resultado_overunder: g.game_result?.overUnderResult ?? null,
    resultado_estado: g.game_result?.gameStatus ?? "Scheduled"
  };
}

app.get("/api/extracted-dates", async (req, res) => {
  try {
    const { remote } = req.query;
    const db = readGamesDB();
    const localDates = Object.keys(db).filter(date => Array.isArray(db[date]) && db[date].length > 0);

    let firestoreDates: string[] = [];
    if (remote === "true") {
      try {
        firestoreDates = await loadExtractedDatesFromFirestore();
      } catch (fsErr) {
        console.error("Error retrieving extracted dates from Firestore:", fsErr);
      }
    }

    // Combinar fechas locales y de Firestore, eliminar duplicados y ordenar descendente
    const mergedDates = Array.from(new Set([...localDates, ...firestoreDates]))
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    res.json({ dates: mergedDates });
  } catch (err) {
    console.error("Error retrieving extracted dates:", err);
    res.status(500).json({ error: "Fallo al obtener fechas extraídas" });
  }
});

app.get("/api/diagnostics/render", async (req, res) => {
  try {
    const db = readGamesDB();
    const localDates = Object.keys(db).filter(date => Array.isArray(db[date]) && db[date].length > 0);
    let firestoreDates: string[] = [];
    try {
      firestoreDates = await loadExtractedDatesFromFirestore();
    } catch (fsErr) {
      console.error("Diagnostics Firestore dates error:", fsErr);
    }

    const latestDate = [...localDates, ...firestoreDates]
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
    const latestGames = latestDate ? (db[latestDate] || []) : [];

    res.json({
      ok: true,
      environment: {
        nodeEnv: process.env.NODE_ENV || null,
        hasOddsApiKey: !!process.env.ODDS_API_KEY,
        hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
        fullFirestoreStartupSync: process.env.FULL_FIRESTORE_STARTUP_SYNC === "true",
        firestoreReadTimeoutMs: process.env.FIRESTORE_READ_TIMEOUT_MS || "6000",
      },
      database: {
        localDates: localDates.length,
        firestoreDates: firestoreDates.length,
        totalLocalGames: countLocalGames(db),
        latestDate,
        latestLocalGames: latestGames.length,
        latestTheOddsApiProps: getTheOddsApiPropsCountForGames(latestGames),
      },
    });
  } catch (err) {
    console.error("Diagnostics endpoint error:", err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Get ML consolidation dataset (wide flat JSON)
app.get("/api/ml-dataset", (req, res) => {
  try {
    const db = readGamesDB();
    const allGames: MLBGame[] = [];
    for (const date of Object.keys(db)) {
      const games = db[date] || [];
      allGames.push(...games);
    }
    const flattened = allGames.map(flattenGameToJSON);
    res.json({ dataset: flattened });
  } catch (err) {
    console.error("Error retrieving ML dataset:", err);
    res.status(500).json({ error: "Fallo al generar dataset ML" });
  }
});

// Download ML consolidation dataset as CSV
app.get("/api/ml-dataset/csv", (req, res) => {
  try {
    const db = readGamesDB();
    const allGames: MLBGame[] = [];
    for (const date of Object.keys(db)) {
      const games = db[date] || [];
      allGames.push(...games);
    }
    const csvContent = generateMLDatasetCSV(allGames);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=mlb_ml_dataset.csv");
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating ML CSV:", err);
    res.status(500).send("Error al generar CSV");
  }
});

// Download K Props dataset as CSV
app.get("/api/k-props/csv", async (req, res) => {
  try {
    const { date } = req.query;
    const db = readGamesDB();
    const allGames: MLBGame[] = [];
    if (date && typeof date === "string") {
      allGames.push(...(db[date] || []));
    } else {
      for (const dateKey of Object.keys(db)) {
        const games = db[dateKey] || [];
        allGames.push(...games);
      }
    }
    const csvContent = generateKPropsLinesCSV(allGames);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=k_props_lines_${date || "all"}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating K Props CSV:", err);
    res.status(500).send("Error al generar CSV");
  }
});

// Download Batter Total Bases dataset as CSV
app.get("/api/batter-total-bases/csv", async (req, res) => {
  try {
    const { date } = req.query;
    const db = readGamesDB();
    const allGames: MLBGame[] = [];
    if (date && typeof date === "string") {
      allGames.push(...(db[date] || []));
    } else {
      for (const dateKey of Object.keys(db)) {
        const games = db[dateKey] || [];
        allGames.push(...games);
      }
    }
    const csvContent = generateBatterTotalBasesLinesCSV(allGames);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=batter_total_bases_lines_${date || "all"}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating Batter Total Bases CSV:", err);
    res.status(500).send("Error al generar CSV");
  }
});

// Download Batters dataset as CSV
app.get("/api/batters-dataset/csv", async (req, res) => {
  try {
    const { date } = req.query;
    const db = readGamesDB();
    const allGames: MLBGame[] = [];
    if (date && typeof date === "string") {
      allGames.push(...(db[date] || []));
    } else {
      for (const dateKey of Object.keys(db)) {
        const games = db[dateKey] || [];
        allGames.push(...games);
      }
    }
    const enrichedGames = await enrichGamesWithSavantBatterContact(await enrichGamesWithTotalBasesProps(allGames));
    const csvContent = generateBattersCSV(enrichedGames);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=mlb_batters_dataset.csv");
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating Batters CSV:", err);
    res.status(500).send("Error al generar CSV");
  }
});

// Download one game's enriched dataset as CSV
app.get("/api/game/:gameId/csv", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { date } = req.query;
    const db = readGamesDB();
    const candidateGames: MLBGame[] = [];

    if (date && db[String(date)]) {
      candidateGames.push(...db[String(date)]);
    } else {
      for (const games of Object.values(db) as MLBGame[][]) {
        candidateGames.push(...games);
      }
    }

    const game = candidateGames.find((g: MLBGame) => String(g.id) === String(gameId));
    if (!game) {
      res.status(404).send("Juego no encontrado");
      return;
    }

    const [enrichedGame] = await enrichGamesWithTotalBasesProps([game]);
    const csvContent = generateSingleGameCSV(enrichedGame);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=mlb_game_${gameId}_${enrichedGame.metadata.date}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating single game CSV:", err);
    res.status(500).send("Error al generar CSV del juego");
  }
});

// Download daily player results from live boxscore only
app.get("/api/daily-results/csv", (req, res) => {
  try {
    const { date } = req.query;
    const db = readGamesDB();
    const games = date && db[String(date)] ? db[String(date)] : [];
    const csvContent = generateDailyPlayerResultsCSV(games);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=mlb_resultados_dia_${date || "sin_fecha"}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating daily results CSV:", err);
    res.status(500).send("Error al generar CSV de resultados del dia");
  }
});

// Get registered validator errors
app.get("/api/errors", (req, res) => {
  const errors = readErrorsDB();
  res.json({ errors });
});

// Clears error logs
app.post("/api/errors/clear", (req, res) => {
  writeErrorsDB([]);
  res.json({ status: "success", message: "Logs de errores vaciados." });
});

// Helper function to generate high-fidelity simulated game data for demo mode
function generateMockGameData(gameId: string, homeName: string, awayName: string, venueName: string, date: string, matchTime: string): any {
  const mapMockLineup = (lineup: any[], teamName: string) => {
    return lineup.map((p, idx) => ({
      ...p,
      player_name: p.name,
      team: teamName,
      bat_side: idx % 3 === 0 ? "L" : "R",
      obp: Math.round((p.avg + 0.06) * 1000) / 1000,
      slg: Math.round((p.ops - (p.avg + 0.06)) * 1000) / 1000,
      woba: Math.round((p.ops * 0.42) * 1000) / 1000,
      iso: Math.round((p.ops - p.avg * 2) * 1000) / 1000,
      pa: 300,
      hits: 80,
      doubles: 15,
      triples: 2,
      home_runs: p.hr,
      strikeout_pct: 18.5,
      walk_pct: 8.2,
      batting_order: idx + 1,
      ops_vs_rhp: Math.round((p.ops + 0.02) * 1000) / 1000,
      ops_vs_lhp: Math.round((p.ops - 0.04) * 1000) / 1000,
      slg_vs_rhp: Math.round((p.ops - 0.35) * 1000) / 1000,
      slg_vs_lhp: Math.round((p.ops - 0.40) * 1000) / 1000,
      last7_avg: p.avg,
      last7_ops: p.ops,
      last7_slg: Math.round((p.ops - 0.35) * 1000) / 1000,
      last7_total_bases: 12,
      last7_hits: 7,
      last7_xbh: 2
    }));
  };

  return {
    id: gameId,
    metadata: {
      id: gameId,
      date: date,
      time: matchTime,
      homeTeam: homeName,
      awayTeam: awayName,
      venue: venueName
    },
    teams: { home: homeName, away: awayName },
    pitchers: {
      home: {
        name: "A. Bueno (Proyectado)",
        era: 3.12,
        whip: 1.08,
        xEra: 3.05,
        fip: 3.20,
        xFip: 3.15,
        kPct: 28.5,
        bbPct: 5.4,
        lastFiveStarts: ["6.0 IP, 2 ER, 7 K", "7.0 IP, 1 ER, 8 K", "5.1 IP, 3 ER, 5 K", "6.2 IP, 0 ER, 9 K", "6.0 IP, 2 ER, 6 K"],
        pitchHand: "R",
        pitcher_allowed_avg_vs_lhb: 0.220,
        pitcher_allowed_avg_vs_rhb: 0.210,
        pitcher_allowed_slg_vs_lhb: 0.340,
        pitcher_allowed_slg_vs_rhb: 0.320
      },
      away: {
        name: "C. Malo (Proyectado)",
        era: 4.45,
        whip: 1.35,
        xEra: 4.60,
        fip: 4.30,
        xFip: 4.42,
        kPct: 20.1,
        bbPct: 8.9,
        lastFiveStarts: ["5.0 IP, 4 ER, 4 K", "6.0 IP, 2 ER, 5 K", "4.2 IP, 5 ER, 3 K", "6.0 IP, 3 ER, 6 K", "5.1 IP, 4 ER, 4 K"],
        pitchHand: "L",
        pitcher_allowed_avg_vs_lhb: 0.260,
        pitcher_allowed_avg_vs_rhb: 0.270,
        pitcher_allowed_slg_vs_lhb: 0.410,
        pitcher_allowed_slg_vs_rhb: 0.430
      }
    },
    bullpen: {
      home: {
        era: 3.45,
        usageLast3Days: "Moderada",
        availableRelievers: ["R. Rodríguez", "M. Sánchez", "T. Miller"],
        ipLast3Days: 12.1
      },
      away: {
        era: 4.20,
        usageLast3Days: "Alta",
        availableRelievers: ["J. Johnson", "A. Davis"],
        ipLast3Days: 16.2
      }
    },
    offense: {
      home: {
        runsPerGame: 5.1,
        strikeoutsPerGame: 8.2,
        ops: 0.785,
        obp: 0.335,
        slg: 0.450,
        wrcPlus: 115,
        runsLast7Games: 38
      },
      away: {
        runsPerGame: 4.2,
        strikeoutsPerGame: 9.1,
        ops: 0.710,
        obp: 0.312,
        slg: 0.398,
        wrcPlus: 96,
        runsLast7Games: 28
      }
    },
    trends: {
      home: { recordLast10: "7-3", recordHome: "18-9", recordAway: "12-14" },
      away: { recordLast10: "4-6", recordHome: "10-15", recordAway: "13-14" }
    },
    betting_lines: {
      openingMoneylineHome: -150,
      openingMoneylineAway: 130,
      currentMoneylineHome: -165,
      currentMoneylineAway: 145,
      runLineHome: -1.5,
      runLineHomeOdds: 120,
      runLineAway: 1.5,
      runLineAwayOdds: -140,
      totalRuns: 8.5,
      overOdds: -110,
      underOdds: -110,
      lineMovementSummary: "Dinero entrando a favor del equipo local tras confirmación de abridores."
    },
    predictions: {
      winProbabilityHome: 61.5,
      winProbabilityAway: 38.5,
      coverRunLineProbabilityHome: 48.0,
      coverRunLineProbabilityAway: 52.0,
      overRunsProbability: 53.5,
      underRunsProbability: 46.5,
      expectedValueHome: 0.04,
      expectedValueAway: -0.05,
      confidenceScore: 4,
      predictionExplanation: "El equipo local llega en gran racha ofensiva y cuenta con una clara ventaja en el montículo con su abridor estrella. El bullpen visitante está desgastado tras la serie anterior."
    },
    injuries: [
      { team: homeName, player: "J. Ramirez", status: "IL-10", detail: "Distensión de corva" },
      { team: awayName, player: "L. Smith", status: "Dia a dia", detail: "Dolor en el hombro" }
    ],
    lineups: {
      home: mapMockLineup([
        { name: "J. Altuve", position: "2B", avg: 0.282, ops: 0.812, hr: 15, rbi: 45 },
        { name: "Y. Alvarez", position: "DH", avg: 0.308, ops: 0.985, hr: 28, rbi: 82 },
        { name: "A. Bregman", position: "3B", avg: 0.262, ops: 0.795, hr: 18, rbi: 55 },
        { name: "K. Tucker", position: "RF", avg: 0.278, ops: 0.865, hr: 22, rbi: 70 },
        { name: "J. Peña", position: "SS", avg: 0.258, ops: 0.710, hr: 12, rbi: 48 },
        { name: "Y. Diaz", position: "1B", avg: 0.270, ops: 0.742, hr: 10, rbi: 42 },
        { name: "C. McCormick", position: "LF", avg: 0.245, ops: 0.715, hr: 9, rbi: 35 },
        { name: "J. Meyers", position: "CF", avg: 0.232, ops: 0.675, hr: 7, rbi: 28 },
        { name: "Y. Caratini", position: "C", avg: 0.242, ops: 0.690, hr: 6, rbi: 25 }
      ], homeName),
      away: mapMockLineup([
        { name: "M. Semien", position: "2B", avg: 0.252, ops: 0.748, hr: 14, rbi: 48 },
        { name: "C. Seager", position: "SS", avg: 0.295, ops: 0.895, hr: 24, rbi: 72 },
        { name: "A. García", position: "RF", avg: 0.248, ops: 0.755, hr: 20, rbi: 62 },
        { name: "N. Lowe", position: "1B", avg: 0.265, ops: 0.772, hr: 12, rbi: 50 },
        { name: "J. Jung", position: "3B", avg: 0.255, ops: 0.768, hr: 15, rbi: 48 },
        { name: "W. Langford", position: "LF", avg: 0.260, ops: 0.750, hr: 10, rbi: 45 },
        { name: "J. Heim", position: "C", avg: 0.240, ops: 0.685, hr: 8, rbi: 38 },
        { name: "L. Taveras", position: "CF", avg: 0.235, ops: 0.665, hr: 6, rbi: 30 },
        { name: "E. Duran", position: "DH", avg: 0.248, ops: 0.695, hr: 5, rbi: 24 }
      ], awayName)
    }
  };
}

// --------------------------------------------------------------------
// Real MLB Data Fetcher (called before Gemini in Fast/Deep mode)
// --------------------------------------------------------------------
function safeFloat(val: any, fallback: number | null = null): number | null {
  const n = parseFloat(String(val));
  return isNaN(n) ? fallback : n;
}

const GAME_TIME_ZONE = "America/New_York";

function formatGameTime(gameDateISO: string | undefined | null): string {
  if (!gameDateISO) return "TBD";
  return `${new Date(gameDateISO).toLocaleTimeString("en-US", {
    timeZone: GAME_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })} ET`;
}

function roundNumber(value: number | null | undefined, decimals = 1): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function average(values: number[], decimals = 1): number | null {
  if (!values.length) return null;
  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length, decimals);
}

function standardDeviation(values: number[], decimals = 2): number | null {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return roundNumber(Math.sqrt(variance), decimals);
}

function calculateLineupSavantAverages(lineup: any[]) {
  const batterStats = lineup.map((p: any) => savantCache.getBatter(p.id ?? p.mlbId));

  return {
    xwOba: average(
      batterStats
        .map((p) => p?.xwOBA)
        .filter((value): value is number => value !== null && value !== undefined),
      3
    ),
    hardHitPct: average(
      batterStats
        .map((p) => p?.hardHitPct)
        .filter((value): value is number => value !== null && value !== undefined),
      1
    ),
    barrelPct: average(
      batterStats
        .map((p) => p?.barrelPct)
        .filter((value): value is number => value !== null && value !== undefined),
      1
    ),
    chasePct: average(
      batterStats
        .map((p) => p?.chasePct)
        .filter((value): value is number => value !== null && value !== undefined),
      1
    ),
    whiffPct: average(
      batterStats
        .map((p) => p?.whiffPct)
        .filter((value): value is number => value !== null && value !== undefined),
      1
    ),
    whiffPctVsFastball: average(
      batterStats.map(p => p?.whiffPctVsFastball).filter((v): v is number => v !== null && v !== undefined),
      1
    ),
    whiffPctVsSlider: average(
      batterStats.map(p => p?.whiffPctVsSlider).filter((v): v is number => v !== null && v !== undefined),
      1
    ),
    whiffPctVsCurve: average(
      batterStats.map(p => p?.whiffPctVsCurve).filter((v): v is number => v !== null && v !== undefined),
      1
    ),
    whiffPctVsChangeup: average(
      batterStats.map(p => p?.whiffPctVsChangeup).filter((v): v is number => v !== null && v !== undefined),
      1
    ),
    whiffPctVsSplitter: average(
      batterStats.map(p => p?.whiffPctVsSplitter).filter((v): v is number => v !== null && v !== undefined),
      1
    )
  };
}

async function enrichGamesWithSavantBatterContact(games: MLBGame[]): Promise<MLBGame[]> {
  const applyBatterSavant = (lineup: any[] | undefined) => {
    for (const player of lineup || []) {
      const savant = savantCache.getBatter(player.id ?? player.mlbId);
      if (!savant) continue;
      player.chase_pct = player.chase_pct ?? savant.chasePct;
      player.whiff_pct = player.whiff_pct ?? savant.whiffPct;
      if (savant.whiffPct !== null) {
        const contactPct = roundNumber(100 - savant.whiffPct, 1);
        player.contact_pct_vs_rhp = player.contact_pct_vs_rhp ?? contactPct;
        player.contact_pct_vs_lhp = player.contact_pct_vs_lhp ?? contactPct;
      }
    }
  };

  const applyTeamSavant = (game: MLBGame, side: "home" | "away") => {
    const lineup = game.lineups?.[side] || [];
    const lineupSavant = calculateLineupSavantAverages(lineup);
    const offense = game.advanced_offense?.[side];
    if (!offense) return;
    if (lineupSavant.chasePct !== null) offense.chasePct = offense.chasePct ?? lineupSavant.chasePct;
    if (lineupSavant.whiffPct !== null) {
      offense.projectedLineupWhiffPctVsHand = offense.projectedLineupWhiffPctVsHand ?? lineupSavant.whiffPct;
      offense.contactPct = offense.contactPct ?? roundNumber(100 - lineupSavant.whiffPct, 1);
      offense.projectedLineupContactPctVsHand = offense.projectedLineupContactPctVsHand ?? roundNumber(100 - lineupSavant.whiffPct, 1);
    }
  };

  for (const game of games) {
    const year = String(game?.metadata?.date || "").slice(0, 4);
    await savantCache.load(/^\d{4}$/.test(year) ? parseInt(year, 10) : new Date().getFullYear());
    applyBatterSavant(game.lineups?.home);
    applyBatterSavant(game.lineups?.away);
    applyTeamSavant(game, "home");
    applyTeamSavant(game, "away");
  }

  return games;
}



function inningsToOuts(ipValue: any): number {
  const ipStr = String(ipValue || "0.0");
  const [wholeRaw, fracRaw = "0"] = ipStr.split(".");
  const whole = parseInt(wholeRaw, 10) || 0;
  const frac = parseInt(fracRaw, 10) || 0;
  return whole * 3 + Math.min(Math.max(frac, 0), 2);
}

function outsToInnings(outs: number): number {
  if (!Number.isFinite(outs) || outs <= 0) return 0;
  return Math.round((outs / 3) * 10) / 10;
}

function saneAveragePitchCount(value: number | null): number | null {
  if (value === null || value <= 0) return null;
  return value > 130 ? null : Math.round(value);
}

function saneBattersFacedPerStart(value: number | null): number | null {
  if (value === null || value <= 0) return null;
  return value > 40 ? null : roundNumber(value, 1);
}

type PitcherRoleFlag = "SHORT_ROLE_OR_OPENER" | "LIMITED_STARTER" | "LOW_VOLUME_STARTER" | "NORMAL_STARTER" | "HIGH_VOLUME_STARTER";

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPitcherRoleFromBfPerStart(bfPerStart: number): { roleFlag: PitcherRoleFlag; clusterAvg: number; min: number; max: number; roleAdjustment: number } {
  if (bfPerStart < 15) return { roleFlag: "SHORT_ROLE_OR_OPENER", clusterAvg: 42, min: 15, max: 55, roleAdjustment: -8 };
  if (bfPerStart < 18) return { roleFlag: "LIMITED_STARTER", clusterAvg: 68, min: 50, max: 78, roleAdjustment: -4 };
  if (bfPerStart < 21) return { roleFlag: "LOW_VOLUME_STARTER", clusterAvg: 80, min: 65, max: 88, roleAdjustment: -2 };
  if (bfPerStart < 24) return { roleFlag: "NORMAL_STARTER", clusterAvg: 88, min: 75, max: 98, roleAdjustment: 0 };
  return { roleFlag: "HIGH_VOLUME_STARTER", clusterAvg: 94, min: 82, max: 108, roleAdjustment: 2 };
}

function calculateProjectedPitchCount(
  pitching: Partial<AdvancedPitchingStats>,
  fatigue: { daysSinceLastStart?: number; pitchesLastStart?: number; pitchesLast3Starts?: number } | undefined
): number | null {
  const last5PitchCountAvg = safeFloat(pitching.last5PitchCountAvg) ?? safeFloat(pitching.projectedPitchCount);
  const pitchesLast3 = safeFloat(fatigue?.pitchesLast3Starts);
  const pitchesLast = safeFloat(fatigue?.pitchesLastStart);
  const bfPerStart = safeFloat(pitching.battersFacedPerStart);
  const pitcherRest = safeFloat(fatigue?.daysSinceLastStart);

  if (last5PitchCountAvg === null || bfPerStart === null) {
    return saneAveragePitchCount(last5PitchCountAvg);
  }

  const pitchesLast3Avg = pitchesLast3 !== null && pitchesLast3 > 0 ? pitchesLast3 / 3 : last5PitchCountAvg;
  const role = getPitcherRoleFromBfPerStart(bfPerStart);

  const projectedPitchesBase =
    (0.55 * last5PitchCountAvg) +
    (0.25 * pitchesLast3Avg) +
    (0.20 * role.clusterAvg);

  let restAdjustment = 0;
  if (pitcherRest !== null) {
    if (pitcherRest <= 2) restAdjustment = -10;
    else if (pitcherRest === 3) restAdjustment = -5;
    else if (pitcherRest === 5) restAdjustment = 2;
  }

  let workloadAdjustment = 0;
  if ((pitchesLast !== null && pitchesLast > 110) || (pitchesLast3 !== null && pitchesLast3 > 320)) {
    workloadAdjustment = -6;
  } else if ((pitchesLast !== null && pitchesLast > 100) || (pitchesLast3 !== null && pitchesLast3 > 295)) {
    workloadAdjustment = -3;
  } else if (pitchesLast !== null && pitchesLast < 65 && bfPerStart >= 18) {
    workloadAdjustment = -4;
  }

  const raw = projectedPitchesBase + restAdjustment + workloadAdjustment + role.roleAdjustment;
  let finalValue = Math.round(clampNumber(raw, role.min, role.max));

  if (bfPerStart < 15 || finalValue < 55) {
    finalValue = Math.round(clampNumber(raw, 15, 55));
  }

  return finalValue;
}

function isFinalGameStatus(status: any): boolean {
  const normalized = String(status || "").toLowerCase();
  return (
    normalized.includes("final") ||
    normalized === "game over" ||
    normalized === "completed early" ||
    normalized === "completed"
  );
}

const MLB_TEAM_ABBR: Record<string, string> = {
  "Arizona Diamondbacks": "ARI",
  "Athletics": "OAK",
  "Atlanta Braves": "ATL",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CHW",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  "Oakland Athletics": "OAK",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH"
};

function getTeamAbbr(teamName: string): string | null {
  return MLB_TEAM_ABBR[teamName] || null;
}

function normalizeTeamAbbr(value: any): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (/^[A-Z]{2,3}$/.test(upper)) return upper;
  return getTeamAbbr(raw);
}

function hasRealBettingLines(game: any): boolean {
  const summary = String(game?.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("estandar") || summary.includes("estándar") || summary.includes("sin lineas reales") || summary.includes("sin líneas reales")) {
    return false;
  }
  const lines = game?.betting_lines || {};
  const isSyntheticDefault =
    lines.openingMoneylineHome === -110 &&
    lines.openingMoneylineAway === -110 &&
    lines.currentMoneylineHome === -110 &&
    lines.currentMoneylineAway === -110 &&
    lines.runLineHome === -1.5 &&
    lines.runLineHomeOdds === -110 &&
    lines.runLineAway === 1.5 &&
    lines.runLineAwayOdds === -110 &&
    lines.totalRuns === 8.5 &&
    lines.overOdds === -110 &&
    lines.underOdds === -110;
  if (isSyntheticDefault) return false;
  return [
    lines.openingMoneylineHome,
    lines.openingMoneylineAway,
    lines.currentMoneylineHome,
    lines.currentMoneylineAway,
    lines.runLineHome,
    lines.runLineHomeOdds,
    lines.runLineAway,
    lines.runLineAwayOdds,
    lines.totalRuns,
    lines.overOdds,
    lines.underOdds
  ].some((value) => value !== null && value !== undefined);
}

function getBettingLineSource(game: any): string | null {
  if (!hasRealBettingLines(game)) return null;
  const explicitSource = game?.betting_lines?.lineSource;
  if (explicitSource) return explicitSource;
  const summary = String(game?.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("odds api")) return "the_odds_api";
  if (summary.includes("datastreak") || summary.includes("data streak")) return "datastreak";
  return null;
}

/** Fetch with an AbortController timeout (ms). Prevents indefinite hangs on MLB API. */
function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Call Gemini generateContent with up to `maxRetries` automatic retries on network failures. */
async function retryGeminiCall(
  fn: () => Promise<any>,
  maxRetries = 3,
  label = ""
): Promise<any> {
  let lastErr: any;
  // For quota errors we allow more retries and wait much longer
  let attempt = 0;
  let allowedRetries = maxRetries;

  while (attempt <= allowedRetries) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const errMsg = err?.message || String(err);
      const isFetchErr = errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("ECONNRESET");
      const isQuotaErr = errMsg.includes("429") || errMsg.includes("Quota") || errMsg.includes("RESOURCE_EXHAUSTED");

      if (isQuotaErr && attempt === 0) {
        allowedRetries = 5; // Allow more retries for 429 Quota issues
      }

      if (attempt < allowedRetries && (isFetchErr || isQuotaErr)) {
        // If it's a 429, we wait 65 seconds because Gemini free tier TPM limits often ask to "retry in 57s"
        const delay = isQuotaErr ? 65000 : (attempt + 1) * 2000;
        console.warn(`[Gemini] ${label} — intento ${attempt + 1}/${allowedRetries} fallido (${isQuotaErr ? 'QUOTA 429' : 'FETCH'}). Esperando ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

/** Fetch real betting lines for the given date from The Odds API */
async function fetchDataStreakSheetRows(
  date: string,
  statKey: string,
  cachePrefix: string,
  forceRefresh = false,
  excludeInjured = true
) {
  const cacheFile = path.join(process.cwd(), `${cachePrefix}${excludeInjured ? "" : "_all"}_${date}.json`);

  if (!forceRefresh && fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
    } catch (e) {
      console.warn(`Error leyendo cache de DataStreak ${statKey}, se descargara nuevamente.`, e);
    }
  }

  try {
    const url = `https://thedatastreak.com/api/v1/hit-rates/mlb/sheets-fast/${statKey}?target_date=${encodeURIComponent(date)}&sample_size=20&min_games=5&exclude_injured=${excludeInjured ? "true" : "false"}`;
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) {
      console.warn(`DataStreak ${statKey} respondio con error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    fs.writeFileSync(cacheFile, JSON.stringify(rows, null, 2));
    return rows;
  } catch (err) {
    console.warn(`Error al obtener ${statKey} de DataStreak:`, err);
    return [];
  }
}

async function fetchDataStreakPitcherStrikeoutProps(date: string, forceRefresh = false) {
  const dataStreakKs = await fetchDataStreakSheetRows(date, "mlb_pitcher_ks", "datastreak_pitcher_ks", forceRefresh, false);
  
  let rotowireKs: any[] = [];
  try {
    const rwData = await scrapeStrikeoutProps();
    rotowireKs = rwData.map(p => ({
      player_name: p.playerName,
      line: String(p.line),
      odds: p.overOdds !== null ? String(p.overOdds) : null,
      under_odds: p.underOdds !== null ? String(p.underOdds) : null,
      vendor: p.sportsbook || "rotowire",
      source: "rotowire"
    }));
  } catch(e) {
    console.warn("No se pudo obtener Rotowire Ks:", e);
  }

  return [...rotowireKs, ...dataStreakKs];
}

async function fetchDataStreakTotalBasesProps(date: string, forceRefresh = false) {
  // Omit total bases as requested by user
  return [];
}

function mergeDataStreakPitcherStrikeouts(events: any[], rows: any[]) {
  if (!Array.isArray(events) || !Array.isArray(rows) || rows.length === 0) return events;

  return events.map((event: any) => {
    const homeAbbr = getTeamAbbr(event.home_team);
    const awayAbbr = getTeamAbbr(event.away_team);
    if (!homeAbbr || !awayAbbr) return event;

    const eventRows = rows.filter((row: any) => {
      const team = String(row.team_abbr || row.team || "").toUpperCase();
      const opponent = String(row.opponent || "").toUpperCase();
      return (
        (team === homeAbbr && opponent === awayAbbr) ||
        (team === awayAbbr && opponent === homeAbbr)
      );
    });

    if (eventRows.length === 0) return event;

    const outcomes = eventRows.flatMap((row: any) => {
      const pitcherName = row.player_name || row.name;
      const point = safeFloat(row.line);
      const overOdds = safeFloat(row.odds);
      const underOdds = safeFloat(row.under_odds);
      const vendor = row.vendor || "datastreak";
      if (!pitcherName || point === null) return [];

      return [
        {
          name: "Over",
          description: pitcherName,
          point,
          price: overOdds,
          source: "datastreak",
          vendor
        },
        {
          name: "Under",
          description: pitcherName,
          point,
          price: underOdds,
          source: "datastreak",
          vendor
        }
      ];
    });

    if (outcomes.length === 0) return event;

    const datastreakBook = {
      key: "datastreak",
      title: "DataStreak",
      markets: [{ key: "pitcher_strikeouts", outcomes }]
    };

    return {
      ...event,
      bookmakers: [...(event.bookmakers || []), datastreakBook]
    };
  });
}

function normalizeName(value: any): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function enrichLineupWithTotalBasesProps(lineup: any[], rows: any[]) {
  if (!Array.isArray(lineup) || !Array.isArray(rows) || rows.length === 0) return lineup;

  return lineup.map((player: any) => {
    const playerName = normalizeName(player.player_name || player.name);
    const playerTeam = normalizeTeamAbbr(player.team);
    const match = rows.find((row: any) => {
      const rowName = normalizeName(row.player_name || row.name);
      const rowTeam = normalizeTeamAbbr(row.team_abbr || row.team);
      const isTeamMatch = (!playerTeam || !rowTeam || rowTeam === playerTeam);
      
      if (!isTeamMatch) return false;
      if (rowName === playerName) return true;
      
      const strippedRow = rowName.replace(/\s+/g, '');
      const strippedPlayer = playerName.replace(/\s+/g, '');
      if (strippedRow === strippedPlayer || strippedRow.includes(strippedPlayer) || strippedPlayer.includes(strippedRow)) return true;
      
      const pParts = playerName.split(' ');
      const rParts = rowName.split(' ');
      const pLast = pParts[pParts.length - 1];
      const rLast = rParts[rParts.length - 1];
      if (pLast && rLast && pLast === rLast && pParts[0][0] === rParts[0][0]) return true;

      return false;
    });

    if (!match) return player;

    return {
      ...player,
      totalBasesProp: safeFloat(match.line),
      totalBasesPropOverOdds: safeFloat(match.odds),
      totalBasesPropUnderOdds: safeFloat(match.under_odds),
      totalBasesPropBook: match.vendor || null,
      totalBasesPropSource: match.source || (match.vendor === "TheOddsAPI" ? "the_odds_api" : "datastreak"),
      totalBasesPropHitRate: safeFloat(match.hit_rate_pct ?? match.hit_rate),
      totalBasesPropHitRateDisplay: match.hit_rate_display || null
    };
  });
}

function findDataStreakPitcherKProp(rows: any[], pitcherName: string, pitcherTeam: string, opponentTeam: string) {
  if (!Array.isArray(rows) || rows.length === 0 || !pitcherName || pitcherName === "Por definir" || pitcherName === "TBD") {
    return null;
  }

  const normalizedPitcherName = normalizeName(pitcherName);
  const pitcherTeamAbbr = getTeamAbbr(pitcherTeam);
  const opponentTeamAbbr = getTeamAbbr(opponentTeam);

  const match = rows.find((row: any) => {
    const rowName = normalizeName(row.player_name || row.name);
    const rowTeam = String(row.team_abbr || row.team || "").toUpperCase();
    const rowOpponent = String(row.opponent || "").toUpperCase();
    const nameMatches = rowName === normalizedPitcherName || rowName.includes(normalizedPitcherName) || normalizedPitcherName.includes(rowName);
    const teamMatches = !pitcherTeamAbbr || !rowTeam || rowTeam === pitcherTeamAbbr;
    const opponentMatches = !opponentTeamAbbr || !rowOpponent || rowOpponent === opponentTeamAbbr;
    return nameMatches && teamMatches && opponentMatches;
  });

  if (!match) return null;

  return {
    point: safeFloat(match.line),
    overOdds: safeFloat(match.odds),
    underOdds: safeFloat(match.under_odds),
    book: match.vendor || "datastreak",
    source: match.source || "datastreak"
  };
}

async function enrichGamesWithTotalBasesProps(games: MLBGame[]): Promise<MLBGame[]> {
  const rowsByDate = new Map<string, any[]>();

  for (const game of games as any[]) {
    const gameDate = game?.metadata?.date;
    if (!gameDate || rowsByDate.has(gameDate)) continue;
    rowsByDate.set(gameDate, await fetchDataStreakTotalBasesProps(gameDate));
  }

  return (games as any[]).map((game) => {
    const gameDate = game?.metadata?.date;
    const rows = rowsByDate.get(gameDate) || [];
    if (!rows.length) return game;

    return {
      ...game,
  lineups: {
        home: enrichLineupWithTotalBasesProps(game.lineups?.home || [], rows),
        away: enrichLineupWithTotalBasesProps(game.lineups?.away || [], rows)
      }
    };
  }) as MLBGame[];
}

async function fetchRealBettingLines(date: string, forceRefreshOdds: boolean = false, gamesList: any[] = []) {
  const cacheFile = path.join(process.cwd(), `odds_cache_${date}.json`);

  // Check Cache first
  if (!forceRefreshOdds && fs.existsSync(cacheFile)) {
    try {
      console.log(`Leyendo cuotas desde el caché local: odds_cache_${date}.json`);
      const cached = fs.readFileSync(cacheFile, 'utf-8');
      return JSON.parse(cached);
    } catch (e) {
      console.warn("Error leyendo el caché de cuotas, se ignorará y se descargará nuevamente.", e);
    }
  }

  // Build ordered list of API keys (primary + backups)
  const apiKeys = [
    process.env.ODDS_API_KEY,
    process.env.ODDS_API_KEY_2,
    process.env.ODDS_API_KEY_3,
  ].filter(Boolean) as string[];

  if (apiKeys.length === 0) {
    console.warn("ODDS_API_KEY no configurada. No se obtendrán líneas de apuesta reales.");
    return null;
  }

  // Try each key until one works
  let activeKey: string | null = null;
  let data: any[] | null = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const key = apiKeys[i];
    const label = i === 0 ? "principal" : `respaldo ${i}`;
    const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${key}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    console.log(`[Odds API] Intentando con key ${label} (${key.substring(0, 8)}...)...`);
    try {
      const res = await fetchWithTimeout(url, 10000);
      if (res.ok) {
        data = await res.json();
        activeKey = key;
        console.log(`[Odds API] Key ${label} funcionó. ${data?.length ?? 0} eventos recibidos.`);
        break;
      }
      const errBody = await res.text();
      console.warn(`[Odds API] Key ${label} respondió con error ${res.status}: ${errBody}`);
    } catch (err) {
      console.warn(`[Odds API] Key ${label} falló con excepción:`, err);
    }
  }

  if (!activeKey || !data) {
    console.error("[Odds API] Todas las keys de The Odds API agotaron su cuota o fallaron.");
    return null;
  }

  try {
    // Fetch pitcher strikeouts for each event to support K Props
    // We do this concurrently to speed up the process
    const eventsWithProps = await Promise.all(data.map(async (event: any) => {
      try {
        // Skip fetching lines if game has started
        const mlbGame = gamesList.find(g =>
           (event.home_team.includes(g.teams.home.team.name) || g.teams.home.team.name.includes(event.home_team)) &&
           (event.away_team.includes(g.teams.away.team.name) || g.teams.away.team.name.includes(event.away_team))
        );
        if (mlbGame) {
           const status = mlbGame.status?.abstractGameState || "";
           const statusCode = mlbGame.status?.statusCode || "";
           // In MLB API: F = Final, I = In Progress, DI/Suspended = Suspended, O = Game Over. S means Scheduled!
           if (['Live', 'Final', 'Suspended'].includes(status) || ['F', 'I', 'O', 'DI'].includes(statusCode)) {
               console.log(`Saltando props para ${event.home_team} vs ${event.away_team} porque su estado es ${status} (${statusCode})`);
               return event;
           }
        }

        const propsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${event.id}/odds?apiKey=${activeKey}&regions=us&markets=pitcher_strikeouts&oddsFormat=american`;
        const propsRes = await fetchWithTimeout(propsUrl, 10000);
        if (propsRes.ok) {
          const propsData = await propsRes.json();
          // Merge bookmakers
          if (propsData && propsData.bookmakers) {
             for (const pb of propsData.bookmakers) {
                const existingB = event.bookmakers.find((b: any) => b.key === pb.key);
                if (existingB) {
                   existingB.markets.push(...pb.markets);
                } else {
                   event.bookmakers.push(pb);
                }
             }
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch K props for event ${event.id}`);
      }
      return event;
    }));

    const dataStreakPitcherKs = await fetchDataStreakPitcherStrikeoutProps(date, forceRefreshOdds);
    const eventsWithDataStreakProps = mergeDataStreakPitcherStrikeouts(eventsWithProps, dataStreakPitcherKs);

    // Save to Cache
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(eventsWithDataStreakProps, null, 2));
      console.log(`Cuotas guardadas en cache: odds_cache_${date}.json`);
    } catch (e) {
      console.warn("No se pudo guardar el cache de cuotas.", e);
    }

    return eventsWithDataStreakProps;
  } catch (err) {
    console.error("Error al obtener lineas de apuestas reales:", err);
    return null;
  }
}

async function fetchRealMLBGameData(
  gamePk: string,
  homeTeamId: number,
  awayTeamId: number,
  date: string
): Promise<any> {
  const season = date.substring(0, 4);
  const realData: any = {
    pitchers: { home: null, away: null },
    lineups: { home: [], away: [] },
    teamOffense: { home: null, away: null },
    bullpenERA: { home: null, away: null },
    pitcherIds: { home: null, away: null },
    currentPitching: { home: null, away: null },
    linescore: null,
    liveBoxscore: null,
    playByPlay: null,
    injuries: { home: [], away: [] }
  };
  try {
    // 1. Probable pitchers from schedule with hydration
    const schedRes = await fetchWithTimeout(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`
    );
    const schedData = await schedRes.json();
    let gameEntry: any = null;
    for (const d of schedData.dates || []) {
      for (const g of d.games || []) {
        if (String(g.gamePk) === String(gamePk)) { gameEntry = g; break; }
      }
    }

    const fetchPitcherStats = async (pitcher: any) => {
      if (!pitcher?.id) return null;
      try {
        const [statsRes, splitsRes, personRes] = await Promise.all([
          fetchWithTimeout(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=season&season=${season}&group=pitching`),
          fetchWithTimeout(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=statSplits&season=${season}&group=pitching&sitCodes=vl,vr`),
          fetchWithTimeout(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}`)
        ]);

        const statsData = statsRes.ok ? await statsRes.json() : {};
        const splitsData = splitsRes.ok ? await splitsRes.json() : {};
        const personData = personRes.ok ? await personRes.json() : {};

        const s = statsData.stats?.[0]?.splits?.[0]?.stat || {};
        const bf = parseInt(s.battersFaced) || 1;
        const kPct = s.strikeOuts
          ? Math.round((parseInt(s.strikeOuts) / bf) * 1000) / 10
          : null;
        const bbPct = s.baseOnBalls
          ? Math.round((parseInt(s.baseOnBalls) / bf) * 1000) / 10
          : null;

        const pitchHand = personData.people?.[0]?.pitchHand?.code || "R";

        // Splits parsing
        const splits = splitsData.stats?.[0]?.splits || [];
        let pitcher_allowed_avg_vs_lhb = 0;
        let pitcher_allowed_avg_vs_rhb = 0;
        let pitcher_allowed_slg_vs_lhb = 0;
        let pitcher_allowed_slg_vs_rhb = 0;

        for (const split of splits) {
          const code = split.split?.code;
          const stat = split.stat || {};
          if (code === "vl") { // vs Left
            pitcher_allowed_avg_vs_lhb = safeFloat(stat.avg) ?? 0;
            pitcher_allowed_slg_vs_lhb = safeFloat(stat.slg) ?? 0;
          } else if (code === "vr") { // vs Right
            pitcher_allowed_avg_vs_rhb = safeFloat(stat.avg) ?? 0;
            pitcher_allowed_slg_vs_rhb = safeFloat(stat.slg) ?? 0;
          }
        }

        return {
          name: pitcher.fullName,
          era: safeFloat(s.era),
          whip: safeFloat(s.whip),
          kPct,
          bbPct,
          wins: parseInt(s.wins) || 0,
          losses: parseInt(s.losses) || 0,
          ip: s.inningsPitched || "0.0",
          starts: parseInt(s.gamesPitched) || parseInt(s.gamesPlayed) || parseInt(s.gamesStarted) || 0,
          totalStrikeouts: parseInt(s.strikeOuts) || 0,
          totalWalks: parseInt(s.baseOnBalls) || 0,
          pitchHand,
          pitcher_allowed_avg_vs_lhb,
          pitcher_allowed_avg_vs_rhb,
          pitcher_allowed_slg_vs_lhb,
          pitcher_allowed_slg_vs_rhb
        };
      } catch (err) {
        console.error(`Error fetching stats/splits for pitcher ${pitcher.fullName}:`, err);
        return { name: pitcher.fullName };
      }
    };

    if (gameEntry) {
      realData.pitcherIds = {
        home: gameEntry.teams?.home?.probablePitcher?.id || null,
        away: gameEntry.teams?.away?.probablePitcher?.id || null
      };
      const [homePitcher, awayPitcher] = await Promise.all([
        fetchPitcherStats(gameEntry.teams?.home?.probablePitcher),
        fetchPitcherStats(gameEntry.teams?.away?.probablePitcher),
      ]);
      realData.pitchers.home = homePitcher;
      realData.pitchers.away = awayPitcher;
    }

    // 2. Lineup from boxscore (available once game is near start or live)
    const boxRes = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    const boxData = await boxRes.json();

    const getStarterGamePitching = (teamBox: any) => {
      const starterId = teamBox?.pitchers?.[0];
      if (!starterId) return null;
      const starter = teamBox.players?.[`ID${starterId}`];
      if (!starter?.stats?.pitching) return null;
      const s = starter?.stats?.pitching || {};
      return {
        actualStrikeouts: parseInt(s.strikeOuts) || 0,
        battersFaced: parseInt(s.battersFaced) || 0,
        pitchCount: parseInt(s.numberOfPitches) || parseInt(s.pitchesThrown) || 0,
        ip: s.inningsPitched || "0.0"
      };
    };

    realData.currentPitching = {
      home: getStarterGamePitching(boxData.teams?.home),
      away: getStarterGamePitching(boxData.teams?.away)
    };

    const parseLineupFromBox = async (teamBox: any, teamName: string) => {
      if (!teamBox?.battingOrder?.length) return [];
      const players = teamBox.players || {};
      const promises = teamBox.battingOrder.map(async (id: number, idx: number) => {
        const p = players[`ID${id}`];
        if (!p?.person?.fullName) return null;
        const s = p.seasonStats?.batting || {};
        const playerId = p.person.id;

        // Fetch last 7 days and splits concurrently
        const [last7, splits] = await Promise.all([
          fetchBatterLast7(playerId, season, date),
          fetchBatterSplits(playerId, season)
        ]);

        const plateAppearances = parseInt(s.plateAppearances) || 0;
        const strikeOuts = parseInt(s.strikeOuts) || 0;
        const baseOnBalls = parseInt(s.baseOnBalls) || 0;
        const hits = parseInt(s.hits) || 0;
        const doubles = parseInt(s.doubles) || 0;
        const triples = parseInt(s.triples) || 0;
        const homeRuns = parseInt(s.homeRuns) || 0;
        const sacrificeFlies = parseInt(s.sacrificeFlies) || 0;
        const hitByPitch = parseInt(s.hitByPitch) || 0;
        const intentionalWalks = parseInt(s.intentionalWalks) || 0;
        const atBats = parseInt(s.atBats) || 0;

        const avg = safeFloat(s.avg) ?? 0;
        const obp = safeFloat(s.obp) ?? 0;
        const slg = safeFloat(s.slg) ?? 0;
        const ops = safeFloat(s.ops) ?? 0;

        const iso = slg > 0 && avg > 0 ? Math.round((slg - avg) * 1000) / 1000 : 0;
        const strikeout_pct = plateAppearances > 0 ? Math.round((strikeOuts / plateAppearances) * 1000) / 10 : 0;
        const walk_pct = plateAppearances > 0 ? Math.round((baseOnBalls / plateAppearances) * 1000) / 10 : 0;

        // wOBA calculation
        const singles = hits - doubles - triples - homeRuns;
        const wobaDenom = atBats + baseOnBalls - intentionalWalks + sacrificeFlies + hitByPitch;
        const woba = wobaDenom > 0
          ? Math.round(((0.69 * (baseOnBalls - intentionalWalks) + 0.72 * hitByPitch + 0.88 * singles + 1.25 * doubles + 1.58 * triples + 2.05 * homeRuns) / wobaDenom) * 1000) / 1000
          : 0;

        return {
          name: p.person.fullName,
          id: playerId,
          mlbId: playerId,
          position: p.position?.abbreviation || "DH",
          avg: avg,
          ops: ops,
          hr: homeRuns,
          rbi: parseInt(s.rbi) || 0,
          kPct: strikeout_pct,

          // New fields
          player_name: p.person.fullName,
          team: teamName,
          bat_side: p.person.batSide?.code || "R",
          obp: obp,
          slg: slg,
          woba: woba,
          iso: iso,
          pa: plateAppearances,
          hits: hits,
          doubles: doubles,
          triples: triples,
          home_runs: homeRuns,
          strikeout_pct: strikeout_pct,
          walk_pct: walk_pct,
          batting_order: idx + 1,

          // Last 7 days & splits
          ...last7,
          ...splits
        };
      });

      const results = await Promise.all(promises);
      return results.filter(Boolean);
    };

    const [homeLineup, awayLineup] = await Promise.all([
      parseLineupFromBox(boxData.teams?.home, boxData.teams?.home?.team?.name || gameEntry?.teams?.home?.team?.name || "Home"),
      parseLineupFromBox(boxData.teams?.away, boxData.teams?.away?.team?.name || gameEntry?.teams?.away?.team?.name || "Away")
    ]);
    realData.lineups.home = homeLineup;
    realData.lineups.away = awayLineup;

    // Parse LiveBoxscore from boxData
    const parseLiveStats = (teamBox: any) => {
      const batters: any[] = [];
      const pitchers: any[] = [];
      if (!teamBox?.players) return { batters, pitchers };
      const players = teamBox.players;

      if (teamBox.batters) {
        teamBox.batters.forEach((id: number) => {
          const p = players[`ID${id}`];
          if (!p) return;
          const s = p.stats?.batting || {};
          const liveHits    = s.hits || 0;
          const liveDbl     = s.doubles || 0;
          const liveTpl     = s.triples || 0;
          const liveHr      = s.homeRuns || 0;
          const liveSingles = Math.max(0, liveHits - liveDbl - liveTpl - liveHr);
          batters.push({
            name: p.person?.fullName || "Bateador",
            position: p.position?.abbreviation || "DH",
            ab: s.atBats || 0,
            r: s.runs || 0,
            h: liveHits,
            rbi: s.rbi || 0,
            bb: s.baseOnBalls || 0,
            k: s.strikeOuts || 0,
            doubles: liveDbl,
            triples: liveTpl,
            home_runs: liveHr,
            total_bases: liveSingles + 2 * liveDbl + 3 * liveTpl + 4 * liveHr
          });
        });
      }

      if (teamBox.pitchers) {
        teamBox.pitchers.forEach((id: number) => {
          const p = players[`ID${id}`];
          if (!p) return;
          const s = p.stats?.pitching || {};
          pitchers.push({
            name: p.person?.fullName || "Lanzador",
            position: "P",
            ip: s.inningsPitched || "0.0",
            h: s.hits || 0,
            r: s.runs || 0,
            er: s.earnedRuns || 0,
            bb: s.baseOnBalls || 0,
            k: s.strikeOuts || 0,
            bf: s.battersFaced ?? "",
            pitches: s.numberOfPitches || 0
          });
        });
      }
      return { batters, pitchers };
    };

    realData.liveBoxscore = {
      home: parseLiveStats(boxData.teams?.home),
      away: parseLiveStats(boxData.teams?.away)
    };

    // 3. If lineup not yet confirmed (pre-game), use top batters from active roster by PA
    const fetchTopBattersFromRoster = async (teamId: number, teamName: string) => {
      try {
        const r = await fetchWithTimeout(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&season=${season}&hydrate=person(stats(type=season,group=hitting))`
        );
        const d = await r.json();
        const roster: any[] = d.roster || [];
        const top9 = roster
          .filter((p: any) => {
            const pa = parseInt(
              p.person?.stats?.[0]?.splits?.[0]?.stat?.plateAppearances || "0"
            );
            return pa > 0;
          })
          .sort((a: any, b: any) => {
            const paA = parseInt(a.person?.stats?.[0]?.splits?.[0]?.stat?.plateAppearances || "0");
            const paB = parseInt(b.person?.stats?.[0]?.splits?.[0]?.stat?.plateAppearances || "0");
            return paB - paA;
          })
          .slice(0, 9);

        const promises = top9.map(async (p: any, idx: number) => {
          const s = p.person?.stats?.[0]?.splits?.[0]?.stat || {};
          const playerId = p.person.id;

          // Fetch last 7 days and splits concurrently
          const [last7, splits] = await Promise.all([
            fetchBatterLast7(playerId, season, date),
            fetchBatterSplits(playerId, season)
          ]);

          const plateAppearances = parseInt(s.plateAppearances) || 0;
          const strikeOuts = parseInt(s.strikeOuts) || 0;
          const baseOnBalls = parseInt(s.baseOnBalls) || 0;
          const hits = parseInt(s.hits) || 0;
          const doubles = parseInt(s.doubles) || 0;
          const triples = parseInt(s.triples) || 0;
          const homeRuns = parseInt(s.homeRuns) || 0;
          const sacrificeFlies = parseInt(s.sacrificeFlies) || 0;
          const hitByPitch = parseInt(s.hitByPitch) || 0;
          const intentionalWalks = parseInt(s.intentionalWalks) || 0;
          const atBats = parseInt(s.atBats) || 0;

          const avg = safeFloat(s.avg) ?? 0;
          const obp = safeFloat(s.obp) ?? 0;
          const slg = safeFloat(s.slg) ?? 0;
          const ops = safeFloat(s.ops) ?? 0;

          const iso = slg > 0 && avg > 0 ? Math.round((slg - avg) * 1000) / 1000 : 0;
          const strikeout_pct = plateAppearances > 0 ? Math.round((strikeOuts / plateAppearances) * 1000) / 10 : 0;
          const walk_pct = plateAppearances > 0 ? Math.round((baseOnBalls / plateAppearances) * 1000) / 10 : 0;

          // wOBA calculation
          const singles = hits - doubles - triples - homeRuns;
          const wobaDenom = atBats + baseOnBalls - intentionalWalks + sacrificeFlies + hitByPitch;
          const woba = wobaDenom > 0
            ? Math.round(((0.69 * (baseOnBalls - intentionalWalks) + 0.72 * hitByPitch + 0.88 * singles + 1.25 * doubles + 1.58 * triples + 2.05 * homeRuns) / wobaDenom) * 1000) / 1000
            : 0;

          return {
            name: p.person.fullName,
            id: playerId,
            mlbId: playerId,
            position: p.position?.abbreviation || "DH",
            avg: avg,
            ops: ops,
            hr: homeRuns,
            rbi: parseInt(s.rbi) || 0,
            kPct: strikeout_pct,

            // New fields
            player_name: p.person.fullName,
            team: teamName,
            bat_side: p.person.batSide?.code || "R",
            obp: obp,
            slg: slg,
            woba: woba,
            iso: iso,
            pa: plateAppearances,
            hits: hits,
            doubles: doubles,
            triples: triples,
            home_runs: homeRuns,
            strikeout_pct: strikeout_pct,
            walk_pct: walk_pct,
            batting_order: idx + 1,

            // Last 7 days & splits
            ...last7,
            ...splits
          };
        });

        const results = await Promise.all(promises);
        return results;
      } catch {
        return [];
      }
    };

    if (realData.lineups.home.length === 0) {
      const homeTeamName = boxData.teams?.home?.team?.name || gameEntry?.teams?.home?.team?.name || "Home";
      realData.lineups.home = await fetchTopBattersFromRoster(homeTeamId, homeTeamName);
    }
    if (realData.lineups.away.length === 0) {
      const awayTeamName = boxData.teams?.away?.team?.name || gameEntry?.teams?.away?.team?.name || "Away";
      realData.lineups.away = await fetchTopBattersFromRoster(awayTeamId, awayTeamName);
    }

    // 4. Team offensive & bullpen stats
    const fetchTeamOffense = async (teamId: number) => {
      try {
        const r = await fetchWithTimeout(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&season=${season}&group=hitting`
        );
        const d = await r.json();
        const s = d.stats?.[0]?.splits?.[0]?.stat || {};
        const games = parseInt(s.gamesPlayed) || 1;
        return {
          runsPerGame: s.runs
            ? Math.round((parseInt(s.runs) / games) * 10) / 10
            : null,
          strikeoutsPerGame: s.strikeOuts
            ? Math.round((parseInt(s.strikeOuts) / games) * 10) / 10
            : null,
          ops: safeFloat(s.ops),
          obp: safeFloat(s.obp),
          slg: safeFloat(s.slg),
        };
      } catch {
        return null;
      }
    };

    const fetchTeamBullpenERA = async (teamId: number) => {
      try {
        const r = await fetchWithTimeout(
          `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?group=pitching&stats=statSplits&sitCodes=rp&season=${season}`
        );
        const d = await r.json();
        const s = d.stats?.[0]?.splits?.[0]?.stat || {};
        return safeFloat(s.era);
      } catch {
        return null;
      }
    };

    const fetchLinescore = async () => {
      try {
        const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`);
        const d = await r.json();
        if (!d.innings) return null;
        return {
          innings: d.innings.map((i: any) => ({
            num: i.num,
            home: { runs: i.home?.runs || 0, hits: i.home?.hits || 0, errors: i.home?.errors || 0 },
            away: { runs: i.away?.runs || 0, hits: i.away?.hits || 0, errors: i.away?.errors || 0 }
          })),
          homeTotals: { runs: d.teams?.home?.runs || 0, hits: d.teams?.home?.hits || 0, errors: d.teams?.home?.errors || 0 },
          awayTotals: { runs: d.teams?.away?.runs || 0, hits: d.teams?.away?.hits || 0, errors: d.teams?.away?.errors || 0 },
          currentInning: d.currentInning,
          currentInningOrdinal: d.currentInningOrdinal,
          inningState: d.inningState,
          inningHalf: d.inningHalf,
          isTopInning: d.isTopInning
        };
      } catch { return null; }
    };

    const fetchPxP = async () => {
      try {
        const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay`);
        const d = await r.json();
        const allPlays = d.allPlays || [];

        const mappedAllPlays = allPlays.map((p: any) => ({
          description: p.result?.description || "",
          inning: `${p.about?.halfInning === 'top' ? 'Top' : 'Bot'} ${p.about?.inning || 1}`,
          score: `${p.result?.awayScore || 0} - ${p.result?.homeScore || 0}`,
          isScoringPlay: p.about?.isScoringPlay || false
        }));

        const scoring = mappedAllPlays.filter((p: any) => p.isScoringPlay);

        let currentPlay = null;
        const cp = d.currentPlay;
        if (cp) {
          currentPlay = {
            description: cp.result?.description || cp.playEvents?.[cp.playEvents.length - 1]?.details?.description || "En progreso...",
            inning: `${cp.about?.halfInning === 'top' ? 'Top' : 'Bot'} ${cp.about?.inning || 1}`,
            score: `${cp.result?.awayScore || 0} - ${cp.result?.homeScore || 0}`,
            isScoringPlay: cp.about?.isScoringPlay || false
          };
        }
        return { scoringPlays: scoring, currentPlay, allPlays: mappedAllPlays };
      } catch { return null; }
    };

    const fetchInjuries = async (teamId: number) => {
      try {
        const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man`);
        const d = await r.json();
        const roster = d.roster || [];
        return roster.filter((p: any) => p.status.code !== 'A').map((p: any) => ({
          player: p.person.fullName,
          status: p.status.description || p.status.code,
          detail: "Reporte oficial de MLB (40-Man Roster)"
        }));
      } catch { return []; }
    };

    const [homeOff, awayOff, homeBullpenERA, awayBullpenERA, ls, pxp, homeInj, awayInj] = await Promise.all([
      fetchTeamOffense(homeTeamId),
      fetchTeamOffense(awayTeamId),
      fetchTeamBullpenERA(homeTeamId),
      fetchTeamBullpenERA(awayTeamId),
      fetchLinescore(),
      fetchPxP(),
      fetchInjuries(homeTeamId),
      fetchInjuries(awayTeamId)
    ]);

    realData.teamOffense.home = homeOff;
    realData.teamOffense.away = awayOff;
    realData.bullpenERA.home = homeBullpenERA;
    realData.bullpenERA.away = awayBullpenERA;
    realData.linescore = ls;
    realData.playByPlay = pxp;
    realData.injuries.home = homeInj;
    realData.injuries.away = awayInj;
  } catch (err) {
    console.error(`Error fetching real MLB data for game ${gamePk}:`, err);
  }

  return realData;
}

// --------------------------------------------------------------------
// Stadium Coordinates and Weather / ML Helpers
// --------------------------------------------------------------------
interface VenueCoords {
  lat: number;
  lon: number;
  timezone: string;
}

const STADIUM_COORDINATES: Record<string, VenueCoords> = {
  "chase field": { lat: 33.4453, lon: -112.0667, timezone: "America/Phoenix" },
  "truist park": { lat: 33.8907, lon: -84.4678, timezone: "America/New_York" },
  "camden yards": { lat: 39.2840, lon: -76.6216, timezone: "America/New_York" },
  "oriole park": { lat: 39.2840, lon: -76.6216, timezone: "America/New_York" },
  "fenway park": { lat: 42.3467, lon: -71.0972, timezone: "America/New_York" },
  "wrigley field": { lat: 41.9484, lon: -87.6553, timezone: "America/Chicago" },
  "guaranteed rate field": { lat: 41.8299, lon: -87.6337, timezone: "America/Chicago" },
  "great american ball park": { lat: 39.0979, lon: -84.5071, timezone: "America/New_York" },
  "progressive field": { lat: 41.4958, lon: -81.6852, timezone: "America/New_York" },
  "coors field": { lat: 39.7558, lon: -104.9942, timezone: "America/Denver" },
  "comerica park": { lat: 42.3390, lon: -83.0485, timezone: "America/New_York" },
  "minute maid park": { lat: 29.7573, lon: -95.3555, timezone: "America/Chicago" },
  "kauffman stadium": { lat: 39.0517, lon: -94.4803, timezone: "America/Chicago" },
  "angel stadium": { lat: 33.8003, lon: -117.8827, timezone: "America/Los_Angeles" },
  "dodger stadium": { lat: 34.0739, lon: -118.2400, timezone: "America/Los_Angeles" },
  "loandepot park": { lat: 25.7781, lon: -80.2197, timezone: "America/New_York" },
  "marlins park": { lat: 25.7781, lon: -80.2197, timezone: "America/New_York" },
  "american family field": { lat: 43.0285, lon: -87.9712, timezone: "America/Chicago" },
  "miller park": { lat: 43.0285, lon: -87.9712, timezone: "America/Chicago" },
  "target field": { lat: 44.9817, lon: -93.2778, timezone: "America/Chicago" },
  "citi field": { lat: 40.7571, lon: -73.8458, timezone: "America/New_York" },
  "yankee stadium": { lat: 40.8296, lon: -73.9262, timezone: "America/New_York" },
  "coliseum": { lat: 37.7516, lon: -122.2005, timezone: "America/Los_Angeles" },
  "citizens bank park": { lat: 39.9061, lon: -75.1665, timezone: "America/New_York" },
  "pnc park": { lat: 40.4469, lon: -80.0057, timezone: "America/New_York" },
  "petco park": { lat: 32.7073, lon: -117.1567, timezone: "America/Los_Angeles" },
  "oracle park": { lat: 37.7786, lon: -122.3892, timezone: "America/Los_Angeles" },
  "at&t park": { lat: 37.7786, lon: -122.3892, timezone: "America/Los_Angeles" },
  "t-mobile park": { lat: 47.5914, lon: -122.3325, timezone: "America/Los_Angeles" },
  "safeco field": { lat: 47.5914, lon: -122.3325, timezone: "America/Los_Angeles" },
  "busch stadium": { lat: 38.6226, lon: -90.1928, timezone: "America/Chicago" },
  "tropicana field": { lat: 27.7682, lon: -82.6534, timezone: "America/New_York" },
  "globe life field": { lat: 32.7473, lon: -97.0817, timezone: "America/Chicago" },
  "rogers centre": { lat: 43.6414, lon: -79.3894, timezone: "America/New_York" },
  "nationals park": { lat: 38.8730, lon: -77.0074, timezone: "America/New_York" }
};

function weatherCodeToSkyStatus(code: number): string {
  if (code === 0) return "Cielo Despejado";
  if (code >= 1 && code <= 3) return "Parcialmente Nublado";
  if (code === 45 || code === 48) return "Niebla";
  if ((code >= 51 && code <= 55) || (code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return "Lluvia";
  if (code >= 71 && code <= 77) return "Nieve";
  if (code >= 95) return "Tormenta";
  return "Despejado";
}

async function fetchWeatherData(venue: string, date: string, gameDateISO: string): Promise<WeatherData | undefined> {
  try {
    const venueLower = venue.toLowerCase();
    let coords = STADIUM_COORDINATES["yankee stadium"]; // default
    for (const key of Object.keys(STADIUM_COORDINATES)) {
      if (venueLower.includes(key)) {
        coords = STADIUM_COORDINATES[key];
        break;
      }
    }
    const { lat, lon, timezone } = coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,pressure_msl,wind_speed_10m,wind_direction_10m,weather_code&timezone=${encodeURIComponent(timezone)}`;

    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) {
      console.warn(`Open-Meteo responded with status ${res.status}`);
      return undefined;
    }
    const data = await res.json();
    if (!data.hourly || !data.hourly.time) return undefined;

    const hourStr = new Date(gameDateISO).toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false
    });
    const hour = parseInt(hourStr) || 12;
    const idx = Math.min(Math.max(hour, 0), 23);

    const hData = data.hourly;
    return {
      temp: safeFloat(hData.temperature_2m?.[idx]) ?? 20,
      humidity: safeFloat(hData.relative_humidity_2m?.[idx]) ?? 50,
      windSpeed: safeFloat(hData.wind_speed_10m?.[idx]) ?? 10,
      windDirection: safeFloat(hData.wind_direction_10m?.[idx]) ?? 0,
      pressure: safeFloat(hData.pressure_msl?.[idx]) ?? 1013,
      rainProbability: safeFloat(hData.precipitation_probability?.[idx]) ?? 0,
      skyStatus: weatherCodeToSkyStatus(hData.weather_code?.[idx] ?? 0),
      apparentTemp: safeFloat(hData.apparent_temperature?.[idx]) ?? 20,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error(`Error fetching weather for venue ${venue}:`, err);
    return undefined;
  }
}

async function fetchOffensiveSplits(teamId: number, season: string): Promise<any> {
  const defaultSplit = { avg: 0.250, ops: 0.720, obp: 0.320, slg: 0.400, runsPerGame: 4.5, hr: 15, kPct: 20.0 };
  try {
    const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&season=${season}&group=hitting&sitCodes=vl,vr`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return { vsRhp: defaultSplit, vsLhp: defaultSplit };
    const data = await res.json();
    const splits = data.stats?.[0]?.splits || [];

    let vsRhp = { ...defaultSplit };
    let vsLhp = { ...defaultSplit };

    for (const split of splits) {
      const code = split.split?.code;
      const s = split.stat || {};
      const gp = parseInt(s.gamesPlayed) || 1;
      const pa = parseInt(s.plateAppearances) || 0;
      const so = parseInt(s.strikeOuts) || 0;
      const splitData = {
        avg: safeFloat(s.avg) ?? 0.250,
        ops: safeFloat(s.ops) ?? 0.720,
        obp: safeFloat(s.obp) ?? 0.320,
        slg: safeFloat(s.slg) ?? 0.400,
        runsPerGame: s.runs ? Math.round((parseInt(s.runs) / gp) * 10) / 10 : 4.5,
        hr: parseInt(s.homeRuns) || 0,
        kPct: pa > 0 ? Math.round((so / pa) * 1000) / 10 : 20.0
      };
      if (code === "vr") {
        vsRhp = splitData;
      } else if (code === "vl") {
        vsLhp = splitData;
      }
    }
    return { vsRhp, vsLhp };
  } catch (err) {
    console.error(`Error fetching splits for team ${teamId}:`, err);
    return { vsRhp: defaultSplit, vsLhp: defaultSplit };
  }
}

async function fetchAdvancedPitching(pitcherId: number, season: string): Promise<AdvancedPitchingStats> {
  const defaults: AdvancedPitchingStats = {
    xEra: null, fip: null, xFip: null, siera: null,
    hardHitPct: null, barrelPct: null, groundBallPct: null, flyBallPct: null,
    strikeoutRate: null, walkRate: null, swingingStrikePct: null
  };
  if (!pitcherId) return defaults;
  try {
    const stdUrl = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=season,seasonAdvanced&season=${season}&group=pitching`;
    const stdRes = await fetchWithTimeout(stdUrl, 5000);
    let stdStat: any = {};
    let advStat: any = {};
    if (stdRes.ok) {
      const stdData = await stdRes.json();
      const seasonStats = stdData.stats?.find((s: any) => s.type.displayName === "season");
      const advancedStats = stdData.stats?.find((s: any) => s.type.displayName === "seasonAdvanced");
      stdStat = seasonStats?.splits?.[0]?.stat || {};
      advStat = advancedStats?.splits?.[0]?.stat || {};
    }

    if (!stdStat.inningsPitched) {
      return defaults;
    }

    const hr = parseInt(stdStat.homeRuns) || 0;
    const bb = parseInt(stdStat.baseOnBalls) || 0;
    const hbp = parseInt(stdStat.hitByPitch) || 0;
    const so = parseInt(stdStat.strikeOuts) || 0;
    const ipOuts = inningsToOuts(stdStat.inningsPitched);
    const ip = ipOuts > 0 ? ipOuts / 3 : 0;

    // FIP Formula: ((13*HR + 3*(BB+HBP) - 2*SO)/IP) + 3.2
    const fipConstant = 3.2;
    const fip = ip > 0 ? roundNumber(((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + fipConstant), 2) : null;

    const bf = parseInt(stdStat.battersFaced) || 0;
    const strikeoutRate = bf > 0 && stdStat.strikeOuts ? Math.round((parseInt(stdStat.strikeOuts) / bf) * 1000) / 10 : null;
    const walkRate = bf > 0 && stdStat.baseOnBalls ? Math.round((parseInt(stdStat.baseOnBalls) / bf) * 1000) / 10 : null;

    let groundBallPct: number | null = null;
    let flyBallPct: number | null = null;

    const gb = (parseInt(advStat.groundHits) || 0) + (parseInt(advStat.groundOuts) || 0);
    const fb = (parseInt(advStat.flyHits) || 0) + (parseInt(advStat.flyOuts) || 0);
    const ld = (parseInt(advStat.lineHits) || 0) + (parseInt(advStat.lineOuts) || 0);
    const pu = (parseInt(advStat.popHits) || 0) + (parseInt(advStat.popOuts) || 0);
    const totalBip = gb + fb + ld + pu;
    const leagueHrPerFlyBallRate = 0.105;
    const xHr = fb * leagueHrPerFlyBallRate;
    const xFip = ip > 0 && fb > 0
      ? roundNumber(((13 * xHr + 3 * (bb + hbp) - 2 * so) / ip + fipConstant), 2)
      : null;
    const soPerPa = bf > 0 ? so / bf : null;
    const bbPerPa = bf > 0 ? (bb + hbp) / bf : null;
    const gbMinusFbPuPerPa = bf > 0 ? (gb - fb - pu) / bf : null;
    const siera = soPerPa !== null && bbPerPa !== null && gbMinusFbPuPerPa !== null
      ? roundNumber(
          6.145
          - 16.986 * soPerPa
          + 11.434 * bbPerPa
          - 1.858 * gbMinusFbPuPerPa
          + 7.653 * Math.pow(soPerPa, 2)
          + 6.664 * Math.pow(gbMinusFbPuPerPa, 2)
          + 10.130 * soPerPa * gbMinusFbPuPerPa
          - 5.195 * bbPerPa * gbMinusFbPuPerPa,
          2
        )
      : null;

    if (totalBip > 0) {
      groundBallPct = Math.round((gb / totalBip) * 1000) / 10;
      flyBallPct = Math.round((fb / totalBip) * 1000) / 10;
    } else {
      const go = parseInt(stdStat.groundOuts) || 0;
      const ao = parseInt(stdStat.airOuts) || 0;
      const totalOuts = go + ao;
      groundBallPct = totalOuts > 0 ? Math.round((go / totalOuts) * 1000) / 10 : null;
      flyBallPct = totalOuts > 0 ? Math.round((ao / totalOuts) * 1000) / 10 : null;
    }

    const pitches = stdStat.numberOfPitches ? parseInt(stdStat.numberOfPitches) : (bf && advStat.pitchesPerPlateAppearance ? Math.round(bf * parseFloat(advStat.pitchesPerPlateAppearance)) : 0);
    const swingingStrikePct = pitches > 0 && advStat.swingAndMisses ? Math.round((parseInt(advStat.swingAndMisses) / pitches) * 1000) / 10 : null;

    const gs = parseInt(stdStat.gamesPitched) || parseInt(stdStat.gamesPlayed) || parseInt(stdStat.gamesStarted) || 0;
    const projectedPitchCount = saneAveragePitchCount(gs > 0 ? Math.round((parseInt(stdStat.numberOfPitches) || 0) / gs) : null);
    const battersFacedPerStart = saneBattersFacedPerStart(gs > 0 ? Math.round(((parseInt(stdStat.battersFaced) || 0) / gs) * 10) / 10 : null);

    const strikes = parseInt(stdStat.strikes) || 0;
    const totalSwings = parseInt(advStat.totalSwings) || 0;
    const swingAndMisses = parseInt(advStat.swingAndMisses) || 0;
    const cswPct = pitches > 0 && strikes > 0 && totalSwings > 0 
      ? Math.round(((strikes - totalSwings + swingAndMisses) / pitches) * 1000) / 10 
      : null;

    // Note: xEra, hardHitPct, barrelPct are injected after this call from savantCache
    return {
      xEra: null,
      fip: fip,
      xFip,
      siera,
      hardHitPct: null,
      barrelPct: null,
      groundBallPct,
      flyBallPct,
      strikeoutRate,
      walkRate,
      swingingStrikePct,
      cswPct,
      projectedPitchCount,
      battersFacedPerStart
    };
  } catch (err) {
    console.error(`Error fetching advanced pitching for ${pitcherId}:`, err);
    return defaults;
  }
}

async function fetchAdvancedPitchingLast7(pitcherId: number, season: string, targetDateStr: string): Promise<AdvancedPitchingStats> {
  const defaults: AdvancedPitchingStats = {
    xEra: null, fip: null, xFip: null, siera: null,
    hardHitPct: null, barrelPct: null, groundBallPct: null, flyBallPct: null,
    strikeoutRate: null, walkRate: null, swingingStrikePct: null
  };
  if (!pitcherId) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return defaults;
    const data = await res.json();
    let logs = data.stats?.[0]?.splits || [];

    // Filter by date (must be strictly before targetDate)
    const targetDate = new Date(targetDateStr);
    logs = logs.filter((log: any) => log.date && new Date(log.date) < targetDate);
    // Sort descending by date
    logs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // Take last 7
    logs = logs.slice(0, 7);

    if (logs.length === 0) return defaults;

    let hr = 0, bb = 0, hbp = 0, so = 0, ipOuts = 0, bf = 0, go = 0, ao = 0;
    let er = 0, hits = 0, wins = 0, losses = 0;

    for (const log of logs) {
      const s = log.stat || {};
      hr += parseInt(s.homeRuns) || 0;
      bb += parseInt(s.baseOnBalls) || 0;
      hbp += parseInt(s.hitByPitch) || 0;
      so += parseInt(s.strikeOuts) || 0;
      bf += parseInt(s.battersFaced) || 0;
      go += parseInt(s.groundOuts) || 0;
      ao += parseInt(s.airOuts) || 0;

      const ipStr = String(s.inningsPitched || "0.0");
      const parts = ipStr.split('.');
      const w = parseInt(parts[0]) || 0;
      const f = parseInt(parts[1]) || 0;
      ipOuts += (w * 3) + f;

      er += parseInt(s.earnedRuns) || 0;
      hits += parseInt(s.hits) || 0;
      if (s.wins && parseInt(s.wins) > 0) wins++;
      if (s.losses && parseInt(s.losses) > 0) losses++;
    }

    const ip = ipOuts / 3;
    const fip = ip > 0 ? Math.round(((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + 3.2) * 100) / 100 : null;
    const strikeoutRate = bf > 0 ? Math.round((so / bf) * 1000) / 10 : null;
    const walkRate = bf > 0 ? Math.round((bb / bf) * 1000) / 10 : null;
    const totalOuts = go + ao;
    const groundBallPct = totalOuts > 0 ? Math.round((go / totalOuts) * 1000) / 10 : null;
    const flyBallPct = totalOuts > 0 ? Math.round((ao / totalOuts) * 1000) / 10 : null;

    const era = ip > 0 ? ((er * 9) / ip).toFixed(2) : null;
    const whip = ip > 0 ? ((bb + hits) / ip).toFixed(2) : null;
    const ipString = `${Math.floor(ipOuts / 3)}.${ipOuts % 3}`;

    return {
      ...defaults,
      fip,
      strikeoutRate,
      walkRate,
      groundBallPct,
      flyBallPct,
      era,
      whip,
      ip: ipString,
      wins,
      losses
    };
  } catch (err) {
    console.error(`Error fetching last 7 for ${pitcherId}:`, err);
    return defaults;
  }
}

async function fetchPitcherLast5Profile(pitcherId: number, season: string, targetDateStr: string): Promise<Partial<AdvancedPitchingStats>> {
  if (!pitcherId) return {};
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return {};
    const data = await res.json();
    const targetDate = new Date(targetDateStr);
    let logs = data.stats?.[0]?.splits || [];

    logs = logs
      .filter((log: any) => log.date && new Date(log.date) < targetDate)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const starts = logs.filter((log: any) => {
      const s = log.stat || {};
      const gamesStarted = parseInt(s.gamesStarted);
      if (!isNaN(gamesStarted)) return gamesStarted > 0;
      return inningsToOuts(s.inningsPitched) >= 9;
    });

    const last5 = (starts.length > 0 ? starts : logs).slice(0, 5);
    if (last5.length === 0) return {};

    const ks = last5.map((log: any) => parseInt(log.stat?.strikeOuts) || 0);
    const ip = last5.map((log: any) => outsToInnings(inningsToOuts(log.stat?.inningsPitched)));
    const bf = last5.map((log: any) => parseInt(log.stat?.battersFaced) || 0).filter((value: number) => value > 0);
    const pitchCounts = last5
      .map((log: any) => parseInt(log.stat?.numberOfPitches) || parseInt(log.stat?.pitchesThrown) || 0)
      .filter((value: number) => value > 0);

    const last5BfAvg = saneBattersFacedPerStart(average(bf, 1));
    const last5PitchCountAvg = saneAveragePitchCount(average(pitchCounts, 0));
    const last3 = last5.slice(0, 3);
    const last3Ks = last3.map((log: any) => parseInt(log.stat?.strikeOuts) || 0);
    const last3Ip = last3.map((log: any) => outsToInnings(inningsToOuts(log.stat?.inningsPitched)));
    const last3Bf = last3.map((log: any) => parseInt(log.stat?.battersFaced) || 0);

    return {
      last5KsAvg: average(ks, 2),
      last5KsStd: standardDeviation(ks, 2),
      last5IpAvg: average(ip, 1),
      last5BfAvg,
      last5PitchCountAvg,
      last3Ks1: last3Ks[0] ?? null,
      last3Ks2: last3Ks[1] ?? null,
      last3Ks3: last3Ks[2] ?? null,
      last3Ip1: last3Ip[0] ?? null,
      last3Ip2: last3Ip[1] ?? null,
      last3Ip3: last3Ip[2] ?? null,
      last3Bf1: last3Bf[0] || null,
      last3Bf2: last3Bf[1] || null,
      last3Bf3: last3Bf[2] || null,
      projectedPitchCount: last5PitchCountAvg,
      battersFacedPerStart: last5BfAvg
    };
  } catch (err) {
    console.error(`Error fetching last 5 profile for pitcher ${pitcherId}:`, err);
    return {};
  }
}

async function fetchBatterLast7(batterId: number, season: string, targetDateStr: string) {
  const defaults = {
    last7_avg: 0,
    last7_ops: 0,
    last7_slg: 0,
    last7_total_bases: 0,
    last7_hits: 0,
    last7_xbh: 0
  };
  if (!batterId) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=gameLog&season=${season}&group=hitting`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return defaults;
    const data = await res.json();
    let logs = data.stats?.[0]?.splits || [];

    const targetDate = new Date(targetDateStr);
    logs = logs.filter((log: any) => log.date && new Date(log.date) < targetDate);
    logs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    logs = logs.slice(0, 7);

    if (logs.length === 0) return defaults;

    let hits = 0, ab = 0, doubles = 0, triples = 0, hr = 0, bb = 0, hbp = 0, sf = 0;
    for (const log of logs) {
      const s = log.stat || {};
      hits += parseInt(s.hits) || 0;
      ab += parseInt(s.atBats) || 0;
      doubles += parseInt(s.doubles) || 0;
      triples += parseInt(s.triples) || 0;
      hr += parseInt(s.homeRuns) || 0;
      bb += parseInt(s.baseOnBalls) || 0;
      hbp += parseInt(s.hitByPitch) || 0;
      sf += parseInt(s.sacrificeFlies) || 0;
    }

    const singles = hits - doubles - triples - hr;
    const totalBases = singles + (2 * doubles) + (3 * triples) + (4 * hr);
    const xbh = doubles + triples + hr;

    const avg = ab > 0 ? Math.round((hits / ab) * 1000) / 1000 : 0;
    const obpDenom = ab + bb + hbp + sf;
    const obp = obpDenom > 0 ? Math.round(((hits + bb + hbp) / obpDenom) * 1000) / 1000 : 0;
    const slg = ab > 0 ? Math.round((totalBases / ab) * 1000) / 1000 : 0;
    const ops = Math.round((obp + slg) * 1000) / 1000;

    return {
      last7_avg: avg,
      last7_ops: ops,
      last7_slg: slg,
      last7_total_bases: totalBases,
      last7_hits: hits,
      last7_xbh: xbh
    };
  } catch (err) {
    console.error(`Error fetching batter last 7 days for ${batterId}:`, err);
    return defaults;
  }
}

async function fetchBatterSplits(batterId: number, season: string) {
  const defaults = {
    ops_vs_rhp: 0,
    ops_vs_lhp: 0,
    slg_vs_rhp: 0,
    slg_vs_lhp: 0,
    k_pct_vs_rhp: 0,
    k_pct_vs_lhp: 0,
    contact_pct_vs_rhp: null,
    contact_pct_vs_lhp: null
  };
  if (!batterId) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=statSplits&season=${season}&group=hitting&sitCodes=vl,vr`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return defaults;
    const data = await res.json();
    const splits = data.stats?.[0]?.splits || [];

    let ops_vs_rhp = 0;
    let ops_vs_lhp = 0;
    let slg_vs_rhp = 0;
    let slg_vs_lhp = 0;
    let k_pct_vs_rhp = 0;
    let k_pct_vs_lhp = 0;
    let contact_pct_vs_rhp: number | null = null;
    let contact_pct_vs_lhp: number | null = null;

    for (const split of splits) {
      const code = split.split?.code;
      const stat = split.stat || {};
      const pa = parseInt(stat.plateAppearances) || 0;
      const so = parseInt(stat.strikeOuts) || 0;
      const kPct = pa > 0 ? Math.round((so / pa) * 1000) / 10 : 0;
      if (code === "vr") { // vs Right Handed Pitchers
        ops_vs_rhp = safeFloat(stat.ops) ?? 0;
        slg_vs_rhp = safeFloat(stat.slg) ?? 0;
        k_pct_vs_rhp = kPct;
        contact_pct_vs_rhp = safeFloat(stat.contactPct) ?? safeFloat(stat.contactPercent);
      } else if (code === "vl") { // vs Left Handed Pitchers
        ops_vs_lhp = safeFloat(stat.ops) ?? 0;
        slg_vs_lhp = safeFloat(stat.slg) ?? 0;
        k_pct_vs_lhp = kPct;
        contact_pct_vs_lhp = safeFloat(stat.contactPct) ?? safeFloat(stat.contactPercent);
      }
    }

    return {
      ops_vs_rhp,
      ops_vs_lhp,
      slg_vs_rhp,
      slg_vs_lhp,
      k_pct_vs_rhp,
      k_pct_vs_lhp,
      contact_pct_vs_rhp,
      contact_pct_vs_lhp
    };
  } catch (err) {
    console.error(`Error fetching splits for batter ${batterId}:`, err);
    return defaults;
  }
}

async function fetchAdvancedPitchingVsOpp(pitcherId: number, opposingTeamId: number): Promise<AdvancedPitchingStats> {
  const defaults: AdvancedPitchingStats = {
    xEra: null, fip: null, xFip: null, siera: null,
    hardHitPct: null, barrelPct: null, groundBallPct: null, flyBallPct: null,
    strikeoutRate: null, walkRate: null, swingingStrikePct: null
  };
  if (!pitcherId || !opposingTeamId) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=vsTeamTotal&opposingTeamId=${opposingTeamId}&group=pitching`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return defaults;
    const data = await res.json();
    const s = data.stats?.[0]?.splits?.[0]?.stat || {};

    if (Object.keys(s).length === 0) return defaults;

    const hr = parseInt(s.homeRuns) || 0;
    const bb = parseInt(s.baseOnBalls) || 0;
    const hbp = parseInt(s.hitByPitch) || 0;
    const so = parseInt(s.strikeOuts) || 0;
    const bf = parseInt(s.plateAppearances) || 0; // plateAppearances approx battersFaced
    const go = parseInt(s.groundOuts) || 0;
    const ao = parseInt(s.airOuts) || 0;
    const gidp = parseInt(s.groundIntoDoublePlay) || 0;

    // Approximate IP outs using out events
    const ipOuts = go + ao + so + gidp;
    const ip = ipOuts / 3;

    const fip = ip > 0 ? Math.round(((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + 3.2) * 100) / 100 : null;
    const strikeoutRate = bf > 0 ? Math.round((so / bf) * 1000) / 10 : null;
    const walkRate = bf > 0 ? Math.round((bb / bf) * 1000) / 10 : null;
    const totalOuts = go + ao;
    const groundBallPct = totalOuts > 0 ? Math.round((go / totalOuts) * 1000) / 10 : null;
    const flyBallPct = totalOuts > 0 ? Math.round((ao / totalOuts) * 1000) / 10 : null;

    // Estimate WHIP and ERA using hitting stats against pitcher
    const hits = parseInt(s.hits) || 0;
    const rbi = parseInt(s.rbi) || 0; // use RBI as a proxy for earned runs
    let estimatedWhip: string | null = null;
    let estimatedEra: string | null = null;
    const ipString = ipOuts > 0 ? `${Math.floor(ipOuts / 3)}.${ipOuts % 3}` : null;

    if (ip > 0) {
      estimatedWhip = ((hits + bb) / ip).toFixed(2);
      estimatedEra = ((rbi / ip) * 9).toFixed(2);
    }

    return {
      ...defaults,
      fip,
      strikeoutRate,
      walkRate,
      groundBallPct,
      flyBallPct,
      careerKPctVsTeam: strikeoutRate,
      era: estimatedEra,
      whip: estimatedWhip,
      ip: ipString,
      wins: 0,
      losses: 0
    };
  } catch (err) {
    console.error(`Error fetching vs Opp for ${pitcherId}:`, err);
    return defaults;
  }
}

async function fetchPitcherLast3VsTeamProfile(
  pitcherId: number,
  opposingTeamId: number,
  season: string,
  targetDateStr: string
): Promise<Partial<AdvancedPitchingStats>> {
  if (!pitcherId || !opposingTeamId) return {};
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`;
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) return {};
    const data = await res.json();
    const targetDate = new Date(targetDateStr);
    let logs = data.stats?.[0]?.splits || [];

    logs = logs
      .filter((log: any) => {
        if (!log.date || new Date(log.date) >= targetDate) return false;
        const opponentId =
          log.opponent?.id ??
          log.opponent?.team?.id ??
          log.team?.opponent?.id ??
          log.game?.opponent?.id;
        return String(opponentId) === String(opposingTeamId);
      })
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);

    if (logs.length === 0) return {};

    const ks = logs.map((log: any) => parseInt(log.stat?.strikeOuts) || 0);
    const bf = logs.map((log: any) => parseInt(log.stat?.battersFaced) || 0).filter((value: number) => value > 0);

    return {
      last3VsTeamKsAvg: average(ks, 2),
      last3VsTeamBfAvg: average(bf, 1)
    };
  } catch (err) {
    console.error(`Error fetching last 3 vs team for pitcher ${pitcherId}:`, err);
    return {};
  }
}

async function fetchAdvancedOffense(teamId: number, season: string): Promise<AdvancedOffenseStats> {
  const defaults: AdvancedOffenseStats = {
    wOba: null, xwOba: null, wrcPlus: null, iso: null, babip: null,
    hardHitPct: null, barrelPct: null, contactPct: null, chasePct: null
  };
  try {
    const stdUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&season=${season}&group=hitting`;
    const advUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=seasonAdvanced&season=${season}&group=hitting`;
    const [stdRes, advRes] = await Promise.all([
      fetchWithTimeout(stdUrl, 5000),
      fetchWithTimeout(advUrl, 5000)
    ]);
    let stdStat: any = {};
    let advStat: any = {};
    if (stdRes.ok) {
      const stdData = await stdRes.json();
      stdStat = stdData.stats?.[0]?.splits?.[0]?.stat || {};
    }
    if (advRes.ok) {
      const advData = await advRes.json();
      advStat = advData.stats?.[0]?.splits?.[0]?.stat || {};
    }

    if (!stdStat.atBats) {
      return defaults;
    }

    const avg = safeFloat(stdStat.avg) ?? 0;
    const slg = safeFloat(stdStat.slg) ?? 0;
    const iso = slg > 0 && avg > 0 ? Math.round((slg - avg) * 1000) / 1000 : null;

    const h = parseInt(stdStat.hits) || 0;
    const hr = parseInt(stdStat.homeRuns) || 0;
    const ab = parseInt(stdStat.atBats) || 0;
    const so = parseInt(stdStat.strikeOuts) || 0;
    const sf = parseInt(stdStat.sacrificeFlies) || 0;
    const denom = ab - so - hr + sf;
    const babip = denom > 0 ? Math.round(((h - hr) / denom) * 1000) / 1000 : null;

    const bb = parseInt(stdStat.baseOnBalls) || 0;
    const hbp = parseInt(stdStat.hitByPitch) || 0;
    const ibb = parseInt(stdStat.intentionalWalks) || 0;
    const dbl = parseInt(stdStat.doubles) || 0;
    const tpl = parseInt(stdStat.triples) || 0;
    const single = h - dbl - tpl - hr;

    // wOBA Formula (using 2024 approximate weights)
    const wobaDenom = ab + bb - ibb + sf + hbp;
    const woba = wobaDenom > 0
      ? Math.round(((0.69 * (bb - ibb) + 0.72 * hbp + 0.88 * single + 1.25 * dbl + 1.58 * tpl + 2.05 * hr) / wobaDenom) * 1000) / 1000
      : null;

    const firstNumber = (...values: any[]): number | null => {
      for (const value of values) {
        const parsed = safeFloat(value);
        if (parsed !== null) return parsed;
      }
      return null;
    };

    const swings = firstNumber(advStat.totalSwings, advStat.swings, stdStat.totalSwings);
    const swingAndMisses = firstNumber(advStat.swingAndMisses, advStat.swingingStrikes, stdStat.swingAndMisses);
    const contactPct = swings && swingAndMisses !== null && swings > 0
      ? roundNumber(((swings - swingAndMisses) / swings) * 100, 1)
      : firstNumber(advStat.contactPct, advStat.contactPercent, advStat.contact);

    const chasePct = firstNumber(
      advStat.chasePct,
      advStat.chasePercent,
      advStat.oSwingPct,
      advStat.outOfZoneSwingPct
    );

    return {
      wOba: woba,
      xwOba: null,
      wrcPlus: null,
      iso,
      babip,
      hardHitPct: null,
      barrelPct: null,
      contactPct,
      chasePct
    };
  } catch (err) {
    console.error(`Error fetching advanced offense for team ${teamId}:`, err);
    return defaults;
  }
}

async function fetchStarterFatigue(pitcherId: number, date: string, season: string) {
  const defaults = { daysSinceLastStart: 5, pitchesLastStart: 0, pitchesLast3Starts: 0 };
  if (!pitcherId) return defaults;
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return defaults;
    const data = await res.json();
    const logs = data.stats?.[0]?.splits || [];

    const targetDate = new Date(date);
    const pastLogs = logs
      .filter((log: any) => log.date && new Date(log.date) < targetDate)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (pastLogs.length === 0) {
      return defaults;
    }

    const lastStart = pastLogs[0];
    const lastStartDate = new Date(lastStart.date);
    const diffTime = Math.abs(targetDate.getTime() - lastStartDate.getTime());
    const daysSinceLastStart = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const pitchesLastStart = parseInt(lastStart.stat?.numberOfPitches) || parseInt(lastStart.stat?.pitchesThrown) || 0;

    let pitchesLast3Starts = 0;
    for (let i = 0; i < Math.min(3, pastLogs.length); i++) {
      pitchesLast3Starts += parseInt(pastLogs[i].stat?.numberOfPitches) || parseInt(pastLogs[i].stat?.pitchesThrown) || 0;
    }

    return {
      daysSinceLastStart: daysSinceLastStart > 30 ? 5 : daysSinceLastStart,
      pitchesLastStart,
      pitchesLast3Starts
    };
  } catch (err) {
    console.error(`Error fetching starter fatigue for pitcher ${pitcherId}:`, err);
    return defaults;
  }
}

async function fetchBullpenFatigue(teamId: number, date: string, season: string) {
  const defaults = {
    ipLast3Days: "N/A",
    ipLast7Days: "N/A",
    relieversUsedYesterday: "N/A",
    relieversUsedLast2Days: "N/A",
    availableCount: "N/A"
  };
  try {
    const today = new Date(date);
    const startDateTime = today.getTime() - 7 * 24 * 60 * 60 * 1000;
    const startDateStr = new Date(startDateTime).toISOString().split('T')[0];
    const endDateTime = today.getTime() - 1 * 24 * 60 * 60 * 1000;
    const endDateStr = new Date(endDateTime).toISOString().split('T')[0];

    const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${startDateStr}&endDate=${endDateStr}`;
    const resSched = await fetchWithTimeout(schedUrl, 5000);
    if (!resSched.ok) return defaults;
    const schedData = await resSched.json();

    const gamePks: string[] = [];
    for (const d of schedData.dates || []) {
      for (const g of d.games || []) {
        if (g.gamePk) gamePks.push(String(g.gamePk));
      }
    }

    if (gamePks.length === 0) return defaults;

    // Obtener Roster Activo para la fecha objetivo para filtrar lesionados/inactivos y jugadores de posición lanzando
    const rosterUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&date=${date}`;
    const resRoster = await fetchWithTimeout(rosterUrl, 5000);
    const activePitcherIds = new Set<number>();
    let hasActiveRoster = false;
    if (resRoster.ok) {
      const rosterData = await resRoster.json();
      if (Array.isArray(rosterData.roster)) {
        hasActiveRoster = true;
        for (const item of rosterData.roster) {
          if (item.position?.code === '1' && item.person?.id) {
            activePitcherIds.add(item.person.id);
          }
        }
      }
    }

    const boxscores = await Promise.all(
      gamePks.map(async (pk) => {
        try {
          const r = await fetchWithTimeout(`https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`, 4000);
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        }
      })
    );

    let outs3d = 0;
    let outs7d = 0;
    let usedYesterday = 0;
    let used2Days = 0;

    const yesterdayStr = endDateStr;
    const twoDaysAgoStr = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    for (let i = 0; i < gamePks.length; i++) {
      const box = boxscores[i];
      if (!box) continue;

      let teamData = null;
      if (box.teams?.home?.team?.id === teamId) {
        teamData = box.teams.home;
      } else if (box.teams?.away?.team?.id === teamId) {
        teamData = box.teams.away;
      }

      if (!teamData) continue;

      let gameDateStr = "";
      for (const d of schedData.dates || []) {
        const matchingGame = d.games?.find((g: any) => String(g.gamePk) === gamePks[i]);
        if (matchingGame) {
          gameDateStr = d.date || "";
          break;
        }
      }

      if (!gameDateStr) continue;

      const pitchers = teamData.pitchers || [];
      const bullpenPitchers = pitchers.slice(1);

      let bullpenOuts = 0;
      let relieversCount = 0;

      for (const pid of bullpenPitchers) {
        if (hasActiveRoster && !activePitcherIds.has(pid)) {
          continue; // Excluir jugadores inactivos o de posición lanzando
        }
        relieversCount++;
        const p = teamData.players?.[`ID${pid}`];
        const ipStr = p?.stats?.pitching?.inningsPitched;
        if (ipStr) {
          const parts = String(ipStr).split('.');
          const w = parseInt(parts[0]) || 0;
          const f = parseInt(parts[1]) || 0;
          bullpenOuts += (w * 3) + f;
        }
      }

      const gameTime = new Date(gameDateStr).getTime();
      const diffDays = (today.getTime() - gameTime) / (1000 * 60 * 60 * 24);

      if (diffDays <= 3) {
        outs3d += bullpenOuts;
      }
      if (diffDays <= 7) {
        outs7d += bullpenOuts;
      }

      if (gameDateStr === yesterdayStr) {
        usedYesterday += relieversCount;
      }
      if (gameDateStr === yesterdayStr || gameDateStr === twoDaysAgoStr) {
        used2Days += relieversCount;
      }
    }

    const formatIP = (outs: number) => {
      const w = Math.floor(outs / 3);
      const f = outs % 3;
      return w + (f / 10);
    };

    return {
      ipLast3Days: formatIP(outs3d),
      ipLast7Days: formatIP(outs7d),
      relieversUsedYesterday: usedYesterday,
      relieversUsedLast2Days: used2Days,
      availableCount: Math.max(8 - usedYesterday, 2)
    };
  } catch (err) {
    console.error(`Error calculating bullpen fatigue for team ${teamId}:`, err);
    return defaults;
  }
}

async function fetchFatigueMetrics(
  homeStarterId: number,
  awayStarterId: number,
  homeTeamId: number,
  awayTeamId: number,
  date: string
): Promise<FatigueMetrics> {
  const season = date.substring(0, 4);
  const [homeStarter, awayStarter, homeBullpen, awayBullpen] = await Promise.all([
    fetchStarterFatigue(homeStarterId, date, season),
    fetchStarterFatigue(awayStarterId, date, season),
    fetchBullpenFatigue(homeTeamId, date, season),
    fetchBullpenFatigue(awayTeamId, date, season)
  ]);

  return {
    pitchers: {
      home: homeStarter,
      away: awayStarter
    },
    bullpen: {
      home: homeBullpen,
      away: awayBullpen
    }
  };
}

function parseRecordWinPct(record: string): number {
  if (!record || !record.includes("-")) return 0.5;
  const [w, l] = record.split("-").map(Number);
  if (isNaN(w) || isNaN(l) || (w + l) === 0) return 0.5;
  return w / (w + l);
}

function calculateModelFeatures(gameData: any): ModelFeatures {
  const homeStarterEra = safeFloat(gameData.pitchers?.home?.era) ?? 4.0;
  const awayStarterEra = safeFloat(gameData.pitchers?.away?.era) ?? 4.0;

  const homeStarterXera = safeFloat(gameData.advanced_pitching?.home?.xEra) ?? homeStarterEra;
  const awayStarterXera = safeFloat(gameData.advanced_pitching?.away?.xEra) ?? awayStarterEra;

  const homeStarterFip = safeFloat(gameData.advanced_pitching?.home?.fip) ?? homeStarterEra;
  const awayStarterFip = safeFloat(gameData.advanced_pitching?.away?.fip) ?? awayStarterEra;

  const homeOps = safeFloat(gameData.offense?.home?.ops) ?? 0.730;
  const awayOps = safeFloat(gameData.offense?.away?.ops) ?? 0.730;

  // Use xwOBA difference instead of wRC+ (wRC+ is always null – FanGraphs proprietary)
  const homeXwoba = safeFloat(gameData.advanced_offense?.home?.xwOba) ?? safeFloat(gameData.advanced_offense?.home?.wOba) ?? 0.320;
  const awayXwoba = safeFloat(gameData.advanced_offense?.away?.xwOba) ?? safeFloat(gameData.advanced_offense?.away?.wOba) ?? 0.320;

  const homeBullpenEra = safeFloat(gameData.bullpen?.home?.era) ?? 4.0;
  const awayBullpenEra = safeFloat(gameData.bullpen?.away?.era) ?? 4.0;

  const homeRpg = safeFloat(gameData.offense?.home?.runsPerGame) ?? 4.5;
  const awayRpg = safeFloat(gameData.offense?.away?.runsPerGame) ?? 4.5;

  const homeRecordLast10 = parseRecordWinPct(gameData.trends?.home?.recordLast10);
  const awayRecordLast10 = parseRecordWinPct(gameData.trends?.away?.recordLast10);

  const homeWinPct = parseRecordWinPct(gameData.trends?.home?.recordHome);
  const awayWinPct = parseRecordWinPct(gameData.trends?.away?.recordAway);

  const homeStarterRest = safeFloat(gameData.fatigue_metrics?.pitchers?.home?.daysSinceLastStart) ?? 5;
  const awayStarterRest = safeFloat(gameData.fatigue_metrics?.pitchers?.away?.daysSinceLastStart) ?? 5;

  const homeBullpenFatigue = safeFloat(gameData.fatigue_metrics?.bullpen?.home?.ipLast3Days) ?? 10;
  const awayBullpenFatigue = safeFloat(gameData.fatigue_metrics?.bullpen?.away?.ipLast3Days) ?? 10;

  let varMoneyline = 0;
  let varRunLine = 0;
  let varTotalRuns = 0;

  if (hasRealBettingLines(gameData) && gameData.line_movements && gameData.line_movements.length > 1) {
    const opening = gameData.line_movements[0];
    const current = gameData.line_movements[gameData.line_movements.length - 1];
    const currentMoneylineHome = safeFloat(current.currentMoneylineHome);
    const openingMoneylineHome = safeFloat(opening.currentMoneylineHome);
    const currentRunLineOdds = safeFloat(current.runLineHomeOdds);
    const openingRunLineOdds = safeFloat(opening.runLineHomeOdds);
    const currentTotalRuns = safeFloat(current.totalRuns);
    const openingTotalRuns = safeFloat(opening.totalRuns);
    varMoneyline = currentMoneylineHome !== null && openingMoneylineHome !== null ? currentMoneylineHome - openingMoneylineHome : 0;
    varRunLine = currentRunLineOdds !== null && openingRunLineOdds !== null ? currentRunLineOdds - openingRunLineOdds : 0;
    varTotalRuns = currentTotalRuns !== null && openingTotalRuns !== null ? currentTotalRuns - openingTotalRuns : 0;
  }

  return {
    diffEra: Math.round((homeStarterEra - awayStarterEra) * 100) / 100,
    diffXera: Math.round((homeStarterXera - awayStarterXera) * 100) / 100,
    diffFip: Math.round((homeStarterFip - awayStarterFip) * 100) / 100,
    diffOps: Math.round((homeOps - awayOps) * 1000) / 1000,
    diffXwoba: Math.round((homeXwoba - awayXwoba) * 10000) / 10000,
    diffBullpenEra: Math.round((homeBullpenEra - awayBullpenEra) * 100) / 100,
    diffRunsPerGame: Math.round((homeRpg - awayRpg) * 10) / 10,
    diffRecordLast10: Math.round((homeRecordLast10 - awayRecordLast10) * 100) / 100,
    diffRecordHomeAway: Math.round((homeWinPct - awayWinPct) * 100) / 100,
    diffStarterRest: homeStarterRest - awayStarterRest,
    diffBullpenFatigue: Math.round((homeBullpenFatigue - awayBullpenFatigue) * 10) / 10,
    varMoneyline,
    varRunLine,
    varTotalRuns
  };
}

async function fetchGameResult(gamePk: string, bettingLines?: BettingLines | null): Promise<MLGameResult | undefined> {
  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gamePk}`;
    const res = await fetchWithTimeout(url, 4000);
    if (!res.ok) return undefined;
    const data = await res.json();
    const game = data.dates?.[0]?.games?.[0];
    if (!game) return undefined;

    const status = game.status?.detailedState || game.status?.abstractGameState || "Scheduled";

    const isScheduled = status === "Scheduled" || status === "Pre-Game" || status === "Warmup";

    let homeScore = 0;
    let awayScore = 0;

    if (!isScheduled) {
      homeScore = parseInt(game.teams?.home?.score) || 0;
      awayScore = parseInt(game.teams?.away?.score) || 0;
    }

    let winner: "home" | "away" | "tie" | "none" = "none";
    if (homeScore > awayScore) winner = "home";
    else if (awayScore > homeScore) winner = "away";
    else if (!isScheduled && homeScore === awayScore) winner = "tie";

    const runLineHome = bettingLines?.runLineHome ?? -1.5;
    let runLineCovered: "home" | "away" | "push" = "push";
    if (homeScore + runLineHome > awayScore) {
      runLineCovered = "home";
    } else if (homeScore + runLineHome < awayScore) {
      runLineCovered = "away";
    }

    const totalRuns = bettingLines?.totalRuns ?? 8.5;
    const totalScore = homeScore + awayScore;
    let overUnderResult: "over" | "under" | "push" = "push";
    if (totalScore > totalRuns) {
      overUnderResult = "over";
    } else if (totalScore < totalRuns) {
      overUnderResult = "under";
    }

    return {
      homeScore,
      awayScore,
      winner,
      runLineCovered,
      overUnderResult,
      gameStatus: status
    };
  } catch (err) {
    console.error(`Error fetching game result for pk ${gamePk}:`, err);
    return undefined;
  }
}

// --------------------------------------------------------------------
// Helpers for Direct Mode
// --------------------------------------------------------------------
function americanOddsToProbability(odds: number): number {
  if (odds > 0) {
    return (100 / (odds + 100)) * 100;
  } else if (odds < 0) {
    return (-odds / (-odds + 100)) * 100;
  }
  return 50;
}

// --------------------------------------------------------------------
// Bypasses Gemini purely for 'direct' mode
// --------------------------------------------------------------------
function buildDirectGameData(
  gameId: string,
  homeName: string,
  awayName: string,
  venueName: string,
  date: string,
  matchTime: string,
  realMLBData: any,
  realOddsData: any,
  pitcherStrikeoutRows: any[] = [],
  totalBasesRows: any[] = []
) {
  // Try to match odds if provided
  let odds: any = null;
  let homeKPropData: any = null;
  let awayKPropData: any = null;

  if (realOddsData && Array.isArray(realOddsData)) {
    const matchOdds = realOddsData.find((o: any) => {
      const oHome = o.home_team.toLowerCase();
      const oAway = o.away_team.toLowerCase();
      const dbHome = homeName.toLowerCase();
      const dbAway = awayName.toLowerCase();
      return (oHome === dbHome || oHome.includes(dbHome) || dbHome.includes(oHome)) &&
             (oAway === dbAway || oAway.includes(dbAway) || dbAway.includes(oAway));
    });
    if (matchOdds && matchOdds.bookmakers && matchOdds.bookmakers.length > 0) {
      const bookie = matchOdds.bookmakers.find((b: any) => b.key === 'draftkings' || b.key === 'fanduel') || matchOdds.bookmakers[0];
      const h2h = bookie.markets.find((m: any) => m.key === 'h2h');
      const spreads = bookie.markets.find((m: any) => m.key === 'spreads');
      const totals = bookie.markets.find((m: any) => m.key === 'totals');
      
      let pitcherStrikeoutsOutcomes: any[] = [];
      let batterTotalBasesOutcomes: any[] = [];
      for (const b of matchOdds.bookmakers) {
         const mPitcher = b.markets.find((mk: any) => mk.key === 'pitcher_strikeouts');
         if (mPitcher && mPitcher.outcomes) {
            pitcherStrikeoutsOutcomes.push(...mPitcher.outcomes.map((outcome: any) => ({
              ...outcome,
              bookKey: b.key,
              source: outcome.source || (b.key === "datastreak" ? "datastreak" : "the_odds_api")
            })));
         }
         const mBatter = b.markets.find((mk: any) => mk.key === 'batter_total_bases');
         if (mBatter && mBatter.outcomes) {
            batterTotalBasesOutcomes.push(...mBatter.outcomes.map((outcome: any) => ({
              ...outcome,
              bookKey: b.key,
              source: outcome.source || (b.key === "datastreak" ? "datastreak" : "the_odds_api")
            })));
         }
      }

      if (batterTotalBasesOutcomes.length > 0) {
        const mappedBatterProps = new Map<string, any>();
        for (const outcome of batterTotalBasesOutcomes) {
           if (outcome.source === "datastreak" || outcome.bookKey === "datastreak") continue;
           const pName = outcome.description;
           const rowKey = `${normalizeName(pName)}|${outcome.bookKey || "the_odds_api"}`;
           if (!mappedBatterProps.has(rowKey)) {
              mappedBatterProps.set(rowKey, { player_name: pName, vendor: outcome.bookKey || 'TheOddsAPI', source: 'the_odds_api' });
           }
           const pData = mappedBatterProps.get(rowKey);
           pData.line = outcome.point;
           if (outcome.name === 'Over') {
              pData.odds = outcome.price;
           } else if (outcome.name === 'Under') {
              pData.under_odds = outcome.price;
           }
        }
        const oddsApiTotalBasesRows = Array.from(mappedBatterProps.values());
        totalBasesRows = [...oddsApiTotalBasesRows, ...totalBasesRows];
      }

      if (pitcherStrikeoutsOutcomes.length > 0) {
        const matchProp = (pitcherName: string) => {
           if (!pitcherName || pitcherName === "Por definir" || pitcherName === "TBD") return null;
           const normalizedPitcherName = normalizeName(pitcherName);
           const parts = normalizedPitcherName.split(' ');
           const lastName = parts[parts.length - 1];
           const outcomes = pitcherStrikeoutsOutcomes.filter((o: any) => {
               const description = normalizeName(o.description);
               const isTheOddsApi = o.source !== "datastreak" && o.bookKey !== "datastreak";
               return isTheOddsApi && (
                 description === normalizedPitcherName ||
                 description.includes(normalizedPitcherName) ||
                 description.split(" ").includes(lastName)
               );
           });
           if (outcomes.length > 0) {
              const over = outcomes.find((o:any) => o.name === 'Over');
              const under = outcomes.find((o:any) => o.name === 'Under');
              return { point: over?.point || under?.point || null, overOdds: over?.price || null, underOdds: under?.price || null, book: over?.bookKey || under?.bookKey || "TheOddsAPI", source: "the_odds_api" };
           }
           return null;
        };
        homeKPropData = matchProp(realMLBData?.pitchers?.home?.name);
        awayKPropData = matchProp(realMLBData?.pitchers?.away?.name);
      }

      odds = {
        openingMoneylineHome: h2h?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        openingMoneylineAway: h2h?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        currentMoneylineHome: h2h?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        currentMoneylineAway: h2h?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        runLineHome: spreads?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.point ?? null,
        runLineHomeOdds: spreads?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.home_team?.toLowerCase())?.price ?? null,
        runLineAway: spreads?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.point ?? null,
        runLineAwayOdds: spreads?.outcomes?.find((o: any) => o.name?.toLowerCase() === matchOdds.away_team?.toLowerCase())?.price ?? null,
        totalRuns: totals?.outcomes?.find((o: any) => o.name?.toLowerCase() === 'over')?.point ?? totals?.outcomes?.find((o: any) => o.name?.toLowerCase() === 'under')?.point ?? null,
        overOdds: totals?.outcomes?.find((o: any) => o.name?.toLowerCase() === 'over')?.price ?? null,
        underOdds: totals?.outcomes?.find((o: any) => o.name?.toLowerCase() === 'under')?.price ?? null,
        lineSource: "the_odds_api",
        lineMovementSummary: "Líneas de cuotas provistas por The Odds API (Modo Directo)."
      };
    }
  }

  homeKPropData = homeKPropData || findDataStreakPitcherKProp(
    pitcherStrikeoutRows,
    realMLBData?.pitchers?.home?.name,
    homeName,
    awayName
  );
  awayKPropData = awayKPropData || findDataStreakPitcherKProp(
    pitcherStrikeoutRows,
    realMLBData?.pitchers?.away?.name,
    awayName,
    homeName
  );

  // Fallback odds if matching failed
  if (!odds) {
    odds = {
      openingMoneylineHome: null, openingMoneylineAway: null,
      currentMoneylineHome: null, currentMoneylineAway: null,
      runLineHome: null, runLineHomeOdds: null, runLineAway: null, runLineAwayOdds: null,
      totalRuns: null, overOdds: null, underOdds: null,
      lineSource: null,
      lineMovementSummary: "Sin lineas reales disponibles."
    };
  }

  return {
    id: gameId,
    metadata: { id: gameId, date, time: matchTime, homeTeam: homeName, awayTeam: awayName, venue: venueName },
    teams: { home: homeName, away: awayName },
    pitchers: {
      home: {
        name: realMLBData?.pitchers?.home?.name || "Por definir",
        era: safeFloat(realMLBData?.pitchers?.home?.era) ?? "N/A",
        whip: safeFloat(realMLBData?.pitchers?.home?.whip) ?? "N/A",
        kPct: safeFloat(realMLBData?.pitchers?.home?.kPct) ?? "N/A",
        bbPct: safeFloat(realMLBData?.pitchers?.home?.bbPct) ?? "N/A",
        wins: parseInt(realMLBData?.pitchers?.home?.wins) || "N/A",
        losses: parseInt(realMLBData?.pitchers?.home?.losses) || "N/A",
        ip: realMLBData?.pitchers?.home?.ip || "N/A",
        starts: safeFloat(realMLBData?.pitchers?.home?.starts) ?? "N/A",
        totalStrikeouts: safeFloat(realMLBData?.pitchers?.home?.totalStrikeouts) ?? "N/A",
        totalWalks: safeFloat(realMLBData?.pitchers?.home?.totalWalks) ?? "N/A",
        strikeoutProp: homeKPropData?.point ?? null,
        strikeoutPropOverOdds: homeKPropData?.overOdds ?? null,
        strikeoutPropUnderOdds: homeKPropData?.underOdds ?? null,
        strikeoutPropSource: homeKPropData?.source ?? null,
        pitchHand: realMLBData?.pitchers?.home?.pitchHand || "R",
        pitcher_allowed_avg_vs_lhb: safeFloat(realMLBData?.pitchers?.home?.pitcher_allowed_avg_vs_lhb) ?? 0,
        pitcher_allowed_avg_vs_rhb: safeFloat(realMLBData?.pitchers?.home?.pitcher_allowed_avg_vs_rhb) ?? 0,
        pitcher_allowed_slg_vs_lhb: safeFloat(realMLBData?.pitchers?.home?.pitcher_allowed_slg_vs_lhb) ?? 0,
        pitcher_allowed_slg_vs_rhb: safeFloat(realMLBData?.pitchers?.home?.pitcher_allowed_slg_vs_rhb) ?? 0
      },
      away: {
        name: realMLBData?.pitchers?.away?.name || "Por definir",
        era: safeFloat(realMLBData?.pitchers?.away?.era) ?? "N/A",
        whip: safeFloat(realMLBData?.pitchers?.away?.whip) ?? "N/A",
        kPct: safeFloat(realMLBData?.pitchers?.away?.kPct) ?? "N/A",
        bbPct: safeFloat(realMLBData?.pitchers?.away?.bbPct) ?? "N/A",
        wins: parseInt(realMLBData?.pitchers?.away?.wins) || "N/A",
        losses: parseInt(realMLBData?.pitchers?.away?.losses) || "N/A",
        ip: realMLBData?.pitchers?.away?.ip || "N/A",
        starts: safeFloat(realMLBData?.pitchers?.away?.starts) ?? "N/A",
        totalStrikeouts: safeFloat(realMLBData?.pitchers?.away?.totalStrikeouts) ?? "N/A",
        totalWalks: safeFloat(realMLBData?.pitchers?.away?.totalWalks) ?? "N/A",
        strikeoutProp: awayKPropData?.point ?? null,
        strikeoutPropOverOdds: awayKPropData?.overOdds ?? null,
        strikeoutPropUnderOdds: awayKPropData?.underOdds ?? null,
        strikeoutPropSource: awayKPropData?.source ?? null,
        pitchHand: realMLBData?.pitchers?.away?.pitchHand || "R",
        pitcher_allowed_avg_vs_lhb: safeFloat(realMLBData?.pitchers?.away?.pitcher_allowed_avg_vs_lhb) ?? 0,
        pitcher_allowed_avg_vs_rhb: safeFloat(realMLBData?.pitchers?.away?.pitcher_allowed_avg_vs_rhb) ?? 0,
        pitcher_allowed_slg_vs_lhb: safeFloat(realMLBData?.pitchers?.away?.pitcher_allowed_slg_vs_lhb) ?? 0,
        pitcher_allowed_slg_vs_rhb: safeFloat(realMLBData?.pitchers?.away?.pitcher_allowed_slg_vs_rhb) ?? 0
      }
    },
    bullpen: {
      home: {
        era: safeFloat(realMLBData?.bullpenERA?.home) ?? "N/A",
        usageLast3Days: "N/A",
        availableRelievers: ["N/A"],
        ipLast3Days: "N/A"
      },
      away: {
        era: safeFloat(realMLBData?.bullpenERA?.away) ?? "N/A",
        usageLast3Days: "N/A",
        availableRelievers: ["N/A"],
        ipLast3Days: "N/A"
      }
    },
    offense: {
      home: {
        runsPerGame: safeFloat(realMLBData?.teamOffense?.home?.runsPerGame) ?? "N/A",
        strikeoutsPerGame: safeFloat(realMLBData?.teamOffense?.home?.strikeoutsPerGame) ?? "N/A",
        ops: safeFloat(realMLBData?.teamOffense?.home?.ops) ?? "N/A",
        obp: safeFloat(realMLBData?.teamOffense?.home?.obp) ?? "N/A",
        slg: safeFloat(realMLBData?.teamOffense?.home?.slg) ?? "N/A"
      },
      away: {
        runsPerGame: safeFloat(realMLBData?.teamOffense?.away?.runsPerGame) ?? "N/A",
        strikeoutsPerGame: safeFloat(realMLBData?.teamOffense?.away?.strikeoutsPerGame) ?? "N/A",
        ops: safeFloat(realMLBData?.teamOffense?.away?.ops) ?? "N/A",
        obp: safeFloat(realMLBData?.teamOffense?.away?.obp) ?? "N/A",
        slg: safeFloat(realMLBData?.teamOffense?.away?.slg) ?? "N/A"
      }
    },
    trends: {
      home: { recordLast10: "N/D", recordHome: "N/D", recordAway: "N/D" },
      away: { recordLast10: "N/D", recordHome: "N/D", recordAway: "N/D" }
    },
    betting_lines: odds,
    injuries: [
      ...(realMLBData?.injuries?.home || []).map((inj: any) => ({ ...inj, team: homeName })),
      ...(realMLBData?.injuries?.away || []).map((inj: any) => ({ ...inj, team: awayName }))
    ],
    lineups: {
      home: enrichLineupWithTotalBasesProps(realMLBData?.lineups?.home || [], totalBasesRows).map((p: any) => ({
        name: p.name || "Jugador",
        id: p.id ?? p.mlbId ?? null,
        mlbId: p.mlbId ?? p.id ?? null,
        position: p.position || "DH",
        avg: safeFloat(p.avg) || 0.250,
        ops: safeFloat(p.ops) || 0.700,
        hr: safeFloat(p.hr) || 0,
        rbi: safeFloat(p.rbi) || 0,
        player_name: p.player_name || p.name || "Jugador",
        team: p.team || "",
        bat_side: p.bat_side || "R",
        obp: safeFloat(p.obp) || 0.300,
        slg: safeFloat(p.slg) || 0.400,
        woba: safeFloat(p.woba) || 0.300,
        iso: safeFloat(p.iso) || 0.150,
        pa: parseInt(p.pa) || 0,
        hits: parseInt(p.hits) || 0,
        doubles: parseInt(p.doubles) || 0,
        triples: parseInt(p.triples) || 0,
        home_runs: parseInt(p.home_runs) || parseInt(p.hr) || 0,
        strikeout_pct: safeFloat(p.strikeout_pct) || 0.0,
        walk_pct: safeFloat(p.walk_pct) || 0.0,
        batting_order: p.batting_order ?? null,
        ops_vs_rhp: p.ops_vs_rhp ?? 0,
        ops_vs_lhp: p.ops_vs_lhp ?? 0,
        slg_vs_rhp: p.slg_vs_rhp ?? 0,
        slg_vs_lhp: p.slg_vs_lhp ?? 0,
        k_pct_vs_rhp: p.k_pct_vs_rhp ?? 0,
        k_pct_vs_lhp: p.k_pct_vs_lhp ?? 0,
        contact_pct_vs_rhp: p.contact_pct_vs_rhp ?? null,
        contact_pct_vs_lhp: p.contact_pct_vs_lhp ?? null,
        last7_avg: safeFloat(p.last7_avg) || 0.0,
        last7_ops: safeFloat(p.last7_ops) || 0.0,
        last7_slg: safeFloat(p.last7_slg) || 0.0,
        last7_total_bases: parseInt(p.last7_total_bases) || 0,
        last7_hits: parseInt(p.last7_hits) || 0,
        last7_xbh: parseInt(p.last7_xbh) || 0,
        totalBasesProp: safeFloat(p.totalBasesProp),
        totalBasesPropOverOdds: safeFloat(p.totalBasesPropOverOdds),
        totalBasesPropUnderOdds: safeFloat(p.totalBasesPropUnderOdds),
        totalBasesPropBook: p.totalBasesPropBook ?? null,
        totalBasesPropSource: p.totalBasesPropSource ?? null,
        totalBasesPropHitRate: safeFloat(p.totalBasesPropHitRate),
        totalBasesPropHitRateDisplay: p.totalBasesPropHitRateDisplay ?? null
      })),
      away: enrichLineupWithTotalBasesProps(realMLBData?.lineups?.away || [], totalBasesRows).map((p: any) => ({
        name: p.name || "Jugador",
        id: p.id ?? p.mlbId ?? null,
        mlbId: p.mlbId ?? p.id ?? null,
        position: p.position || "DH",
        avg: safeFloat(p.avg) || 0.250,
        ops: safeFloat(p.ops) || 0.700,
        hr: safeFloat(p.hr) || 0,
        rbi: safeFloat(p.rbi) || 0,
        player_name: p.player_name || p.name || "Jugador",
        team: p.team || "",
        bat_side: p.bat_side || "R",
        obp: safeFloat(p.obp) || 0.300,
        slg: safeFloat(p.slg) || 0.400,
        woba: safeFloat(p.woba) || 0.300,
        iso: safeFloat(p.iso) || 0.150,
        pa: parseInt(p.pa) || 0,
        hits: parseInt(p.hits) || 0,
        doubles: parseInt(p.doubles) || 0,
        triples: parseInt(p.triples) || 0,
        home_runs: parseInt(p.home_runs) || parseInt(p.hr) || 0,
        strikeout_pct: safeFloat(p.strikeout_pct) || 0.0,
        walk_pct: safeFloat(p.walk_pct) || 0.0,
        batting_order: p.batting_order ?? null,
        ops_vs_rhp: p.ops_vs_rhp ?? 0,
        ops_vs_lhp: p.ops_vs_lhp ?? 0,
        slg_vs_rhp: p.slg_vs_rhp ?? 0,
        slg_vs_lhp: p.slg_vs_lhp ?? 0,
        k_pct_vs_rhp: p.k_pct_vs_rhp ?? 0,
        k_pct_vs_lhp: p.k_pct_vs_lhp ?? 0,
        contact_pct_vs_rhp: p.contact_pct_vs_rhp ?? null,
        contact_pct_vs_lhp: p.contact_pct_vs_lhp ?? null,
        last7_avg: safeFloat(p.last7_avg) || 0.0,
        last7_ops: safeFloat(p.last7_ops) || 0.0,
        last7_slg: safeFloat(p.last7_slg) || 0.0,
        last7_total_bases: parseInt(p.last7_total_bases) || 0,
        last7_hits: parseInt(p.last7_hits) || 0,
        last7_xbh: parseInt(p.last7_xbh) || 0,
        totalBasesProp: safeFloat(p.totalBasesProp),
        totalBasesPropOverOdds: safeFloat(p.totalBasesPropOverOdds),
        totalBasesPropUnderOdds: safeFloat(p.totalBasesPropUnderOdds),
        totalBasesPropBook: p.totalBasesPropBook ?? null,
        totalBasesPropSource: p.totalBasesPropSource ?? null,
        totalBasesPropHitRate: safeFloat(p.totalBasesPropHitRate),
        totalBasesPropHitRateDisplay: p.totalBasesPropHitRateDisplay ?? null
      }))
    },
    linescore: realMLBData?.linescore || null,
    liveBoxscore: realMLBData?.liveBoxscore || null,
    playByPlay: realMLBData?.playByPlay || null
  };
}

// Harvester endpoint (SSE streaming)
app.post("/api/harvest", async (req, res) => {
  const { date, refreshOdds, force } = req.body;
  const forceRebuild = force === true;
  if (!date || typeof date !== "string") {
    res.status(400).json({ error: "Fecha es requerida (formato YYYY-MM-DD)" });
    return;
  }

  // Switch to SSE mode
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const emit = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let isCancelled = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      isCancelled = true;
      console.log(`[ETL] Conexión cerrada por el cliente. Cancelando proceso para ${date}...`);
    }
  });

  console.log(`Iniciando recolección MLB para fecha: ${date}`);
  emit({ phase: "schedule", step: "Conectando con MLB Stats API...", pct: 2 });

  // Fetch actual MLB Schedule from MLB Stats API
  let mlbMatches: any[] = [];
  try {
    const mlbRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`);
    const mlbData = await mlbRes.json();
    if (mlbData.dates && mlbData.dates[0] && mlbData.dates[0].games) {
      mlbMatches = mlbData.dates[0].games;
    }
  } catch (error) {
    console.error("Error consultando MLB Stats API:", error);
  }

  // Fetch real odds for the day
  const realOddsData = await fetchRealBettingLines(date, refreshOdds === true, mlbMatches);
  const pitcherStrikeoutRows = await fetchDataStreakPitcherStrikeoutProps(date, refreshOdds === true);
  const totalBasesRows = await fetchDataStreakTotalBasesProps(date, refreshOdds === true);

  // Pre-cargar Baseball Savant (una sola descarga para toda la sesión)
  const season = date.substring(0, 4);
  emit({ phase: "schedule", step: "Cargando datos sabermetricos...", pct: 4 });
  await Promise.all([
    savantCache.load(parseInt(season)),

  ]);

  // Pre-cargar PyBaseball (velocidad, CSW%)
  emit({ phase: "schedule", step: "Cargando métricas PyBaseball...", pct: 5 });
  const endDatePy = new Date(date);
  const startDatePy = new Date(date);
  startDatePy.setDate(startDatePy.getDate() - 3);
  const startStrPy = startDatePy.toISOString().split('T')[0];
  const endStrPy = endDatePy.toISOString().split('T')[0];
  let pybaseballStatcast: any = null;
  try {
    pybaseballStatcast = await getRecentStatcast(startStrPy, endStrPy);
  } catch (err) {
    console.error("Error cargando PyBaseball", err);
  }

  const harvestedGames: any[] = [];
  const errorsCollection = readErrorsDB();

  // Try parsing
  try {
    // Iterate through all matches
    const matchesToHarvest = mlbMatches;
    const totalGames = matchesToHarvest.length;

    emit({ phase: "schedule", step: `${totalGames} juego(s) encontrados para ${date}`, pct: 5 });

    if (totalGames === 0) {
      emit({ phase: "save", step: "Guardando base de datos...", pct: 90 });
      const db = readGamesDB();
      db[date] = [];
      writeGamesDB(db);
      emit({
        phase: "done",
        step: `Extracción completada — 0 juego(s)`,
        pct: 100,
        games: [],
        errorsCount: errorsCollection.length,
      });
      res.end();
      return;
    }

    // pct layout: 5% schedule | 5–92% games (each game = 87/N %) | 92–100% save
    const pctPerGame = Math.floor(87 / totalGames);

    // Pre-leer la DB local una sola vez antes del loop (evita N lecturas de disco)
    const currentDBSnapshot = readGamesDB();
    const existingGamesForDate = currentDBSnapshot[date] || [];

    for (let gi = 0; gi < matchesToHarvest.length; gi++) {
      if (isCancelled) {
        console.log(`[ETL] Abortando bucle de juegos. Proceso cancelado.`);
        emit({ phase: "done", step: "Extracción cancelada por el usuario" });
        break;
      }
      const match = matchesToHarvest[gi];
      const homeName = match.teams.home.team.name;
      const awayName = match.teams.away.team.name;
      const homeTeamId: number = match.teams.home.team.id;
      const awayTeamId: number = match.teams.away.team.id;
      const venueName = match.venue?.name || "MLB Stadium";
      const matchTime = formatGameTime(match.gameDate);
      const gameId = String(match.gamePk);
      const gameLabel = `${awayName} @ ${homeName}`;
      const basePct = 5 + gi * pctPerGame; // starting pct for this game

      // CACHÉ INTELIGENTE: Si el juego ya está en la DB local y terminó, no hacemos ninguna llamada a APIs
      if (!forceRebuild) {
        const cachedGame = existingGamesForDate.find((g: any) => String(g.id) === String(gameId));
        if (cachedGame && isFinalGameStatus(cachedGame.game_result?.gameStatus)) {
          console.log(`[Caché] Juego ${gameId} (${gameLabel}) ya FINALIZADO — cargando desde DB local.`);
          harvestedGames.push(cachedGame);
          emit({
            phase: "game_done",
            step: `✓ ${gameLabel} (sin cambios — juego finalizado)`,
            gameLabel,
            gameIndex: gi + 1,
            totalGames,
            pct: basePct + pctPerGame,
            cached: true,
          });
          continue;
        }
      }

      // Step 1 of 2 for this game: Fetch REAL MLB data
      emit({
        phase: "real_data",
        step: `Datos MLB: ${gameLabel}`,
        gameLabel,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct + Math.floor(pctPerGame * 0.1),
      });

      console.log(`Consultando MLB Stats API para datos reales del juego ${gameId}...`);
      const realMLBData = await fetchRealMLBGameData(gameId, homeTeamId, awayTeamId, date);
      console.log(`Datos reales: pitcher local=${realMLBData.pitchers?.home?.name || 'N/D'}, visitante=${realMLBData.pitchers?.away?.name || 'N/D'}`);

      // Step 2 of 2: Build game data from API and Validate
      emit({
        phase: "validate",
        step: `Validando: ${gameLabel}`,
        gameLabel,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct + Math.floor(pctPerGame * 0.6),
      });

      const gameDataParsed: any = buildDirectGameData(gameId, homeName, awayName, venueName, date, matchTime, realMLBData, realOddsData, pitcherStrikeoutRows, totalBasesRows);

      // 3. Fetch Clima, Sabermetría, Splits, Fatiga y Resultados
      emit({
        phase: "advanced_data",
        step: `Clima y Sabermetría: ${gameLabel}`,
        gameLabel,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct + Math.floor(pctPerGame * 0.35),
      });

      console.log(`fetching climate, splits, fatigue and advanced stats for game ${gameId}...`);
      const season = date.substring(0, 4);
      const homePitcherId = realMLBData.pitcherIds?.home || 0;
      const awayPitcherId = realMLBData.pitcherIds?.away || 0;

      const [
        weather,
        homeSplits,
        awaySplits,
        homeAdvPitching,
        awayAdvPitching,
        homeLast7,
        awayLast7,
        homeLast5Profile,
        awayLast5Profile,
        homeVsOpp,
        awayVsOpp,
        homeLast3VsTeam,
        awayLast3VsTeam,
        homeAdvOffense,
        awayAdvOffense,
        fatigue
      ] = await Promise.all([
        fetchWeatherData(venueName, date, match.gameDate || new Date().toISOString()),
        fetchOffensiveSplits(homeTeamId, season),
        fetchOffensiveSplits(awayTeamId, season),
        fetchAdvancedPitching(homePitcherId, season),
        fetchAdvancedPitching(awayPitcherId, season),
        fetchAdvancedPitchingLast7(homePitcherId, season, date),
        fetchAdvancedPitchingLast7(awayPitcherId, season, date),
        fetchPitcherLast5Profile(homePitcherId, season, date),
        fetchPitcherLast5Profile(awayPitcherId, season, date),
        fetchAdvancedPitchingVsOpp(homePitcherId, awayTeamId),
        fetchAdvancedPitchingVsOpp(awayPitcherId, homeTeamId),
        fetchPitcherLast3VsTeamProfile(homePitcherId, awayTeamId, season, date),
        fetchPitcherLast3VsTeamProfile(awayPitcherId, homeTeamId, season, date),
        fetchAdvancedOffense(homeTeamId, season),
        fetchAdvancedOffense(awayTeamId, season),
        fetchFatigueMetrics(homePitcherId, awayPitcherId, homeTeamId, awayTeamId, date)
      ]);

      // Populate gameDataParsed
      gameDataParsed.weather = weather;
      gameDataParsed.offensive_splits = {
        home: homeSplits,
        away: awaySplits
      };
      // Inyectar métricas de Baseball Savant en estadísticas de pitchers
      const homePitcherSavant = savantCache.getPitcher(homePitcherId);
      const awayPitcherSavant = savantCache.getPitcher(awayPitcherId);
      if (homePitcherSavant) {
        homeAdvPitching.xEra = homePitcherSavant.xERA;
        homeAdvPitching.hardHitPct = homePitcherSavant.hardHitPct;
        homeAdvPitching.barrelPct = homePitcherSavant.barrelPct;
        homeAdvPitching.fastballPct = homePitcherSavant.fastballPct;
        homeAdvPitching.sliderPct = homePitcherSavant.sliderPct;
        homeAdvPitching.curvePct = homePitcherSavant.curvePct;
        homeAdvPitching.changeupPct = homePitcherSavant.changeupPct;
        homeAdvPitching.splitterPct = homePitcherSavant.splitterPct;
        if (homePitcherSavant.xwOBA !== null) {
          homeAdvOffense.xwOba = homeAdvOffense.xwOba ?? homePitcherSavant.xwOBA;
        }
      }
      if (awayPitcherSavant) {
        awayAdvPitching.xEra = awayPitcherSavant.xERA;
        awayAdvPitching.hardHitPct = awayPitcherSavant.hardHitPct;
        awayAdvPitching.barrelPct = awayPitcherSavant.barrelPct;
        awayAdvPitching.fastballPct = awayPitcherSavant.fastballPct;
        awayAdvPitching.sliderPct = awayPitcherSavant.sliderPct;
        awayAdvPitching.curvePct = awayPitcherSavant.curvePct;
        awayAdvPitching.changeupPct = awayPitcherSavant.changeupPct;
        awayAdvPitching.splitterPct = awayPitcherSavant.splitterPct;
        if (awayPitcherSavant.xwOBA !== null) {
          awayAdvOffense.xwOba = awayAdvOffense.xwOba ?? awayPitcherSavant.xwOBA;
        }
      }

      // Inyectar PyBaseball
      if (pybaseballStatcast?.data?.pitchers_recent) {
        const homePStats = pybaseballStatcast.data.pitchers_recent.find((p: any) => String(p.pitcher) === String(homePitcherId));
        if (homePStats && gameDataParsed.pitchers?.home) {
          gameDataParsed.pitchers.home.pitcher_csw_pct = homePStats.csw_pct;
          gameDataParsed.pitchers.home.pitcher_recent_velocity = homePStats.avg_velocity;
        }
        const awayPStats = pybaseballStatcast.data.pitchers_recent.find((p: any) => String(p.pitcher) === String(awayPitcherId));
        if (awayPStats && gameDataParsed.pitchers?.away) {
          gameDataParsed.pitchers.away.pitcher_csw_pct = awayPStats.csw_pct;
          gameDataParsed.pitchers.away.pitcher_recent_velocity = awayPStats.avg_velocity;
        }
      }

      // Inyectar xwOBA de ofensiva desde los bateadores del lineup
      const homeLineup: any[] = gameDataParsed.lineups?.home || [];
      const awayLineup: any[] = gameDataParsed.lineups?.away || [];
      const homeLineupSavant = calculateLineupSavantAverages(homeLineup);
      const awayLineupSavant = calculateLineupSavantAverages(awayLineup);
      if (homeLineupSavant.xwOba !== null) homeAdvOffense.xwOba = homeLineupSavant.xwOba;
      if (awayLineupSavant.xwOba !== null) awayAdvOffense.xwOba = awayLineupSavant.xwOba;
      if (homeLineupSavant.hardHitPct !== null) homeAdvOffense.hardHitPct = homeLineupSavant.hardHitPct;
      if (awayLineupSavant.hardHitPct !== null) awayAdvOffense.hardHitPct = awayLineupSavant.hardHitPct;
      if (homeLineupSavant.barrelPct !== null) homeAdvOffense.barrelPct = homeLineupSavant.barrelPct;
      if (awayLineupSavant.barrelPct !== null) awayAdvOffense.barrelPct = awayLineupSavant.barrelPct;

      if (homeLineupSavant.chasePct !== null) homeAdvOffense.chasePct = homeLineupSavant.chasePct;
      if (awayLineupSavant.chasePct !== null) awayAdvOffense.chasePct = awayLineupSavant.chasePct;

      if (homeLineupSavant.whiffPct !== null) {
        homeAdvOffense.projectedLineupWhiffPctVsHand = homeLineupSavant.whiffPct;
        homeAdvOffense.contactPct = 100 - homeLineupSavant.whiffPct;
        homeAdvOffense.projectedLineupContactPctVsHand = 100 - homeLineupSavant.whiffPct;
      }
      homeAdvOffense.whiffPctVsFastball = homeLineupSavant.whiffPctVsFastball;
      homeAdvOffense.whiffPctVsSlider = homeLineupSavant.whiffPctVsSlider;
      homeAdvOffense.whiffPctVsCurve = homeLineupSavant.whiffPctVsCurve;
      homeAdvOffense.whiffPctVsChangeup = homeLineupSavant.whiffPctVsChangeup;
      homeAdvOffense.whiffPctVsSplitter = homeLineupSavant.whiffPctVsSplitter;

      if (awayLineupSavant.whiffPct !== null) {
        awayAdvOffense.projectedLineupWhiffPctVsHand = awayLineupSavant.whiffPct;
        awayAdvOffense.contactPct = 100 - awayLineupSavant.whiffPct;
        awayAdvOffense.projectedLineupContactPctVsHand = 100 - awayLineupSavant.whiffPct;
      }
      awayAdvOffense.whiffPctVsFastball = awayLineupSavant.whiffPctVsFastball;
      awayAdvOffense.whiffPctVsSlider = awayLineupSavant.whiffPctVsSlider;
      awayAdvOffense.whiffPctVsCurve = awayLineupSavant.whiffPctVsCurve;
      awayAdvOffense.whiffPctVsChangeup = awayLineupSavant.whiffPctVsChangeup;
      awayAdvOffense.whiffPctVsSplitter = awayLineupSavant.whiffPctVsSplitter;

      // Catcher Framing mapping
      const homeCatcher = homeLineup.find(p => p.position === "C");
      if (homeCatcher) {
        homeAdvPitching.catcherName = homeCatcher.name;
        const savantCatcher = savantCache.getCatcher(homeCatcher.id ?? homeCatcher.mlbId);
        if (savantCatcher && savantCatcher.framingRuns !== null) {
          homeAdvPitching.catcherFramingRuns = savantCatcher.framingRuns;
        }
      }
      const awayCatcher = awayLineup.find(p => p.position === "C");
      if (awayCatcher) {
        awayAdvPitching.catcherName = awayCatcher.name;
        const savantCatcher = savantCache.getCatcher(awayCatcher.id ?? awayCatcher.mlbId);
        if (savantCatcher && savantCatcher.framingRuns !== null) {
          awayAdvPitching.catcherFramingRuns = savantCatcher.framingRuns;
        }
      }

      for (const p of homeLineup) {
        const savant = savantCache.getBatter(p.id ?? p.mlbId);
        if (savant) {
          p.chase_pct = savant.chasePct;
          p.whiff_pct = savant.whiffPct;
          if (savant.whiffPct !== null) {
            const contactPct = roundNumber(100 - savant.whiffPct, 1);
            p.contact_pct_vs_rhp = contactPct;
            p.contact_pct_vs_lhp = contactPct;
          }
        }
      }
      for (const p of awayLineup) {
        const savant = savantCache.getBatter(p.id ?? p.mlbId);
        if (savant) {
          p.chase_pct = savant.chasePct;
          p.whiff_pct = savant.whiffPct;
          if (savant.whiffPct !== null) {
            const contactPct = roundNumber(100 - savant.whiffPct, 1);
            p.contact_pct_vs_rhp = contactPct;
            p.contact_pct_vs_lhp = contactPct;
          }
        }
      }


      // Inyectar K% proyectado de la alineación y K% del rival vs mano del pitcher
      const homePitcherHand = realMLBData.pitchers?.home?.pitchHand || "R";
      const awayPitcherHand = realMLBData.pitchers?.away?.pitchHand || "R";

      homeAdvOffense.kPctVsPitchHand = awayPitcherHand === "L" ? (homeSplits?.vsLhp?.kPct ?? 20.0) : (homeSplits?.vsRhp?.kPct ?? 20.0);
      awayAdvOffense.kPctVsPitchHand = homePitcherHand === "L" ? (awaySplits?.vsLhp?.kPct ?? 20.0) : (awaySplits?.vsRhp?.kPct ?? 20.0);

      const getLineupVsHandProjection = (lineup: any[], pitcherHand: string) => {
        if (!lineup.length) return { kPct: null, contactPct: null };
        const isLefty = pitcherHand === "L";
      const kValues = lineup
        .map((p: any) => safeFloat(isLefty ? p.k_pct_vs_lhp : p.k_pct_vs_rhp) ?? safeFloat(p.strikeout_pct) ?? safeFloat(p.kPct))
        .filter((value): value is number => value !== null && value > 0);
        const contactValues = lineup
          .map((p: any) => safeFloat(isLefty ? p.contact_pct_vs_lhp : p.contact_pct_vs_rhp))
          .filter((value): value is number => value !== null && value > 0);
        const kPct = average(kValues, 1);
        return {
          kPct,
          contactPct: contactValues.length > 0 ? average(contactValues, 1) : null
        };
      };

      const homeLineupVsHand = getLineupVsHandProjection(homeLineup, awayPitcherHand);
      const awayLineupVsHand = getLineupVsHandProjection(awayLineup, homePitcherHand);
      homeAdvOffense.projectedLineupKPct = homeLineupVsHand.kPct;
      awayAdvOffense.projectedLineupKPct = awayLineupVsHand.kPct;
      if (homeLineupVsHand.contactPct !== null) homeAdvOffense.projectedLineupContactPctVsHand = homeLineupVsHand.contactPct;
      if (awayLineupVsHand.contactPct !== null) awayAdvOffense.projectedLineupContactPctVsHand = awayLineupVsHand.contactPct;

      Object.assign(homeAdvPitching, homeLast5Profile, homeLast3VsTeam);
      Object.assign(awayAdvPitching, awayLast5Profile, awayLast3VsTeam);
      homeAdvPitching.projectedPitchCount = calculateProjectedPitchCount(homeAdvPitching, fatigue.pitchers?.home);
      awayAdvPitching.projectedPitchCount = calculateProjectedPitchCount(awayAdvPitching, fatigue.pitchers?.away);

      gameDataParsed.advanced_pitching = {
        home: homeAdvPitching,
        away: awayAdvPitching,
        homeLast7,
        awayLast7,
        homeVsOpp,
        awayVsOpp
      };
      gameDataParsed.advanced_offense = {
        home: homeAdvOffense,
        away: awayAdvOffense
      };
      gameDataParsed.fatigue_metrics = fatigue;

      // Actualizar el resumen principal del bullpen con los datos reales calculados
      if (fatigue?.bullpen) {
        gameDataParsed.bullpen.home.ipLast3Days = fatigue.bullpen.home.ipLast3Days;
        gameDataParsed.bullpen.away.ipLast3Days = fatigue.bullpen.away.ipLast3Days;

        const getUsage = (ip3d: any) => {
          if (typeof ip3d !== 'number') return "N/A";
          if (ip3d >= 8) return "Alta";
          if (ip3d >= 3) return "Moderada";
          return "Baja";
        };

        gameDataParsed.bullpen.home.usageLast3Days = getUsage(fatigue.bullpen.home.ipLast3Days);
        gameDataParsed.bullpen.away.usageLast3Days = getUsage(fatigue.bullpen.away.ipLast3Days);
      }

      // Handle Line Movements timeline (usamos el snapshot pre-leído antes del loop)
      const existingGame = existingGamesForDate.find((g: any) => String(g.id) === String(gameId));
      const lineMovements: LineMovement[] = existingGame?.line_movements || [];

      const currentOdds = gameDataParsed.betting_lines;
      const newMovement: LineMovement = {
        timestamp: new Date().toISOString(),
        openingMoneylineHome: currentOdds.openingMoneylineHome,
        openingMoneylineAway: currentOdds.openingMoneylineAway,
        currentMoneylineHome: currentOdds.currentMoneylineHome,
        currentMoneylineAway: currentOdds.currentMoneylineAway,
        runLineHome: currentOdds.runLineHome,
        runLineHomeOdds: currentOdds.runLineHomeOdds,
        runLineAway: currentOdds.runLineAway,
        runLineAwayOdds: currentOdds.runLineAwayOdds,
        totalRuns: currentOdds.totalRuns,
        overOdds: currentOdds.overOdds,
        underOdds: currentOdds.underOdds
      };
      lineMovements.push(newMovement);
      gameDataParsed.line_movements = lineMovements;

      // Calculate Model Features (Home - Away, odds variations)
      gameDataParsed.model_features = calculateModelFeatures(gameDataParsed);

      // Game Outcomes
      const gameResult = await fetchGameResult(gameId, currentOdds);
      if (gameResult) {
        gameDataParsed.game_result = gameResult;
      }

      const canUseActualKs = isFinalGameStatus(gameDataParsed.game_result?.gameStatus);
      gameDataParsed.advanced_pitching.home.actualStrikeouts = canUseActualKs
        ? (realMLBData.currentPitching?.home?.actualStrikeouts ?? null)
        : null;
      gameDataParsed.advanced_pitching.away.actualStrikeouts = canUseActualKs
        ? (realMLBData.currentPitching?.away?.actualStrikeouts ?? null)
        : null;

      // Validation Layer
      const validationResult = validateGamePayload(gameDataParsed, errorsCollection);

      // We append the validation metadata to the game itself for transparent presentation
      gameDataParsed.validation = {
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        checkedAt: new Date().toISOString()
      };
      gameDataParsed.timestamp = new Date().toISOString();

      // Sincronizar con Firestore de forma asíncrona para no bloquear el flujo
      saveGameData(gameId, gameDataParsed).catch((fsErr) => {
        console.error(`Error saving to Firestore for game ${gameId}:`, fsErr);
        errorsCollection.push({
          id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp: new Date().toISOString(),
          gameId,
          source: "Firestore",
          message: `Fallo al sincronizar con Firestore: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`,
          severity: "medium",
        });
      });

      harvestedGames.push(gameDataParsed);

      emit({
        phase: "game_done",
        step: `✓ ${gameLabel}`,
        gameLabel,
        gameIndex: gi + 1,
        totalGames,
        pct: basePct + pctPerGame,
      });

      // Brief delay for visual transitions in UI
      await new Promise((r) => setTimeout(r, 400));
    }

    // Persist to local JSON DB
    emit({ phase: "save", step: "Guardando en base de datos local...", pct: 93 });
    const db = readGamesDB();
    db[date] = harvestedGames;
    writeGamesDB(db);
    writeErrorsDB(errorsCollection);

    // Final SSE event with all results
    emit({
      phase: "done",
      step: `Extracción completada — ${harvestedGames.length} juego(s)`,
      pct: 100,
      games: harvestedGames,
      errorsCount: errorsCollection.length,
    });
    res.end();
  } catch (error) {
    console.error("General harvesting failure:", error);
    emit({ phase: "error", step: "Error general: " + (error instanceof Error ? error.message : String(error)), pct: 0 });
    res.end();
  }
});

// Reusable helper to update data for a single game and persist it
async function updateSingleGameData(gameId: string, date: string, forceRefreshOdds = false): Promise<any> {
  console.log(`Actualizando juego individual ${gameId} para la fecha ${date}...`);

  // 1. Fetch MLB Schedule for the date to find the match details
  const mlbRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`);
  const mlbData = await mlbRes.json();
  let match: any = null;
  let actualDate = date;
  if (mlbData.dates && mlbData.dates[0] && mlbData.dates[0].games) {
    match = mlbData.dates[0].games.find((g: any) => String(g.gamePk) === String(gameId));
  }

  if (!match) {
    const byGamePkRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gameId}`);
    const byGamePkData = await byGamePkRes.json();
    for (const scheduleDate of byGamePkData.dates || []) {
      const found = (scheduleDate.games || []).find((g: any) => String(g.gamePk) === String(gameId));
      if (found) {
        match = found;
        actualDate = scheduleDate.date || String(found.gameDate || "").split("T")[0] || date;
        console.warn(`Juego ${gameId} no pertenece a ${date}; usando fecha real ${actualDate}.`);
        break;
      }
    }
  }

  if (!match) {
    throw new Error(`Juego ${gameId} no encontrado en el calendario de MLB`);
  }

  const homeName = match.teams.home.team.name;
  const awayName = match.teams.away.team.name;
  const homeTeamId: number = match.teams.home.team.id;
  const awayTeamId: number = match.teams.away.team.id;
  const venueName = match.venue?.name || "MLB Stadium";
  const matchTime = formatGameTime(match.gameDate);

  // 2. Fetch real odds
  const realOddsData = await fetchRealBettingLines(actualDate, forceRefreshOdds);
  const pitcherStrikeoutRows = await fetchDataStreakPitcherStrikeoutProps(actualDate, forceRefreshOdds);
  const totalBasesRows = await fetchDataStreakTotalBasesProps(actualDate, forceRefreshOdds);

  // 3. Fetch real MLB game data
  const realMLBData = await fetchRealMLBGameData(gameId, homeTeamId, awayTeamId, actualDate);

  // 4. Build game data
  const gameDataParsed: any = buildDirectGameData(gameId, homeName, awayName, venueName, actualDate, matchTime, realMLBData, realOddsData, pitcherStrikeoutRows, totalBasesRows);

  // 5. Fetch advanced stats
  const season = actualDate.substring(0, 4);
  await Promise.all([
    savantCache.load(parseInt(season)),

  ]);
  const homePitcherId = realMLBData.pitcherIds?.home || 0;
  const awayPitcherId = realMLBData.pitcherIds?.away || 0;

  const [
    weather,
    homeSplits,
    awaySplits,
    homeAdvPitching,
    awayAdvPitching,
    homeLast7,
    awayLast7,
    homeLast5Profile,
    awayLast5Profile,
    homeVsOpp,
    awayVsOpp,
    homeLast3VsTeam,
    awayLast3VsTeam,
    homeAdvOffense,
    awayAdvOffense,
    fatigue
  ] = await Promise.all([
    fetchWeatherData(venueName, actualDate, match.gameDate || new Date().toISOString()),
    fetchOffensiveSplits(homeTeamId, season),
    fetchOffensiveSplits(awayTeamId, season),
    fetchAdvancedPitching(homePitcherId, season),
    fetchAdvancedPitching(awayPitcherId, season),
    fetchAdvancedPitchingLast7(homePitcherId, season, actualDate),
    fetchAdvancedPitchingLast7(awayPitcherId, season, actualDate),
    fetchPitcherLast5Profile(homePitcherId, season, actualDate),
    fetchPitcherLast5Profile(awayPitcherId, season, actualDate),
    fetchAdvancedPitchingVsOpp(homePitcherId, awayTeamId),
    fetchAdvancedPitchingVsOpp(awayPitcherId, homeTeamId),
    fetchPitcherLast3VsTeamProfile(homePitcherId, awayTeamId, season, actualDate),
    fetchPitcherLast3VsTeamProfile(awayPitcherId, homeTeamId, season, actualDate),
    fetchAdvancedOffense(homeTeamId, season),
    fetchAdvancedOffense(awayTeamId, season),
    fetchFatigueMetrics(homePitcherId, awayPitcherId, homeTeamId, awayTeamId, actualDate)
  ]);

  // Populate advanced fields
  gameDataParsed.weather = weather;
  gameDataParsed.offensive_splits = { home: homeSplits, away: awaySplits };
  // Inyectar métricas de Baseball Savant
  const homePitcherSavantU = savantCache.getPitcher(homePitcherId);
  const awayPitcherSavantU = savantCache.getPitcher(awayPitcherId);
  if (homePitcherSavantU) {
    homeAdvPitching.xEra = homePitcherSavantU.xERA;
    homeAdvPitching.hardHitPct = homePitcherSavantU.hardHitPct;
    homeAdvPitching.barrelPct = homePitcherSavantU.barrelPct;
    homeAdvPitching.fastballPct = homePitcherSavantU.fastballPct;
    homeAdvPitching.sliderPct = homePitcherSavantU.sliderPct;
    homeAdvPitching.curvePct = homePitcherSavantU.curvePct;
    homeAdvPitching.changeupPct = homePitcherSavantU.changeupPct;
    homeAdvPitching.splitterPct = homePitcherSavantU.splitterPct;
    if (homePitcherSavantU.xwOBA !== null) {
      homeAdvOffense.xwOba = homeAdvOffense.xwOba ?? homePitcherSavantU.xwOBA;
    }
  }
  if (awayPitcherSavantU) {
    awayAdvPitching.xEra = awayPitcherSavantU.xERA;
    awayAdvPitching.hardHitPct = awayPitcherSavantU.hardHitPct;
    awayAdvPitching.barrelPct = awayPitcherSavantU.barrelPct;
    awayAdvPitching.fastballPct = awayPitcherSavantU.fastballPct;
    awayAdvPitching.sliderPct = awayPitcherSavantU.sliderPct;
    awayAdvPitching.curvePct = awayPitcherSavantU.curvePct;
    awayAdvPitching.changeupPct = awayPitcherSavantU.changeupPct;
    awayAdvPitching.splitterPct = awayPitcherSavantU.splitterPct;
    if (awayPitcherSavantU.xwOBA !== null) {
      awayAdvOffense.xwOba = awayAdvOffense.xwOba ?? awayPitcherSavantU.xwOBA;
    }
  }
  // xwOBA desde lineup
  const homeLineupU: any[] = gameDataParsed.lineups?.home || [];
  const awayLineupU: any[] = gameDataParsed.lineups?.away || [];
  const homeLineupSavantU = calculateLineupSavantAverages(homeLineupU);
  const awayLineupSavantU = calculateLineupSavantAverages(awayLineupU);
  if (homeLineupSavantU.xwOba !== null) homeAdvOffense.xwOba = homeLineupSavantU.xwOba;
  if (awayLineupSavantU.xwOba !== null) awayAdvOffense.xwOba = awayLineupSavantU.xwOba;
  if (homeLineupSavantU.hardHitPct !== null) homeAdvOffense.hardHitPct = homeLineupSavantU.hardHitPct;
  if (awayLineupSavantU.hardHitPct !== null) awayAdvOffense.hardHitPct = awayLineupSavantU.hardHitPct;
  if (homeLineupSavantU.barrelPct !== null) homeAdvOffense.barrelPct = homeLineupSavantU.barrelPct;
  if (awayLineupSavantU.barrelPct !== null) awayAdvOffense.barrelPct = awayLineupSavantU.barrelPct;

  if (homeLineupSavantU.chasePct !== null) homeAdvOffense.chasePct = homeLineupSavantU.chasePct;
  if (awayLineupSavantU.chasePct !== null) awayAdvOffense.chasePct = awayLineupSavantU.chasePct;

  if (homeLineupSavantU.whiffPct !== null) {
    homeAdvOffense.projectedLineupWhiffPctVsHand = homeLineupSavantU.whiffPct;
    homeAdvOffense.contactPct = 100 - homeLineupSavantU.whiffPct;
    homeAdvOffense.projectedLineupContactPctVsHand = 100 - homeLineupSavantU.whiffPct;
  }
  homeAdvOffense.whiffPctVsFastball = homeLineupSavantU.whiffPctVsFastball;
  homeAdvOffense.whiffPctVsSlider = homeLineupSavantU.whiffPctVsSlider;
  homeAdvOffense.whiffPctVsCurve = homeLineupSavantU.whiffPctVsCurve;
  homeAdvOffense.whiffPctVsChangeup = homeLineupSavantU.whiffPctVsChangeup;
  homeAdvOffense.whiffPctVsSplitter = homeLineupSavantU.whiffPctVsSplitter;

  if (awayLineupSavantU.whiffPct !== null) {
    awayAdvOffense.projectedLineupWhiffPctVsHand = awayLineupSavantU.whiffPct;
    awayAdvOffense.contactPct = 100 - awayLineupSavantU.whiffPct;
    awayAdvOffense.projectedLineupContactPctVsHand = 100 - awayLineupSavantU.whiffPct;
  }
  awayAdvOffense.whiffPctVsFastball = awayLineupSavantU.whiffPctVsFastball;
  awayAdvOffense.whiffPctVsSlider = awayLineupSavantU.whiffPctVsSlider;
  awayAdvOffense.whiffPctVsCurve = awayLineupSavantU.whiffPctVsCurve;
  awayAdvOffense.whiffPctVsChangeup = awayLineupSavantU.whiffPctVsChangeup;
  awayAdvOffense.whiffPctVsSplitter = awayLineupSavantU.whiffPctVsSplitter;

  // Catcher Framing mapping
  const homeCatcherU = homeLineupU.find(p => p.position === "C");
  if (homeCatcherU) {
    homeAdvPitching.catcherName = homeCatcherU.name;
    const savantCatcher = savantCache.getCatcher(homeCatcherU.id ?? homeCatcherU.mlbId);
    if (savantCatcher && savantCatcher.framingRuns !== null) {
      homeAdvPitching.catcherFramingRuns = savantCatcher.framingRuns;
    }
  }
  const awayCatcherU = awayLineupU.find(p => p.position === "C");
  if (awayCatcherU) {
    awayAdvPitching.catcherName = awayCatcherU.name;
    const savantCatcher = savantCache.getCatcher(awayCatcherU.id ?? awayCatcherU.mlbId);
    if (savantCatcher && savantCatcher.framingRuns !== null) {
      awayAdvPitching.catcherFramingRuns = savantCatcher.framingRuns;
    }
  }

  for (const p of homeLineupU) {
    const savant = savantCache.getBatter(p.id ?? p.mlbId);
    if (savant) {
      p.chase_pct = savant.chasePct;
      p.whiff_pct = savant.whiffPct;
      if (savant.whiffPct !== null) {
        const contactPct = roundNumber(100 - savant.whiffPct, 1);
        p.contact_pct_vs_rhp = contactPct;
        p.contact_pct_vs_lhp = contactPct;
      }
    }
  }
  for (const p of awayLineupU) {
    const savant = savantCache.getBatter(p.id ?? p.mlbId);
    if (savant) {
      p.chase_pct = savant.chasePct;
      p.whiff_pct = savant.whiffPct;
      if (savant.whiffPct !== null) {
        const contactPct = roundNumber(100 - savant.whiffPct, 1);
        p.contact_pct_vs_rhp = contactPct;
        p.contact_pct_vs_lhp = contactPct;
      }
    }
  }


  // Inyectar K% proyectado de la alineación y K% del rival vs mano del pitcher
  const homePitcherHand = realMLBData.pitchers?.home?.pitchHand || "R";
  const awayPitcherHand = realMLBData.pitchers?.away?.pitchHand || "R";

  homeAdvOffense.kPctVsPitchHand = awayPitcherHand === "L" ? (homeSplits?.vsLhp?.kPct ?? 20.0) : (homeSplits?.vsRhp?.kPct ?? 20.0);
  awayAdvOffense.kPctVsPitchHand = homePitcherHand === "L" ? (awaySplits?.vsLhp?.kPct ?? 20.0) : (awaySplits?.vsRhp?.kPct ?? 20.0);

  const getLineupVsHandProjection = (lineup: any[], pitcherHand: string) => {
    if (!lineup.length) return { kPct: null, contactPct: null };
    const isLefty = pitcherHand === "L";
    const kValues = lineup
      .map((p: any) => safeFloat(isLefty ? p.k_pct_vs_lhp : p.k_pct_vs_rhp) ?? safeFloat(p.strikeout_pct) ?? safeFloat(p.kPct))
      .filter((value): value is number => value !== null && value > 0);
    const contactValues = lineup
      .map((p: any) => safeFloat(isLefty ? p.contact_pct_vs_lhp : p.contact_pct_vs_rhp))
      .filter((value): value is number => value !== null && value > 0);
    const kPct = average(kValues, 1);
    return {
      kPct,
      contactPct: contactValues.length > 0 ? average(contactValues, 1) : null
    };
  };

  const homeLineupVsHand = getLineupVsHandProjection(homeLineupU, awayPitcherHand);
  const awayLineupVsHand = getLineupVsHandProjection(awayLineupU, homePitcherHand);
  homeAdvOffense.projectedLineupKPct = homeLineupVsHand.kPct;
  awayAdvOffense.projectedLineupKPct = awayLineupVsHand.kPct;
  if (homeLineupVsHand.contactPct !== null) homeAdvOffense.projectedLineupContactPctVsHand = homeLineupVsHand.contactPct;
  if (awayLineupVsHand.contactPct !== null) awayAdvOffense.projectedLineupContactPctVsHand = awayLineupVsHand.contactPct;

  Object.assign(homeAdvPitching, homeLast5Profile, homeLast3VsTeam);
  Object.assign(awayAdvPitching, awayLast5Profile, awayLast3VsTeam);
  homeAdvPitching.projectedPitchCount = calculateProjectedPitchCount(homeAdvPitching, fatigue.pitchers?.home);
  awayAdvPitching.projectedPitchCount = calculateProjectedPitchCount(awayAdvPitching, fatigue.pitchers?.away);

  gameDataParsed.advanced_pitching = {
    home: homeAdvPitching,
    away: awayAdvPitching,
    homeLast7,
    awayLast7,
    homeVsOpp,
    awayVsOpp
  };
  gameDataParsed.advanced_offense = { home: homeAdvOffense, away: awayAdvOffense };
  gameDataParsed.fatigue_metrics = fatigue;

  if (fatigue?.bullpen) {
    gameDataParsed.bullpen.home.ipLast3Days = fatigue.bullpen.home.ipLast3Days;
    gameDataParsed.bullpen.away.ipLast3Days = fatigue.bullpen.away.ipLast3Days;

    const getUsage = (ip3d: any) => {
      if (typeof ip3d !== 'number') return "N/A";
      if (ip3d >= 8) return "Alta";
      if (ip3d >= 3) return "Moderada";
      return "Baja";
    };

    gameDataParsed.bullpen.home.usageLast3Days = getUsage(fatigue.bullpen.home.ipLast3Days);
    gameDataParsed.bullpen.away.usageLast3Days = getUsage(fatigue.bullpen.away.ipLast3Days);
  }

  // Line Movements
  const currentDB = readGamesDB();
  const existingGamesForDate = currentDB[actualDate] || [];
  const existingGame = existingGamesForDate.find((g: any) => String(g.id) === String(gameId));
  const lineMovements: LineMovement[] = existingGame?.line_movements || [];

  const currentOdds = gameDataParsed.betting_lines;
  const newMovement: LineMovement = {
    timestamp: new Date().toISOString(),
    openingMoneylineHome: currentOdds.openingMoneylineHome,
    openingMoneylineAway: currentOdds.openingMoneylineAway,
    currentMoneylineHome: currentOdds.currentMoneylineHome,
    currentMoneylineAway: currentOdds.currentMoneylineAway,
    runLineHome: currentOdds.runLineHome,
    runLineHomeOdds: currentOdds.runLineHomeOdds,
    runLineAway: currentOdds.runLineAway,
    runLineAwayOdds: currentOdds.runLineAwayOdds,
    totalRuns: currentOdds.totalRuns,
    overOdds: currentOdds.overOdds,
    underOdds: currentOdds.underOdds
  };
  lineMovements.push(newMovement);
  gameDataParsed.line_movements = lineMovements;

  gameDataParsed.model_features = calculateModelFeatures(gameDataParsed);

  const gameResult = await fetchGameResult(gameId, currentOdds);
  if (gameResult) {
    gameDataParsed.game_result = gameResult;
  }

  const canUseActualKs = isFinalGameStatus(gameDataParsed.game_result?.gameStatus);
  gameDataParsed.advanced_pitching.home.actualStrikeouts = canUseActualKs
    ? (realMLBData.currentPitching?.home?.actualStrikeouts ?? null)
    : null;
  gameDataParsed.advanced_pitching.away.actualStrikeouts = canUseActualKs
    ? (realMLBData.currentPitching?.away?.actualStrikeouts ?? null)
    : null;

  const errorsCollection = readErrorsDB();
  const validationResult = validateGamePayload(gameDataParsed, errorsCollection);

  gameDataParsed.validation = {
    isValid: validationResult.isValid,
    errors: validationResult.errors,
    checkedAt: new Date().toISOString()
  };
  gameDataParsed.timestamp = new Date().toISOString();

  // Firestore sync
  saveGameData(gameId, gameDataParsed).catch((fsErr) => {
    console.error(`Error saving to Firestore for game ${gameId}:`, fsErr);
  });

  // Update local database
  const updatedGames = existingGamesForDate.map((g: any) =>
    String(g.id) === String(gameId) ? gameDataParsed : g
  );
  if (!existingGamesForDate.some((g: any) => String(g.id) === String(gameId))) {
    updatedGames.push(gameDataParsed);
  }

  currentDB[actualDate] = updatedGames;
  writeGamesDB(currentDB);
  writeErrorsDB(errorsCollection);

  return gameDataParsed;
}

// Harvester endpoint for individual game updates
app.post("/api/harvest-game", async (req, res) => {
  const { gameId, date, refreshOdds } = req.body;
  if (!gameId || !date || typeof gameId !== "string" || typeof date !== "string") {
    res.status(400).json({ error: "gameId y date son requeridos" });
    return;
  }

  try {
    const updatedGame = await updateSingleGameData(gameId, date, refreshOdds === true);
    res.json({ success: true, game: updatedGame });
  } catch (err) {
    console.error(`Error al actualizar juego individual ${gameId}:`, err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Auto-updater for live/in-progress games in background (every 15 minutes)
function startLiveGamesAutoupdater() {
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  console.log(`[Auto-Updater] Iniciando programador de actualización cada 15 minutos...`);

  setInterval(async () => {
    try {
      console.log(`[Auto-Updater] Ejecutando verificación de juegos en progreso para actualización automática...`);
      const db = readGamesDB();
      const liveGamesToUpdate: { gameId: string; date: string; label: string }[] = [];

      // Find all live games across all dates in local DB
      for (const date of Object.keys(db)) {
        const games = db[date] || [];
        for (const game of games) {
          const status = game.game_result?.gameStatus || "";
          const isLive = status.includes("In Progress") || status.includes("Live") || status.includes("Delayed") || status.includes("Suspended");

          if (isLive) {
            liveGamesToUpdate.push({
              gameId: String(game.id),
              date: game.metadata?.date || date,
              label: `${game.metadata?.awayTeam} vs ${game.metadata?.homeTeam}`
            });
          }
        }
      }

      if (liveGamesToUpdate.length === 0) {
        console.log(`[Auto-Updater] No se encontraron juegos en progreso para actualizar.`);
        return;
      }

      console.log(`[Auto-Updater] Detectados ${liveGamesToUpdate.length} juego(s) en progreso. Iniciando actualización secuencial...`);

      for (const item of liveGamesToUpdate) {
        try {
          console.log(`[Auto-Updater] Actualizando juego ${item.label} (ID: ${item.gameId}, Fecha: ${item.date})...`);
          await updateSingleGameData(item.gameId, item.date);
          console.log(`[Auto-Updater] ✓ Juego ${item.label} actualizado exitosamente.`);
        } catch (err) {
          console.error(`[Auto-Updater] ✗ Error al actualizar juego ${item.label}:`, err);
        }
      }
      console.log(`[Auto-Updater] Ciclo de actualización completado.`);
    } catch (err) {
      console.error(`[Auto-Updater] Error en el ciclo del programador:`, err);
    }
  }, INTERVAL_MS);
}

async function runStartupFirestoreSync() {
  // Intentar restaurar base de datos local desde Firestore si está vacía
  try {
    const localDB = readGamesDB();
    const isLocalEmpty = Object.keys(localDB).length === 0;

    if (isLocalEmpty) {
      console.log("[Restaurador Firestore] La base de datos local está vacía. Restaurando solo la fecha más reciente desde Firestore...");
      const games = await loadLatestGamesFromFirestore();
      if (games && games.length > 0) {
        mergeGamesIntoLocalDB(games);
        console.log(`[Restaurador Firestore] Fecha más reciente restaurada exitosamente con ${games.length} juegos.`);
      } else {
        console.log("[Restaurador Firestore] No se encontraron juegos en Firestore o la colección está vacía.");
      }
    }
  } catch (fsRestoreErr) {
    console.error("[Restaurador Firestore] Error general al intentar restaurar desde Firestore:", fsRestoreErr);
  }

  if (process.env.FULL_FIRESTORE_STARTUP_SYNC === "true") {
    try {
      await syncFirestoreToLocalDB("startup");
    } catch (fsSyncErr) {
      console.error("[Firestore Sync] Error general al sincronizar desde Firestore:", fsSyncErr);
    }
  }
}

// Serve static assets in production or connect Vite in development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    startLiveGamesAutoupdater();
    runStartupFirestoreSync().catch((err) => {
      console.error("[Firestore Sync] Error en sincronizaciÃ³n de arranque en segundo plano:", err);
    });
  });
}

startServer();
