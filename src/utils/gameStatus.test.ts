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
import { isFinalGameStatus, isNonActionableGameStatus } from "./gameStatus";

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

describe("isNonActionableGameStatus", () => {
  // Regresión (sept. 2026): un juego "Postponed" cumplía `hasStarted && !isFinal`
  // en GameCard/GameCardCompact y se pintaba con el badge rojo pulsante de
  // "EN VIVO" — dando a entender que un juego que nunca se jugó estaba en curso.
  // Esta función es el criterio único para excluir esos juegos de esa UI (y del
  // auto-updater en server.ts, que ya no tiene sentido que los siga consultando).
  it.each([
    "Postponed",
    "Cancelled",
    "Canceled", // variante en inglés americano, por si la API la devuelve así
    "POSTPONED",
    "  Postponed  ",
  ])("reconoce %j como no accionable", (status) => {
    expect(isNonActionableGameStatus(status)).toBe(true);
  });

  it.each([
    "Final",
    "In Progress",
    "Scheduled",
    "Suspended: Rain",
    "Pre-Game",
    "Warmup",
  ])("no reconoce %j como no accionable", (status) => {
    expect(isNonActionableGameStatus(status)).toBe(false);
  });

  it("trata undefined, null y string vacío como accionable (false)", () => {
    expect(isNonActionableGameStatus(undefined)).toBe(false);
    expect(isNonActionableGameStatus(null)).toBe(false);
    expect(isNonActionableGameStatus("")).toBe(false);
  });
});
