/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Types for MLB Analytics Engine

export interface GameMetadata {
  id: string; // game_id
  date: string; // date YYYY-MM-DD
  time: string; // game time
  homeTeam: string;
  awayTeam: string;
  venue: string;
}

export interface PitcherStats {
  name: string;
  era: number | string;
  whip: number | string;
  kPct: number | string; // K%
  bbPct: number | string; // BB%
  wins: number | string;
  losses: number | string;
  ip: string;
  starts?: number | string;
  totalStrikeouts?: number | string;
  totalWalks?: number | string;
  strikeoutProp?: number | null; // e.g. 5.5
  strikeoutPropOverOdds?: number | null; // e.g. -110
  strikeoutPropUnderOdds?: number | null; // e.g. -120
  strikeoutPropSource?: string | null;
  pitchHand?: string; // "L" or "R"
  pitcher_allowed_avg_vs_lhb?: number;
  pitcher_allowed_avg_vs_rhb?: number;
  pitcher_allowed_slg_vs_lhb?: number;
  pitcher_allowed_slg_vs_rhb?: number;
}

export interface BullpenStats {
  era: number | string;
  usageLast3Days: string; // e.g. "Alta", "Moderada", "Baja"
  availableRelievers: string[]; // List of names
  ipLast3Days: number | string; // Innings pitched last 3 days
  ipLast7Days?: number | string; // Innings pitched last 7 days
}

export interface OffenseStats {
  runsPerGame: number | string;
  strikeoutsPerGame?: number | string | null;
  ops: number | string;
  obp: number | string;
  slg: number | string;
}

export interface TeamTrend {
  recordLast10: string; // e.g. "6-4"
  recordHome: string; // e.g., "15-10"
  recordAway: string; // e.g., "12-14"
}

export interface BettingLines {
  openingMoneylineHome: number | null;
  openingMoneylineAway: number | null;
  currentMoneylineHome: number | null;
  currentMoneylineAway: number | null;
  runLineHome: number | null; // e.g., -1.5
  runLineHomeOdds: number | null; // e.g. +110
  runLineAway: number | null; // e.g., +1.5
  runLineAwayOdds: number | null; // e.g. -130
  totalRuns: number | null; // Over/Under limit, e.g. 8.5
  overOdds: number | null;
  underOdds: number | null;
  lineSource?: string | null;
  lineMovementSummary: string; // e.g., "Uptrend on Home"
}

// Predictions interface removed (app is data capture only)

export interface WeatherData {
  temp: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  pressure: number;
  rainProbability: number;
  skyStatus: string;
  apparentTemp: number;
  timestamp: string;
}

export interface LineMovement {
  timestamp: string;
  openingMoneylineHome: number | null;
  openingMoneylineAway: number | null;
  currentMoneylineHome: number | null;
  currentMoneylineAway: number | null;
  runLineHome: number | null;
  runLineHomeOdds: number | null;
  runLineAway: number | null;
  runLineAwayOdds: number | null;
  totalRuns: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

export interface SplitsStats {
  avg: number;
  ops: number;
  obp: number;
  slg: number;
  runsPerGame: number;
  hr: number;
}

export interface OffensiveSplits {
  home: {
    vsRhp: SplitsStats;
    vsLhp: SplitsStats;
  };
  away: {
    vsRhp: SplitsStats;
    vsLhp: SplitsStats;
  };
}

export interface FatigueMetrics {
  pitchers: {
    home: {
      daysSinceLastStart: number;
      pitchesLastStart: number;
      pitchesLast3Starts: number;
    };
    away: {
      daysSinceLastStart: number;
      pitchesLastStart: number;
      pitchesLast3Starts: number;
    };
  };
  bullpen: {
    home: {
      ipLast3Days: number | string;
      ipLast7Days: number | string;
      relieversUsedYesterday: number | string;
      relieversUsedLast2Days: number | string;
      availableCount: number | string;
    };
    away: {
      ipLast3Days: number | string;
      ipLast7Days: number | string;
      relieversUsedYesterday: number | string;
      relieversUsedLast2Days: number | string;
      availableCount: number | string;
    };
  };
}

export interface AdvancedPitchingStats {
  xEra?: number | null;
  fip: number | null;
  xFip?: number | null;
  siera?: number | null;
  hardHitPct?: number | null;
  barrelPct?: number | null;
  groundBallPct: number | null;
  flyBallPct: number | null;
  strikeoutRate: number | null;
  walkRate: number | null;
  swingingStrikePct?: number | null;
  cswPct?: number | null;
  projectedPitchCount?: number | null;
  battersFacedPerStart?: number | null;
  actualStrikeouts?: number | null;
  last5KsAvg?: number | null;
  last5KsStd?: number | null;
  last5IpAvg?: number | null;
  last5BfAvg?: number | null;
  last5PitchCountAvg?: number | null;
  last3Ks1?: number | null;
  last3Ks2?: number | null;
  last3Ks3?: number | null;
  last3Ip1?: number | null;
  last3Ip2?: number | null;
  last3Ip3?: number | null;
  last3Bf1?: number | null;
  last3Bf2?: number | null;
  last3Bf3?: number | null;
  careerKPctVsTeam?: number | null;
  last3VsTeamKsAvg?: number | null;
  last3VsTeamBfAvg?: number | null;
  era?: string | number | null;
  whip?: string | number | null;
  ip?: string | null;
  wins?: number | null;
  losses?: number | null;
  // Pitch Arsenal
  fastballPct?: number | null;
  sliderPct?: number | null;
  curvePct?: number | null;
  changeupPct?: number | null;
  splitterPct?: number | null;

  // Vortex V10.3 Metrics
  pitcher_pitches_per_bf_last5?: number | null;
  pitcher_pitches_per_ip_last5?: number | null;
  pitcher_avg_pitches_last3?: number | null;
  pitcher_rest_status?: string | null;
  pitcher_primary_pitch?: string | null;
  pitcher_primary_pitch_usage_pct?: number | null;
  pitcher_secondary_pitch?: string | null;
  pitcher_secondary_pitch_usage_pct?: number | null;

  // Catcher
  catcherName?: string | null;
  catcherFramingRuns?: number | null;
}

export interface AdvancedPitching {
  home: AdvancedPitchingStats;
  away: AdvancedPitchingStats;
  homeLast7?: AdvancedPitchingStats;
  awayLast7?: AdvancedPitchingStats;
  homeVsOpp?: AdvancedPitchingStats;
  awayVsOpp?: AdvancedPitchingStats;
}

export interface AdvancedOffenseStats {
  wOba: number | null;
  xwOba?: number | null;
  wrcPlus?: number | null;
  iso: number | null;
  babip: number | null;
  hardHitPct?: number | null;
  barrelPct?: number | null;
  contactPct?: number | null;
  chasePct?: number | null;
  kPctVsPitchHand?: number | null;
  projectedLineupKPct?: number | null;
  projectedLineupContactPctVsHand?: number | null;
  projectedLineupWhiffPctVsHand?: number | null;
  // Whiff Pct by Pitch Type (Lineup Average)
  whiffPctVsFastball?: number | null;
  whiffPctVsSlider?: number | null;
  whiffPctVsCurve?: number | null;
  whiffPctVsChangeup?: number | null;
  whiffPctVsSplitter?: number | null;
  
  // Vortex V10.3 Lineup Scores
  lineup_contact_stress_score?: number | null;
  lineup_pitch_count_risk_score?: number | null;
  lineup_low_k_batters_count?: number | null;
  lineup_high_babip_batters_count?: number | null;
  lineup_high_hardhit_batters_count?: number | null;
}

export interface AdvancedOffense {
  home: AdvancedOffenseStats;
  away: AdvancedOffenseStats;
}

export interface ModelFeatures {
  diffEra: number;
  diffXera: number;
  diffFip: number;
  diffOps: number;
  diffXwoba: number;     // Reemplaza diffWrcPlus — usa xwOBA de Baseball Savant
  diffBullpenEra: number;
  diffRunsPerGame: number;
  diffRecordLast10: number;
  diffRecordHomeAway: number;
  diffStarterRest: number;
  diffBullpenFatigue: number;
  varMoneyline: number;
  varRunLine: number;
  varTotalRuns: number;
}

export interface MLGameResult {
  homeScore: number;
  awayScore: number;
  winner: "home" | "away" | "tie" | "none";
  runLineCovered: "home" | "away" | "push";
  overUnderResult: "over" | "under" | "push";
  gameStatus: string;
}

export interface InjuryReport {
  team: string;
  player: string;
  status: string; // e.g., "IL-15", "Day-to-day"
  detail: string;
}

export interface BatterStats {
  name: string;
  position: string; // e.g., "DH", "CF", "1B"
  avg: number;
  ops: number;
  hr: number;
  rbi: number;
  kPct?: number;

  // Temporada
  player_name?: string;
  team?: string;
  bat_side?: string;
  obp?: number;
  slg?: number;
  woba?: number | null;
  iso?: number | null;
  pa?: number;
  hits?: number;
  doubles?: number;
  triples?: number;
  home_runs?: number;
  strikeout_pct?: number;
  walk_pct?: number;

  // Últimos 7 días
  last7_avg?: number;
  last7_ops?: number;
  last7_slg?: number;
  last7_total_bases?: number;
  last7_hits?: number;
  last7_xbh?: number;
  totalBasesProp?: number | null;
  totalBasesPropOverOdds?: number | null;
  totalBasesPropUnderOdds?: number | null;
  totalBasesPropBook?: string | null;
  totalBasesPropSource?: string | null;
  totalBasesPropHitRate?: number | null;
  totalBasesPropHitRateDisplay?: string | null;

  // Nuevos campos
  batting_order?: number;
  ops_vs_rhp?: number;
  ops_vs_lhp?: number;
  slg_vs_rhp?: number;
  slg_vs_lhp?: number;
  k_pct_vs_rhp?: number;
  k_pct_vs_lhp?: number;
  contact_pct_vs_rhp?: number | null;
  contact_pct_vs_lhp?: number | null;
  whiff_pct?: number | null;
  chase_pct?: number | null;
  batter_contact_stress_score?: number | null;
}

export interface InningScore {
  num: number;
  home: { runs: number; hits: number; errors: number };
  away: { runs: number; hits: number; errors: number };
}

export interface Linescore {
  innings: InningScore[];
  homeTotals: { runs: number; hits: number; errors: number };
  awayTotals: { runs: number; hits: number; errors: number };
  currentInning?: number;
  currentInningOrdinal?: string;
  inningState?: string;
  inningHalf?: string;
  isTopInning?: boolean;
  balls?: number;
  strikes?: number;
  outs?: number;
  defense?: {
    pitcher?: { id: number; fullName: string };
  };
  offense?: {
    batter?: { id: number; fullName: string };
    first?: { id: number; fullName: string };
    second?: { id: number; fullName: string };
    third?: { id: number; fullName: string };
  };
}

export interface LivePlayerStats {
  name: string;
  position: string;
  // Batting
  ab?: number;
  r?: number;
  h?: number;
  rbi?: number;
  bb?: number;
  k?: number;
  doubles?: number;
  triples?: number;
  home_runs?: number;
  total_bases?: number;
  // Pitching
  ip?: string; // e.g. "5.1"
  er?: number;
  pitches?: number;
}

export interface LiveBoxscore {
  home: {
    batters: LivePlayerStats[];
    pitchers: LivePlayerStats[];
  };
  away: {
    batters: LivePlayerStats[];
    pitchers: LivePlayerStats[];
  };
}

export interface PlayByPlayEvent {
  description: string;
  inning: string;
  score: string; // e.g. "2 - 1"
  isScoringPlay: boolean;
}

export interface PlayByPlay {
  scoringPlays: PlayByPlayEvent[];
  currentPlay?: PlayByPlayEvent;
  allPlays?: PlayByPlayEvent[];
}

export interface MLBGame {
  id: string; // game_id
  metadata: GameMetadata;
  teams: {
    home: string;
    away: string;
  };
  pitchers: {
    home: PitcherStats;
    away: PitcherStats;
  };
  bullpen: {
    home: BullpenStats;
    away: BullpenStats;
  };
  offense: {
    home: OffenseStats;
    away: OffenseStats;
  };
  trends: {
    home: TeamTrend;
    away: TeamTrend;
  };
  betting_lines: BettingLines;
  injuries: InjuryReport[];
  lineups: {
    home: BatterStats[];
    away: BatterStats[];
    lineup_confirmed?: boolean;
    lineup_source?: string;
    lineup_updated_at?: string;
  };
  timestamp: string; // ISO string
  weather?: WeatherData;
  line_movements?: LineMovement[];
  offensive_splits?: OffensiveSplits;
  fatigue_metrics?: FatigueMetrics;
  advanced_pitching?: AdvancedPitching;
  advanced_offense?: AdvancedOffense;
  model_features?: ModelFeatures;
  game_result?: MLGameResult;
  linescore?: Linescore;
  liveBoxscore?: LiveBoxscore;
  playByPlay?: PlayByPlay;
}

export interface LoggedError {
  id: string;
  timestamp: string;
  gameId?: string;
  source: string; // "Harvester" | "Validator" | "Firestore" | "Sheets"
  message: string;
  severity: "low" | "medium" | "high";
}

export interface HarvestResponse {
  games: MLBGame[];
  errors: LoggedError[];
  timestamp: string;
}
