/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MLBGame } from "./types";

function getLineupAverageKPct(lineup: any[] | undefined): string {
  if (!lineup || !Array.isArray(lineup) || lineup.length === 0) return "";
  const sum = lineup.reduce((acc, p) => acc + (p.strikeout_pct ?? p.kPct ?? 0), 0);
  return (sum / lineup.length).toFixed(2);
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

// Generate CSV string representing MLB_MASTER_DATA format (Requisito 7)
export function generateMLBDataCSV(games: MLBGame[]): string {
  const headers = [
    "game_id",
    "fecha",
    "hora",
    "equipo_local",
    "equipo_visitante",
    "estadio",
    "local_pitcher",
    "local_pitcher_era",
    "local_pitcher_whip",
    "local_pitcher_kPct",
    "local_pitcher_bbPct",
    "local_pitcher_wins",
    "local_pitcher_losses",
    "local_pitcher_ip",
    "away_pitcher",
    "away_pitcher_era",
    "away_pitcher_whip",
    "away_pitcher_kPct",
    "away_pitcher_bbPct",
    "away_pitcher_wins",
    "away_pitcher_losses",
    "away_pitcher_ip",
    "bullpen_era_local",
    "bullpen_ip_7d_local",
    "bullpen_era_away",
    "bullpen_ip_7d_away",
    "ofensa_run_g_local",
    "ofensa_ops_local",
    "ofensa_obp_local",
    "ofensa_slg_local",
    "home_offense_kPct",
    "ofensa_run_g_away",
    "ofensa_ops_away",
    "ofensa_obp_away",
    "ofensa_slg_away",
    "away_offense_kPct",
    "linea_moneyline_open_local",
    "linea_moneyline_curr_local",
    "linea_moneyline_open_away",
    "linea_moneyline_curr_away",
    "total_carreras"
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
      g.pitchers.away.name,
      g.pitchers.away.era,
      g.pitchers.away.whip,
      g.pitchers.away.kPct,
      g.pitchers.away.bbPct,
      g.pitchers.away.wins,
      g.pitchers.away.losses,
      g.pitchers.away.ip,
      g.bullpen.home.era,
      g.bullpen.home.ipLast7Days,
      g.bullpen.away.era,
      g.bullpen.away.ipLast7Days,
      g.offense.home.runsPerGame,
      g.offense.home.ops,
      g.offense.home.obp,
      g.offense.home.slg,
      getLineupAverageKPct(g.lineups?.home),
      g.offense.away.runsPerGame,
      g.offense.away.ops,
      g.offense.away.obp,
      g.offense.away.slg,
      getLineupAverageKPct(g.lineups?.away),
      canUseBettingLines ? g.betting_lines.openingMoneylineHome : "",
      canUseBettingLines ? g.betting_lines.currentMoneylineHome : "",
      canUseBettingLines ? g.betting_lines.openingMoneylineAway : "",
      canUseBettingLines ? g.betting_lines.currentMoneylineAway : "",
      canUseBettingLines ? g.betting_lines.totalRuns : ""
    ];
  });

  return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

// Generate wide CSV for Machine Learning dataset (con all features, weather, splits, sabermetrics, fatigue and results)
export function generateMLDatasetCSV(games: MLBGame[]): string {
  const headers = [
    // Metadata
    "game_id", "fecha", "hora", "equipo_local", "equipo_visitante", "estadio",
    // Pitchers standard
    "local_pitcher", "local_pitcher_era", "local_pitcher_whip", "local_pitcher_kPct", "local_pitcher_bbPct", "local_pitcher_wins", "local_pitcher_losses", "local_pitcher_ip",
    "away_pitcher", "away_pitcher_era", "away_pitcher_whip", "away_pitcher_kPct", "away_pitcher_bbPct", "away_pitcher_wins", "away_pitcher_losses", "away_pitcher_ip",
    // Bullpen standard
    "bullpen_era_local", "bullpen_usage_local", "bullpen_ip_7d_local",
    "bullpen_era_away", "bullpen_usage_away", "bullpen_ip_7d_away",
    // Offense standard
    "ofensa_run_g_local", "ofensa_ops_local", "ofensa_obp_local", "ofensa_slg_local", "home_offense_kPct",
    "ofensa_run_g_away", "ofensa_ops_away", "ofensa_obp_away", "ofensa_slg_away", "away_offense_kPct",
    // Betting lines
    "linea_moneyline_open_local", "linea_moneyline_open_away", "linea_moneyline_curr_local", "linea_moneyline_curr_away",
    "linea_runline_local", "linea_runline_odds_local", "linea_runline_away", "linea_runline_odds_away",
    "linea_total_carreras", "linea_over_odds", "linea_under_odds",
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
    "home_pitcher_xera", "home_pitcher_fip", "home_pitcher_xfip", "home_pitcher_siera", "home_pitcher_hardhit_pct", "home_pitcher_barrel_pct", "home_pitcher_gb_pct", "home_pitcher_fb_pct", "home_pitcher_so_rate", "home_pitcher_bb_rate", "home_pitcher_swstr_pct", "home_pitcher_csw_pct", "home_pitcher_actual_ks", "home_pitcher_last5_ks_avg", "home_pitcher_last5_ks_std", "home_pitcher_last5_ip_avg", "home_pitcher_last5_bf_avg", "home_pitcher_last5_pitch_count_avg", "home_pitcher_career_k_pct_vs_team", "home_pitcher_last3_vs_team_ks_avg", "home_pitcher_last3_vs_team_bf_avg", "home_pitcher_projected_pitches", "home_pitcher_bf_per_start",
    "away_pitcher_xera", "away_pitcher_fip", "away_pitcher_xfip", "away_pitcher_siera", "away_pitcher_hardhit_pct", "away_pitcher_barrel_pct", "away_pitcher_gb_pct", "away_pitcher_fb_pct", "away_pitcher_so_rate", "away_pitcher_bb_rate", "away_pitcher_swstr_pct", "away_pitcher_csw_pct", "away_pitcher_actual_ks", "away_pitcher_last5_ks_avg", "away_pitcher_last5_ks_std", "away_pitcher_last5_ip_avg", "away_pitcher_last5_bf_avg", "away_pitcher_last5_pitch_count_avg", "away_pitcher_career_k_pct_vs_team", "away_pitcher_last3_vs_team_ks_avg", "away_pitcher_last3_vs_team_bf_avg", "away_pitcher_projected_pitches", "away_pitcher_bf_per_start",
    // Advanced Offense
    "home_offense_woba", "home_offense_xwoba", "home_offense_wrcplus", "home_offense_iso", "home_offense_babip", "home_offense_hardhit_pct", "home_offense_barrel_pct", "home_offense_contact_pct", "home_offense_chase_pct", "home_offense_k_pct_vs_pitch_hand", "home_offense_projected_lineup_k_pct", "home_projected_lineup_k_pct_vs_hand", "home_projected_lineup_contact_pct_vs_hand",
    "away_offense_woba", "away_offense_xwoba", "away_offense_wrcplus", "away_offense_iso", "away_offense_babip", "away_offense_hardhit_pct", "away_offense_barrel_pct", "away_offense_contact_pct", "away_offense_chase_pct", "away_offense_k_pct_vs_pitch_hand", "away_offense_projected_lineup_k_pct", "away_projected_lineup_k_pct_vs_hand", "away_projected_lineup_contact_pct_vs_hand",
    // Model Features
    "diff_era", "diff_xera", "diff_fip", "diff_ops", "diff_xwoba", "diff_bullpen_era", "diff_runs_per_game", "diff_record_last10", "diff_record_home_away", "diff_starter_rest", "diff_bullpen_fatigue", "var_moneyline", "var_runline", "var_totalruns",
    // Game Results / ML Target Labels
    "resultado_carreras_local", "resultado_carreras_visitante", "resultado_ganador", "resultado_runline_cubierto", "resultado_overunder", "resultado_estado"
  ];

  const escapeStr = (val: any) => {
    if (val === undefined || val === null || val === "") return "";
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const rows = games.map(g => {
    // Splits helpers
    const hSplitRhp = g.offensive_splits?.home?.vsRhp;
    const hSplitLhp = g.offensive_splits?.home?.vsLhp;
    const aSplitRhp = g.offensive_splits?.away?.vsRhp;
    const aSplitLhp = g.offensive_splits?.away?.vsLhp;

    // Fatigue helpers
    const fPitchers = g.fatigue_metrics?.pitchers;
    const fBullpen = g.fatigue_metrics?.bullpen;
    const canUseActualKs = isFinalGameStatus(g.game_result?.gameStatus);
    const canUseBettingLines = hasRealBettingLines(g);

    return [
      // ... (Keep metadata and pitchers logic exactly same)
      escapeStr(g.id),
      escapeStr(g.metadata.date),
      escapeStr(g.metadata.time),
      escapeStr(g.metadata.homeTeam),
      escapeStr(g.metadata.awayTeam),
      escapeStr(g.metadata.venue),
      // Pitchers standard
      escapeStr(g.pitchers.home.name),
      g.pitchers.home.era ?? "",
      g.pitchers.home.whip ?? "",
      g.pitchers.home.kPct ?? "",
      g.pitchers.home.bbPct ?? "",
      g.pitchers.home.wins ?? "",
      g.pitchers.home.losses ?? "",
      escapeStr(g.pitchers.home.ip),
      escapeStr(g.pitchers.away.name),
      g.pitchers.away.era ?? "",
      g.pitchers.away.whip ?? "",
      g.pitchers.away.kPct ?? "",
      g.pitchers.away.bbPct ?? "",
      g.pitchers.away.wins ?? "",
      g.pitchers.away.losses ?? "",
      escapeStr(g.pitchers.away.ip),
      // Bullpen standard
      g.bullpen.home.era ?? "",
      escapeStr(g.bullpen.home.usageLast3Days),
      g.bullpen.home.ipLast7Days ?? "",
      g.bullpen.away.era ?? "",
      escapeStr(g.bullpen.away.usageLast3Days),
      g.bullpen.away.ipLast7Days ?? "",
      // Offense standard
      g.offense.home.runsPerGame ?? "",
      g.offense.home.ops ?? "",
      g.offense.home.obp ?? "",
      g.offense.home.slg ?? "",
      getLineupAverageKPct(g.lineups?.home),
      g.offense.away.runsPerGame ?? "",
      g.offense.away.ops ?? "",
      g.offense.away.obp ?? "",
      g.offense.away.slg ?? "",
      getLineupAverageKPct(g.lineups?.away),
      // Betting lines
      canUseBettingLines ? (g.betting_lines.openingMoneylineHome ?? "") : "",
      canUseBettingLines ? (g.betting_lines.openingMoneylineAway ?? "") : "",
      canUseBettingLines ? (g.betting_lines.currentMoneylineHome ?? "") : "",
      canUseBettingLines ? (g.betting_lines.currentMoneylineAway ?? "") : "",
      canUseBettingLines ? (g.betting_lines.runLineHome ?? "") : "",
      canUseBettingLines ? (g.betting_lines.runLineHomeOdds ?? "") : "",
      canUseBettingLines ? (g.betting_lines.runLineAway ?? "") : "",
      canUseBettingLines ? (g.betting_lines.runLineAwayOdds ?? "") : "",
      canUseBettingLines ? (g.betting_lines.totalRuns ?? "") : "",
      canUseBettingLines ? (g.betting_lines.overOdds ?? "") : "",
      canUseBettingLines ? (g.betting_lines.underOdds ?? "") : "",
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
      canUseActualKs ? (g.advanced_pitching?.home?.actualStrikeouts ?? "") : "",
      g.advanced_pitching?.home?.last5KsAvg ?? "",
      g.advanced_pitching?.home?.last5KsStd ?? "",
      g.advanced_pitching?.home?.last5IpAvg ?? "",
      g.advanced_pitching?.home?.last5BfAvg ?? "",
      g.advanced_pitching?.home?.last5PitchCountAvg ?? "",
      g.advanced_pitching?.home?.careerKPctVsTeam ?? "",
      g.advanced_pitching?.home?.last3VsTeamKsAvg ?? "",
      g.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.home?.projectedPitchCount ?? "",
      g.advanced_pitching?.home?.battersFacedPerStart ?? "",
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
      canUseActualKs ? (g.advanced_pitching?.away?.actualStrikeouts ?? "") : "",
      g.advanced_pitching?.away?.last5KsAvg ?? "",
      g.advanced_pitching?.away?.last5KsStd ?? "",
      g.advanced_pitching?.away?.last5IpAvg ?? "",
      g.advanced_pitching?.away?.last5BfAvg ?? "",
      g.advanced_pitching?.away?.last5PitchCountAvg ?? "",
      g.advanced_pitching?.away?.careerKPctVsTeam ?? "",
      g.advanced_pitching?.away?.last3VsTeamKsAvg ?? "",
      g.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      g.advanced_pitching?.away?.projectedPitchCount ?? "",
      g.advanced_pitching?.away?.battersFacedPerStart ?? "",
      // Advanced Offense
      g.advanced_offense?.home?.wOba ?? "",
      g.advanced_offense?.home?.xwOba ?? "",
      g.advanced_offense?.home?.wrcPlus ?? "",
      g.advanced_offense?.home?.iso ?? "",
      g.advanced_offense?.home?.babip ?? "",
      g.advanced_offense?.home?.hardHitPct ?? "",
      g.advanced_offense?.home?.barrelPct ?? "",
      g.advanced_offense?.home?.contactPct ?? "",
      g.advanced_offense?.home?.chasePct ?? "",
      g.advanced_offense?.home?.kPctVsPitchHand ?? "",
      g.advanced_offense?.home?.projectedLineupKPct ?? "",
      g.advanced_offense?.home?.projectedLineupKPct ?? "",
      g.advanced_offense?.home?.projectedLineupContactPctVsHand ?? "",
      g.advanced_offense?.away?.wOba ?? "",
      g.advanced_offense?.away?.xwOba ?? "",
      g.advanced_offense?.away?.wrcPlus ?? "",
      g.advanced_offense?.away?.iso ?? "",
      g.advanced_offense?.away?.babip ?? "",
      g.advanced_offense?.away?.hardHitPct ?? "",
      g.advanced_offense?.away?.barrelPct ?? "",
      g.advanced_offense?.away?.contactPct ?? "",
      g.advanced_offense?.away?.chasePct ?? "",
      g.advanced_offense?.away?.kPctVsPitchHand ?? "",
      g.advanced_offense?.away?.projectedLineupKPct ?? "",
      g.advanced_offense?.away?.projectedLineupKPct ?? "",
      g.advanced_offense?.away?.projectedLineupContactPctVsHand ?? "",
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
      g.model_features?.varMoneyline ?? "",
      g.model_features?.varRunLine ?? "",
      g.model_features?.varTotalRuns ?? "",
      // Results
      g.game_result?.homeScore ?? "",
      g.game_result?.awayScore ?? "",
      escapeStr(g.game_result?.winner),
      escapeStr(g.game_result?.runLineCovered),
      escapeStr(g.game_result?.overUnderResult),
      escapeStr(g.game_result?.gameStatus ?? "Scheduled")
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

export function generateBattersCSV(games: MLBGame[]): string {
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
    "total_bases_prop",
    "total_bases_prop_over_odds",
    "total_bases_prop_under_odds",
    "total_bases_prop_book",
    "total_bases_prop_hit_rate",
    "total_bases_prop_hit_rate_display",
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
    "opposing_pitcher",
    "opposing_pitcher_hand",
    "pitcher_allowed_avg_vs_lhb",
    "pitcher_allowed_avg_vs_rhb",
    "pitcher_allowed_slg_vs_lhb",
    "pitcher_allowed_slg_vs_rhb",

    // --- Game Context & Team Stats (72 columns) ---
    "hora", "equipo_local", "equipo_visitante", "estadio",
    // Pitchers standard
    "local_pitcher", "local_pitcher_era", "local_pitcher_whip", "local_pitcher_kPct", "local_pitcher_bbPct", "local_pitcher_wins", "local_pitcher_losses", "local_pitcher_ip",
    "away_pitcher", "away_pitcher_era", "away_pitcher_whip", "away_pitcher_kPct", "away_pitcher_bbPct", "away_pitcher_wins", "away_pitcher_losses", "away_pitcher_ip",
    // Bullpen standard
    "bullpen_era_local", "bullpen_usage_local", "bullpen_ip_7d_local",
    "bullpen_era_away", "bullpen_usage_away", "bullpen_ip_7d_away",
    // Offense standard
    "ofensa_run_g_local", "ofensa_ops_local", "ofensa_obp_local", "ofensa_slg_local", "home_offense_kPct",
    "ofensa_run_g_away", "ofensa_ops_away", "ofensa_obp_away", "ofensa_slg_away", "away_offense_kPct",
    // Betting lines
    "linea_moneyline_open_local", "linea_moneyline_open_away", "linea_moneyline_curr_local", "linea_moneyline_curr_away",
    "linea_runline_local", "linea_runline_odds_local", "linea_runline_away", "linea_runline_odds_away",
    "linea_total_carreras", "linea_over_odds", "linea_under_odds",
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
    "home_pitcher_xera", "home_pitcher_fip", "home_pitcher_xfip", "home_pitcher_siera", "home_pitcher_hardhit_pct", "home_pitcher_barrel_pct", "home_pitcher_gb_pct", "home_pitcher_fb_pct", "home_pitcher_so_rate", "home_pitcher_bb_rate", "home_pitcher_swstr_pct", "home_pitcher_csw_pct", "home_pitcher_actual_ks", "home_pitcher_last5_ks_avg", "home_pitcher_last5_ks_std", "home_pitcher_last5_ip_avg", "home_pitcher_last5_bf_avg", "home_pitcher_last5_pitch_count_avg", "home_pitcher_career_k_pct_vs_team", "home_pitcher_last3_vs_team_ks_avg", "home_pitcher_last3_vs_team_bf_avg", "home_pitcher_projected_pitches", "home_pitcher_bf_per_start",
    "away_pitcher_xera", "away_pitcher_fip", "away_pitcher_xfip", "away_pitcher_siera", "away_pitcher_hardhit_pct", "away_pitcher_barrel_pct", "away_pitcher_gb_pct", "away_pitcher_fb_pct", "away_pitcher_so_rate", "away_pitcher_bb_rate", "away_pitcher_swstr_pct", "away_pitcher_csw_pct", "away_pitcher_actual_ks", "away_pitcher_last5_ks_avg", "away_pitcher_last5_ks_std", "away_pitcher_last5_ip_avg", "away_pitcher_last5_bf_avg", "away_pitcher_last5_pitch_count_avg", "away_pitcher_career_k_pct_vs_team", "away_pitcher_last3_vs_team_ks_avg", "away_pitcher_last3_vs_team_bf_avg", "away_pitcher_projected_pitches", "away_pitcher_bf_per_start",
    // Advanced Offense
    "home_offense_woba", "home_offense_xwoba", "home_offense_wrcplus", "home_offense_iso", "home_offense_babip", "home_offense_hardhit_pct", "home_offense_barrel_pct", "home_offense_contact_pct", "home_offense_chase_pct", "home_offense_k_pct_vs_pitch_hand", "home_offense_projected_lineup_k_pct", "home_projected_lineup_k_pct_vs_hand", "home_projected_lineup_contact_pct_vs_hand",
    "away_offense_woba", "away_offense_xwoba", "away_offense_wrcplus", "away_offense_iso", "away_offense_babip", "away_offense_hardhit_pct", "away_offense_barrel_pct", "away_offense_contact_pct", "away_offense_chase_pct", "away_offense_k_pct_vs_pitch_hand", "away_offense_projected_lineup_k_pct", "away_projected_lineup_k_pct_vs_hand", "away_projected_lineup_contact_pct_vs_hand",
    // Model Features
    "diff_era", "diff_xera", "diff_fip", "diff_ops", "diff_xwoba", "diff_bullpen_era", "diff_runs_per_game", "diff_record_last10", "diff_record_home_away", "diff_starter_rest", "diff_bullpen_fatigue", "var_moneyline", "var_runline", "var_totalruns",
    // Game Results / ML Target Labels
    "resultado_carreras_local", "resultado_carreras_visitante", "resultado_ganador", "resultado_runline_cubierto", "resultado_overunder", "resultado_estado"
  ];

  const escapeStr = (val: any) => {
    if (val === undefined || val === null || val === "") return "";
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const rows: any[][] = [];

  for (const game of games) {
    const hSplitRhp = game.offensive_splits?.home?.vsRhp;
    const hSplitLhp = game.offensive_splits?.home?.vsLhp;
    const aSplitRhp = game.offensive_splits?.away?.vsRhp;
    const aSplitLhp = game.offensive_splits?.away?.vsLhp;

    const fPitchers = game.fatigue_metrics?.pitchers;
    const fBullpen = game.fatigue_metrics?.bullpen;
    const canUseActualKs = isFinalGameStatus(game.game_result?.gameStatus);
    const canUseBettingLines = hasRealBettingLines(game);

    const gameContextRow = [
      escapeStr(game.metadata.time),
      escapeStr(game.metadata.homeTeam),
      escapeStr(game.metadata.awayTeam),
      escapeStr(game.metadata.venue),
      // Pitchers standard
      escapeStr(game.pitchers.home.name),
      game.pitchers.home.era ?? "",
      game.pitchers.home.whip ?? "",
      game.pitchers.home.kPct ?? "",
      game.pitchers.home.bbPct ?? "",
      game.pitchers.home.wins ?? "",
      game.pitchers.home.losses ?? "",
      escapeStr(game.pitchers.home.ip),
      escapeStr(game.pitchers.away.name),
      game.pitchers.away.era ?? "",
      game.pitchers.away.whip ?? "",
      game.pitchers.away.kPct ?? "",
      game.pitchers.away.bbPct ?? "",
      game.pitchers.away.wins ?? "",
      game.pitchers.away.losses ?? "",
      escapeStr(game.pitchers.away.ip),
      // Bullpen standard
      game.bullpen.home.era ?? "",
      escapeStr(game.bullpen.home.usageLast3Days),
      game.bullpen.home.ipLast7Days ?? "",
      game.bullpen.away.era ?? "",
      escapeStr(game.bullpen.away.usageLast3Days),
      game.bullpen.away.ipLast7Days ?? "",
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
      // Betting lines
      canUseBettingLines ? (game.betting_lines.openingMoneylineHome ?? "") : "",
      canUseBettingLines ? (game.betting_lines.openingMoneylineAway ?? "") : "",
      canUseBettingLines ? (game.betting_lines.currentMoneylineHome ?? "") : "",
      canUseBettingLines ? (game.betting_lines.currentMoneylineAway ?? "") : "",
      canUseBettingLines ? (game.betting_lines.runLineHome ?? "") : "",
      canUseBettingLines ? (game.betting_lines.runLineHomeOdds ?? "") : "",
      canUseBettingLines ? (game.betting_lines.runLineAway ?? "") : "",
      canUseBettingLines ? (game.betting_lines.runLineAwayOdds ?? "") : "",
      canUseBettingLines ? (game.betting_lines.totalRuns ?? "") : "",
      canUseBettingLines ? (game.betting_lines.overOdds ?? "") : "",
      canUseBettingLines ? (game.betting_lines.underOdds ?? "") : "",
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
      game.advanced_pitching?.home?.careerKPctVsTeam ?? "",
      game.advanced_pitching?.home?.last3VsTeamKsAvg ?? "",
      game.advanced_pitching?.home?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.home?.projectedPitchCount ?? "",
      game.advanced_pitching?.home?.battersFacedPerStart ?? "",
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
      game.advanced_pitching?.away?.careerKPctVsTeam ?? "",
      game.advanced_pitching?.away?.last3VsTeamKsAvg ?? "",
      game.advanced_pitching?.away?.last3VsTeamBfAvg ?? "",
      game.advanced_pitching?.away?.projectedPitchCount ?? "",
      game.advanced_pitching?.away?.battersFacedPerStart ?? "",
      // Advanced Offense
      game.advanced_offense?.home?.wOba ?? "",
      game.advanced_offense?.home?.xwOba ?? "",
      game.advanced_offense?.home?.wrcPlus ?? "",
      game.advanced_offense?.home?.iso ?? "",
      game.advanced_offense?.home?.babip ?? "",
      game.advanced_offense?.home?.hardHitPct ?? "",
      game.advanced_offense?.home?.barrelPct ?? "",
      game.advanced_offense?.home?.contactPct ?? "",
      game.advanced_offense?.home?.chasePct ?? "",
      game.advanced_offense?.home?.kPctVsPitchHand ?? "",
      game.advanced_offense?.home?.projectedLineupKPct ?? "",
      game.advanced_offense?.home?.projectedLineupKPct ?? "",
      game.advanced_offense?.home?.projectedLineupContactPctVsHand ?? "",
      game.advanced_offense?.away?.wOba ?? "",
      game.advanced_offense?.away?.xwOba ?? "",
      game.advanced_offense?.away?.wrcPlus ?? "",
      game.advanced_offense?.away?.iso ?? "",
      game.advanced_offense?.away?.babip ?? "",
      game.advanced_offense?.away?.hardHitPct ?? "",
      game.advanced_offense?.away?.barrelPct ?? "",
      game.advanced_offense?.away?.contactPct ?? "",
      game.advanced_offense?.away?.chasePct ?? "",
      game.advanced_offense?.away?.kPctVsPitchHand ?? "",
      game.advanced_offense?.away?.projectedLineupKPct ?? "",
      game.advanced_offense?.away?.projectedLineupKPct ?? "",
      game.advanced_offense?.away?.projectedLineupContactPctVsHand ?? "",
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
      game.model_features?.varMoneyline ?? "",
      game.model_features?.varRunLine ?? "",
      game.model_features?.varTotalRuns ?? "",
      // Results
      game.game_result?.homeScore ?? "",
      game.game_result?.awayScore ?? "",
      escapeStr(game.game_result?.winner),
      escapeStr(game.game_result?.runLineCovered),
      escapeStr(game.game_result?.overUnderResult),
      escapeStr(game.game_result?.gameStatus ?? "Scheduled")
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
          p.totalBasesProp ?? "",
          p.totalBasesPropOverOdds ?? "",
          p.totalBasesPropUnderOdds ?? "",
          escapeStr(p.totalBasesPropBook ?? ""),
          p.totalBasesPropHitRate ?? "",
          escapeStr(p.totalBasesPropHitRateDisplay ?? ""),
          p.last7_hits ?? "",
          p.last7_xbh ?? "",
          p.ops_vs_rhp ?? "",
          p.ops_vs_lhp ?? "",
          p.slg_vs_rhp ?? "",
          p.slg_vs_lhp ?? "",
          p.k_pct_vs_rhp ?? "",
          p.k_pct_vs_lhp ?? "",
          p.contact_pct_vs_rhp ?? "",
          p.contact_pct_vs_lhp ?? "",
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

