/**
 * ⚠️ ARCHIVADO / NO USADO EN PRODUCCIÓN (Fase 4, punto 3 del plan de mejora).
 *
 * Solo lo importa `src/index.ts` (también archivado, no es el entrypoint
 * real). La automatización diaria real ahora es el endpoint
 * `/api/cron/run-daily-pipeline` en `server.ts`, disparado por un Cron Job
 * de Render (ver `RENDER_CRON_SETUP.md`), no por `node-cron` en proceso.
 *
 * Se deja en su lugar porque esta sesión no puede mover/eliminar archivos
 * en tu máquina — ver el mensaje de la Fase 4 para el comando manual.
 */
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
