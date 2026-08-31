# K-Lab — Auditoría de rolling features dinámicas

## Conclusión: READY_FOR_MODEL_COMPARISON

La capa experimental calcula historia exclusivamente por pitcherId y separa STARTS de APPEARANCES. Las assertions de leakage pasaron. Esta conclusión autoriza únicamente comparar modelos en un experimento posterior; no autoriza migración productiva.

- Targets: 265; pitchers: 156; juegos: 260; HOME/AWAY: 260/5.
- Last3 starts completos: 242; last5 starts: 229.
- Last3 appearances completas: 256; last5 appearances: 250.
- Discrepancias materiales: 1786.
- gameType autoritativo: no; competition_status: UNKNOWN.
- Evidencia temporal: DATE_ONLY.
- Historia anterior a 2026-03-01: 0 fechas locales; los casos superficiales se marcan sin imputar.
- SHA-256 oficial: D959F11980A0C0D2A8310600C4A2FF7B506C2F0C26787EB426959E9A4AC442E0 (sin cambios).

No se entrenaron modelos, no se calcularon probabilidades y no se modificó el dataset oficial.
