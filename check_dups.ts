import { generateBattersCSV, generateMLDatasetCSV, generateMLBDataCSV } from './src/utils';

const g: any = {
  metadata: { time: "" }, pitchers: { home: {}, away: {} }, bullpen: { home: {}, away: {} },
  offense: { home: {}, away: {} }, betting_lines: {}, lineups: { home: [{ player: { pitches: 10 } }], away: [] }
};

try {
  let hasDuplicates = false;
  
  const checkDuplicates = (name: string, fn: any) => {
    const csv = fn([g]);
    const lines = csv.split('\n');
    const headers = lines[0].split(',');
    
    const seen = new Set();
    const duplicates = new Set();
    
    for (const h of headers) {
      if (seen.has(h)) {
        duplicates.add(h);
      }
      seen.add(h);
    }
    
    if (duplicates.size > 0) {
      console.log(`[${name}] Encontró duplicados:`, Array.from(duplicates).join(', '));
      hasDuplicates = true;
    } else {
      console.log(`[${name}] No hay columnas duplicadas.`);
    }
  };

  checkDuplicates('MLDataset', generateMLDatasetCSV);
  checkDuplicates('Batters', generateBattersCSV);
  checkDuplicates('MLBData', generateMLBDataCSV);
  
} catch (e) {
  console.error(e);
}
