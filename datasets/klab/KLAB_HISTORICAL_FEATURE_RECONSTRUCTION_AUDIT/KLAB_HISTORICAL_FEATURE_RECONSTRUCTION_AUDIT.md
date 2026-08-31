# K-Lab — Auditoría de reconstrucción histórica

## Conclusión ejecutiva

`mlb_database.json` permite reconstruir rolling features de abridores y, por separado, apariciones completas. `liveBoxscore` contiene 20,113 líneas de pitchers y 19,685 IDs; 19,239 líneas finalizadas tienen ID y todas las estadísticas requeridas.

La fuente contiene 4,160 filas completas de abridor (2,080 HOME / 2,080 AWAY) y 445 pitchers. Esta es cobertura estructural, no cobertura pregame: el ID del target proviene del boxscore final.

## Inventario

- Juegos locales en rango: 2,261; finalizados: 2,182.
- Lados de abridor final: 4,364; con ID: 4,160; completos en K/IP/BF/pitches/BB/H/R/ER: 4,160.
- Campos disponibles: game_id, date, capture timestamp, team, side, starter playerId, K, IP, BF, pitches, BB, H, R, ER.
- No disponible: game_end confiable, gamesStarted explícito y target pitcher pregame universal.
- Ventanas de apariciones para targets abridores, escenario B: last3 3,394 (81.59%); last5 2,961 (71.18%). Se mantienen separadas de ventanas de aperturas.

## Escenario A — estricto

- Last 3 completo: 53 (1.27%).
- Last 5 completo: 1 (0.02%).
- Last 10 completo: 0 (0.0%).

## Escenario B — fecha

- Last 3 completo: 3,102 (74.57%).
- Last 5 completo: 2,615 (62.86%).
- Last 10 completo: 1,656 (39.81%).

## Comparación last3Ks1 — escenario B

- Comparables: 3,144.
- Coincidencia exacta: 87.72%.
- Diferencia absoluta media: 0.3321.
- Diferencia máxima: 8.0.
- Correlación: 0.8969.
- Diferencias materiales: 386.

Las discrepancias se explican plausiblemente por el uso actual de MLB gameLog, filtro `gamesStarted`, fallback a apariciones, backfills, timestamps de captura y falta de historia anterior a marzo en la fuente local.

## Leakage

Todas las reconstrucciones verifican `history_date < target_date`, ID igual y game_id distinto. El resultado/actual_k del target no entra en ninguna fórmula. El ID del target sí proviene retrospectivamente del boxscore final, por lo que estas filas no deben considerarse pregame hasta disponer de evidencia independiente.

## Clasificación

### Grupo 1 — alta confianza

Rolling K/IP/BF/pitches/BB/H/R/ER, sumas, medias, desviaciones poblacionales, descanso y tendencia simple, tanto para aperturas como para apariciones identificadas, siempre que el target pitcherId sea pregame.

### Grupo 2 — con condiciones

Ventanas 1/3/5/10 de aperturas; season-to-date; escenario B; cualquier proyección que dependa de las rolling features.

### Grupo 3 — no reconstruibles

Lineup/clima pregame, park factor exacto, xERA/xFIP/SIERA, SwStr%, CSW% y pitch-level.

## Propuesta

Una fila por `target_game_id + pregame_pitcher_id + side`; congelar features antes del inicio; conservar lineage de game_ids previos; unir `actual_k` sólo después del freeze. El techo estructural es 4,160 filas equilibradas, pero la cobertura defendible actual sigue siendo 265 hasta resolver identidad pregame.
