/**
 * gameStatus.test.ts — Fase 4, punto 6 del plan de mejora.
 *
 * isFinalGameStatus es el criterio único de "juego terminado" para todo el
 * proyecto (ver gameStatus.ts) — antes de la Fase 2 había dos
 * implementaciones independientes (server.ts y src/workflow.ts) que podían
 * divergir en silencio. También tiene que coincidir exactamente con
 * `is_final()` en backfill_pitcher_stats_pit.py (comentado allá y acá para
 * no perder la sincronía) — estas pruebas documentan el contrato exacto que
 * ese archivo Python tiene que replicar.
 */
import { describe, expect, it } from "vitest";
import { isFinalGameStatus } from "./gameStatus";

describe("isFinalGameStatus", () => {
  it.each([
    "Final",
    "Final: Tied",
    "Game Over",
    "Completed Early: Rain",
    "Completed",
    "FINAL", // debe ser insensible a mayúsculas/minúsculas
    "  Final  ", // debe tolerar espacios al inicio/final
  ])("reconoce %j como juego terminado", (status) => {
    expect(isFinalGameStatus(status)).toBe(true);
  });

  it.each([
    "In Progress",
    "Scheduled",
    "Postponed",
    "Suspended: Rain",
    "Pre-Game",
    "Warmup",
  ])("no reconoce %j como juego terminado", (status) => {
    expect(isFinalGameStatus(status)).toBe(false);
  });

  it("trata undefined, null y string vacío como no terminado", () => {
    expect(isFinalGameStatus(undefined)).toBe(false);
    expect(isFinalGameStatus(null)).toBe(false);
    expect(isFinalGameStatus("")).toBe(false);
  });

  it("no lanza con tipos inesperados (number, object) y los trata como no terminado", () => {
    expect(isFinalGameStatus(42)).toBe(false);
    expect(isFinalGameStatus({})).toBe(false);
  });
});
