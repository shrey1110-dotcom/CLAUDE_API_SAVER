import fs from "node:fs";
import path from "node:path";
import { parseCliArgs, readStringArg } from "../ab/cli.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { buildSkillPack, estimateTokensFromText } from "../cli/skillPack.js";
import { formatSkillMarkdown, type SkillMarkdownProfile } from "../cli/formatSkillMarkdown.js";
import type { ContextMode } from "../context/types.js";
import { COMPRESSION_TASKS } from "./compressionTasks.js";

export const PACK_OPTIMIZATION_ROOT = ".mcp-benchmarks/pack-optimization";

export interface PackVariantResult {
  profile: SkillMarkdownProfile;
  contextTokens: number;
  fileCount: number;
  conceptCount: number;
  qualityScore: number;
  fileCoveragePass: boolean;
  conceptCoveragePass: boolean;
  qualityPass: boolean;
  passes: boolean;
}

export interface PackOptimizationTaskSummary {
  taskName: string;
  generatedAt: string;
  prompt: string;
  mode: string;
  variants: PackVariantResult[];
  standard: PackVariantResult | null;
  ultra: PackVariantResult | null;
  smallestPassing: PackVariantResult | null;
  targetTokens: number;
  authDiscoveryTargetTokens: number | null;
}

const PROFILES: SkillMarkdownProfile[] = ["standard", "ultra", "minimal"];

function evaluateVariant(
  profile: SkillMarkdownProfile,
  taskName: string,
  prompt: string,
  mode: string,
  repoPath: string,
): PackVariantResult {
  const qa = getCodexQaTask(taskName);
  if (!qa) throw new Error(`Unknown task ${taskName}`);
  const pack = buildSkillPack({ task: prompt, root: repoPath, mode: mode as ContextMode, budgetTokens: 500 });
  const markdown = formatSkillMarkdown(pack, profile);
  const score = scoreCodexQaText(qa, markdown);
  const fileCoveragePass = score.matchedFiles.length >= qa.minExpectedFileMatches;
  const conceptCoveragePass = score.matchedConcepts.length >= qa.minExpectedConceptMatches;
  const qualityPass = score.qualityScore >= qa.passThreshold;
  return {
    profile,
    contextTokens: estimateTokensFromText(markdown),
    fileCount: score.matchedFiles.length,
    conceptCount: score.matchedConcepts.length,
    qualityScore: score.qualityScore,
    fileCoveragePass,
    conceptCoveragePass,
    qualityPass,
    passes: fileCoveragePass && conceptCoveragePass && qualityPass,
  };
}

export function optimizePacksForTask(repoPath: string, taskName: string): PackOptimizationTaskSummary {
  const compression = COMPRESSION_TASKS.find((t) => t.taskName === taskName);
  if (!compression) throw new Error(`Unknown compression task: ${taskName}`);

  const variants = PROFILES.map((profile) =>
    evaluateVariant(profile, taskName, compression.prompt, compression.mode, repoPath),
  );
  const passing = variants.filter((v) => v.passes).sort((a, b) => a.contextTokens - b.contextTokens);
  const smallestPassing = passing[0] ?? null;

  const summary: PackOptimizationTaskSummary = {
    taskName,
    generatedAt: new Date().toISOString(),
    prompt: compression.prompt,
    mode: compression.mode,
    variants,
    standard: variants.find((v) => v.profile === "standard") ?? null,
    ultra: variants.find((v) => v.profile === "ultra") ?? null,
    smallestPassing,
    targetTokens: 250,
    authDiscoveryTargetTokens: taskName === "auth-discovery" ? 175 : null,
  };

  const taskDir = path.join(repoPath, PACK_OPTIMIZATION_ROOT, taskName);
  writePackOptimizationSummary(summary, taskDir);
  return summary;
}

export function writePackOptimizationSummary(summary: PackOptimizationTaskSummary, taskDir: string): void {
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const md = [
    `# Pack optimization (${summary.taskName})`,
    "",
    `Generated: ${summary.generatedAt}`,
    `Target: <= ${summary.targetTokens} tokens` +
      (summary.authDiscoveryTargetTokens ? ` (auth-discovery stretch <= ${summary.authDiscoveryTargetTokens})` : ""),
    "",
    "## Variants",
    ...summary.variants.map(
      (v) =>
        `- **${v.profile}**: ${v.contextTokens} tokens, quality=${v.qualityScore}, files=${v.fileCount}, concepts=${v.conceptCount}, pass=${v.passes}`,
    ),
    "",
    "## Smallest passing",
    summary.smallestPassing
      ? `${summary.smallestPassing.profile} at ${summary.smallestPassing.contextTokens} tokens (quality ${summary.smallestPassing.qualityScore})`
      : "none",
  ];
  fs.writeFileSync(path.join(taskDir, "summary.md"), `${md.join("\n")}\n`, "utf8");
}

function main(): void {
  const repoPath = path.resolve(readStringArg(parseCliArgs(), "repo") ?? process.cwd());
  const taskFilter = readStringArg(parseCliArgs(), "tasks")?.split(",").map((t) => t.trim()).filter(Boolean);
  const tasks = taskFilter ?? COMPRESSION_TASKS.map((t) => t.taskName);
  for (const taskName of tasks) {
    const summary = optimizePacksForTask(repoPath, taskName);
    console.log(
      `[pack-opt] ${taskName} ultra=${summary.ultra?.contextTokens} smallest=${summary.smallestPassing?.profile ?? "none"}@${summary.smallestPassing?.contextTokens ?? "n/a"}`,
    );
  }
}

if (process.argv[1]?.includes("packOptimization")) {
  main();
}
