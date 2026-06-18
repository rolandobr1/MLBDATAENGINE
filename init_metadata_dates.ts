import { db } from './src/config/firebase';
import { doc, setDoc } from 'firebase/firestore';
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

async function initMetadata() {
  const dbPath = path.join(process.cwd(), "mlb_database.json");
  if (!fs.existsSync(dbPath)) {
    console.error("❌ No se encontró mlb_database.json para leer las fechas.");
    process.exit(1);
  }

  const localDB = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  const dates = Object.keys(localDB).filter(d => Array.isArray(localDB[d]) && localDB[d].length > 0);

  if (dates.length === 0) {
    console.log("⚠️ No se encontraron fechas con juegos en tu base de datos local.");
    process.exit(0);
  }

  console.log(`📅 Fechas encontradas localmente:`, dates);

  try {
    const metadataRef = doc(db, 'metadata', 'extracted_dates');
    // Ordenar de forma descendente antes de guardar
    const sortedDates = [...dates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    await setDoc(metadataRef, { dates: sortedDates }, { merge: true });
    console.log(`\n✅ ¡Metadatos de fechas inicializados con éxito en Firestore! (${sortedDates.length} fechas registradas)`);
  } catch (err) {
    console.error("❌ Error al guardar el documento de metadatos en Firestore:", err);
  }

  process.exit(0);
}

initMetadata();
