// Sept. 2026 — auditoría con el usuario, punto #1: migración de una sola vez para
// sembrar en Firestore las entradas PIT (pitcher_stats_pit.json / offense_stats_pit.json
// / boxscore_game_stats.json) que ya existen en el disco LOCAL de esta máquina — la
// copia más completa y actualizada disponible (Render, al tener el disco efímero, solo
// tiene lo último commiteado en git). A partir de esta corrida, cada backfill nuevo
// (runBackfillPitSubprocess, en server.ts vía /api/harvest) sube automáticamente a
// Firestore solo lo que cambia — este script es exclusivamente para poner el historial
// existente al día una sola vez, igual que upload_local_to_firestore.ts hizo para
// mlb_database.json.
//
// Uso (una sola vez, desde esta máquina donde viven los 3 archivos completos):
//   npm run migrate:pit-to-firestore
import { savePitLookupEntries } from './src/services/firestoreService';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });
for (const key in process.env) {
  if (typeof process.env[key] === "string") {
    process.env[key] = process.env[key]!.trim().replace(/[\r\n]/g, "");
  }
}

const TARGETS: Array<{ kind: 'pitchers' | 'offense' | 'boxscore'; file: string; wrapKey: string }> = [
  { kind: 'pitchers', file: 'pitcher_stats_pit.json', wrapKey: 'pitchers' },
  { kind: 'offense', file: 'offense_stats_pit.json', wrapKey: 'offense' },
  { kind: 'boxscore', file: 'boxscore_game_stats.json', wrapKey: 'boxscore' },
];

async function migrate() {
  let totalSaved = 0;
  let totalFailed = 0;

  for (const { kind, file, wrapKey } of TARGETS) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  No se encontró ${file}, se omite.`);
      continue;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const entries: Record<string, any> = parsed?.[wrapKey] || {};
    const count = Object.keys(entries).length;
    if (count === 0) {
      console.log(`⚠️  ${file} no tiene entradas, se omite.`);
      continue;
    }
    console.log(`🚀 Subiendo ${count} entrada(s) de ${file} a Firestore (colección pit_${kind})...`);
    const result = await savePitLookupEntries(kind, entries);
    totalSaved += result.saved;
    totalFailed += result.failed;
    console.log(`   ✅ ${result.saved} guardada(s), ❌ ${result.failed} fallida(s).`);
  }

  console.log(`\n✅ Migración completada: ${totalSaved} entrada(s) subida(s) en total, ${totalFailed} fallida(s).`);
  process.exit(totalFailed > 0 ? 1 : 0);
}

migrate().catch((err) => {
  console.error('❌ Error inesperado en la migración:', err);
  process.exit(1);
});
