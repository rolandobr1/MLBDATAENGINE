import { loadAllGamesFromFirestore } from './src/services/firestoreService';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  const games = await loadAllGamesFromFirestore();
  const datesCount: Record<string, number> = {};
  games.forEach(g => {
    const d = g.metadata?.date;
    if (d) datesCount[d] = (datesCount[d] || 0) + 1;
  });
  
  console.log(`\nTotal games in Firestore: ${games.length}`);
  console.log("Breakdown by date:");
  Object.keys(datesCount).sort().forEach(d => {
    console.log(`  ${d}: ${datesCount[d]} games`);
  });

  const targetDate = '2026-06-12';
  const targetGames = games.filter(g => g.metadata?.date === targetDate);
  if (targetGames.length > 0) {
    console.log(`\nExample game on ${targetDate}: ${targetGames[0].metadata?.awayTeam} vs ${targetGames[0].metadata?.homeTeam}`);
  }
  
  process.exit(0);
}
check();
