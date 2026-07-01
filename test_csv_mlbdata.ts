import { generateMLBDataCSV } from './src/utils';

const g: any = {
  metadata: { time: "" }, pitchers: { home: {}, away: {} }, bullpen: { home: {}, away: {} },
  offense: { home: {}, away: {} }, betting_lines: {}, lineups: { home: [{ player: { pitches: 10 } }], away: [] }
};

try {
  let csv = generateMLBDataCSV([g]);
  let lines = csv.split('\n');
  console.log('MLBData Headers:', lines[0].split(',').length);
  console.log('MLBData Row:', lines[1].split(',').length);
} catch (e) {
  console.error(e);
}
