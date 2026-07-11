import { fetchDailySchedule } from './etl/extractors/mlbApi';
import { fetchPitcherSavantMetrics } from './etl/extractors/savantScraper';
import { fetchDailyOdds } from './etl/extractors/oddsScraper';
import { validateGameData } from './etl/transformers/gameValidator';
import { flattenGameForML } from './etl/transformers/mlFormatter';
import { saveGameData } from './services/firestoreService';
import { enrichWithVortexMetrics } from './etl/transformers/vortexMetrics';
import { getStarterBoxscoreStats } from './etl/extractors/mlbBoxscorePitcherExtractor';
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

    // 1.5 Fetch recent PyBaseball Statcast
    // Fetch last 3 days of statcast for Hot Hand & CSW% metrics
    const endDate = new Date(dateStr);
    const startDate = new Date(dateStr);
    startDate.setDate(startDate.getDate() - 3);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    let recentStatcast = null;
    let batterSplits = null;
    let bullpenWorkload = null;
    try {
      const { getRecentStatcast, getBatterSplits, getBullpenWorkload } = await import('./etl/extractors/pybaseballApi');
      recentStatcast = await getRecentStatcast(startStr, endStr);
      batterSplits = await getBatterSplits();
      bullpenWorkload = await getBullpenWorkload();
      console.log('PyBaseball advanced metrics fetched successfully');
    } catch (err) {
      console.error('Failed to fetch PyBaseball data:', err);
    }

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
          era: null, 
          whip: null,
          xERA: savantData?.xERA || null,
          fip: null,
          k_pct: savantData?.kPct || null,
          bb_pct: savantData?.bbPct || null
        } as any;
        
        // Asignar CSW% y Velocidad de PyBaseball
        if (recentStatcast?.data?.pitchers_recent) {
          const pStats = recentStatcast.data.pitchers_recent.find((p: any) => p.pitcher === homePitcherId);
          if (pStats) {
            (rawGameData as any).pitchers.home_starter.pitcher_csw_pct = pStats.csw_pct;
            (rawGameData as any).pitchers.home_starter.pitcher_recent_velocity = pStats.avg_velocity;
          }
        }
      }
      
      // Asignar Bullpen Workload
      (rawGameData as any).bullpen = {
        home: bullpenWorkload?.data?.teams?.[rawGameData.metadata.home_team]?.recent_ip || null,
        away: bullpenWorkload?.data?.teams?.[rawGameData.metadata.away_team]?.recent_ip || null
      };

      // Asignar Bateadores (Mock de alineación y splits)
      (rawGameData as any).lineups = {
        home: [],
        away: [],
        lineup_confirmed: true
      };
      (rawGameData as any).advanced_offense = {
        home: {},
        away: {}
      };
      
      // Simulamos asignar un bateador y sus splits vs RHP
      if (batterSplits?.data?.splits?.default?.RHP) {
        const defaultSplits = batterSplits.data.splits.default.RHP;
        (rawGameData as any).lineups.home.push({
          batter_id: 'mock_1',
          babip: defaultSplits.babip,
          hardHitPct: defaultSplits.hard_hit
        });
      }
      
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

      let validGame: any = validation.data;
      validGame = enrichWithVortexMetrics(validGame);
      
      const statusStr = String(validGame.game_result?.gameStatus || "").toLowerCase();
      const isFinal = statusStr.includes("final") || statusStr === "game over" || statusStr === "completed early" || statusStr === "completed";
      
      if (isFinal) {
        try {
          const bsStats = await getStarterBoxscoreStats(gameId);
          validGame.boxscore_stats = bsStats;
          if (validGame.advanced_pitching?.home) {
            validGame.advanced_pitching.home.actualStrikeouts = bsStats.home?.strikeOuts ?? null;
          }
          if (validGame.advanced_pitching?.away) {
            validGame.advanced_pitching.away.actualStrikeouts = bsStats.away?.strikeOuts ?? null;
          }
        } catch (err) {
          console.warn(`Could not fetch boxscore for ${gameId}:`, err);
        }
      }

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
