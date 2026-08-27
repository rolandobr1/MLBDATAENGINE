import { MLBGame } from "../types";
import { PregameSnapshot, getPregameSnapshotsForGames } from "./pregameSnapshots";

type Row = Record<string, string | number | null>;

const FINAL_STATUSES = ["final", "game over", "completed early", "completed"];

function isFinal(game: any): boolean {
  const status = String(game?.game_result?.gameStatus || "").toLowerCase();
  return FINAL_STATUSES.some(value => status.includes(value));
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: Row[]): string {
  return [headers.join(","), ...rows.map(row => headers.map(header => csvValue(row[header])).join(","))].join("\n");
}

function gameId(game: any): string {
  return String(game?.id || game?.metadata?.id || "");
}

function pitcherId(pitcher: any): string | null {
  const value = pitcher?.pitcherId ?? pitcher?.mlbId ?? pitcher?.id;
  if (value === null || value === undefined || value === "" || Number(value) <= 0) return null;
  return String(value);
}

function validPitcher(pitcher: any): boolean {
  const name = String(pitcher?.name || "").trim().toLowerCase();
  return Boolean(pitcherId(pitcher)) && name !== "" && name !== "tbd" && name !== "por definir";
}

function sideOpponent(side: "home" | "away"): "home" | "away" {
  return side === "home" ? "away" : "home";
}

function actualPitcherTarget(current: any, side: "home" | "away", expectedPitcherId: string) {
  const box = current?.boxscore_stats?.[side];
  const pitching = current?.advanced_pitching?.[side];
  const finalPitcherId = pitcherId(current?.pitchers?.[side]) ?? pitcherId({ id: box?.playerId });
  const idMatches = finalPitcherId === expectedPitcherId;
  return {
    actual_k: isFinal(current) && idMatches ? (box?.strikeOuts ?? pitching?.actualStrikeouts ?? null) : null,
    actual_ip: isFinal(current) && idMatches ? (box?.inningsPitched ?? null) : null,
    actual_bf: isFinal(current) && idMatches ? (box?.battersFaced ?? null) : null,
    actual_pitches: isFinal(current) && idMatches ? (box?.numberOfPitches ?? null) : null,
    actual_er: isFinal(current) && idMatches ? (box?.earnedRuns ?? null) : null,
    final_game_status: isFinal(current) && idMatches ? (current?.game_result?.gameStatus ?? null) : null,
  };
}

function snapshotPairs(games: MLBGame[]) {
  const snapshots = getPregameSnapshotsForGames(games);
  return games.flatMap(current => {
    const snapshot = snapshots.get(gameId(current));
    return snapshot ? [{ current: current as any, snapshot }] : [];
  });
}

const PITCHER_HEADERS = [
  "game_id", "pitcher_id", "side", "snapshot_captured_at", "game_date", "scheduled_time", "team", "opponent", "venue",
  "pitcher_era", "pitcher_whip", "pitcher_k_pct", "pitcher_bb_pct", "pitcher_ip", "pitcher_starts", "pitcher_total_strikeouts", "pitcher_pitch_hand",
  "opponent_lineup_k_pct", "opponent_lineup_contact_pct", "opponent_offense_ops", "opponent_offense_woba", "opponent_offense_xwoba",
  "pitcher_xera", "pitcher_fip", "pitcher_xfip", "pitcher_siera", "pitcher_so_rate", "pitcher_bb_rate", "pitcher_swstr_pct", "pitcher_csw_pct",
  "pitcher_last5_ks_avg", "pitcher_last5_ip_avg", "pitcher_last5_bf_avg", "pitcher_last5_pitch_count_avg", "projected_pitches", "projected_innings", "projected_strikeouts",
  "days_since_last_start", "pitches_last_start", "pitches_last_3_starts", "park_factor_k", "weather_temp", "weather_wind_speed",
  "actual_k", "actual_ip", "actual_bf", "actual_pitches", "actual_er", "final_game_status"
];

export function buildPitcherGameRows(games: MLBGame[]): Row[] {
  const keys = new Set<string>();
  const rows: Row[] = [];
  for (const { current, snapshot } of snapshotPairs(games)) {
    const pregame: any = snapshot.game;
    for (const side of ["home", "away"] as const) {
      const pitcher = pregame?.pitchers?.[side];
      if (!validPitcher(pitcher)) continue;
      const id = pitcherId(pitcher)!;
      const key = `${gameId(current)}:${id}`;
      if (keys.has(key)) continue;
      keys.add(key);
      const opponent = sideOpponent(side);
      const adv = pregame?.advanced_pitching?.[side] || {};
      const oppOffense = pregame?.advanced_offense?.[opponent] || {};
      const fatigue = pregame?.fatigue_metrics?.pitchers?.[side] || {};
      rows.push({
        game_id: gameId(current), pitcher_id: id, side, snapshot_captured_at: snapshot.capturedAt,
        game_date: pregame.metadata?.date ?? null, scheduled_time: pregame.metadata?.time ?? null,
        team: pregame.metadata?.[side === "home" ? "homeTeam" : "awayTeam"] ?? null,
        opponent: pregame.metadata?.[opponent === "home" ? "homeTeam" : "awayTeam"] ?? null, venue: pregame.metadata?.venue ?? null,
        pitcher_era: pitcher.era ?? null, pitcher_whip: pitcher.whip ?? null, pitcher_k_pct: pitcher.kPct ?? null, pitcher_bb_pct: pitcher.bbPct ?? null,
        pitcher_ip: pitcher.ip ?? null, pitcher_starts: pitcher.starts ?? null, pitcher_total_strikeouts: pitcher.totalStrikeouts ?? null, pitcher_pitch_hand: pitcher.pitchHand ?? null,
        opponent_lineup_k_pct: oppOffense.projectedLineupKPct ?? null, opponent_lineup_contact_pct: oppOffense.projectedLineupContactPctVsHand ?? null,
        opponent_offense_ops: pregame.offense?.[opponent]?.ops ?? null, opponent_offense_woba: oppOffense.wOba ?? null, opponent_offense_xwoba: oppOffense.xwOba ?? null,
        pitcher_xera: adv.xEra ?? null, pitcher_fip: adv.fip ?? null, pitcher_xfip: adv.xFip ?? null, pitcher_siera: adv.siera ?? null,
        pitcher_so_rate: adv.strikeoutRate ?? null, pitcher_bb_rate: adv.walkRate ?? null, pitcher_swstr_pct: adv.swingingStrikePct ?? null, pitcher_csw_pct: adv.cswPct ?? null,
        pitcher_last5_ks_avg: adv.last5KsAvg ?? null, pitcher_last5_ip_avg: adv.last5IpAvg ?? null, pitcher_last5_bf_avg: adv.last5BfAvg ?? null,
        pitcher_last5_pitch_count_avg: adv.last5PitchCountAvg ?? null, projected_pitches: adv.projectedPitchCount ?? null,
        projected_innings: adv.projectedInnings ?? null, projected_strikeouts: adv.projectedStrikeoutsBase ?? null,
        days_since_last_start: fatigue.daysSinceLastStart ?? null, pitches_last_start: fatigue.pitchesLastStart ?? null, pitches_last_3_starts: fatigue.pitchesLast3Starts ?? null,
        park_factor_k: pregame.park_factors?.index_so ?? null, weather_temp: pregame.weather?.temp ?? null, weather_wind_speed: pregame.weather?.windSpeed ?? null,
        ...actualPitcherTarget(current, side, id),
      });
    }
  }
  return rows;
}

const GAME_HEADERS = [
  "game_id", "snapshot_captured_at", "game_date", "scheduled_time", "home_team", "away_team", "venue", "park_factor_k", "park_factor_runs", "park_factor_hr",
  "weather_temp", "weather_humidity", "weather_wind_speed", "weather_rain_probability", "home_moneyline", "away_moneyline", "total_runs",
  "home_pitcher_id", "away_pitcher_id", "home_projected_lineup_k_pct", "away_projected_lineup_k_pct", "home_bullpen_ip_3d", "away_bullpen_ip_3d",
  "home_score", "away_score", "winner", "final_game_status"
];

export function buildGameRows(games: MLBGame[]): Row[] {
  return snapshotPairs(games).map(({ current, snapshot }) => {
    const game: any = snapshot.game;
    return {
      game_id: gameId(current), snapshot_captured_at: snapshot.capturedAt, game_date: game.metadata?.date ?? null, scheduled_time: game.metadata?.time ?? null,
      home_team: game.metadata?.homeTeam ?? null, away_team: game.metadata?.awayTeam ?? null, venue: game.metadata?.venue ?? null,
      park_factor_k: game.park_factors?.index_so ?? null, park_factor_runs: game.park_factors?.index_runs ?? null, park_factor_hr: game.park_factors?.index_hr ?? null,
      weather_temp: game.weather?.temp ?? null, weather_humidity: game.weather?.humidity ?? null, weather_wind_speed: game.weather?.windSpeed ?? null, weather_rain_probability: game.weather?.rainProbability ?? null,
      home_moneyline: game.betting_lines?.currentMoneylineHome ?? null, away_moneyline: game.betting_lines?.currentMoneylineAway ?? null, total_runs: game.betting_lines?.totalRuns ?? null,
      home_pitcher_id: pitcherId(game.pitchers?.home), away_pitcher_id: pitcherId(game.pitchers?.away),
      home_projected_lineup_k_pct: game.advanced_offense?.home?.projectedLineupKPct ?? null, away_projected_lineup_k_pct: game.advanced_offense?.away?.projectedLineupKPct ?? null,
      home_bullpen_ip_3d: game.fatigue_metrics?.bullpen?.home?.ipLast3Days ?? null, away_bullpen_ip_3d: game.fatigue_metrics?.bullpen?.away?.ipLast3Days ?? null,
      home_score: isFinal(current) ? current.game_result?.homeScore ?? null : null, away_score: isFinal(current) ? current.game_result?.awayScore ?? null : null,
      winner: isFinal(current) ? current.game_result?.winner ?? null : null, final_game_status: isFinal(current) ? current.game_result?.gameStatus ?? null : null,
    };
  });
}

const BATTER_HEADERS = [
  "game_id", "batter_id", "side", "snapshot_captured_at", "game_date", "team", "opponent", "batting_order", "position", "bat_side",
  "opposing_pitcher_id", "avg", "obp", "slg", "ops", "woba", "iso", "pa", "home_runs", "strikeout_pct", "walk_pct",
  "last7_avg", "last7_ops", "last7_slg", "last7_total_bases", "ops_vs_rhp", "ops_vs_lhp", "k_pct_vs_rhp", "k_pct_vs_lhp", "contact_pct_vs_rhp", "contact_pct_vs_lhp",
  "actual_hits", "actual_runs", "actual_rbi", "actual_strikeouts", "actual_total_bases", "final_game_status"
];

function liveBatterTarget(current: any, side: "home" | "away", id: string) {
  if (!isFinal(current)) return {};
  const player = (current.liveBoxscore?.[side]?.batters || []).find((b: any) => String(b.id) === id);
  return {
    actual_hits: player?.h ?? null, actual_runs: player?.r ?? null, actual_rbi: player?.rbi ?? null,
    actual_strikeouts: player?.k ?? null, actual_total_bases: player?.total_bases ?? null,
  };
}

export function buildBatterGameRows(games: MLBGame[]): Row[] {
  const keys = new Set<string>();
  const rows: Row[] = [];
  for (const { current, snapshot } of snapshotPairs(games)) {
    const game: any = snapshot.game;
    for (const side of ["home", "away"] as const) {
      const opponent = sideOpponent(side);
      const opponentPitcherId = pitcherId(game.pitchers?.[opponent]);
      for (const batter of game.lineups?.[side] || []) {
        const id = batter?.id ?? batter?.mlbId ?? batter?.batter_id;
        if (!id || Number(id) <= 0) continue;
        const key = `${gameId(current)}:${id}`;
        if (keys.has(key)) continue;
        keys.add(key);
        rows.push({
          game_id: gameId(current), batter_id: String(id), side, snapshot_captured_at: snapshot.capturedAt, game_date: game.metadata?.date ?? null,
          team: game.metadata?.[side === "home" ? "homeTeam" : "awayTeam"] ?? null, opponent: game.metadata?.[opponent === "home" ? "homeTeam" : "awayTeam"] ?? null,
          batting_order: batter.batting_order ?? null, position: batter.position ?? null, bat_side: batter.bat_side ?? null, opposing_pitcher_id: opponentPitcherId,
          avg: batter.avg ?? null, obp: batter.obp ?? null, slg: batter.slg ?? null, ops: batter.ops ?? null, woba: batter.woba ?? null, iso: batter.iso ?? null,
          pa: batter.pa ?? null, home_runs: batter.home_runs ?? batter.hr ?? null, strikeout_pct: batter.strikeout_pct ?? batter.kPct ?? null, walk_pct: batter.walk_pct ?? null,
          last7_avg: batter.last7_avg ?? null, last7_ops: batter.last7_ops ?? null, last7_slg: batter.last7_slg ?? null, last7_total_bases: batter.last7_total_bases ?? null,
          ops_vs_rhp: batter.ops_vs_rhp ?? null, ops_vs_lhp: batter.ops_vs_lhp ?? null, k_pct_vs_rhp: batter.k_pct_vs_rhp ?? null, k_pct_vs_lhp: batter.k_pct_vs_lhp ?? null,
          contact_pct_vs_rhp: batter.contact_pct_vs_rhp ?? null, contact_pct_vs_lhp: batter.contact_pct_vs_lhp ?? null,
          ...liveBatterTarget(current, side, String(id)), final_game_status: isFinal(current) ? current.game_result?.gameStatus ?? null : null,
        });
      }
    }
  }
  return rows;
}

const PROPS_HEADERS = ["game_id", "pitcher_id", "side", "game_date", "team", "prop_line", "over_odds", "under_odds", "sportsbook", "source", "timestamp"];

export function buildPitcherPropsRows(games: MLBGame[]): Row[] {
  const keys = new Set<string>();
  const rows: Row[] = [];
  for (const { current, snapshot } of snapshotPairs(games)) {
    const game: any = snapshot.game;
    for (const side of ["home", "away"] as const) {
      const pitcher = game.pitchers?.[side];
      if (!validPitcher(pitcher) || pitcher.strikeoutProp === null || pitcher.strikeoutProp === undefined) continue;
      const id = pitcherId(pitcher)!;
      const key = `${gameId(current)}:${id}`;
      if (keys.has(key)) continue;
      keys.add(key);
      rows.push({
        game_id: gameId(current), pitcher_id: id, side, game_date: game.metadata?.date ?? null,
        team: game.metadata?.[side === "home" ? "homeTeam" : "awayTeam"] ?? null, prop_line: pitcher.strikeoutProp,
        over_odds: pitcher.strikeoutPropOverOdds ?? null, under_odds: pitcher.strikeoutPropUnderOdds ?? null,
        sportsbook: pitcher.strikeoutPropBook ?? null, source: pitcher.strikeoutPropSource ?? null, timestamp: snapshot.capturedAt,
      });
    }
  }
  return rows;
}

export const generatePitcherGameDatasetCSV = (games: MLBGame[]) => toCsv(PITCHER_HEADERS, buildPitcherGameRows(games));
export const generateGameDatasetCSV = (games: MLBGame[]) => toCsv(GAME_HEADERS, buildGameRows(games));
export const generateBatterGameDatasetCSV = (games: MLBGame[]) => toCsv(BATTER_HEADERS, buildBatterGameRows(games));
export const generatePitcherPropsDatasetCSV = (games: MLBGame[]) => toCsv(PROPS_HEADERS, buildPitcherPropsRows(games));
