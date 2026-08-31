/**
 * Criterio único de "juego terminado" para todo el proyecto (TypeScript).
 *
 * Antes de este archivo existían dos implementaciones independientes que podían
 * divergir silenciosamente: la de `server.ts` (función local `isFinalGameStatus`)
 * y la de `src/workflow.ts` (chequeo ad hoc inline). Ver Fase 2, punto 1 del plan
 * de mejora (`audit_2026-08-31/PLAN_DE_MEJORA_MLBDATAENGINE.md`).
 *
 * IMPORTANTE: el backfill en Python (`backfill_pitcher_stats_pit.py`, función
 * `is_final()` / constante `FINAL_STATUSES`) no puede importar este archivo por
 * ser un lenguaje distinto. Si cambias la lógica aquí, replica el mismo cambio
 * allá — están comentados el uno al otro para que no se te olvide.
 *
 * La API de MLB Stats devuelve valores como "Final", "Final: Tied",
 * "Game Over", "Completed Early: Rain", "Completed", "In Progress",
 * "Scheduled", "Postponed", "Suspended: Rain", etc. Usamos `includes("final")`
 * para capturar las variantes "Final: ..." además del valor exacto "Final".
 */
export function isFinalGameStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized.includes("final") ||
    normalized === "game over" ||
    // Fase 4, punto 6: `=== "completed early"` no capturaba la variante real que
    // devuelve la API de MLB, "Completed Early: Rain" (con motivo incluido) — la
    // misma que este archivo pone de ejemplo más arriba. Encontrado escribiendo
    // pruebas (gameStatus.test.ts) al confirmar el propio ejemplo del comentario.
    normalized.includes("completed early") ||
    normalized === "completed"
  );
}
