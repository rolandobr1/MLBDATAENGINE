import assert from "node:assert/strict";
import { computeDynamicRollingFeatures, selectHistoricalResults, type HistoricalPitcherResult } from "./klabDynamicRollingFeatures";

const rows: HistoricalPitcherResult[] = [
  { gameId: "s1", date: "2026-03-01", pitcherId: "7", started: true, source: "START", k: 4, ip: "6.1", bf: 24, pitches: 90 },
  { gameId: "relief", date: "2026-03-03", pitcherId: "7", started: false, source: "START", k: 1, ip: "1.0", bf: 4, pitches: 15 },
  { gameId: "a1", date: "2026-03-03", pitcherId: "7", started: false, source: "APPEARANCE", k: 1, ip: "1.0", bf: 4, pitches: 15 },
  { gameId: "target", date: "2026-04-01", pitcherId: "7", started: true, source: "START", k: 8, ip: "8.0", bf: 28, pitches: 105 },
  { gameId: "future", date: "2026-04-02", pitcherId: "7", started: true, source: "START", k: 9, ip: "9.0", bf: 30, pitches: 110 },
  { gameId: "other", date: "2026-03-02", pitcherId: "8", started: true, source: "START", k: 10, ip: "7.0", bf: 25, pitches: 100 },
];
const starts = selectHistoricalResults(rows, "7", "2026-04-01", "target", "START");
const apps = selectHistoricalResults(rows, "7", "2026-04-01", "target", "APPEARANCE");
assert.deepEqual(starts.map((row) => row.gameId), ["s1"]);
assert.deepEqual(apps.map((row) => row.gameId), ["a1"]);
assert.ok(starts.every((row) => row.started && row.pitcherId === "7" && row.date < "2026-04-01" && row.gameId !== "target"));
const features = computeDynamicRollingFeatures(starts, apps, "2026-04-01");
assert.equal(features.last3StartsKs1, 4);
assert.equal(features.last3StartsKs2, null);
assert.equal(features.last5StartsKsAvg, 4);
assert.equal(features.last3AppearancesKs1, 1);
assert.equal(features.pitchesLast3Starts, 90);
assert.throws(() => selectHistoricalResults(rows, "", "2026-04-01", "target", "START"), /pitcherId/);
console.log("klabDynamicRollingFeatures tests passed");
