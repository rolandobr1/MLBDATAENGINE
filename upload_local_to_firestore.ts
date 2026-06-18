import { saveGameData } from './src/services/firestoreService';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Cargar y sanitizar variables de entorno
dotenv.config({ path: '.env.local' });
for (const key in process.env) {
  if (typeof process.env[key] === "string") {
    process.env[key] = process.env[key]!.trim().replace(/[\r\n]/g, "");
  }
}

async function uploadAll() {
  const dbPath = path.join(process.cwd(), "mlb_database.json");
  if (!fs.existsSync(dbPath)) {
    console.error("❌ No se encontró mlb_database.json en el directorio raíz.");
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  let count = 0;
  const dates = Object.keys(db);
  console.log(`📂 Encontradas ${dates.length} fechas en la base de datos local.`);

  for (const date of dates) {
    const games = db[date] || [];
    console.log(`🚀 Subiendo ${games.length} juegos para la fecha ${date}...`);
    for (const game of games) {
      const id = String(game?.id || game?.metadata?.id || "");
      if (!id) continue;
      try {
        await saveGameData(id, game);
        count++;
      } catch (err) {
        console.error(`❌ Error subiendo juego ${id}:`, err);
      }
    }
  }

  console.log(`\n✅ ¡Sincronización completada! Se subieron ${count} juegos a Firestore.`);
  process.exit(0);
}

uploadAll();
