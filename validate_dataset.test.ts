/**
 * validate_dataset.test.ts — Fase 4, punto 6 del plan de mejora.
 *
 * Pruebas con fixtures CSV sintéticos y chicos (no el CSV real de ~1MB) para
 * las dos detecciones que más importan de validate_dataset.ts: rachas
 * congeladas de stats de lanzador (el mismo síntoma que destapó el bug de
 * la Fase 1 — stats de temporada point-in-time que en realidad venían
 * congeladas) y filas/game_id duplicados (Fase 2, punto 2). Antes de este
 * archivo, la única forma de confirmar que estas detecciones seguían
 * funcionando era correrlas a mano contra un CSV real de producción.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { validateDataset } from "./validate_dataset";

const tmpFiles: string[] = [];

function writeTmpCsv(content: string): string {
  const filePath = path.join(os.tmpdir(), `validate_dataset_test_${Date.now()}_${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(filePath, content);
  tmpFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const f = tmpFiles.pop()!;
    try { fs.unlinkSync(f); } catch { /* ya no existe, no importa */ }
  }
});

// Columnas mínimas que detectFrozenStreaks necesita para el lado "home":
// home_pitcher, date, home_pitcher_{era,whip,wins,losses,ip,strikeouts,gs}
// (SEASON_FIELDS en validate_dataset.ts), más game_status para poder filtrar
// por juegos ya finalizados, más game_id/player_name para las otras reglas.
const HEADER =
  "game_id,date,player_name,home_pitcher,home_pitcher_era,home_pitcher_whip,home_pitcher_wins,home_pitcher_losses,home_pitcher_ip,home_pitcher_strikeouts,home_pitcher_gs,game_status";

function row(gameId: string, date: string, playerName: string, statsTuple: string, status: string): string {
  // statsTuple ya viene como "era,whip,wins,losses,ip,strikeouts,gs"
  return `${gameId},${date},${playerName},Juan Perez,${statsTuple},${status}`;
}

const IDENTICAL_STATS = "3.50,1.10,10,5,120.0,130,20"; // era,whip,wins,losses,ip,strikeouts,gs

describe("validateDataset — rachas congeladas", () => {
  it("detecta una racha de 3+ valores idénticos de stats en juegos ya finalizados", () => {
    const csv = [
      HEADER,
      row("100", "2026-05-01", "Bateador A", IDENTICAL_STATS, "Final"),
      row("101", "2026-05-02", "Bateador B", IDENTICAL_STATS, "Final"),
      row("102", "2026-05-03", "Bateador C", IDENTICAL_STATS, "Final"),
    ].join("\n");

    const result = validateDataset(writeTmpCsv(csv), { log: false });

    expect(result.passed).toBe(false);
    expect(result.failures).toBeGreaterThan(0);
  });

  it("NO marca una racha si los juegos todavía están en progreso (los valores repetidos ahí son normales)", () => {
    const csv = [
      HEADER,
      row("200", "2026-05-01", "Bateador A", IDENTICAL_STATS, "In Progress"),
      row("201", "2026-05-02", "Bateador B", IDENTICAL_STATS, "In Progress"),
      row("202", "2026-05-03", "Bateador C", IDENTICAL_STATS, "In Progress"),
    ].join("\n");

    const result = validateDataset(writeTmpCsv(csv), { log: false });

    expect(result.passed).toBe(true);
    expect(result.failures).toBe(0);
  });

  it("NO marca una racha si las stats cambian entre juegos finalizados consecutivos", () => {
    const csv = [
      HEADER,
      row("300", "2026-05-01", "Bateador A", "3.50,1.10,10,5,120.0,130,20", "Final"),
      row("301", "2026-05-02", "Bateador B", "3.45,1.08,11,5,127.0,138,21", "Final"),
      row("302", "2026-05-03", "Bateador C", "3.40,1.05,12,5,134.0,146,22", "Final"),
    ].join("\n");

    const result = validateDataset(writeTmpCsv(csv), { log: false });

    expect(result.passed).toBe(true);
    expect(result.failures).toBe(0);
  });

  it("necesita al menos 3 valores idénticos seguidos — 2 no alcanza (FROZEN_STREAK_MIN)", () => {
    const csv = [
      HEADER,
      row("400", "2026-05-01", "Bateador A", IDENTICAL_STATS, "Final"),
      row("401", "2026-05-02", "Bateador B", IDENTICAL_STATS, "Final"),
    ].join("\n");

    const result = validateDataset(writeTmpCsv(csv), { log: false });

    expect(result.passed).toBe(true);
    expect(result.failures).toBe(0);
  });
});

describe("validateDataset — duplicados", () => {
  it("detecta encabezados de columna duplicados", () => {
    const csv = [
      "game_id,date,game_id",
      "1,2026-05-01,1",
    ].join("\n");

    const result = validateDataset(writeTmpCsv(csv), { log: false });

    expect(result.passed).toBe(false);
    expect(result.failures).toBeGreaterThan(0);
  });

  it("detecta filas (game_id, player_name) duplicadas", () => {
    const csv = [
      HEADER,
      row("500", "2026-05-01", "Bateador A", "3.50,1.10,10,5,120.0,130,20", "Final"),
      row("500", "2026-05-01", "Bateador A", "3.50,1.10,10,5,120.0,130,20", "Final"), // mismo game_id + player_name
    ].join("\n");

    const result = validateDataset(writeTmpCsv(csv), { log: false });

    expect(result.passed).toBe(false);
    expect(result.failures).toBeGreaterThan(0);
  });

  it("detecta un game_id que aparece bajo más de una fecha en el mismo CSV (Fase 2, punto 2)", () => {
    const csv = [
      HEADER,
      row("600", "2026-05-01", "Bateador A", "3.50,1.10,10,5,120.0,130,20", "Final"),
      row("600", "2026-05-02", "Bateador B", "3.55,1.12,10,5,121.0,131,20", "Final"), // mismo game_id, otra fecha
    ].join("\n");

    const result = validateDataset(writeTmpCsv(csv), { log: false });

    expect(result.passed).toBe(false);
    expect(result.failures).toBeGreaterThan(0);
  });
});

describe("validateDataset — caso limpio", () => {
  it("no reporta fallas para un CSV chico sin problemas", () => {
    const csv = [
      HEADER,
      row("700", "2026-05-01", "Bateador A", "3.50,1.10,10,5,120.0,130,20", "Final"),
      row("701", "2026-05-02", "Bateador B", "2.90,1.05,12,4,130.0,140,21", "Final"),
    ].join("\n");

    const result = validateDataset(writeTmpCsv(csv), { log: false });

    expect(result.passed).toBe(true);
    expect(result.failures).toBe(0);
    expect(result.rowCount).toBe(2);
  });
});
