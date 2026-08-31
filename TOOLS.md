# TOOLS.md — catálogo de scripts sueltos de la raíz

Fase 4, punto 4 del plan de mejora. Este proyecto acumuló, a lo largo de meses
de debugging, unos 30 scripts `.ts`/`.js`/`.py` en la raíz (fuera de `src/`),
la mayoría creados para investigar un problema puntual una sola vez. Ninguno
de estos scripts es parte del pipeline en producción (`server.ts`,
`backfill_pitcher_stats_pit.py`) — ese sigue intacto.

Este documento dice, de cada uno, qué hace y si es seguro volver a correrlo.
El subconjunto marcado ✅ **en el CLI** está además disponible como comando de
`tool.ts` (`npm run tool -- --list` para verlos, `npm run tool -- <comando>`
para correr uno). El resto se deja documentado pero fuera del CLI a propósito
— ver la razón en cada fila.

## Cómo leer las columnas

- **¿Muta datos?**: si escribe en `mlb_database.json`, Firestore, o cualquier
  archivo que la app real usa.
- **¿Reutilizable?**: si sirve para volver a correrlo en el futuro, o si fue
  una pregunta de un solo uso con fechas/IDs hardcodeados que ya no aplican.
- **Estado**: si compila y corre tal cual hoy, o si está roto.

## El pipeline real (no están en esta lista, para que no se confundan)

`server.ts` (vía `/api/harvest`, `/api/cron/run-daily-pipeline`) y
`backfill_pitcher_stats_pit.py` son el pipeline de producción — están
documentados en `PLAN_DE_MEJORA_MLBDATAENGINE.md` y `RENDER_CRON_SETUP.md`,
no acá.

## ✅ En el CLI (`tool.ts`) — seguros y con utilidad continua

| Comando | Script | Qué hace | ¿Muta datos? |
|---|---|---|---|
| `csv-smoke-test` | `test_csv_final.ts` | Genera CSV con un juego ficticio, confirma headers == columnas de la fila (Batters + MLDataset). | No |
| `verify-rotowire` | `test_rotowire.ts` | Corre el scraper de Rotowire de producción y confirma que devuelve props. | No |
| `verify-today` | `verify_today.ts` | Extrae el calendario de hoy + park factors + métricas pybaseball del primer juego. | No |
| `backfill-projected-innings` | `backfill_projected_innings.ts` | Recalcula `projectedInnings` para todos los juegos de `mlb_database.json`. Idempotente. | **Sí** (hacé backup antes) |
| `init-metadata-dates` | `init_metadata_dates.ts` | Sube a Firestore la lista de fechas presentes en la DB local. | Sí, pero solo Firestore (merge) |
| `test-odds-api-key` | `scratch_test_odds_api.ts` | Confirma que `ODDS_API_KEY` funciona contra The Odds API. | No |
| `check-odds-coverage` | `check_odds_in_firestore.ts` | Reporta cobertura de odds/props por fecha, leyendo Firestore. | No |

## ⚠️ Generales pero fuera del CLI a propósito (red/API pesados, o legado Firestore)

| Script | Qué hace | Por qué no está en el CLI |
|---|---|---|
| `generate_pit.ts` | Reconstruye `pitcher_stats_pit.json` desde cero, iterando TODO `mlb_database.json` y llamando a la API de MLB por cada lanzador de cada juego. | Lento y pesado (rate limit de la API); además usa `src/etl/extractors/mlbGameLogExtractor.ts`, que está marcado como código muerto en el pipeline real (Fase 4, punto 3) aunque el archivo en sí sigue funcionando si lo llamás directo. Si necesitás reconstruir el archivo PIT completo, mejor usar `backfill_pitcher_stats_pit.py --reverify` (el mecanismo real, ya integrado al cron). |
| `test_extraction_live.ts` | Prueba de punta a punta: calendario + park factors + pybaseball, con fecha fija `2024-05-15` (elegida porque tiene datos reales conocidos en Savant). | Redundante con `verify-today` del CLI; se deja por si algún día hace falta una fecha vieja específica en vez de "hoy". |
| `test_rotowire_playwright.ts` | Prototipo viejo que scrapea Rotowire con un browser real (Playwright) en vez de fetch directo. | Superado por `rotowireScraper.ts` (el de producción, más liviano). Sirve como plan B manual si el scraper de producción deja de funcionar y hay que inspeccionar la página a mano. |
| `test_rotowire.py` | Exploración de los endpoints JS de Rotowire (`bet.rotowire.com/js/app.js`) para encontrar la API que terminó usando `rotowireScraper.ts`. | Puramente exploratorio/histórico — documenta cómo se encontró el endpoint, no hace falta volver a correrlo salvo que Rotowire cambie de nuevo su estructura. |
| `scratch_test_server_odds.ts` | Simula el flujo real de pedir odds + props de The Odds API para todos los eventos del día. | Hace muchas más llamadas a la API que `test-odds-api-key` (una por evento) — quema cuota de la API sin necesidad si solo querés confirmar que la key funciona. |
| `upload_local_to_firestore.ts` | Sube TODO `mlb_database.json` a Firestore (todas las fechas, todos los juegos). | Firestore ya no es la fuente de verdad en producción — es un sistema legado. Subir todo de nuevo no rompe nada por sí solo, pero es una escritura masiva sin dry-run; solo correrlo si de verdad necesitás esa sincronización. |

## 🚫 Un solo uso histórico — fechas/IDs hardcodeados, no tiene sentido rerun

Estos ya cumplieron su propósito (resolver un problema puntual en una fecha
específica) y no generalizan a "correr cuando haga falta". Se dejan en la
raíz como referencia de cómo se investigó/parchó ese problema en su momento.

- `check_bets.ts` — hardcodea `bets_2026-06-15` / `bets_2026-06-14` (Firestore, solo lectura).
- `check_db.ts` — busca "Eovaldi" y la fecha `2026-06-14` en Firestore (solo lectura).
- `scratch_check_db.ts` — hardcodea `2026-06-12` (Firestore, solo lectura).
- `scratch_check_export.ts` — chequea una lista fija de columnas de un debugging puntual sobre `mlb_database.json` (solo lectura).
- `test_run.ts` — corre `runDailyPipeline` de `src/workflow.ts` con la fecha `2026-06-21`. **`src/workflow.ts` está archivado como código muerto** (Fase 4, punto 3) — el pipeline real ya no es ese, es `/api/harvest` + `/api/cron/run-daily-pipeline`. No tiene sentido esperar que esto refleje el comportamiento actual.
- `test_balls.js`, `test_boxscore_structure.js` — exploración puntual de la forma del JSON de la API de MLB contra IDs de partidos específicos (746485, 746210). Sirvieron para diseñar los extractors reales; no aportan nada nuevo hoy.

## ⚠️ Peligrosos — escriben en producción sin red de seguridad

**No correr estos sin pensar dos veces**, incluso aunque técnicamente sigan funcionando:

- **`force_sync.ts`** — trae TODOS los juegos de Firestore y los mezcla en `mlb_database.json`, **sobrescribiendo** cualquier juego local con el mismo id. Firestore es una copia legada: si tiene versiones viejas de juegos que ya fueron corregidas por los fixes de point-in-time de la Fase 1 (stats de lanzador congeladas, fuga de fechas futuras), correr esto **puede reintroducir esos bugs ya arreglados** en tu base de datos local. Si alguna vez hace falta reconciliar con Firestore, primero comparar a mano, no correr esto a ciegas.
- **`scratch_test_save.ts`** — guarda un documento de prueba (`test_123`, fecha `2026-06-12`) en la colección real de Firestore de producción. Si lo corrés, después hay que borrar `test_123` a mano de Firestore.
- **`fix_odds.ts`** — parche puntual ya aplicado para la fecha `2026-06-15`: cruza `mlb_database.json` con `odds_cache_2026-06-15.json` y sobrescribe `betting_lines` por coincidencia difusa de nombre de equipo. Si se corre de nuevo (o se adapta a otra fecha) sin revisar el resultado, puede pisar líneas de apuestas ya buenas con un match incorrecto.
- **`patch.py`** — codemod de una sola vez que buscaba un bloque de texto exacto en `server.ts` (la versión vieja de `fetchDataStreakPitcherStrikeoutProps`) y lo reemplazaba para agregar la integración con Rotowire. `server.ts` ya cambió mucho desde entonces (Fases 1-4) — es muy probable que el texto buscado ya no exista tal cual, en cuyo caso el script simplemente imprime "Target not found" y no hace nada. Aun así, **no correrlo**: si por coincidencia algún fragmento de texto matcheara parcialmente en el `server.ts` de hoy, reescribiría código a ciegas sin ningún chequeo de tipos antes de guardar.

## 🔴 Rotos hoy — no compilan o fallan al correr

Verificado con `npx tsc --noEmit` y lectura directa del código:

- **`check_firestore.ts`** — importa `db` de `./src/services/firestoreService`, pero ese módulo ya no exporta `db` con ese nombre (`error TS2459: Module declares 'db' locally, but it is not exported`). No compila.
- **`check_dups.ts`** — usa `generateMLBDataCSV` (una función vieja y separada de `generateMLDatasetCSV`/`generateBattersCSV`, no tocada en esta fase), que tiene un bug real: referencia variables `hOff`/`aOff` que no existen en su scope (`error TS2304: Cannot find name 'hOff'`, ver `src/utils.ts` línea ~369-374). Esto es un bug **pre-existente**, no introducido por los cambios de esta fase — `generateMLBDataCSV` no está en el pipeline en producción (nada en `server.ts` la importa), solo la usan `check_dups.ts` y `test_csv_mlbdata.ts`. Si en algún momento hace falta esa función, hay que arreglar ese bug primero.
- **`test_csv_mlbdata.ts`** — mismo problema: llama a `generateMLBDataCSV`, que falla en runtime por el bug de `hOff`/`aOff` de arriba.
- **`test_csv2.ts`** — le pasa un `any[]` a una función que espera un `MLBGame` completo (`error TS2345`), típico de cuando el tipo `MLBGame` ganó campos obligatorios después de escribir este script.
- **`verify_batters_csv.ts`**, **`verify_csv.ts`** — ambos llaman a `loadLatestGamesFromFirestore(5)` con un argumento, pero la función ya no acepta argumentos (`error TS2554: Expected 0 arguments, but got 1`) — la firma cambió y estos scripts quedaron desactualizados.
- **`verify_csv_fast.ts`** — el archivo está **corrupto**: guardado con una codificación rara (aparenta UTF-16 mal interpretado), se lee como texto con espacios entre cada letra y bytes nulos. Es ilegible/inutilizable tal cual. `verify_csv_local.ts` (un archivo separado) tiene el mismo contenido pero en texto plano funcional — usá ese en su lugar, o simplemente borrá `verify_csv_fast.ts`.
- **`scratch_compare.js`** — hace parsing por regex del código fuente de `generateMLDatasetCSV` buscando literalmente `const row = [...]`, pero esa función arma la fila con `return [...]` directo (nunca tuvo una variable `row`) — el regex nunca matcheaba ni siquiera antes de esta fase. Además tiene hardcodeada la ruta absoluta de Windows del usuario (`c:/Users/Rolando Valdez/Desktop/...`). Artefacto de debugging obsoleto.

## 🟡 Redundantes — funcionan pero duplican a otro script

Todos leen/generan CSV con datos ficticios y comparan headers vs. fila —
básicamente variaciones del mismo smoke test escritas en sesiones de
debugging distintas. `csv-smoke-test` (`test_csv_final.ts`, en el CLI) ya
cubre lo mismo para los dos generadores que importan:

- `scratch_check_csv.ts`
- `test_csv.ts`
- `test_csv3.ts`
- `verify_csv_local.ts` (esta al menos usa datos reales de `mlb_database.json` en vez de un juego ficticio — más útil que las demás si hace falta un chequeo con datos de verdad, pero carga el JSON completo, ~200MB, así que es lento)

No se borraron (esta sesión no puede borrar archivos en tu máquina — ver el
mismo problema explicado para el código muerto de la Fase 4, punto 3), pero
si en algún momento querés limpiar la raíz a mano, estos son candidatos
seguros para borrar sin perder cobertura.

## Resumen para decidir rápido

- ¿Necesitás correr algo de la lista de arriba? Empezá por `npm run tool -- --list`.
- ¿Un script no está ni ahí ni en las tablas de "generales fuera del CLI"?
  Es porque cae en alguna de las categorías de abajo: uso histórico, peligroso,
  roto, o redundante — la fila correspondiente explica por qué.
