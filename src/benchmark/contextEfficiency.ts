import fs from "node:fs";
import path from "node:path";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import {
  BEST_EFFORT_DIR,
  GRAPHIFY_BEST_EFFORT_CONTEXT,
  REPO_CONTEXT_BEST_EFFORT_CONTEXT,
} from "./bestEffortSkillHeadToHead.js";
import {
  buildContextEfficiencyMetrics,
  compareContextEfficiency,
  type ContextEfficiencyComparison,
} from "./contextEfficiencyMetrics.js";
import { estimateTokensFromText } from "../cli/skillPack.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { COMPRESSION_TASKS } from "./compressionTasks.js";
import { buildSkillPack } from "../cli/skillPack.js";
import { formatSkillMarkdown } from "../cli/formatSkillMarkdown.js";
import { graphifyBestEffortContextPath } from "./graphifyBestEffort.js";
import { SKILL_SUITE_DIR } from "./skillSuiteHeadToHead.js";
export const CONTEXT_EFFICIENCY_DIR = ".mcp-benchmarks/context-efficiency";

export function buildContextEfficiencyReport(input: {
  taskName: string;
  graphifyContext: string;
  repoContextContext: string;
  graphifyCodexQualityScores?: number[];
  repoContextCodexQualityScores?: number[];
}): ContextEfficiencyComparison & {
  taskName: string;
  generatedAt: string;
  graphifyCodexQualityMedian: number | null;
  repoContextCodexQualityMedian: number | null;
} {
  const profile = getCodexQaTask(input.taskName);
  if (!profile) throw new Error(`Unknown task: ${input.taskName}`);

  const graphifyScore = scoreCodexQaText(profile, input.graphifyContext);
  const repoScore = scoreCodexQaText(profile, input.repoContextContext);
  const graphifyTokens = estimateTokensFromText(input.graphifyContext);
  const repoTokens = estimateTokensFromText(input.repoContextContext);

  const graphify = buildContextEfficiencyMetrics({
    arm: "graphify",
    contextTokens: graphifyTokens,
    score: graphifyScore,
    expectedFileCount: profile.expectedFilePatterns.length,
    expectedConceptCount: profile.expectedConcepts.length,
  });
  const repoContext = buildContextEfficiencyMetrics({
    arm: "repo-context",
    contextTokens: repoTokens,
    score: repoScore,
    expectedFileCount: profile.expectedFilePatterns.length,
    expectedConceptCount: profile.expectedConcepts.length,
  });
  const comparison = compareContextEfficiency(graphify, repoContext);

  const median = (values: number[] | undefined): number | null => {
    if (!values?.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? null;
  };

  return {
    taskName: input.taskName,
    generatedAt: new Date().toISOString(),
    ...comparison,
    graphifyCodexQualityMedian: median(input.graphifyCodexQualityScores),
    repoContextCodexQualityMedian: median(input.repoContextCodexQualityScores),
  };
}

export function writeContextEfficiencyReport(
  report: ReturnType<typeof buildContextEfficiencyReport>,
  outDir = CONTEXT_EFFICIENCY_DIR,
): { jsonPath: string; mdPath: string } {
  const jsonPath = path.join(outDir, "summary.json");
  const mdPath = path.join(outDir, "summary.md");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const lines = [
    "# Context efficiency (auth-discovery best-effort)",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Context size",
    `- Graphify: ${report.graphify.contextTokens} tokens`,
    `- repo-context: ${report.repoContext.contextTokens} tokens`,
    `- Context reduction: ${report.contextTokenReductionPct ?? "n/a"}%`,
    "",
    "## Coverage",
    `- Graphify files: ${report.graphify.matchedFiles}/${report.graphify.expectedFiles} (completeness ${report.graphify.contextCompletenessRatio})`,
    `- repo-context files: ${report.repoContext.matchedFiles}/${report.repoContext.expectedFiles} (completeness ${report.repoContext.contextCompletenessRatio})`,
    `- File coverage multiplier: ${report.fileCoverageMultiplier ?? "n/a"}×`,
    "",
    "## Quality (local context scoring)",
    `- Graphify quality: ${report.graphify.qualityScore}/10`,
    `- repo-context quality: ${report.repoContext.qualityScore}/10`,
    "",
    "## Efficiency per 1,000 context tokens",
    `- Graphify files/1k: ${report.graphify.filesPer1000ContextTokens}`,
    `- repo-context files/1k: ${report.repoContext.filesPer1000ContextTokens}`,
    `- Graphify quality/1k: ${report.graphify.qualityPer1000ContextTokens}`,
    `- repo-context quality/1k: ${report.repoContext.qualityPer1000ContextTokens}`,
    `- Quality-per-token multiplier: ${report.qualityPerTokenMultiplier ?? "n/a"}×`,
    "",
    "## Task complete (local rubric)",
    `- Graphify: ${report.graphify.taskComplete}`,
    `- repo-context: ${report.repoContext.taskComplete}`,
    "",
    "## Codex answer quality (if best-effort repeats available)",
    `- Graphify median quality: ${report.graphifyCodexQualityMedian ?? "n/a"}`,
    `- repo-context median quality: ${report.repoContextCodexQualityMedian ?? "n/a"}`,
    "",
    "## Interpretation",
    "- repo-context context is much smaller while listing more expected files.",
    "- Real Codex token savings are smaller because Codex has large fixed supplied-context overhead (see token-floor benchmark).",
  ];
  fs.writeFileSync(mdPath, `${lines.join("\n")}\n`, "utf8");
  return { jsonPath, mdPath };
}

export interface SuiteContextEfficiencySummary {
  generatedAt: string;
  tasks: Array<
    ReturnType<typeof buildContextEfficiencyReport> & {
      graphifyCodexMedian: number | null;
      repoContextCodexMedian: number | null;
      codexTokenReductionPct: number | null;
    }
  >;
  suite: {
    tasksMeasured: number;
    contextEfficiencyWins: number;
    qualityWins: number;
    codexTokenWins: number;
    taskCompleteWins: number;
    medianContextReductionPct: number | null;
    medianQualityPerTokenMultiplier: number | null;
  };
}

export function buildSuiteContextEfficiencyReport(repoPath: string): SuiteContextEfficiencySummary {
  const skillSuitePath = path.join(repoPath, SKILL_SUITE_DIR, "summary.json");
  const skillSuite = fs.existsSync(skillSuitePath)
    ? (JSON.parse(fs.readFileSync(skillSuitePath, "utf8")) as {
        tasks?: Array<{
          taskName: string;
          graphifyContextTokens: number;
          repoContextContextTokens: number;
          graphifyMedianCodex: number | null;
          repoContextMedianCodex: number | null;
          graphifyMinQuality: number | null;
          repoContextMinQuality: number | null;
          qualityWin: boolean;
          codexTokenWin: boolean;
          contextEfficiencyWin: boolean;
          taskComplete: { graphify: boolean; repoContext: boolean };
        }>;
      })
    : null;

  const tasks = COMPRESSION_TASKS.map((task) => {
    const graphifyPath = graphifyBestEffortContextPath(repoPath, task.taskName);
    const legacyAuth =
      task.taskName === "auth-discovery" && fs.existsSync(path.join(repoPath, GRAPHIFY_BEST_EFFORT_CONTEXT))
        ? path.join(repoPath, GRAPHIFY_BEST_EFFORT_CONTEXT)
        : null;
    const graphifyContext = fs.existsSync(graphifyPath)
      ? fs.readFileSync(graphifyPath, "utf8")
      : legacyAuth
        ? fs.readFileSync(legacyAuth, "utf8")
        : "";
    const pack = buildSkillPack({ task: task.prompt, root: repoPath, mode: task.mode, budgetTokens: 500 });
    const repoContextContext = formatSkillMarkdown(pack, "ultra");
    const suiteTask = skillSuite?.tasks?.find((t) => t.taskName === task.taskName);
    const report = buildContextEfficiencyReport({
      taskName: task.taskName,
      graphifyContext,
      repoContextContext,
      graphifyCodexQualityScores: suiteTask?.graphifyMinQuality ? [suiteTask.graphifyMinQuality] : undefined,
      repoContextCodexQualityScores: suiteTask?.repoContextMinQuality ? [suiteTask.repoContextMinQuality] : undefined,
    });
    const codexTokenReductionPct =
      suiteTask?.graphifyMedianCodex && suiteTask.repoContextMedianCodex && suiteTask.graphifyMedianCodex > 0
        ? Math.round((1 - suiteTask.repoContextMedianCodex / suiteTask.graphifyMedianCodex) * 1000) / 10
        : null;
    return {
      ...report,
      graphifyCodexMedian: suiteTask?.graphifyMedianCodex ?? null,
      repoContextCodexMedian: suiteTask?.repoContextMedianCodex ?? null,
      codexTokenReductionPct,
    };
  });

  const reductions = tasks.map((t) => t.contextTokenReductionPct).filter((v): v is number => v !== null);
  const multipliers = tasks.map((t) => t.qualityPerTokenMultiplier).filter((v): v is number => v !== null);
  const median = (values: number[]): number | null => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? null;
  };

  return {
    generatedAt: new Date().toISOString(),
    tasks,
    suite: {
      tasksMeasured: tasks.length,
      contextEfficiencyWins: tasks.filter((t) => t.repoContext.contextTokens <= t.graphify.contextTokens && t.repoContext.qualityScore >= t.graphify.qualityScore).length,
      qualityWins: tasks.filter((t) => t.repoContext.qualityScore >= t.graphify.qualityScore).length,
      codexTokenWins: tasks.filter((t) => t.codexTokenReductionPct !== null && t.codexTokenReductionPct > 0).length,
      taskCompleteWins: tasks.filter((t) => t.repoContext.taskComplete).length,
      medianContextReductionPct: median(reductions),
      medianQualityPerTokenMultiplier: median(multipliers),
    },
  };
}

export function writeSuiteContextEfficiencyReport(
  report: SuiteContextEfficiencySummary,
  outDir = CONTEXT_EFFICIENCY_DIR,
): { jsonPath: string; mdPath: string } {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "summary.json");
  const mdPath = path.join(outDir, "summary.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const lines = [
    "# Context efficiency (5-task skill suite)",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Suite",
    `- Tasks measured: ${report.suite.tasksMeasured}`,
    `- Context-efficiency wins: ${report.suite.contextEfficiencyWins}/5`,
    `- Quality wins: ${report.suite.qualityWins}/5`,
    `- Codex token wins: ${report.suite.codexTokenWins}/5`,
    `- Task-complete (repo-context local): ${report.suite.taskCompleteWins}/5`,
    `- Median context reduction: ${report.suite.medianContextReductionPct ?? "n/a"}%`,
    `- Median quality-per-token multiplier: ${report.suite.medianQualityPerTokenMultiplier ?? "n/a"}×`,
    "",
    "## Per task",
    ...report.tasks.map(
      (t) =>
        `### ${t.taskName}\n- Context: graphify ${t.graphify.contextTokens} vs repo ${t.repoContext.contextTokens} (${t.contextTokenReductionPct ?? "n/a"}% smaller)\n- Quality: ${t.graphify.qualityScore} vs ${t.repoContext.qualityScore}\n- Task complete: graphify ${t.graphify.taskComplete} / repo ${t.repoContext.taskComplete}\n- Codex median: ${t.graphifyCodexMedian ?? "n/a"} vs ${t.repoContextCodexMedian ?? "n/a"}\n- files/1k: ${t.graphify.filesPer1000ContextTokens} vs ${t.repoContext.filesPer1000ContextTokens}\n- quality/1k: ${t.graphify.qualityPer1000ContextTokens} vs ${t.repoContext.qualityPer1000ContextTokens}`,
    ),
  ];
  fs.writeFileSync(mdPath, `${lines.join("\n")}\n`, "utf8");
  return { jsonPath, mdPath };
}

function main(): void {
  const repoPath = process.cwd();
  const report = buildSuiteContextEfficiencyReport(repoPath);
  const paths = writeSuiteContextEfficiencyReport(report);
  console.log(`context_efficiency median_reduction=${report.suite.medianContextReductionPct}%`);
  console.log(`wrote ${paths.jsonPath}`);
}

if (process.argv[1]?.includes("contextEfficiency")) {
  main();
}
