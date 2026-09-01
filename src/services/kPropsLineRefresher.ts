/**
 * kPropsLineRefresher.ts
 *
 * Refresco periódico (liviano) de la línea de ponches (K's) de lanzadores.
 *
 * Por qué esto NO reutiliza `/api/harvest` ni `updateSingleGameData`: ambos
 * reconstruyen el juego completo (calendario de MLB Stats API, boxscore en
 * vivo, Baseball Savant, park factors, ...) — perfecto para la extracción
 * diaria, pero muchísimo más caro de lo necesario si lo único que se quiere
 * es revisar si una línea de props se movió. Aquí se llama directo a
 * `fetchRealBettingLines` (The Odds API + DataStreak + Rotowire, que es
 * exactamente "el extractor de líneas de apuestas") y se aplica la misma
 * lógica de emparejamiento pitcher↔línea que usa `buildDirectGameData` en
 * `server.ts`, pero solo para actualizar el prop de K's — sin tocar boxscore,
 * clima, splits, etc. Los nombres de los lanzadores ya están guardados en la
 * base (de la extracción diaria), así que tampoco hace falta pedirlos de
 * nuevo a MLB Stats API.
 *
 * Igual que `cronPipelineRoutes.ts`, las funciones de `server.ts` que hacen
 * falta se reciben inyectadas (`KPropsRefresherDeps`) en vez de importarse
 * directo, para no crear un ciclo de imports con el monolito.
 */

import { isFinalGameStatus } from "../utils/gameStatus";
import { saveGameData } from "./firestoreService";
import { appendLineChanges, KPropsLineChangeRecord } from "./kPropsLineHistory";

export interface KPropsRefresherDeps {
  readGamesDB: () => Record<string, any[]>;
  writeGamesDB: (data: Record<string, any[]>) => void;
  fetchRealBettingLines: (date: string, forceRefreshOdds: boolean, gamesList?: any[]) => Promise<any[] | null>;
  fetchDataStreakPitcherStrikeoutProps: (date: string, forceRefresh?: boolean) => Promise<any[]>;
  findDataStreakPitcherKProp: (rows: any[], pitcherName: string, pitcherTeam: string, opponentTeam: string) => any;
  normalizeName: (value: any) => string;
}

export interface KPropsRefreshSummary {
  date: string;
  gamesChecked: number;
  gamesSkippedFinal: number;
  changesDetected: number;
  errors: string[];
}

interface KPropData {
  point: number | null;
  overOdds: number | null;
  underOdds: number | null;
  source: string | null;
}

/** Misma lógica de emparejamiento que `buildDirectGameData` en server.ts, pero self-contained. */
function matchOddsApiKProp(
  events: any[],
  homeName: string,
  awayName: string,
  pitcherName: string | undefined,
  normalizeName: (v: any) => string
): KPropData | null {
  if (!pitcherName || pitcherName === "Por definir" || pitcherName === "TBD") return null;
  if (!Array.isArray(events)) return null;

  const matchOdds = events.find((o: any) => {
    const oHome = String(o.home_team || "").toLowerCase();
    const oAway = String(o.away_team || "").toLowerCase();
    const dbHome = homeName.toLowerCase();
    const dbAway = awayName.toLowerCase();
    return (
      (oHome === dbHome || oHome.includes(dbHome) || dbHome.includes(oHome)) &&
      (oAway === dbAway || oAway.includes(dbAway) || dbAway.includes(oAway))
    );
  });
  if (!matchOdds || !Array.isArray(matchOdds.bookmakers)) return null;

  const pitcherStrikeoutsOutcomes: any[] = [];
  for (const b of matchOdds.bookmakers) {
    const mPitcher = (b.markets || []).find((mk: any) => mk.key === "pitcher_strikeouts");
    if (mPitcher?.outcomes) {
      pitcherStrikeoutsOutcomes.push(
        ...mPitcher.outcomes.map((outcome: any) => ({
          ...outcome,
          bookKey: b.key,
          source: outcome.source || (b.key === "datastreak" ? "datastreak" : "the_odds_api"),
        }))
      );
    }
  }
  if (pitcherStrikeoutsOutcomes.length === 0) return null;

  const normalizedPitcherName = normalizeName(pitcherName);
  const parts = normalizedPitcherName.split(" ");
  const lastName = parts[parts.length - 1];
  const outcomes = pitcherStrikeoutsOutcomes.filter((o: any) => {
    const description = normalizeName(o.description);
    const isTheOddsApi = o.source !== "datastreak" && o.bookKey !== "datastreak";
    return (
      isTheOddsApi &&
      (description === normalizedPitcherName || description.includes(normalizedPitcherName) || description.split(" ").includes(lastName))
    );
  });
  if (outcomes.length === 0) return null;

  const over = outcomes.find((o: any) => o.name === "Over");
  const under = outcomes.find((o: any) => o.name === "Under");
  return {
    point: over?.point ?? under?.point ?? null,
    overOdds: over?.price ?? null,
    underOdds: under?.price ?? null,
    source: "the_odds_api",
  };
}

/** Aproxima la forma que espera `fetchRealBettingLines` para saltarse props de juegos ya en vivo/finales,
 * usando el estado que ya tenemos guardado (evita una llamada extra a MLB Stats API). */
function buildSkipListShim(games: any[]): any[] {
  return games.map((g) => ({
    teams: { home: { team: { name: g?.metadata?.homeTeam || "" } }, away: { team: { name: g?.metadata?.awayTeam || "" } } },
    status: {
      abstractGameState: isFinalGameStatus(g?.game_result?.gameStatus) ? "Final" : "",
      statusCode: "",
    },
  }));
}

function valuesEqual(a: number | null, b: number | null): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * Refresca la línea de K's de todos los lanzadores de `date` que no sean de un
 * juego ya finalizado, y registra en `k_props_line_history.json` cada línea u
 * odds que haya cambiado respecto al valor guardado. Actualiza además el
 * propio registro del juego (`pitchers.home/away.strikeoutProp...`) para que
 * el resto de la app (Bet Tracking, CSV de props, etc.) siempre muestre la
 * línea más reciente, no solo el historial.
 */
export async function refreshPitcherKPropLinesForDate(date: string, deps: KPropsRefresherDeps): Promise<KPropsRefreshSummary> {
  const summary: KPropsRefreshSummary = { date, gamesChecked: 0, gamesSkippedFinal: 0, changesDetected: 0, errors: [] };
  const db = deps.readGamesDB();
  const games: any[] = db[date] || [];

  const activeGames = games.filter((g) => !isFinalGameStatus(g?.game_result?.gameStatus));
  summary.gamesSkippedFinal = games.length - activeGames.length;
  if (activeGames.length === 0) {
    return summary;
  }

  const skipListShim = buildSkipListShim(games);
  const [oddsEvents, dataStreakRows] = await Promise.all([
    deps.fetchRealBettingLines(date, true, skipListShim).catch((err) => {
      summary.errors.push(`fetchRealBettingLines: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }),
    deps.fetchDataStreakPitcherStrikeoutProps(date, true).catch((err) => {
      summary.errors.push(`fetchDataStreakPitcherStrikeoutProps: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }),
  ]);

  const changeRecords: KPropsLineChangeRecord[] = [];
  const recordedAt = new Date().toISOString();
  let dbChanged = false;

  for (const game of activeGames) {
    summary.gamesChecked++;
    const homeName = game?.metadata?.homeTeam || "";
    const awayName = game?.metadata?.awayTeam || "";
    const gameId = String(game?.id || game?.metadata?.id || "");

    for (const side of ["home", "away"] as const) {
      const opponentSide = side === "home" ? "away" : "home";
      const pitcher = game?.pitchers?.[side];
      if (!pitcher?.name || pitcher.name === "Por definir" || pitcher.name === "TBD") continue;

      const team = side === "home" ? homeName : awayName;
      const opponent = side === "home" ? awayName : homeName;

      let newProp: KPropData | null = oddsEvents
        ? matchOddsApiKProp(oddsEvents, homeName, awayName, pitcher.name, deps.normalizeName)
        : null;
      if (!newProp) {
        const fallback = deps.findDataStreakPitcherKProp(dataStreakRows || [], pitcher.name, team, opponent);
        if (fallback) {
          newProp = {
            point: fallback.point ?? null,
            overOdds: fallback.overOdds ?? null,
            underOdds: fallback.underOdds ?? null,
            source: fallback.source ?? "datastreak",
          };
        }
      }
      if (!newProp || newProp.point === null) continue; // no hay línea nueva que registrar

      const oldLine = pitcher.strikeoutProp ?? null;
      const oldOver = pitcher.strikeoutPropOverOdds ?? null;
      const oldUnder = pitcher.strikeoutPropUnderOdds ?? null;

      const changed =
        !valuesEqual(oldLine, newProp.point) ||
        !valuesEqual(oldOver, newProp.overOdds) ||
        !valuesEqual(oldUnder, newProp.underOdds);
      if (!changed) continue;

      changeRecords.push({
        recordedAt,
        date,
        gameId,
        side,
        pitcherName: pitcher.name,
        team,
        opponent,
        oldLine,
        newLine: newProp.point,
        oldOverOdds: oldOver,
        newOverOdds: newProp.overOdds,
        oldUnderOdds: oldUnder,
        newUnderOdds: newProp.underOdds,
        source: newProp.source,
      });

      pitcher.strikeoutProp = newProp.point;
      pitcher.strikeoutPropOverOdds = newProp.overOdds;
      pitcher.strikeoutPropUnderOdds = newProp.underOdds;
      pitcher.strikeoutPropSource = newProp.source;
      dbChanged = true;
    }

    if (dbChanged) {
      saveGameData(gameId, game).catch((err) => {
        console.error(`[KPropsLineRefresher] No se pudo guardar en Firestore el juego ${gameId} tras refrescar líneas:`, err);
      });
    }
  }

  if (dbChanged) {
    db[date] = games;
    deps.writeGamesDB(db);
  }
  appendLineChanges(changeRecords);
  summary.changesDetected = changeRecords.length;
  return summary;
}
