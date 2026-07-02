import { generateBattersCSV } from './src/utils';
import { enrichWithVortexMetrics } from './src/etl/transformers/vortexMetrics';
import * as fs from 'fs';

const db = JSON.parse(fs.readFileSync('mlb_database.json', 'utf-8'));
const games = Object.values(db).flat() as any[];

games.forEach(g => enrichWithVortexMetrics(g));

const csv = generateBattersCSV(games);
const lines = csv.split("\n");
const headers = lines[0].split(",");

const colsToCheck = [
  "away_pitcher_pitches_per_bf_last5", 
  "away_pitcher_pitches_per_ip_last5", 
  "home_pitcher_avg_pitches_last3", 
  "home_pitcher_rest_status", 
  "home_lineup_pitch_count_risk_score", 
  "home_lineup_high_hardhit_batters_count",
  "away_lineup_pitch_count_risk_score",
  "away_lineup_high_hardhit_batters_count"
];

colsToCheck.forEach(col => {
  const idx = headers.indexOf(col);
  if(idx === -1) {
    console.log(`${col}: NOT FOUND IN HEADERS`);
  } else {
    console.log(`${col}: ${lines[1].split(",")[idx]}`);
  }
});