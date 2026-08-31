import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { runMigrationAudit, sha256 } from "./klabDynamicRollingMigrationAudit";

const EXPECTED_HASH = "D959F11980A0C0D2A8310600C4A2FF7B506C2F0C26787EB426959E9A4AC442E0";
const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const writeCsv = (file: string, rows: Record<string, unknown>[]) => {
  const columns = Object.keys(rows[0] ?? {});
  fs.writeFileSync(file, [columns.join(","), ...rows.map((row) => columns.map((column) => quote(row[column])).join(","))].join("\n"), "utf8");
};

export function runControlledDynamicRollingAudit(start = "2026-03-01", end = "2026-08-26", root = process.cwd()) {
  const official = path.join(root, "datasets", "klab", `KLAB_PITCHER_TRAINING_DATASET_${start}_${end}.csv`);
  const before = sha256(official);
  if (before !== EXPECTED_HASH) throw new Error(`Official dataset hash mismatch: ${before}`);
  const migration: any = runMigrationAudit(start, end, root);
  const source = path.join(root, "datasets", "klab", "KLAB_DYNAMIC_ROLLING_MIGRATION_AUDIT");
  const output = path.join(root, "datasets", "klab", "KLAB_DYNAMIC_ROLLING_FEATURES_AUDIT");
  fs.mkdirSync(output, { recursive: true });
  const read = (name: string) => parse(fs.readFileSync(path.join(source, name), "utf8"), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const comparison = read("KLAB_DYNAMIC_ROLLING_COMPARISON.csv");
  const originalCoverage = read("KLAB_DYNAMIC_ROLLING_COVERAGE.csv");
  const sourceSamples = read(`KLAB_DYNAMIC_ROLLING_DATASET_${start}_${end}.csv`);
  const samples: Record<string, any>[] = sourceSamples.map((row) => ({
    ...row,
    history_truncated: Number(row.starts_history_count) < 3 || Number(row.appearances_history_count) < 3,
    truncation_cause: Number(row.starts_history_count) < 3 || Number(row.appearances_history_count) < 3 ? "UNKNOWN_TRUNCATION_OR_DEBUT" : "NOT_FLAGGED",
  }));
  const global = originalCoverage.find((row) => row.dimension === "global")!;
  const coverage = [
    ...originalCoverage,
    { ...global, dimension: "competition", key: "UNKNOWN" },
    { ...global, dimension: "temporal_evidence", key: "DATE_ONLY" },
    ...["0", "1", "2", "3_PLUS", "5_PLUS"].map((depth) => {
      const selected = samples.filter((row) => depth === "0" ? Number(row.starts_history_count) === 0 : depth === "1" ? Number(row.starts_history_count) === 1 : depth === "2" ? Number(row.starts_history_count) === 2 : depth === "3_PLUS" ? Number(row.starts_history_count) >= 3 : Number(row.starts_history_count) >= 5);
      return { ...global, dimension: "starts_history_depth", key: depth, pitcher_games_total: selected.length, pitchers_unique: new Set(selected.map((row) => row.pitcher_id)).size, games_unique: new Set(selected.map((row) => row.target_game_id)).size };
    }),
  ];
  const leakage = migration.leakage;
  const leakagePassed = leakage.history_date_before_target === true && leakage.target_game_excluded === true &&
    leakage.future_games_excluded === true && leakage.target_actual_k_used === false &&
    leakage.target_boxscore_used === false && leakage.identity_pitcherId_only === true &&
    leakage.duplicate_target_keys === 0 && leakage.assertions_passed === true;
  if (!leakagePassed) throw new Error("Leakage assertions failed");
  if (new Set(samples.map((row) => `${row.target_game_id}:${row.pitcher_id}`)).size !== samples.length) throw new Error("Duplicate target keys");
  const decision = leakage.assertions_passed && samples.length === 265 ? "READY_FOR_MODEL_COMPARISON" : "BLOCKED";
  const report = {
    created_at: new Date().toISOString(), decision, scope: "ISOLATED_EXPERIMENTAL_LAYER_ONLY",
    targets: samples.length, pitchers: migration.pitchers, games: migration.games, home: migration.home, away: migration.away,
    feature_contract: { identity: "pitcherId only", starts: "structured boxscore starter playerId only", appearances: "valid liveBoxscore pitcher appearance", windows: [3, 5], no_imputation: true },
    coverage: migration.coverage, history_before_target_range: migration.history_before_target_range,
    competition: migration.gameType, temporal_evidence: migration.temporal,
    comparison_metrics: migration.comparison_metrics, family_comparison: migration.family_comparison,
    material_discrepancies: migration.material_discrepancies, leakage,
    limitations: ["No authoritative gameType found locally; competition_status is UNKNOWN.", "Only game date is authoritative; temporal_evidence is DATE_ONLY and does not prove intraday availability.", "No local dates precede 2026-03-01; shallow history cannot be distinguished conclusively from debut or role change."],
    models_trained: false, probabilities_calculated: false,
    official_dataset_sha256: { before, after: sha256(official), expected: EXPECTED_HASH, unchanged: before === sha256(official) },
  };
  writeCsv(path.join(output, "KLAB_DYNAMIC_ROLLING_COMPARISON.csv"), comparison);
  writeCsv(path.join(output, "KLAB_DYNAMIC_ROLLING_COVERAGE.csv"), coverage);
  writeCsv(path.join(output, "KLAB_DYNAMIC_ROLLING_SAMPLES.csv"), samples);
  fs.writeFileSync(path.join(output, "KLAB_DYNAMIC_ROLLING_AUDIT.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(output, "KLAB_DYNAMIC_ROLLING_AUDIT.md"), `# K-Lab — Auditoría de rolling features dinámicas\n\n## Conclusión: ${decision}\n\nLa capa experimental calcula historia exclusivamente por pitcherId y separa STARTS de APPEARANCES. Las assertions de leakage pasaron. Esta conclusión autoriza únicamente comparar modelos en un experimento posterior; no autoriza migración productiva.\n\n- Targets: ${report.targets}; pitchers: ${report.pitchers}; juegos: ${report.games}; HOME/AWAY: ${report.home}/${report.away}.\n- Last3 starts completos: ${migration.coverage.starts_3_plus}; last5 starts: ${migration.coverage.last5_starts_complete}.\n- Last3 appearances completas: ${migration.coverage.appearances_3_plus}; last5 appearances: ${migration.coverage.last5_appearances_complete}.\n- Discrepancias materiales: ${report.material_discrepancies}.\n- gameType autoritativo: no; competition_status: UNKNOWN.\n- Evidencia temporal: DATE_ONLY.\n- Historia anterior a ${start}: 0 fechas locales; los casos superficiales se marcan sin imputar.\n- SHA-256 oficial: ${report.official_dataset_sha256.after} (sin cambios).\n\nNo se entrenaron modelos, no se calcularon probabilidades y no se modificó el dataset oficial.\n`, "utf8");
  if (report.official_dataset_sha256.after !== EXPECTED_HASH) throw new Error("Official dataset changed during audit");
  console.log(JSON.stringify({ output, files: fs.readdirSync(output), report }, null, 2));
  return report;
}

if (process.argv[1]?.endsWith("klabDynamicRollingAudit.ts")) runControlledDynamicRollingAudit();
