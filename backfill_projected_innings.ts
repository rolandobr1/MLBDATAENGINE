import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'mlb_database.json');

function calculateProjectedInnings(pitching: any): number | null {
  const projectedPitches = pitching.projectedPitchCount;
  if (projectedPitches === null || projectedPitches === undefined || projectedPitches <= 0) {
    return null;
  }
  
  const last5Pitches = pitching.last5PitchCountAvg;
  const last5Ip = pitching.last5IpAvg;
  
  let pitchesPerInning = 16.5; // fallback
  if (last5Pitches != null && last5Ip != null && last5Ip > 0) {
    pitchesPerInning = last5Pitches / last5Ip;
  }
  pitchesPerInning = Math.min(25, Math.max(12, pitchesPerInning));
  
  const rawInnings = projectedPitches / pitchesPerInning;
  const totalOuts = Math.round(rawInnings * 3);
  if (totalOuts <= 0) return 0;
  
  const wholeInnings = Math.floor(totalOuts / 3);
  const remainingOuts = totalOuts % 3;
  return wholeInnings + (remainingOuts / 10);
}

async function run() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("No mlb_database.json found.");
    return;
  }

  const dataStr = fs.readFileSync(DB_PATH, 'utf-8');
  let data;
  try {
    data = JSON.parse(dataStr);
  } catch (e) {
    console.error("Error parsing DB:", e);
    return;
  }

  let updatedCount = 0;

  for (const date of Object.keys(data.dates || {})) {
    const games = data.dates[date];
    for (const game of games) {
      if (game.advanced_pitching) {
        if (game.advanced_pitching.home) {
          game.advanced_pitching.home.projectedInnings = calculateProjectedInnings(game.advanced_pitching.home);
          updatedCount++;
        }
        if (game.advanced_pitching.away) {
          game.advanced_pitching.away.projectedInnings = calculateProjectedInnings(game.advanced_pitching.away);
          updatedCount++;
        }
      }
    }
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  console.log(`Backfilled projectedInnings for ${updatedCount} pitchers.`);
}

run();
