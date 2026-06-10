import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readBooleanArg, readNumberArg, readStringArg } from "../ab/cli.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import type { SkillMarkdownProfile } from "../cli/formatSkillMarkdown.js";
import { buildSkillPack, estimateTokensFromText } from "../cli/skillPack.js";
import { formatSkillMarkdown } from "../cli/formatSkillMarkdown.js";
import {
  AUTH_DISCOVERY_TASK,
  runSkillHeadToHead,
  SKILL_HEAD_TO_HEAD_DIR,
  type SkillHeadToHeadSummary,
} from "../benchmark/skillHeadToHead.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ITERATIONS_DIR = path.join(SKILL_HEAD_TO_HEAD_DIR, "iterations");
const MAX_ITERATIONS = 3;

interface IterationPlan {
  iteration: number;
  change: string;
  markdownProfile: SkillMarkdownProfile;
  compactPrompt: boolean;
  nextHypothesis: string;
}

const ITERATION_PLANS: IterationPlan[] = [
  {
    iteration: 1,
    change: "Baseline skill pack (broker_proof_min logic) + standard markdown + standard Codex prompt",
    markdownProfile: "standard",
    compactPrompt: false,
    nextHypothesis: "Ultra-compact markdown may reduce client input tokens without hurting quality.",
  },
  {
    iteration: 2,
    change: "Ultra-compact markdown profile (no verbose headers/metadata)",
    markdownProfile: "ultra",
    compactPrompt: false,
    nextHypothesis: "Compact Codex answer prompt may reduce output tokens while preserving quality.",
  },
  {
    iteration: 3,
    change: "Ultra-compact markdown + compact Codex prompt (<=12 lines instruction)",
    markdownProfile: "ultra",
    compactPrompt: true,
    nextHypothesis: "Further token wins likely require unfair benchmark changes or hardcoded answers.",
  },
];

function runValidation(): Array<{ command: string; ok: boolean }> {
  const commands = [
    ["npm", ["run", "build"]],
    ["npm", ["run", "test:benchmark"]],
  ] as const;
  return commands.map(([cmd, args]) => {
    const result = spawnSync(cmd, [...args], { cwd: ROOT, encoding: "utf8" });
    return { command: `${cmd} ${args.join(" ")}`, ok: result.status === 0 };
  });
}

function localPackDiagnostics(
  markdownProfile: SkillMarkdownProfile,
): {
  packTokens: number;
  files: number;
  concepts: number;
  quality: number;
} {
  const profile = getCodexQaTask("auth-discovery");
  if (!profile) throw new Error("auth-discovery profile missing");
  const pack = buildSkillPack({ task: AUTH_DISCOVERY_TASK, root: ROOT, budgetTokens: 500 });
  const markdown = formatSkillMarkdown(pack, markdownProfile);
  const score = scoreCodexQaText(profile, markdown);
  return {
    packTokens: estimateTokensFromText(markdown),
    files: score.matchedFiles.length,
    concepts: score.matchedConcepts.length,
    quality: score.qualityScore,
  };
}

function writeIterationSummary(
  plan: IterationPlan,
  local: ReturnType<typeof localPackDiagnostics>,
  summary: SkillHeadToHeadSummary,
): { mdPath: string; jsonPath: string } {
  const dir = path.join(ITERATIONS_DIR, `iteration-${plan.iteration}`);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    iteration: plan.iteration,
    changeAttempted: plan.change,
    localPackTokens: local.packTokens,
    localFiles: local.files,
    localConcepts: local.concepts,
    localQuality: local.quality,
    repoContextOutputTokens: summary.repoContextOutputTokens,
    graphifyOutputTokens: summary.graphifyOutputTokens,
    repoContextClientTotals: summary.repoContextClientTotals,
    graphifyClientTotals: summary.graphifyClientTotals,
    repoContextQualityScores: summary.repoContextQualityScores,
    graphifyQualityScores: summary.graphifyQualityScores,
    repoContextMedian: summary.repoContextStats?.median ?? null,
    graphifyMedian: summary.graphifyStats?.median ?? null,
    repoContextMinQuality: summary.repoContextMinQuality,
    graphifyMinQuality: summary.graphifyMinQuality,
    verdict: summary.verdict,
    supportsScopedClaim: summary.supportsScopedClaim,
    failureReason: summary.supportsScopedClaim ? null : summary.scopedClaimReason,
    nextImprovementHypothesis: plan.nextHypothesis,
    generatedAt: new Date().toISOString(),
  };
  const jsonPath = path.join(dir, "summary.json");
  const mdPath = path.join(dir, "summary.md");
  const md = [
    `# Skill head-to-head iteration ${plan.iteration}`,
    "",
    `## Change`,
    plan.change,
    "",
    "## Local pack diagnostics",
    `- Pack tokens: ${local.packTokens}`,
    `- Files: ${local.files}/5`,
    `- Concepts: ${local.concepts}`,
    `- Quality: ${local.quality}/10`,
    "",
    "## Real Codex head-to-head",
    `- Graphify output tokens: ${summary.graphifyOutputTokens}`,
    `- repo-context output tokens: ${summary.repoContextOutputTokens}`,
    `- Graphify client totals: ${summary.graphifyClientTotals.join(", ") || "n/a"}`,
    `- repo-context client totals: ${summary.repoContextClientTotals.join(", ") || "n/a"}`,
    `- Graphify median: ${summary.graphifyStats?.median ?? "n/a"}`,
    `- repo-context median: ${summary.repoContextStats?.median ?? "n/a"}`,
    `- Graphify quality: ${summary.graphifyQualityScores.join(", ") || "n/a"}`,
    `- repo-context quality: ${summary.repoContextQualityScores.join(", ") || "n/a"}`,
    "",
    "## Verdict",
    `- Verdict: \`${summary.verdict}\``,
    `- Scoped claim: ${summary.supportsScopedClaim ? "yes" : "no"}`,
    summary.supportsScopedClaim ? "" : `- Failure reason: ${summary.scopedClaimReason}`,
    `- Next hypothesis: ${plan.nextHypothesis}`,
    "",
  ];
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${md.filter(Boolean).join("\n")}\n`, "utf8");
  return { mdPath, jsonPath };
}

export async function proveSkillHeadToHead(options: {
  codexBin?: string;
  maxIterations?: number;
  startIteration?: number;
}): Promise<{
  success: boolean;
  finalSummary: SkillHeadToHeadSummary | null;
  iterations: number;
  honestStopReason?: string;
}> {
  const maxIterations = options.maxIterations ?? MAX_ITERATIONS;
  const start = options.startIteration ?? 1;
  let finalSummary: SkillHeadToHeadSummary | null = null;

  for (const plan of ITERATION_PLANS.filter((p) => p.iteration >= start && p.iteration <= maxIterations)) {
    console.log(`[self:prove-skill] Iteration ${plan.iteration}: ${plan.change}`);
    const local = localPackDiagnostics(plan.markdownProfile);
    if (local.files < 5 || local.quality < 9 || local.packTokens > 700) {
      console.error(
        `[self:prove-skill] Local diagnostics failed before Codex run (files=${local.files}, quality=${local.quality}, tokens=${local.packTokens})`,
      );
      continue;
    }

    const validation = runValidation();
    if (!validation.every((v) => v.ok)) {
      throw new Error(`Validation failed before iteration ${plan.iteration}`);
    }

    const summary = await runSkillHeadToHead({
      repoPath: ROOT,
      codexBin: options.codexBin,
      markdownProfile: plan.markdownProfile,
      compactPrompt: plan.compactPrompt,
      runsRoot: path.join(ITERATIONS_DIR, `iteration-${plan.iteration}`, "runs"),
    });
    writeIterationSummary(plan, local, summary);
    finalSummary = summary;

    if (summary.supportsScopedClaim) {
      return { success: true, finalSummary: summary, iterations: plan.iteration };
    }
  }

  return {
    success: false,
    finalSummary,
    iterations: maxIterations,
    honestStopReason:
      "After 3 optimization iterations, repo-context skill mode did not achieve lower median Codex client tokens than Graphify query mode while maintaining equal or better quality under the defined no-MCP benchmark rules.",
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const result = await proveSkillHeadToHead({
    codexBin: readStringArg(args, "codex-bin"),
    maxIterations: readNumberArg(args, "max-iterations") ?? MAX_ITERATIONS,
    startIteration: readNumberArg(args, "start-iteration") ?? 1,
  });

  const stopPath = path.join(SKILL_HEAD_TO_HEAD_DIR, "self-prove-report.md");
  const lines = [
    "# Self-iteration skill head-to-head report",
    "",
    `Success: ${result.success ? "yes" : "no"}`,
    `Iterations run: ${result.iterations}`,
    result.finalSummary ? `Final verdict: \`${result.finalSummary.verdict}\`` : "Final verdict: n/a",
    result.finalSummary?.allowedClaim ? `Allowed claim: ${result.finalSummary.allowedClaim}` : "",
    result.honestStopReason ? `Honest stop reason: ${result.honestStopReason}` : "",
    "",
    "Failed iterations are preserved under `.mcp-benchmarks/skill-head-to-head/iterations/`.",
    "",
  ];
  fs.mkdirSync(path.dirname(stopPath), { recursive: true });
  fs.writeFileSync(stopPath, `${lines.filter(Boolean).join("\n")}\n`, "utf8");

  console.log(`success=${result.success}`);
  if (result.finalSummary) {
    console.log(`verdict=${result.finalSummary.verdict}`);
    console.log(`allowed_claim=${result.finalSummary.allowedClaim}`);
  }
  if (!result.success) {
    console.log(`honest_stop=${result.honestStopReason}`);
    process.exit(0);
  }
}

if (process.argv[1]?.includes("proveSkillHeadToHead")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
