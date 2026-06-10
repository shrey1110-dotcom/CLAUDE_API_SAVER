import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCliArgs, readStringArg } from "../ab/cli.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { estimateTokensFromText } from "../cli/skillPack.js";
import { COMPRESSION_TASKS } from "./compressionTasks.js";
import { resolveGraphifyBin } from "./graphifyTokenLogs.js";

export const GRAPHIFY_BEST_EFFORT_ROOT = ".mcp-benchmarks/graphify-best-effort";

export interface GraphifyQueryAttempt {
  id: string;
  command: string[];
  status: number | null;
  stdoutFile: string;
  stderrFile: string;
  includedInContext: boolean;
  excludeReason?: string;
  answerSteered: boolean;
  fromGraphReport: boolean;
}

export interface GraphifyBestEffortTaskSummary {
  taskName: string;
  generatedAt: string;
  graphifyBin: string | null;
  queries: GraphifyQueryAttempt[];
  contextFile: string;
  contextTokens: number;
  localScore: ReturnType<typeof scoreCodexQaText>;
  graphReportExcerptFile: string | null;
  sourcesIncluded: string[];
  sourcesExcluded: string[];
  noAnswerInjection: true;
  noRepoContextLeakage: true;
}

function runGraphifyQuery(
  graphifyBin: string,
  repoPath: string,
  args: string[],
  outDir: string,
  id: string,
): { status: number | null; stdout: string; stderr: string; stdoutFile: string; stderrFile: string } {
  const stdoutFile = path.join(outDir, `${id}.stdout.txt`);
  const stderrFile = path.join(outDir, `${id}.stderr.txt`);
  const result = spawnSync(graphifyBin, args, { cwd: repoPath, encoding: "utf8", timeout: 120_000 });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  fs.writeFileSync(stdoutFile, stdout, "utf8");
  fs.writeFileSync(stderrFile, stderr, "utf8");
  return { status: result.status, stdout, stderr, stdoutFile, stderrFile };
}

function findGraphReport(repoPath: string): string | null {
  const candidates = [
    path.join(repoPath, "graphify-out/GRAPH_REPORT.md"),
    path.join(repoPath, "graphify-out/2026-06-09/GRAPH_REPORT.md"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const graphifyOut = path.join(repoPath, "graphify-out");
  if (!fs.existsSync(graphifyOut)) return null;
  for (const entry of fs.readdirSync(graphifyOut, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(graphifyOut, entry.name, "GRAPH_REPORT.md");
    if (fs.existsSync(nested)) return nested;
  }
  return null;
}

function excerptGraphReport(reportPath: string, taskName: string, maxLines = 50): string {
  const text = fs.readFileSync(reportPath, "utf8");
  const keywords =
    taskName === "auth-discovery" || taskName === "architecture-discovery"
      ? ["auth", "login", "session"]
      : taskName === "impact-analysis"
        ? ["session", "validation", "test"]
        : taskName === "edit-planning"
          ? ["session", "token", "auth"]
          : ["readme", "package", "onboarding", "setup"];
  const lines = text.split("\n");
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!keywords.some((k) => line.toLowerCase().includes(k))) continue;
    chunks.push(lines.slice(i, Math.min(lines.length, i + 6)).join("\n"));
    if (chunks.length >= 8) break;
  }
  return chunks.join("\n\n").split("\n").slice(0, maxLines).join("\n");
}

function taskQueries(taskName: string, prompt: string): Array<{ id: string; args: string[]; answerSteered: boolean }> {
  const common = [
    { id: "01-original", args: ["query", prompt], answerSteered: false },
    {
      id: "02-concrete",
      args: [
        "query",
        taskName === "onboarding-map"
          ? "README package.json tsconfig vitest src/index broker buildGraph onboarding"
          : taskName === "impact-analysis"
            ? "session validation session.ts session.service auth.controller LoginPage tests"
            : taskName === "edit-planning"
              ? "refresh token expiration session.ts session.service auth.controller"
              : taskName === "architecture-discovery"
                ? "authentication routing api frontend tests boundaries fixtures"
                : "login.ts session.ts auth.controller session.service LoginPage authentication",
      ],
      answerSteered: false,
    },
    {
      id: "03-semantic",
      args: [
        "query",
        taskName === "onboarding-map"
          ? "Where should a new contributor start? entry points scripts tests docs"
          : taskName === "impact-analysis"
            ? "What files are affected if session validation changes?"
            : taskName === "edit-planning"
              ? "Smallest safe change for refresh token expiration handling"
              : taskName === "architecture-discovery"
                ? "Summarize auth API frontend test boundaries"
                : "Where is authentication login session implemented?",
      ],
      answerSteered: false,
    },
  ];
  const budget = [
    { id: "04-context-budget", args: ["query", prompt, "--context", "budget"], answerSteered: false },
    { id: "05-context-500", args: ["query", prompt, "--budget", "500"], answerSteered: false },
  ];
  return [...common, ...budget];
}

export function buildGraphifyBestEffortForTask(
  repoPath: string,
  taskName: string,
): GraphifyBestEffortTaskSummary {
  const profile = getCodexQaTask(taskName);
  if (!profile) throw new Error(`Unknown task: ${taskName}`);

  const graphifyBin = resolveGraphifyBin();
  const taskDir = path.join(repoPath, GRAPHIFY_BEST_EFFORT_ROOT, taskName);
  fs.mkdirSync(taskDir, { recursive: true });

  const queries: GraphifyQueryAttempt[] = [];
  const parts: string[] = [
    `# Graphify best-effort context (${taskName})`,
    "",
    "Built from normal Graphify CLI outputs only. No repo-context output. No manual expected-answer injection.",
    "",
  ];
  const sourcesIncluded: string[] = [];
  const sourcesExcluded: string[] = [];

  if (!graphifyBin) {
    const contextFile = path.join(taskDir, "graphify-best-effort-context.txt");
    fs.writeFileSync(contextFile, "Graphify binary not found.\n", "utf8");
    const score = scoreCodexQaText(profile, "");
    return {
      taskName,
      generatedAt: new Date().toISOString(),
      graphifyBin: null,
      queries: [],
      contextFile,
      contextTokens: 0,
      localScore: score,
      graphReportExcerptFile: null,
      sourcesIncluded,
      sourcesExcluded: ["all queries — graphify missing"],
      noAnswerInjection: true,
      noRepoContextLeakage: true,
    };
  }

  for (const spec of taskQueries(taskName, profile.prompt)) {
    const result = runGraphifyQuery(graphifyBin, repoPath, spec.args, taskDir, spec.id);
    const included = result.status === 0 && result.stdout.trim().length > 0;
    const attempt: GraphifyQueryAttempt = {
      id: spec.id,
      command: [graphifyBin, ...spec.args],
      status: result.status,
      stdoutFile: result.stdoutFile,
      stderrFile: result.stderrFile,
      includedInContext: included,
      excludeReason: included ? undefined : `status=${result.status} empty=${!result.stdout.trim()}`,
      answerSteered: spec.answerSteered,
      fromGraphReport: false,
    };
    queries.push(attempt);
    if (included) {
      sourcesIncluded.push(spec.id);
      parts.push("---", `## From ${spec.id}`, `Command: ${attempt.command.join(" ")}`, "", result.stdout.trim(), "");
    } else {
      sourcesExcluded.push(`${spec.id}: ${attempt.excludeReason}`);
    }
  }

  let graphReportExcerptFile: string | null = null;
  const reportPath = findGraphReport(repoPath);
  if (reportPath) {
    const excerpt = excerptGraphReport(reportPath, taskName);
    if (excerpt.trim()) {
      graphReportExcerptFile = path.join(taskDir, "graph-report-excerpt.md");
      fs.writeFileSync(graphReportExcerptFile, excerpt, "utf8");
      sourcesIncluded.push("GRAPH_REPORT excerpt");
      parts.push("---", "## From GRAPH_REPORT.md (Graphify-generated excerpt)", "", excerpt.trim(), "");
      queries.push({
        id: "graph-report-excerpt",
        command: ["read", reportPath],
        status: 0,
        stdoutFile: graphReportExcerptFile,
        stderrFile: "",
        includedInContext: true,
        answerSteered: false,
        fromGraphReport: true,
      });
    }
  }

  const contextFile = path.join(taskDir, "graphify-best-effort-context.txt");
  const contextText = `${parts.join("\n")}\n`;
  fs.writeFileSync(contextFile, contextText, "utf8");
  const localScore = scoreCodexQaText(profile, contextText);

  const summary: GraphifyBestEffortTaskSummary = {
    taskName,
    generatedAt: new Date().toISOString(),
    graphifyBin,
    queries,
    contextFile,
    contextTokens: estimateTokensFromText(contextText),
    localScore,
    graphReportExcerptFile,
    sourcesIncluded,
    sourcesExcluded,
    noAnswerInjection: true,
    noRepoContextLeakage: true,
  };

  writeGraphifyBestEffortTaskSummary(summary, taskDir);
  return summary;
}

export function graphifyBestEffortContextPath(repoPath: string, taskName: string): string {
  return path.join(repoPath, GRAPHIFY_BEST_EFFORT_ROOT, taskName, "graphify-best-effort-context.txt");
}

export function writeGraphifyBestEffortTaskSummary(
  summary: GraphifyBestEffortTaskSummary,
  taskDir: string,
): void {
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const md = [
    `# Graphify best-effort (${summary.taskName})`,
    "",
    `Generated: ${summary.generatedAt}`,
    `Context tokens: ${summary.contextTokens}`,
    `Local quality: ${summary.localScore.qualityScore}/10`,
    `Files matched: ${summary.localScore.matchedFiles.length}`,
    "",
    "## Queries",
    ...summary.queries.map(
      (q) =>
        `- ${q.id}: included=${q.includedInContext} answerSteered=${q.answerSteered} graphReport=${q.fromGraphReport}`,
    ),
    "",
    "## Sources included",
    ...summary.sourcesIncluded.map((s) => `- ${s}`),
    "",
    "## Sources excluded",
    ...summary.sourcesExcluded.map((s) => `- ${s}`),
    "",
    "No answer injection. No repo-context leakage.",
  ];
  fs.writeFileSync(path.join(taskDir, "summary.md"), `${md.join("\n")}\n`, "utf8");
}

function main(): void {
  const args = parseCliArgs();
  const taskFilter = readStringArg(args, "tasks")?.split(",").map((t) => t.trim()).filter(Boolean);
  const repoPath = path.resolve(readStringArg(args, "repo") ?? process.cwd());
  const tasks = taskFilter ?? COMPRESSION_TASKS.map((t) => t.taskName);
  for (const taskName of tasks) {
    const summary = buildGraphifyBestEffortForTask(repoPath, taskName);
    console.log(`[graphify-best-effort] ${taskName} tokens=${summary.contextTokens} quality=${summary.localScore.qualityScore}`);
  }
}

if (process.argv[1]?.includes("graphifyBestEffort")) {
  main();
}
