import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCliArgs, readStringArg } from "../ab/cli.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { calculateRepeatStats } from "../ab/repeatStats.js";
import { buildContextPack } from "../context/broker.js";
import type { ContextMode } from "../context/types.js";
import { formatToolResult, getOutputCharCount } from "../output.js";
import { resolveRoot } from "../pathSafety.js";
import { COMPRESSION_BUDGET_TOKENS } from "./compressionTasks.js";
import { COMPRESSION_OUTPUT_DIR, DIAGNOSTIC_WARNING } from "./compressionReport.js";
import { estimateTokensFromChars, scanFullRepoTokens, scanRelevantFileTokens } from "./scanRepoTokens.js";

export const GRAPHIFY_HEAD_TO_HEAD_MD = path.join(COMPRESSION_OUTPUT_DIR, "graphify-head-to-head-report.md");
export const GRAPHIFY_HEAD_TO_HEAD_JSON = path.join(COMPRESSION_OUTPUT_DIR, "graphify-head-to-head-report.json");
export const PROTOCOL_PATH = "docs/benchmarks/graphify-head-to-head.md";

const MODE_BY_TASK: Record<string, ContextMode> = {
  "auth-discovery": "discovery",
  "impact-analysis": "impact",
  "edit-planning": "edit",
  "architecture-discovery": "discovery",
  "onboarding-map": "discovery",
};

export type GraphifyArmStatus =
  | "NOT_RUN"
  | "NEEDS_QUERY_COMMAND"
  | "RUN_OK"
  | "RUN_FAILED"
  | "OUTPUT_FILE";

export type GraphifyHeadToHeadVerdict =
  | "GRAPHIFY_NOT_RUN"
  | "GRAPHIFY_FOUND_NEEDS_EXPLICIT_QUERY_COMMAND"
  | "GRAPHIFY_RUN_FAILED"
  | "DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM"
  | "SCOPED_REAL_USAGE_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT_MCP";

export interface ScoredArm {
  status: string;
  outputTokens: number | null;
  matchedFiles: string[];
  missingFiles: string[];
  matchedConcepts: string[];
  missingConcepts: string[];
  qualityScore: number | null;
  fullRepoCompressionRatio: number | null;
  relevantFilesCompressionRatio: number | null;
  note?: string;
  helpExcerpt?: string;
  command?: string;
  error?: string;
}

export interface RealUsageComparison {
  graphifyCombinedTotals: number[];
  repoContextCombinedTotals: number[];
  graphifyQualityScores: number[];
  repoContextQualityScores: number[];
  graphifyMeanCombinedTokens: number | null;
  graphifyMedianCombinedTokens: number | null;
  repoContextMeanCombinedTokens: number | null;
  repoContextMedianCombinedTokens: number | null;
  repoContextMeanReductionVsGraphify: number | null;
  repoContextMedianReductionVsGraphify: number | null;
  graphifyMinQuality: number | null;
  repoContextMinQuality: number | null;
  supportsScopedClaim: boolean;
  scopedClaimReason: string;
}

export interface GraphifyHeadToHeadReport {
  generatedAt: string;
  taskName: string;
  repoRoot: string;
  warning: string;
  fullRawRepoTokens: number;
  relevantRawFileTokens: number;
  graphify: ScoredArm & { armStatus: GraphifyArmStatus };
  repoContext: ScoredArm & { contextPackTokens: number };
  diagnosticWinner: string;
  realUsage: RealUsageComparison | null;
  verdict: GraphifyHeadToHeadVerdict;
  allowedClaim: string;
}

export interface GraphifyHeadToHeadOptions {
  taskName: string;
  repoPath?: string;
  graphifyBin?: string;
  graphifyBuildCommand?: string;
  graphifyQueryCommand?: string;
  graphifyOutputFile?: string;
  graphifyCombinedTotals?: string;
  repoContextCombinedTotals?: string;
  graphifyQualityScores?: string;
  repoContextQualityScores?: string;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

function parseNumberList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isFinite(num));
}

export function resolveGraphifyBin(bin = "graphify"): string | undefined {
  const run = spawnSync("which", [bin], { encoding: "utf8" });
  if (run.status === 0) {
    const resolved = run.stdout.trim();
    return resolved.length > 0 ? resolved : undefined;
  }
  return undefined;
}

function runShellCommand(command: string, cwd: string): { ok: boolean; stdout: string; stderr: string; code: number | null } {
  const run = spawnSync(command, {
    cwd,
    encoding: "utf8",
    shell: true,
    timeout: 600_000,
  });
  return {
    ok: run.status === 0,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    code: run.status,
  };
}

function scoreOutput(profile: ReturnType<typeof getCodexQaTask>, text: string, fullRawRepoTokens: number, relevantRawFileTokens: number) {
  const score = profile ? scoreCodexQaText(profile, text) : null;
  const outputTokens = estimateTokensFromChars(Buffer.byteLength(text, "utf8"));
  return {
    outputTokens,
    matchedFiles: score?.matchedFiles ?? [],
    missingFiles: score?.missingFiles ?? [],
    matchedConcepts: score?.matchedConcepts ?? [],
    missingConcepts: score?.missingConcepts ?? [],
    qualityScore: score?.qualityScore ?? null,
    fullRepoCompressionRatio: ratio(fullRawRepoTokens, outputTokens),
    relevantFilesCompressionRatio: ratio(relevantRawFileTokens, outputTokens),
    note: score?.note,
  };
}

export function runRepoContextArm(
  taskName: string,
  repoRoot: string,
  fullRawRepoTokens: number,
  relevantRawFileTokens: number,
): GraphifyHeadToHeadReport["repoContext"] {
  const profile = getCodexQaTask(taskName);
  if (!profile) {
    throw new Error(`Unknown task: ${taskName}`);
  }

  const pack = buildContextPack({
    task: profile.prompt,
    root: repoRoot,
    mode: MODE_BY_TASK[taskName] ?? "discovery",
    budgetTokens: COMPRESSION_BUDGET_TOKENS,
  });
  const formatted = formatToolResult(pack);
  const contextPackTokens = pack.estimatedOutputTokens ?? estimateTokensFromChars(getOutputCharCount(formatted));
  const serialized = JSON.stringify(pack);
  const scored = scoreOutput(profile, serialized, fullRawRepoTokens, relevantRawFileTokens);

  return {
    status: "DIAGNOSTIC_COMPLETE",
    contextPackTokens,
    outputTokens: contextPackTokens,
    matchedFiles: scored.matchedFiles,
    missingFiles: scored.missingFiles,
    matchedConcepts: scored.matchedConcepts,
    missingConcepts: scored.missingConcepts,
    qualityScore: scored.qualityScore,
    fullRepoCompressionRatio: ratio(fullRawRepoTokens, contextPackTokens),
    relevantFilesCompressionRatio: ratio(relevantRawFileTokens, contextPackTokens),
    note: scored.note,
  };
}

export function runGraphifyArm(
  options: GraphifyHeadToHeadOptions,
  repoRoot: string,
  fullRawRepoTokens: number,
  relevantRawFileTokens: number,
): GraphifyHeadToHeadReport["graphify"] {
  const profile = getCodexQaTask(options.taskName);
  const emptyArm = (armStatus: GraphifyArmStatus, extra: Partial<GraphifyHeadToHeadReport["graphify"]> = {}): GraphifyHeadToHeadReport["graphify"] => ({
    armStatus,
    status: armStatus,
    outputTokens: null,
    matchedFiles: [],
    missingFiles: profile?.expectedFilePatterns ?? [],
    matchedConcepts: [],
    missingConcepts: profile?.expectedConcepts ?? [],
    qualityScore: null,
    fullRepoCompressionRatio: null,
    relevantFilesCompressionRatio: null,
    ...extra,
  });

  if (options.graphifyOutputFile) {
    const filePath = path.resolve(repoRoot, options.graphifyOutputFile);
    if (!fs.existsSync(filePath)) {
      return emptyArm("RUN_FAILED", {
        status: "RUN_FAILED",
        error: `graphify output file not found: ${filePath}`,
      });
    }
    const text = fs.readFileSync(filePath, "utf8");
    const scored = scoreOutput(profile, text, fullRawRepoTokens, relevantRawFileTokens);
    return {
      armStatus: "OUTPUT_FILE",
      status: "OUTPUT_FILE",
      ...scored,
      note: scored.note ?? `Scored saved Graphify output from ${options.graphifyOutputFile}`,
    };
  }

  if (options.graphifyQueryCommand) {
    if (options.graphifyBuildCommand) {
      const build = runShellCommand(options.graphifyBuildCommand, repoRoot);
      if (!build.ok) {
        return emptyArm("RUN_FAILED", {
          status: "RUN_FAILED",
          command: options.graphifyBuildCommand,
          error: build.stderr.trim() || `build command exited ${build.code}`,
        });
      }
    }
    const query = runShellCommand(options.graphifyQueryCommand, repoRoot);
    const text = `${query.stdout}\n${query.stderr}`.trim();
    if (!query.ok) {
      return emptyArm("RUN_FAILED", {
        status: "RUN_FAILED",
        command: options.graphifyQueryCommand,
        error: query.stderr.trim() || `query command exited ${query.code}`,
      });
    }
    const scored = scoreOutput(profile, text, fullRawRepoTokens, relevantRawFileTokens);
    return {
      armStatus: "RUN_OK",
      status: "RUN_OK",
      ...scored,
      command: options.graphifyQueryCommand,
      note: scored.note ?? "Scored Graphify query command output",
    };
  }

  const graphifyPath = resolveGraphifyBin(options.graphifyBin ?? "graphify");
  if (!graphifyPath) {
    return emptyArm("NOT_RUN", {
      note: "Graphify CLI was not found on PATH and no query command or output file was supplied.",
    });
  }

  const help = spawnSync(graphifyPath, ["--help"], { encoding: "utf8", timeout: 30_000 });
  const helpText = `${help.stdout}\n${help.stderr}`.trim();
  return emptyArm("NEEDS_QUERY_COMMAND", {
    note: "Graphify binary found, but no explicit --graphify-query-command or --graphify-output-file was supplied.",
    helpExcerpt: helpText.split("\n").slice(0, 40).join("\n") || "(no help output)",
    command: graphifyPath,
  });
}

export function evaluateRealUsageComparison(input: {
  graphifyCombinedTotals?: string;
  repoContextCombinedTotals?: string;
  graphifyQualityScores?: string;
  repoContextQualityScores?: string;
}): RealUsageComparison | null {
  const graphifyCombinedTotals = parseNumberList(input.graphifyCombinedTotals);
  const repoContextCombinedTotals = parseNumberList(input.repoContextCombinedTotals);
  const graphifyQualityScores = parseNumberList(input.graphifyQualityScores);
  const repoContextQualityScores = parseNumberList(input.repoContextQualityScores);

  if (graphifyCombinedTotals.length === 0 && repoContextCombinedTotals.length === 0) {
    return null;
  }

  const graphifyStats = calculateRepeatStats(graphifyCombinedTotals);
  const repoContextStats = calculateRepeatStats(repoContextCombinedTotals);
  const graphifyMinQuality = graphifyQualityScores.length > 0 ? Math.min(...graphifyQualityScores) : null;
  const repoContextMinQuality = repoContextQualityScores.length > 0 ? Math.min(...repoContextQualityScores) : null;

  let repoContextMeanReductionVsGraphify: number | null = null;
  let repoContextMedianReductionVsGraphify: number | null = null;
  if (graphifyStats && repoContextStats && graphifyStats.mean > 0 && graphifyStats.median > 0) {
    repoContextMeanReductionVsGraphify = Math.round(((graphifyStats.mean - repoContextStats.mean) / graphifyStats.mean) * 1000) / 10;
    repoContextMedianReductionVsGraphify =
      Math.round(((graphifyStats.median - repoContextStats.median) / graphifyStats.median) * 1000) / 10;
  }

  const hasThreeRepeats = graphifyCombinedTotals.length >= 3 && repoContextCombinedTotals.length >= 3;
  const hasQuality = graphifyQualityScores.length >= 3 && repoContextQualityScores.length >= 3;
  const tokensWin =
    repoContextStats !== undefined &&
    graphifyStats !== undefined &&
    repoContextStats.median < graphifyStats.median;
  const qualityOk =
    graphifyMinQuality !== null &&
    repoContextMinQuality !== null &&
    repoContextMinQuality >= graphifyMinQuality;

  let supportsScopedClaim = false;
  let scopedClaimReason = "Recorded real usage was not complete for a scoped comparative claim.";
  if (!hasThreeRepeats) {
    scopedClaimReason = "Need at least 3 repeats per arm for a scoped real-usage claim.";
  } else if (!hasQuality) {
    scopedClaimReason = "Need quality scores for at least 3 repeats per arm.";
  } else if (!tokensWin) {
    scopedClaimReason = "repo-context-mcp median combined tokens are not lower than Graphify.";
  } else if (!qualityOk) {
    scopedClaimReason = "repo-context-mcp minimum quality is below Graphify minimum quality.";
  } else {
    supportsScopedClaim = true;
    scopedClaimReason =
      "Same-repo same-task recorded usage shows repo-context-mcp median combined tokens below Graphify with equal or better minimum quality across 3+ repeats.";
  }

  return {
    graphifyCombinedTotals,
    repoContextCombinedTotals,
    graphifyQualityScores,
    repoContextQualityScores,
    graphifyMeanCombinedTokens: graphifyStats?.mean ?? null,
    graphifyMedianCombinedTokens: graphifyStats?.median ?? null,
    repoContextMeanCombinedTokens: repoContextStats?.mean ?? null,
    repoContextMedianCombinedTokens: repoContextStats?.median ?? null,
    repoContextMeanReductionVsGraphify,
    repoContextMedianReductionVsGraphify,
    graphifyMinQuality,
    repoContextMinQuality,
    supportsScopedClaim,
    scopedClaimReason,
  };
}

export function pickDiagnosticWinner(
  graphify: GraphifyHeadToHeadReport["graphify"],
  repoContext: GraphifyHeadToHeadReport["repoContext"],
): string {
  if (graphify.armStatus === "NOT_RUN") {
    return "repo-context-mcp (Graphify not run; diagnostic only)";
  }
  if (graphify.armStatus === "NEEDS_QUERY_COMMAND") {
    return "repo-context-mcp (Graphify found but not executed; diagnostic only)";
  }
  if (graphify.outputTokens === null || graphify.qualityScore === null || repoContext.qualityScore === null) {
    return "inconclusive";
  }

  const graphifyQuality = graphify.qualityScore;
  const repoQuality = repoContext.qualityScore;
  if (repoQuality > graphifyQuality) {
    return "repo-context-mcp (higher diagnostic quality score)";
  }
  if (graphifyQuality > repoQuality) {
    return "graphify (higher diagnostic quality score)";
  }

  if (repoContext.contextPackTokens < graphify.outputTokens) {
    return "repo-context-mcp (equal quality, fewer diagnostic output tokens)";
  }
  if (graphify.outputTokens < repoContext.contextPackTokens) {
    return "graphify (equal quality, fewer diagnostic output tokens)";
  }
  return "tie (equal diagnostic quality and output tokens)";
}

export function determineVerdict(
  graphify: GraphifyHeadToHeadReport["graphify"],
  realUsage: RealUsageComparison | null,
): { verdict: GraphifyHeadToHeadVerdict; allowedClaim: string } {
  if (graphify.armStatus === "NOT_RUN") {
    return {
      verdict: "GRAPHIFY_NOT_RUN",
      allowedClaim: "No Graphify comparison was run. repo-context-mcp diagnostic arm only.",
    };
  }
  if (graphify.armStatus === "NEEDS_QUERY_COMMAND") {
    return {
      verdict: "GRAPHIFY_FOUND_NEEDS_EXPLICIT_QUERY_COMMAND",
      allowedClaim:
        "Graphify binary was found, but no explicit query command or saved output was supplied. Diagnostic repo-context-mcp arm only.",
    };
  }
  if (graphify.armStatus === "RUN_FAILED") {
    return {
      verdict: "GRAPHIFY_RUN_FAILED",
      allowedClaim: "Graphify arm failed. No comparative claim against Graphify is allowed.",
    };
  }

  if (realUsage?.supportsScopedClaim) {
    return {
      verdict: "SCOPED_REAL_USAGE_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT_MCP",
      allowedClaim:
        "Scoped same-repo same-task recorded usage supports repo-context-mcp over Graphify for this task only. Not a universal savings claim.",
    };
  }

  return {
    verdict: "DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM",
    allowedClaim:
      "Diagnostic head-to-head completed, but no scoped real-usage superiority claim is allowed without same-repo same-task measured repeats and equal/better quality.",
  };
}

export function runGraphifyHeadToHead(options: GraphifyHeadToHeadOptions): GraphifyHeadToHeadReport {
  const profile = getCodexQaTask(options.taskName);
  if (!profile) {
    throw new Error(`Unknown task: ${options.taskName}. Use one of: auth-discovery, impact-analysis, edit-planning, architecture-discovery, onboarding-map`);
  }

  const repoRoot = resolveRoot(options.repoPath ?? process.cwd());
  const { fullRawRepoTokens } = scanFullRepoTokens(repoRoot);
  const relevantRawFileTokens = scanRelevantFileTokens(repoRoot, profile.expectedFilePatterns);

  const repoContext = runRepoContextArm(options.taskName, repoRoot, fullRawRepoTokens, relevantRawFileTokens);
  const graphify = runGraphifyArm(options, repoRoot, fullRawRepoTokens, relevantRawFileTokens);
  const realUsage = evaluateRealUsageComparison(options);
  const diagnosticWinner = pickDiagnosticWinner(graphify, repoContext);
  const { verdict, allowedClaim } = determineVerdict(graphify, realUsage);

  return {
    generatedAt: new Date().toISOString(),
    taskName: options.taskName,
    repoRoot,
    warning: DIAGNOSTIC_WARNING,
    fullRawRepoTokens,
    relevantRawFileTokens,
    graphify,
    repoContext,
    diagnosticWinner,
    realUsage,
    verdict,
    allowedClaim,
  };
}

function formatRatio(value: number | null): string {
  if (value === null) return "n/a";
  return `${value.toLocaleString()}×`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "n/a";
  return `${value.toLocaleString()}%`;
}

export function renderGraphifyHeadToHeadMarkdown(report: GraphifyHeadToHeadReport): string {
  const lines: string[] = [
    "# Graphify head-to-head report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `> **${report.warning}**`,
    "",
    "## Verdict",
    "",
    `**${report.verdict}**`,
    "",
    report.allowedClaim,
    "",
    "## Task",
    "",
    `- Task: \`${report.taskName}\``,
    `- Repo: \`${report.repoRoot}\``,
    `- Full raw repo tokens: ${report.fullRawRepoTokens.toLocaleString()}`,
    `- Relevant raw file tokens: ${report.relevantRawFileTokens.toLocaleString()}`,
    `- Diagnostic winner: ${report.diagnosticWinner}`,
    "",
    "## repo-context-mcp (broker_locked diagnostic arm)",
    "",
    `- Status: ${report.repoContext.status}`,
    `- context_pack tokens: ${report.repoContext.contextPackTokens.toLocaleString()}`,
    `- Full-repo compression ratio: ${formatRatio(report.repoContext.fullRepoCompressionRatio)}`,
    `- Relevant-files compression ratio: ${formatRatio(report.repoContext.relevantFilesCompressionRatio)}`,
    `- Quality score: ${report.repoContext.qualityScore ?? "n/a"}`,
    `- Matched files: ${report.repoContext.matchedFiles.join(", ") || "none"}`,
    `- Missing files: ${report.repoContext.missingFiles.length ? report.repoContext.missingFiles.join(", ") : "none"}`,
    `- Matched concepts: ${report.repoContext.matchedConcepts.join(", ") || "none"}`,
    `- Missing concepts: ${report.repoContext.missingConcepts.length ? report.repoContext.missingConcepts.join(", ") : "none"}`,
  ];
  if (report.repoContext.note) {
    lines.push(`- Note: ${report.repoContext.note}`);
  }
  lines.push(
    "",
    "## Graphify arm",
    "",
    `- Status: ${report.graphify.armStatus}`,
    `- Output tokens: ${report.graphify.outputTokens?.toLocaleString() ?? "n/a"}`,
    `- Full-repo compression ratio: ${formatRatio(report.graphify.fullRepoCompressionRatio)}`,
    `- Relevant-files compression ratio: ${formatRatio(report.graphify.relevantFilesCompressionRatio)}`,
    `- Quality score: ${report.graphify.qualityScore ?? "n/a"}`,
    `- Matched files: ${report.graphify.matchedFiles.join(", ") || "none"}`,
    `- Missing files: ${report.graphify.missingFiles.length ? report.graphify.missingFiles.join(", ") : "none"}`,
    `- Matched concepts: ${report.graphify.matchedConcepts.join(", ") || "none"}`,
    `- Missing concepts: ${report.graphify.missingConcepts.length ? report.graphify.missingConcepts.join(", ") : "none"}`,
  );

  if (report.graphify.command) {
    lines.push(`- Command/binary: \`${report.graphify.command}\``);
  }
  if (report.graphify.error) {
    lines.push(`- Error: ${report.graphify.error}`);
  }
  if (report.graphify.helpExcerpt) {
    lines.push("");
    lines.push("### graphify --help (excerpt)");
    lines.push("");
    lines.push("```text");
    lines.push(report.graphify.helpExcerpt);
    lines.push("```");
  }
  if (report.graphify.note) {
    lines.push(`- Note: ${report.graphify.note}`);
  }

  lines.push("");
  lines.push("## Recorded real usage");
  lines.push("");
  if (!report.realUsage) {
    lines.push("No recorded real-usage totals were supplied.");
  } else {
    lines.push(`- Graphify combined totals: ${report.realUsage.graphifyCombinedTotals.join(", ") || "n/a"}`);
    lines.push(`- repo-context combined totals: ${report.realUsage.repoContextCombinedTotals.join(", ") || "n/a"}`);
    lines.push(`- Graphify mean / median combined tokens: ${report.realUsage.graphifyMeanCombinedTokens ?? "n/a"} / ${report.realUsage.graphifyMedianCombinedTokens ?? "n/a"}`);
    lines.push(
      `- repo-context mean / median combined tokens: ${report.realUsage.repoContextMeanCombinedTokens ?? "n/a"} / ${report.realUsage.repoContextMedianCombinedTokens ?? "n/a"}`,
    );
    lines.push(`- repo-context mean reduction vs Graphify: ${formatPercent(report.realUsage.repoContextMeanReductionVsGraphify)}`);
    lines.push(`- repo-context median reduction vs Graphify: ${formatPercent(report.realUsage.repoContextMedianReductionVsGraphify)}`);
    lines.push(`- Graphify minimum quality: ${report.realUsage.graphifyMinQuality ?? "n/a"}`);
    lines.push(`- repo-context minimum quality: ${report.realUsage.repoContextMinQuality ?? "n/a"}`);
    lines.push(`- Scoped real-usage claim allowed: ${report.realUsage.supportsScopedClaim ? "yes" : "no"}`);
    lines.push(`- Reason: ${report.realUsage.scopedClaimReason}`);
  }

  lines.push("");
  lines.push("## Non-claims");
  lines.push("");
  lines.push("- Diagnostic compression is not proof of real client savings.");
  lines.push("- No Graphify superiority claim without same-repo same-task real measured usage.");
  lines.push("- Equal or better quality is required before any scoped comparative claim.");
  lines.push("- No universal savings claim is allowed.");
  lines.push("- Codex PROVEN_SAVINGS_STABLE does not imply Graphify superiority.");
  lines.push("");
  lines.push("## Protocol");
  lines.push("");
  lines.push(`See [${PROTOCOL_PATH}](${PROTOCOL_PATH}).`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function writeGraphifyHeadToHeadReport(
  report: GraphifyHeadToHeadReport,
  outDir = COMPRESSION_OUTPUT_DIR,
): { markdownPath: string; jsonPath: string } {
  const dir = path.resolve(outDir);
  fs.mkdirSync(dir, { recursive: true });
  const markdownPath = path.join(dir, "graphify-head-to-head-report.md");
  const jsonPath = path.join(dir, "graphify-head-to-head-report.json");
  fs.writeFileSync(markdownPath, renderGraphifyHeadToHeadMarkdown(report), "utf8");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function main(): void {
  const args = parseCliArgs();
  const taskName = readStringArg(args, "task");
  if (!taskName) {
    console.error("Missing required --task <name> (e.g. auth-discovery)");
    process.exit(1);
  }

  const report = runGraphifyHeadToHead({
    taskName,
    repoPath: readStringArg(args, "repo"),
    graphifyBin: readStringArg(args, "graphify-bin"),
    graphifyBuildCommand: readStringArg(args, "graphify-build-command"),
    graphifyQueryCommand: readStringArg(args, "graphify-query-command"),
    graphifyOutputFile: readStringArg(args, "graphify-output-file"),
    graphifyCombinedTotals: readStringArg(args, "graphify-combined-totals"),
    repoContextCombinedTotals: readStringArg(args, "repo-context-combined-totals"),
    graphifyQualityScores: readStringArg(args, "graphify-quality-scores"),
    repoContextQualityScores: readStringArg(args, "repo-context-quality-scores"),
  });

  const { markdownPath, jsonPath } = writeGraphifyHeadToHeadReport(report);
  console.log(`Graphify head-to-head report: ${markdownPath}`);
  console.log(`Graphify head-to-head JSON: ${jsonPath}`);
  console.log(`verdict=${report.verdict}`);
  console.log(`graphify_status=${report.graphify.armStatus}`);
  console.log(`repo_context_tokens=${report.repoContext.contextPackTokens}`);
}

const invokedDirectly = process.argv[1]?.endsWith("graphifyHeadToHead.js");
if (invokedDirectly) {
  main();
}
