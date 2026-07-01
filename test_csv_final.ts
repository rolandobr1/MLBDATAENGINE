import { generateBattersCSV, generateMLDatasetCSV } from './src/utils';

const g: any = {
  metadata: { time: "" }, pitchers: { home: {}, away: {} }, bullpen: { home: {}, away: {} },
  offense: { home: {}, away: {} }, betting_lines: {}, lineups: { home: [{ player: { pitches: 10 } }], away: [] }
};

try {
  let csv = generateBattersCSV([g]);
  let lines = csv.split('\n');
  console.log('Batters Headers:', lines[0].split(',').length);
  console.log('Batters Row:', lines[1].split(',').length);
  
  csv = generateMLDatasetCSV([g]);
  lines = csv.split('\n');
  console.log('MLDataset Headers:', lines[0].split(',').length);
  console.log('MLDataset Row:', lines[1].split(',').length);
} catch (e) {
  console.error(e);
}
