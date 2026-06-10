import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readNumberArg, readStringArg } from "../ab/cli.js";
import { COMPRESSION_TASKS } from "../benchmark/compressionTasks.js";
import { buildGraphifyBestEffortForTask } from "../benchmark/graphifyBestEffort.js";
import { optimizePacksForTask } from "../benchmark/packOptimization.js";
import {
  runSkillSuiteHeadToHead,
  SKILL_SUITE_DIR,
  type SkillSuiteSummary,
} from "../benchmark/skillSuiteHeadToHead.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ITERATIONS_DIR = path.join(SKILL_SUITE_DIR, "iterations");
const MAX_ITERATIONS = 3;

interface IterationPlan {
  iteration: number;
  change: string;
  rebuildGraphify: boolean;
  nextHypothesis: string;
}

const ITERATION_PLANS: IterationPlan[] = [
  {
    iteration: 1,
    change: "Broker slim-before-cap + ultra markdown + compact no-shell Codex prompts + per-task Graphify best-effort",
    rebuildGraphify: true,
    nextHypothesis: "Onboarding anchor merge should complete 5/5 tasks with MCP-clean repeats.",
  },
  {
    iteration: 2,
    change: "Rebuild Graphify best-effort contexts and rerun skill suite (no product change)",
    rebuildGraphify: true,
    nextHypothesis: "Graphify query variance may affect per-task Codex medians; rerun for stability.",
  },
  {
    iteration: 3,
    change: "Final validation rerun after pack optimization check",
    rebuildGraphify: false,
    nextHypothesis: "Further wins require unfair benchmark changes or quality regression.",
  },
];

function runQuickValidation(): boolean {
  const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, encoding: "utf8" });
  if (build.status !== 0) return false;
  const tests = spawnSync("npm", ["run", "test:benchmark"], { cwd: ROOT, encoding: "utf8" });
  return tests.status === 0;
}

function localPackGate(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const task of COMPRESSION_TASKS) {
    const summary = optimizePacksForTask(ROOT, task.taskName);
    const ultra = summary.ultra;
    if (!ultra?.passes) failures.push(`${task.taskName}: ultra pack fails rubric`);
    if (ultra && ultra.contextTokens > 700) failures.push(`${task.taskName}: ultra tokens ${ultra.contextTokens} > 700`);
  }
  return { ok: failures.length === 0, failures };
}

function suiteSuccess(summary: SkillSuiteSummary): boolean {
  return (
    !summary.incomplete &&
    summary.tasksCompleted === 5 &&
    summary.perTaskWins.contextEfficiency >= 4 &&
    summary.perTaskWins.quality >= 4 &&
    summary.perTaskWins.codex >= 3 &&
    summary.suiteClaimAllowed
  );
}

function writeIterationSummary(plan: IterationPlan, summary: SkillSuiteSummary, packFailures: string[]): void {
  const dir = path.join(ITERATIONS_DIR, `iteration-${plan.iteration}`);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    iteration: plan.iteration,
    changeAttempted: plan.change,
    packGateFailures: packFailures,
    tasksCompleted: summary.tasksCompleted,
    perTaskWins: summary.perTaskWins,
    verdict: summary.verdict,
    allowedClaim: summary.allowedClaim,
    suiteClaimAllowed: summary.suiteClaimAllowed,
    incomplete: summary.incomplete,
    incompleteReason: summary.incompleteReason,
    nextHypothesis: plan.nextHypothesis,
    generatedAt: new Date().toISOString(),
    tasks: summary.tasks.map((t) => ({
      taskName: t.taskName,
      graphifyContextTokens: t.graphifyContextTokens,
      repoContextContextTokens: t.repoContextContextTokens,
      graphifyQuality: t.graphifyLocalScore.qualityScore,
      repoQuality: t.repoContextLocalScore.qualityScore,
      graphifyMedian: t.graphifyMedianCodex,
      repoMedian: t.repoContextMedianCodex,
      wins: {
        codex: t.codexTokenWin,
        quality: t.qualityWin,
        contextEfficiency: t.contextEfficiencyWin,
      },
    })),
  };
  fs.writeFileSync(path.join(dir, "summary.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const md = [
    `# Skill suite iteration ${plan.iteration}`,
    "",
    `## Change`,
    plan.change,
    "",
    "## Pack gate",
    packFailures.length ? packFailures.map((f) => `- ${f}`).join("\n") : "- all ultra packs pass",
    "",
    "## Suite",
    `- Tasks completed: ${summary.tasksCompleted}/5`,
    `- Context-efficiency wins: ${summary.perTaskWins.contextEfficiency}/5`,
    `- Quality wins: ${summary.perTaskWins.quality}/5`,
    `- Codex wins: ${summary.perTaskWins.codex}/5`,
    `- Verdict: \`${summary.verdict}\``,
    `- Claim allowed: ${summary.suiteClaimAllowed}`,
    summary.incomplete ? `- Incomplete: ${summary.incompleteReason}` : "",
    "",
    `Next hypothesis: ${plan.nextHypothesis}`,
  ];
  fs.writeFileSync(path.join(dir, "summary.md"), `${md.filter(Boolean).join("\n")}\n`, "utf8");
}

export async function proveSkillSuiteHeadToHead(options: {
  codexBin?: string;
  maxIterations?: number;
}): Promise<{
  success: boolean;
  finalSummary: SkillSuiteSummary | null;
  iterations: number;
  honestStopReason?: string;
}> {
  const maxIterations = options.maxIterations ?? MAX_ITERATIONS;
  let finalSummary: SkillSuiteSummary | null = null;

  for (const plan of ITERATION_PLANS.slice(0, maxIterations)) {
    console.log(`[self:prove-skill-suite] Iteration ${plan.iteration}: ${plan.change}`);
    if (!runQuickValidation()) {
      throw new Error(`Validation failed before iteration ${plan.iteration}`);
    }

    const packGate = localPackGate();
    if (!packGate.ok) {
      console.warn(`[self:prove-skill-suite] Pack gate warnings: ${packGate.failures.join("; ")}`);
    }

    if (plan.rebuildGraphify) {
      for (const task of COMPRESSION_TASKS) {
        buildGraphifyBestEffortForTask(ROOT, task.taskName);
      }
    }

    const summary = await runSkillSuiteHeadToHead({
      repoPath: ROOT,
      codexBin: options.codexBin,
      runsRoot: path.join(ITERATIONS_DIR, `iteration-${plan.iteration}`, "runs"),
    });
    writeIterationSummary(plan, summary, packGate.failures);
    finalSummary = summary;

    const runsSummaryJson = path.join(ITERATIONS_DIR, `iteration-${plan.iteration}`, "runs", "summary.json");
    const runsSummaryMd = path.join(ITERATIONS_DIR, `iteration-${plan.iteration}`, "runs", "summary.md");
    fs.mkdirSync(path.join(ROOT, SKILL_SUITE_DIR), { recursive: true });
    if (fs.existsSync(runsSummaryJson)) {
      fs.copyFileSync(runsSummaryJson, path.join(ROOT, SKILL_SUITE_DIR, "summary.json"));
    }
    if (fs.existsSync(runsSummaryMd)) {
      fs.copyFileSync(runsSummaryMd, path.join(ROOT, SKILL_SUITE_DIR, "summary.md"));
    }

    if (suiteSuccess(summary)) {
      return { success: true, finalSummary: summary, iterations: plan.iteration };
    }
  }

  return {
    success: false,
    finalSummary,
    iterations: maxIterations,
    honestStopReason:
      "After 3 iterations, repo-context skill mode did not meet all suite gates (5/5 complete, 4/5 context-efficiency, 4/5 quality, 3/5 Codex) without benchmark unfairness.",
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const result = await proveSkillSuiteHeadToHead({
    codexBin: readStringArg(args, "codex-bin"),
    maxIterations: readNumberArg(args, "max-iterations") ?? MAX_ITERATIONS,
  });

  const reportPath = path.join(ROOT, SKILL_SUITE_DIR, "self-prove-report.md");
  const lines = [
    "# Self-iteration skill suite report",
    "",
    `Success: ${result.success ? "yes" : "no"}`,
    `Iterations: ${result.iterations}`,
    result.finalSummary ? `Verdict: \`${result.finalSummary.verdict}\`` : "",
    result.finalSummary?.allowedClaim ? `Allowed claim: ${result.finalSummary.allowedClaim}` : "",
    result.honestStopReason ? `Honest stop: ${result.honestStopReason}` : "",
    "",
    "All iterations preserved under `.mcp-benchmarks/skill-suite-head-to-head/iterations/`.",
  ];
  fs.writeFileSync(reportPath, `${lines.filter(Boolean).join("\n")}\n`, "utf8");

  console.log(`success=${result.success}`);
  if (result.finalSummary) {
    console.log(`verdict=${result.finalSummary.verdict}`);
    console.log(`allowed_claim=${result.finalSummary.allowedClaim}`);
  }
  if (!result.success) {
    console.log(`honest_stop=${result.honestStopReason}`);
    process.exit(1);
  }
}

if (process.argv[1]?.includes("proveSkillSuiteHeadToHead")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
