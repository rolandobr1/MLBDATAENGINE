import { generateBattersCSV, generateMLDatasetCSV } from './src/utils';
import fs from 'fs';

// We just need to check the headers vs rows in the code itself.
// A simpler way is just to parse the string source of the file and count or run it on a dummy game.

const dummyGame: any = {
  id: "1",
  metadata: { date: "2024-01-01", time: "12:00", homeTeam: "HOU", awayTeam: "NYY", venue: "Stadium" },
  pitchers: { home: {}, away: {} },
  bullpen: { home: {}, away: {} },
  offense: { home: {}, away: {} },
  game_result: {},
  lineups: { home: [{}], away: [{}] }
};

try {
  const mlCsv = generateMLDatasetCSV([dummyGame]);
  const mlLines = mlCsv.split("\n");
  console.log("MLDatasetCSV Headers:", mlLines[0].split(",").length);
  console.log("MLDatasetCSV Row:", mlLines[1].split(",").length);
} catch (e: any) {
  console.log("MLDataset error", e.message);
}

try {
  const battersCsv = generateBattersCSV([dummyGame]);
  const batterLines = battersCsv.split("\n");
  console.log("BattersCSV Headers:", batterLines[0].split(",").length);
  console.log("BattersCSV Row:", batterLines[1].split(",").length);
} catch (e: any) {
  console.log("BattersCSV error", e.message);
}
