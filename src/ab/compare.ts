import { AB_LATEST_COMPARISON_FILE, readCurrentPlan, readPlanResults, writeJsonFile } from "./paths.js";
import type { AbComparisonReport, AbMode, AbRunResult, AbTestPlan } from "./types.js";

interface Candidate {
  mode: AbMode;
  combined: number;
  filesReadCount: number;
  mcpToolCalls: number;
  qualityValid: boolean;
  savingsPercent: number;
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
  if (verdict === "saved_tokens") {
    if (winner === "context_broker") return "keep context broker enabled";
    if (winner === "graph") return "use graph only";
    if (winner === "compact_search") return "use compact search only";
  }
  if (verdict === "increased_tokens") return "disable MCP for this client/task";
  if (verdict === "quality_regression") return "rerun due to quality regression before enabling MCP";
  if (verdict === "inconclusive") return "rerun due to missing data";
  return "rerun or keep current workflow";
}

function modeSummary(mode: AbMode): string {
  if (mode === "no_mcp") return "A: no MCP";
  if (mode === "compact_search") return "B: compact search";
  if (mode === "graph") return "C: graph";
  return "D: context broker";
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
    });
  }

  const validCandidates = candidates.filter((candidate) => candidate.qualityValid);
  const winnerCandidate = pickWinner(validCandidates);
  let verdict: AbComparisonReport["verdict"] = "inconclusive";
  let summary = "A/B comparison is inconclusive due to missing or invalid run data.";
  let winner: AbMode | undefined;

  if (!winnerCandidate) {
    if (hasSavingsWithQualityDrop) {
      verdict = "quality_regression";
      summary = "One or more MCP modes reduced token usage but failed quality parity with baseline.";
    }
  } else {
    winner = winnerCandidate.mode;
    if (winnerCandidate.savingsPercent >= 5) {
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

main();
