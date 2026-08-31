/**
 * tool.ts — Fase 4, punto 4 del plan de mejora.
 *
 * Mini-CLI para los scripts sueltos de la raíz del proyecto que siguen
 * siendo seguros y útiles de correr a mano (chequeos de conectividad,
 * smoke tests, backfills idempotentes). NO reimplementa la lógica de cada
 * script — simplemente los invoca vía `npx tsx <archivo>.ts` tal como ya
 * existen, para no arriesgar que este dispatcher se desincronice del
 * comportamiento real de cada uno.
 *
 * Este es un subconjunto deliberadamente chico de los ~30 scripts que hay
 * en la raíz del proyecto. El resto (parches de un solo uso ya aplicados,
 * scripts con fechas hardcodeadas de hace meses, código que ya no compila
 * porque las funciones que llama cambiaron de firma, o scripts que escriben
 * en Firestore/mlb_database.json sin ninguna red de seguridad) está
 * catalogado en TOOLS.md pero deliberadamente NO expuesto acá, para que
 * "correr una herramienta del proyecto" no incluya por accidente algo
 * peligroso o roto. Si en el futuro se limpia/generaliza alguno de esos,
 * se puede agregar acá.
 *
 * Uso:
 *   npm run tool -- --list
 *   npm run tool -- <comando>
 */

import { spawnSync } from "child_process";

interface ToolEntry {
  script: string;
  description: string;
}

const TOOLS: Record<string, ToolEntry> = {
  "csv-smoke-test": {
    script: "test_csv_final.ts",
    description:
      'Genera un CSV con un juego ficticio y confirma que "headers" y la fila de datos tengan la misma cantidad de columnas, para generateBattersCSV y generateMLDatasetCSV. Rápido, sin red ni base de datos real — buen primer chequeo después de tocar src/utils.ts.',
  },
  "verify-rotowire": {
    script: "test_rotowire.ts",
    description:
      "Llama al scraper de Rotowire de producción (src/etl/extractors/rotowireScraper.ts) y confirma que sigue devolviendo props de strikeouts. Útil porque es un scraper de un sitio de terceros — puede romperse en silencio si Rotowire cambia su página.",
  },
  "verify-today": {
    script: "verify_today.ts",
    description:
      "Extrae el calendario de HOY desde la API de MLB, carga park factors y las métricas avanzadas de pybaseball para el primer juego del día. Smoke test de punta a punta de la extracción en vivo. Necesita red y python3 (pybaseball).",
  },
  "backfill-projected-innings": {
    script: "backfill_projected_innings.ts",
    description:
      "Recalcula advanced_pitching.{home,away}.projectedInnings para TODOS los juegos en mlb_database.json y sobrescribe el archivo completo. Es idempotente (mismo input -> mismo output), pero de todos modos hacé una copia de mlb_database.json antes si querés poder revertir fácil.",
  },
  "init-metadata-dates": {
    script: "init_metadata_dates.ts",
    description:
      "Sube a Firestore (doc metadata/extracted_dates) la lista de fechas que existen en tu mlb_database.json local, para que la UI vieja basada en Firestore sepa qué fechas hay. Seguro de repetir (usa merge, no destruye nada).",
  },
  "test-odds-api-key": {
    script: "scratch_test_odds_api.ts",
    description:
      "Prueba de conectividad: confirma que ODDS_API_KEY en .env.local sigue siendo válida contra The Odds API. Solo lectura, no escribe nada.",
  },
  "check-odds-coverage": {
    script: "check_odds_in_firestore.ts",
    description:
      'Carga todos los juegos guardados en Firestore y muestra, fecha por fecha, cuántos tienen líneas de apuestas reales y props de strikeouts/total bases. Solo lectura. OJO: Firestore es una copia legada — la app en producción ya no persiste ahí (usa mlb_database.json), así que esto diagnostica esa copia vieja, no el pipeline real.',
  },
};

function printList() {
  console.log("Comandos disponibles (npm run tool -- <comando>):\n");
  for (const [name, entry] of Object.entries(TOOLS)) {
    console.log(`  ${name}`);
    console.log(`    ${entry.description}`);
    console.log(`    (ejecuta: npx tsx ${entry.script})\n`);
  }
  console.log(
    "Este es solo el subconjunto seguro/vigente. El catálogo completo de los\n" +
      "~30 scripts sueltos de la raíz — incluyendo los de un solo uso histórico,\n" +
      "los que ya no compilan, y los que escriben en producción sin red de\n" +
      "seguridad — está en TOOLS.md."
  );
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--list" || command === "-h" || command === "--help") {
  printList();
  process.exit(0);
}

const entry = TOOLS[command];
if (!entry) {
  console.error(`Comando desconocido: "${command}"\n`);
  printList();
  process.exit(1);
}

console.log(`--- Corriendo "${command}" (npx tsx ${entry.script}) ---\n`);
const result = spawnSync("npx", ["tsx", entry.script], { stdio: "inherit" });
process.exit(result.status ?? 1);
