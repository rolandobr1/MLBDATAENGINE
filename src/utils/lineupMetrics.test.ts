import fs from "fs";
import path from "path";
import { calculateOpponentLineupKPct } from "./lineupMetrics";

function assertClose(actual: number | null, expected: number, label: string) {
  if (actual === null || Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${label}: esperado ${expected}, recibido ${actual}`);
  }
}

const snapshotPath = path.join(process.cwd(), "mlb_pregame_snapshots.json");
const store = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
const game = store?.games?.["822692"]?.game;
if (!game) throw new Error("No se encontró el snapshot pregame del juego 822692");

const waldron = calculateOpponentLineupKPct(game.lineups.away, game.pitchers.home.pitchHand);
const gordon = calculateOpponentLineupKPct(game.lineups.home, game.pitchers.away.pitchHand);

assertClose(waldron, 22.4611840268082, "Matt Waldron");
assertClose(gordon, 20.0331163065996, "Tanner Gordon");

// Ambos flujos llaman la misma función; repetir la llamada simula el cálculo
// inicial y el individual y exige identidad, no solo cercanía por redondeo.
if (waldron !== calculateOpponentLineupKPct(game.lineups.away, game.pitchers.home.pitchHand)) {
  throw new Error("Extracción completa e individual difieren para Matt Waldron");
}
if (gordon !== calculateOpponentLineupKPct(game.lineups.home, game.pitchers.away.pitchHand)) {
  throw new Error("Extracción completa e individual difieren para Tanner Gordon");
}

// Verifica fallbacks de K% y PA=50 sin redondeos intermedios.
assertClose(calculateOpponentLineupKPct([
  { k_pct_vs_rhp: null, strikeout_pct: 20, pa: null },
  { k_pct_vs_rhp: null, strikeout_pct: null, kPct: 30, pa: 100 },
], "R"), (20 * 50 + 30 * 100) / 150, "Fallbacks K% y PA");

console.log(JSON.stringify({ gameId: "822692", mattWaldron: waldron, tannerGordon: gordon }));
