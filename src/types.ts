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
  strikeoutProp?: number | null; // e.g. 5.5
  strikeoutPropOverOdds?: number | null; // e.g. -110
  strikeoutPropUnderOdds?: number | null; // e.g. -120
}

export interface BullpenStats {
  era: number | string;
  usageLast3Days: string; // e.g. "Alta", "Moderada", "Baja"
  availableRelievers: string[]; // List of names
  ipLast3Days: number | string; // Innings pitched last 3 days
}

export interface OffenseStats {
  runsPerGame: number | string;
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
  openingMoneylineHome: number;
  openingMoneylineAway: number;
  currentMoneylineHome: number;
  currentMoneylineAway: number;
  runLineHome: number; // e.g., -1.5
  runLineHomeOdds: number; // e.g. +110
  runLineAway: number; // e.g., +1.5
  runLineAwayOdds: number; // e.g. -130
  totalRuns: number; // Over/Under limit, e.g. 8.5
  overOdds: number;
  underOdds: number;
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
  openingMoneylineHome: number;
  openingMoneylineAway: number;
  currentMoneylineHome: number;
  currentMoneylineAway: number;
  runLineHome: number;
  runLineHomeOdds: number;
  runLineAway: number;
  runLineAwayOdds: number;
  totalRuns: number;
  overOdds: number;
  underOdds: number;
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
  era?: string | number | null;
  whip?: string | number | null;
  ip?: string | null;
  wins?: number | null;
  losses?: number | null;
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
  diffWrcPlus: number;
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
