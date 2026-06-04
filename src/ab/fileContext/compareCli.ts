import fs from "node:fs";
import path from "node:path";
import { compareFileContextResults } from "./compare.js";
import {
  FC_COMPARISON_FILE,
  FC_REPORT_FILE,
  readCurrentFileContextPlan,
  readPlanResults,
  resolveFcPath,
  writeFcJson,
} from "./paths.js";
import { renderFileContextReport } from "./report.js";
import type { FileContextMode } from "./types.js";

function resultForMode(
  results: ReturnType<typeof readPlanResults>,
  mode: FileContextMode,
): (typeof results)[number] | undefined {
  return results.find((r) => r.mode === mode);
}

function main(): void {
  const plan = readCurrentFileContextPlan();
  if (!plan) {
    console.error("No active file-context plan. Run npm run ab:file-context:create first.");
    process.exit(1);
  }

  const results = readPlanResults(plan.id);
  const resultA = resultForMode(results, "no_context");
  const resultB = resultForMode(results, "file_context_pack");

  const comparison = compareFileContextResults(plan, resultA, resultB);
  const report = renderFileContextReport(comparison);

  writeFcJson(FC_COMPARISON_FILE, comparison);
  const reportPath = resolveFcPath(FC_REPORT_FILE);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, "utf8");

  console.log(`Verdict: ${comparison.verdict}`);
  console.log(comparison.summary);
  console.log(`Report: ${reportPath}`);
}

main();
