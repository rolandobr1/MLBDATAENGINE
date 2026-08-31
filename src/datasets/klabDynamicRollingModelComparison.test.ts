import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runModelComparison } from "./klabDynamicRollingModelComparison";
const root=process.cwd(),report:any=runModelComparison(root);
assert.equal(report.universe.rows,265);assert.equal(report.universe.pitchers,156);assert.equal(report.universe.games,260);assert.equal(report.universe.home,260);assert.equal(report.universe.away,5);
assert.ok(report.partitions.common_train>0&&report.partitions.common_validation>0);assert.equal(report.leakage.assertions_passed,true);assert.equal(report.sha256.unchanged,true);assert.ok(["KEEP_CURRENT","PARTIAL_MIGRATION_CANDIDATE","MIGRATION_CANDIDATE"].includes(report.decision));
const out=path.join(root,"datasets","klab","KLAB_DYNAMIC_ROLLING_MODEL_COMPARISON");assert.equal(fs.readdirSync(out).length,6);console.log("klabDynamicRollingModelComparison tests passed");
