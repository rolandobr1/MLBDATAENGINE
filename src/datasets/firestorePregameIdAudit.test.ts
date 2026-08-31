import assert from "node:assert/strict";
import { extractEvidence } from "./firestorePregameIdAudit";

const gameId = "100";
const scheduled = "2026-07-01T23:00:00.000Z";
const expected = { date: "2026-07-01", homeTeam: "Home", awayTeam: "Away" };
const target = (side: "home" | "away") => [{ game_id: gameId, game_date: expected.date, side, pregame_pitcher_name: null, scheduled_start: scheduled }];
const base = (timestamp: string) => ({ timestamp, game_status: "Pre-Game", metadata: { ...expected },
  pitchers: { home: { name: "Home Starter" }, away: { name: "Away Starter" } },
  linescore: { inningHalf: "Top", isTopInning: true, defense: { pitcher: { id: 11, fullName: "Home Starter" } },
    homeTotals: { runs: 0, hits: 0 }, awayTotals: { runs: 0, hits: 0 }, balls: 0, strikes: 0, outs: 0 } });

const explicit: any = base("2026-07-01T20:00:00.000Z");
explicit.pitchers.away.pitcherId = 22;
let result = extractEvidence(gameId, target("away"), [explicit], expected);
assert.equal(result.rows[0].classification, "VERIFIED");
assert.equal(result.rows[0].pitcher_id, "22");
assert.equal(result.rows[0].source, "PITCHERS_PITCHER_ID");

result = extractEvidence(gameId, target("home"), [base("2026-07-01T20:00:00.000Z")], expected);
assert.equal(result.rows[0].classification, "VERIFIED");
assert.equal(result.rows[0].pitcher_id, "11");
assert.equal(result.rows[0].source, "LINESCORE_DEFENSE_PITCHER");

result = extractEvidence(gameId, target("away"), [base("2026-07-01T20:00:00.000Z")], expected);
assert.equal(result.rows[0].classification, "NO_EVIDENCE", "linescore nunca debe reconstruir identidad AWAY");

const changedA: any = base("2026-07-01T19:00:00.000Z"); changedA.pitchers.home.pitcherId = 31;
const changedB: any = base("2026-07-01T20:00:00.000Z"); changedB.pitchers.home.pitcherId = 32;
result = extractEvidence(gameId, target("home"), [changedA, changedB], expected);
assert.equal(result.rows[0].classification, "AMBIGUOUS");
assert.equal(result.rows[0].change_detected, true);
assert.equal(result.rows[0].pitcher_id, null);

const afterStart: any = base("2026-07-02T00:00:00.000Z"); afterStart.pitchers.away.pitcherId = 44;
result = extractEvidence(gameId, target("away"), [afterStart], expected);
assert.equal(result.rows[0].classification, "HIGH_BUT_NOT_TEMPORALLY_VERIFIED");

const wrongGame: any = base("2026-07-01T20:00:00.000Z"); wrongGame.metadata.homeTeam = "Other"; wrongGame.pitchers.away.pitcherId = 55;
result = extractEvidence(gameId, target("away"), [wrongGame], expected);
assert.equal(result.rows[0].classification, "NO_EVIDENCE");

console.log("firestorePregameIdAudit tests passed");
