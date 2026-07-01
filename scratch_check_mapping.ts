import { generateBattersCSV, generateMLDatasetCSV } from './src/utils';

const dummyGame: any = {
  id: "1",
  metadata: { date: "2024-01-01", time: "12:00", homeTeam: "HOU", awayTeam: "NYY", venue: "Stadium" },
  pitchers: { home: { name: "h1" }, away: { name: "a1" } },
  bullpen: { home: {}, away: {} },
  offense: { home: {}, away: {} },
  game_result: {},
  lineups: { home: [{}], away: [{}] },
  advanced_pitching: { home: {}, away: {} }
};

const battersCsv = generateBattersCSV([dummyGame]);
const batterLines = battersCsv.split("\n");
const headers = batterLines[0].split(",");
const row = batterLines[1].split(",");

console.log(`Headers length: ${headers.length}, Row length: ${row.length}`);

for (let i = 0; i < Math.max(headers.length, row.length); i++) {
  console.log(`${i}: H=[${headers[i] || 'MISSING'}] R=[${row[i] || 'MISSING'}]`);
}
