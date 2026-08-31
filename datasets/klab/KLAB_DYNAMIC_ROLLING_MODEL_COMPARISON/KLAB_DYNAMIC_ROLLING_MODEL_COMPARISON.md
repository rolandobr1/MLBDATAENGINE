# Experimento — Rolling actuales vs. dinámicas

## Decisión: KEEP_CURRENT

Modelo experimental único: ridge lineal estandarizada (alpha=1), sin tuning. La comparación primaria usa exactamente 98 observaciones de train y 12 de validation comunes a A/B/C/D.

| Modelo | MAE | RMSE | R² | Correlación | ΔMAE | ΔRMSE |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 1.9711 | 2.3908 | 0.2228 | 0.5323 | 0.0000 | 0.0000 |
| dynamic_starts | 2.3653 | 3.1032 | -0.3095 | 0.1604 | 0.3942 | 0.7125 |
| dynamic_appearances | 2.1211 | 2.5326 | 0.1279 | 0.4470 | 0.1501 | 0.1418 |
| hybrid | 2.1727 | 2.8686 | -0.1189 | 0.3005 | 0.2017 | 0.4778 |

La muestra AWAY total es 5 y no permite inferencia válida. No existe evidencia suficiente en este experimento aislado para eliminar automáticamente las rolling almacenadas. No se modificó producción ni el dataset oficial.
