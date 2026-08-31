/**
 * ⚠️ ARCHIVADO / NO USADO EN PRODUCCIÓN (Fase 4, punto 3 del plan de mejora).
 *
 * Este archivo NO es el entrypoint real de la app. `package.json` arranca
 * `server.ts` (vía esbuild) tanto en `npm run dev` como en `npm run build` —
 * este `src/index.ts` no está referenciado por ningún script y no se ejecuta
 * nunca en producción. Arrastra consigo `workflow.ts`, `jobs/scheduler.ts`,
 * y varios extractors/transformers que tampoco se usan (ver detalle en cada
 * archivo). Verificado con grep contra el grafo de imports real de
 * `server.ts` — no queda ninguna referencia viva a este archivo.
 *
 * Se deja en su lugar (no se pudo mover/eliminar desde esta sesión — ver
 * `TOOLS.md`/mensaje de la Fase 4 para el comando de reubicación manual).
 * Si en el futuro se confirma que nada lo necesita, se puede borrar.
 */
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { startCronJobs } from './jobs/scheduler';
import { runDailyPipeline } from './workflow';

const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

console.log('Starting MLB Data Engine...');

// Iniciar los trabajos programados
startCronJobs();

// Para propósitos de prueba, podemos ejecutar el pipeline de hoy inmediatamente:
// const today = new Date().toISOString().split('T')[0];
// runDailyPipeline(today).catch(console.error);
