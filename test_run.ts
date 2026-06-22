import { runDailyPipeline } from './src/workflow';

console.log('Iniciando prueba del pipeline para el 2026-06-21...');

runDailyPipeline('2026-06-21')
  .then(() => {
    console.log('--- PRUEBA FINALIZADA CON ÉXITO ---');
    process.exit(0);
  })
  .catch(err => {
    console.error('--- ERROR EN LA PRUEBA ---', err);
    process.exit(1);
  });
