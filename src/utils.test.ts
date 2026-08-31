/**
 * utils.test.ts — Fase 4, punto 6 del plan de mejora.
 *
 * Dos cosas se prueban acá:
 *
 * 1. Que generateBattersCSV (el generador de 335 columnas que sí está en
 *    producción) siga produciendo una fila con la misma cantidad de valores
 *    que encabezados — la comprobación que antes vivía repetida a mano en
 *    ~10 scripts sueltos de la raíz (test_csv.ts, test_csv2.ts, test_csv3.ts,
 *    scratch_check_csv.ts, etc. — ver TOOLS.md, Fase 4 punto 4).
 *
 * 2. Que pitcherPitStatsBlockValues (el helper único creado en la Fase 4,
 *    punto 2, para dejar de tener el bloque de 11 columnas de stats de
 *    lanzador duplicado entre generateMLDatasetCSV y generateBattersCSV) siga
 *    colocando los valores correctos en las columnas correctas, tanto cuando
 *    hay cobertura PIT como cuando no la hay.
 *
 * generateMLDatasetCSV queda deliberadamente fuera de la prueba de
 * alineación headers/fila: tiene un mismatch real y pre-existente (307
 * headers vs. 302 valores de fila) descubierto durante esta misma fase al
 * correr `npm run tool -- csv-smoke-test` — no introducido por estos
 * cambios, y fuera del alcance acotado que se aprobó para la Fase 4 (ver
 * TOOLS.md). Se deja como `test.fails` para que quede documentado y visible
 * en la corrida de pruebas en vez de desaparecer silenciosamente.
 */
import { describe, expect, it, test } from "vitest";
import { generateBattersCSV, generateMLDatasetCSV, PITLookups } from "./utils";

/** Fixture mínimo que generateBattersCSV/generateMLDatasetCSV pueden procesar sin explotar. */
function makeDummyGame(id: string) {
  return {
    id,
    metadata: { date: "2026-05-01", time: "19:10", homeTeam: "HOU", awayTeam: "NYY", venue: "Minute Maid Park" },
    pitchers: { home: { name: "Framber Valdez" }, away: { name: "Gerrit Cole" } },
    bullpen: { home: {}, away: {} },
    offense: { home: {}, away: {} },
    betting_lines: {},
    lineups: { home: [{ player: { pitches: 10 } }], away: [] },
  };
}

function splitCsvLine(line: string): string[] {
  return line.split(",");
}

describe("generateBattersCSV — alineación de columnas", () => {
  it("la fila tiene la misma cantidad de valores que el encabezado", () => {
    const csv = generateBattersCSV([makeDummyGame("1") as any]);
    const [headerLine, rowLine] = csv.split("\n");
    expect(splitCsvLine(rowLine).length).toBe(splitCsvLine(headerLine).length);
  });
});

describe("generateBattersCSV — bloque de stats de lanzador (pitcherPitStatsBlockValues)", () => {
  it("usa los valores PIT y marca stats_source = pit cuando hay cobertura", () => {
    const game = makeDummyGame("2");
    const pitLookups: PITLookups = {
      pitchers: {
        "2": {
          home: { era: 3.5, whip: 1.1, kPct: 28, bbPct: 7, wins: 10, losses: 5, ip: 120, totalStrikeouts: 130, gs: 20, ipAvgPerStart: 6 },
          // away sin cobertura PIT a propósito, para probar el otro caso en el mismo test.
        },
      },
    };

    const csv = generateBattersCSV([game as any], pitLookups);
    const headers = splitCsvLine(csv.split("\n")[0]);
    const values = splitCsvLine(csv.split("\n")[1]);
    const at = (col: string) => values[headers.indexOf(col)];

    expect(headers.indexOf("home_pitcher_era")).toBeGreaterThanOrEqual(0);
    expect(at("home_pitcher_era")).toBe("3.5");
    expect(at("home_pitcher_whip")).toBe("1.1");
    expect(at("home_pitcher_wins")).toBe("10");
    expect(at("home_pitcher_stats_source")).toBe("pit");

    // Sin cobertura PIT para el visitante: los campos quedan vacíos, no se cae
    // al valor crudo (ese era justo el bug de la Fase 1 — fuga de fechas
    // futuras / stats de temporada congeladas).
    expect(at("away_pitcher_era")).toBe("");
    expect(at("away_pitcher_stats_source")).toBe("");
  });
});

// generateMLDatasetCSV: mismatch pre-existente headers/fila, fuera de alcance de esta
// fase — ver comentario del encabezado del archivo. `test.fails` documenta el bug sin
// romper la corrida de `npm run test`.
test.fails("generateMLDatasetCSV: la fila NO tiene hoy la misma cantidad de valores que el encabezado (bug pre-existente, ver TOOLS.md)", () => {
  const csv = generateMLDatasetCSV([makeDummyGame("3") as any]);
  const [headerLine, rowLine] = csv.split("\n");
  expect(splitCsvLine(rowLine).length).toBe(splitCsvLine(headerLine).length);
});
