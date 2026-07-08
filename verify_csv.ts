import { generateMLDatasetCSV } from './src/utils';
import { loadLatestGamesFromFirestore } from './src/services/firestoreService';

async function verify() {
  console.log(`Loading latest games...`);
  const games = await loadLatestGamesFromFirestore(5);
  if (!games || games.length === 0) {
    console.log("No games found in Firestore.");
    return;
  }
  
  console.log(`Found ${games.length} games. Generating CSV...`);
  const csvStr = generateMLDatasetCSV(games);
  
  const lines = csvStr.split('\n');
  const headers = lines[0].split(',');
  console.log(`\n=== Headers (${headers.length}) ===`);
  
  // Find our new fields
  const fieldsToCheck = [
    'home_pitcher_spin_rate', 'away_pitcher_spin_rate',
    'home_pitcher_stuff_plus', 'away_pitcher_stuff_plus',
    'home_pitcher_o_swing_pct', 'away_pitcher_o_swing_pct',
    'home_pitcher_k_pct_vs_lhb', 'away_pitcher_k_pct_vs_lhb',
    'home_pitcher_k_pct_vs_rhb', 'away_pitcher_k_pct_vs_rhb',
    'park_factor_k', 'park_factor_runs', 'park_factor_hr'
  ];

  const indices = fieldsToCheck.map(f => ({ name: f, index: headers.indexOf(f) }));
  
  indices.forEach(idx => {
    if (idx.index === -1) {
      console.error(`ERROR: Header ${idx.name} NOT FOUND!`);
    } else {
      console.log(`Header ${idx.name} found at index ${idx.index}`);
    }
  });

  if (lines.length > 1) {
    console.log(`\n=== Sample Data for first game (${games[0].metadata.awayTeam} @ ${games[0].metadata.homeTeam}) ===`);
    const values = lines[1].split(',');
    indices.forEach(idx => {
      if (idx.index !== -1) {
        console.log(`${idx.name}: ${values[idx.index]}`);
      }
    });
  }
  process.exit(0);
}

verify().catch(console.error);
