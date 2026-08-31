# K-Lab — Dynamic History Audit

## Conclusión

No conviene reemplazar todavía las rolling almacenadas. El cálculo dinámico es viable para los 265 targets con identidad pregame defendible, pero faltan gameType autoritativo, timestamp fiable de disponibilidad y cobertura anterior al rango local.

## Cobertura DATE_ONLY

- Targets: 265; HOME 260; AWAY 5.
- Last3 starts: 236 (89.06%).
- Last5 starts: 227 (85.66%).
- Last3 appearances: 251 (94.72%).
- Last5 appearances: 246 (92.83%).

STRICT no es calculable con evidencia confiable: record_timestamp es captura/backfill, no game_end.

## Decisión

Mantener starts y appearances como familias distintas. Tras incorporar los prerrequisitos, pueden eliminarse snapshots rolling de resultados y fatiga, conservando identidad pregame, resultados crudos, lineage, gameType y disponibilidad temporal. Assertions: 0 target boxscore usado, 0 actual_k usado, 0 juegos objetivo/futuros.
