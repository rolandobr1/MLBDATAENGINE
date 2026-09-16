# Auditoría extrema del pipeline MLBDATAENGINE — 16 de septiembre de 2026

Alcance: verificación línea por línea del código de generación del CSV de bateadores (`server.ts` + `src/utils.ts` + `src/etl/transformers/vortexMetrics.ts`), contrastada contra el CSV real en producción (`https://mlbdataengine.onrender.com/api/batters-dataset/csv`, descargado hoy: 990 filas, 342 columnas, juegos del 13 al 16 de septiembre) y contra tres fuentes externas en vivo: MLB Stats API, Baseball Savant y el propio `pitcher_stats_pit.json` del backfill. Objetivo: cerrar de una vez el mapa de qué columnas son confiables y cuáles no, más allá de los 4 hallazgos originales del reporte externo.

Metodología: para cada bloque de columnas se revisó (a) el código que las genera, (b) si el CSV real muestra patrones sospechosos (constantes, pares que deberían diferir y no difieren, todo-vacío), y (c) cuando fue posible, se comparó el valor de una fila real contra la fuente externa consultada en vivo el mismo día.

---

## 1. Hallazgo más urgente — el backfill point-in-time lleva 4 días sin correr

**Esto no es un bug de código, es un problema operativo activo ahora mismo.**

`pitcher_stats_pit.json` (el archivo que corrige los stats de temporada del lanzador para que reflejen la fecha del partido y no la fecha de descarga) se modificó por última vez el **12 de septiembre**. El CSV que exporta la app hoy (16 de sept) cubre partidos del 13 al 16 — ninguno de esos 55 `game_id` existe en el archivo de backfill.

Consecuencia verificada en el CSV real: en las **990 filas actualmente exportables (100%)** estas columnas están completamente vacías:

- `home_pitcher_era`, `whip`, `kPct`, `bbPct`, `wins`, `losses`, `ip`, `strikeouts`, `gs`, `stats_source` (y su espejo `away_*`)
- `home_pitcher_spin_rate`, `o_swing_pct`, `recent_velocity`, `savant_pit_source` (y su espejo `away_*`)

El fix de la sesión anterior (dejar la celda vacía en vez de usar el valor crudo contaminado cuando no hay cobertura PIT) está funcionando exactamente como se diseñó — el problema es que, sin una corrida periódica del backfill, **todo el dataset más reciente (el que más te importa para uso en vivo) queda sin las columnas más básicas de pitcheo.**

**Actualización (ver sección 8): esto NO era solo un tema de programar la ejecución.** El backfill ya se dispara automáticamente en cada extracción (`/api/harvest` lo llama al final), y sí corre bien — el problema real era que su resultado nunca sobrevivía a un redeploy de Render. Ver sección 8 para el diagnóstico completo y el fix ya implementado.

---

## 2. Nuevas fugas de datos confirmadas (no estaban en los 4 hallazgos originales)

Todas estas comparten el mismo patrón raíz que ya conocías de Baseball Savant: se consulta un endpoint de MLB que devuelve "acumulado a HOY", sin ningún parámetro de fecha, y ese valor se graba en la fila como si fuera "a la fecha del partido".

### 2.1 Splits de EQUIPO por mano (`home/away_splits_vs_rhp/lhp_avg/ops/obp/slg/hr`)
`fetchOffensiveSplits` usa `stats=statSplits&season=X` sin fecha. Solo `_rpg` (runs per game) se corrigió en el sprint de hoy con reconstrucción real partido-por-partido; **avg/ops/obp/slg/hr del mismo bloque siguen contaminados.**

Verificación externa (James Wood, fila del 13-sept en el CSV vs. MLB Stats API consultada hoy):

| campo | CSV (fila 13-sept) | MLB API (hoy, 16-sept) |
|---|---|---|
| ops_vs_rhp | 0.961 | 0.965 |
| ops_vs_lhp | 0.836 | 0.826 |

El valor ya se movió respecto a la fila histórica — confirma que no está anclado a la fecha del partido, sino a la fecha en que corrió el harvest.

### 2.2 Splits del BATEADOR por mano (`ops_vs_rhp/lhp`, `slg_vs_rhp/lhp`, `k_pct_vs_rhp/lhp`)
Mismo endpoint (`fetchBatterSplits`, `stats=statSplits&season=X` sin fecha), mismo problema. Nota importante: `contact_pct_vs_rhp/lhp` del mismo bloque **sí** se corrigió hoy (ahora viene de Baseball Savant con corte point-in-time), pero `ops/slg/k_pct` del mismo bloque **no** — quedaron con el mismo nivel de riesgo que tenían antes.

### 2.3 Ofensiva base de equipo (`ofensa_run_g_home/away`, `ofensa_ops_home/away`, `ofensa_obp_home/away`, `ofensa_slg_home/away`)
`fetchTeamOffense` usa `stats=season&season=X` sin fecha. Esto estaba catalogado como "riesgo medio, sin verificar" en la auditoría anterior — con esta revisión de código queda **confirmado como fuga**, igual que los splits. (`home_offense_kPct` es distinto y está bien — ver sección 4.)

### 2.4 ERA y uso del bullpen (`bullpen_era_home/away`, `bullpen_usage_home/away`)
`fetchTeamBullpenERA` usa `stats=statSplits&sitCodes=rp&season=X` sin fecha. **Esto corrige una nota de la auditoría anterior**, que había marcado "bullpen" como 🟢 limpio en general. Esa marca era correcta solo para `home/away_bullpen_ip_3d/7d` y los conteos de relevistas usados (esos sí vienen de `fetchBullpenFatigue`, que recibe la fecha del partido y filtra correctamente). Pero **ERA y "uso" del bullpen no tienen esa protección** y quedan expuestos al mismo problema.

---

## 3. Columnas nunca implementadas (no son fuga, son funcionalidad muerta)

- **`lineup_confirmed`** y **`lineup_source`**: el código de exportación lee `g.lineups?.lineup_confirmed` y `g.lineups?.lineup_source`, pero en ningún lugar de todo `server.ts` se escribe esa propiedad — ni siquiera existe la palabra `lineupConfirmed` en el archivo. El campo se diseñó (hasta tiene un comentario explicando qué debería documentar) pero nunca se conectó al harvest real. Sale siempre `0` / vacío en el 100% de las filas, para siempre, hasta que alguien lo implemente.
- **`line_source` vacío en el 100% de las filas**: esto **no es un bug** — es consistente con el hallazgo ya conocido de que las cuotas no se capturan automáticamente en ~95% de los casos. El código de `getBettingLineSource` se comporta bien (vacío cuando no hay línea real que reportar).

---

## 4. Confirmado LIMPIO en esta ronda (resuelve dudas pendientes de la auditoría anterior)

- **Rolling last3/last5 del lanzador** (`home/away_pitcher_last3_*`, `last5_*`): usa `stats=gameLog` y filtra explícitamente `new Date(log.date) < targetDate` antes de tomar los últimos 3/5 starts. Bien anclado a la fecha del partido. Esto cierra el último punto que estaba "sin verificar, riesgo medio" en la auditoría de agosto.
- **Stats base del bateador por juego** (`avg, obp, slg, ops, woba, iso, pa, hits, doubles, triples, home_runs, strikeout_pct, walk_pct` — el bloque principal, no los splits por mano): vienen de `boxscore.seasonStats`, un recurso de MLB anclado al boxscore de ESE partido específico, estructuralmente distinto (y más seguro) que las consultas "a la fecha actual" usadas en los splits. Confianza media-alta.
- **`home_offense_kPct`/`away_offense_kPct`**: se calculan agregando el `kPct` real de cada bateador del lineup (ya point-in-time por lo anterior), no desde el endpoint contaminado de `fetchTeamOffense`. Limpio.
- **Arsenal de lanzamientos** (`fastball_pct`, `slider_pct`, etc.): verificado contra Baseball Savant en vivo para Riley Cornelio — valores del CSV (fastball 42.8%, slider 49.9%) están en el rango correcto frente a Savant hoy (FF 41% + cutter 8.5%, slider 50.5%); la diferencia es consistente con el mismo problema de snapshot no anclado a fecha (ya documentado), no con un error de mapeo. Confirmé en el código que el cutter sí se agrupa correctamente dentro de "fastball".

---

## 5. Hallazgo menor de consistencia interna

La función gemela `generateMLDatasetCSV` (en `src/utils.ts`, sirve el endpoint `/api/ml-dataset/csv` — distinto del que usas normalmente) tiene su propia copia de `getLineupMetrics` con **el mismo error de escala** (contact%/K%/BB% multiplicados ×100 de más) que corregimos hoy en `vortexMetrics.ts`. No afecta tu CSV principal, pero si alguna vez usas ese otro endpoint hereda el mismo problema. Bajo costo de arreglar, lo dejo pendiente de tu decisión.

---

## 6. Resumen ejecutivo (semáforo)

| Bloque | Estado |
|---|---|
| contact_pct_vs_rhp/lhp | 🟢 corregido hoy (pendiente deploy) |
| splits RPG por mano (equipo) | 🟢 corregido hoy (pendiente deploy) |
| diff_record_last10 | 🟢 corregido hoy (pendiente deploy) |
| lineup_high_hardhit_batters_count | 🟢 corregido hoy (pendiente deploy) |
| batter_contact_stress_score / pitch_count_risk_score | 🟢 corregido hoy (pendiente deploy) |
| **Stats de pitcheo point-in-time (era/whip/K%/BB%/spin/o-swing)** | 🔴 **vacíos en el 100% de las filas actuales — backfill sin correr desde el 12-sept** |
| Splits de equipo por mano (avg/ops/obp/slg/hr) | 🔴 fuga confirmada, sin corregir |
| Splits de bateador por mano (ops/slg/k_pct) | 🔴 fuga confirmada, sin corregir |
| Ofensiva base de equipo (run_g/ops/obp/slg) | 🔴 fuga confirmada, sin corregir |
| ERA y uso del bullpen | 🔴 fuga confirmada, sin corregir |
| lineup_confirmed / lineup_source | ⚪ nunca implementado |
| line_source | 🟢 vacío esperado (no es bug) |
| Rolling last3/last5 pitcher | 🟢 confirmado limpio (nuevo) |
| Stats base del bateador (boxscore) | 🟢 confirmado limpio (nuevo) |
| home/away_offense_kPct | 🟢 confirmado limpio (nuevo) |
| Arsenal de lanzamientos | 🟢 verificado contra Savant, en rango correcto |
| Clima, park factors, target (actual_ks) | 🟢 confirmado limpio (auditoría anterior) |

---

## 7. Actualización — puntos 2.1 a 2.4 ya corregidos

Después de entregar este informe, se implementó la reconstrucción real point-in-time para los 4 leaks de la sección 2:

- **2.1 splits de equipo por mano**: `fetchTeamOffenseVsHandReal` — gameLog real de equipo cruzado con la mano del abridor rival de cada partido (mismo mecanismo ya usado para runsPerGame).
- **2.2 splits de bateador por mano**: `fetchBatterOffenseVsHandReal` — gameLog real del bateador cruzado con la mano del abridor rival de los partidos de su equipo (reutiliza el mismo mapa de manos calculado una vez por equipo, no una vez por bateador).
- **2.3 ofensiva base de equipo**: cambiado de `stats=season` a `stats=byDateRange` con corte en el día anterior al partido — confirmado en vivo que este endpoint sí respeta esas fechas para este bloque (a diferencia de los splits por mano).
- **2.4 ERA del bullpen**: confirmado en vivo que MLB ignora `sitCodes=rp` cuando se combina con `stats=byDateRange` (no existe un endpoint con ambos filtros a la vez), así que se calculó un ERA real de ventana móvil de 7 días reutilizando los boxscores que `fetchBullpenFatigue` ya descargaba para `ip_3d/7d` — sin llamadas nuevas a la API. `bullpen_usage_home/away` nunca fue un bug, ya estaba bien anclado a la fecha.

También se corrigió, de paso, el mismo bug de escala (contact%/K%/BB% ×100 de más) en la copia gemela de `getLineupMetrics` dentro de `generateMLDatasetCSV` (`src/utils.ts`, sirve `/api/ml-dataset/csv`).

Todo verificado con `tsc --noEmit` (0 errores nuevos), 39/39 tests, y build de esbuild limpio. **No se ha corrido un harvest real de extremo a extremo con este código** — la verificación fue estática (revisión de código + compilación + tests), así que vale la pena mirar con cuidado el primer CSV que generes después de desplegar estos cambios.

El punto **#1 (backfill sin correr)** sigue siendo puramente operativo — no requiere código, solo que corras `backfill_pitcher_stats_pit.py --reverify` (o lo programes). Eso queda como acción tuya porque no hay forma de ejecutarlo desde acá sobre tu proceso de Render.

---

## 8. Punto #1 — diagnóstico real y fix (16 de septiembre, sesión de seguimiento)

Pediste que el backfill corriera desde la primera extracción del día. Investigando eso, encontré que **el disparador que pediste ya existía en el código** — no era necesario construirlo:

- El frontend (`App.tsx`) ya dispara `/api/harvest` automáticamente en la primera visita del día MLB actual, si esa fecha todavía no tiene extracción.
- `/api/harvest` ya llama a `runBackfillPitSubprocess(...)` (el script Python) al final de cada corrida, tanto si la disparó el auto-harvest como el botón manual.
- Ese subproceso, además, corre bien: no hay ningún error de tipo `spawn python3 ENOENT` en el log, y los propios comentarios del código (`cronPipelineRoutes.ts`) confirman que el fix de la librería `requests` ya estaba desplegado y sin errores.

**Entonces, ¿por qué `pitcher_stats_pit.json` seguía congelado en el 12 de septiembre?** El disco local de Render es efímero — se borra en cada redeploy. `mlb_database.json` (los juegos) ya está a salvo de esto porque cada guardado se replica en Firestore y se restaura al arrancar el servidor. `pitcher_stats_pit.json`, `offense_stats_pit.json` y `boxscore_game_stats.json` **nunca recibieron ese mismo tratamiento** — vivían solo en el disco local. Resultado: el backfill corría bien en cada extracción y dejaba el archivo local actualizado, pero el siguiente `git push` (y por lo tanto cada redeploy de Render) revertía esos 3 archivos a la última versión commiteada en git — que resultó ser la del 12 de septiembre. El backfill nunca falló; su resultado simplemente no sobrevivía.

**Fix implementado (Firestore, mismo patrón que ya usan los juegos):**

- `savePitLookupEntries` / `loadAllPitLookupEntries` (nuevas, en `firestoreService.ts`): cada entrada de los 3 archivos (keyed por `game_id`) es su propio documento en una colección `pit_pitchers` / `pit_offense` / `pit_boxscore` — no un solo documento gigante, porque los 3 archivos combinados ya pesan más de 4MB y Firestore limita a 1MB por documento.
- `runBackfillPitSubprocess` (en `cronPipelineRoutes.ts`) ahora toma una foto de los 3 archivos antes de correr el script Python, y después sube a Firestore SOLO las entradas nuevas o cambiadas — no las ~2400 que ya existían en cada corrida.
- Al arrancar el servidor (`restorePitFilesFromFirestore` en `server.ts`, junto a `runStartupFirestoreSync`), se fusiona lo que haya en Firestore con lo que sobreviva en el disco local, y se escribe el resultado a los 3 archivos — así que un redeploy nuevo ya no pierde el progreso.
- `firestore.rules`: agregadas las reglas para las 3 colecciones nuevas (sin esto, todas las escrituras fallarían silenciosamente por el "Global Safety Net" que niega todo por default).
- `migrate_pit_to_firestore.ts` (nuevo, `npm run migrate:pit-to-firestore`): script de una sola vez para sembrar Firestore con las ~2400 entradas que ya existen en tu máquina local (la copia más completa y actualizada — Render, con disco efímero, nunca tuvo estos datos completos).

**Para que esto quede funcionando, hace falta que hagas 3 cosas, en este orden:**

1. **Desplegar las reglas de Firestore actualizadas** (`firebase deploy --only firestore:rules`, o pegar el contenido de `firestore.rules` en la consola de Firebase). Sin esto, todas las escrituras nuevas van a fallar calladas.
2. **Correr `npm run migrate:pit-to-firestore` una sola vez, en esta máquina** (donde viven los 2446/2416/2343 registros completos) — esto siembra Firestore con el historial existente.
3. **Hacer `git add` / `commit` / `push` como siempre** para que Render redepliegue con el código nuevo. A partir de ahí, cada extracción sincroniza automáticamente lo nuevo a Firestore, y cada redeploy futuro restaura desde ahí antes de servir nada.

Verificado con `tsc --noEmit` (mismo baseline de errores preexistentes, ninguno nuevo de este cambio), 39/39 tests, y build de esbuild limpio. Igual que con los 4 leaks anteriores: **no se ha corrido un ciclo real de redeploy-en-Render con este código todavía** — vale la pena que confirmes en `/api/diagnostics/render` o revisando el CSV después del primer harvest post-deploy que la cobertura PIT ya no se congela.
