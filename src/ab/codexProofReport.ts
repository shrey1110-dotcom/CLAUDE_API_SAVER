import fs from "node:fs";
import path from "node:path";
import { comparePlan } from "./compare.js";
import { ingestCodexRunsForPlan } from "./ingestCodexRuns.js";
import { AB_LATEST_REPORT_FILE, AB_REPORTS_DIR, readCurrentPlan, readPlanResults, resolveAbPath } from "./paths.js";
import { assessRouting } from "./report.js";
import { calculateRepeatStats, clientRepeatStats, combinedRepeatStats } from "./repeatStats.js";
import type { AbMode, AbRunResult } from "./types.js";

const PROOF_REPORT = path.join(AB_REPORTS_DIR, "codex-locked-proof-report.md");

const LOCKED_FORBIDDEN = [
  "graph_query",
  "graph_symbol",
  "graph_neighbors",
  "graph_paths",
  "repo_map",
  "search_code",
  "get_symbol_context",
];

type ProofVerdict =
  | "PROVEN_SAVINGS_STABLE"
  | "PROMISING_BUT_UNSTABLE"
  | "NO_MEANINGFUL_CHANGE"
  | "INCREASED_USAGE_STABLE"
  | "INCREASED_USAGE_WITH_OUTLIER"
  | "ROUTING_FAILURE"
  | "INCOMPLETE_TEST"
  | "QUALITY_REGRESSION";

function findMode(results: AbRunResult[], mode: AbMode): AbRunResult | undefined {
  return results.find((result) => result.mode === mode);
}

function savingsPercent(baseline: number, candidate: number): number {
  return ((baseline - candidate) / baseline) * 100;
}

function formatStatsBlock(label: string, stats: ReturnType<typeof calculateRepeatStats>): string {
  if (!stats) return `- ${label}: no data`;
  return `- ${label}: mean ${stats.mean}, median ${stats.median}, min ${stats.min}, max ${stats.max}, sd ${stats.standardDeviation}${stats.outlierWarning ? `, OUTLIER max ${stats.largestOutlier}` : ""}`;
}

function forbiddenToolsUsed(run: AbRunResult | undefined): string[] {
  const counts = run?.mcpToolCallCounts ?? {};
  const tools = [...(run?.mcpToolsUsed ?? [])];
  return LOCKED_FORBIDDEN.filter((tool) => (counts[tool] ?? 0) > 0 || tools.some((name) => name.includes(tool)));
}

function deriveProofVerdict(baseline: AbRunResult | undefined, locked: AbRunResult | undefined): {
  verdict: ProofVerdict;
  summary: string;
} {
  const reasons: string[] = [];

  if (!baseline?.clientTotalTokenRepeats || baseline.clientTotalTokenRepeats.length < 3) {
    return { verdict: "INCOMPLETE_TEST", summary: "no_mcp baseline does not have 3 recorded repeats." };
  }

  if (!locked) {
    return { verdict: "INCOMPLETE_TEST", summary: "No context_broker_locked result recorded." };
  }

  const lockedRepeats = locked.clientTotalTokenRepeats ?? [];
  if (lockedRepeats.length < 3) {
    return {
      verdict: "INCOMPLETE_TEST",
      summary: `Locked mode has ${lockedRepeats.length}/3 repeats. Preserve partial data and resume when Codex usage is available.`,
    };
  }

  const routing = assessRouting("context_broker_locked", locked);
  const forbidden = forbiddenToolsUsed(locked);
  if (forbidden.length > 0 || routing.verdict === "incorrect_route") {
    return {
      verdict: "ROUTING_FAILURE",
      summary: `Locked mode routing invalid. Forbidden tools: ${forbidden.join(", ") || "none"}; routing=${routing.verdict}.`,
    };
  }

  if (locked.foundExpectedFiles !== true || (locked.answerQuality ?? 0) < (baseline.answerQuality ?? 0)) {
    return {
      verdict: "QUALITY_REGRESSION",
      summary: "Locked mode did not meet auth-discovery quality parity (all expected files + equal/better score).",
    };
  }

  const baselineCombined = combinedRepeatStats(baseline);
  const lockedCombined = combinedRepeatStats(locked);
  if (!baselineCombined || !lockedCombined) {
    return { verdict: "INCOMPLETE_TEST", summary: "Missing combined repeat stats for comparison." };
  }

  const meanSavings = savingsPercent(baselineCombined.mean, lockedCombined.mean);
  const medianSavings = savingsPercent(baselineCombined.median, lockedCombined.median);

  if (medianSavings >= 5 && meanSavings >= 5 && !lockedCombined.outlierWarning) {
    return {
      verdict: "PROVEN_SAVINGS_STABLE",
      summary: "Locked mode has stable real Codex savings on mean and median combined tokens with quality parity.",
    };
  }

  if (medianSavings >= 5 && meanSavings < 0 && lockedCombined.outlierWarning) {
    return {
      verdict: "PROMISING_BUT_UNSTABLE",
      summary: "Median savings look good but mean is worse due to outlier repeat(s).",
    };
  }

  if (meanSavings < -5 && medianSavings < -5) {
    return {
      verdict: lockedCombined.outlierWarning ? "INCREASED_USAGE_WITH_OUTLIER" : "INCREASED_USAGE_STABLE",
      summary: "Locked mode combined usage is stably higher than no_mcp baseline.",
    };
  }

  return {
    verdict: "NO_MEANINGFUL_CHANGE",
    summary: "Locked mode is within +/-5% on mean/median combined tokens with quality parity.",
  };
}

function buildProofMarkdown(results: AbRunResult[]): string {
  const plan = readCurrentPlan();
  if (!plan) return "# Codex locked proof report\n\nNo active plan.\n";

  const baseline = findMode(results, "no_mcp");
  const locked = findMode(results, "context_broker_locked");
  const compare = comparePlan(plan, results);
  const proof = deriveProofVerdict(baseline, locked);

  const baselineClient = clientRepeatStats(baseline);
  const baselineCombined = combinedRepeatStats(baseline);
  const lockedClient = clientRepeatStats(locked);
  const lockedCombined = combinedRepeatStats(locked);

  const meanSavingsTokens =
    baselineCombined && lockedCombined ? baselineCombined.mean - lockedCombined.mean : undefined;
  const medianSavingsTokens =
    baselineCombined && lockedCombined ? baselineCombined.median - lockedCombined.median : undefined;
  const meanSavingsPercent =
    baselineCombined && lockedCombined ? savingsPercent(baselineCombined.mean, lockedCombined.mean) : undefined;
  const medianSavingsPercent =
    baselineCombined && lockedCombined ? savingsPercent(baselineCombined.median, lockedCombined.median) : undefined;

  const routing = assessRouting("context_broker_locked", locked);
  const forbidden = forbiddenToolsUsed(locked);

  return `# Codex Locked Proof Report

Generated: ${new Date().toISOString()}

## 1. Test setup

- Date/time: ${new Date().toISOString()}
- Client: Codex
- Repo: ${plan.repoPath}
- Task: ${plan.taskName}
- Mode comparison: no_mcp vs context_broker_locked
- Baseline repeats: ${baseline?.clientTotalTokenRepeats?.length ?? 0}
- Locked repeats: ${locked?.clientTotalTokenRepeats?.length ?? 0}
- Usage source: ${locked?.usageParsed ? "auto-parsed from Codex JSON output" : locked?.usageManuallyEntered ? "manual entry" : "missing/partial"}

## 2. No-MCP baseline

${formatStatsBlock("Client total tokens", baselineClient)}
${formatStatsBlock("Combined total tokens", baselineCombined)}
- Repeat values: ${(baseline?.clientTotalTokenRepeats ?? []).join(", ") || "-"}
- Answer quality: ${baseline?.answerQuality ?? "-"}
- Found expected files: ${baseline?.foundExpectedFiles ?? "-"}

## 3. Locked mode

${formatStatsBlock("Client total tokens", lockedClient)}
${formatStatsBlock("Combined total tokens", lockedCombined)}
- Repeat client values: ${(locked?.clientTotalTokenRepeats ?? []).join(", ") || "-"}
- Repeat combined values: ${(locked?.combinedTotalTokenRepeats ?? []).join(", ") || "-"}
- MCP estimated output tokens (total): ${locked?.mcpEstimatedOutputTokens ?? "-"}
- Tools used: ${(locked?.mcpToolsUsed ?? []).join(", ") || "-"}
- Forbidden tools used: ${forbidden.length > 0 ? forbidden.join(", ") : "no"}
- Routing verdict: ${routing.verdict}
- Expected files found: ${locked?.foundExpectedFiles ?? "-"}
- Quality scores: ${locked?.answerQuality ?? "-"}

## 4. Savings calculation

- Mean savings tokens: ${meanSavingsTokens ?? "-"}
- Median savings tokens: ${medianSavingsTokens ?? "-"}
- Mean savings percent: ${meanSavingsPercent !== undefined ? `${meanSavingsPercent.toFixed(1)}%` : "-"}
- Median savings percent: ${medianSavingsPercent !== undefined ? `${medianSavingsPercent.toFixed(1)}%` : "-"}

## 5. Verdict

- Proof verdict: **${proof.verdict}**
- Compare verdict: ${compare.report.verdict}
- Summary: ${proof.summary}

## 6. Evidence

- Real usage source: Codex \`turn.completed\` / \`usage\` JSON in stdout (when parsed)
- MCP telemetry summary: ${locked?.telemetryReportPath ?? ".mcp-telemetry/report.md"}
- Latest A/B report: ${resolveAbPath(AB_LATEST_REPORT_FILE)}
- Locked transcript: ${locked?.transcriptPath ?? "-"}
- Locked output dir: ${locked?.adapterOutputDir ?? "-"}

## 7. Product conclusion

${
  proof.verdict === "PROVEN_SAVINGS_STABLE"
    ? "Savings are proven for Codex auth-discovery with locked context broker (real usage + quality parity + stable repeats)."
    : proof.verdict === "INCOMPLETE_TEST"
      ? "Savings are not proven because locked repeats did not complete (or baseline/repeat data is incomplete)."
      : proof.verdict === "QUALITY_REGRESSION"
        ? "Savings are not proven because locked mode quality regressed versus baseline."
        : proof.verdict === "ROUTING_FAILURE"
          ? "Savings are not proven because locked routing was invalid."
          : "Savings are not proven under current real Codex evidence for this task."
}
`;
}

function main(): void {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found.");
    process.exit(1);
  }

  ingestCodexRunsForPlan(plan);
  const results = readPlanResults(plan.id);
  const proof = deriveProofVerdict(findMode(results, "no_mcp"), findMode(results, "context_broker_locked"));
  const markdown = buildProofMarkdown(results);
  const outPath = resolveAbPath(PROOF_REPORT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, "utf8");
  console.log(`Codex locked proof report written to ${outPath}`);
  console.log(`proof_verdict=${proof.verdict}`);
}

main();
