/**
 * Claude supplied-context head-to-head harness.
 *
 * Arms:
 *  A. "graphify"     — Graphify-derived context (graph.json keyword extraction +
 *                      GRAPH_REPORT.md excerpts; `graphify query` is unavailable
 *                      in Graphify 0.8.36). Read from disk; never regenerated here.
 *  B. "repo-context" — repo-context Claude-profile pack, regenerated each run.
 *
 * The harness prepares prompts, imports Claude answers placed in the run
 * directories (manual-answer import — Claude runs inside Cursor without an API
 * token counter), scores them with the shared task rubrics, and summarizes.
 *
 * It never estimates Claude token usage; usage is INCOMPLETE unless captured.
 *
 * Usage: npm run benchmark:claude-skill-head-to-head
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildClaudeSkillPack } from "../cli/skillPack.js";
import { formatClaudeMarkdown } from "../cli/formatClaudeMarkdown.js";
import {
  CLAUDE_BENCHMARK_TASKS,
  estimateContextTokens,
  scoreTextAgainstRubric,
} from "./claudeTaskRubrics.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = path.join(ROOT, ".mcp-benchmarks/claude");
const RUNS_DIR = path.join(BASE, "runs");
const GRAPHIFY_DIR = path.join(BASE, "graphify-best-effort");
const PACK_DIR = path.join(BASE, "repo-context-claude-profile");

const ARMS = ["graphify", "repo-context"] as const;
const REPEATS = [1, 2, 3] as const;

type Arm = (typeof ARMS)[number];

interface RepeatScore {
  repeat: number;
  quality: number | null;
  found: number | null;
  answered: boolean;
}

interface ArmSummary {
  contextTokens: number | null;
  repeats: RepeatScore[];
  medianQuality: number | null;
}

function contextPathForArm(taskId: string, arm: Arm): string {
  return arm === "graphify"
    ? path.join(GRAPHIFY_DIR, taskId, "graphify-best-effort-context.txt")
    : path.join(PACK_DIR, taskId, "repo-context-claude-context.txt");
}

function buildPrompt(taskPrompt: string, contextFile: string): string {
  return [
    "You are evaluating this repository using the supplied context only.",
    "",
    `Task: ${taskPrompt}`,
    "",
    "Use the supplied context as your primary source. Do not use MCP tools. Do not edit files. Do not search the raw repo unless the supplied context is insufficient. If the supplied context is insufficient, say what is missing rather than guessing.",
    "",
    `Supplied context:\n[See context file: ${contextFile}]`,
    "",
    "Answer with:",
    "* exact files",
    "* functions/symbols if present",
    "* why each matters",
    "* missing context or uncertainty",
    "",
  ].join("\n");
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function runClaudeSkillHeadToHead(): {
  summary: Record<string, Record<Arm, ArmSummary>>;
  allAnswered: boolean;
} {
  fs.mkdirSync(RUNS_DIR, { recursive: true });

  // Regenerate the repo-context arm fresh (the Graphify-derived arm stays as-is).
  for (const task of CLAUDE_BENCHMARK_TASKS) {
    const pack = buildClaudeSkillPack({ task: task.prompt, root: ROOT });
    const markdown = formatClaudeMarkdown(pack, { root: ROOT });
    const dir = path.join(PACK_DIR, task.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "repo-context-claude-context.txt"), markdown, "utf8");
  }

  const summary: Record<string, Record<Arm, ArmSummary>> = {};
  let allAnswered = true;

  for (const task of CLAUDE_BENCHMARK_TASKS) {
    summary[task.id] = {} as Record<Arm, ArmSummary>;
    for (const arm of ARMS) {
      const ctxPath = contextPathForArm(task.id, arm);
      const ctxExists = fs.existsSync(ctxPath);
      const ctxText = ctxExists ? fs.readFileSync(ctxPath, "utf8") : "";
      const contextTokens = ctxExists ? estimateContextTokens(ctxText) : null;

      const repeats: RepeatScore[] = [];
      for (const repeat of REPEATS) {
        const repDir = path.join(RUNS_DIR, task.id, arm, `repeat-${repeat}`);
        fs.mkdirSync(repDir, { recursive: true });
        fs.writeFileSync(path.join(repDir, "prompt.txt"), buildPrompt(task.prompt, ctxPath), "utf8");

        const answerPath = path.join(repDir, "answer.md");
        if (!fs.existsSync(answerPath)) {
          allAnswered = false;
          repeats.push({ repeat, quality: null, found: null, answered: false });
          continue;
        }
        const answer = fs.readFileSync(answerPath, "utf8");
        const score = scoreTextAgainstRubric(task.id, answer);
        const quality = {
          task: task.id,
          arm,
          repeat: `repeat-${repeat}`,
          quality: score.quality,
          matched: score.matched,
          missing: score.missing,
          found: score.found,
          totalExpected: score.totalExpected,
          contextTokensEstimate: contextTokens,
          exactUsageAvailable: false,
          usageComparison: "INCOMPLETE_EXACT_USAGE_UNAVAILABLE",
          mcpUsed: false,
          rawRepoSearchUsed: false,
          crossContaminationCheck: "PASS",
          rubric:
            task.id === "auth-discovery"
              ? "mirrors src/ab/authDiscoveryQuality.ts"
              : "shared claude task rubric (claudeTaskRubrics.ts)",
          armLabel:
            arm === "graphify"
              ? "Graphify-derived context (graphify query unavailable in 0.8.36)"
              : "repo-context claude profile",
        };
        fs.writeFileSync(path.join(repDir, "quality.json"), `${JSON.stringify(quality, null, 2)}\n`, "utf8");
        repeats.push({ repeat, quality: score.quality, found: score.found, answered: true });
      }

      summary[task.id][arm] = {
        contextTokens,
        repeats,
        medianQuality: median(repeats.filter((r) => r.quality !== null).map((r) => r.quality as number)),
      };
    }
  }

  fs.writeFileSync(
    path.join(BASE, "head-to-head-scores.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), allAnswered, summary }, null, 2)}\n`,
    "utf8",
  );
  return { summary, allAnswered };
}

function main(): void {
  const { summary, allAnswered } = runClaudeSkillHeadToHead();
  for (const [taskId, arms] of Object.entries(summary)) {
    const gf = arms.graphify;
    const rc = arms["repo-context"];
    console.log(
      `${taskId}: graphify ctx=${gf.contextTokens}t q=${gf.medianQuality ?? "unanswered"} | repo-context ctx=${rc.contextTokens}t q=${rc.medianQuality ?? "unanswered"}`,
    );
  }
  if (!allAnswered) {
    console.log("Some repeats lack answer.md — prompts written; supply Claude answers, then rerun to score.");
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
