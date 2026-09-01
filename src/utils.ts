/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MLBGame } from "./types";
import { enrichWithVortexMetrics } from "./etl/transformers/vortexMetrics";
import { savantCache } from "./etl/extractors/savantScraper";

export function escapeCsvValue(val: any): string {
  if (val === undefined || val === null || val === "") return "";
  return `"${String(val).replace(/"/g, '""')}"`;
}

function roundCsvNumber(val: any, decimals = 1): number | string {
  if (val === undefined || val === null || val === "") return "";
  const parsed = Number(val);
  if (!Number.isFinite(parsed)) return "";
  const factor = Math.pow(10, decimals);
  return Math.round(parsed * factor) / factor;
}

function parseNum(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function calcLast3Stats(v1: any, v2: any, v3: any) {
  const nums = [parseNum(v1), parseNum(v2), parseNum(v3)].filter((n): n is number => n !== null);
  if (nums.length === 0) return { avg: "", min: "", under15: "", under18: "" };
  
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = (sum / nums.length).toFixed(1);
  const min = Math.min(...nums).toString();
  const under15 = nums.filter(v => v < 15).length.toString();
  const under18 = nums.filter(v => v < 18).length.toString();
  
  return { avg, min, under15, under18 };
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

export function getTeamAbbr(teamName: string): string | null {
  return MLB_TEAM_ABBR[teamName] || null;
}


function getLineupAverageKPct(lineup: any[] | undefined): string {
  if (!lineup || !Array.isArray(lineup) || lineup.length === 0) return "";
  
  let totalPA = 0;
  let totalSO = 0;
  
  for (const p of lineup) {
    const kPct = p.strikeout_pct ?? p.kPct ?? 0;
    const pa = p.pa || 0;
    
    if (pa > 0) {
      totalPA += pa;
      totalSO += (kPct / 100) * pa;
    }
  }

  // Fallback a promedio simple si ninguno tiene PA (muy raro)
  if (totalPA === 0) {
    const sum = lineup.reduce((acc, p) => acc + (p.strikeout_pct ?? p.kPct ?? 0), 0);
    return (sum / lineup.length).toFixed(1);
  }

  return ((totalSO / totalPA) * 100).toFixed(1);
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

function hasRealBettingLines(game: MLBGame): boolean {
  const summary = String(game.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("estandar") || summary.includes("estándar") || summary.includes("sin lineas reales") || summary.includes("sin líneas reales")) {
    return false;
  }
  const lines = game.betting_lines;
  const isSyntheticDefault =
    lines?.openingMoneylineHome === -110 &&
    lines?.openingMoneylineAway === -110 &&
    lines?.currentMoneylineHome === -110 &&
    lines?.currentMoneylineAway === -110 &&
    lines?.runLineHome === -1.5 &&
    lines?.runLineHomeOdds === -110 &&
    lines?.runLineAway === 1.5 &&
    lines?.runLineAwayOdds === -110 &&
    lines?.totalRuns === 8.5 &&
    lines?.overOdds === -110 &&
    lines?.underOdds === -110;
  if (isSyntheticDefault) return false;
  return [
    lines?.openingMoneylineHome,
    lines?.openingMoneylineAway,
    lines?.currentMoneylineHome,
    lines?.currentMoneylineAway,
    lines?.runLineHome,
    lines?.runLineHomeOdds,
    lines?.runLineAway,
    lines?.runLineAwayOdds,
    lines?.totalRuns,
    lines?.overOdds,
    lines?.underOdds
  ].some((value) => value !== null && value !== undefined);
}

function getBettingLineSource(game: MLBGame): string {
  if (!hasRealBettingLines(game)) return "";
  const explicitSource = game.betting_lines?.lineSource;
  if (explicitSource) return explicitSource;
  const summary = String(game.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("odds api")) return "the_odds_api";
  if (summary.includes("datastreak") || summary.includes("data streak")) return "datastreak";
  return "";
}

function getPropLineSource(source?: string | null, book?: string | null): string {
  if (source) return source;
  const normalizedBook = String(book || "").toLowerCase();
  if (normalizedBook.includes("oddsapi") || normalizedBook.includes("odds api")) return "the_odds_api";
  if (normalizedBook.includes("datastreak") || normalizedBook.includes("data streak")) return "datastreak";
  if (normalizedBook) return "datastreak";
  return "";
}

function calculateIpPerStart(ipStr: string | number | undefined | null, starts: string | number | undefined | null): string {
  if (!ipStr || !starts) return "";
  const ipStrVal = String(ipStr);
  const startsNum = Number(starts);
  if (startsNum <= 0) return "";

  const parts = ipStrVal.split(".");
  let fullInnings = Number(parts[0]) || 0;
  let partialInnings = 0;
  if (parts.length > 1) {
    const fraction = Number(parts[1]);
    if (fraction === 1) partialInnings = 1 / 3;
    else if (fraction === 2) partialInnings = 2 / 3;
  }
  
  const totalInnings = fullInnings + partialInnings;
  const avg = totalInnings / startsNum;
  return avg.toFixed(2);
}


/**
 * pitcherPitStatsBlockValues — Fase 4, punto 2 del plan de mejora.
 *
 * `generateMLDatasetCSV` y `generateBattersCSV` repetían, cada uno por su lado
 * (una vez para el lanzador local y otra para el visitante), el mismo bloque
 * de 11 columnas de stats de lanzador point-in-time (era/whip/kPct/bbPct/
 * wins/losses/ip/strikeouts/gs/ipAvgPerStart/stats_source_flag). Cuando en la
 * Fase 1 se corrigió el bug de "celda vacía si no hay cobertura PIT en vez de
 * usar el valor crudo con fuga de fechas futuras", el fix se aplicó dos veces
 * por separado en cada generador — exactamente el tipo de duplicación que
 * hace fácil arreglar un lado y olvidarse del otro. Esta función es la única
 * fuente de verdad para ese bloque; ambos generadores la llaman para el
 * lanzador local y el visitante.
 *
 * `pit` es la entrada de PITLookups.pitchers[gameId].home/away (o
 * PITLookups.boxscore[gameId].home/away en el caso de generateMLDatasetCSV) —
 * sin tipo fuerte todavía porque PITLookups las declara como `any` (ver
 * PITLookups en este mismo archivo); acotar ese `any` es tarea de la Fase 4,
 * punto 5, no de este cambio.
 */
function pitcherPitStatsBlockValues(pit: PitStatsEntry | null | undefined): (string | number)[] {
  return [
    pit?.era ?? "",
    pit?.whip ?? "",
    pit?.kPct ?? "",
    pit?.bbPct ?? "",
    pit?.wins ?? "",
    pit?.losses ?? "",
    escapeCsvValue(pit?.ip ?? ""),
    pit?.totalStrikeouts ?? "",
    pit?.gs ?? "",
    pit?.ipAvgPerStart ?? "",
    pit ? "pit" : "",
  ];
}

// Generate CSV string representing MLB_MASTER_DATA format (Requisito 7)

function getPitcherDerivedMetrics(g: any, side: 'home' | 'away') {
  const p = g.pitchers?.[side + '_starter'] || g.pitchers?.[side] || {};
  const ap = g.advanced_pitching?.[side] || {};

  const pitches = [
    { name: "Fastball", pct: parseFloat(ap.fastballPct || "0") },
    { name: "Slider", pct: parseFloat(ap.sliderPct || "0") },
    { name: "Curveball", pct: parseFloat(ap.curvePct || "0") },
    { name: "Changeup", pct: parseFloat(ap.changeupPct || "0") },
    { name: "Splitter", pct: parseFloat(ap.splitterPct || "0") },
  ].sort((a, b) => b.pct - a.pct);

  const primary_pitch = pitches[0]?.pct > 0 ? pitches[0].name : "";
  const primary_usage = pitches[0]?.pct > 0 ? pitches[0].pct.toString() : "";
  const secondary_pitch = pitches[1]?.pct > 0 ? pitches[1].name : "";
  const secondary_usage = pitches[1]?.pct > 0 ? pitches[1].pct.toString() : "";

  // Last 5
  const pitchesLast5 = parseFloat(p.pitchesLast5 || ap.last5PitchCountAvg || "0");
  const bfLast5 = parseFloat(p.bfLast5 || ap.last5BfAvg || "0");
  const ipLast5 = parseFloat(p.ipLast5 || ap.last5IpAvg || "0");
  
  const pitches_per_bf_last5 = (pitchesLast5 > 0 && bfLast5 > 0) ? (pitchesLast5 / bfLast5).toFixed(2) : "";
  const pitches_per_ip_last5 = (pitchesLast5 > 0 && ipLast5 > 0) ? (pitchesLast5 / ipLast5).toFixed(2) : "";

  // Overall (Requested by user as home_pitcher_pitches_per_bf)
  const totalPitches = parseFloat(ap.projectedPitchCount || "0");
  const totalBf = parseFloat(ap.battersFacedPerStart || "0");
  const pitches_per_bf = (totalPitches > 0 && totalBf > 0) ? (totalPitches / totalBf).toFixed(2) : "";

  // Rest status
  const restDays = parseFloat(p.restDays || "0");
  const rest_status = restDays >= 5 ? "Fully Rested" : restDays === 4 ? "Normal Rest" : "Short Rest";

  return {
    primary_pitch: p.pitcher_primary_pitch || primary_pitch,
    primary_usage: p.pitcher_primary_pitch_usage_pct || primary_usage,
    secondary_pitch: p.pitcher_secondary_pitch || secondary_pitch,
    secondary_usage: p.pitcher_secondary_pitch_usage_pct || secondary_usage,
    pitches_per_bf_last5: p.pitcher_pitches_per_bf_last5 || pitches_per_bf_last5,
    pitches_per_ip_last5: p.pitcher_pitches_per_ip_last5 || pitches_per_ip_last5,
    pitches_per_bf: pitches_per_bf,
    rest_status: p.pitcher_rest_status || rest_status
  };
}

export function generateMLBDataCSV(games: MLBGame[]): string {
  const headers = [
    "game_id",
    "date",
    "time",
    "home_team",
    "away_team",
    "venue",
    "home_pitcher",
    "home_pitcher_era",
    "home_pitcher_whip",
    "home_pitcher_kPct",
    "home_pitcher_bbPct",
    "home_pitcher_wins",
    "home_pitcher_losses",
    "home_pitcher_ip",
    "home_pitcher_strikeouts",
    "home_pitcher_starts",
    "home_pitcher_avg_ip",
    "home_pitcher_projected_ks",
    "away_pitcher",
    "away_pitcher_era",
    "away_pitcher_whip",
    "away_pitcher_kPct",
    "away_pitcher_bbPct",
    "away_pitcher_wins",
    "away_pitcher_losses",
    "away_pitcher_ip",
    "away_pitcher_strikeouts",
    "away_pitcher_starts",
    "away_pitcher_avg_ip",
    "away_pitcher_projected_ks",
    "home_bullpen_era",
    "home_bullpen_ip_7d",
    "away_bullpen_era",
    "away_bullpen_ip_7d",
    "home_offense_run_g",
    "home_offense_ops",
    "home_offense_obp",
    "home_offense_slg",
    "home_offense_kPct",
    "away_offense_run_g",
    "away_offense_ops",
    "away_offense_obp",
    "away_offense_slg",
    "away_offense_kPct",
    "home_moneyline_open",
    "home_moneyline_curr",
    "away_moneyline_open",
    "away_moneyline_curr",
    "total_runs",
    "line_source"
  ];

  const rows = games.map(g => {
    const canUseBettingLines = hasRealBettingLines(g);
    return [
      g.id,
      g.metadata.date,
      g.metadata.time,
      g.metadata.homeTeam,
      g.metadata.awayTeam,
      g.metadata.venue,
      g.pitchers.home.name,
      g.pitchers.home.era,
      g.pitchers.home.whip,
      g.pitchers.home.kPct,
      g.pitchers.home.bbPct,
      g.pitchers.home.wins,
      g.pitchers.home.losses,
      g.pitchers.home.ip,
      g.pitchers.home.totalStrikeouts ?? "",
      g.pitchers.home.starts ?? "",
      calculateIpPerStart(g.pitchers.home.ip, g.pitchers.home.starts),
      g.advanced_pitching?.home?.projectedStrikeoutsBase ?? "",
      g.pitchers.away.name,
      g.pitchers.away.era,
      g.pitchers.away.whip,
      g.pitchers.away.kPct,
      g.pitchers.away.bbPct,
      g.pitchers.away.wins,
      g.pitchers.away.losses,
      g.pitchers.away.ip,
      g.pitchers.away.totalStrikeouts ?? "",
      g.pitchers.away.starts ?? "",
      calculateIpPerStart(g.pitchers.away.ip, g.pitchers.away.starts),
      g.advanced_pitching?.away?.projectedStrikeoutsBase ?? "",
      g.bullpen.home.era,
      g.bullpen.home.ipLast7Days,
      g.bullpen.away.era,
      g.bullpen.away.ipLast7Days,
      g.offense.home.runsPerGame,
      g.offense.home.ops,
      g.offense.home.obp,
      g.offense.home.slg,
      hOff?.kPct ?? getLineupAverageKPct(g.lineups?.home),
      aOff?.runsPerGame ?? g.offense.away.runsPerGame,
      aOff?.ops         ?? g.offense.away.ops,
      aOff?.obp         ?? g.offense.away.obp,
      aOff?.slg         ?? g.offense.away.slg,
      aOff?.kPct ?? getLineupAverageKPct(g.lineups?.away),
      canUseBettingLines ? g.betting_lines.openingMoneylineHome : "",
      canUseBettingLines ? g.betting_lines.currentMoneylineHome : "",
      canUseBettingLines ? g.betting_lines.openingMoneylineAway : "",
      canUseBettingLines ? g.betting_lines.currentMoneylineAway : "",
      canUseBettingLines ? g.betting_lines.totalRuns : "",
      canUseBettingLines ? getBettingLineSource(g) : ""
    ];
  });

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

// ─── PIT Lookup types ────────────────────────────────────────────────────────

/**
 * Fase 4, punto 5 del plan de mejora: forma real de una entrada de
 * pitcher_stats_pit.json (lo que produce backfill_pitcher_stats_pit.py /
 * generate_pit.ts, y lo que consumen injectPitStats y
 * canReuseStoredGame/hasPitCoverage en server.ts, y
 * pitcherPitStatsBlockValues acá mismo). Antes era `any` — quedaba sin
 * chequear que los cuatro consumidores leyeran exactamente los mismos
 * campos, que es justo el tipo de desincronización que causó que el bloque
 * de lanzador se duplicara (punto 2 de esta misma fase).
 */
export interface PitStatsEntry {
  era?: number | string | null;
  whip?: number | string | null;
  kPct?: number | string | null;
  bbPct?: number | string | null;
  wins?: number | string | null;
  losses?: number | string | null;
  ip?: number | string | null;
  totalStrikeouts?: number | string | null;
  gs?: number | string | null;
  ipAvgPerStart?: number | string | null;
}

export interface PITLookups {
  /** pitcher_stats_pit.json: { [gameId]: { home: PitcherPIT, away: PitcherPIT } } */
  pitchers?: Record<string, { home?: PitStatsEntry; away?: PitStatsEntry }>;
  /** offense_stats_pit.json: { [gameId]: { home: OffensePIT, away: OffensePIT } } */
  offense?: Record<string, { home: any; away: any }>;
  /**
   * boxscore_game_stats.json: { [gameId]: { home: BoxscoreStats, away: BoxscoreStats } } —
   * forma distinta a PitStatsEntry (stats reales del boxscore del juego, no
   * proyecciones de temporada: inningsPitched/battersFaced/strikeOuts/etc.),
   * fuera del alcance acotado de la Fase 4 punto 5.
   */
  boxscore?: Record<string, { home: any; away: any }>;
}

// Generate wide CSV for Machine Learning dataset (con all features, weather, splits, sabermetrics, fatigue and results)
export function generateMLDatasetCSV(games: MLBGame[], pitLookups: PITLookups = {}): string {
  const headers = [
    // Metadata
    "game_id", "date", "time", "home_team", "away_team", "venue",
    // Pitchers standard
    "home_pitcher", "home_pitcher_era", "home_pitcher_whip", "home_pitcher_kPct", "home_pitcher_bbPct", "home_pitcher_wins", "home_pitcher_losses", "home_pitcher_ip", "home_pitcher_strikeouts", "home_pitcher_gs", "home_pitcher_ip_avg_start", "home_pitcher_stats_source",
    "away_pitcher", "away_pitcher_era", "away_pitcher_whip", "away_pitcher_kPct", "away_pitcher_bbPct", "away_pitcher_wins", "away_pitcher_losses", "away_pitcher_ip", "away_pitcher_strikeouts", "away_pitcher_gs", "away_pitcher_ip_avg_start", "away_pitcher_stats_source",
    // Bullpen standard
    "home_bullpen_era", "home_bullpen_usage", "home_bullpen_ip_7d",
    "away_bullpen_era", "away_bullpen_usage", "away_bullpen_ip_7d",
    // Offense standard
    "home_offense_run_g", "home_offense_ops", "home_offense_obp", "home_offense_slg", "home_offense_kPct",
    "away_offense_run_g", "away_offense_ops", "away_offense_obp", "away_offense_slg", "away_offense_kPct",
    // Weather
    "weather_temp", "weather_humidity", "weather_wind_speed", "weather_wind_dir", "weather_pressure", "weather_rain_prob", "weather_sky", "weather_apparent_temp",
    // Home splits
    "home_splits_vs_rhp_avg", "home_splits_vs_rhp_ops", "home_splits_vs_rhp_obp", "home_splits_vs_rhp_slg", "home_splits_vs_rhp_rpg", "home_splits_vs_rhp_hr",
    "home_splits_vs_lhp_avg", "home_splits_vs_lhp_ops", "home_splits_vs_lhp_obp", "home_splits_vs_lhp_slg", "home_splits_vs_lhp_rpg", "home_splits_vs_lhp_hr",
    // Away splits
    "away_splits_vs_rhp_avg", "away_splits_vs_rhp_ops", "away_splits_vs_rhp_obp", "away_splits_vs_rhp_slg", "away_splits_vs_rhp_rpg", "away_splits_vs_rhp_hr",
    "away_splits_vs_lhp_avg", "away_splits_vs_lhp_ops", "away_splits_vs_lhp_obp", "away_splits_vs_lhp_slg", "away_splits_vs_lhp_rpg", "away_splits_vs_lhp_hr",
    // Fatigue
    "home_pitcher_rest", "home_pitcher_pitches_last", "home_pitcher_pitches_last_3",
    "away_pitcher_rest", "away_pitcher_pitches_last", "away_pitcher_pitches_last_3",
    "home_bullpen_ip_3d", "home_bullpen_ip_7d_recent", "home_bullpen_relievers_yesterday", "home_bullpen_relievers_2d", "home_bullpen_available",
    "away_bullpen_ip_3d", "away_bullpen_ip_7d_recent", "away_bullpen_relievers_yesterday", "away_bullpen_relievers_2d", "away_bullpen_available",
    // Advanced Pitching
    "home_pitcher_xera", "home_pitcher_fip", "home_pitcher_xfip", "home_pitcher_siera", "home_pitcher_hardhit_pct", "home_pitcher_barrel_pct", "home_pitcher_gb_pct", "home_pitcher_fb_pct", "home_pitcher_so_rate", "home_pitcher_bb_rate", "home_pitcher_swstr_pct", "home_pitcher_csw_pct", "home_pitcher_actual_ks", "home_pitcher_last5_ks_avg", "home_pitcher_last5_ks_std", "home_pitcher_last5_ip_avg", "home_pitcher_last5_bf_avg", "home_pitcher_last5_pitch_count_avg", "home_pitcher_last3_ks_1", "home_pitcher_last3_ks_2", "home_pitcher_last3_ks_3", "home_pitcher_last3_ip_1", "home_pitcher_last3_ip_2", "home_pitcher_last3_ip_3", "home_pitcher_last3_bf_1", "home_pitcher_last3_bf_2", "home_pitcher_last3_bf_3", "home_pitcher_career_k_pct_vs_team", "home_pitcher_last3_vs_team_ks_avg", "home_pitcher_last3_vs_team_bf_avg", "home_pitcher_bvp_pa_vs_team", "home_pitcher_projected_pitches", "home_pitcher_projected_innings", "home_pitcher_projected_strikeouts", "home_pitcher_bf_per_start", "home_pitcher_fastball_pct", "home_pitcher_slider_pct", "home_pitcher_curve_pct", "home_pitcher_changeup_pct", "home_pitcher_splitter_pct", "home_catcher_name", "home_catcher_framing_runs", "home_pitcher_last3_bf_avg", "home_pitcher_last3_ip_avg", "home_pitcher_last3_ks_avg", "home_pitcher_last3_min_bf", "home_pitcher_last3_min_ip", "home_pitcher_last3_bf_under_15_count", "home_pitcher_last3_bf_under_18_count",
    "away_pitcher_xera", "away_pitcher_fip", "away_pitcher_xfip", "away_pitcher_siera", "away_pitcher_hardhit_pct", "away_pitcher_barrel_pct", "away_pitcher_gb_pct", "away_pitcher_fb_pct", "away_pitcher_so_rate", "away_pitcher_bb_rate", "away_pitcher_swstr_pct", "away_pitcher_csw_pct", "away_pitcher_actual_ks", "away_pitcher_last5_ks_avg", "away_pitcher_last5_ks_std", "away_pitcher_last5_ip_avg", "away_pitcher_last5_bf_avg", "away_pitcher_last5_pitch_count_avg", "away_pitcher_last3_ks_1", "away_pitcher_last3_ks_2", "away_pitcher_last3_ks_3", "away_pitcher_last3_ip_1", "away_pitcher_last3_ip_2", "away_pitcher_last3_ip_3", "away_pitcher_last3_bf_1", "away_pitcher_last3_bf_2", "away_pitcher_last3_bf_3", "away_pitcher_career_k_pct_vs_team", "away_pitcher_last3_vs_team_ks_avg", "away_pitcher_last3_vs_team_bf_avg", "away_pitcher_bvp_pa_vs_team", "away_pitcher_projected_pitches", "away_pitcher_projected_innings", "away_pitcher_projected_strikeouts", "away_pitcher_bf_per_start", "away_pitcher_fastball_pct", "away_pitcher_slider_pct", "away_pitcher_curve_pct", "away_pitcher_changeup_pct", "away_pitcher_splitter_pct", "away_catcher_name", "away_catcher_framing_runs", "away_pitcher_last3_bf_avg", "away_pitcher_last3_ip_avg", "away_pitcher_last3_ks_avg", "away_pitcher_last3_min_bf", "away_pitcher_last3_min_ip", "away_pitcher_last3_bf_under_15_count", "away_pitcher_last3_bf_under_18_count",
    // Advanced Offense
    "home_offense_woba", "home_offense_xwoba", "home_offense_iso", "home_offense_babip", "home_offense_hardhit_pct", "home_offense_barrel_pct", "home_offense_contact_pct", "home_offense_k_pct_vs_pitch_hand", "home_projected_lineup_k_pct_vs_hand", "home_projected_lineup_contact_pct_vs_hand", "home_projected_lineup_whiff_pct_vs_hand", "home_offense_whiff_pct_vs_fastball", "home_offense_whiff_pct_vs_slider", "home_offense_whiff_pct_vs_curve", "home_offense_whiff_pct_vs_changeup", "home_offense_whiff_pct_vs_splitter",
    "away_offense_woba", "away_offense_xwoba", "away_offense_iso", "away_offense_babip", "away_offense_hardhit_pct", "away_offense_barrel_pct", "away_offense_contact_pct", "away_offense_k_pct_vs_pitch_hand", "away_projected_lineup_k_pct_vs_hand", "away_projected_lineup_contact_pct_vs_hand", "away_projected_lineup_whiff_pct_vs_hand", "away_offense_whiff_pct_vs_fastball", "away_offense_whiff_pct_vs_slider", "away_offense_whiff_pct_vs_curve", "away_offense_whiff_pct_vs_changeup", "away_offense_whiff_pct_vs_splitter",
    // Model Features
    "diff_era", "diff_xera", "diff_fip", "diff_ops", "diff_xwoba", "diff_bullpen_era", "diff_runs_per_game", "diff_record_last10", "diff_record_home_away", "diff_starter_rest", "diff_bullpen_fatigue",
    // Metadata de confiabilidad point-in-time (ver auditoría del pipeline, sección 3):
    // fecha en que se descargó el snapshot de Baseball Savant usado para las columnas
    // xera/xwoba/hardhit_pct/barrel_pct/swstr_pct/csw_pct/arsenal%/framing de esta fila.
    // Ese snapshot es "temporada completa hasta hoy", no recortado a la fecha del juego:
    // si "date" de la fila es anterior a savant_metrics_asof_date, esas columnas pueden
    // incluir información posterior al juego y no deben tratarse como point-in-time.
    "savant_metrics_asof_date",
    // Game Results / ML Target Labels
    "home_score", "away_score", "winner", "game_status",
    // VORTEX V10.3 METRICS (47 Variables)
    "lineup_confirmed", "lineup_source", "lineup_updated_at",
    "home_pitcher_primary_pitch", "home_pitcher_primary_pitch_usage_pct", "home_pitcher_secondary_pitch", "home_pitcher_secondary_pitch_usage_pct", "home_pitcher_pitches_per_bf", "home_pitcher_pitches_per_bf_last5", "home_pitcher_pitches_per_ip_last5",
    "away_pitcher_primary_pitch", "away_pitcher_primary_pitch_usage_pct", "away_pitcher_secondary_pitch", "away_pitcher_secondary_pitch_usage_pct", "away_pitcher_pitches_per_bf", "away_pitcher_pitches_per_bf_last5", "away_pitcher_pitches_per_ip_last5",
    "home_pitcher_avg_pitches_last3", "home_pitcher_rest_status", "away_pitcher_avg_pitches_last3", "away_pitcher_rest_status", "home_pitcher_pitchHand", "away_pitcher_pitchHand",
    "bullpen_home_ipLast3Days", "bullpen_home_ipLast7Days", "bullpen_away_ipLast3Days", "bullpen_away_ipLast7Days", "bullpen_home_relieversUsedYesterday",
    "home_lineup_contact_stress_score", "home_lineup_pitch_count_risk_score", "home_lineup_high_hardhit_batters_count", "away_lineup_contact_stress_score", "away_lineup_pitch_count_risk_score", "away_lineup_high_hardhit_batters_count",
    "home_pitcher_recent_velocity", "away_pitcher_recent_velocity",
    // New Advanced Metrics & Park Factors
    "home_pitcher_spin_rate", "away_pitcher_spin_rate",
    "home_pitcher_stuff_plus", "away_pitcher_stuff_plus",
    "home_pitcher_o_swing_pct", "away_pitcher_o_swing_pct",
    "home_pitcher_k_pct_vs_lhb", "away_pitcher_k_pct_vs_lhb",
    "home_pitcher_k_pct_vs_rhb", "away_pitcher_k_pct_vs_rhb",
    "park_factor_k", "park_factor_runs", "park_factor_hr",
    // ── BOXSCORE: Real starter stats from finished games (point-in-time target labels) ──
    "home_starter_game_ip", "home_starter_game_bf", "home_starter_game_hits",
    "home_starter_game_er", "home_starter_game_k", "home_starter_game_bb",
    "home_starter_game_pitches", "home_starter_game_hr", "home_starter_game_score",
    "away_starter_game_ip", "away_starter_game_bf", "away_starter_game_hits",
    "away_starter_game_er", "away_starter_game_k", "away_starter_game_bb",
    "away_starter_game_pitches", "away_starter_game_hr", "away_starter_game_score"
  ];

  const escapeStr = (val: any) => {
    if (val === undefined || val === null || val === "") return "";
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const rows = games.map(g => {
    const gameId = String(g.id);

    // ── PIT Lookups — use corrected stats if available, fallback to document ──
    const pitPIT   = pitLookups.pitchers?.[gameId];
    const offPIT   = pitLookups.offense?.[gameId];
    const bsPIT    = pitLookups.boxscore?.[gameId];

    // Pitcher PIT helpers (corrected seasonal stats up to game date)
    const hPit = pitPIT?.home ?? null;
    const aPit = pitPIT?.away ?? null;

    // Team offense PIT helpers (corrected team stats up to game date)
    const hOff = offPIT?.home ?? null;
    const aOff = offPIT?.away ?? null;

    // Boxscore helpers (real game stats for finished games)
    const hBs  = bsPIT?.home ?? (g as any).boxscore_stats?.home ?? null;
    const aBs  = bsPIT?.away ?? (g as any).boxscore_stats?.away ?? null;

    // actual_ks: prefer boxscore (real game K), fallback to advanced_pitching field
    const canUseActualKs = isFinalGameStatus(g.game_result?.gameStatus);
    const hActualKs = hBs?.strikeOuts ?? (canUseActualKs ? (g.advanced_pitching?.home?.actualStrikeouts ?? "") : "");
    const aActualKs = aBs?.strikeOuts ?? (canUseActualKs ? (g.advanced_pitching?.away?.actualStrikeouts ?? "") : "");

    // Splits helpers
    const hSplitRhp = g.offensive_splits?.home?.vsRhp;
    const hSplitLhp = g.offensive_splits?.home?.vsLhp;
    const aSplitRhp = g.offensive_splits?.away?.vsRhp;
    const aSplitLhp = g.offensive_splits?.away?.vsLhp;

    // Fatigue helpers
    const fPitchers = g.fatigue_metrics?.pitchers;
    const fBullpen = g.fatigue_metrics?.bullpen;

      const hL3Bf = calcLast3Stats(g.advanced_pitching?.home?.last3Bf1, g.advanced_pitching?.home?.last3Bf2, g.advanced_pitching?.home?.last3Bf3);
      const hL3Ip = calcLast3Stats(g.advanced_pitching?.home?.last3Ip1, g.advanced_pitching?.home?.last3Ip2, g.advanced_pitching?.home?.last3Ip3);
      const hL3K = calcLast3Stats(g.advanced_pitching?.home?.last3Ks1, g.advanced_pitching?.home?.last3Ks2, g.advanced_pitching?.home?.last3Ks3);
      const aL3Bf = calcLast3Stats(g.advanced_pitching?.away?.last3Bf1, g.advanced_pitching?.away?.last3Bf2, g.advanced_pitching?.away?.last3Bf3);
      const aL3Ip = calcLast3Stats(g.advanced_pitching?.away?.last3Ip1, g.advanced_pitching?.away?.last3Ip2, g.advanced_pitching?.away?.last3Ip3);
      const aL3K = calcLast3Stats(g.advanced_pitching?.away?.last3Ks1, g.advanced_pitching?.away?.last3Ks2, g.advanced_pitching?.away?.last3Ks3);

    const homePitcherMetrics = getPitcherDerivedMetrics(g, 'home');
    const awayPitcherMetrics = getPitcherDerivedMetrics(g, 'away');

    const getLineupMetrics = (side: 'home' | 'away') => {
      let contactScore = (g as any).advanced_offense?.[side]?.lineup_contact_stress_score;
      let pitchRisk = (g as any).advanced_offense?.[side]?.lineup_pitch_count_risk_score;
      let hardhit = (g as any).advanced_offense?.[side]?.lineup_high_hardhit_batters_count;
      
      if (contactScore === undefined || contactScore === "") {
        const batters = (g as any).lineups?.[side];
        if (batters && Array.isArray(batters) && batters.length > 0) {
          let lineupContactStress = 0;
          let lineupPitchRisk = 0;
          let highHardhitCount = 0;
          for (const batter of batters) {
            const contactFactor = batter.contact_pct_vs_rhp || 0.8; 
            const kFactor = batter.kPct || batter.strikeout_pct || 0.2;
            const batterStress = (contactFactor * 100) - (kFactor * 100);
            lineupContactStress += Math.max(0, batterStress);
            if ((batter.hardHitPct || 0) > 0.40) highHardhitCount++;
            const bbPct = batter.walk_pct || 0.08;
            lineupPitchRisk += (bbPct * 100);
          }
          contactScore = lineupContactStress / batters.length;
          pitchRisk = lineupPitchRisk / batters.length;
          hardhit = highHardhitCount;
        }
      }
      return { contactScore: contactScore ?? "", pitchRisk: pitchRisk ?? "", hardhit: hardhit ?? "" };
    };

    const homeLineupMetrics = getLineupMetrics('home');
    const awayLineupMetrics = getLineupMetrics('away');

    return [
      // ... (Keep metadata and pitchers logic exactly same)
      escapeStr(g.id),
      escapeStr(g.metadata.date),
      escapeStr(g.metadata.time),
      escapeStr(g.metadata.homeTeam),
      escapeStr(g.metadata.awayTeam),
      escapeStr(g.metadata.venue),
      // Pitchers standard — SOLO point-in-time verificado (backfill PIT). Sin cobertura
      // PIT, la celda queda vacía en vez de usar el valor crudo (ver auditoría del
      // pipeline, bug de stats de temporada congeladas/con fuga de fechas futuras).
      // home/away_pitcher_stats_source documenta por qué: "pit" = confiable, vacío = sin cobertura PIT todavía.
      escapeStr(g.pitchers.home.name),
      ...pitcherPitStatsBlockValues(hPit),
      escapeStr(g.pitchers.away.name),
      ...pitcherPitStatsBlockValues(aPit),
      // Bullpen standard
      g.bullpen.home.era ?? "",
      escapeStr(g.bullpen.home.usageLast3Days),
      g.bullpen.home.ipLast7Days ?? fBullpen?.home?.ipLast7Days ?? "",
      g.bullpen.away.era ?? "",
      escapeStr(g.bullpen.away.usageLast3Days),
      g.bullpen.away.ipLast7Days ?? fBullpen?.away?.ipLast7Days ?? "",
      // Offense standard
      g.offense.away.runsPerGame ?? "",
      g.offense.away.ops ?? "",
      g.offense.away.obp ?? "",
      g.offense.away.slg ?? "",
      getLineupAverageKPct(g.lineups?.away),
      // Weather
      g.weather?.temp ?? "",
      g.weather?.humidity ?? "",
      g.weather?.windSpeed ?? "",
      g.weather?.windDirection ?? "",
      g.weather?.pressure ?? "",
      g.weather?.rainProbability ?? "",
      escapeStr(g.weather?.skyStatus),
      g.weather?.apparentTemp ?? "",
      // Home splits vs Rhp
      hSplitRhp?.avg ?? "",
      hSplitRhp?.ops ?? "",
      hSplitRhp?.obp ?? "",
      hSplitRhp?.slg ?? "",
      hSplitRhp?.runsPerGame ?? "",
      hSplitRhp?.hr ?? "",
      // Home splits vs Lhp
      hSplitLhp?.avg ?? "",
      hSplitLhp?.ops ?? "",
      hSplitLhp?.obp ?? "",
      hSplitLhp?.slg ?? "",
      hSplitLhp?.runsPerGame ?? "",
      hSplitLhp?.hr ?? "",
      // Away splits vs Rhp
      aSplitRhp?.avg ?? "",
      aSplitRhp?.ops ?? "",
      aSplitRhp?.obp ?? "",
      aSplitRhp?.slg ?? "",
      aSplitRhp?.runsPerGame ?? "",
      aSplitRhp?.hr ?? "",
      // Away splits vs Lhp
      aSplitLhp?.avg ?? "",
      aSplitLhp?.ops ?? "",
      aSplitLhp?.obp ?? "",
      aSplitLhp?.slg ?? "",
      aSplitLhp?.runsPerGame ?? "",
      aSplitLhp?.hr ?? "",
      // Fatigue
      fPitchers?.home?.daysSinceLastStart ?? "",
      fPitchers?.home?.pitchesLastStart ?? "",
      fPitchers?.home?.pitchesLast3Starts ?? "",
      fPitchers?.away?.daysSinceLastStart ?? "",
      fPitchers?.away?.pitchesLastStart ?? "",
      fPitchers?.away?.pitchesLast3Starts ?? "",
      fBullpen?.home?.ipLast3Days ?? "",
      fBullpen?.home?.ipLast7Days ?? "",
      fBullpen?.home?.relieversUsedYesterday ?? "",
      fBullpen?.home?.relieversUsedLast2Days ?? "",
      fBullpen?.home?.availableCount ?? "",
      fBullpen?.away?.ipLast3Days ?? "",
      fBullpen?.away?.ipLast7Days ?? "",
      fBullpen?.away?.relieversUsedYesterday ?? "",
      fBullpen?.away?.relieversUsedLast2Days ?? "",
      fBullpen?.away?.availableCount ?? "",
      // Advanced Pitching
      g.advanced_pitching?.home?.xEra ?? "",
      g.advanced_pitching?.home?.fip ?? "",
      g.advanced_pitching?.home?.xFip ?? "",
      g.advanced_pitching?.home?.siera ?? "",
      g.advanced_pitching?.home?.hardHitPct ?? "",
      g.advanced_pitching?.home?.barrelPct ?? "",
      g.advanced_pitching?.home?.groundBallPct ?? "",
      g.advanced_pitching?.home?.flyBallPct ?? "",
      g.advanced_pitching?.home?.strikeoutRate ?? "",
      g.advanced_pitching?.home?.walkRate ?? "",
      g.advanced_pitching?.home?.swingingStrikePct ?? "",
      g.advanced_pitching?.home?.cswPct ?? "",
      hActualKs, // home_pitcher_actual_ks — from boxscore (real K) or advanced_pitching fallback
      g.advanced_pitching?.home?.last5KsAvg ?? "",
      g.advanced_pitching?.home?.last5KsStd ?? "",
      g.advanced_pitching?.home?.last5IpAvg ?? "",
      g.advanced_pitching?.home?.last5BfAvg ?? "",
      g.advanced_pitching?.home?.last5PitchCountAvg ?? "",
      g.advanced_pitching?.home?.last3Ks1 ?? "",
      g.advanced_pitching?.home?.last3Ks2 ?? "",
      g.advanced_pitching?.home?.last3Ks3 ?? "",
      g.advanced_pitching?.home?.last3Ip1 ?? "",
      g.advanced_pitching?.home?.last3Ip2 ?? "",
      g.advanced_pitching?.home?.last3Ip3 ?? "",
      g.advanced_pitching?.home?.last3Bf1 ?? "",
      g.advanced_pitching?.home?.last3Bf2 ?? "",
      g.advanced_pitching?.home?.last3Bf3 ?? "",
      g.advanced_pitching?.home?.careerKPctVsTeam ?? g.advanced_pitching?.homeVsOpp?.careerKPctVsTeam ?? g.advanced_pitching?.homeVsOpp?.strikeoutRate ?? "",
      g.advanced_pitching?.home?.last3VsTeamKsAvg ?? "",
      g.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.home?.projectedPitchCount ?? "",
      g.advanced_pitching?.home?.projectedInnings ?? "",
      g.advanced_pitching?.home?.projectedStrikeoutsBase ?? "",
      g.advanced_pitching?.home?.battersFacedPerStart ?? "",
      g.advanced_pitching?.home?.fastballPct ?? "",
      g.advanced_pitching?.home?.sliderPct ?? "",
      g.advanced_pitching?.home?.curvePct ?? "",
      g.advanced_pitching?.home?.changeupPct ?? "",
      g.advanced_pitching?.home?.splitterPct ?? "",
      escapeStr(g.advanced_pitching?.home?.catcherName),
      g.advanced_pitching?.home?.catcherFramingRuns ?? "",
      hL3Bf.avg, hL3Ip.avg, hL3K.avg, hL3Bf.min, hL3Ip.min, hL3Bf.under15, hL3Bf.under18,
      g.advanced_pitching?.away?.xEra ?? "",
      g.advanced_pitching?.away?.fip ?? "",
      g.advanced_pitching?.away?.xFip ?? "",
      g.advanced_pitching?.away?.siera ?? "",
      g.advanced_pitching?.away?.hardHitPct ?? "",
      g.advanced_pitching?.away?.barrelPct ?? "",
      g.advanced_pitching?.away?.groundBallPct ?? "",
      g.advanced_pitching?.away?.flyBallPct ?? "",
      g.advanced_pitching?.away?.strikeoutRate ?? "",
      g.advanced_pitching?.away?.walkRate ?? "",
      g.advanced_pitching?.away?.swingingStrikePct ?? "",
      g.advanced_pitching?.away?.cswPct ?? "",
      aActualKs, // away_pitcher_actual_ks — from boxscore (real K) or advanced_pitching fallback
      g.advanced_pitching?.away?.last5KsAvg ?? "",
      g.advanced_pitching?.away?.last5KsStd ?? "",
      g.advanced_pitching?.away?.last5IpAvg ?? "",
      g.advanced_pitching?.away?.last5BfAvg ?? "",
      g.advanced_pitching?.away?.last5PitchCountAvg ?? "",
      g.advanced_pitching?.away?.last3Ks1 ?? "",
      g.advanced_pitching?.away?.last3Ks2 ?? "",
      g.advanced_pitching?.away?.last3Ks3 ?? "",
      g.advanced_pitching?.away?.last3Ip1 ?? "",
      g.advanced_pitching?.away?.last3Ip2 ?? "",
      g.advanced_pitching?.away?.last3Ip3 ?? "",
      g.advanced_pitching?.away?.last3Bf1 ?? "",
      g.advanced_pitching?.away?.last3Bf2 ?? "",
      g.advanced_pitching?.away?.last3Bf3 ?? "",
      g.advanced_pitching?.away?.careerKPctVsTeam ?? g.advanced_pitching?.awayVsOpp?.careerKPctVsTeam ?? g.advanced_pitching?.awayVsOpp?.strikeoutRate ?? "",
      g.advanced_pitching?.away?.last3VsTeamKsAvg ?? "",
      g.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.away?.projectedPitchCount ?? "",
      g.advanced_pitching?.away?.projectedInnings ?? "",
      g.advanced_pitching?.away?.projectedStrikeoutsBase ?? "",
      g.advanced_pitching?.away?.battersFacedPerStart ?? "",
      g.advanced_pitching?.away?.fastballPct ?? "",
      g.advanced_pitching?.away?.sliderPct ?? "",
      g.advanced_pitching?.away?.curvePct ?? "",
      g.advanced_pitching?.away?.changeupPct ?? "",
      g.advanced_pitching?.away?.splitterPct ?? "",
      escapeStr(g.advanced_pitching?.away?.catcherName),
      g.advanced_pitching?.away?.catcherFramingRuns ?? "",
      aL3Bf.avg, aL3Ip.avg, aL3K.avg, aL3Bf.min, aL3Ip.min, aL3Bf.under15, aL3Bf.under18,
      // Advanced Offense — PIT-corrected where available, fallback to document
      g.advanced_offense?.home?.wOba ?? "",
      g.advanced_offense?.home?.xwOba ?? "",
      hOff?.iso  ?? g.advanced_offense?.home?.iso ?? "",
      g.advanced_offense?.home?.babip ?? "",
      g.advanced_offense?.home?.hardHitPct ?? "",
      g.advanced_offense?.home?.barrelPct ?? "",
      g.advanced_offense?.home?.contactPct ?? "",
      hOff?.kPct ?? g.advanced_offense?.home?.kPctVsPitchHand ?? "",
      g.advanced_offense?.home?.projectedLineupKPct ?? "",
      g.advanced_offense?.home?.projectedLineupContactPctVsHand ?? "",
      g.advanced_offense?.home?.projectedLineupWhiffPctVsHand ?? "",
      g.advanced_offense?.home?.whiffPctVsFastball ?? "",
      g.advanced_offense?.home?.whiffPctVsSlider ?? "",
      g.advanced_offense?.home?.whiffPctVsCurve ?? "",
      g.advanced_offense?.home?.whiffPctVsChangeup ?? "",
      g.advanced_offense?.home?.whiffPctVsSplitter ?? "",
      g.advanced_offense?.away?.wOba ?? "",
      g.advanced_offense?.away?.xwOba ?? "",
      aOff?.iso  ?? g.advanced_offense?.away?.iso ?? "",
      g.advanced_offense?.away?.babip ?? "",
      g.advanced_offense?.away?.hardHitPct ?? "",
      g.advanced_offense?.away?.barrelPct ?? "",
      g.advanced_offense?.away?.contactPct ?? "",
      aOff?.kPct ?? g.advanced_offense?.away?.kPctVsPitchHand ?? "",
      g.advanced_offense?.away?.projectedLineupKPct ?? "",
      g.advanced_offense?.away?.projectedLineupContactPctVsHand ?? "",
      g.advanced_offense?.away?.projectedLineupWhiffPctVsHand ?? "",
      g.advanced_offense?.away?.whiffPctVsFastball ?? "",
      g.advanced_offense?.away?.whiffPctVsSlider ?? "",
      g.advanced_offense?.away?.whiffPctVsCurve ?? "",
      g.advanced_offense?.away?.whiffPctVsChangeup ?? "",
      g.advanced_offense?.away?.whiffPctVsSplitter ?? "",
      // Model Features
      g.model_features?.diffEra ?? "",
      g.model_features?.diffXera ?? "",
      g.model_features?.diffFip ?? "",
      g.model_features?.diffOps ?? "",
      g.model_features?.diffXwoba ?? "",
      g.model_features?.diffBullpenEra ?? "",
      g.model_features?.diffRunsPerGame ?? "",
      g.model_features?.diffRecordLast10 ?? "",
      g.model_features?.diffRecordHomeAway ?? "",
      g.model_features?.diffStarterRest ?? "",
      g.model_features?.diffBullpenFatigue ?? "",
      // Metadata de confiabilidad point-in-time — ver comentario del header savant_metrics_asof_date
      savantCache.getSnapshotDate() ?? "",
      // Results
      g.game_result?.homeScore ?? "",
      g.game_result?.awayScore ?? "",
      escapeStr(g.game_result?.winner),
      escapeStr(g.game_result?.gameStatus ?? "Scheduled"),

      // VORTEX V10.3 METRICS
      (g as any).lineups?.lineup_confirmed ? 1 : 0,
      escapeStr((g as any).lineups?.lineup_source),
      escapeStr((g as any).lineups?.lineup_updated_at),
      homePitcherMetrics.primary_pitch,
      homePitcherMetrics.primary_usage,
      homePitcherMetrics.secondary_pitch,
      homePitcherMetrics.secondary_usage,
      homePitcherMetrics.pitches_per_bf,
      homePitcherMetrics.pitches_per_bf_last5,
      homePitcherMetrics.pitches_per_ip_last5,
      awayPitcherMetrics.primary_pitch,
      awayPitcherMetrics.primary_usage,
      awayPitcherMetrics.secondary_pitch,
      awayPitcherMetrics.secondary_usage,
      awayPitcherMetrics.pitches_per_bf,
      awayPitcherMetrics.pitches_per_bf_last5,
      awayPitcherMetrics.pitches_per_ip_last5,
      (g as any).pitchers?.home_starter?.pitcher_avg_pitches_last3 ?? (g as any).pitchers?.home?.pitcher_avg_pitches_last3 ?? "",
      escapeStr(homePitcherMetrics.rest_status),
      (g as any).pitchers?.away_starter?.pitcher_avg_pitches_last3 ?? (g as any).pitchers?.away?.pitcher_avg_pitches_last3 ?? "",
      escapeStr(awayPitcherMetrics.rest_status),
      escapeStr((g as any).pitchers?.home_starter?.pitchHand ?? (g as any).pitchers?.home?.pitchHand),
      escapeStr((g as any).pitchers?.away_starter?.pitchHand ?? (g as any).pitchers?.away?.pitchHand),
      g.bullpen?.home?.ipLast3Days ?? fBullpen?.home?.ipLast3Days ?? "",
      g.bullpen?.home?.ipLast7Days ?? fBullpen?.home?.ipLast7Days ?? "",
      g.bullpen?.away?.ipLast3Days ?? fBullpen?.away?.ipLast3Days ?? "",
      g.bullpen?.away?.ipLast7Days ?? fBullpen?.away?.ipLast7Days ?? "",
      (g as any).bullpen?.home?.relieversUsedYesterday ?? fBullpen?.home?.relieversUsedYesterday ?? "",
      homeLineupMetrics.contactScore,
      homeLineupMetrics.pitchRisk,
      homeLineupMetrics.hardhit,
      awayLineupMetrics.contactScore,
      awayLineupMetrics.pitchRisk,
      awayLineupMetrics.hardhit,
      (g as any).pitchers?.home_starter?.pitcher_recent_velocity ?? (g as any).pitchers?.home?.pitcher_recent_velocity ?? "",
      (g as any).pitchers?.away_starter?.pitcher_recent_velocity ?? (g as any).pitchers?.away?.pitcher_recent_velocity ?? "",
      // New Advanced Metrics & Park Factors
      g.advanced_pitching?.home?.pitcher_spin_rate ?? "",
      g.advanced_pitching?.away?.pitcher_spin_rate ?? "",
      g.advanced_pitching?.home?.pitcher_stuff_plus ?? "",
      g.advanced_pitching?.away?.pitcher_stuff_plus ?? "",
      g.advanced_pitching?.home?.pitcher_o_swing_pct ?? "",
      g.advanced_pitching?.away?.pitcher_o_swing_pct ?? "",
      g.advanced_pitching?.home?.pitcher_k_pct_vs_lhb ?? "",
      g.advanced_pitching?.away?.pitcher_k_pct_vs_lhb ?? "",
      g.advanced_pitching?.home?.pitcher_k_pct_vs_rhb ?? "",
      g.advanced_pitching?.away?.pitcher_k_pct_vs_rhb ?? "",
      g.park_factors?.index_so ?? 100,
      g.park_factors?.index_runs ?? 100,
      g.park_factors?.index_hr ?? 100,
      // ── Boxscore: real starter game stats (null for non-final games) ──
      hBs?.inningsPitched   ?? "",
      hBs?.battersFaced     ?? "",
      hBs?.hitsAllowed      ?? "",
      hBs?.earnedRuns       ?? "",
      hBs?.strikeOuts       ?? "",  // home_starter_game_k (= home_pitcher_actual_ks source)
      hBs?.baseOnBalls      ?? "",
      hBs?.numberOfPitches  ?? "",
      hBs?.homeRunsAllowed  ?? "",
      hBs?.gameScore        ?? "",
      aBs?.inningsPitched   ?? "",
      aBs?.battersFaced     ?? "",
      aBs?.hitsAllowed      ?? "",
      aBs?.earnedRuns       ?? "",
      aBs?.strikeOuts       ?? "",  // away_starter_game_k (= away_pitcher_actual_ks source)
      aBs?.baseOnBalls      ?? "",
      aBs?.numberOfPitches  ?? "",
      aBs?.homeRunsAllowed  ?? "",
      aBs?.gameScore        ?? ""
    ];
  });

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generateSingleGameCSV(game: MLBGame): string {
  return generateBattersCSV([game]);
}

export function generateDailyPlayerResultsCSV(games: MLBGame[]): string {
  const headers = [
    "game_id",
    "date",
    "game_time",
    "away_team",
    "home_team",
    "team",
    "opponent",
    "home_away",
    "pitcher",
    "position",
    "bb",
    "h",
    "r",
    "er",
    "ip",
    "actual_ks",
    "actual_bf",
    "pitches",
    "game_status",
    "away_score",
    "home_score"
  ];

  const rows: any[][] = [];

  const parsePitchingOuts = (ip: any): number | null => {
    if (ip === undefined || ip === null || ip === "") return null;
    const [wholeRaw, outsRaw = "0"] = String(ip).split(".");
    const whole = Number.parseInt(wholeRaw, 10);
    const outs = Number.parseInt(outsRaw, 10);
    if (!Number.isFinite(whole) || !Number.isFinite(outs) || outs < 0 || outs > 2) return null;
    return whole * 3 + outs;
  };

  const getActualBf = (player: any): number | string => {
    const exact = player.bf ?? player.battersFaced;
    if (exact !== undefined && exact !== null && exact !== "") return exact;
    const outs = parsePitchingOuts(player.ip);
    if (outs === null) return "";
    return outs + (Number(player.h) || 0) + (Number(player.bb) || 0);
  };

  const hasPitchingActivity = (player: any): boolean => {
    const actualBf = Number(getActualBf(player)) || 0;
    const outs = parsePitchingOuts(player.ip) || 0;
    return [
      actualBf,
      outs,
      Number(player.pitches) || 0,
      Number(player.h) || 0,
      Number(player.bb) || 0,
      Number(player.k) || 0,
      Number(player.r) || 0,
      Number(player.er) || 0,
    ].some((value) => value > 0);
  };

  const pushPitcherRows = (game: MLBGame, players: any[] | undefined, team: string, homeAway: "home" | "away") => {
    const opponent = homeAway === "home" ? game.metadata.awayTeam : game.metadata.homeTeam;
    for (const player of players || []) {
      if (!hasPitchingActivity(player)) continue;
      rows.push([
        game.id,
        game.metadata.date,
        game.metadata.time,
        game.metadata.awayTeam,
        game.metadata.homeTeam,
        team,
        opponent,
        homeAway,
        player.name,
        player.position,
        player.bb ?? "",
        player.h ?? "",
        player.r ?? "",
        player.er ?? "",
        player.ip ?? "",
        player.k ?? "",
        getActualBf(player),
        player.pitches ?? "",
        game.game_result?.gameStatus ?? "",
        game.game_result?.awayScore ?? "",
        game.game_result?.homeScore ?? ""
      ]);
    }
  };

  for (const game of games) {
    pushPitcherRows(game, game.liveBoxscore?.away?.pitchers, game.metadata.awayTeam, "away");
    pushPitcherRows(game, game.liveBoxscore?.home?.pitchers, game.metadata.homeTeam, "home");
  }

  return [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(","))
  ].join("\n");
}

export function generateBattersCSV(games: any[], pitLookups: PITLookups = { pitchers: {} }): string {
  if (!games || games.length === 0) return "";
  
  // Fuerza el enriquecimiento para asegurar que existan las métricas en caché/DB viejo
  games.forEach(g => enrichWithVortexMetrics(g));

  const headers = [
    // --- Batter Info & Stats (36 columns) ---
    "game_id",
    "date",
    "player_name",
    "team",
    "batting_order",
    "bat_side",
    "position",
    "avg",
    "obp",
    "slg",
    "ops",
    "woba",
    "iso",
    "pa",
    "hits",
    "doubles",
    "triples",
    "home_runs",
    "strikeout_pct",
    "walk_pct",
    "last7_avg",
    "last7_ops",
    "last7_slg",
    "last7_total_bases",
    "last7_hits",
    "last7_xbh",
    "ops_vs_rhp",
    "ops_vs_lhp",
    "slg_vs_rhp",
    "slg_vs_lhp",
    "k_pct_vs_rhp",
    "k_pct_vs_lhp",
    "contact_pct_vs_rhp",
    "contact_pct_vs_lhp",
    "whiff_pct",
    "chase_pct",
    "opposing_pitcher",
    "opposing_pitcher_hand",
    "pitcher_allowed_avg_vs_lhb",
    "pitcher_allowed_avg_vs_rhb",
    "pitcher_allowed_slg_vs_lhb",
    "pitcher_allowed_slg_vs_rhb",

    // --- Game Context & Team Stats (72 columns) ---
    "hora", "equipo_home", "equipo_visitante", "estadio",
    // Pitchers standard
    "home_pitcher", "home_pitcher_era", "home_pitcher_whip", "home_pitcher_kPct", "home_pitcher_bbPct", "home_pitcher_wins", "home_pitcher_losses", "home_pitcher_ip", "home_pitcher_strikeouts", "home_pitcher_gs", "home_pitcher_ip_avg_start", "home_pitcher_stats_source",
    "home_pitcher_strikeout_prop", "home_pitcher_strikeout_prop_over_odds", "home_pitcher_strikeout_prop_under_odds", "home_pitcher_strikeout_prop_source", "home_pitcher_strikeout_prop_capture_status",
    "away_pitcher", "away_pitcher_era", "away_pitcher_whip", "away_pitcher_kPct", "away_pitcher_bbPct", "away_pitcher_wins", "away_pitcher_losses", "away_pitcher_ip", "away_pitcher_strikeouts", "away_pitcher_gs", "away_pitcher_ip_avg_start", "away_pitcher_stats_source",
    "away_pitcher_strikeout_prop", "away_pitcher_strikeout_prop_over_odds", "away_pitcher_strikeout_prop_under_odds", "away_pitcher_strikeout_prop_source", "away_pitcher_strikeout_prop_capture_status",
    // Bullpen standard
    "bullpen_era_home", "bullpen_usage_home", "bullpen_ip_7d_home",
    "bullpen_era_away", "bullpen_usage_away", "bullpen_ip_7d_away",
    // Offense standard
    "ofensa_run_g_home", "ofensa_ops_home", "ofensa_obp_home", "ofensa_slg_home", "home_offense_kPct",
    "ofensa_run_g_away", "ofensa_ops_away", "ofensa_obp_away", "ofensa_slg_away", "away_offense_kPct",
    // Weather
    "weather_temp", "weather_humidity", "weather_wind_speed", "weather_wind_dir", "weather_pressure", "weather_rain_prob", "weather_sky", "weather_apparent_temp",
    // Home splits
    "home_splits_vs_rhp_avg", "home_splits_vs_rhp_ops", "home_splits_vs_rhp_obp", "home_splits_vs_rhp_slg", "home_splits_vs_rhp_rpg", "home_splits_vs_rhp_hr",
    "home_splits_vs_lhp_avg", "home_splits_vs_lhp_ops", "home_splits_vs_lhp_obp", "home_splits_vs_lhp_slg", "home_splits_vs_lhp_rpg", "home_splits_vs_lhp_hr",
    // Away splits
    "away_splits_vs_rhp_avg", "away_splits_vs_rhp_ops", "away_splits_vs_rhp_obp", "away_splits_vs_rhp_slg", "away_splits_vs_rhp_rpg", "away_splits_vs_rhp_hr",
    "away_splits_vs_lhp_avg", "away_splits_vs_lhp_ops", "away_splits_vs_lhp_obp", "away_splits_vs_lhp_slg", "away_splits_vs_lhp_rpg", "away_splits_vs_lhp_hr",
    // Fatigue
    "home_pitcher_rest", "home_pitcher_pitches_last", "home_pitcher_pitches_last_3",
    "away_pitcher_rest", "away_pitcher_pitches_last", "away_pitcher_pitches_last_3",
    "home_bullpen_ip_3d", "home_bullpen_ip_7d_recent", "home_bullpen_relievers_yesterday", "home_bullpen_relievers_2d", "home_bullpen_available",
    "away_bullpen_ip_3d", "away_bullpen_ip_7d_recent", "away_bullpen_relievers_yesterday", "away_bullpen_relievers_2d", "away_bullpen_available",
    // Advanced Pitching
    "home_pitcher_xera", "home_pitcher_fip", "home_pitcher_xfip", "home_pitcher_siera", "home_pitcher_hardhit_pct", "home_pitcher_barrel_pct", "home_pitcher_gb_pct", "home_pitcher_fb_pct", "home_pitcher_so_rate", "home_pitcher_bb_rate", "home_pitcher_swstr_pct", "home_pitcher_csw_pct", "home_pitcher_actual_ks", "home_pitcher_last5_ks_avg", "home_pitcher_last5_ks_std", "home_pitcher_last5_ip_avg", "home_pitcher_last5_bf_avg", "home_pitcher_last5_pitch_count_avg", "home_pitcher_last3_ks_1", "home_pitcher_last3_ks_2", "home_pitcher_last3_ks_3", "home_pitcher_last3_ip_1", "home_pitcher_last3_ip_2", "home_pitcher_last3_ip_3", "home_pitcher_last3_bf_1", "home_pitcher_last3_bf_2", "home_pitcher_last3_bf_3", "home_pitcher_career_k_pct_vs_team", "home_pitcher_last3_vs_team_ks_avg", "home_pitcher_last3_vs_team_bf_avg", "home_pitcher_bvp_pa_vs_team", "home_pitcher_projected_pitches", "home_pitcher_projected_innings", "home_pitcher_projected_strikeouts", "home_pitcher_bf_per_start", "home_pitcher_fastball_pct", "home_pitcher_slider_pct", "home_pitcher_curve_pct", "home_pitcher_changeup_pct", "home_pitcher_splitter_pct", "home_catcher_name", "home_catcher_framing_runs", "home_pitcher_last3_bf_avg", "home_pitcher_last3_ip_avg", "home_pitcher_last3_ks_avg", "home_pitcher_last3_min_bf", "home_pitcher_last3_min_ip", "home_pitcher_last3_bf_under_15_count", "home_pitcher_last3_bf_under_18_count",
    "away_pitcher_xera", "away_pitcher_fip", "away_pitcher_xfip", "away_pitcher_siera", "away_pitcher_hardhit_pct", "away_pitcher_barrel_pct", "away_pitcher_gb_pct", "away_pitcher_fb_pct", "away_pitcher_so_rate", "away_pitcher_bb_rate", "away_pitcher_swstr_pct", "away_pitcher_csw_pct", "away_pitcher_actual_ks", "away_pitcher_last5_ks_avg", "away_pitcher_last5_ks_std", "away_pitcher_last5_ip_avg", "away_pitcher_last5_bf_avg", "away_pitcher_last5_pitch_count_avg", "away_pitcher_last3_ks_1", "away_pitcher_last3_ks_2", "away_pitcher_last3_ks_3", "away_pitcher_last3_ip_1", "away_pitcher_last3_ip_2", "away_pitcher_last3_ip_3", "away_pitcher_last3_bf_1", "away_pitcher_last3_bf_2", "away_pitcher_last3_bf_3", "away_pitcher_career_k_pct_vs_team", "away_pitcher_last3_vs_team_ks_avg", "away_pitcher_last3_vs_team_bf_avg", "away_pitcher_bvp_pa_vs_team", "away_pitcher_projected_pitches", "away_pitcher_projected_innings", "away_pitcher_projected_strikeouts", "away_pitcher_bf_per_start", "away_pitcher_fastball_pct", "away_pitcher_slider_pct", "away_pitcher_curve_pct", "away_pitcher_changeup_pct", "away_pitcher_splitter_pct", "away_catcher_name", "away_catcher_framing_runs", "away_pitcher_last3_bf_avg", "away_pitcher_last3_ip_avg", "away_pitcher_last3_ks_avg", "away_pitcher_last3_min_bf", "away_pitcher_last3_min_ip", "away_pitcher_last3_bf_under_15_count", "away_pitcher_last3_bf_under_18_count",
    // Advanced Offense
    "home_offense_woba", "home_offense_xwoba", "home_offense_iso", "home_offense_babip", "home_offense_hardhit_pct", "home_offense_barrel_pct", "home_offense_contact_pct", "home_offense_k_pct_vs_pitch_hand", "home_projected_lineup_k_pct_vs_hand", "home_projected_lineup_contact_pct_vs_hand", "home_projected_lineup_whiff_pct_vs_hand", "home_offense_whiff_pct_vs_fastball", "home_offense_whiff_pct_vs_slider", "home_offense_whiff_pct_vs_curve", "home_offense_whiff_pct_vs_changeup", "home_offense_whiff_pct_vs_splitter",
    "away_offense_woba", "away_offense_xwoba", "away_offense_iso", "away_offense_babip", "away_offense_hardhit_pct", "away_offense_barrel_pct", "away_offense_contact_pct", "away_offense_k_pct_vs_pitch_hand", "away_projected_lineup_k_pct_vs_hand", "away_projected_lineup_contact_pct_vs_hand", "away_projected_lineup_whiff_pct_vs_hand", "away_offense_whiff_pct_vs_fastball", "away_offense_whiff_pct_vs_slider", "away_offense_whiff_pct_vs_curve", "away_offense_whiff_pct_vs_changeup", "away_offense_whiff_pct_vs_splitter",
    // Model Features
    "diff_era", "diff_xera", "diff_fip", "diff_ops", "diff_xwoba", "diff_bullpen_era", "diff_runs_per_game", "diff_record_last10", "diff_record_home_away", "diff_starter_rest", "diff_bullpen_fatigue", "line_source",
    // Metadata de confiabilidad point-in-time (ver auditoría del pipeline, sección 3):
    // fecha en que se descargó el snapshot de Baseball Savant usado para las columnas
    // xera/xwoba/hardhit_pct/barrel_pct/swstr_pct/csw_pct/arsenal%/framing de esta fila.
    // Ese snapshot es "temporada completa hasta hoy", no recortado a la fecha del juego:
    // si "date" de la fila es anterior a savant_metrics_asof_date, esas columnas pueden
    // incluir información posterior al juego y no deben tratarse como point-in-time.
    "savant_metrics_asof_date",
    // Game Results / ML Target Labels
    "resultado_carreras_home", "resultado_carreras_visitante", "resultado_ganador", "resultado_estado",
    // VORTEX V10.3 METRICS (47 Variables)
    "lineup_confirmed", "lineup_source", "lineup_updated_at",
    "home_pitcher_primary_pitch", "home_pitcher_primary_pitch_usage_pct", "home_pitcher_secondary_pitch", "home_pitcher_secondary_pitch_usage_pct", "home_pitcher_pitches_per_bf", "home_pitcher_pitches_per_bf_last5", "home_pitcher_pitches_per_ip_last5",
    "away_pitcher_primary_pitch", "away_pitcher_primary_pitch_usage_pct", "away_pitcher_secondary_pitch", "away_pitcher_secondary_pitch_usage_pct", "away_pitcher_pitches_per_bf", "away_pitcher_pitches_per_bf_last5", "away_pitcher_pitches_per_ip_last5",
    "home_pitcher_avg_pitches_last3", "home_pitcher_rest_status", "away_pitcher_avg_pitches_last3", "away_pitcher_rest_status", "home_pitcher_pitchHand", "away_pitcher_pitchHand",
    "bullpen_home_ipLast3Days", "bullpen_home_ipLast7Days", "bullpen_away_ipLast3Days", "bullpen_away_ipLast7Days", "bullpen_home_relieversUsedYesterday",
    "home_lineup_contact_stress_score", "home_lineup_pitch_count_risk_score", "home_lineup_high_hardhit_batters_count", "away_lineup_contact_stress_score", "away_lineup_pitch_count_risk_score", "away_lineup_high_hardhit_batters_count",
    "home_pitcher_recent_velocity", "away_pitcher_recent_velocity",
    // New Advanced Metrics & Park Factors
    "home_pitcher_spin_rate", "away_pitcher_spin_rate",
    "home_pitcher_stuff_plus", "away_pitcher_stuff_plus",
    "home_pitcher_o_swing_pct", "away_pitcher_o_swing_pct",
    "home_pitcher_k_pct_vs_lhb", "away_pitcher_k_pct_vs_lhb",
    "home_pitcher_k_pct_vs_rhb", "away_pitcher_k_pct_vs_rhb",
    "park_factor_k", "park_factor_runs", "park_factor_hr"
  ];

  const escapeStr = (val: any) => {
    if (val === undefined || val === null || val === "") return "";
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const rows: any[][] = [];

  for (const game of games) {
    const gameId = String(game.id);
    const hPit = pitLookups.pitchers?.[gameId]?.home;
    const aPit = pitLookups.pitchers?.[gameId]?.away;

    const hSplitRhp = game.offensive_splits?.home?.vsRhp;
    const hSplitLhp = game.offensive_splits?.home?.vsLhp;
    const aSplitRhp = game.offensive_splits?.away?.vsRhp;
    const aSplitLhp = game.offensive_splits?.away?.vsLhp;

    const fPitchers = game.fatigue_metrics?.pitchers;
    const fBullpen = game.fatigue_metrics?.bullpen;
    const canUseActualKs = isFinalGameStatus(game.game_result?.gameStatus);
    const canUseBettingLines = hasRealBettingLines(game);

    const hL3Bf = calcLast3Stats(game.advanced_pitching?.home?.last3Bf1, game.advanced_pitching?.home?.last3Bf2, game.advanced_pitching?.home?.last3Bf3);
    const hL3Ip = calcLast3Stats(game.advanced_pitching?.home?.last3Ip1, game.advanced_pitching?.home?.last3Ip2, game.advanced_pitching?.home?.last3Ip3);
    const hL3K = calcLast3Stats(game.advanced_pitching?.home?.last3Ks1, game.advanced_pitching?.home?.last3Ks2, game.advanced_pitching?.home?.last3Ks3);
    const aL3Bf = calcLast3Stats(game.advanced_pitching?.away?.last3Bf1, game.advanced_pitching?.away?.last3Bf2, game.advanced_pitching?.away?.last3Bf3);
    const aL3Ip = calcLast3Stats(game.advanced_pitching?.away?.last3Ip1, game.advanced_pitching?.away?.last3Ip2, game.advanced_pitching?.away?.last3Ip3);
    const aL3K = calcLast3Stats(game.advanced_pitching?.away?.last3Ks1, game.advanced_pitching?.away?.last3Ks2, game.advanced_pitching?.away?.last3Ks3);

    const gameContextRow = [
      escapeStr(game.metadata.time),
      escapeStr(game.metadata.homeTeam),
      escapeStr(game.metadata.awayTeam),
      escapeStr(game.metadata.venue),
      // Pitchers standard
      escapeStr(game.pitchers.home.name),
      ...pitcherPitStatsBlockValues(hPit),
      game.pitchers.home.strikeoutProp ?? "",
      game.pitchers.home.strikeoutPropOverOdds ?? "",
      game.pitchers.home.strikeoutPropUnderOdds ?? "",
      escapeStr(game.pitchers.home.strikeoutPropSource),
      escapeStr(game.pitchers.home.strikeoutPropCaptureStatus),
      escapeStr(game.pitchers.away.name),
      ...pitcherPitStatsBlockValues(aPit),
      game.pitchers.away.strikeoutProp ?? "",
      game.pitchers.away.strikeoutPropOverOdds ?? "",
      game.pitchers.away.strikeoutPropUnderOdds ?? "",
      escapeStr(game.pitchers.away.strikeoutPropSource),
      escapeStr(game.pitchers.away.strikeoutPropCaptureStatus),
      // Bullpen standard
      game.bullpen.home.era ?? "",
      escapeStr(game.bullpen.home.usageLast3Days),
      game.bullpen.home.ipLast7Days ?? fBullpen?.home?.ipLast7Days ?? "",
      game.bullpen.away.era ?? "",
      escapeStr(game.bullpen.away.usageLast3Days),
      game.bullpen.away.ipLast7Days ?? fBullpen?.away?.ipLast7Days ?? "",
      // Offense standard
      game.offense.home.runsPerGame ?? "",
      game.offense.home.ops ?? "",
      game.offense.home.obp ?? "",
      game.offense.home.slg ?? "",
      getLineupAverageKPct(game.lineups?.home),
      game.offense.away.runsPerGame ?? "",
      game.offense.away.ops ?? "",
      game.offense.away.obp ?? "",
      game.offense.away.slg ?? "",
      getLineupAverageKPct(game.lineups?.away),
      // Weather
      game.weather?.temp ?? "",
      game.weather?.humidity ?? "",
      game.weather?.windSpeed ?? "",
      game.weather?.windDirection ?? "",
      game.weather?.pressure ?? "",
      game.weather?.rainProbability ?? "",
      escapeStr(game.weather?.skyStatus),
      game.weather?.apparentTemp ?? "",
      // Home splits vs Rhp
      hSplitRhp?.avg ?? "",
      hSplitRhp?.ops ?? "",
      hSplitRhp?.obp ?? "",
      hSplitRhp?.slg ?? "",
      hSplitRhp?.runsPerGame ?? "",
      hSplitRhp?.hr ?? "",
      // Home splits vs Lhp
      hSplitLhp?.avg ?? "",
      hSplitLhp?.ops ?? "",
      hSplitLhp?.obp ?? "",
      hSplitLhp?.slg ?? "",
      hSplitLhp?.runsPerGame ?? "",
      hSplitLhp?.hr ?? "",
      // Away splits vs Rhp
      aSplitRhp?.avg ?? "",
      aSplitRhp?.ops ?? "",
      aSplitRhp?.obp ?? "",
      aSplitRhp?.slg ?? "",
      aSplitRhp?.runsPerGame ?? "",
      aSplitRhp?.hr ?? "",
      // Away splits vs Lhp
      aSplitLhp?.avg ?? "",
      aSplitLhp?.ops ?? "",
      aSplitLhp?.obp ?? "",
      aSplitLhp?.slg ?? "",
      aSplitLhp?.runsPerGame ?? "",
      aSplitLhp?.hr ?? "",
      // Fatigue
      fPitchers?.home?.daysSinceLastStart ?? "",
      fPitchers?.home?.pitchesLastStart ?? "",
      fPitchers?.home?.pitchesLast3Starts ?? "",
      fPitchers?.away?.daysSinceLastStart ?? "",
      fPitchers?.away?.pitchesLastStart ?? "",
      fPitchers?.away?.pitchesLast3Starts ?? "",
      fBullpen?.home?.ipLast3Days ?? "",
      fBullpen?.home?.ipLast7Days ?? "",
      fBullpen?.home?.relieversUsedYesterday ?? "",
      fBullpen?.home?.relieversUsedLast2Days ?? "",
      fBullpen?.home?.availableCount ?? "",
      fBullpen?.away?.ipLast3Days ?? "",
      fBullpen?.away?.ipLast7Days ?? "",
      fBullpen?.away?.relieversUsedYesterday ?? "",
      fBullpen?.away?.relieversUsedLast2Days ?? "",
      fBullpen?.away?.availableCount ?? "",
      // Advanced Pitching
      game.advanced_pitching?.home?.xEra ?? "",
      game.advanced_pitching?.home?.fip ?? "",
      game.advanced_pitching?.home?.xFip ?? "",
      game.advanced_pitching?.home?.siera ?? "",
      game.advanced_pitching?.home?.hardHitPct ?? "",
      game.advanced_pitching?.home?.barrelPct ?? "",
      game.advanced_pitching?.home?.groundBallPct ?? "",
      game.advanced_pitching?.home?.flyBallPct ?? "",
      game.advanced_pitching?.home?.strikeoutRate ?? "",
      game.advanced_pitching?.home?.walkRate ?? "",
      game.advanced_pitching?.home?.swingingStrikePct ?? "",
      game.advanced_pitching?.home?.cswPct ?? "",
      canUseActualKs ? (game.advanced_pitching?.home?.actualStrikeouts ?? "") : "",
      game.advanced_pitching?.home?.last5KsAvg ?? "",
      game.advanced_pitching?.home?.last5KsStd ?? "",
      game.advanced_pitching?.home?.last5IpAvg ?? "",
      game.advanced_pitching?.home?.last5BfAvg ?? "",
      game.advanced_pitching?.home?.last5PitchCountAvg ?? "",
      game.advanced_pitching?.home?.last3Ks1 ?? "",
      game.advanced_pitching?.home?.last3Ks2 ?? "",
      game.advanced_pitching?.home?.last3Ks3 ?? "",
      game.advanced_pitching?.home?.last3Ip1 ?? "",
      game.advanced_pitching?.home?.last3Ip2 ?? "",
      game.advanced_pitching?.home?.last3Ip3 ?? "",
      game.advanced_pitching?.home?.last3Bf1 ?? "",
      game.advanced_pitching?.home?.last3Bf2 ?? "",
      game.advanced_pitching?.home?.last3Bf3 ?? "",
      game.advanced_pitching?.home?.careerKPctVsTeam ?? game.advanced_pitching?.homeVsOpp?.careerKPctVsTeam ?? game.advanced_pitching?.homeVsOpp?.strikeoutRate ?? "",
      game.advanced_pitching?.home?.last3VsTeamKsAvg ?? "",
      game.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.home?.projectedPitchCount ?? "",
      game.advanced_pitching?.home?.projectedInnings ?? "",
      game.advanced_pitching?.home?.projectedStrikeoutsBase ?? "",
      game.advanced_pitching?.home?.battersFacedPerStart ?? "",
      game.advanced_pitching?.home?.fastballPct ?? "",
      game.advanced_pitching?.home?.sliderPct ?? "",
      game.advanced_pitching?.home?.curvePct ?? "",
      game.advanced_pitching?.home?.changeupPct ?? "",
      game.advanced_pitching?.home?.splitterPct ?? "",
      escapeStr(game.advanced_pitching?.home?.catcherName),
      game.advanced_pitching?.home?.catcherFramingRuns ?? "",
      hL3Bf.avg, hL3Ip.avg, hL3K.avg, hL3Bf.min, hL3Ip.min, hL3Bf.under15, hL3Bf.under18,
      game.advanced_pitching?.away?.xEra ?? "",
      game.advanced_pitching?.away?.fip ?? "",
      game.advanced_pitching?.away?.xFip ?? "",
      game.advanced_pitching?.away?.siera ?? "",
      game.advanced_pitching?.away?.hardHitPct ?? "",
      game.advanced_pitching?.away?.barrelPct ?? "",
      game.advanced_pitching?.away?.groundBallPct ?? "",
      game.advanced_pitching?.away?.flyBallPct ?? "",
      game.advanced_pitching?.away?.strikeoutRate ?? "",
      game.advanced_pitching?.away?.walkRate ?? "",
      game.advanced_pitching?.away?.swingingStrikePct ?? "",
      game.advanced_pitching?.away?.cswPct ?? "",
      canUseActualKs ? (game.advanced_pitching?.away?.actualStrikeouts ?? "") : "",
      game.advanced_pitching?.away?.last5KsAvg ?? "",
      game.advanced_pitching?.away?.last5KsStd ?? "",
      game.advanced_pitching?.away?.last5IpAvg ?? "",
      game.advanced_pitching?.away?.last5BfAvg ?? "",
      game.advanced_pitching?.away?.last5PitchCountAvg ?? "",
      game.advanced_pitching?.away?.last3Ks1 ?? "",
      game.advanced_pitching?.away?.last3Ks2 ?? "",
      game.advanced_pitching?.away?.last3Ks3 ?? "",
      game.advanced_pitching?.away?.last3Ip1 ?? "",
      game.advanced_pitching?.away?.last3Ip2 ?? "",
      game.advanced_pitching?.away?.last3Ip3 ?? "",
      game.advanced_pitching?.away?.last3Bf1 ?? "",
      game.advanced_pitching?.away?.last3Bf2 ?? "",
      game.advanced_pitching?.away?.last3Bf3 ?? "",
      game.advanced_pitching?.away?.careerKPctVsTeam ?? game.advanced_pitching?.awayVsOpp?.careerKPctVsTeam ?? game.advanced_pitching?.awayVsOpp?.strikeoutRate ?? "",
      game.advanced_pitching?.away?.last3VsTeamKsAvg ?? "",
      game.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.away?.projectedPitchCount ?? "",
      game.advanced_pitching?.away?.projectedInnings ?? "",
      game.advanced_pitching?.away?.projectedStrikeoutsBase ?? "",
      game.advanced_pitching?.away?.battersFacedPerStart ?? "",
      game.advanced_pitching?.away?.fastballPct ?? "",
      game.advanced_pitching?.away?.sliderPct ?? "",
      game.advanced_pitching?.away?.curvePct ?? "",
      game.advanced_pitching?.away?.changeupPct ?? "",
      game.advanced_pitching?.away?.splitterPct ?? "",
      escapeStr(game.advanced_pitching?.away?.catcherName),
      game.advanced_pitching?.away?.catcherFramingRuns ?? "",
      aL3Bf.avg, aL3Ip.avg, aL3K.avg, aL3Bf.min, aL3Ip.min, aL3Bf.under15, aL3Bf.under18,
      // Advanced Offense
      game.advanced_offense?.home?.wOba ?? "",
      game.advanced_offense?.home?.xwOba ?? "",
      game.advanced_offense?.home?.iso ?? "",
      game.advanced_offense?.home?.babip ?? "",
      game.advanced_offense?.home?.hardHitPct ?? "",
      game.advanced_offense?.home?.barrelPct ?? "",
      game.advanced_offense?.home?.contactPct ?? "",
      game.advanced_offense?.home?.kPctVsPitchHand ?? "",
      game.advanced_offense?.home?.projectedLineupKPct ?? "",
      game.advanced_offense?.home?.projectedLineupContactPctVsHand ?? "",
      game.advanced_offense?.home?.projectedLineupWhiffPctVsHand ?? "",
      game.advanced_offense?.home?.whiffPctVsFastball ?? "",
      game.advanced_offense?.home?.whiffPctVsSlider ?? "",
      game.advanced_offense?.home?.whiffPctVsCurve ?? "",
      game.advanced_offense?.home?.whiffPctVsChangeup ?? "",
      game.advanced_offense?.home?.whiffPctVsSplitter ?? "",
      game.advanced_offense?.away?.wOba ?? "",
      game.advanced_offense?.away?.xwOba ?? "",
      game.advanced_offense?.away?.iso ?? "",
      game.advanced_offense?.away?.babip ?? "",
      game.advanced_offense?.away?.hardHitPct ?? "",
      game.advanced_offense?.away?.barrelPct ?? "",
      game.advanced_offense?.away?.contactPct ?? "",
      game.advanced_offense?.away?.kPctVsPitchHand ?? "",
      game.advanced_offense?.away?.projectedLineupKPct ?? "",
      game.advanced_offense?.away?.projectedLineupContactPctVsHand ?? "",
      game.advanced_offense?.away?.projectedLineupWhiffPctVsHand ?? "",
      game.advanced_offense?.away?.whiffPctVsFastball ?? "",
      game.advanced_offense?.away?.whiffPctVsSlider ?? "",
      game.advanced_offense?.away?.whiffPctVsCurve ?? "",
      game.advanced_offense?.away?.whiffPctVsChangeup ?? "",
      game.advanced_offense?.away?.whiffPctVsSplitter ?? "",
      // Model Features
      game.model_features?.diffEra ?? "",
      game.model_features?.diffXera ?? "",
      game.model_features?.diffFip ?? "",
      game.model_features?.diffOps ?? "",
      game.model_features?.diffXwoba ?? "",
      game.model_features?.diffBullpenEra ?? "",
      game.model_features?.diffRunsPerGame ?? "",
      game.model_features?.diffRecordLast10 ?? "",
      game.model_features?.diffRecordHomeAway ?? "",
      game.model_features?.diffStarterRest ?? "",
      game.model_features?.diffBullpenFatigue ?? "",
      canUseBettingLines ? escapeStr(getBettingLineSource(game)) : "",
      // Metadata de confiabilidad point-in-time — ver comentario del header savant_metrics_asof_date
      savantCache.getSnapshotDate() ?? "",
      // Results
      game.game_result?.homeScore ?? "",
      game.game_result?.awayScore ?? "",
      escapeStr(game.game_result?.winner),
      escapeStr(game.game_result?.gameStatus ?? "Scheduled"),

      // VORTEX V10.3 METRICS
      (game as any).lineups?.lineup_confirmed ? 1 : 0,
      escapeStr((game as any).lineups?.lineup_source),
      escapeStr((game as any).lineups?.lineup_updated_at),
      escapeStr((game as any).pitchers?.home_starter?.pitcher_primary_pitch ?? (game as any).pitchers?.home?.pitcher_primary_pitch ?? (() => { const ap = game.advanced_pitching?.home; if (!ap) return null; const arr = [{ n: 'fastball', p: ap.fastballPct||0 }, { n: 'slider', p: ap.sliderPct||0 }, { n: 'curve', p: ap.curvePct||0 }, { n: 'changeup', p: ap.changeupPct||0 }, { n: 'splitter', p: ap.splitterPct||0 }].sort((a,b)=>b.p-a.p); return arr[0].p > 0 ? arr[0].n : null; })()),
      (game as any).pitchers?.home_starter?.pitcher_primary_pitch_usage_pct ?? (game as any).pitchers?.home?.pitcher_primary_pitch_usage_pct ?? (() => { const ap = game.advanced_pitching?.home; if (!ap) return ''; const arr = [ap.fastballPct||0, ap.sliderPct||0, ap.curvePct||0, ap.changeupPct||0, ap.splitterPct||0].sort((a,b)=>b-a); return arr[0] > 0 ? arr[0] : ''; })(),
      escapeStr((game as any).pitchers?.home_starter?.pitcher_secondary_pitch ?? (game as any).pitchers?.home?.pitcher_secondary_pitch ?? (() => { const ap = game.advanced_pitching?.home; if (!ap) return null; const arr = [{ n: 'fastball', p: ap.fastballPct||0 }, { n: 'slider', p: ap.sliderPct||0 }, { n: 'curve', p: ap.curvePct||0 }, { n: 'changeup', p: ap.changeupPct||0 }, { n: 'splitter', p: ap.splitterPct||0 }].sort((a,b)=>b.p-a.p); return arr[1].p > 0 ? arr[1].n : null; })()),
      (game as any).pitchers?.home_starter?.pitcher_secondary_pitch_usage_pct ?? (game as any).pitchers?.home?.pitcher_secondary_pitch_usage_pct ?? (() => { const ap = game.advanced_pitching?.home; if (!ap) return ''; const arr = [ap.fastballPct||0, ap.sliderPct||0, ap.curvePct||0, ap.changeupPct||0, ap.splitterPct||0].sort((a,b)=>b-a); return arr[1] > 0 ? arr[1] : ''; })(),
      (game as any).pitchers?.home_starter?.pitcher_pitches_per_bf ?? (game as any).pitchers?.home?.pitcher_pitches_per_bf ?? game.advanced_pitching?.home?.pitcher_pitches_per_bf ?? "",
      (game as any).pitchers?.home_starter?.pitcher_pitches_per_bf_last5 ?? (game as any).pitchers?.home?.pitcher_pitches_per_bf_last5 ?? game.advanced_pitching?.home?.pitcher_pitches_per_bf_last5 ?? "",
      (game as any).pitchers?.home_starter?.pitcher_pitches_per_ip_last5 ?? (game as any).pitchers?.home?.pitcher_pitches_per_ip_last5 ?? game.advanced_pitching?.home?.pitcher_pitches_per_ip_last5 ?? "",
      escapeStr((game as any).pitchers?.away_starter?.pitcher_primary_pitch ?? (game as any).pitchers?.away?.pitcher_primary_pitch ?? (() => { const ap = game.advanced_pitching?.away; if (!ap) return null; const arr = [{ n: 'fastball', p: ap.fastballPct||0 }, { n: 'slider', p: ap.sliderPct||0 }, { n: 'curve', p: ap.curvePct||0 }, { n: 'changeup', p: ap.changeupPct||0 }, { n: 'splitter', p: ap.splitterPct||0 }].sort((a,b)=>b.p-a.p); return arr[0].p > 0 ? arr[0].n : null; })()),
      (game as any).pitchers?.away_starter?.pitcher_primary_pitch_usage_pct ?? (game as any).pitchers?.away?.pitcher_primary_pitch_usage_pct ?? (() => { const ap = game.advanced_pitching?.away; if (!ap) return ''; const arr = [ap.fastballPct||0, ap.sliderPct||0, ap.curvePct||0, ap.changeupPct||0, ap.splitterPct||0].sort((a,b)=>b-a); return arr[0] > 0 ? arr[0] : ''; })(),
      escapeStr((game as any).pitchers?.away_starter?.pitcher_secondary_pitch ?? (game as any).pitchers?.away?.pitcher_secondary_pitch ?? (() => { const ap = game.advanced_pitching?.away; if (!ap) return null; const arr = [{ n: 'fastball', p: ap.fastballPct||0 }, { n: 'slider', p: ap.sliderPct||0 }, { n: 'curve', p: ap.curvePct||0 }, { n: 'changeup', p: ap.changeupPct||0 }, { n: 'splitter', p: ap.splitterPct||0 }].sort((a,b)=>b.p-a.p); return arr[1].p > 0 ? arr[1].n : null; })()),
      (game as any).pitchers?.away_starter?.pitcher_secondary_pitch_usage_pct ?? (game as any).pitchers?.away?.pitcher_secondary_pitch_usage_pct ?? (() => { const ap = game.advanced_pitching?.away; if (!ap) return ''; const arr = [ap.fastballPct||0, ap.sliderPct||0, ap.curvePct||0, ap.changeupPct||0, ap.splitterPct||0].sort((a,b)=>b-a); return arr[1] > 0 ? arr[1] : ''; })(),
      (game as any).pitchers?.away_starter?.pitcher_pitches_per_bf ?? (game as any).pitchers?.away?.pitcher_pitches_per_bf ?? game.advanced_pitching?.away?.pitcher_pitches_per_bf ?? "",
      (game as any).pitchers?.away_starter?.pitcher_pitches_per_bf_last5 ?? (game as any).pitchers?.away?.pitcher_pitches_per_bf_last5 ?? game.advanced_pitching?.away?.pitcher_pitches_per_bf_last5 ?? "",
      (game as any).pitchers?.away_starter?.pitcher_pitches_per_ip_last5 ?? (game as any).pitchers?.away?.pitcher_pitches_per_ip_last5 ?? game.advanced_pitching?.away?.pitcher_pitches_per_ip_last5 ?? "",
      (game as any).pitchers?.home_starter?.pitcher_avg_pitches_last3 ?? (game as any).pitchers?.home?.pitcher_avg_pitches_last3 ?? game.advanced_pitching?.home?.pitcher_avg_pitches_last3 ?? "",
      escapeStr((game as any).pitchers?.home_starter?.pitcher_rest_status ?? (game as any).pitchers?.home?.pitcher_rest_status ?? game.advanced_pitching?.home?.pitcher_rest_status),
      (game as any).pitchers?.away_starter?.pitcher_avg_pitches_last3 ?? (game as any).pitchers?.away?.pitcher_avg_pitches_last3 ?? game.advanced_pitching?.away?.pitcher_avg_pitches_last3 ?? "",
      escapeStr((game as any).pitchers?.away_starter?.pitcher_rest_status ?? (game as any).pitchers?.away?.pitcher_rest_status ?? game.advanced_pitching?.away?.pitcher_rest_status),
      escapeStr((game as any).pitchers?.home_starter?.pitchHand ?? (game as any).pitchers?.home?.pitchHand),
      escapeStr((game as any).pitchers?.away_starter?.pitchHand ?? (game as any).pitchers?.away?.pitchHand),
      game.bullpen?.home?.ipLast3Days ?? fBullpen?.home?.ipLast3Days ?? "",
      game.bullpen?.home?.ipLast7Days ?? fBullpen?.home?.ipLast7Days ?? "",
      game.bullpen?.away?.ipLast3Days ?? fBullpen?.away?.ipLast3Days ?? "",
      game.bullpen?.away?.ipLast7Days ?? fBullpen?.away?.ipLast7Days ?? "",
      (game as any).bullpen?.home?.relieversUsedYesterday ?? fBullpen?.home?.relieversUsedYesterday ?? "",
      (game as any).advanced_offense?.home?.lineup_contact_stress_score ?? "",
      (game as any).advanced_offense?.home?.lineup_pitch_count_risk_score ?? "",
      (game as any).advanced_offense?.home?.lineup_high_hardhit_batters_count ?? "",
      (game as any).advanced_offense?.away?.lineup_contact_stress_score ?? "",
      (game as any).advanced_offense?.away?.lineup_pitch_count_risk_score ?? "",
      (game as any).advanced_offense?.away?.lineup_high_hardhit_batters_count ?? "",
      (game as any).pitchers?.home_starter?.pitcher_recent_velocity ?? (game as any).pitchers?.home?.pitcher_recent_velocity ?? "",
      (game as any).pitchers?.away_starter?.pitcher_recent_velocity ?? (game as any).pitchers?.away?.pitcher_recent_velocity ?? "",
      // New Advanced Metrics & Park Factors
      game.advanced_pitching?.home?.pitcher_spin_rate ?? "",
      game.advanced_pitching?.away?.pitcher_spin_rate ?? "",
      game.advanced_pitching?.home?.pitcher_stuff_plus ?? "",
      game.advanced_pitching?.away?.pitcher_stuff_plus ?? "",
      game.advanced_pitching?.home?.pitcher_o_swing_pct ?? "",
      game.advanced_pitching?.away?.pitcher_o_swing_pct ?? "",
      game.advanced_pitching?.home?.pitcher_k_pct_vs_lhb ?? "",
      game.advanced_pitching?.away?.pitcher_k_pct_vs_lhb ?? "",
      game.advanced_pitching?.home?.pitcher_k_pct_vs_rhb ?? "",
      game.advanced_pitching?.away?.pitcher_k_pct_vs_rhb ?? "",
      game.park_factors?.index_so ?? 100,
      game.park_factors?.index_runs ?? 100,
      game.park_factors?.index_hr ?? 100
    ];

    const processTeamLineup = (lineup: any[], teamName: string, isHomeTeam: boolean) => {
      if (!lineup || !Array.isArray(lineup)) return;

      const oppPitcher = isHomeTeam ? game.pitchers.away : game.pitchers.home;
      const oppPitcherName = oppPitcher?.name || "";
      const oppPitcherHand = oppPitcher?.pitchHand || "";
      const pitcherAllowedAvgLhb = oppPitcher?.pitcher_allowed_avg_vs_lhb ?? "";
      const pitcherAllowedAvgRhb = oppPitcher?.pitcher_allowed_avg_vs_rhb ?? "";
      const pitcherAllowedSlgLhb = oppPitcher?.pitcher_allowed_slg_vs_lhb ?? "";
      const pitcherAllowedSlgRhb = oppPitcher?.pitcher_allowed_slg_vs_rhb ?? "";

      for (const p of lineup) {
        const batterStatsRow = [
          escapeStr(game.id),
          escapeStr(game.metadata.date),
          escapeStr(p.player_name || p.name || ""),
          escapeStr(p.team || teamName),
          p.batting_order ?? "",
          escapeStr(p.bat_side || "R"),
          escapeStr(p.position || "DH"),
          p.avg ?? "",
          p.obp ?? "",
          p.slg ?? "",
          p.ops ?? "",
          p.woba ?? "",
          p.iso ?? "",
          p.pa ?? "",
          p.hits ?? "",
          p.doubles ?? "",
          p.triples ?? "",
          p.home_runs ?? p.hr ?? "",
          p.strikeout_pct ?? p.kPct ?? "",
          p.walk_pct ?? "",
          p.last7_avg ?? "",
          p.last7_ops ?? "",
          p.last7_slg ?? "",
          p.last7_total_bases ?? "",
          p.last7_hits ?? "",
          p.last7_xbh ?? "",
          p.ops_vs_rhp ?? "",
          p.ops_vs_lhp ?? "",
          p.slg_vs_rhp ?? "",
          p.slg_vs_lhp ?? "",
          p.k_pct_vs_rhp ?? "",
          p.k_pct_vs_lhp ?? "",
          roundCsvNumber(p.contact_pct_vs_rhp),
          roundCsvNumber(p.contact_pct_vs_lhp),
          roundCsvNumber(p.whiff_pct),
          roundCsvNumber(p.chase_pct),
          escapeStr(oppPitcherName),
          escapeStr(oppPitcherHand),
          pitcherAllowedAvgLhb,
          pitcherAllowedAvgRhb,
          pitcherAllowedSlgLhb,
          pitcherAllowedSlgRhb
        ];
        rows.push([...batterStatsRow, ...gameContextRow]);
      }
    };

    processTeamLineup(game.lineups?.home, game.metadata.homeTeam, true);
    processTeamLineup(game.lineups?.away, game.metadata.awayTeam, false);
  }

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

function formatCsvTimestamp(isoString?: string | null, dateFallback?: string): string {
  if (!isoString) return dateFallback ? `${dateFallback} 12:00:00` : "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return dateFallback ? `${dateFallback} 12:00:00` : "";
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (e) {
    return dateFallback ? `${dateFallback} 12:00:00` : "";
  }
}

export function generateKPropsLinesCSV(games: MLBGame[]): string {
  const headers = [
    "game_id", "date", "pitcher", "team", "side", "k_line", "over_odds", "under_odds", "book", "line_source", "timestamp", "line_type"
  ];
  const rows: any[][] = [];

  for (const g of games) {
    const ts = formatCsvTimestamp(g.timestamp, g.metadata.date);
    
    // Home pitcher strikeout prop
    if (g.pitchers?.home?.name) {
      const homeTeamAbbr = getTeamAbbr(g.metadata.homeTeam) || g.metadata.homeTeam;
      const hasProp = g.pitchers.home.strikeoutProp !== undefined && g.pitchers.home.strikeoutProp !== null;
      const source = getPropLineSource(g.pitchers.home.strikeoutPropSource);
      rows.push([
        g.id,
        g.metadata.date,
        escapeCsvValue(g.pitchers.home.name),
        escapeCsvValue(homeTeamAbbr),
        "home",
        g.pitchers.home.strikeoutProp ?? "",
        g.pitchers.home.strikeoutPropOverOdds ?? "",
        g.pitchers.home.strikeoutPropUnderOdds ?? "",
        hasProp && source ? escapeCsvValue(source === "the_odds_api" ? "TheOddsAPI" : "datastreak") : "",
        hasProp ? source : "",
        hasProp ? ts : "",
        hasProp ? "current" : "" // line_type
      ]);
    }

    // Away pitcher strikeout prop
    if (g.pitchers?.away?.name) {
      const awayTeamAbbr = getTeamAbbr(g.metadata.awayTeam) || g.metadata.awayTeam;
      const hasProp = g.pitchers.away.strikeoutProp !== undefined && g.pitchers.away.strikeoutProp !== null;
      const source = getPropLineSource(g.pitchers.away.strikeoutPropSource);
      rows.push([
        g.id,
        g.metadata.date,
        escapeCsvValue(g.pitchers.away.name),
        escapeCsvValue(awayTeamAbbr),
        "away",
        g.pitchers.away.strikeoutProp ?? "",
        g.pitchers.away.strikeoutPropOverOdds ?? "",
        g.pitchers.away.strikeoutPropUnderOdds ?? "",
        hasProp && source ? escapeCsvValue(source === "the_odds_api" ? "TheOddsAPI" : "datastreak") : "",
        hasProp ? source : "",
        hasProp ? ts : "",
        hasProp ? "current" : ""
      ]);
    }
  }

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export function generateBatterTotalBasesLinesCSV(games: MLBGame[]): string {
  const headers = [
    "game_id", "date", "player_name", "team", "side", "tb_line", "over_odds", "under_odds", "book", "line_source", "timestamp", "line_type"
  ];
  const rows: any[][] = [];

  for (const g of games) {
    const ts = formatCsvTimestamp(g.timestamp, g.metadata.date);

    const processLineup = (lineup: any[] | undefined, teamName: string, side: "home" | "away") => {
      for (const p of lineup || []) {
        if (p.player_name || p.name) {
          const teamAbbr = getTeamAbbr(teamName) || teamName;
          const hasProp = p.totalBasesProp !== undefined && p.totalBasesProp !== null;
          const source = getPropLineSource(p.totalBasesPropSource, p.totalBasesPropBook);
          rows.push([
            g.id,
            g.metadata.date,
            escapeCsvValue(p.player_name || p.name || ""),
            escapeCsvValue(teamAbbr),
            side,
            p.totalBasesProp ?? "",
            p.totalBasesPropOverOdds ?? "",
            p.totalBasesPropUnderOdds ?? "",
            hasProp ? escapeCsvValue(p.totalBasesPropBook || "datastreak") : "",
            hasProp ? source : "",
            hasProp ? ts : "",
            hasProp ? "current" : ""
          ]);
        }
      }
    };

    processLineup(g.lineups?.home, g.metadata.homeTeam, "home");
    processLineup(g.lineups?.away, g.metadata.awayTeam, "away");
  }

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}


