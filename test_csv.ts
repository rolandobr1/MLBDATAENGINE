import { generateMLDatasetCSV } from './src/utils';

// Dummy game
const g: any = {
  metadata: {}, pitchers: { home: {}, away: {} }, bullpen: { home: {}, away: {} },
  offense: { home: {}, away: {} }, betting_lines: {}, lineups: { home: [], away: [] }
};

try {
  const csv = generateMLDatasetCSV([g]);
  const lines = csv.split('\n');
  const headers = lines[0].split(',');
  const row = lines[1].split(',');
  
  console.log('Headers:', headers.length);
  console.log('Row:', row.length);
  
  for (let i = 0; i < Math.max(headers.length, row.length); i++) {
    const h = headers[i];
    const r = row[i];
    if (i >= 265) {
       console.log(`${i}: ${h} | ${r}`);
    }
  }
} catch (e) {
  console.error(e);
}
