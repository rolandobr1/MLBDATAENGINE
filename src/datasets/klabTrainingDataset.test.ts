import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MLBGame } from "../types";
import {
  buildKlabTrainingDataset,
  KLAB_COLUMNS,
  validateKlabDateRange,
} from "./klabTrainingDataset";

const db = JSON.parse(fs.readFileSync(path.join(process.cwd(), "mlb_database.json"), "utf8")) as Record<string, MLBGame[]>;
const games = Object.values(db).flat();
const result = buildKlabTrainingDataset(games, "2026-04-01", "2026-07-31");

assert.equal(result.report.finalRows, result.rows.length);
assert.equal(result.report.observationsWithActualK, result.rows.length);
assert.equal(result.report.duplicateKeys.length, 0);
assert.equal(result.report.outOfRangeRows, 0);
assert.deepEqual(result.report.leakageColumns, []);
assert.equal(result.csv.split("\n")[0], KLAB_COLUMNS.join(","));
if (result.rows.length > 0) assert.deepEqual(Object.keys(result.rows[0]), [...KLAB_COLUMNS]);

const keys = result.rows.map((row) => `${row.game_id}:${row.pitcher_id}`);
assert.equal(new Set(keys).size, keys.length, "Debe existir una sola observación por juego y pitcher");

for (const row of result.rows) {
  assert.ok(String(row.game_date) >= "2026-04-01" && String(row.game_date) <= "2026-07-31");
  assert.ok(Number.isFinite(Number(row.actual_k)) && Number(row.actual_k) >= 0, "actual_k debe ser válido");
  assert.ok(row.snapshot_captured_at, "Cada observación debe conservar su timestamp pregame");
  assert.ok(!("actual_ip" in row) && !("actual_pitches" in row), "No deben exponerse variables postgame");
}

for (let index = 1; index < result.rows.length; index += 1) {
  assert.ok(String(result.rows[index - 1].game_date) <= String(result.rows[index].game_date), "Orden cronológico inválido");
}

assert.throws(() => validateKlabDateRange(undefined, "2026-07-31"));
assert.throws(() => validateKlabDateRange("2026-08-01", "2026-07-31"));
assert.throws(() => validateKlabDateRange("2026-02-31", "2026-07-31"));

console.log(JSON.stringify({ report: result.report, sample: result.rows.slice(0, 3) }, null, 2));
