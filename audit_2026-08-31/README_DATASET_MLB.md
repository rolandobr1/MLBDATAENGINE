---
title: Diccionario de datos — CSV de 335 columnas (MLBDATAENGINE)
fecha: 2026-08-31
---

# README del dataset — guía rápida de confiabilidad por columna

Referencia corta para consultar cuando dudes si una feature es confiable para entrenar el modelo de ponches. Ver `AUDITORIA_PIPELINE_MLB_2026-08-31.md` para el detalle completo y la evidencia de cada punto.

Generado por: `generateBattersCSV()` en `src/utils.ts` (335 columnas, una fila por bateador + todo el contexto del juego repetido en cada fila). Confirmado por conteo directo sobre `MLB_BATTERS_DATASET_2026-05-21.csv`.

Leyenda de confiabilidad:
- 🟢 Point-in-time confirmado — segura para entrenar en filas históricas.
- 🟡 Point-in-time parcial / no verificado a fondo — usar con precaución, o solo para filas recientes/en vivo.
- 🔴 NO point-in-time confirmado — no usar en filas históricas sin corregir primero.

| Bloque de columnas (prefijo) | Fuente | Frecuencia de actualización | Confiabilidad | Caveat principal |
|---|---|---|---|---|
| `game_id`, `date`, `hora`, `equipo_home/visitante`, `estadio` | MLB Stats API `schedule` | Por corrida manual del harvester | 🟢 | — |
| `home/away_pitcher_wins/losses/ip/strikeouts/gs/ip_avg_start` | MLB Stats API `stats=season` + backfill offline | Manual, sin cron | 🔴/🟢 mixto | **Bug confirmado**: 62% de las filas usan un valor crudo NO point-in-time (congelado o con fuga de fechas futuras). Solo el 38% con cobertura en `pitcher_stats_pit.json` es confiable. Ver auditoría §2. Antes de usar, filtrar por si existe cobertura PIT para ese `game_id`. |
| `home/away_pitcher_era/whip/kPct/bbPct` | Igual que arriba | Igual que arriba | 🔴/🟢 mixto | Mismo problema — vienen del mismo objeto `pitchers.home/away`. |
| `home/away_pitcher_strikeout_prop`, `*_over_odds`, `*_under_odds`, `*_source` | The Odds API + DataStreak + Rotowire | On-demand, cerca de la hora del juego | 🟢 cuando no es nulo | ~95% de nulos históricos (no es fuga, es falta de captura — ver auditoría §4.1). No imputar con la media; considerar una columna adicional de "tenía mercado disponible" si se necesita distinguir nulo real de "no capturado". |
| `bullpen_era_home/away`, `bullpen_usage_*`, `bullpen_ip_7d_*`, `bullpen_ip_3d_*`, `bullpen_relievers_*` | MLB Stats API (boxscore + agregados por equipo) | On-demand | 🟢 | No auditado a nivel de fuga en esta pasada más allá de la revisión general; parece derivarse de datos ya jugados. |
| `ofensa_run_g_*`, `ofensa_ops/obp/slg_*`, `*_offense_kPct` | MLB Stats API `teams/{id}/stats?stats=season` | On-demand | 🟡 | Mismo patrón de riesgo que las stats de lanzador (llamada a "season" sin filtrar por fecha) — **no se verificó si esta ruta usa `byDateRange` o el mismo patrón roto**. Tratar como no confirmado hasta revisar. |
| `weather_*` | Proveedor de clima externo, por fecha/hora del juego | On-demand | 🟡 | Fecha/hora del juego se pasa correctamente a la función; el proveedor específico no se auditó a fondo. |
| `home/away_splits_vs_rhp/lhp_*` | MLB Stats API splits | On-demand | 🟡 | No se confirmó ventana temporal exacta en el camino productivo (distinto del camino simulado en `workflow.ts`). |
| `home/away_pitcher_xera/fip/xfip/siera/hardhit_pct/barrel_pct/swstr_pct/csw_pct/*_pct de arsenal`, `*_catcher_framing_runs` | Baseball Savant *leaderboards* (`SavantCache`) | **Una vez por temporada y por proceso vivo** (sin corte de fecha) | 🔴 | Confirmado NO point-in-time: refleja el acumulado de Savant al momento de la descarga, no al momento del juego. Ya señalado como "no reconstruible" en los propios audits internos (`klab`). No usar para filas históricas sin una fuente alternativa. |
| `*_last3_ks_1/2/3`, `*_last5_ks_avg/std`, `*_last5_ip_avg`, `*_last5_bf_avg`, `*_last5_pitch_count_avg`, `pitches_last_3_starts`, `days_since_last_start`/`daysSinceLastAppearance` | MLB Stats API `gameLog`, ventana calculada en `server.ts` | On-demand | 🟡 | Los audits `klab` (experimentales, no productivos) muestran que reconstruir estas ventanas de forma independiente da discrepancias materiales de 18–88% según la definición ("últimas aperturas" vs. "últimas apariciones"); el nombre de algunas columnas no coincide con lo que realmente calculan (ej. `pitchesLast3Starts` suma apariciones, no aperturas). Revisar la función productiva equivalente antes de confiar plenamente. |
| `home/away_pitcher_projected_pitches/innings/strikeouts` | Derivado internamente (`vortexMetrics.ts` / proyecciones) | On-demand | 🟡 | Proyección, por definición no es un "hecho" point-in-time — evaluar si se usa como feature (válido) o se confunde con un resultado real. |
| `park_factor_k` / índices de park factor | Baseball Savant, caché de 7 días | Cada 7 días | 🟢 (riesgo bajo) | Técnicamente refleja "el más reciente disponible", no "el vigente en la fecha exacta del juego" — aceptable porque el park factor cambia muy lentamente temporada a temporada. |
| `resultado_carreras_home/visitante`, `resultado_ganador`, `resultado_estado`, `actual_k`/`actualStrikeouts` (target) | MLB Stats API boxscore, solo si el juego es Final | On-demand, gateado por `isFinal()` | 🟢 | Correctamente aislado del resto de features (no se usa antes de que el juego termine). Pero ver el problema de vocabulario abajo. |
| `lineup_confirmed`, `lineup_source`, `lineup_updated_at` | MLB Stats API / boxscore | On-demand | 🟡 | No auditado a fondo en esta pasada. |
| Métricas "VORTEX V10.3" (`*_pitchHand`, `*_rest_status`, `*_lineup_contact_stress_score`, `*_spin_rate`, `*_stuff_plus`, `*_o_swing_pct`, `*_k_pct_vs_lhb`, etc.) | Mezcla de MLB Stats API + PyBaseball + Savant | On-demand | 🟡/🔴 mixto | Heredan la confiabilidad de su fuente original (ver filas de Savant/PyBaseball arriba); no se auditaron una por una en esta pasada. |

## Caveats generales que aplican a **todo** el dataset

1. **No hay generación diaria automática.** Cada fila fue producida en alguna sesión manual del harvester o de un script suelto. Si necesitas saber "cuándo se generó realmente" una fila, usa el campo interno `timestamp`/`snapshot_captured_at` cuando esté disponible — no asumas que coincide con la fecha del juego.
2. **`resultado_estado` no está unificado.** Valores observados: `Final`, `Game Over`, `Completed Early` (los tres significan "terminado"), además de `Postponed`, `Scheduled`, `Cancelled`, `Warmup`, `Pre-Game`, `Manager challenge` (un estado transitorio que quedó "pegado" en al menos un juego) y filas sin estado. Si vas a filtrar "juegos terminados", incluye los tres valores de "terminado", no solo `"Final"`.
3. **Dedupe por `game_id`, no por `(fecha, game_id)`.** Se confirmaron 22 `game_id` archivados bajo dos fechas distintas.
4. **Las columnas de temporada del lanzador (ver tabla) son la prioridad #1 de corrección** antes de entrenar cualquier modelo — es el bug que reportaste, confirmado y cuantificado en la auditoría completa.
5. Este README describe el estado del código y los datos al **2026-08-31**. Si el pipeline se corrige (ver plan de la auditoría §2.5 y §6), actualizar esta tabla.
