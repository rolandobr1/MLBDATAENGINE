# K-Lab — Dynamic Rolling Experiment

## Decisión: B. Recomendable migrar parcialmente

El cálculo por pitcherId es limpio, reproducible y aprobó las assertions de leakage, pero competition_status permanece UNKNOWN y falta un timestamp autoritativo de disponibilidad.

- Targets: 265.
- Starts 3+: 242; appearances 3+: 256.
- LAST3_STARTS exactitud 65.36%, MAE 0.677.
- LAST3_APPEARANCES exactitud 68.71%, MAE 0.689.

No se eliminaron juegos mediante heurísticas de nombres. No se entrenó ningún modelo ni se modificó el dataset oficial.
