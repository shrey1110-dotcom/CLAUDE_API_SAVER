import fs from "node:fs";
import path from "node:path";
import { compareFileContextResults } from "./compare.js";
import {
  FC_COMPARISON_FILE,
  FC_REPORT_FILE,
  readCurrentFileContextPlan,
  readFcJson,
  readPlanResults,
  resolveFcPath,
  writeFcJson,
} from "./paths.js";
import { renderFileContextReport } from "./report.js";
import type { FileContextComparison, FileContextMode } from "./types.js";

function resultForMode(
  results: ReturnType<typeof readPlanResults>,
  mode: FileContextMode,
): (typeof results)[number] | undefined {
  return results.find((r) => r.mode === mode);
}

function loadOrBuildComparison(): FileContextComparison {
  const plan = readCurrentFileContextPlan();
  if (!plan) {
    console.error("No active file-context plan. Run npm run ab:file-context:create first.");
    process.exit(1);
  }

  const cached = readFcJson<FileContextComparison>(FC_COMPARISON_FILE);
  if (cached && cached.plan.id === plan.id) {
    return cached;
  }

  const results = readPlanResults(plan.id);
  const comparison = compareFileContextResults(
    plan,
    resultForMode(results, "no_context"),
    resultForMode(results, "file_context_pack"),
  );
  writeFcJson(FC_COMPARISON_FILE, comparison);
  return comparison;
}

function main(): void {
  const comparison = loadOrBuildComparison();
  const report = renderFileContextReport(comparison);
  const reportPath = resolveFcPath(FC_REPORT_FILE);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, "utf8");

  console.log(`File-context report written to ${reportPath}`);
  console.log(`Verdict: ${comparison.verdict}`);
}

main();
