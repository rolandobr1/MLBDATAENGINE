import cron from 'node-cron';
// Importaremos el orquestador principal que crearemos en index o en un archivo workflow
// import { runDailyPipeline } from '../workflow';

export const startCronJobs = () => {
  // Ejecución a las 6:00 AM todos los días (Timezone: servidor o definir explícitamente)
  cron.schedule('0 6 * * *', async () => {
    console.log('Running morning MLB data pipeline...');
    // await runDailyPipeline();
  });

  // Ejecución cada hora para actualizaciones (delta)
  cron.schedule('0 * * * *', async () => {
    console.log('Running hourly updates...');
    // await runHourlyUpdates();
  });

  console.log('Cron jobs scheduled successfully.');
};
