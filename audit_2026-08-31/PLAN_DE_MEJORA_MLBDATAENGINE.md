---
title: Plan de mejora — MLBDATAENGINE
fecha: 2026-08-31
basado_en: AUDITORIA_PIPELINE_MLB_2026-08-31.md
---

# Plan de mejora del proyecto MLBDATAENGINE

Este plan parte de los hallazgos de la auditoría (`AUDITORIA_PIPELINE_MLB_2026-08-31.md`) y del inventario de componentes que hicimos después. Está organizado en fases con dependencias claras: las fases 1–2 son las únicas realmente bloqueantes para confiar en el dataset; el resto mejora mantenibilidad, seguridad y velocidad de desarrollo, y se puede hacer en paralelo o después sin riesgo para el modelo.

No se modificó ni se eliminó nada del proyecto al preparar este plan — es solo una hoja de ruta.

---

## Fase 0 — Contención inmediata (antes de tocar código)

No requiere desarrollo, son decisiones/operaciones de esta semana:

- [ ] No entrenar el modelo con el CSV completo tal cual está hoy. Si necesitas resultados ya, filtra primero a los `game_id` con cobertura en `pitcher_stats_pit.json` (~38% del dataset, ver auditoría §2.2).
- [ ] Haz una copia de `mlb_database.json` tal como está ahora (antes de cualquier fix o re-backfill), para poder comparar "antes vs. después" y confirmar que las correcciones realmente funcionan.
- [ ] No corras más backfills masivos multi-mes en una sola sesión hasta aplicar la Fase 1 — cada sesión así agrega más filas "congeladas" con el bug actual.

---

## Fase 1 — Integridad de los datos (P0, bloqueante)

**Objetivo:** que ninguna columna de temporada del lanzador pueda tener fuga de información futura.

1. **Corregir la llamada rota a la API de MLB.** En `server.ts`, función `fetchPitcherStats` (~línea 2475): reemplazar `stats=season&startDate=...&endDate=...` por `stats=byDateRange&startDate=<temporada>-01-01&endDate=<fecha_juego - 1 día>` (patrón que ya funciona en `get_team_offense_up_to_date` de `backfill_pitcher_stats_pit.py`). Alternativa más simple: eliminar esta llamada por completo y depender únicamente del cálculo por `gameLog` que ya existe y es correcto.
2. **Quitar el fallback silencioso** `pit.field ?? raw.field` en `generateMLDatasetCSV`, `generateBattersCSV` e `injectPitStats` (`src/utils.ts` / `server.ts`). Sin valor PIT confiable, la celda debe quedar vacía — nunca sustituirse por el valor crudo.
3. **Quitar la regla "skip si `game_id` ya existe"** en `backfill_pitcher_stats_pit.py`. Agregar un modo `--reverify` que recalcule y compare contra lo ya guardado, reportando diferencias.
4. **Completar el backfill** para el 62% de `game_id` sin cobertura PIT (897/2,366 hoy). Es un proceso de horas (limitado por rate-limit de la API de MLB), no de desarrollo — se puede dejar corriendo de un día para otro.
5. **Agregar una columna de metadata** `pitcher_stats_source = "PIT" | "RAW_UNVERIFIED"` en el CSV final, para poder filtrar/excluir filas no confiables sin tener que volver a auditar manualmente.
6. **Marcar o excluir las columnas de Baseball Savant** (`xera, xwoba, hardhit_pct, barrel_pct, swstr_pct, csw_pct, spin_rate`, arsenal %, framing) para filas históricas, dado que `SavantCache` no tiene corte de fecha (auditoría §3). Opciones: (a) columna `features_asof_date` que indique cuándo se descargó el leaderboard usado, para poder filtrar en el entrenamiento; o (b) separar el dataset en "training-safe" (sin estas columnas o con ellas nulas para filas viejas) y "live" (para predicción del día de hoy, donde sí son válidas).
7. **Confirmar si `getBatterSplits`/`getBullpenWorkload`** (`pybaseballApi.ts`, no point-in-time) se usan en algún camino de `server.ts` o si solo pertenecen a `workflow.ts` (código muerto). Si se usan en producción, aplican las mismas correcciones que en el punto 1.

**Criterio de salida de esta fase:** correr la misma detección de "rachas congeladas" que usamos en la auditoría (agrupar por lanzador, ordenar por fecha, buscar 3+ valores idénticos consecutivos) y confirmar que el número de rachas cae a (idealmente) cero para los juegos ya reprocesados.

---

## Fase 2 — Calidad y consistencia de datos

1. **Unificar el criterio de "juego terminado".** Hoy existen dos implementaciones distintas (`FINAL_STATUSES` como `set` en `backfill_pitcher_stats_pit.py` vs. comparación ad hoc `.includes("final")` en `workflow.ts`/`server.ts`). Crear una única función `isFinalStatus()` compartida (un archivo util) e importarla en todos lados, cubriendo `Final`, `Game Over` y `Completed Early` como equivalentes.
2. **Investigar y resolver los 22 `game_id` duplicados entre fechas** (ver auditoría §4.3). Determinar si es un problema de zona horaria al calcular la fecha, o de recomputo entre sesiones del harvester. Añadir una validación que alerte si un `game_id` ya existe bajo otra fecha antes de insertarlo de nuevo.
3. **Mejorar trazabilidad de odds/props:**
   - Agregar una columna (`*_prop_capture_status`, por ejemplo) que distinga explícitamente *"no había mercado disponible"* de *"no se intentó capturar"* de *"no hubo match de nombre con la fuente"* — hoy los tres casos se ven igual (celda vacía).
   - Revisar si vale la pena levantar la restricción de "no backfill de fechas pasadas" de The Odds API de forma controlada (por ejemplo, solo si Rotowire/DataStreak no capturaron nada ese día), en vez de aplicarla siempre.
4. **Automatizar la validación post-generación del CSV.** Convertir las verificaciones que hoy son manuales (los `verify_csv*.ts`, `check_dups.ts`, etc.) en un solo script `validate_dataset.ts` que corra automáticamente después de cada exportación y reporte: % de nulos por bloque de columnas, duplicados, distribución de `resultado_estado`, y rachas congeladas — con un código de salida que falle el pipeline si algo se sale de rango.

---

## Fase 3 — Automatización real del pipeline

1. **Reemplazar el cron muerto.** `src/jobs/scheduler.ts` no sirve tal cual (la llamada real está comentada y nunca se invoca). Decide entre dos caminos según dónde vaya a vivir esto:
   - Si sigue corriendo en tu máquina: usar el **Programador de tareas de Windows** para ejecutar un script (`.bat`/PowerShell) que dispare la extracción + backfill + export a una hora fija, sin depender de que abras la app.
   - Si se despliega a Cloud Run (como sugiere el `.env.example` con `APP_URL`): usar **Cloud Scheduler** para invocar un endpoint protegido que dispare el mismo flujo.
2. **Sustituir la "caché inteligente" que congela un juego para siempre** (`server.ts` ~línea 4630) por una política de reverificación periódica: por ejemplo, un juego histórico sin cobertura PIT se vuelve a intentar cada N días hasta lograrla, en vez de quedar frozen desde la primera captura.
3. **Dividir el pipeline en pasos explícitos y encadenados** (extracción → backfill PIT → validación → export), cada uno como comando independiente con su propio log y código de salida — hoy son responsabilidades mezcladas dentro de un solo endpoint SSE gigante.
4. **Registrar cada corrida en un log estructurado** (JSON o tabla simple: fecha de corrida, rango procesado, juegos nuevos, errores, resultado de la validación de la Fase 2.4) en vez de solo `console.log`. Esto es lo que te hubiera permitido detectar el bug de ponches congelados meses antes.

---

## Fase 4 — Higiene de código y mantenibilidad

Se puede hacer en paralelo a las fases 1–3, sin bloquear nada:

1. **Modularizar `server.ts`.** Hoy es un solo archivo de 243 KB con rutas, extracción, merge y generación de CSV mezclados. Separar en `routes/`, `etl/` (las funciones reales, no las de `src/etl/extractors` que están muertas), `services/`, y `csv/`.
2. **Consolidar los generadores de CSV casi duplicados.** Se identificaron al menos siete: `generateMLDatasetCSV`, `generateBattersCSV`, `generateSingleGameCSV`, `generateMLBDataCSV`, `generateDailyPlayerResultsCSV`, `generateKPropsLinesCSV`, `generateBatterTotalBasesLinesCSV`. Definir una sola fuente de verdad para "cómo se calcula cada valor" y que estas funciones sean solo distintas "vistas" (selección de columnas) sobre esa fuente — hoy un fix como el de la Fase 1 hay que aplicarlo por separado en cada una si todas calculan el mismo campo de forma independiente.
3. **Eliminar o archivar el código muerto**: `src/workflow.ts`, `src/jobs/scheduler.ts`, `src/etl/extractors/{mlbApi,oddsScraper,rotowireScraper,savantScraper,fangraphsScraper}.ts`, `src/etl/transformers/*`, `src/services/firestoreService_temp.ts`. Si no se van a reconectar, mejor moverlos a una carpeta `_archive/` o borrarlos (con git, no se pierden) para que nadie asuma por error que son la ruta activa.
4. **Convertir los ~30 scripts sueltos de la raíz en un mini-CLI documentado.** Por ejemplo `npm run tool -- backfill-pit --from 2026-01-01`, con un `TOOLS.md` que diga qué hace cada comando, cuándo se corrió por última vez y si es seguro re-ejecutarlo (muchos, como `fix_odds.ts`, tienen fechas hardcodeadas de una reparación puntual pasada).
5. **Reducir el uso de `any`** en las zonas críticas (merge PIT, generación de CSV) — con tipos reales, TypeScript hubiera marcado en rojo varias de las inconsistencias de esquema que encontramos (`pitchers.home.id` vs. `pitchers.home_starter.id`, por ejemplo).
6. **Migrar las "pruebas" ad hoc a un framework real** (ej. Vitest, ya que el proyecto usa Vite). Hoy `test_csv*.ts`/`verify_*.ts` solo imprimen resultados en consola para revisión manual; con `expect()` reales se pueden correr en CI y fallar automáticamente si alguien rompe algo.

---

## Fase 5 — Seguridad

1. **Revisar el modelo de autenticación de Firestore.** Las reglas (`firestore.rules`) exigen `isSignedIn()` (`request.auth != null`) para leer/escribir `games`, `mlb_bets` y `mlb_users`, pero el servidor usa **autenticación anónima** (`ensureAnonymousAuth()` en el arranque). Eso significa que, en la práctica, cualquiera que cargue la app puede autenticarse sin credenciales y cumplir `isSignedIn()` — las reglas no distinguen "tú" de "cualquier visitante". Si esta app alguna vez se expone fuera de tu red local, vale la pena decidir si eso es aceptable o si se necesita autenticación real basada en UID específico.
2. **Confirmar higiene de secretos.** El `.gitignore` ya excluye `.env*` (salvo `.env.example`) y `mlb_database.json`, lo cual está bien. Vale la pena una revisión única del historial de git (`git log -p -- .env.local`) para confirmar que ninguna clave quedó commiteada antes de que existiera esa regla.
3. **Manejo de cuota de The Odds API.** Hoy se rotan 3 API keys de respaldo, lo cual sugiere que el límite de tasa se agota seguido. Mejor que solo rotar keys: detectar explícitamente el código 429, aplicar backoff, y cachear más agresivamente para reducir el número de llamadas necesarias.

---

## Fase 6 — Frontend (menor prioridad, cuando lo anterior esté estable)

1. **Dividir `GameCard.tsx` (146 KB) y `BetTracking.tsx` (108 KB)** en subcomponentes más chicos — hoy cualquier cambio pequeño obliga a tocar un archivo enorme y dificulta el debugging.
2. **Evaluar separar `BetTracking`** (tu registro personal de apuestas) del proyecto de pipeline de datos — hoy comparte código y colecciones de Firestore con el ETL sin relación funcional directa, lo que añade superficie de cambio innecesaria cuando tocas una u otra cosa.
3. Revisar rendimiento de render con muchas tarjetas de juego simultáneas si el dataset de un día crece mucho.

---

## Orden sugerido y dependencias

```
Fase 0 (ya)
   │
   ▼
Fase 1 (P0 — bloqueante) ──┐
   │                        │
   ▼                        ▼
Fase 2 (calidad datos)   Fase 4 (higiene de código, en paralelo)
   │                        │
   ▼                        ▼
Fase 3 (automatización) ──► Fase 5 (seguridad, en paralelo)
   │
   ▼
Fase 6 (frontend, al final)
```

Las Fases 1 y 2 son las únicas que afectan directamente si puedes confiar en el modelo que entrenes. Las Fases 4 y 5 se pueden ir haciendo en paralelo sin esperar a que termine el resto. La Fase 6 es la de menor urgencia — no afecta la calidad del dataset ni del modelo.

## Qué NO hacer todavía

- No migrar de Firestore/JSON local a otra base de datos — no es el problema actual y agregaría riesgo sin necesidad.
- No reescribir `server.ts` desde cero — modularizarlo incrementalmente (Fase 4) es más seguro que una reescritura completa.
- No intentar "arreglar" las columnas de Savant reconstruyéndolas retroactivamente con boxscores básicos — los propios audits `klab` del proyecto ya concluyeron que no es viable con los datos locales actuales; es mejor marcarlas como no confiables (Fase 1, punto 6) que invertir tiempo en una reconstrucción que no va a ser exacta.
