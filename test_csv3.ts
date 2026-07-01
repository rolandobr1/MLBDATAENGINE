import { generateBattersCSV } from './src/utils';

const g: any = {
  metadata: { time: "" }, pitchers: { home: {}, away: {} }, bullpen: { home: {}, away: {} },
  offense: { home: {}, away: {} }, betting_lines: {}, lineups: { home: [], away: [] }
};

try {
  const csv = generateBattersCSV([g]);
  const lines = csv.split('\n');
  const headers = lines[0].split(',');
  const row = lines[1].split(',');
  
  console.log('Headers:', headers.length);
  console.log('Row:', row.length);
} catch (e) {
  console.error(e);
}
