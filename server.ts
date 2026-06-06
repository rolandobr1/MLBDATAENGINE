/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { saveGameData, loadAllGamesFromFirestore } from "./src/services/firestoreService";
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
import { generateMLDatasetCSV, generateBattersCSV } from "./src/utils";

const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;
const DB_PATH = path.join(process.cwd(), "mlb_database.json");
const ERRORS_PATH = path.join(process.cwd(), "mlb_errors.json");

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
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading database:", err);
    return {};
  }
}

function writeGamesDB(data: Record<string, any[]>) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing database:", err);
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
app.get("/api/games", (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") {
    res.status(400).json({ error: "Parámetro 'date' es requerido (formato YYYY-MM-DD)" });
    return;
  }

  const db = readGamesDB();
  const dateGames = db[date] || [];
  res.json({ games: dateGames });
});

// Helper function to flatten games for ML JSON endpoint
function flattenGameToJSON(g: MLBGame): Record<string, any> {
  const hSplitRhp = g.offensive_splits?.home?.vsRhp;
  const hSplitLhp = g.offensive_splits?.home?.vsLhp;
  const aSplitRhp = g.offensive_splits?.away?.vsRhp;
  const aSplitLhp = g.offensive_splits?.away?.vsLhp;
  const fPitchers = g.fatigue_metrics?.pitchers;
  const fBullpen = g.fatigue_metrics?.bullpen;

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
    ofensa_run_g_away: g.offense.away.runsPerGame,
    ofensa_ops_away: g.offense.away.ops,
    ofensa_obp_away: g.offense.away.obp,
    ofensa_slg_away: g.offense.away.slg,
    linea_moneyline_open_local: g.betting_lines.openingMoneylineHome,
    linea_moneyline_open_away: g.betting_lines.openingMoneylineAway,
    linea_moneyline_curr_local: g.betting_lines.currentMoneylineHome,
    linea_moneyline_curr_away: g.betting_lines.currentMoneylineAway,
    linea_runline_local: g.betting_lines.runLineHome,
    linea_runline_odds_local: g.betting_lines.runLineHomeOdds,
    linea_runline_away: g.betting_lines.runLineAway,
    linea_runline_odds_away: g.betting_lines.runLineAwayOdds,
    linea_total_carreras: g.betting_lines.totalRuns,
    linea_over_odds: g.betting_lines.overOdds,
    linea_under_odds: g.betting_lines.underOdds,
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
    home_offense_woba: g.advanced_offense?.home?.wOba ?? null,
    home_offense_xwoba: g.advanced_offense?.home?.xwOba ?? null,
    home_offense_wrcplus: g.advanced_offense?.home?.wrcPlus ?? null,
    home_offense_iso: g.advanced_offense?.home?.iso ?? null,
    home_offense_babip: g.advanced_offense?.home?.babip ?? null,
    home_offense_hardhit_pct: g.advanced_offense?.home?.hardHitPct ?? null,
    home_offense_barrel_pct: g.advanced_offense?.home?.barrelPct ?? null,
    home_offense_contact_pct: g.advanced_offense?.home?.contactPct ?? null,
    home_offense_chase_pct: g.advanced_offense?.home?.chasePct ?? null,
    away_offense_woba: g.advanced_offense?.away?.wOba ?? null,
    away_offense_xwoba: g.advanced_offense?.away?.xwOba ?? null,
    away_offense_wrcplus: g.advanced_offense?.away?.wrcPlus ?? null,
    away_offense_iso: g.advanced_offense?.away?.iso ?? null,
    away_offense_babip: g.advanced_offense?.away?.babip ?? null,
    away_offense_hardhit_pct: g.advanced_offense?.away?.hardHitPct ?? null,
    away_offense_barrel_pct: g.advanced_offense?.away?.barrelPct ?? null,
    away_offense_contact_pct: g.advanced_offense?.away?.contactPct ?? null,
    away_offense_chase_pct: g.advanced_offense?.away?.chasePct ?? null,
    diff_era: g.model_features?.diffEra ?? null,
    diff_xera: g.model_features?.diffXera ?? null,
    diff_fip: g.model_features?.diffFip ?? null,
    diff_ops: g.model_features?.diffOps ?? null,
    diff_wrcplus: g.model_features?.diffWrcPlus ?? null,
    diff_bullpen_era: g.model_features?.diffBullpenEra ?? null,
    diff_runs_per_game: g.model_features?.diffRunsPerGame ?? null,
    diff_record_last10: g.model_features?.diffRecordLast10 ?? null,
    diff_record_home_away: g.model_features?.diffRecordHomeAway ?? null,
    diff_starter_rest: g.model_features?.diffStarterRest ?? null,
    diff_bullpen_fatigue: g.model_features?.diffBullpenFatigue ?? null,
    var_moneyline: g.model_features?.varMoneyline ?? null,
    var_runline: g.model_features?.varRunLine ?? null,
    var_totalruns: g.model_features?.varTotalRuns ?? null,
    resultado_carreras_local: g.game_result?.homeScore ?? null,
    resultado_carreras_visitante: g.game_result?.awayScore ?? null,
    resultado_ganador: g.game_result?.winner ?? null,
    resultado_runline_cubierto: g.game_result?.runLineCovered ?? null,
    resultado_overunder: g.game_result?.overUnderResult ?? null,
    resultado_estado: g.game_result?.gameStatus ?? "Scheduled"
  };
}

// Get list of extracted dates
app.get("/api/extracted-dates", (req, res) => {
  try {
    const db = readGamesDB();
    const dates = Object.keys(db).filter(date => Array.isArray(db[date]) && db[date].length > 0);
    // Sort dates descending
    dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    res.json({ dates });
  } catch (err) {
    console.error("Error retrieving extracted dates:", err);
    res.status(500).json({ error: "Fallo al obtener fechas extraídas" });
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

// Download Batters dataset as CSV
app.get("/api/batters-dataset/csv", (req, res) => {
  try {
    const db = readGamesDB();
    const allGames: MLBGame[] = [];
    for (const date of Object.keys(db)) {
      const games = db[date] || [];
      allGames.push(...games);
    }
    const csvContent = generateBattersCSV(allGames);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=mlb_batters_dataset.csv");
    res.send(csvContent);
  } catch (err) {
    console.error("Error generating Batters CSV:", err);
    res.status(500).send("Error al generar CSV");
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
        ops: 0.785,
        obp: 0.335,
        slg: 0.450,
        wrcPlus: 115,
        runsLast7Games: 38
      },
      away: {
        runsPerGame: 4.2,
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
async function fetchRealBettingLines(date: string) {
  const cacheFile = path.join(process.cwd(), `odds_cache_${date}.json`);
  
  // Check Cache first
  if (fs.existsSync(cacheFile)) {
    try {
      console.log(`Leyendo cuotas desde el caché local: odds_cache_${date}.json`);
      const cached = fs.readFileSync(cacheFile, 'utf-8');
      return JSON.parse(cached);
    } catch (e) {
      console.warn("Error leyendo el caché de cuotas, se ignorará y se descargará nuevamente.", e);
    }
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.warn("ODDS_API_KEY no configurada. No se obtendrán líneas de apuesta reales.");
    return null;
  }

  try {
    const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    console.log(`Obteniendo líneas de apuestas reales de The Odds API...`);
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) {
      console.warn(`The Odds API respondió con error: ${res.status}`);
      return null;
    }
    const data = await res.json();
    
    // Fetch pitcher strikeouts for each event to support K Props
    // We do this concurrently to speed up the process
    const eventsWithProps = await Promise.all(data.map(async (event: any) => {
      try {
        const propsUrl = `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${event.id}/odds?apiKey=${apiKey}&regions=us&markets=pitcher_strikeouts&oddsFormat=american`;
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

    // Save to Cache
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(eventsWithProps, null, 2));
      console.log(`Cuotas guardadas en caché: odds_cache_${date}.json`);
    } catch (e) {
      console.warn("No se pudo guardar el caché de cuotas.", e);
    }

    return eventsWithProps;
  } catch (err) {
    console.error("Error al obtener líneas de apuestas reales:", err);
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
          batters.push({
            name: p.person?.fullName || "Bateador",
            position: p.position?.abbreviation || "DH",
            ab: s.atBats || 0,
            r: s.runs || 0,
            h: s.hits || 0,
            rbi: s.rbi || 0,
            bb: s.baseOnBalls || 0,
            k: s.strikeOuts || 0
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
  const defaultSplit = { avg: 0.250, ops: 0.720, obp: 0.320, slg: 0.400, runsPerGame: 4.5, hr: 15 };
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
      const splitData = {
        avg: safeFloat(s.avg) ?? 0.250,
        ops: safeFloat(s.ops) ?? 0.720,
        obp: safeFloat(s.obp) ?? 0.320,
        slg: safeFloat(s.slg) ?? 0.400,
        runsPerGame: s.runs ? Math.round((parseInt(s.runs) / gp) * 10) / 10 : 4.5,
        hr: parseInt(s.homeRuns) || 0
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
    const ip = safeFloat(stdStat.inningsPitched) || 0;

    // FIP Formula: ((13*HR + 3*(BB+HBP) - 2*SO)/IP) + 3.2
    const fip = ip > 0 ? Math.round(((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + 3.2) * 100) / 100 : null;

    const bf = parseInt(stdStat.battersFaced) || 0;
    const strikeoutRate = bf > 0 && stdStat.strikeOuts ? Math.round((parseInt(stdStat.strikeOuts) / bf) * 1000) / 10 : null;
    const walkRate = bf > 0 && stdStat.baseOnBalls ? Math.round((parseInt(stdStat.baseOnBalls) / bf) * 1000) / 10 : null;

    const go = parseInt(stdStat.groundOuts) || 0;
    const ao = parseInt(stdStat.airOuts) || 0;
    const totalOuts = go + ao;
    const groundBallPct = totalOuts > 0 ? Math.round((go / totalOuts) * 1000) / 10 : null;
    const flyBallPct = totalOuts > 0 ? Math.round((ao / totalOuts) * 1000) / 10 : null;

    const pitches = stdStat.numberOfPitches ? parseInt(stdStat.numberOfPitches) : (bf && advStat.pitchesPerPlateAppearance ? Math.round(bf * parseFloat(advStat.pitchesPerPlateAppearance)) : 0);
    const swingingStrikePct = pitches > 0 && advStat.swingAndMisses ? Math.round((parseInt(advStat.swingAndMisses) / pitches) * 1000) / 10 : null;

    return {
      xEra: null,
      fip: fip,
      xFip: null,
      siera: null,
      hardHitPct: null,
      barrelPct: null,
      groundBallPct,
      flyBallPct,
      strikeoutRate,
      walkRate,
      swingingStrikePct
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
    slg_vs_lhp: 0
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

    for (const split of splits) {
      const code = split.split?.code;
      const stat = split.stat || {};
      if (code === "vr") { // vs Right Handed Pitchers
        ops_vs_rhp = safeFloat(stat.ops) ?? 0;
        slg_vs_rhp = safeFloat(stat.slg) ?? 0;
      } else if (code === "vl") { // vs Left Handed Pitchers
        ops_vs_lhp = safeFloat(stat.ops) ?? 0;
        slg_vs_lhp = safeFloat(stat.slg) ?? 0;
      }
    }

    return {
      ops_vs_rhp,
      ops_vs_lhp,
      slg_vs_rhp,
      slg_vs_lhp
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

async function fetchAdvancedOffense(teamId: number, season: string): Promise<AdvancedOffenseStats> {
  const defaults: AdvancedOffenseStats = {
    wOba: null, xwOba: null, wrcPlus: null, iso: null, babip: null,
    hardHitPct: null, barrelPct: null, contactPct: null, chasePct: null
  };
  try {
    const stdUrl = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&season=${season}&group=hitting`;
    const stdRes = await fetchWithTimeout(stdUrl, 5000);
    let stdStat: any = {};
    if (stdRes.ok) {
      const stdData = await stdRes.json();
      stdStat = stdData.stats?.[0]?.splits?.[0]?.stat || {};
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

    return {
      wOba: woba,
      xwOba: null,
      wrcPlus: null,
      iso,
      babip,
      hardHitPct: null,
      barrelPct: null,
      contactPct: null,
      chasePct: null
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

  const homeWrcPlus = safeFloat(gameData.advanced_offense?.home?.wrcPlus) ?? 100;
  const awayWrcPlus = safeFloat(gameData.advanced_offense?.away?.wrcPlus) ?? 100;

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

  if (gameData.line_movements && gameData.line_movements.length > 1) {
    const opening = gameData.line_movements[0];
    const current = gameData.line_movements[gameData.line_movements.length - 1];
    varMoneyline = current.currentMoneylineHome - opening.currentMoneylineHome;
    varRunLine = current.runLineHomeOdds - opening.runLineHomeOdds;
    varTotalRuns = current.totalRuns - opening.totalRuns;
  }

  return {
    diffEra: Math.round((homeStarterEra - awayStarterEra) * 100) / 100,
    diffXera: Math.round((homeStarterXera - awayStarterXera) * 100) / 100,
    diffFip: Math.round((homeStarterFip - awayStarterFip) * 100) / 100,
    diffOps: Math.round((homeOps - awayOps) * 1000) / 1000,
    diffWrcPlus: Math.round((homeWrcPlus - awayWrcPlus) * 10) / 10,
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

async function fetchGameResult(gamePk: string, bettingLines: BettingLines): Promise<MLGameResult | undefined> {
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

    const runLineHome = bettingLines.runLineHome ?? -1.5;
    let runLineCovered: "home" | "away" | "push" = "push";
    if (homeScore + runLineHome > awayScore) {
      runLineCovered = "home";
    } else if (homeScore + runLineHome < awayScore) {
      runLineCovered = "away";
    }

    const totalRuns = bettingLines.totalRuns ?? 8.5;
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
  realOddsData: any
) {
  // Try to match odds if provided
  let odds: any = null;
  let homeKPropData: any = null;
  let awayKPropData: any = null;

  if (realOddsData && Array.isArray(realOddsData)) {
    const matchOdds = realOddsData.find((o: any) =>
      (o.home_team.includes(homeName) || homeName.includes(o.home_team)) &&
      (o.away_team.includes(awayName) || awayName.includes(o.away_team))
    );
    if (matchOdds && matchOdds.bookmakers && matchOdds.bookmakers.length > 0) {
      const bookie = matchOdds.bookmakers.find((b: any) => b.key === 'draftkings' || b.key === 'fanduel') || matchOdds.bookmakers[0];
      const h2h = bookie.markets.find((m: any) => m.key === 'h2h');
      const spreads = bookie.markets.find((m: any) => m.key === 'spreads');
      const totals = bookie.markets.find((m: any) => m.key === 'totals');
      
      let pitcherStrikeoutsOutcomes: any[] = [];
      for (const b of matchOdds.bookmakers) {
         const m = b.markets.find((mk: any) => mk.key === 'pitcher_strikeouts');
         if (m && m.outcomes) {
            pitcherStrikeoutsOutcomes.push(...m.outcomes);
         }
      }

      if (pitcherStrikeoutsOutcomes.length > 0) {
        const matchProp = (pitcherName: string) => {
           if (!pitcherName || pitcherName === "Por definir" || pitcherName === "TBD") return null;
           const parts = pitcherName.split(' ');
           const lastName = parts[parts.length - 1];
           const outcomes = pitcherStrikeoutsOutcomes.filter((o: any) => 
               o.description && (o.description.includes(pitcherName) || o.description.includes(lastName))
           );
           if (outcomes.length > 0) {
              const over = outcomes.find((o:any) => o.name === 'Over');
              const under = outcomes.find((o:any) => o.name === 'Under');
              return { point: over?.point || under?.point || null, overOdds: over?.price || null, underOdds: under?.price || null };
           }
           return null;
        };
        homeKPropData = matchProp(realMLBData?.pitchers?.home?.name);
        awayKPropData = matchProp(realMLBData?.pitchers?.away?.name);
      }

      odds = {
        openingMoneylineHome: h2h?.outcomes.find((o: any) => o.name === matchOdds.home_team)?.price || -110,
        openingMoneylineAway: h2h?.outcomes.find((o: any) => o.name === matchOdds.away_team)?.price || -110,
        currentMoneylineHome: h2h?.outcomes.find((o: any) => o.name === matchOdds.home_team)?.price || -110,
        currentMoneylineAway: h2h?.outcomes.find((o: any) => o.name === matchOdds.away_team)?.price || -110,
        runLineHome: spreads?.outcomes.find((o: any) => o.name === matchOdds.home_team)?.point || -1.5,
        runLineHomeOdds: spreads?.outcomes.find((o: any) => o.name === matchOdds.home_team)?.price || -110,
        runLineAway: spreads?.outcomes.find((o: any) => o.name === matchOdds.away_team)?.point || 1.5,
        runLineAwayOdds: spreads?.outcomes.find((o: any) => o.name === matchOdds.away_team)?.price || -110,
        totalRuns: totals?.outcomes.find((o: any) => o.name === 'Over')?.point || 8.5,
        overOdds: totals?.outcomes.find((o: any) => o.name === 'Over')?.price || -110,
        underOdds: totals?.outcomes.find((o: any) => o.name === 'Under')?.price || -110,
        lineMovementSummary: "Líneas de cuotas provistas por The Odds API (Modo Directo)."
      };
    }
  }

  // Fallback odds if matching failed
  if (!odds) {
    odds = {
      openingMoneylineHome: -110, openingMoneylineAway: -110,
      currentMoneylineHome: -110, currentMoneylineAway: -110,
      runLineHome: -1.5, runLineHomeOdds: -110, runLineAway: 1.5, runLineAwayOdds: -110,
      totalRuns: 8.5, overOdds: -110, underOdds: -110,
      lineMovementSummary: "Líneas estándar generadas automáticamente (Sin IA)."
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
        strikeoutProp: homeKPropData?.point ?? null,
        strikeoutPropOverOdds: homeKPropData?.overOdds ?? null,
        strikeoutPropUnderOdds: homeKPropData?.underOdds ?? null,
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
        strikeoutProp: awayKPropData?.point ?? null,
        strikeoutPropOverOdds: awayKPropData?.overOdds ?? null,
        strikeoutPropUnderOdds: awayKPropData?.underOdds ?? null,
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
        ops: safeFloat(realMLBData?.teamOffense?.home?.ops) ?? "N/A",
        obp: safeFloat(realMLBData?.teamOffense?.home?.obp) ?? "N/A",
        slg: safeFloat(realMLBData?.teamOffense?.home?.slg) ?? "N/A"
      },
      away: {
        runsPerGame: safeFloat(realMLBData?.teamOffense?.away?.runsPerGame) ?? "N/A",
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
      home: (realMLBData?.lineups?.home || []).map((p: any) => ({
        name: p.name || "Jugador",
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
        last7_avg: safeFloat(p.last7_avg) || 0.0,
        last7_ops: safeFloat(p.last7_ops) || 0.0,
        last7_slg: safeFloat(p.last7_slg) || 0.0,
        last7_total_bases: parseInt(p.last7_total_bases) || 0,
        last7_hits: parseInt(p.last7_hits) || 0,
        last7_xbh: parseInt(p.last7_xbh) || 0
      })),
      away: (realMLBData?.lineups?.away || []).map((p: any) => ({
        name: p.name || "Jugador",
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
        last7_avg: safeFloat(p.last7_avg) || 0.0,
        last7_ops: safeFloat(p.last7_ops) || 0.0,
        last7_slg: safeFloat(p.last7_slg) || 0.0,
        last7_total_bases: parseInt(p.last7_total_bases) || 0,
        last7_hits: parseInt(p.last7_hits) || 0,
        last7_xbh: parseInt(p.last7_xbh) || 0
      }))
    },
    linescore: realMLBData?.linescore || null,
    liveBoxscore: realMLBData?.liveBoxscore || null,
    playByPlay: realMLBData?.playByPlay || null
  };
}

// Harvester endpoint (SSE streaming)
app.post("/api/harvest", async (req, res) => {
  const { date } = req.body;
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
  const realOddsData = await fetchRealBettingLines(date);

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

    for (let gi = 0; gi < matchesToHarvest.length; gi++) {
      const match = matchesToHarvest[gi];
      const homeName = match.teams.home.team.name;
      const awayName = match.teams.away.team.name;
      const homeTeamId: number = match.teams.home.team.id;
      const awayTeamId: number = match.teams.away.team.id;
      const venueName = match.venue?.name || "MLB Stadium";
      const matchTime = match.gameDate ? new Date(match.gameDate).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }) : "19:00 PM";
      const gameId = String(match.gamePk);
      const gameLabel = `${awayName} @ ${homeName}`;
      const basePct = 5 + gi * pctPerGame; // starting pct for this game

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

      const gameDataParsed: any = buildDirectGameData(gameId, homeName, awayName, venueName, date, matchTime, realMLBData, realOddsData);

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
        homeVsOpp,
        awayVsOpp,
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
        fetchAdvancedPitchingVsOpp(homePitcherId, awayTeamId),
        fetchAdvancedPitchingVsOpp(awayPitcherId, homeTeamId),
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

      // Handle Line Movements timeline
      const currentDB = readGamesDB();
      const existingGamesForDate = currentDB[date] || [];
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
async function updateSingleGameData(gameId: string, date: string): Promise<any> {
  console.log(`Actualizando juego individual ${gameId} para la fecha ${date}...`);

  // 1. Fetch MLB Schedule for the date to find the match details
  const mlbRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`);
  const mlbData = await mlbRes.json();
  let match: any = null;
  if (mlbData.dates && mlbData.dates[0] && mlbData.dates[0].games) {
    match = mlbData.dates[0].games.find((g: any) => String(g.gamePk) === String(gameId));
  }

  if (!match) {
    throw new Error(`Juego ${gameId} no encontrado en el calendario de la fecha ${date}`);
  }

  const homeName = match.teams.home.team.name;
  const awayName = match.teams.away.team.name;
  const homeTeamId: number = match.teams.home.team.id;
  const awayTeamId: number = match.teams.away.team.id;
  const venueName = match.venue?.name || "MLB Stadium";
  const matchTime = match.gameDate ? new Date(match.gameDate).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }) : "19:00 PM";

  // 2. Fetch real odds
  const realOddsData = await fetchRealBettingLines(date);

  // 3. Fetch real MLB game data
  const realMLBData = await fetchRealMLBGameData(gameId, homeTeamId, awayTeamId, date);

  // 4. Build game data
  const gameDataParsed: any = buildDirectGameData(gameId, homeName, awayName, venueName, date, matchTime, realMLBData, realOddsData);

  // 5. Fetch advanced stats
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
    homeVsOpp,
    awayVsOpp,
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
    fetchAdvancedPitchingVsOpp(homePitcherId, awayTeamId),
    fetchAdvancedPitchingVsOpp(awayPitcherId, homeTeamId),
    fetchAdvancedOffense(homeTeamId, season),
    fetchAdvancedOffense(awayTeamId, season),
    fetchFatigueMetrics(homePitcherId, awayPitcherId, homeTeamId, awayTeamId, date)
  ]);

  // Populate advanced fields
  gameDataParsed.weather = weather;
  gameDataParsed.offensive_splits = { home: homeSplits, away: awaySplits };
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
  const existingGamesForDate = currentDB[date] || [];
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

  currentDB[date] = updatedGames;
  writeGamesDB(currentDB);
  writeErrorsDB(errorsCollection);

  return gameDataParsed;
}

// Harvester endpoint for individual game updates
app.post("/api/harvest-game", async (req, res) => {
  const { gameId, date } = req.body;
  if (!gameId || !date || typeof gameId !== "string" || typeof date !== "string") {
    res.status(400).json({ error: "gameId y date son requeridos" });
    return;
  }

  try {
    const updatedGame = await updateSingleGameData(gameId, date);
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

// Serve static assets in production or connect Vite in development
async function startServer() {
  // Intentar restaurar base de datos local desde Firestore si está vacía
  try {
    const localDB = readGamesDB();
    const isLocalEmpty = Object.keys(localDB).length === 0;
    const hasFirebase = !!process.env.FIREBASE_PROJECT_ID;

    if (isLocalEmpty && hasFirebase) {
      console.log("[Restaurador Firestore] La base de datos local está vacía. Restaurando desde Firestore...");
      const games = await loadAllGamesFromFirestore();
      if (games && games.length > 0) {
        const restoredDB: Record<string, any[]> = {};
        for (const game of games) {
          const date = game.metadata?.date;
          if (date) {
            if (!restoredDB[date]) {
              restoredDB[date] = [];
            }
            const { timestamp, ...cleanGame } = game;
            restoredDB[date].push(cleanGame);
          }
        }
        writeGamesDB(restoredDB);
        console.log(`[Restaurador Firestore] Base de datos restaurada exitosamente con ${games.length} juegos en total.`);
      } else {
        console.log("[Restaurador Firestore] No se encontraron juegos en Firestore o la colección está vacía.");
      }
    } else if (isLocalEmpty && !hasFirebase) {
      console.warn("[Restaurador Firestore] La base de datos local está vacía, pero FIREBASE_PROJECT_ID no está configurado. Saltando restauración.");
    }
  } catch (fsRestoreErr) {
    console.error("[Restaurador Firestore] Error general al intentar restaurar desde Firestore:", fsRestoreErr);
  }

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
  });
}

startServer();
