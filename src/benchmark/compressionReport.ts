import fs from "node:fs";
import path from "node:path";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { buildContextPack } from "../context/broker.js";
import { formatToolResult, getOutputCharCount } from "../output.js";
import { resolveRoot } from "../pathSafety.js";
import { COMPRESSION_BUDGET_TOKENS, COMPRESSION_TASKS } from "./compressionTasks.js";
import { scanFullRepoTokens, scanRelevantFileTokens } from "./scanRepoTokens.js";

export const COMPRESSION_OUTPUT_DIR = ".mcp-benchmarks";
export const COMPRESSION_REPORT_MD = path.join(COMPRESSION_OUTPUT_DIR, "compression-report.md");
export const COMPRESSION_REPORT_JSON = path.join(COMPRESSION_OUTPUT_DIR, "compression-report.json");

export const DIAGNOSTIC_WARNING =
  "Diagnostic compression is not proof of real agent savings. Compare against real A/B client usage with ab:real-check.";

export interface CompressionTaskResult {
  taskName: string;
  mode: string;
  budgetTokens: number;
  contextPackTokens: number;
  fullRepoCompressionRatio: number | null;
  relevantFilesCompressionRatio: number | null;
  relevantRawFileTokens: number;
  matchedFiles: string[];
  missingFiles: string[];
  matchedConcepts: string[];
  missingConcepts: string[];
  expectedFilesFound: boolean;
  expectedConceptsFound: boolean;
  outputBudgetPass: boolean;
  taskComplete: boolean;
  truncated: boolean;
  qualityScore: number;
  note: string;
}

export interface CompressionReport {
  generatedAt: string;
  repoRoot: string;
  metricType: "diagnostic_compression";
  warning: string;
  fullRawRepoTokens: number;
  includedFileCount: number;
  budgetTokens: number;
  graphifyPublicReference: {
    claim: string;
    metric: string;
    note: string;
  };
  tasks: CompressionTaskResult[];
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

export function runCompressionBenchmark(root: string): CompressionReport {
  const repoRoot = resolveRoot(root);
  const { fullRawRepoTokens, fileCount } = scanFullRepoTokens(repoRoot);

  const tasks: CompressionTaskResult[] = COMPRESSION_TASKS.map((task) => {
    const pack = buildContextPack({
      task: task.prompt,
      root: repoRoot,
      mode: task.mode,
      budgetTokens: COMPRESSION_BUDGET_TOKENS,
    });
    const formatted = formatToolResult(pack);
    const contextPackTokens =
      pack.estimatedOutputTokens ?? Math.ceil(getOutputCharCount(formatted) / 4);
    const serialized = JSON.stringify(pack);
    const profile = getCodexQaTask(task.taskName);
    const score = profile ? scoreCodexQaText(profile, serialized) : null;

    const relevantRawFileTokens = scanRelevantFileTokens(repoRoot, task.expectedFilePatterns);
    const outputBudgetPass = contextPackTokens <= COMPRESSION_BUDGET_TOKENS;
    const expectedFilesFound = score?.expectedFilesFound ?? false;
    const expectedConceptsFound = score?.expectedConceptsFound ?? false;
    const taskComplete = expectedFilesFound && expectedConceptsFound && outputBudgetPass;

    return {
      taskName: task.taskName,
      mode: task.mode,
      budgetTokens: COMPRESSION_BUDGET_TOKENS,
      contextPackTokens,
      fullRepoCompressionRatio: ratio(fullRawRepoTokens, contextPackTokens),
      relevantFilesCompressionRatio: ratio(relevantRawFileTokens, contextPackTokens),
      relevantRawFileTokens,
      matchedFiles: score?.matchedFiles ?? [],
      missingFiles: score?.missingFiles ?? task.expectedFilePatterns,
      matchedConcepts: score?.matchedConcepts ?? [],
      missingConcepts: score?.missingConcepts ?? task.expectedConcepts,
      expectedFilesFound,
      expectedConceptsFound,
      outputBudgetPass,
      taskComplete,
      truncated: pack.truncated,
      qualityScore: score?.qualityScore ?? 0,
      note: score?.note ?? "No scoring profile.",
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    repoRoot,
    metricType: "diagnostic_compression",
    warning: DIAGNOSTIC_WARNING,
    fullRawRepoTokens,
    includedFileCount: fileCount,
    budgetTokens: COMPRESSION_BUDGET_TOKENS,
    graphifyPublicReference: {
      claim: "71.5× token reduction on the Karpathy mixed corpus",
      metric: "raw corpus tokens / graph query tokens",
      note: "Graphify-style diagnostic compression is not the same as full end-to-end agent billing reduction.",
    },
    tasks,
  };
}

export function renderCompressionMarkdown(report: CompressionReport): string {
  const taskRows = report.tasks
    .map((task) => {
      return `| ${task.taskName} | ${task.contextPackTokens.toLocaleString()} | ${formatRatio(task.fullRepoCompressionRatio)} | ${formatRatio(task.relevantFilesCompressionRatio)} | ${task.matchedFiles.length}/${task.matchedFiles.length + task.missingFiles.length} files | ${task.matchedConcepts.length} concepts | ${task.outputBudgetPass ? "pass" : "fail"} | ${task.taskComplete ? "yes" : "no"} |`;
    })
    .join("\n");

  const taskDetails = report.tasks
    .map((task) => {
      return `### ${task.taskName}

- Mode: \`${task.mode}\`
- Context pack tokens: ${task.contextPackTokens.toLocaleString()}
- Relevant raw file tokens: ${task.relevantRawFileTokens.toLocaleString()}
- Full-repo compression ratio: ${formatRatio(task.fullRepoCompressionRatio)}
- Relevant-files compression ratio: ${formatRatio(task.relevantFilesCompressionRatio)}
- Expected files matched: ${task.matchedFiles.length} (${task.matchedFiles.join(", ") || "none"})
- Missing files: ${task.missingFiles.length ? task.missingFiles.join(", ") : "none"}
- Concepts matched: ${task.matchedConcepts.join(", ") || "none"}
- Output budget (${task.budgetTokens}): ${task.outputBudgetPass ? "pass" : "fail"}
- Task complete: ${task.taskComplete ? "yes" : "no"}
- Truncated: ${task.truncated ? "yes" : "no"}
- ${task.note}`;
    })
    .join("\n\n");

  return `# Diagnostic compression benchmark

Generated: ${report.generatedAt}

> **${report.warning}**

## Summary

| Metric | Value |
| --- | ---: |
| Full raw repo token estimate | ${report.fullRawRepoTokens.toLocaleString()} |
| Included files scanned | ${report.includedFileCount.toLocaleString()} |
| Context pack budget (tokens) | ${report.budgetTokens.toLocaleString()} |
| Token estimate method | UTF-8 bytes ÷ 4 |

## Graphify-style reference (not a head-to-head result)

Graphify public claim: **${report.graphifyPublicReference.claim}**

- Metric type: ${report.graphifyPublicReference.metric}
- ${report.graphifyPublicReference.note}
- repo-context-mcp has **not** beaten Graphify in a same-repo head-to-head yet.

## Per-task compression

| Task | context_pack tokens | full-repo ratio | relevant-files ratio | file coverage | concepts | budget | complete |
| --- | ---: | ---: | ---: | --- | ---: | --- | --- |
${taskRows}

## Task details

${taskDetails}

## Metric definitions

**Diagnostic compression ratio** = raw token estimate ÷ \`context_pack\` token estimate.

This is comparable in *shape* to Graphify-style corpus/query compression metrics. It is **not** proof of real client billing reduction.

**Real A/B savings** require parsed client usage from no-MCP vs locked broker runs and must pass \`ab:real-check\`.

## Current repo-context-mcp proof status

- Real Codex auth-discovery locked proof: \`PROVEN_SAVINGS_STABLE\` (80.0% mean / 77.2% median combined tokens)
- Diagnostic compression ratios above are **separate** from that A/B proof
- No claim of superiority over Graphify without a controlled head-to-head
`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "n/a";
  return `${value.toLocaleString()}×`;
}

export function writeCompressionReport(report: CompressionReport, outDir = COMPRESSION_OUTPUT_DIR): {
  markdownPath: string;
  jsonPath: string;
} {
  const dir = path.resolve(outDir);
  fs.mkdirSync(dir, { recursive: true });
  const markdownPath = path.join(dir, "compression-report.md");
  const jsonPath = path.join(dir, "compression-report.json");
  fs.writeFileSync(markdownPath, renderCompressionMarkdown(report), "utf8");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}
