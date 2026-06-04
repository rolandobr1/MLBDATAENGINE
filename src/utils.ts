/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MLBGame } from "./types";

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
    "ofensa_run_g_away",
    "ofensa_ops_away",
    "ofensa_obp_away",
    "ofensa_slg_away",
    "linea_moneyline_open_local",
    "linea_moneyline_curr_local",
    "linea_moneyline_open_away",
    "linea_moneyline_curr_away",
    "total_carreras"
  ];

  const rows = games.map(g => [
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
    g.offense.away.runsPerGame,
    g.offense.away.ops,
    g.offense.away.obp,
    g.offense.away.slg,
    g.betting_lines.openingMoneylineHome,
    g.betting_lines.currentMoneylineHome,
    g.betting_lines.openingMoneylineAway,
    g.betting_lines.currentMoneylineAway,
    g.betting_lines.totalRuns
  ]);

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
    "ofensa_run_g_local", "ofensa_ops_local", "ofensa_obp_local", "ofensa_slg_local",
    "ofensa_run_g_away", "ofensa_ops_away", "ofensa_obp_away", "ofensa_slg_away",
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
    "home_pitcher_xera", "home_pitcher_fip", "home_pitcher_xfip", "home_pitcher_siera", "home_pitcher_hardhit_pct", "home_pitcher_barrel_pct", "home_pitcher_gb_pct", "home_pitcher_fb_pct", "home_pitcher_so_rate", "home_pitcher_bb_rate", "home_pitcher_swstr_pct",
    "away_pitcher_xera", "away_pitcher_fip", "away_pitcher_xfip", "away_pitcher_siera", "away_pitcher_hardhit_pct", "away_pitcher_barrel_pct", "away_pitcher_gb_pct", "away_pitcher_fb_pct", "away_pitcher_so_rate", "away_pitcher_bb_rate", "away_pitcher_swstr_pct",
    // Advanced Offense
    "home_offense_woba", "home_offense_xwoba", "home_offense_wrcplus", "home_offense_iso", "home_offense_babip", "home_offense_hardhit_pct", "home_offense_barrel_pct", "home_offense_contact_pct", "home_offense_chase_pct",
    "away_offense_woba", "away_offense_xwoba", "away_offense_wrcplus", "away_offense_iso", "away_offense_babip", "away_offense_hardhit_pct", "away_offense_barrel_pct", "away_offense_contact_pct", "away_offense_chase_pct",
    // Model Features
    "diff_era", "diff_xera", "diff_fip", "diff_ops", "diff_wrcplus", "diff_bullpen_era", "diff_runs_per_game", "diff_record_last10", "diff_record_home_away", "diff_starter_rest", "diff_bullpen_fatigue", "var_moneyline", "var_runline", "var_totalruns",
    // Game Results / ML Target Labels
    "resultado_carreras_local", "resultado_carreras_visitante", "resultado_ganador", "resultado_runline_cubierto", "resultado_overunder", "resultado_estado"
  ];

  const escapeStr = (val: any) => {
    if (val === undefined || val === null) return "";
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

    return [
      // Metadata
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
      g.offense.away.runsPerGame ?? "",
      g.offense.away.ops ?? "",
      g.offense.away.obp ?? "",
      g.offense.away.slg ?? "",
      // Betting lines
      g.betting_lines.openingMoneylineHome ?? "",
      g.betting_lines.openingMoneylineAway ?? "",
      g.betting_lines.currentMoneylineHome ?? "",
      g.betting_lines.currentMoneylineAway ?? "",
      g.betting_lines.runLineHome ?? "",
      g.betting_lines.runLineHomeOdds ?? "",
      g.betting_lines.runLineAway ?? "",
      g.betting_lines.runLineAwayOdds ?? "",
      g.betting_lines.totalRuns ?? "",
      g.betting_lines.overOdds ?? "",
      g.betting_lines.underOdds ?? "",
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
      g.advanced_offense?.away?.wOba ?? "",
      g.advanced_offense?.away?.xwOba ?? "",
      g.advanced_offense?.away?.wrcPlus ?? "",
      g.advanced_offense?.away?.iso ?? "",
      g.advanced_offense?.away?.babip ?? "",
      g.advanced_offense?.away?.hardHitPct ?? "",
      g.advanced_offense?.away?.barrelPct ?? "",
      g.advanced_offense?.away?.contactPct ?? "",
      g.advanced_offense?.away?.chasePct ?? "",
      // Model Features
      g.model_features?.diffEra ?? "",
      g.model_features?.diffXera ?? "",
      g.model_features?.diffFip ?? "",
      g.model_features?.diffOps ?? "",
      g.model_features?.diffWrcPlus ?? "",
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

