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

/**
 * Un juego "Postponed"/"Cancelled" no es un juego terminado (`isFinalGameStatus`
 * es false) pero tampoco va a seguir avanzando — no tiene sentido ni volver a
 * consultarlo (server.ts) ni mostrarlo con la misma UI que un juego EN VIVO
 * (App.tsx / GameCard / GameCardCompact).
 *
 * Encontrado (sept. 2026): cuando MLB pospone un juego y lo reprograma el mismo
 * día como un juego nuevo (doubleheader, ID distinto), el juego original queda
 * para siempre con estatus "Postponed" en la base de datos — eso es correcto,
 * genuinely nunca se jugó. El bug estaba en cómo se MOSTRABA ese estatus: como
 * "Postponed" no está en la lista `["Scheduled", "Pre-Game", "Warmup"]`, las
 * tarjetas lo trataban como "ya arrancó" y, al no incluir "Final", lo pintaban
 * con el badge rojo pulsante de "EN VIVO" — dando a entender que un juego que
 * nunca se jugó (y nunca se va a jugar) está en curso ahora mismo. Ver
 * `NON_ACTIONABLE_STATUSES` en server.ts, que usa este mismo criterio para
 * dejar de re-consultar el juego vía la API de MLB.
 */
export function isNonActionableGameStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized.includes("postponed") || normalized.includes("cancelled") || normalized.includes("canceled");
}
