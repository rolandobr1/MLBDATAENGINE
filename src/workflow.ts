import { fetchDailySchedule } from './etl/extractors/mlbApi';
import { fetchPitcherSavantMetrics } from './etl/extractors/savantScraper';
import { fetchDailyOdds } from './etl/extractors/oddsScraper';
import { validateGameData } from './etl/transformers/gameValidator';
import { flattenGameForML } from './etl/transformers/mlFormatter';
import { saveGameData } from './services/firestoreService';
import { appendRowToMLSheet } from './services/googleSheetsService';

export const runDailyPipeline = async (dateStr: string) => {
  try {
    console.log(`Starting MLB Pipeline for date: ${dateStr}`);
    
    // 1. Extraer calendario
    const schedule = await fetchDailySchedule(dateStr);
    if (!schedule.dates || schedule.dates.length === 0) {
      console.log('No games scheduled for today.');
      return;
    }
    
    const games = schedule.dates[0].games;
    const odds = await fetchDailyOdds();

    // Iterar sobre los juegos programados
    for (const game of games) {
      const gameId = game.gamePk.toString();
      
      // Armar metadata base
      const rawGameData = {
        metadata: {
          game_id: gameId,
          date: dateStr,
          time_et: game.gameDate,
          home_team: game.teams.home.team.name,
          away_team: game.teams.away.team.name,
          stadium: game.venue.name
        },
        pitchers: {
          home_starter: null,
          away_starter: null
        },
        betting_lines: {}
      };

      // Si tenemos pitchers probables, podemos buscarlos en Savant
      const homePitcherId = game.teams.home.probablePitcher?.id;
      const awayPitcherId = game.teams.away.probablePitcher?.id;

      if (homePitcherId) {
        const savantData = await fetchPitcherSavantMetrics(homePitcherId.toString());
        rawGameData.pitchers.home_starter = {
          name: game.teams.home.probablePitcher.fullName,
          era: null, // requires deeper stats endpoint
          whip: null,
          xERA: savantData?.xERA || null,
          fip: null,
          k_pct: savantData?.kPct || null,
          bb_pct: savantData?.bbPct || null
        } as any;
      }
      
      // Omitiendo lógica awayPitcher para simplificar
      
      // Integrar Odds de manera muy básica
      const gameOdds = odds?.find((o: any) => o.home_team === rawGameData.metadata.home_team);
      if (gameOdds) {
        const market = gameOdds.bookmakers[0]?.markets[0]?.outcomes;
        const homeOdds = market?.find((o: any) => o.name === rawGameData.metadata.home_team)?.price || null;
        const awayOdds = market?.find((o: any) => o.name === rawGameData.metadata.away_team)?.price || null;
        rawGameData.betting_lines = {
          current: {
            home_ml: homeOdds,
            away_ml: awayOdds,
            total: 8.5 // MOCK
          }
        };
      }

      // 2. Transformar y Validar
      const validation = validateGameData(rawGameData);
      
      if (!validation.success) {
        console.error(`Validation failed for game ${gameId}`);
        continue; // Skip invalid games or log them
      }

      const validGame = validation.data;

      // 3. Load (Guardar en Firestore y Sheets)
      await saveGameData(gameId, validGame);
      
      const mlRow = flattenGameForML(validGame);
      await appendRowToMLSheet(mlRow);
    }
    
    console.log('Pipeline finished successfully.');
  } catch (error) {
    console.error('Pipeline error:', error);
  }
};
