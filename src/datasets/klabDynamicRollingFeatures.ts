export type RollingSource = "START" | "APPEARANCE";
export type TemporalEvidence = "AUTHORITATIVE" | "DATE_ONLY" | "UNKNOWN";

export type HistoricalPitcherResult = {
  gameId: string;
  date: string;
  pitcherId: string;
  started: boolean;
  source: RollingSource;
  k: number;
  ip: string;
  bf: number;
  pitches: number;
  team?: string;
  side?: "home" | "away";
  competitionStatus?: string;
  temporalEvidence?: TemporalEvidence;
  lineage?: string;
};

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const std = (values: number[]) => values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean(values)!) ** 2, 0) / values.length) : null;
const outs = (ip: string) => {
  const [whole, remainder = "0"] = String(ip || "0.0").split(".");
  return (Number.parseInt(whole) || 0) * 3 + Math.min(2, Math.max(0, Number.parseInt(remainder) || 0));
};
const ipValue = (ip: string) => outs(ip) / 3;

export function selectHistoricalResults(
  all: HistoricalPitcherResult[],
  pitcherId: string,
  targetDate: string,
  targetGameId: string,
  source: RollingSource,
) {
  if (!pitcherId) throw new Error("pitcherId is required; name-based identity is prohibited");
  const selected = all.filter((row) =>
    row.pitcherId === pitcherId &&
    row.date < targetDate &&
    row.gameId !== targetGameId &&
    row.source === source &&
    (source !== "START" || row.started === true),
  ).sort((a, b) => b.date.localeCompare(a.date) || b.gameId.localeCompare(a.gameId));
  for (const row of selected) {
    if (row.pitcherId !== pitcherId || row.date >= targetDate || row.gameId === targetGameId) {
      throw new Error("Dynamic rolling leakage assertion failed");
    }
    if (source === "START" && !row.started) throw new Error("Start lacks structured starter evidence");
  }
  return selected;
}

export function computeDynamicRollingFeatures(starts: HistoricalPitcherResult[], appearances: HistoricalPitcherResult[], targetDate: string) {
  const s3 = starts.slice(0, 3), a3 = appearances.slice(0, 3), s5 = starts.slice(0, 5), a5 = appearances.slice(0, 5);
  const days = (rows: HistoricalPitcherResult[]) => rows.length ? Math.floor((Date.parse(targetDate) - Date.parse(rows[0].date)) / 86_400_000) : null;
  const result: Record<string, number | null> = {};
  for (let i = 0; i < 3; i++) {
    result[`last3StartsKs${i + 1}`] = s3[i]?.k ?? null;
    result[`last3StartsIp${i + 1}`] = s3[i] ? ipValue(s3[i].ip) : null;
    result[`last3StartsBf${i + 1}`] = s3[i]?.bf ?? null;
    result[`last3StartsPitchCount${i + 1}`] = s3[i]?.pitches ?? null;
    result[`last3AppearancesKs${i + 1}`] = a3[i]?.k ?? null;
    result[`last3AppearancesIp${i + 1}`] = a3[i] ? ipValue(a3[i].ip) : null;
    result[`last3AppearancesBf${i + 1}`] = a3[i]?.bf ?? null;
    result[`last3AppearancesPitchCount${i + 1}`] = a3[i]?.pitches ?? null;
  }
  for (const [label, rows] of [["Starts", s5], ["Appearances", a5]] as const) {
    result[`last5${label}KsAvg`] = mean(rows.map((row) => row.k));
    result[`last5${label}KsStd`] = std(rows.map((row) => row.k));
    result[`last5${label}IpAvg`] = mean(rows.map((row) => ipValue(row.ip)));
    result[`last5${label}BfAvg`] = mean(rows.map((row) => row.bf));
    result[`last5${label}PitchCountAvg`] = mean(rows.map((row) => row.pitches));
  }
  result.pitchesLastStart = s3[0]?.pitches ?? null;
  result.pitchesLast3Starts = s3.length ? s3.reduce((sum, row) => sum + row.pitches, 0) : null;
  result.daysSinceLastStart = days(starts);
  result.pitchesLastAppearance = a3[0]?.pitches ?? null;
  result.pitchesLast3Appearances = a3.length ? a3.reduce((sum, row) => sum + row.pitches, 0) : null;
  result.daysSinceLastAppearance = days(appearances);
  return result;
}

// Compatibility exports keep the existing experimental audit isolated from production code.
export const selectHistory = selectHistoricalResults;
export const buildRolling = computeDynamicRollingFeatures;
export type ResultLine = HistoricalPitcherResult;
