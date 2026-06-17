/**
 * Local pre-Claude gate: generate Claude-profile repo-context packs for the
 * 5 benchmark tasks, score them against the task rubrics, and compare against
 * the Graphify-derived contexts already on disk.
 *
 * Gates (must pass before running the Claude benchmark):
 *  - repo-context local quality >= Graphify-derived local quality on >= 4/5 tasks
 *  - repo-context context tokens >= 70% smaller on every task
 *
 * Usage: npm run benchmark:claude-pack-quality
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
const OUT_DIR = path.join(ROOT, ".mcp-benchmarks/claude/quality-improvement");
const GRAPHIFY_DIR = path.join(ROOT, ".mcp-benchmarks/claude/graphify-best-effort");
const PACK_DIR = path.join(ROOT, ".mcp-benchmarks/claude/repo-context-claude-profile");

interface TaskResult {
  task: string;
  repoContextTokens: number;
  graphifyDerivedTokens: number | null;
  reductionPct: number | null;
  repoContextQuality: number;
  graphifyDerivedQuality: number | null;
  repoContextMatched: string[];
  repoContextMissing: string[];
  qualityGate: boolean;
  reductionGate: boolean;
  packPath: string;
}

export function runClaudePackQuality(): { results: TaskResult[]; pass: boolean } {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PACK_DIR, { recursive: true });

  const results: TaskResult[] = [];

  for (const task of CLAUDE_BENCHMARK_TASKS) {
    const pack = buildClaudeSkillPack({ task: task.prompt, root: ROOT });
    const markdown = formatClaudeMarkdown(pack, { root: ROOT });

    const taskDir = path.join(PACK_DIR, task.id);
    fs.mkdirSync(taskDir, { recursive: true });
    const packPath = path.join(taskDir, "repo-context-claude-context.txt");
    fs.writeFileSync(packPath, markdown, "utf8");

    const repoTokens = estimateContextTokens(markdown);
    const repoScore = scoreTextAgainstRubric(task.id, markdown);

    const graphifyPath = path.join(GRAPHIFY_DIR, task.id, "graphify-best-effort-context.txt");
    let graphifyTokens: number | null = null;
    let graphifyQuality: number | null = null;
    if (fs.existsSync(graphifyPath)) {
      const graphifyText = fs.readFileSync(graphifyPath, "utf8");
      graphifyTokens = estimateContextTokens(graphifyText);
      graphifyQuality = scoreTextAgainstRubric(task.id, graphifyText).quality;
    }

    const reductionPct =
      graphifyTokens && graphifyTokens > 0
        ? Math.round(((graphifyTokens - repoTokens) / graphifyTokens) * 1000) / 10
        : null;

    results.push({
      task: task.id,
      repoContextTokens: repoTokens,
      graphifyDerivedTokens: graphifyTokens,
      reductionPct,
      repoContextQuality: repoScore.quality,
      graphifyDerivedQuality: graphifyQuality,
      repoContextMatched: repoScore.matched,
      repoContextMissing: repoScore.missing,
      qualityGate: graphifyQuality === null ? true : repoScore.quality >= graphifyQuality,
      reductionGate: reductionPct === null ? false : reductionPct >= 70,
      packPath: path.relative(ROOT, packPath),
    });
  }

  const qualityWins = results.filter((r) => r.qualityGate).length;
  const reductionOk = results.every((r) => r.reductionGate);
  const pass = qualityWins >= 4 && reductionOk;

  const jsonOut = {
    generatedAt: new Date().toISOString(),
    gates: {
      qualityGate: `${qualityWins}/5 tasks repo-context >= Graphify-derived (need >=4)`,
      reductionGate: reductionOk ? "all tasks >=70% smaller" : "FAILED: some task <70% smaller",
      pass,
    },
    results,
  };
  fs.writeFileSync(path.join(OUT_DIR, "local-pack-quality.json"), `${JSON.stringify(jsonOut, null, 2)}\n`, "utf8");

  const md: string[] = [
    "# Local Pack Quality — Claude profile vs Graphify-derived context",
    "",
    `Generated: ${jsonOut.generatedAt}`,
    "",
    "| Task | repo-context tokens | Graphify-derived tokens | Reduction | repo-context quality | Graphify-derived quality | Quality gate | Reduction gate |",
    "|---|---:|---:|---:|---:|---:|---|---|",
  ];
  for (const r of results) {
    md.push(
      `| ${r.task} | ${r.repoContextTokens} | ${r.graphifyDerivedTokens ?? "n/a"} | ${r.reductionPct ?? "n/a"}% | ${r.repoContextQuality} | ${r.graphifyDerivedQuality ?? "n/a"} | ${r.qualityGate ? "PASS" : "FAIL"} | ${r.reductionGate ? "PASS" : "FAIL"} |`,
    );
  }
  md.push("", `**Quality wins:** ${qualityWins}/5 (need >=4)`, `**Reduction >=70% on all tasks:** ${reductionOk}`, `**Overall:** ${pass ? "PASS" : "FAIL"}`, "");
  for (const r of results) {
    md.push(`## ${r.task}`, `- matched: ${r.repoContextMatched.join("; ") || "none"}`, `- missing: ${r.repoContextMissing.join("; ") || "none"}`, "");
  }
  fs.writeFileSync(path.join(OUT_DIR, "local-pack-quality.md"), `${md.join("\n")}\n`, "utf8");

  return { results, pass };
}

function main(): void {
  const { results, pass } = runClaudePackQuality();
  for (const r of results) {
    console.log(
      `${r.task}: rc=${r.repoContextTokens}t q=${r.repoContextQuality} | graphify=${r.graphifyDerivedTokens}t q=${r.graphifyDerivedQuality} | reduction=${r.reductionPct}% | gates ${r.qualityGate ? "Q+" : "Q-"} ${r.reductionGate ? "R+" : "R-"}`,
    );
  }
  console.log(`Overall: ${pass ? "PASS" : "FAIL"}`);
  console.log(`Reports: ${path.join(OUT_DIR, "local-pack-quality.md")}`);
  if (!pass) process.exitCode = 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
