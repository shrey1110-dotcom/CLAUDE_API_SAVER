import fs from "node:fs";
import path from "node:path";
import { assessRealCheck } from "./assessRealCheck.js";
import { ingestClaudeRunsForPlan } from "./ingestClaudeRuns.js";
import { AB_REPORTS_DIR, readCurrentPlan, readPlanResults, resolveAbPath } from "./paths.js";
import { assessRouting } from "./report.js";
import { calculateRepeatStats, clientRepeatStats, combinedRepeatStats } from "./repeatStats.js";
import type { AbMode, AbRunResult } from "./types.js";

export const CLAUDE_PROOF_DOC = "docs/proofs/claude-auth-discovery-locked.md";
export const CLAUDE_PROOF_REPORT = path.join(AB_REPORTS_DIR, "claude-auth-discovery-locked-report.md");

const LOCKED_FORBIDDEN = [
  "graph_query",
  "graph_symbol",
  "graph_neighbors",
  "graph_paths",
  "repo_map",
  "search_code",
  "get_symbol_context",
];

export type ClaudeProofVerdict =
  | "NOT_STARTED"
  | "INCOMPLETE_TEST"
  | "PROVEN_SAVINGS_STABLE"
  | "PROMISING_BUT_UNSTABLE"
  | "NO_MEANINGFUL_CHANGE"
  | "INCREASED_USAGE_STABLE"
  | "INCREASED_USAGE_WITH_OUTLIER"
  | "ROUTING_FAILURE"
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

export function deriveClaudeProofVerdict(
  baseline: AbRunResult | undefined,
  locked: AbRunResult | undefined,
): { verdict: ClaudeProofVerdict; summary: string } {
  if (!baseline && !locked) {
    return { verdict: "NOT_STARTED", summary: "No Claude A/B runs recorded yet." };
  }

  const assessment = assessRealCheck(
    {
      id: "claude-proof",
      createdAt: new Date().toISOString(),
      client: "claude_code",
      repoPath: ".",
      taskName: "auth-discovery",
      taskPrompt: "",
      modes: ["no_mcp", "context_broker_locked"],
    },
    [baseline, locked].filter((result): result is AbRunResult => Boolean(result)),
  );

  if (assessment.status === "PROVEN_SAVINGS_STABLE") {
    return { verdict: "PROVEN_SAVINGS_STABLE", summary: assessment.reasons[0] ?? "Stable savings with quality parity." };
  }
  if (assessment.status === "PROMISING_BUT_UNSTABLE") {
    return { verdict: "PROMISING_BUT_UNSTABLE", summary: assessment.reasons[0] ?? "Promising but unstable repeats." };
  }
  if (assessment.status === "NO_MEANINGFUL_CHANGE") {
    return { verdict: "NO_MEANINGFUL_CHANGE", summary: "No meaningful token change versus baseline." };
  }
  if (assessment.status === "INCREASED_USAGE_STABLE" || assessment.status === "INCREASED_USAGE_WITH_OUTLIER") {
    return {
      verdict: assessment.status === "INCREASED_USAGE_WITH_OUTLIER" ? "INCREASED_USAGE_WITH_OUTLIER" : "INCREASED_USAGE_STABLE",
      summary: "Locked mode combined usage is higher than no_mcp baseline.",
    };
  }
  if (assessment.status === "ROUTING_FAILURE") {
    return { verdict: "ROUTING_FAILURE", summary: assessment.reasons.join(" ") };
  }
  if (assessment.status === "QUALITY_REGRESSION") {
    return { verdict: "QUALITY_REGRESSION", summary: assessment.reasons.join(" ") };
  }

  return {
    verdict: "INCOMPLETE_TEST",
    summary: assessment.reasons.join(" ") || "Real Claude usage or repeat data is incomplete.",
  };
}

export function buildClaudeProofMarkdown(results: AbRunResult[]): string {
  const plan = readCurrentPlan();
  const baseline = findMode(results, "no_mcp");
  const locked = findMode(results, "context_broker_locked");
  const proof = deriveClaudeProofVerdict(baseline, locked);

  const baselineClient = clientRepeatStats(baseline);
  const baselineCombined = combinedRepeatStats(baseline);
  const lockedClient = clientRepeatStats(locked);
  const lockedCombined = combinedRepeatStats(locked);
  const routing = assessRouting("context_broker_locked", locked);
  const forbidden = forbiddenToolsUsed(locked);

  const meanSavingsPercent =
    baselineCombined && lockedCombined ? savingsPercent(baselineCombined.mean, lockedCombined.mean) : undefined;
  const medianSavingsPercent =
    baselineCombined && lockedCombined ? savingsPercent(baselineCombined.median, lockedCombined.median) : undefined;

  const statusLine =
    proof.verdict === "NOT_STARTED"
      ? "NOT_STARTED"
      : proof.verdict === "PROVEN_SAVINGS_STABLE"
        ? "PROVEN_SAVINGS_STABLE"
        : proof.verdict === "INCOMPLETE_TEST" || !baseline?.usageParsed || !locked?.usageParsed
          ? "INCOMPLETE_TEST"
          : proof.verdict;

  return `# Claude auth-discovery locked proof

Last updated: ${new Date().toISOString().slice(0, 10)}

## Status

**${statusLine}**

Claude savings are **not proven** until this doc shows \`PROVEN_SAVINGS_STABLE\` with real parsed Claude usage from \`ab:claude:real-check\`.

## Test task

- Task: \`auth-discovery\`
- Prompt: find authentication, login, and session logic (do not edit files)
- Mode: \`context_broker_locked\` with \`MCP_TOOL_PROFILE=codex_locked\` (generic two-tool locked profile)
- Client: Claude Code CLI

## Expected files (quality rubric)

1. \`tests/fixtures/simple-node-app/src/auth/login.ts\`
2. \`tests/fixtures/simple-node-app/src/auth/session.ts\`
3. \`tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts\`
4. \`tests/fixtures/monorepo-app/packages/api/src/session.service.ts\`
5. \`tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx\`

Quality parity requires 5/5 expected files and locked score ≥ no-MCP score.

## Proof rule

1. Three no-MCP repeats with **real parsed Claude usage**
2. Three locked repeats with **real parsed Claude usage**
3. Locked routing: \`context_status\` + \`context_pack\` only (no graph/search/symbol tools)
4. \`npm run ab:claude:real-check\` returns \`PROVEN_SAVINGS_STABLE\`
5. Do not infer tokens from transcript length

## How to run

\`\`\`bash
npm run ab:claude:doctor
npm run ab:claude:plan
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode no_mcp --repo . --task auth-discovery --repeat 3 --yes
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode context_broker_locked --repo . --task auth-discovery --repeat 3 --yes
npm run ab:claude:ingest
npm run ab:claude:report
npm run ab:claude:real-check
\`\`\`

If Claude CLI output lacks usage fields, record real usage manually with \`npm run ab:record\` before real-check.

## Current results

### No-MCP baseline

${formatStatsBlock("Client total tokens", baselineClient)}
${formatStatsBlock("Combined total tokens", baselineCombined)}
- Repeats: ${baseline?.clientTotalTokenRepeats?.length ?? 0}/3
- Usage parsed: ${baseline?.usageParsed ? "yes" : "no"}
- Quality: ${baseline?.answerQuality ?? "-"}

### Locked mode

${formatStatsBlock("Client total tokens", lockedClient)}
${formatStatsBlock("Combined total tokens", lockedCombined)}
- Repeats: ${locked?.clientTotalTokenRepeats?.length ?? 0}/3
- Usage parsed: ${locked?.usageParsed ? "yes" : "no"}
- MCP tokens (est.): ${locked?.mcpEstimatedOutputTokens ?? "-"}
- Tools used: ${(locked?.mcpToolsUsed ?? []).join(", ") || "-"}
- Forbidden tools: ${forbidden.length > 0 ? forbidden.join(", ") : "none"}
- Routing: ${routing.verdict}
- Quality: ${locked?.answerQuality ?? "-"}

### Savings (only valid when usage parsed)

- Mean savings %: ${meanSavingsPercent !== undefined ? `${meanSavingsPercent.toFixed(1)}%` : "n/a"}
- Median savings %: ${medianSavingsPercent !== undefined ? `${medianSavingsPercent.toFixed(1)}%` : "n/a"}

## Verdict

- **${proof.verdict}**
- ${proof.summary}

## Non-claims

- Claude savings are **not proven** unless verdict is \`PROVEN_SAVINGS_STABLE\`
- Do not use full \`context_broker\` for Claude proof
- Do not compare against Graphify without a head-to-head test
- Codex locked proof does not imply Claude savings
`;
}

function main(): void {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found. Run npm run ab:claude:plan first.");
    process.exit(1);
  }

  ingestClaudeRunsForPlan(plan);
  const results = readPlanResults(plan.id);
  const markdown = buildClaudeProofMarkdown(results);
  const docPath = resolveAbPath(CLAUDE_PROOF_DOC);
  const reportPath = resolveAbPath(CLAUDE_PROOF_REPORT);
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(docPath, markdown, "utf8");
  fs.writeFileSync(reportPath, markdown, "utf8");

  const proof = deriveClaudeProofVerdict(findMode(results, "no_mcp"), findMode(results, "context_broker_locked"));
  console.log(`Claude proof doc written to ${docPath}`);
  console.log(`Claude proof report written to ${reportPath}`);
  console.log(`proof_verdict=${proof.verdict}`);
}

const isMain = process.argv[1]?.endsWith("claudeProofReport.js");
if (isMain) {
  main();
}
// locked mode forbids graph + repo_map tools
