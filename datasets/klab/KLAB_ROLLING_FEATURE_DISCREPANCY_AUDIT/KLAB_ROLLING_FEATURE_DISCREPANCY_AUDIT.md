# K-Lab — Auditoría de discrepancias de rolling features

## Conclusión ejecutiva

Se reprodujeron exactamente las **386** discrepancias materiales de `last3Ks1` sobre 4,160 pitcher-juegos. La definición con mejor coincidencia componente-a-componente en DATE_ONLY fue **LAST3_STARTS**, pero no se declara equivalente.

## Definición actual observada en código

- Fuente rolling: `MLB StatsAPI people/{pitcherId}/stats?stats=gameLog&season={season}&group=pitching`.
- Filtra fechas estrictamente anteriores y ordena descendente.
- Prefiere `gamesStarted > 0`; cuando falta, usa IP >= 3.0; si no queda ninguna apertura, usa todas las apariciones.
- Las métricas de fatiga no filtran aperturas: usan las últimas apariciones aunque sus nombres digan `Start/Starts`.
- No existe filtro explícito de competición ni fallback de temporada anterior.

## LAST3: starts frente a appearances

| Escenario | Definición | Comparables | Cobertura 3 | Exactitud | MAE | Correlación | Discrepancias |
|---|---|---:|---:|---:|---:|---:|---:|
| STRICT | LAST3_STARTS | 761 | 53 | 18.4% | 2.3233 | 0.2217 | 621 |
| STRICT | LAST3_APPEARANCES | 1,223 | 153 | 18.56% | 2.354 | 0.3451 | 996 |
| DATE_ONLY | LAST3_STARTS | 8,615 | 3,102 | 78.21% | 0.5977 | 0.807 | 1,877 |
| DATE_ONLY | LAST3_APPEARANCES | 8,872 | 3,394 | 76.96% | 0.6119 | 0.8139 | 2,044 |

DATE_ONLY sólo demuestra precedencia por fecha. STRICT exige timestamp de registro anterior al inicio programado, pero ese timestamp no representa necesariamente `game_end`.

## Clasificación de las 386 discrepancias

Una discrepancia puede tener múltiples causas; por ello los porcentajes no suman 100%.

| Causa | Casos | % de 386 |
|---|---:|---:|
| A_LOCAL_HISTORY_COVERAGE_GAP | 0 | 0.0% |
| B_START_VS_RELIEF_APPEARANCE | 99 | 25.65% |
| C_GAMESSTARTED_CRITERION | 0 | 0.0% |
| D_GAMELOG_VS_BOXSCORE | 0 | 0.0% |
| E_BACKFILL_OR_LATE_RECORD_TIMESTAMP | 382 | 98.96% |
| F_NON_MLB_GAME | 43 | 11.14% |
| G_DIFFERENT_TEMPORAL_ORDER | 136 | 35.23% |
| H_DUPLICATE_RECORD | 1 | 0.26% |
| I_DIFFERENT_HISTORICAL_GAME_ID | 256 | 66.32% |
| J_LAST_APPEARANCE_DEFINITION | 120 | 31.09% |
| K_LAST_START_DEFINITION | 99 | 25.65% |
| L_SEASON_BOUNDARY | 0 | 0.0% |
| M_UNEXPLAINED | 130 | 33.68% |

## Ejemplos reales (20)

| game_id | pitcher_id | stored | reconstructed | historical_game_id | causa |
|---|---:|---:|---:|---|---|
| 824622 | 691799 | 1.0 | 0.0 | 831904 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|F_NON_MLB_GAME|J_LAST_APPEARANCE_DEFINITION|I_DIFFERENT_HISTORICAL_GAME_ID |
| 823730 | 690953 | 4.0 | 6.0 | 831606 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|F_NON_MLB_GAME|B_START_VS_RELIEF_APPEARANCE|J_LAST_APPEARANCE_DEFINITION|K_LAST_START_DEFINITION|I_DIFFERENT_HISTORICAL_GAME_ID |
| 825102 | 527048 | 3.0 | 1.0 | 831453 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|F_NON_MLB_GAME|B_START_VS_RELIEF_APPEARANCE|J_LAST_APPEARANCE_DEFINITION|K_LAST_START_DEFINITION|I_DIFFERENT_HISTORICAL_GAME_ID |
| 822755 | 641793 | 1.0 | 3.0 | 831452 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|F_NON_MLB_GAME|B_START_VS_RELIEF_APPEARANCE|J_LAST_APPEARANCE_DEFINITION|K_LAST_START_DEFINITION|I_DIFFERENT_HISTORICAL_GAME_ID |
| 822832 | 680736 | 2.0 | 3.0 | 831809 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|F_NON_MLB_GAME|B_START_VS_RELIEF_APPEARANCE|J_LAST_APPEARANCE_DEFINITION|K_LAST_START_DEFINITION|I_DIFFERENT_HISTORICAL_GAME_ID |
| 823728 | 657746 | 3.0 | 7.0 | 824865 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|M_UNEXPLAINED |
| 823400 | 676917 | 1.0 | 3.0 | 822754 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |
| 822818 | 656876 | 5.0 | 6.0 | 822992 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|M_UNEXPLAINED |
| 823953 | 808963 | 4.0 | 5.0 | 823960 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |
| 824199 | 663567 | 4.0 | 8.0 | 824449 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|M_UNEXPLAINED |
| 824199 | 669923 | 5.0 | 2.0 | 823069 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |
| 823554 | 680694 | 3.0 | 4.0 | 824855 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |
| 823715 | 687570 | 5.0 | 6.0 | 823641 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|M_UNEXPLAINED |
| 823715 | 656302 | 5.0 | 6.0 | 823803 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|M_UNEXPLAINED |
| 824685 | 684007 | 6.0 | 1.0 | 824690 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|M_UNEXPLAINED |
| 824685 | 669194 | 4.0 | 1.0 | 825100 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |
| 825014 | 677944 | 5.0 | 2.0 | 824450 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |
| 822980 | 663556 | 7.0 | 4.0 | 822985 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |
| 823705 | 837227 | 3.0 | 0.0 | 823156 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |
| 824680 | 687075 | 6.0 | 5.0 | 823063 | E_BACKFILL_OR_LATE_RECORD_TIMESTAMP|G_DIFFERENT_TEMPORAL_ORDER|I_DIFFERENT_HISTORICAL_GAME_ID |

## Competición

La fuente no contiene `gameType`; por ello la clasificación MLB regular/spring es inferida y no debe usarse todavía como filtro definitivo.

- MLB_REGULAR_SEASON_INFERRED: 3,454 filas de abridor.
- MLB_SPRING_TRAINING_INFERRED: 632 filas de abridor.
- WBC_OR_NATIONAL_TEAMS: 60 filas de abridor.
- OTHER_MIXED_EVENT: 12 filas de abridor.
- ALL_STAR: 2 filas de abridor.

## Reconstruibilidad

| Feature | Evaluación | Motivo |
|---|---|---|
| last3Ks1/2/3 | APPROXIMATE | Exact if local final boxscore sequence equals MLB gameLog starts; observed discrepancies prevent equivalence claim. |
| last3Ip1/2/3 | APPROXIMATE | Outs/IP are available, but gameLog start filtering and source/backfill differences remain. |
| last3Bf1/2/3 | APPROXIMATE | BF available; current code converts zero to null and filters starts using gamesStarted/fallback. |
| last5KsAvg | APPROXIMATE | Recomputable with current population/window formula if identical five-game membership is recovered. |
| last5KsStd | APPROXIMATE | Population standard deviation is known; exactness depends on identical gameLog window. |
| last5IpAvg | APPROXIMATE | Known rounding to one decimal after MLB innings-to-outs conversion. |
| last5BfAvg | WITH_INFORMATION_LOSS | Positive BF filtering, one-decimal rounding and >40 sanity nulling are known. |
| last5PitchCountAvg | WITH_INFORMATION_LOSS | Positive pitch filtering, integer rounding and >130 sanity nulling are known. |
| pitchesLast3Starts | APPROXIMATE_MISNAMED | Current fatigue code sums last three appearances, not gamesStarted-filtered starts. |
| daysSinceLastAppearance | RECONSTRUCTIBLE_DATE_ONLY | Current field is named daysSinceLastStart but uses most recent appearance; values >30 are replaced by 5. |

## Leakage

Assertions aprobadas sobre 79,936 enlaces históricos: 0 target games, 0 juegos futuros y 0 estadísticas objetivo. Limitación: la identidad del target procede del boxscore final y no constituye evidencia pregame.

## Recomendación arquitectónica

Conviene estudiar el cálculo dinámico por `pitcherId` porque centraliza el historial crudo, conserva lineage y reduce divergencias entre snapshots. No debe implementarse hasta asegurar identidad pregame, `gameType`, disponibilidad temporal, política entre temporadas y un contrato de compatibilidad con el generador diario.

Los casos sin evidencia suficiente permanecen explícitamente como `M_UNEXPLAINED`.
