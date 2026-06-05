import { MLBGame } from '../types';

export const generateMLBCsvString = (games: MLBGame[]): string => {
  if (!games || games.length === 0) return "";

  const headers = [
    // Metadata
    "game_id", "date", "time", "home_team", "away_team",
    // Targets
    "home_score", "away_score", "winner", "run_line_covered", "over_under_result", "game_status",
    // Starter Pitchers Season
    "home_pitcher_name", "away_pitcher_name",
    "home_pitcher_k_prop", "away_pitcher_k_prop",
    "home_pitcher_era", "away_pitcher_era",
    "home_pitcher_ip", "away_pitcher_ip",
    "home_pitcher_fip", "away_pitcher_fip",
    "home_pitcher_whip", "away_pitcher_whip",
    "home_pitcher_k_pct", "away_pitcher_k_pct",
    "home_pitcher_bb_pct", "away_pitcher_bb_pct",
    "home_pitcher_swstr_pct", "away_pitcher_swstr_pct",
    // Starter Pitchers Last 7
    "home_pitcher_last7_era", "away_pitcher_last7_era",
    "home_pitcher_last7_ip", "away_pitcher_last7_ip",
    "home_pitcher_last7_fip", "away_pitcher_last7_fip",
    "home_pitcher_last7_whip", "away_pitcher_last7_whip",
    "home_pitcher_last7_k_pct", "away_pitcher_last7_k_pct",
    "home_pitcher_last7_bb_pct", "away_pitcher_last7_bb_pct",
    "home_pitcher_last7_swstr_pct", "away_pitcher_last7_swstr_pct",
    // Starter Pitchers Vs Opp
    "home_pitcher_vsopp_era", "away_pitcher_vsopp_era",
    "home_pitcher_vsopp_k_pct", "away_pitcher_vsopp_k_pct",
    "home_pitcher_vsopp_bb_pct", "away_pitcher_vsopp_bb_pct",
    // Bullpen
    "home_bullpen_era", "away_pitcher_bullpen_era", // Typo in var name intentional for consistency? No, away_bullpen_era
    "home_bullpen_ip_last_3d", "away_bullpen_ip_last_3d",
    // Fatigue
    "home_starter_rest_days", "away_starter_rest_days",
    // Offense
    "home_ops", "away_ops",
    "home_woba", "away_woba",
    "home_iso", "away_iso",
    "home_babip", "away_babip",
    "home_lineup_avg_k_pct", "away_lineup_avg_k_pct",
    // Differentials
    "diff_era", "diff_fip", "diff_ops", "diff_bullpen_era", "diff_starter_rest", "diff_bullpen_fatigue",
    // Betting
    "moneyline_home_open", "moneyline_away_open",
    "moneyline_home_current", "moneyline_away_current",
    "total_runs_line"
  ];

  // Fixing a typo in the header array specifically
  headers[headers.indexOf("away_pitcher_bullpen_era")] = "away_bullpen_era";

  const rows = games.map(game => {
    const advHome = game.advanced_pitching?.home;
    const advAway = game.advanced_pitching?.away;
    const last7Home = game.advanced_pitching?.homeLast7;
    const last7Away = game.advanced_pitching?.awayLast7;
    const vsoppHome = game.advanced_pitching?.homeVsOpp;
    const vsoppAway = game.advanced_pitching?.awayVsOpp;

    const safeVal = (val: any) => (val !== undefined && val !== null) ? val : "";

    const homeLineupKPct = game.lineups?.home ? game.lineups.home.reduce((sum, p) => sum + (p.kPct || 0), 0) / (game.lineups.home.filter(p => p.kPct !== undefined).length || 1) : "";
    const awayLineupKPct = game.lineups?.away ? game.lineups.away.reduce((sum, p) => sum + (p.kPct || 0), 0) / (game.lineups.away.filter(p => p.kPct !== undefined).length || 1) : "";

    const row = [
      // Metadata
      game.id, game.metadata.date, game.metadata.time, game.metadata.homeTeam, game.metadata.awayTeam,
      // Targets
      safeVal(game.game_result?.homeScore), safeVal(game.game_result?.awayScore), 
      safeVal(game.game_result?.winner), safeVal(game.game_result?.runLineCovered), 
      safeVal(game.game_result?.overUnderResult), safeVal(game.game_result?.gameStatus),
      
      // Starter Pitchers Season
      safeVal(game.pitchers?.home?.name), safeVal(game.pitchers?.away?.name),
      safeVal(game.pitchers?.home?.strikeoutProp), safeVal(game.pitchers?.away?.strikeoutProp),
      safeVal(game.pitchers?.home?.era), safeVal(game.pitchers?.away?.era),
      safeVal(game.pitchers?.home?.ip), safeVal(game.pitchers?.away?.ip),
      safeVal(advHome?.fip), safeVal(advAway?.fip),
      safeVal(game.pitchers?.home?.whip), safeVal(game.pitchers?.away?.whip),
      safeVal(game.pitchers?.home?.kPct), safeVal(game.pitchers?.away?.kPct),
      safeVal(game.pitchers?.home?.bbPct), safeVal(game.pitchers?.away?.bbPct),
      safeVal(advHome?.swingingStrikePct), safeVal(advAway?.swingingStrikePct),

      // Starter Pitchers Last 7
      safeVal(last7Home?.era), safeVal(last7Away?.era),
      safeVal(last7Home?.ip), safeVal(last7Away?.ip),
      safeVal(last7Home?.fip), safeVal(last7Away?.fip),
      safeVal(last7Home?.whip), safeVal(last7Away?.whip),
      safeVal(last7Home?.strikeoutRate), safeVal(last7Away?.strikeoutRate),
      safeVal(last7Home?.walkRate), safeVal(last7Away?.walkRate),
      safeVal(last7Home?.swingingStrikePct), safeVal(last7Away?.swingingStrikePct),

      // Starter Pitchers Vs Opp
      safeVal(vsoppHome?.era), safeVal(vsoppAway?.era),
      safeVal(vsoppHome?.strikeoutRate), safeVal(vsoppAway?.strikeoutRate),
      safeVal(vsoppHome?.walkRate), safeVal(vsoppAway?.walkRate),

      // Bullpen
      safeVal(game.bullpen?.home?.era), safeVal(game.bullpen?.away?.era),
      safeVal(game.fatigue_metrics?.bullpen?.home?.ipLast3Days), safeVal(game.fatigue_metrics?.bullpen?.away?.ipLast3Days),

      // Fatigue
      safeVal(game.fatigue_metrics?.pitchers?.home?.daysSinceLastStart), safeVal(game.fatigue_metrics?.pitchers?.away?.daysSinceLastStart),

      // Offense
      safeVal(game.offense?.home?.ops), safeVal(game.offense?.away?.ops),
      safeVal(game.advanced_offense?.home?.wOba), safeVal(game.advanced_offense?.away?.wOba),
      safeVal(game.advanced_offense?.home?.iso), safeVal(game.advanced_offense?.away?.iso),
      safeVal(game.advanced_offense?.home?.babip), safeVal(game.advanced_offense?.away?.babip),
      safeVal(homeLineupKPct ? homeLineupKPct.toFixed(2) : ""), safeVal(awayLineupKPct ? awayLineupKPct.toFixed(2) : ""),

      // Differentials
      safeVal(game.model_features?.diffEra), safeVal(game.model_features?.diffFip), 
      safeVal(game.model_features?.diffOps), safeVal(game.model_features?.diffBullpenEra), 
      safeVal(game.model_features?.diffStarterRest), safeVal(game.model_features?.diffBullpenFatigue),

      // Betting
      safeVal(game.betting_lines?.openingMoneylineHome), safeVal(game.betting_lines?.openingMoneylineAway),
      safeVal(game.betting_lines?.currentMoneylineHome), safeVal(game.betting_lines?.currentMoneylineAway),
      safeVal(game.betting_lines?.totalRuns)
    ];

    return row.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
};
