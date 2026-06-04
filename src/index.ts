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
