/**
 * Self-iteration wrapper for the Claude supplied-context head-to-head.
 *
 * Each invocation:
 *  1. Runs the local pack-quality gate (claudePackQuality).
 *  2. Runs the head-to-head scorer over any Claude answers on disk.
 *  3. Evaluates the stop rules and writes an iteration summary under
 *     .mcp-benchmarks/claude/iterations/iteration-N/.
 *
 * Stop rules:
 *  SUCCESS  — repo-context quality >= Graphify-derived quality on >=4/5 tasks
 *             AND context reduction >=70% on every task.
 *  STRETCH  — quality wins on 5/5 tasks.
 *  CONTINUE — gates not met; iterate with the smallest safe improvement.
 *
 * Failed iterations are preserved, never deleted.
 *
 * Usage: npm run self:prove-claude-skill-head-to-head
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runClaudePackQuality } from "../benchmark/claudePackQuality.js";
import { runClaudeSkillHeadToHead } from "../benchmark/claudeSkillHeadToHead.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ITER_DIR = path.join(ROOT, ".mcp-benchmarks/claude/iterations");

function nextIterationNumber(): number {
  if (!fs.existsSync(ITER_DIR)) return 1;
  const numbers = fs
    .readdirSync(ITER_DIR)
    .map((name) => /^iteration-(\d+)$/.exec(name)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

export function runProveClaudeSkillHeadToHead(): {
  verdict: "SUCCESS" | "STRETCH" | "CONTINUE" | "AWAITING_ANSWERS";
  iteration: number;
} {
  const packQuality = runClaudePackQuality();
  const headToHead = runClaudeSkillHeadToHead();

  const iteration = nextIterationNumber();
  const dir = path.join(ITER_DIR, `iteration-${iteration}`);
  fs.mkdirSync(dir, { recursive: true });

  const tasks = Object.entries(headToHead.summary);
  let qualityWins = 0;
  let answeredTasks = 0;
  const perTask: Array<Record<string, unknown>> = [];

  for (const [taskId, arms] of tasks) {
    const gf = arms.graphify;
    const rc = arms["repo-context"];
    const answered = gf.medianQuality !== null && rc.medianQuality !== null;
    if (answered) {
      answeredTasks += 1;
      if ((rc.medianQuality ?? 0) >= (gf.medianQuality ?? 0)) qualityWins += 1;
    }
    const local = packQuality.results.find((r) => r.task === taskId);
    perTask.push({
      task: taskId,
      graphifyDerivedContextTokens: gf.contextTokens,
      repoContextTokens: rc.contextTokens,
      reductionPct: local?.reductionPct ?? null,
      graphifyDerivedMedianQuality: gf.medianQuality,
      repoContextMedianQuality: rc.medianQuality,
      localPackQuality: local?.repoContextQuality ?? null,
      localGraphifyQuality: local?.graphifyDerivedQuality ?? null,
    });
  }

  const reductionOk = packQuality.results.every((r) => r.reductionGate);
  let verdict: "SUCCESS" | "STRETCH" | "CONTINUE" | "AWAITING_ANSWERS";
  if (!headToHead.allAnswered || answeredTasks < tasks.length) {
    verdict = "AWAITING_ANSWERS";
  } else if (qualityWins === tasks.length && reductionOk) {
    verdict = "STRETCH";
  } else if (qualityWins >= 4 && reductionOk) {
    verdict = "SUCCESS";
  } else {
    verdict = "CONTINUE";
  }

  const summaryJson = {
    iteration,
    generatedAt: new Date().toISOString(),
    verdict,
    qualityWins: `${qualityWins}/${tasks.length}`,
    reductionGate: reductionOk,
    localPackGate: packQuality.pass,
    usageComparison: "INCOMPLETE_EXACT_USAGE_UNAVAILABLE",
    perTask,
  };
  fs.writeFileSync(path.join(dir, "summary.json"), `${JSON.stringify(summaryJson, null, 2)}\n`, "utf8");

  const md: string[] = [
    `# Claude Head-to-Head — Iteration ${iteration}`,
    "",
    `Verdict: **${verdict}**`,
    `Quality wins (repo-context >= Graphify-derived): ${qualityWins}/${tasks.length}`,
    `Reduction >=70% on all tasks: ${reductionOk}`,
    `Local pack gate: ${packQuality.pass ? "PASS" : "FAIL"}`,
    "",
    "| Task | Graphify-derived ctx | repo-context ctx | Reduction | Graphify-derived q | repo-context q |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const t of perTask) {
    md.push(
      `| ${t.task} | ${t.graphifyDerivedContextTokens} | ${t.repoContextTokens} | ${t.reductionPct}% | ${t.graphifyDerivedMedianQuality ?? "—"} | ${t.repoContextMedianQuality ?? "—"} |`,
    );
  }
  md.push("", "Claude token usage: INCOMPLETE_EXACT_USAGE_UNAVAILABLE (Cursor IDE, no API counter).", "");
  fs.writeFileSync(path.join(dir, "summary.md"), `${md.join("\n")}\n`, "utf8");

  return { verdict, iteration };
}

function main(): void {
  const { verdict, iteration } = runProveClaudeSkillHeadToHead();
  console.log(`Iteration ${iteration}: ${verdict}`);
  console.log(`Artifacts: .mcp-benchmarks/claude/iterations/iteration-${iteration}/`);
  if (verdict === "CONTINUE") process.exitCode = 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
