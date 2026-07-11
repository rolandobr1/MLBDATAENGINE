/**
 * mlbBoxscorePitcherExtractor.ts
 *
 * For COMPLETED games (Final / Game Over), pulls real starting pitcher stats
 * from the MLB API boxscore endpoint.
 *
 * These stats (IP, BF, Hits, ER, K, BB, Pitches, HR) reflect what actually
 * happened in the game — not season totals. The `strikeOuts` field here is
 * the source of truth for `home_pitcher_actual_ks`.
 *
 * Source: GET /api/v1/game/{gamePk}/boxscore
 */

import axios from 'axios';

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

// In-memory cache per game (cleared each run)
const boxscoreCache = new Map<string, any>();

export interface StarterGameStats {
  playerId: number | null;
  name: string | null;
  /** Innings pitched in this game (e.g. "6.1") */
  inningsPitched: string | null;
  /** Batters faced in this game */
  battersFaced: number | null;
  /** Hits allowed in this game */
  hitsAllowed: number | null;
  /** Runs allowed in this game */
  runsAllowed: number | null;
  /** Earned runs allowed in this game */
  earnedRuns: number | null;
  /** Strikeouts in this game — feeds home_pitcher_actual_ks */
  strikeOuts: number | null;
  /** Walks (base on balls) in this game */
  baseOnBalls: number | null;
  /** Total pitches thrown in this game */
  numberOfPitches: number | null;
  /** Home runs allowed in this game */
  homeRunsAllowed: number | null;
  /** Game score (Bill James formula) */
  gameScore: number | null;
}

export interface BoxscorePitcherStats {
  home: StarterGameStats | null;
  away: StarterGameStats | null;
}

function n(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const parsed = parseInt(String(val), 10);
  return isNaN(parsed) ? null : parsed;
}

function calcGameScore(
  ip: string | null,
  k: number | null,
  bb: number | null,
  hits: number | null,
  er: number | null,
  hr: number | null
): number | null {
  if (!ip || k === null || bb === null || hits === null || er === null || hr === null) return null;
  // Bill James Game Score: 50 + (3 * outs) + (2 * innings over 4) + K - (2 * H) - (4 * ER) - (2 * BB) - HR
  const parts = String(ip).split('.');
  const outs = parseInt(parts[0], 10) * 3 + parseInt(parts[1] || '0', 10);
  const score = 50 + (3 * outs) + k - (2 * hits) - (4 * er) - (2 * bb) - hr;
  return Math.round(score);
}

function extractStarterStats(teamData: any, allPlayers: any): StarterGameStats | null {
  const pitcherIds: number[] = teamData?.pitchers ?? [];
  if (!pitcherIds.length) return null;

  // First pitcher listed is typically the starter
  const starterId = pitcherIds[0];
  const playerKey = `ID${starterId}`;
  const playerData = allPlayers?.[playerKey];

  if (!playerData) return null;

  const stats = playerData?.stats?.pitching ?? {};
  const name: string = playerData?.person?.fullName ?? null;
  const ip   = stats.inningsPitched ?? null;
  const bf   = n(stats.battersFaced);
  const hits = n(stats.hits);
  const runs = n(stats.runs);
  const er   = n(stats.earnedRuns);
  const k    = n(stats.strikeOuts);
  const bb   = n(stats.baseOnBalls);
  const pitches = n(stats.numberOfPitches);
  const hr   = n(stats.homeRuns);

  return {
    playerId: starterId,
    name,
    inningsPitched: ip,
    battersFaced: bf,
    hitsAllowed: hits,
    runsAllowed: runs,
    earnedRuns: er,
    strikeOuts: k,
    baseOnBalls: bb,
    numberOfPitches: pitches,
    homeRunsAllowed: hr,
    gameScore: calcGameScore(ip, k, bb, hits, er, hr),
  };
}

/**
 * Fetches boxscore for a completed game and returns the starting pitcher stats
 * for both home and away teams.
 *
 * Returns null for either side if the game is not yet final or data is missing.
 *
 * @param gamePk  MLB game primary key (numeric game ID)
 */
export async function getStarterBoxscoreStats(gamePk: number | string): Promise<BoxscorePitcherStats> {
  const key = String(gamePk);

  if (boxscoreCache.has(key)) {
    return boxscoreCache.get(key)!;
  }

  try {
    const res = await axios.get(`${MLB_API_BASE}/game/${gamePk}/boxscore`, {
      timeout: 10000,
    });

    const boxscore = res.data;
    const homePlayers = boxscore?.teams?.home?.players ?? {};
    const awayPlayers = boxscore?.teams?.away?.players ?? {};

    const result: BoxscorePitcherStats = {
      home: extractStarterStats(boxscore?.teams?.home, homePlayers),
      away: extractStarterStats(boxscore?.teams?.away, awayPlayers),
    };

    boxscoreCache.set(key, result);
    return result;

  } catch (err) {
    console.warn(`[Boxscore] Error fetching game ${gamePk}:`, err);
    const empty: BoxscorePitcherStats = { home: null, away: null };
    boxscoreCache.set(key, empty);
    return empty;
  }
}

/**
 * Clear boxscore cache (call between pipeline runs or in tests).
 */
export function clearBoxscoreCache() {
  boxscoreCache.clear();
}
