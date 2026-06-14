import { loadAllGamesFromFirestore } from './src/services/firestoreService';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function hasRealBettingLines(game: any): boolean {
  const summary = String(game?.betting_lines?.lineMovementSummary || "").toLowerCase();
  if (summary.includes("estandar") || summary.includes("estándar") || summary.includes("sin lineas reales") || summary.includes("sin líneas reales")) {
    return false;
  }
  const lines = game?.betting_lines || {};
  const isSyntheticDefault =
    lines.openingMoneylineHome === -110 &&
    lines.openingMoneylineAway === -110 &&
    lines.currentMoneylineHome === -110 &&
    lines.currentMoneylineAway === -110 &&
    lines.runLineHome === -1.5 &&
    lines.runLineHomeOdds === -110 &&
    lines.runLineAway === 1.5 &&
    lines.runLineAwayOdds === -110 &&
    lines.totalRuns === 8.5 &&
    lines.overOdds === -110 &&
    lines.underOdds === -110;
  if (isSyntheticDefault) return false;
  return [
    lines.openingMoneylineHome,
    lines.openingMoneylineAway,
    lines.currentMoneylineHome,
    lines.currentMoneylineAway,
    lines.runLineHome,
    lines.runLineHomeOdds,
    lines.runLineAway,
    lines.runLineAwayOdds,
    lines.totalRuns,
    lines.overOdds,
    lines.underOdds
  ].some((value) => value !== null && value !== undefined);
}

async function checkOdds() {
  const games = await loadAllGamesFromFirestore();
  console.log(`Loaded ${games.length} games.`);
  
  // Group games by date
  const byDate: Record<string, any[]> = {};
  games.forEach(g => {
    const d = g.metadata?.date;
    if (d) {
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(g);
    }
  });
  
  Object.keys(byDate).sort().forEach(date => {
    const dateGames = byDate[date];
    let countRealOdds = 0;
    let countKPropsHome = 0;
    let countKPropsAway = 0;
    let countTotalBasesHome = 0;
    let countTotalBasesAway = 0;
    
    dateGames.forEach(g => {
      if (hasRealBettingLines(g)) {
        countRealOdds++;
      }
      
      if (g.pitchers?.home?.strikeoutProp != null) {
        countKPropsHome++;
      }
      if (g.pitchers?.away?.strikeoutProp != null) {
        countKPropsAway++;
      }
      
      if (g.lineups?.home) {
        g.lineups.home.forEach((p: any) => {
          if (p.totalBasesProp != null) countTotalBasesHome++;
        });
      }
      if (g.lineups?.away) {
        g.lineups.away.forEach((p: any) => {
          if (p.totalBasesProp != null) countTotalBasesAway++;
        });
      }
    });
    
    console.log(`\nDate: ${date}`);
    console.log(`  Total games: ${dateGames.length}`);
    console.log(`  Games with real betting lines (H2H/RunLine/Totals): ${countRealOdds}`);
    console.log(`  Pitchers with K props: Home=${countKPropsHome}/${dateGames.length}, Away=${countKPropsAway}/${dateGames.length}`);
    console.log(`  Total Bases props in lineups: Home=${countTotalBasesHome}, Away=${countTotalBasesAway}`);
    
    if (dateGames.length > 0) {
      console.log(`  Sample Game: ${dateGames[0].metadata?.awayTeam} @ ${dateGames[0].metadata?.homeTeam}`);
      console.log(`    Betting Lines Summary: ${dateGames[0].betting_lines?.lineMovementSummary}`);
      console.log(`    Betting Lines details: ${JSON.stringify(dateGames[0].betting_lines)}`);
    }
  });
  
  process.exit(0);
}

checkOdds();
