import fs from 'fs';
import path from 'path';
import { getPitcherStatsUpToDate } from './src/etl/extractors/mlbGameLogExtractor';

// Map of name to ID to fallback if liveBoxscore is missing
const pitcherIdMap = new Map<string, number>();

async function buildPitStats() {
  console.log("Starting PIT generation...");
  const dbPath = path.join(process.cwd(), 'mlb_database.json');
  if (!fs.existsSync(dbPath)) {
    console.error("No mlb_database.json found!");
    return;
  }

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  const pitLookups: { pitchers: Record<string, any> } = { pitchers: {} };
  
  // First pass: extract all known pitcher IDs
  for (const date in db) {
    for (const game of db[date]) {
      const hName = game.pitchers?.home?.name;
      const hId = game.liveBoxscore?.home?.pitchers?.find((p: any) => p.name === hName)?.id;
      if (hName && hId) pitcherIdMap.set(hName, hId);

      const aName = game.pitchers?.away?.name;
      const aId = game.liveBoxscore?.away?.pitchers?.find((p: any) => p.name === aName)?.id;
      if (aName && aId) pitcherIdMap.set(aName, aId);
    }
  }

  console.log(`Found ${pitcherIdMap.size} unique pitchers in local DB.`);

  let processed = 0;
  let total = 0;
  for (const date in db) {
    total += db[date].length;
  }

  const season = 2026; // The games are in 2026.

  for (const date of Object.keys(db).sort()) {
    for (const game of db[date]) {
      const gameId = game.id;
      const hName = game.pitchers?.home?.name;
      const aName = game.pitchers?.away?.name;
      
      const hId = game.liveBoxscore?.home?.pitchers?.find((p: any) => p.name === hName)?.id || pitcherIdMap.get(hName);
      const aId = game.liveBoxscore?.away?.pitchers?.find((p: any) => p.name === aName)?.id || pitcherIdMap.get(aName);

      pitLookups.pitchers[gameId] = {};

      if (hId) {
        const stats = await getPitcherStatsUpToDate(hId, date, season);
        if (stats) pitLookups.pitchers[gameId].home = stats;
      }
      
      if (aId) {
        const stats = await getPitcherStatsUpToDate(aId, date, season);
        if (stats) pitLookups.pitchers[gameId].away = stats;
      }

      processed++;
      if (processed % 10 === 0) {
        console.log(`Processed ${processed} / ${total} games...`);
      }
    }
  }

  fs.writeFileSync('pitcher_stats_pit.json', JSON.stringify(pitLookups, null, 2));
  console.log("Finished generating pitcher_stats_pit.json");
}

buildPitStats().catch(console.error);
