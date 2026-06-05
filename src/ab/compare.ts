import { AB_LATEST_COMPARISON_FILE, readCurrentPlan, readPlanResults, writeJsonFile } from "./paths.js";
import { combinedRepeatStats, type RepeatStats } from "./repeatStats.js";
import { assessContextBrokerToolLoop } from "./toolLoopPolicy.js";
import type { AbComparisonReport, AbMode, AbRunResult, AbTestPlan } from "./types.js";

interface Candidate {
  mode: AbMode;
  combined: number;
  filesReadCount: number;
  mcpToolCalls: number;
  qualityValid: boolean;
  savingsPercent: number;
  repeatStats?: RepeatStats;
}

export interface CompareOutcome {
  report: AbComparisonReport;
  recommendation: string;
  baselineClientTotal?: number;
}

function countList(items: string[] | undefined): number {
  return (items ?? []).length;
}

function pickWinner(candidates: Candidate[]): Candidate | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  return [...candidates].sort((a, b) => {
    if (a.combined !== b.combined) return a.combined - b.combined;
    if (a.filesReadCount !== b.filesReadCount) return a.filesReadCount - b.filesReadCount;
    return a.mcpToolCalls - b.mcpToolCalls;
  })[0];
}

function recommendationFor(verdict: AbComparisonReport["verdict"], winner?: AbMode): string {
  if (verdict === "saved_tokens" || verdict === "PROVEN_SAVINGS_STABLE") {
    if (winner === "context_broker" || winner === "context_broker_locked") return "keep context broker enabled";
    if (winner === "graph") return "use graph only";
    if (winner === "compact_search") return "use compact search only";
  }
  if (verdict === "PROMISING_BUT_UNSTABLE") return "rerun locked mode and investigate outlier/tool-loop variance";
  if (verdict === "increased_tokens" || verdict === "INCREASED_USAGE_STABLE" || verdict === "INCREASED_USAGE_WITH_OUTLIER") {
    return "disable MCP for this client/task";
  }
  if (verdict === "quality_regression") return "rerun due to quality regression before enabling MCP";
  if (verdict === "TOOL_LOOP_FAILURE" || verdict === "ROUTING_FAILURE") {
    return "use context_broker_locked for Codex proof; do not rerun full context_broker as savings proof";
  }
  if (verdict === "inconclusive") return "rerun due to missing data";
  return "rerun or keep current workflow";
}

function contextBrokerLoopVerdict(
  results: AbRunResult[],
  baselineClientTotal: number,
): Pick<AbComparisonReport, "verdict" | "summary"> | undefined {
  const locked = results.find((result) => result.mode === "context_broker_locked");
  if (locked && typeof locked.combinedTotalTokens === "number") return undefined;

  const broker = results.find((result) => result.mode === "context_broker");
  if (!broker) return undefined;

  const loop = assessContextBrokerToolLoop({
    counts: broker.mcpToolCallCounts ?? {},
    totalCalls: broker.mcpToolCalls,
  });
  const combined = broker.combinedTotalTokens;
  if (!loop.toolLoopFailure || typeof combined !== "number") {
    return undefined;
  }

  if (combined > baselineClientTotal) {
    return {
      verdict: "TOOL_LOOP_FAILURE",
      summary:
        "Full context_broker exceeded fallback budgets and increased combined tokens. Codex entered a tool exploration loop; use context_broker_locked for proof.",
    };
  }

  return {
    verdict: "ROUTING_FAILURE",
    summary: "Full context_broker exceeded fallback budgets even though combined tokens did not beat baseline.",
  };
}

function modeSummary(mode: AbMode): string {
  if (mode === "no_mcp") return "A: no MCP";
  if (mode === "compact_search") return "B: compact search";
  if (mode === "graph") return "C: graph";
  if (mode === "context_broker_locked") return "D2: locked context broker";
  return "D1: context broker";
}

function percentDelta(baseline: number, candidate: number): number {
  return ((baseline - candidate) / baseline) * 100;
}

function stabilityVerdict(input: {
  baselineStats?: RepeatStats;
  candidateStats?: RepeatStats;
  candidateMode: AbMode;
}): Pick<AbComparisonReport, "verdict" | "summary"> | undefined {
  const { baselineStats, candidateStats, candidateMode } = input;
  if (!baselineStats || !candidateStats || baselineStats.values.length < 2 || candidateStats.values.length < 2) {
    return undefined;
  }

  const meanSavingsPercent = percentDelta(baselineStats.mean, candidateStats.mean);
  const medianSavingsPercent = percentDelta(baselineStats.median, candidateStats.median);
  const hasOutlier = candidateStats.outlierWarning;

  if (medianSavingsPercent >= 5 && meanSavingsPercent < 0 && hasOutlier) {
    return {
      verdict: "PROMISING_BUT_UNSTABLE",
      summary: `${modeSummary(candidateMode)} median combined tokens are lower than baseline, but mean usage is worse due to an outlier. Likely tool-loop explosion.`,
    };
  }

  if (meanSavingsPercent >= 5 && medianSavingsPercent >= 5 && !hasOutlier) {
    return {
      verdict: "PROVEN_SAVINGS_STABLE",
      summary: `${modeSummary(candidateMode)} has stable repeat savings: mean and median are both at least 5% below baseline with equal/better quality.`,
    };
  }

  if (meanSavingsPercent < -5 && medianSavingsPercent < -5) {
    return {
      verdict: hasOutlier ? "INCREASED_USAGE_WITH_OUTLIER" : "INCREASED_USAGE_STABLE",
      summary: hasOutlier
        ? `${modeSummary(candidateMode)} is worse on mean and median combined tokens, with an outlier warning.`
        : `${modeSummary(candidateMode)} is stably worse on mean and median combined tokens.`,
    };
  }

  return undefined;
}

export function comparePlan(plan: AbTestPlan, results: AbRunResult[]): CompareOutcome {
  const byMode = new Map<AbMode, AbRunResult>();
  for (const result of results) {
    byMode.set(result.mode, result);
  }

  const baseline = byMode.get("no_mcp");
  if (!baseline || typeof baseline.clientTotalTokens !== "number" || typeof baseline.answerQuality !== "number") {
    const report: AbComparisonReport = {
      plan,
      results,
      verdict: "inconclusive",
      summary: "Baseline run is missing required fields (client total tokens and answer quality).",
    };
    return { report, recommendation: recommendationFor(report.verdict) };
  }

  const baselineClientTotal = baseline.clientTotalTokens;
  const baselineQuality = baseline.answerQuality;
  const baselineRepeatStats = combinedRepeatStats(baseline);

  const candidates: Candidate[] = [];
  let hasSavingsWithQualityDrop = false;

  for (const mode of plan.modes) {
    if (mode === "no_mcp") continue;
    const result = byMode.get(mode);
    if (!result) continue;
    const combined = result.combinedTotalTokens;
    if (typeof combined !== "number") continue;

    const savingsPercent = ((baselineClientTotal - combined) / baselineClientTotal) * 100;
    const qualityValid = (result.answerQuality ?? -1) >= baselineQuality && result.foundExpectedFiles === true;
    if (!qualityValid && combined < baselineClientTotal) {
      hasSavingsWithQualityDrop = true;
    }

    candidates.push({
      mode,
      combined,
      filesReadCount: countList(result.filesRead),
      mcpToolCalls: result.mcpToolCalls ?? Number.MAX_SAFE_INTEGER,
      qualityValid,
      savingsPercent,
      repeatStats: combinedRepeatStats(result),
    });
  }

  const validCandidates = candidates.filter((candidate) => candidate.qualityValid);
  const winnerCandidate = pickWinner(validCandidates);
  let verdict: AbComparisonReport["verdict"] = "inconclusive";
  let summary = "A/B comparison is inconclusive due to missing or invalid run data.";
  let winner: AbMode | undefined;

  const brokerLoop = contextBrokerLoopVerdict(results, baselineClientTotal);
  if (brokerLoop) {
    verdict = brokerLoop.verdict;
    summary = brokerLoop.summary;
  } else if (!winnerCandidate) {
    if (hasSavingsWithQualityDrop) {
      verdict = "quality_regression";
      summary = "One or more MCP modes reduced token usage but failed quality parity with baseline.";
    }
  } else {
    winner = winnerCandidate.mode;
    const stable = stabilityVerdict({
      baselineStats: baselineRepeatStats,
      candidateStats: winnerCandidate.repeatStats,
      candidateMode: winnerCandidate.mode,
    });
    if (stable) {
      verdict = stable.verdict;
      summary = stable.summary;
    } else if (winnerCandidate.savingsPercent >= 5) {
      verdict = "saved_tokens";
      summary = `${modeSummary(winnerCandidate.mode)} wins with ${winnerCandidate.savingsPercent.toFixed(1)}% lower combined tokens than baseline.`;
    } else if (winnerCandidate.savingsPercent >= -5 && winnerCandidate.savingsPercent <= 5) {
      verdict = "no_meaningful_change";
      summary = `${modeSummary(winnerCandidate.mode)} is within +/-5% of baseline combined tokens.`;
    } else {
      verdict = "increased_tokens";
      summary = `All quality-valid MCP modes are more than 5% worse than baseline for combined tokens.`;
    }
  }

  const report: AbComparisonReport = {
    plan,
    results,
    winner,
    verdict,
    summary,
  };
  return {
    report,
    recommendation: recommendationFor(verdict, winner),
    baselineClientTotal,
  };
}

function main(): void {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found. Run npm run ab:create first.");
    process.exit(1);
  }
  const results = readPlanResults(plan.id);
  const outcome = comparePlan(plan, results);
  writeJsonFile(AB_LATEST_COMPARISON_FILE, outcome.report);

  console.log(`Verdict: ${outcome.report.verdict}`);
  console.log(`Summary: ${outcome.report.summary}`);
  console.log(`Recommendation: ${outcome.recommendation}`);
  if (outcome.report.winner) {
    console.log(`Winner: ${outcome.report.winner}`);
  }
}

const isMain = process.argv[1]?.endsWith("compare.js");
if (isMain) {
  main();
}
// isMain matches dist/compare.js suffix
