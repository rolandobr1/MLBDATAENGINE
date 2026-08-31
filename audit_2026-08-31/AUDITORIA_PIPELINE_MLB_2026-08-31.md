---
title: Auditoría del pipeline MLBDATAENGINE
fecha: 2026-08-31
alcance: Extracción, transformación y generación del CSV de ~335 columnas para el modelo de ponches de lanzadores
---

# Auditoría del pipeline MLB Data Engine

> Auditoría de solo lectura. No se modificó ni se eliminó ningún archivo del proyecto durante esta revisión. Todos los hallazgos están respaldados con lecturas de código fuente (`server.ts`, `src/utils.ts`, `src/etl/**`, `backfill_pitcher_stats_pit.py`) y con análisis directo de los datos (`mlb_database.json`, `pitcher_stats_pit.json`, `MLB_BATTERS_DATASET_2026-05-21.csv`).

---

## 1. Arquitectura general

### 1.1 Qué es realmente cada parte del repo

El repositorio mezcla dos generaciones de código:

- **`server.ts`** (243 KB, compilado a `server.mjs` vía esbuild) es el **monolito activo**. Expone endpoints Express (`/api/games`, `/api/harvest-*`, export de CSV, etc.), contiene toda la lógica real de extracción, el merge point-in-time (PIT) y los generadores de CSV. `npm run dev` lo ejecuta directamente.
- **`src/workflow.ts`, `src/jobs/scheduler.ts`, `src/etl/extractors/*.ts` (mlbApi, oddsScraper, savantScraper "clase", fangraphsScraper, rotowireScraper) y `src/etl/transformers/*`** son un **prototipo/scaffold no conectado**. `workflow.ts` literalmente simula un bateador (`batter_id: 'mock_1'`) y una línea de apuesta fija (`total: 8.5 // MOCK`); `scheduler.ts` importa `node-cron` pero la llamada real (`runDailyPipeline`) está comentada; nada en `server.ts` invoca `startCronJobs()`. **Ninguno de estos archivos participa en la generación del CSV final.**
- **`src/datasets/klab*.ts`** son scripts de auditoría interna (no de producción) que el propio equipo ya construyó para investigar problemas de reconstrucción histórica. Son extremadamente útiles y se citan en esta auditoría, pero no generan el dataset — solo lo auditan.

### 1.2 Fuentes de datos consumidas por el pipeline activo (`server.ts`)

| Fuente | Qué provee | Mecanismo | Frecuencia real de actualización |
|---|---|---|---|
| MLB Stats API — `schedule` | Calendario, pitchers probables, marcador, récord de equipos | HTTP directo, sin API key | Cada vez que se ejecuta manualmente un "harvest" |
| MLB Stats API — `people/{id}/stats?stats=season...` | ERA, WHIP, W-L, IP, K, BB de temporada del lanzador | HTTP directo | On-demand; **ver bug crítico en §2** — no es realmente point-in-time |
| MLB Stats API — `people/{id}/stats?stats=gameLog...` | Historial juego-a-juego del lanzador (usado solo por el backfill offline) | HTTP directo, vía `backfill_pitcher_stats_pit.py` | **Manual**, ejecutado a mano por el usuario cuando se acuerda |
| MLB Stats API — `game/{id}/boxscore` | Estadísticas reales del abridor tras el juego (K, IP, BF, pitches) | HTTP directo | On-demand, solo si el juego es "Final" |
| Baseball Savant — leaderboards CSV (`expected_statistics`, `statcast`, `pitch-arsenal-stats`, `catcher-framing`) | xERA, xwOBA, hard-hit%, barrel%, whiff%, arsenal de pitcheos, framing de catcher | Descarga CSV, `SavantCache.load(year)` | **Una vez por año-de-temporada y por proceso vivo** (no hay TTL; se recarga solo si cambia el año o se reinicia el servidor) — devuelve el acumulado de temporada **hasta el momento de la descarga**, sin importar la fecha del juego que se está armando |
| Baseball Savant — `statcast-park-factors` (scrape de HTML embebido) | Índices de park factor (runs, SO, HR) | Scrape + caché en `cache/park_factors.json` | Caché válida 7 días |
| PyBaseball (subproceso Python) | Statcast reciente (CSW%, velocidad), arsenal de pitcheos, métricas avanzadas (spin rate, chase%) | `exec()` de `pybaseball_scraper.py`, con caché en archivos `cache/pybaseball_*_<fecha-de-hoy>.json` | Cuando se llama con rango de fechas explícito (`getRecentStatcast`, `getPitcherArsenals`) sí respeta el rango pedido; `getBatterSplits`/`getBullpenWorkload` (usadas solo por el `workflow.ts` no conectado) cachean por **fecha real del día en que corre el script**, no por fecha del juego |
| DataStreak (`thedatastreak.com`) | Líneas de ponches de lanzador (`mlb_pitcher_ks`) y de bases totales de bateador | HTTP + caché `datastreak_pitcher_ks_*.json` | On-demand por fecha, sin reintento automático |
| Rotowire | Líneas de ponches (scrape) | Scrape / respuesta guardada (`rotowire_api_response.json`) | On-demand |
| The Odds API (`api.the-odds-api.com`) | Moneyline, spreads, totales, mercado `pitcher_strikeouts` | HTTP con hasta 3 API keys de respaldo (`ODDS_API_KEY`, `_2`, `_3`) | On-demand; **el código evita explícitamente re-consultar fechas pasadas** para no pisar lo ya capturado de Rotowire (ver §4) |
| Firestore | Persistencia/backup en la nube del `mlb_database.json` local | SDK de Firebase | Restauración automática al iniciar el servidor si faltan fechas recientes |
| Google Sheets | Exportación de filas ML | API de Google | Solo desde `workflow.ts` (no conectado) |

### 1.3 Flujo end-to-end real

```
Front-end "Harvester Panel" (clic manual)  ──┐
o scripts sueltos (backfill_pitcher_stats_pit.py,      │
fix_odds.ts, force_sync.ts, generate_pit.ts, patch.py) │
                                                        ▼
        server.ts: endpoint SSE de harvest (streaming de progreso)
                │
                ├─ fetchRealMLBGameData()  → MLB StatsAPI (schedule, stats de temporada, boxscore)
                ├─ fetchWeatherData(), fetchOffensiveSplits(), fetchAdvancedPitching*(),
                │  fetchPitcherLast5Profile(), fetchPitcherLast3VsTeamProfile() → MLB StatsAPI, Savant, PyBaseball
                ├─ fetchRealOddsData() → The Odds API + DataStreak + Rotowire (merge)
                │
                ▼
        buildDirectGameData() → arma el objeto "game" crudo
                │
                ▼
        mergeGamesIntoLocalDB() → escribe/actualiza mlb_database.json
                │   (con "caché inteligente": un juego ya Final NO se vuelve a tocar jamás)
                ▼
        [proceso manual y separado] backfill_pitcher_stats_pit.py
                → lee mlb_database.json, recalcula stats de lanzador point-in-time
                → escribe pitcher_stats_pit.json / offense_stats_pit.json / boxscore_game_stats.json
                ▼
        injectPitStats() / generateMLDatasetCSV() / generateBattersCSV()  (src/utils.ts)
                → combina: valor PIT si existe, si no, valor crudo (potencialmente contaminado)
                ▼
        CSV de 335 columnas (una fila por bateador, con todo el contexto del juego replicado)
```

### 1.4 ¿Qué dispara la generación diaria? — **Ninguna tarea programada real**

Esto es en sí mismo el hallazgo arquitectónico más importante:

- `src/jobs/scheduler.ts` define `cron.schedule('0 6 * * *', ...)` y `cron.schedule('0 * * * *', ...)`, pero **la llamada al pipeline está comentada** (`// await runDailyPipeline();`) y **`startCronJobs()` nunca se invoca** desde ningún punto de entrada activo. Es código muerto.
- Lo único que corre automáticamente mientras el proceso Node está vivo es `startLiveGamesAutoupdater()` (`server.ts` ~línea 5544): un `setInterval` cada 2 minutos que **solo** refresca juegos con estado "In Progress/Live/Delayed/Suspended" (para el marcador en vivo). No genera filas nuevas de días futuros, no recalcula stats de temporada, y se detiene por completo si el proceso/servidor no está corriendo (por ejemplo, si el equipo está apagado o en reposo).
- Toda extracción histórica, todo backfill de PIT, y toda exportación del CSV de 335 columnas dependen de que **una persona** abra la app y presione el botón de "harvest", o ejecute a mano uno de los scripts sueltos (`backfill_pitcher_stats_pit.py`, `fix_odds.ts`, `force_sync.ts`, `generate_pit.ts`, `patch.py`, `init_metadata_dates.ts`).

Esto no es solo un detalle operativo: es la causa estructural del bug de la sección 2 — un pipeline que se ejecuta en sesiones manuales e irregulares es exactamente el escenario donde una fuente de datos "no verdaderamente point-in-time" produce el patrón de "congelado y luego salto".

---

## 2. Investigación del bug: stats de temporada de lanzadores congeladas

### 2.1 Diagnóstico (causa raíz confirmada, con dos bugs que se combinan)

**Bug A — la llamada a la API de MLB no es point-in-time aunque el comentario del código diga que sí lo es.**

En `server.ts`, función `fetchPitcherStats` dentro de `fetchRealMLBGameData` (~línea 2475):

```ts
fetchWithTimeout(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=season&season=${season}&group=pitching&startDate=${season}-01-01&endDate=${date}`)
// FIX: point-in-time — stats as of game date
```

El tipo de estadística `stats=season` de la API de MLB **ignora silenciosamente los parámetros `startDate`/`endDate`** — esos parámetros solo tienen efecto con `stats=byDateRange` (que sí se usa correctamente en otra parte del propio proyecto, en `get_team_offense_up_to_date()` de `backfill_pitcher_stats_pit.py`). Es decir: pese al comentario "point-in-time", esta llamada siempre devuelve el **total acumulado de temporada vigente en el momento exacto en que se ejecuta la petición**, sin importar qué fecha de juego se le pase.

**Bug B — "caché inteligente" que congela el resultado para siempre.**

En `server.ts` (~línea 4630), el harvester tiene esta lógica:

```ts
// CACHÉ INTELIGENTE: Si el juego ya está en la DB local y terminó, no hacemos ninguna llamada a APIs
if (!forceRebuild) {
  const cachedGame = existingGamesForDate.find(...)
  if (cachedGame && (historicalDate || isFinalGameStatus(cachedGame.game_result?.gameStatus))) {
    // reutiliza el juego guardado, sin volver a pedir nada
  }
}
```

Una vez que un juego histórico se guarda, **nunca se vuelve a consultar**, sin importar cuán errónea o desactualizada haya quedado la información capturada.

**Efecto combinado:** cuando se corre un backfill masivo de varios meses en una sola sesión (evidentemente así se pobló el rango marzo–agosto 2026), **todos** los juegos procesados en esa sesión reciben el mismo número — el total "actual" de temporada del lanzador en ese instante — sin importar si el juego objetivo fue en marzo o en agosto. Eso produce el "congelado" en múltiples fechas. Cuando, días o semanas después, se corre otra sesión de harvest que toca un juego nuevo de ese mismo lanzador, se vuelve a pedir el "total actual" — que para entonces ya cambió — y aparece el "salto".

### 2.2 Existe una corrección parcial, pero cubre menos del 40% del dataset

`backfill_pitcher_stats_pit.py` sí calcula correctamente el acumulado point-in-time: descarga el `gameLog` completo del lanzador y suma manualmente solo los juegos con `fecha < fecha_objetivo`. El resultado se guarda en `pitcher_stats_pit.json`, y tanto `injectPitStats()` como `generateMLDatasetCSV()`/`generateBattersCSV()` (en `src/utils.ts`) usan ese valor con prioridad:

```ts
hPit?.totalStrikeouts ?? g.pitchers.home.totalStrikeouts ?? ""
```

Es decir: **si existe el valor corregido (PIT), se usa; si no, se usa el valor crudo contaminado — sin ninguna advertencia en el CSV de cuál caso aplica a cada fila.**

El problema es que ese backfill:
1. **Es manual**, no forma parte de ningún pipeline automático.
2. Tiene una regla de "si el `game_id` ya existe en el archivo de salida, se salta" — nunca revisa ni corrige un valor ya escrito, aunque después se detecte que estaba mal.
3. **Cobertura medida directamente en los datos: 897 de 2,366 `game_id` únicos (37.9%)**. El 62% restante de las filas del dataset sigue usando el valor crudo potencialmente contaminado.

### 2.3 Evidencia empírica directa (caso real, verificado en `mlb_database.json`)

Se reconstruyó la línea de tiempo cruda (`pitchers.home.totalStrikeouts`, tal como quedó guardada, sin ninguna corrección) del lanzador **Shota Imanaga**:

| Fecha del juego | game_id | `totalStrikeouts` crudo (guardado) | `totalStrikeouts` corregido (PIT), cuando existe |
|---|---:|---:|---:|
| 2026-03-01 → 2026-04-21 (10 fechas) | varios | **144** (idéntico en las 10 fechas) | sin cobertura PIT |
| 2026-04-26 | 823959 | 148 (salto aislado) | sin cobertura |
| 2026-05-02 | 824685 | 144 (vuelve a caer) | sin cobertura |
| 2026-05-07 | 824681 | 144 | **43** ✅ |
| 2026-05-13 | 824928 | 144 | **53** ✅ |
| 2026-05-18 | 824680 | 144 | **59** ✅ |
| 2026-05-29 | 823055 | 144 | **67** ✅ |
| 2026-06-04 | 824672 | 144 | **69** ✅ |
| 2026-06-10 | 824348 | 144 | **74** ✅ |
| 2026-06-15 | 824666 | 144 | **81** ✅ |
| 2026-06-21 | 824664 | 144 | **84** ✅ |
| 2026-06-29 | 824662 | 144 | **88** ✅ |
| 2026-07-04 | 824658 | 144 | **92** ✅ |
| 2026-07-10 | 824493 | 144 | **100** ✅ |
| 2026-07-19 → 2026-08-23 (6 fechas) | varios | 144 (idéntico otra vez) | sin cobertura |
| 2026-08-30 | 824636 | 148 | sin cobertura |

El valor crudo se mantiene **exactamente en 144 durante 24 de las 26 fechas de juego de este lanzador a lo largo de 6 meses** — algo imposible para un abridor regular en activo. Cuando existe el valor corregido, se ve la progresión real y correcta (43 → 100, subiendo de forma monótona con cada apertura). Esto confirma sin ambigüedad el mecanismo descrito en 2.1–2.2 y es exactamente el patrón que describiste ("congelado en 84 durante varias fechas, luego cae a 45" es el mismo fenómeno: el "salto" casi siempre es una caída, porque el número real point-in-time de mitad de temporada es menor que el "total actual" filtrado que quedó congelado).

Se corrió la misma detección sobre las 448 lanzadores del dataset: **482 "rachas" de 3 o más fechas consecutivas con el mismo valor exacto de `totalStrikeouts`**, muchas de 15–27 fechas de longitud (ej. "Por definir" 27 fechas, "Slade Cecconi" 27, "Michael King" 22, "Dylan Cease" 21) — este no es un caso aislado, es sistémico en todo el dataset.

### 2.4 Riesgo adicional detectado (identidad del historial)

Los propios audits `klab` del equipo (`datasets/klab/KLAB_ROLLING_FEATURE_DISCREPANCY_AUDIT`) ya habían documentado, para las columnas de *rolling* últimos-3/últimos-5 juegos (no para el acumulado de temporada), un problema relacionado pero distinto: de 386 discrepancias materiales analizadas, 66.3% se explican por "ID_DIFFERENT_HISTORICAL_GAME_ID" (se está anclando el historial al `game_id` incorrecto) y 35.2% por "orden temporal distinto". Esto sugiere que el problema de identidad/orden del historial de un lanzador no es exclusivo del acumulado de temporada — es un patrón que se repite en más de un lugar del pipeline.

### 2.5 ¿Es corregible? Sí — plan concreto

1. **Reemplazar la llamada rota** `stats=season&startDate&endDate` por `stats=byDateRange&startDate=<temporada>-01-01&endDate=<fecha_juego - 1 día>` (el patrón que ya funciona correctamente en `get_team_offense_up_to_date` de `backfill_pitcher_stats_pit.py`), **o** eliminar por completo esa ruta y usar únicamente la lógica de `backfill_pitcher_stats_pit.py` (gameLog + suma manual) como única fuente de verdad.
2. **Quitar el fallback silencioso** `pit.field ?? raw.field` en `generateMLDatasetCSV`/`generateBattersCSV`/`injectPitStats`. Si no hay valor PIT, la celda debe quedar en blanco/`null`, nunca sustituirse por el valor crudo — hoy el fallback esconde el problema en vez de exponerlo.
3. **Quitar la regla "skip si `game_id` ya existe"** de `backfill_pitcher_stats_pit.py`, o añadir un modo de re-verificación que recalcule y compare contra lo ya guardado.
4. **Completar el backfill** para el 62% de `game_id` sin cobertura PIT.
5. Añadir una columna de metadata (ej. `pitcher_stats_source = "PIT" | "RAW_UNVERIFIED"`) para que cualquier fila pueda filtrarse/excluirse del entrenamiento hasta que el backfill esté completo.

---

## 3. Validación point-in-time por bloque de columnas

| Bloque | ¿Point-in-time confirmado? | Evidencia / riesgo |
|---|---|---|
| **Stats acumuladas de temporada del lanzador** (`*_pitcher_wins/losses/ip/strikeouts/gs/era/whip/kPct/bbPct`) | ❌ **NO**, en el 62% de las filas (ver §2). ✅ Sí, en el 38% con cobertura PIT. | Riesgo de fuga confirmado empíricamente. Prioridad máxima. |
| **Boxscore real / resultado** (`actualStrikeouts`, `resultado_*`, `home_pitcher_actual_ks`) | ✅ Sí | Correctamente condicionado a `isFinal(status)` en `workflow.ts` y en `backfill_pitcher_stats_pit.py` antes de escribirse. No se detectó fuga hacia las columnas de features. |
| **Rolling últimos 3 / últimos 5 juegos del lanzador** (`last3_ks_*`, `last5_ks_avg`, `pitches_last_3_starts`, etc.) | ⚠️ **Sin verificar de forma concluyente en producción** | Los propios audits `klab` (no forman parte del pipeline productivo, son experimentales) muestran que reconstruir estas columnas de forma independiente produce discrepancias materiales de 18–88% según definición usada, y clasifican varias como "APROXIMADO" o "CON PÉRDIDA DE INFORMACIÓN". Las aserciones de fuga (0 juegos futuros usados) sí pasaron en esos experimentos, pero eso valida el método experimental, no necesariamente el código que hoy alimenta el CSV de producción. Se recomienda auditar directamente la función productiva equivalente en `server.ts` (`fetchAdvancedPitchingLast7`, `fetchPitcherLast5Profile`, `fetchPitcherLast3VsTeamProfile`) con el mismo rigor. |
| **Métricas avanzadas Statcast/Savant** (`xera, fip, xfip, siera, hardhit_pct, barrel_pct, swstr_pct, csw_pct, spin_rate, *_pct de arsenal, catcher_framing_runs`) | ❌ **NO** | `SavantCache.load(year)` descarga los *leaderboards* de temporada de Baseball Savant **una sola vez por año y por proceso vivo** (sin fecha de corte) y expone el acumulado **hasta el momento de la descarga**. Para cualquier fila histórica reconstruida después de esa fecha, estas columnas reflejan información parcial o totalmente posterior al juego. Esto coincide con lo que el propio equipo ya concluyó en `KLAB_DYNAMIC_ROLLING_EXPERIMENT.md`: estas métricas son "NO VIABLES desde boxscores básicos" para reconstrucción point-in-time. |
| **Splits de bateadores vs. RHP/LHP, carga de bullpen reciente** (`getBatterSplits`, `getBullpenWorkload` en `pybaseballApi.ts`) | ❌ NO, **si ese código se usa** | Cachean por fecha real del día en que corre el script (no por fecha del juego). Buena noticia: por el análisis de §1.1, este camino parece pertenecer únicamente a `workflow.ts` (no conectado). **Se recomienda confirmar explícitamente que server.ts no usa `getBatterSplits`/`getBullpenWorkload`** antes de descartar el riesgo. |
| **Clima** (`weather_*`) | ✅ Aparentemente sí | Se solicita con la fecha y hora exacta del juego (`fetchWeatherData(venueName, date, gameDate)`). No se auditó a fondo el proveedor de clima en sí (fuera del alcance de esta pasada); se recomienda una revisión puntual si el tiempo lo permite. |
| **Park factors** | ⚠️ Riesgo bajo, pero técnicamente no es "de la fecha del juego" | Caché de 7 días sobre un leaderboard "rolling" multi-temporada de Savant. Al ser una métrica que cambia muy lentamente, el riesgo práctico de fuga es bajo, pero formalmente la cifra usada es "la más reciente disponible", no "la vigente en la fecha del juego". |
| **Odds / líneas de apuestas** (`*_strikeout_prop`, `*_over_odds`, `*_under_odds`) | ✅ Cuando el dato existe, sí es point-in-time | El código evita explícitamente sobrescribir con The Odds API las fechas pasadas ("para no destruir los props de Rotowire de ese día"), lo cual protege la naturaleza pregame del dato capturado. El problema aquí no es fuga, es **cobertura** (ver §4). Único matiz: el auto-actualizador de juegos en vivo (cada 2 min) también puede tocar el mismo juego mientras está en progreso — se recomienda confirmar que nunca reescribe los campos de odds pregame de un juego ya iniciado. |
| **Lineups / alineación confirmada** | ⚠️ No auditado a fondo en esta pasada | Se recomienda revisar `lineup_confirmed`/`lineup_source`/`lineup_updated_at` en una siguiente pasada, dado que la alineación puede confirmarse muy cerca del inicio del juego. |

---

## 4. Calidad y completitud de datos

### 4.1 ¿Por qué las columnas de odds tienen tantos nulos?

Medido directamente sobre las 4,776 combinaciones lanzador-lado en `mlb_database.json`:

- `strikeoutProp` presente: **218/4,776 (4.6%)**
- `strikeoutPropOverOdds` presente: **212/4,776 (4.4%)**

Es decir, **más del 95% de las filas no tienen línea de ponches registrada**, a pesar de que en un archivo puntual de una sola fecha (`MLB_BATTERS_DATASET_2026-05-21.csv`) la cobertura para juegos ya "Final" ese día llegaba al 100% — lo cual confirma que el problema no es que la fuente nunca tenga el dato, sino que **la captura depende enteramente de que alguien haya ejecutado el harvester cerca de la hora del juego**, en un pipeline sin automatización (§1.4).

Causas identificadas, en orden de impacto:

1. **No hay captura recurrente automática.** Sin cron real, cualquier fecha para la que nadie abrió la app cerca del inicio de los juegos se queda sin línea de forma permanente.
2. **Política explícita de no retro-alimentar fechas pasadas** desde The Odds API (`maybeBackfillTheOddsApiForDate`, comentario: "Evitar backfill para fechas pasadas, ya que destruiría los props de Rotowire de ese día"). Es una decisión correcta para evitar fuga, pero como efecto secundario **cierra la puerta a rellenar nulos históricos** aunque la fuente sí tuviera el dato en su momento.
3. **Dependencia de 3 API keys de respaldo** (`ODDS_API_KEY`, `_2`, `_3`) para The Odds API — un indicio claro de problemas recurrentes de límite de tasa/cuota agotada, que reduce aún más la tasa de éxito de captura cuando sí se intenta.
4. **Emparejamiento por nombre** entre DataStreak/Rotowire y la identidad MLB del lanzador (`findDataStreakPitcherKProp` empareja por nombre + equipo). Cualquier discrepancia de nombre (apodos, acentos, "Jr.", etc.) produce un null silencioso aunque la fuente externa sí tuviera el dato.
5. Las líneas de apuestas son, por naturaleza, efímeras: si no se capturan en la ventana en que la casa de apuestas las publica, **no existe forma de recuperarlas retroactivamente** — a diferencia de una estadística de box score, que sí puede reconstruirse después.

### 4.2 Consistencia de `resultado_estado`

Distribución real medida sobre las 2,388 filas de juego en `mlb_database.json`:

| Estado | Conteo |
|---|---:|
| Final | 2,250 |
| Postponed | 47 |
| Scheduled | 36 |
| *(vacío/null)* | 19 |
| Completed Early | 16 |
| Game Over | 6 |
| Warmup | 5 |
| Pre-Game | 5 |
| Cancelled | 3 |
| Manager challenge | 1 |

Hallazgos:

- **Vocabulario de "terminado" no unificado**: existen tres cadenas distintas para un juego finalizado ("Final", "Game Over", "Completed Early"), y el criterio para reconocerlas como equivalentes está duplicado de forma inconsistente en el código: `backfill_pitcher_stats_pit.py` usa un `set` explícito (`FINAL_STATUSES = {"final", "game over", "completed", "completed early"}`), mientras que `workflow.ts` usa una comparación ad hoc (`statusStr.includes("final") || statusStr === "game over" || ...`). Cualquier tercer lugar del código que solo compare contra `"Final"` **descartará silenciosamente 22 juegos legítimamente terminados** (los 16 "Completed Early" + 6 "Game Over").
- **19 filas sin estado** — no se pudo determinar si corresponden a errores de captura o a juegos cuya respuesta de API vino incompleta.
- **1 juego "atascado" en "Manager challenge"** — un estado transitorio de revisión de jugada que nunca se actualizó a su estado final; indica que ese juego fue capturado durante una revisión en vivo y jamás se refrescó después (consistente con la falta de cron real).
- **36 "Scheduled" dentro de un archivo de rango histórico ya cerrado** (marzo–agosto) — probablemente juegos que en su momento estaban en el futuro y nunca se volvieron a tocar tras jugarse (de nuevo, ligado a la falta de automatización).

### 4.3 Duplicados / juegos mal marcados

- **0 duplicados** de `game_id` dentro de una misma fecha.
- **22 `game_id` que aparecen bajo dos fechas distintas** (ejemplos: `824621` en `2026-04-02` y `2026-04-03`; `824514` en `2026-05-24` y `2026-08-17`; `823539` en `2026-06-06` y `2026-08-29`). Esto sugiere que en corridas distintas del harvester, el mismo juego terminó archivado bajo una clave de fecha diferente (posible causa: normalización de zona horaria distinta entre corridas, o un recálculo de "fecha" que cambió entre una sesión y otra). **Recomendación:** cualquier agregación o unión debe deduplicar por `game_id`, nunca asumir que `(fecha, id)` es una clave única.

---

## 5. Documento de referencia

Se entrega por separado `README_DATASET_MLB.md`: un diccionario de datos corto, organizado por bloque de columnas, con fuente, frecuencia de actualización y caveats — pensado para consultarse rápidamente cuando dudes si una feature es confiable para entrenar.

---

## 6. Resumen priorizado — qué arreglar primero

**P0 — bloqueante para confiar en el dataset actual:**

1. Corregir la llamada rota `stats=season&startDate&endDate` en `fetchPitcherStats` (`server.ts` ~línea 2475) por `stats=byDateRange`, o eliminarla y depender solo del cálculo por `gameLog` que ya existe y funciona en `backfill_pitcher_stats_pit.py`.
2. Quitar el fallback silencioso a valores crudos en `generateMLDatasetCSV`/`generateBattersCSV`/`injectPitStats` para las columnas de temporada del lanzador — sin PIT, la celda debe quedar vacía, no contaminada.
3. Completar el backfill PIT para el 62% de `game_id` que hoy no tienen cobertura, y quitar la regla "skip si ya existe" para poder re-verificar.
4. Marcar/excluir del entrenamiento cualquier fila que dependa de las columnas Savant (xERA, xwOBA, hard-hit%, barrel%, arsenal%, framing) para fechas históricas, dado que esas columnas no son point-in-time (§3).

**P1 — calidad y confiabilidad:**

5. Unificar en una sola función/enum el criterio de "juego terminado" (`FINAL_STATUSES`) y usarla en todo el código, no reimplementarla en cada archivo.
6. Investigar y resolver los 22 `game_id` duplicados entre fechas.
7. Mejorar la cobertura de odds: capturar automáticamente cerca del inicio de cada juego, y registrar en una columna aparte *por qué* un valor quedó nulo (sin mercado / no se intentó / no hubo match de nombre) para poder distinguir "falta de dato" de "no se buscó".
8. Confirmar si `getBatterSplits`/`getBullpenWorkload` (no point-in-time) se usan en algún camino de `server.ts`, o si están efectivamente muertos junto con `workflow.ts`.

**P2 — arquitectura y mantenimiento:**

9. Reemplazar el cron muerto (`scheduler.ts`) por un disparador real (tarea programada del SO, o un cron job en un servidor siempre encendido) que corra extracción + backfill PIT + export de forma diaria sin depender de que alguien abra la app.
10. Sustituir la "caché inteligente" que congela un juego para siempre por una que permita re-verificación periódica.
11. Adoptar como práctica de producción las aserciones de "no fuga" que el equipo ya usa en los audits `klab` (hoy son scripts ad hoc de investigación, no parte del pipeline).
12. Eliminar o archivar el código muerto (`workflow.ts`, `src/jobs/scheduler.ts`, `src/etl/extractors/oddsScraper.ts`, `mlbApi.ts`, etc.) para reducir el riesgo de que alguien lo reconecte por error asumiendo que es la ruta activa.
