import fs from "node:fs";
import path from "node:path";
import { parseCliArgs, readNumberArg, readStringArg } from "../ab/cli.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { calculateRepeatStats } from "../ab/repeatStats.js";
import { buildSkillPack, estimateTokensFromText } from "../cli/skillPack.js";
import { formatSkillMarkdown } from "../cli/formatSkillMarkdown.js";
import { COMPRESSION_TASKS } from "./compressionTasks.js";
import {
  buildGraphifySkillPrompt,
  buildRepoContextSkillPrompt,
  DEFAULT_CODEX_BIN,
  runSuppliedContextCodexOnce,
  type SuppliedContextCodexRepeat,
} from "./codexSuppliedContext.js";
import { GRAPHIFY_BEST_EFFORT_CONTEXT } from "./bestEffortSkillHeadToHead.js";
import {
  buildGraphifyBestEffortForTask,
  graphifyBestEffortContextPath,
} from "./graphifyBestEffort.js";
import {
  buildContextEfficiencyMetrics,
  compareContextEfficiency,
} from "./contextEfficiencyMetrics.js";

export const SKILL_SUITE_DIR = ".mcp-benchmarks/skill-suite-head-to-head";
const DEFAULT_REPEATS = 3;

export interface SkillSuiteTaskResult {
  taskName: string;
  graphifyContextFile: string;
  repoContextContextFile: string;
  graphifyContextTokens: number;
  repoContextContextTokens: number;
  graphifyLocalScore: ReturnType<typeof scoreCodexQaText>;
  repoContextLocalScore: ReturnType<typeof scoreCodexQaText>;
  contextEfficiency: ReturnType<typeof compareContextEfficiency>;
  graphifyRepeats: SuppliedContextCodexRepeat[];
  repoContextRepeats: SuppliedContextCodexRepeat[];
  graphifyMedianCodex: number | null;
  repoContextMedianCodex: number | null;
  graphifyMinQuality: number | null;
  repoContextMinQuality: number | null;
  codexTokenWin: boolean;
  qualityWin: boolean;
  contextEfficiencyWin: boolean;
  perTaskTokenWin: boolean;
  taskComplete: { graphify: boolean; repoContext: boolean };
  repeatsComplete: { graphify: number; repoContext: number };
  mcpClean: boolean;
  noCrossContamination: boolean;
}

export interface SkillSuiteSummary {
  generatedAt: string;
  measuredClient: "codex";
  codexBin: string;
  noMcp: true;
  repeats: number;
  tasks: SkillSuiteTaskResult[];
  perTaskWins: { codex: number; quality: number; contextEfficiency: number; taskComplete: number };
  suiteCodexWin: boolean;
  suiteQualityWin: boolean;
  suiteContextEfficiencyWin: boolean;
  allowedClaim: string;
  verdict: string;
  incomplete: boolean;
  incompleteReason?: string;
  tasksCompleted: number;
  suiteClaimAllowed: boolean;
}

const SUITE_TASK_COUNT = 5;
const WIN_GATE_CONTEXT = 4;
const WIN_GATE_QUALITY = 4;
const WIN_GATE_CODEX = 3;

function loadGraphifyTaskContext(repoPath: string, taskName: string): string {
  const perTask = graphifyBestEffortContextPath(repoPath, taskName);
  if (fs.existsSync(perTask)) {
    return fs.readFileSync(perTask, "utf8");
  }
  if (taskName === "auth-discovery" && fs.existsSync(path.join(repoPath, GRAPHIFY_BEST_EFFORT_CONTEXT))) {
    return fs.readFileSync(path.join(repoPath, GRAPHIFY_BEST_EFFORT_CONTEXT), "utf8");
  }
  buildGraphifyBestEffortForTask(repoPath, taskName);
  return fs.readFileSync(perTask, "utf8");
}

function taskRepeatsValid(repeats: SuppliedContextCodexRepeat[], required: number): boolean {
  return (
    repeats.length >= required &&
    repeats.every((r) => r.usageParsed && !r.mcpToolsDetected && !r.crossContamination)
  );
}

export async function runSkillSuiteHeadToHead(options: {
  repoPath?: string;
  codexBin?: string;
  repeats?: number;
  tasks?: string[];
  runsRoot?: string;
}): Promise<SkillSuiteSummary> {
  const repoPath = path.resolve(options.repoPath ?? process.cwd());
  const codexBin = options.codexBin ?? DEFAULT_CODEX_BIN;
  const repeats = options.repeats ?? DEFAULT_REPEATS;
  const runsRoot = path.resolve(repoPath, options.runsRoot ?? SKILL_SUITE_DIR);
  const taskNames = options.tasks ?? COMPRESSION_TASKS.map((t) => t.taskName);

  const results: SkillSuiteTaskResult[] = [];
  let incomplete = false;
  let incompleteReason: string | undefined;

  for (const taskName of taskNames) {
    const profile = getCodexQaTask(taskName);
    const compression = COMPRESSION_TASKS.find((t) => t.taskName === taskName);
    if (!profile || !compression) continue;

    const taskDir = path.join(runsRoot, "tasks", taskName);
    fs.mkdirSync(taskDir, { recursive: true });

    const graphifyContextFile = path.join(taskDir, "graphify-context.txt");
    const repoContextContextFile = path.join(taskDir, "repo-context-context.txt");

    const graphifyContext = loadGraphifyTaskContext(repoPath, taskName);
    fs.writeFileSync(graphifyContextFile, graphifyContext, "utf8");

    const pack = buildSkillPack({
      task: profile.prompt,
      root: repoPath,
      mode: compression.mode,
      budgetTokens: 500,
    });
    const repoMarkdown = formatSkillMarkdown(pack, "ultra");
    fs.writeFileSync(repoContextContextFile, repoMarkdown, "utf8");

    const graphifyLocalScore = scoreCodexQaText(profile, graphifyContext);
    const repoContextLocalScore = scoreCodexQaText(profile, repoMarkdown);
    const graphifyTokens = estimateTokensFromText(graphifyContext);
    const repoTokens = estimateTokensFromText(repoMarkdown);
    const contextEfficiency = compareContextEfficiency(
      buildContextEfficiencyMetrics({
        arm: "graphify",
        contextTokens: graphifyTokens,
        score: graphifyLocalScore,
        expectedFileCount: profile.expectedFilePatterns.length,
        expectedConceptCount: profile.expectedConcepts.length,
      }),
      buildContextEfficiencyMetrics({
        arm: "repo-context",
        contextTokens: repoTokens,
        score: repoContextLocalScore,
        expectedFileCount: profile.expectedFilePatterns.length,
        expectedConceptCount: profile.expectedConcepts.length,
      }),
    );

    const graphifyRepeats: SuppliedContextCodexRepeat[] = [];
    const repoContextRepeats: SuppliedContextCodexRepeat[] = [];

    for (let i = 1; i <= repeats; i += 1) {
      console.log(`[skill-suite] ${taskName} graphify repeat ${i}/${repeats}`);
      try {
        graphifyRepeats.push(
          await runSuppliedContextCodexOnce({
            codexBin,
            repoPath,
            prompt: buildGraphifySkillPrompt(graphifyContext, profile.prompt, true),
            runDir: path.join(taskDir, "graphify", `repeat-${i}`),
            repeat: i,
            arm: "graphify",
            taskName,
          }),
        );
      } catch (error) {
        incomplete = true;
        incompleteReason = error instanceof Error ? error.message : String(error);
      }
    }
    for (let i = 1; i <= repeats; i += 1) {
      console.log(`[skill-suite] ${taskName} repo-context repeat ${i}/${repeats}`);
      try {
        repoContextRepeats.push(
          await runSuppliedContextCodexOnce({
            codexBin,
            repoPath,
            prompt: buildRepoContextSkillPrompt(repoMarkdown, profile.prompt, true),
            runDir: path.join(taskDir, "repo-context", `repeat-${i}`),
            repeat: i,
            arm: "repo-context",
            taskName,
          }),
        );
      } catch (error) {
        incomplete = true;
        incompleteReason = error instanceof Error ? error.message : String(error);
      }
    }

    const graphifyTotals = graphifyRepeats.filter((r) => r.usageParsed).map((r) => r.clientTotalTokens!);
    const repoTotals = repoContextRepeats.filter((r) => r.usageParsed).map((r) => r.clientTotalTokens!);
    const graphifyStats = graphifyTotals.length ? calculateRepeatStats(graphifyTotals) : undefined;
    const repoStats = repoTotals.length ? calculateRepeatStats(repoTotals) : undefined;
    const graphifyMedian = graphifyStats?.median ?? null;
    const repoMedian = repoStats?.median ?? null;
    const graphifyMinQ = graphifyRepeats.length ? Math.min(...graphifyRepeats.map((r) => r.qualityScore)) : null;
    const repoMinQ = repoContextRepeats.length ? Math.min(...repoContextRepeats.map((r) => r.qualityScore)) : null;

    const qualityWin = repoMinQ !== null && graphifyMinQ !== null && repoMinQ >= graphifyMinQ;
    const codexTokenWin =
      graphifyMedian !== null && repoMedian !== null && repoMedian < graphifyMedian && qualityWin;
    const contextEfficiencyWin =
      repoTokens <= graphifyTokens &&
      repoContextLocalScore.qualityScore >= graphifyLocalScore.qualityScore;
    const graphifyRepeatsOk = taskRepeatsValid(graphifyRepeats, repeats);
    const repoRepeatsOk = taskRepeatsValid(repoContextRepeats, repeats);
    const mcpClean =
      graphifyRepeats.every((r) => !r.mcpToolsDetected) && repoContextRepeats.every((r) => !r.mcpToolsDetected);
    const noCross =
      graphifyRepeats.every((r) => !r.crossContamination) &&
      repoContextRepeats.every((r) => !r.crossContamination);
    if (!graphifyRepeatsOk || !repoRepeatsOk) {
      incomplete = true;
      incompleteReason = `${taskName}: repeats incomplete (graphify=${graphifyRepeatsOk} repo=${repoRepeatsOk})`;
    }

    results.push({
      taskName,
      graphifyContextFile,
      repoContextContextFile,
      graphifyContextTokens: graphifyTokens,
      repoContextContextTokens: repoTokens,
      graphifyLocalScore,
      repoContextLocalScore,
      contextEfficiency,
      graphifyRepeats,
      repoContextRepeats,
      graphifyMedianCodex: graphifyMedian,
      repoContextMedianCodex: repoMedian,
      graphifyMinQuality: graphifyMinQ,
      repoContextMinQuality: repoMinQ,
      codexTokenWin,
      qualityWin,
      contextEfficiencyWin,
      perTaskTokenWin: codexTokenWin,
      taskComplete: {
        graphify: contextEfficiency.graphify.taskComplete,
        repoContext: contextEfficiency.repoContext.taskComplete,
      },
      repeatsComplete: {
        graphify: graphifyRepeats.filter((r) => r.usageParsed).length,
        repoContext: repoContextRepeats.filter((r) => r.usageParsed).length,
      },
      mcpClean,
      noCrossContamination: noCross,
    });
  }

  const perTaskWins = {
    codex: results.filter((r) => r.codexTokenWin).length,
    quality: results.filter((r) => r.qualityWin).length,
    contextEfficiency: results.filter((r) => r.contextEfficiencyWin).length,
    taskComplete: results.filter((r) => r.taskComplete.repoContext).length,
  };
  const suiteCodexWin = perTaskWins.codex >= WIN_GATE_CODEX;
  const suiteQualityWin = perTaskWins.quality >= WIN_GATE_QUALITY;
  const suiteContextEfficiencyWin = perTaskWins.contextEfficiency >= WIN_GATE_CONTEXT;
  const tasksCompleted = results.filter(
    (r) => r.repeatsComplete.graphify >= repeats && r.repeatsComplete.repoContext >= repeats && r.mcpClean,
  ).length;
  const allTasksComplete = tasksCompleted === SUITE_TASK_COUNT && results.length === SUITE_TASK_COUNT;

  let allowedClaim = "No suite-wide superiority claim.";
  let verdict = "SKILL_SUITE_COMPLETE_NO_SUPERIORITY_CLAIM";
  let suiteClaimAllowed = false;
  if (allTasksComplete && !incomplete && suiteContextEfficiencyWin && suiteQualityWin) {
    verdict = "SCOPED_SKILL_SUITE_CONTEXT_EFFICIENCY";
    allowedClaim = `Across the completed skill-suite tasks in this repo, repo-context skill mode produced smaller, more task-complete supplied context than Graphify best-effort retrieval, with equal or better quality on ${perTaskWins.quality}/5 tasks.`;
    suiteClaimAllowed = true;
  }
  if (allTasksComplete && !incomplete && suiteCodexWin && suiteQualityWin) {
    verdict = "SCOPED_SKILL_SUITE_CODEX_WIN";
    allowedClaim = `Across the completed skill-suite tasks in this repo, repo-context skill mode produced smaller supplied context than Graphify best-effort on ${perTaskWins.contextEfficiency}/5 tasks, with equal or better quality on ${perTaskWins.quality}/5 tasks and lower median Codex usage on ${perTaskWins.codex}/5 tasks.`;
    suiteClaimAllowed = true;
  }
  if (!allTasksComplete) {
    incomplete = true;
    incompleteReason = incompleteReason ?? `Only ${tasksCompleted}/${SUITE_TASK_COUNT} tasks completed cleanly`;
  }

  const summary: SkillSuiteSummary = {
    generatedAt: new Date().toISOString(),
    measuredClient: "codex",
    codexBin,
    noMcp: true,
    repeats,
    tasks: results,
    perTaskWins,
    suiteCodexWin,
    suiteQualityWin,
    suiteContextEfficiencyWin,
    allowedClaim,
    verdict,
    incomplete,
    incompleteReason,
    tasksCompleted,
    suiteClaimAllowed,
  };

  writeSkillSuiteSummary(summary, runsRoot);
  return summary;
}

export function writeSkillSuiteSummary(summary: SkillSuiteSummary, runsRoot = SKILL_SUITE_DIR): void {
  fs.mkdirSync(runsRoot, { recursive: true });
  fs.writeFileSync(path.join(runsRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const lines = [
    "# Skill suite head-to-head",
    "",
    `Generated: ${summary.generatedAt}`,
    `Repeats: ${summary.repeats}`,
    "",
    "## Per-task",
    ...summary.tasks.map(
      (t) =>
        `### ${t.taskName}\n- context: graphify ${t.graphifyContextTokens} vs repo ${t.repoContextContextTokens}\n- local quality: ${t.graphifyLocalScore.qualityScore} vs ${t.repoContextLocalScore.qualityScore}\n- Codex median: ${t.graphifyMedianCodex ?? "n/a"} vs ${t.repoContextMedianCodex ?? "n/a"}\n- wins: codex=${t.codexTokenWin} quality=${t.qualityWin} contextEff=${t.contextEfficiencyWin}`,
    ),
    "",
    "## Suite wins",
    `- Codex token wins: ${summary.perTaskWins.codex}/5`,
    `- Quality wins: ${summary.perTaskWins.quality}/5`,
    `- Context-efficiency wins: ${summary.perTaskWins.contextEfficiency}/5`,
    "",
    `Verdict: \`${summary.verdict}\``,
    `Allowed claim: ${summary.allowedClaim}`,
  ];
  fs.writeFileSync(path.join(runsRoot, "summary.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const tasks = readStringArg(args, "tasks")?.split(",").map((t) => t.trim()).filter(Boolean);
  const summary = await runSkillSuiteHeadToHead({
    repoPath: readStringArg(args, "repo"),
    codexBin: readStringArg(args, "codex-bin"),
    repeats: readNumberArg(args, "repeat"),
    tasks,
  });
  console.log(`verdict=${summary.verdict}`);
  console.log(`suite_wins codex=${summary.perTaskWins.codex} quality=${summary.perTaskWins.quality}`);
}

if (process.argv[1]?.includes("skillSuiteHeadToHead")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
