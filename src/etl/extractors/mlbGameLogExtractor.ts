/**
 * ⚠️ ARCHIVADO / NO USADO EN PRODUCCIÓN (Fase 4, punto 3 del plan de mejora).
 *
 * A pesar del nombre y del comentario de abajo (que suena a que resuelve el
 * bug de point-in-time correctness), este archivo no lo importa nadie — ni
 * `server.ts` ni ningún otro módulo (verificado con grep en todo el
 * proyecto, incluyendo frontend). La lógica PIT que sí está en producción
 * vive en `backfill_pitcher_stats_pit.py` + los helpers de PIT en
 * `server.ts`. Probablemente un intento anterior de portar esa lógica a TS
 * que nunca se conectó.
 *
 * Se deja en su lugar porque esta sesión no puede mover/eliminar archivos
 * en tu máquina — ver el mensaje de la Fase 4 para el comando manual.
 */

/**
 * mlbGameLogExtractor.ts
 *
 * Fetches pitcher and team offense stats accumulated UP TO a given date
 * (point-in-time correctness). This fixes the data leakage bug where
 * current season totals were used for all historical games.
 *
 * Sources:
 *  - Pitcher: MLB API /people/{id}/stats?stats=gameLog&group=pitching
 *  - Team Offense: MLB API /teams/{id}/stats?stats=byDateRange&group=hitting
 */

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

// --- In-memory cache (per pipeline run) ---
const pitcherGameLogCache = new Map<string, any[]>();
const teamOffenseCache = new Map<string, any>();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts MLB API IP string (e.g. "6.1" = 6 innings + 1 out) to decimal thirds.
 * "6.1" → 6 + 1/3 = 6.333... (stored as thirds: 19)
 */
function ipToThirds(ipStr: string | number | null | undefined): number {
  if (ipStr === null || ipStr === undefined || ipStr === '') return 0;
  const str = String(ipStr);
  const parts = str.split('.');
  const full = parseInt(parts[0] || '0', 10);
  const thirds = parseInt(parts[1] || '0', 10);
  return full * 3 + thirds; // store as total thirds of an inning
}

function thirdsToIpString(thirds: number): string {
  const full = Math.floor(thirds / 3);
  const rem = thirds % 3;
  return `${full}.${rem}`;
}

function n(val: any): number {
  const parsed = parseInt(val ?? 0, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function f(val: any, decimals = 3): number | null {
  const parsed = parseFloat(String(val ?? ''));
  return isFinite(parsed) ? parseFloat(parsed.toFixed(decimals)) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PITCHER — point-in-time stats
// ─────────────────────────────────────────────────────────────────────────────

async function fetchPitcherGameLogs(pitcherId: number | string, season: number): Promise<any[]> {
  const key = `${pitcherId}_${season}`;
  if (pitcherGameLogCache.has(key)) return pitcherGameLogCache.get(key)!;

  const url = `${MLB_API_BASE}/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching&sportId=1`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'MLBDATAENGINE/1.0' }
    });
    if (!res.ok) {
      console.warn(`[GameLog] HTTP ${res.status} for pitcher ${pitcherId} season ${season}`);
      pitcherGameLogCache.set(key, []);
      return [];
    }
    const data = await res.json();
    const splits: any[] = data?.stats?.[0]?.splits ?? [];
    pitcherGameLogCache.set(key, splits);
    return splits;
  } catch (err) {
    console.warn(`[GameLog] Error fetching pitcher ${pitcherId}:`, err);
    pitcherGameLogCache.set(key, []);
    return [];
  }
}

export interface PitcherPITStats {
  gs: number;
  ip: string;
  totalStrikeouts: number;
  wins: number;
  losses: number;
  era: number | null;
  whip: number | null;
  kPct: number | null;
  bbPct: number | null;
  ipAvgPerStart: string | null;
  gameCount: number;
}

/**
 * Returns pitcher cumulative stats for ALL starts STRICTLY BEFORE targetDate.
 * This gives the stats as they were at the time a specific game was played.
 *
 * @param pitcherId   MLB player ID
 * @param targetDate  The game date (YYYY-MM-DD). Stats BEFORE this date only.
 * @param season      The season year (e.g. 2026)
 */
export async function getPitcherStatsUpToDate(
  pitcherId: number | string,
  targetDate: string,
  season: number
): Promise<PitcherPITStats | null> {
  if (!pitcherId) return null;
  const splits = await fetchPitcherGameLogs(pitcherId, season);

  // Filter only games BEFORE target date (ISO date string comparison is valid)
  const prior = splits.filter(s => {
    const gameDate: string = s.date ?? s.game?.gameDate?.split('T')[0] ?? '';
    return gameDate < targetDate;
  });

  // Pitcher had no prior appearances — return zeroed stats
  const zeroed: PitcherPITStats = {
    gs: 0, ip: '0.0', totalStrikeouts: 0, wins: 0, losses: 0,
    era: null, whip: null, kPct: null, bbPct: null, ipAvgPerStart: null, gameCount: 0
  };
  if (!prior.length) return zeroed;

  let totalGS = 0;
  let totalIpThirds = 0;
  let totalK = 0;
  let totalW = 0;
  let totalL = 0;
  let totalER = 0;
  let totalHits = 0;
  let totalBB = 0;
  let totalBF = 0;

  for (const s of prior) {
    const st = s.stat ?? {};
    if (n(st.gamesStarted) >= 1) totalGS++;
    totalIpThirds += ipToThirds(st.inningsPitched);
    totalK  += n(st.strikeOuts);
    totalW  += n(st.wins);
    totalL  += n(st.losses);
    totalER += n(st.earnedRuns);
    totalHits += n(st.hits);
    totalBB += n(st.baseOnBalls);
    totalBF += n(st.battersFaced);
  }

  // ERA = (ER / IP_decimal) * 9
  const ipDecimal = totalIpThirds / 3;
  const era  = ipDecimal > 0 ? f((totalER / ipDecimal) * 9, 2) : null;
  const whip = ipDecimal > 0 ? f((totalHits + totalBB) / ipDecimal, 3) : null;
  const kPct = totalBF > 0 ? f((totalK / totalBF) * 100, 1) : null;
  const bbPct = totalBF > 0 ? f((totalBB / totalBF) * 100, 1) : null;
  const ipAvgPerStart = totalGS > 0
    ? thirdsToIpString(Math.round(totalIpThirds / totalGS))
    : null;

  return {
    gs: totalGS,
    ip: thirdsToIpString(totalIpThirds),
    totalStrikeouts: totalK,
    wins: totalW,
    losses: totalL,
    era,
    whip,
    kPct,
    bbPct,
    ipAvgPerStart,
    gameCount: prior.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM OFFENSE — point-in-time stats
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamOffensePITStats {
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  runsPerGame: number | null;
  kPct: number | null;
  iso: number | null;
}

/**
 * Returns team offense stats from start of season up to (NOT including) targetDate.
 *
 * @param teamId      MLB team ID (numeric)
 * @param targetDate  The game date (YYYY-MM-DD).
 * @param season      The season year (e.g. 2026)
 */
export async function getTeamOffenseUpToDate(
  teamId: number | string,
  targetDate: string,
  season: number
): Promise<TeamOffensePITStats | null> {
  if (!teamId) return null;

  const seasonStart = `${season}-03-15`;

  // endDate = one day before the game
  const endDt = new Date(targetDate + 'T12:00:00Z');
  endDt.setDate(endDt.getDate() - 1);
  const endDate = endDt.toISOString().split('T')[0];

  if (endDate < seasonStart) return null; // game at very start of season

  const key = `team_${teamId}_${endDate}`;
  if (teamOffenseCache.has(key)) return teamOffenseCache.get(key)!;

  const url = `${MLB_API_BASE}/teams/${teamId}/stats?stats=byDateRange&group=hitting&startDate=${seasonStart}&endDate=${endDate}&season=${season}&sportId=1`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'MLBDATAENGINE/1.0' }
    });
    if (!res.ok) {
      console.warn(`[OffensePIT] HTTP ${res.status} for team ${teamId} up to ${endDate}`);
      teamOffenseCache.set(key, null);
      return null;
    }
    const data = await res.json();
    const splits: any[] = data?.stats?.[0]?.splits ?? [];
    if (!splits.length) {
      teamOffenseCache.set(key, null);
      return null;
    }

    const st = splits[0]?.stat ?? {};
    const gamesPlayed = n(st.gamesPlayed) || 1;
    const runsTotal   = n(st.runs);

    const avgVal = f(st.avg);
    const slgVal = f(st.slg);

    const result: TeamOffensePITStats = {
      avg:         avgVal,
      obp:         f(st.obp),
      slg:         slgVal,
      ops:         f(st.ops),
      runsPerGame: f(runsTotal / gamesPlayed, 2),
      kPct:        st.strikeOuts && st.plateAppearances
                     ? f((n(st.strikeOuts) / n(st.plateAppearances)) * 100, 1)
                     : null,
      // ISO = SLG - AVG (standard calculation)
      iso:         (avgVal !== null && slgVal !== null)
                     ? f(slgVal - avgVal, 3)
                     : null,
    };

    teamOffenseCache.set(key, result);
    return result;
  } catch (err) {
    console.warn(`[OffensePIT] Error fetching team ${teamId}:`, err);
    teamOffenseCache.set(key, null);
    return null;
  }
}

/**
 * Clear all in-memory caches (call between pipeline runs or in tests).
 */
export function clearGameLogCaches() {
  pitcherGameLogCache.clear();
  teamOffenseCache.clear();
}
