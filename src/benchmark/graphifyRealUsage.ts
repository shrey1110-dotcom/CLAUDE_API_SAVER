import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseCliArgs, readNumberArg, readStringArg } from "../ab/cli.js";
import { mergeUsageWithTotal, parseCodexUsageFromOutput } from "../ab/adapters/codexUsage.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";
import { calculateRepeatStats } from "../ab/repeatStats.js";

export const GRAPHIFY_REAL_RUNS_DIR = ".mcp-benchmarks/graphify-real-runs/auth-discovery";
export const GRAPHIFY_AUTH_OUTPUT = ".mcp-benchmarks/graphify-auth-output.txt";
const DEFAULT_CODEX_BIN =
  "/Users/shreyanshsharma/.vscode/extensions/openai.chatgpt-26.602.71036-darwin-arm64/bin/macos-aarch64/codex";
const REQUIRED_REPEATS = 3;

export interface GraphifyCodexRepeatResult {
  repeat: number;
  runDir: string;
  clientInputTokens?: number;
  clientOutputTokens?: number;
  clientTotalTokens?: number;
  usageParsed: boolean;
  qualityScore: number;
  matchedFiles: string[];
  missingFiles: string[];
  matchedConcepts: string[];
  missingConcepts: string[];
  mcpToolsDetected: boolean;
  exitCode: number | null;
  note: string;
}

export interface GraphifyRealUsageSummary {
  generatedAt: string;
  taskName: "auth-discovery";
  measuredClient: "codex";
  codexBin: string;
  codexVersion?: string;
  graphifyContextFile: string;
  repeats: GraphifyCodexRepeatResult[];
  clientTotals: number[];
  qualityScores: number[];
  stats?: ReturnType<typeof calculateRepeatStats>;
  allUsageParsed: boolean;
  incomplete: boolean;
  incompleteReason?: string;
}

function codexArgs(repoPath: string): string[] {
  return ["-a", "never", "exec", "--ignore-user-config", "--cd", repoPath, "--sandbox", "read-only", "--json", "-"];
}

export function buildGraphifyCodexPrompt(graphifyOutput: string): string {
  return `You are evaluating this repo using Graphify context only.

Task:
Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.

Use the Graphify query result below as your primary context source. Do not use repo-context-mcp. Do not use MCP tools. Do not edit files. Do not browse or search raw repo files unless absolutely necessary. If the Graphify context is insufficient, say what is missing rather than guessing.

Graphify query result:
${graphifyOutput}

Answer with:
- exact files
- functions/symbols if present
- why each matters
- any missing context or uncertainty`;
}

export function extractCodexAnswerText(stdout: string, stderr: string): string {
  const parts: string[] = [];
  for (const line of `${stdout}\n${stderr}`.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        item?: { type?: string; text?: string; aggregated_output?: string };
      };
      if (parsed.type === "item.completed" && parsed.item?.type === "agent_message" && parsed.item.text) {
        parts.push(parsed.item.text);
      }
      if (parsed.type === "item.completed" && parsed.item?.type === "command_execution" && parsed.item.aggregated_output) {
        parts.push(parsed.item.aggregated_output);
      }
    } catch {
      // Skip non-JSON lines.
    }
  }
  if (parts.length > 0) return parts.join("\n\n");
  return `${stdout}\n${stderr}`;
}

export function detectMcpToolsInOutput(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return (
    combined.includes("mcp_tool_call") ||
    combined.includes("repo-context-mcp") ||
    combined.includes("context_pack") ||
    combined.includes("context_status")
  );
}

async function runCodexOnce(input: {
  codexBin: string;
  repoPath: string;
  prompt: string;
  runDir: string;
  repeat: number;
}): Promise<GraphifyCodexRepeatResult> {
  const profile = getCodexQaTask("auth-discovery");
  if (!profile) throw new Error("auth-discovery profile missing");

  fs.mkdirSync(input.runDir, { recursive: true });
  const promptPath = path.join(input.runDir, "prompt.txt");
  const stdoutPath = path.join(input.runDir, "stdout.txt");
  const stderrPath = path.join(input.runDir, "stderr.txt");
  fs.writeFileSync(promptPath, input.prompt, "utf8");

  const args = codexArgs(input.repoPath);
  const startedAt = new Date().toISOString();

  return await new Promise((resolve, reject) => {
    const child = spawn(input.codexBin, args, { cwd: input.repoPath, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.stdin.write(input.prompt);
    child.stdin.end();
    child.on("close", (code) => {
      fs.writeFileSync(stdoutPath, stdout, "utf8");
      fs.writeFileSync(stderrPath, stderr, "utf8");

      const usage = parseCodexUsageFromOutput(stdout, stderr);
      const merged = usage ? mergeUsageWithTotal(usage) : null;
      const answerText = extractCodexAnswerText(stdout, stderr);
      const quality = scoreCodexQaText(profile, answerText);
      const mcpToolsDetected = detectMcpToolsInOutput(stdout, stderr);

      const result: GraphifyCodexRepeatResult = {
        repeat: input.repeat,
        runDir: input.runDir,
        clientInputTokens: merged?.clientInputTokens,
        clientOutputTokens: merged?.clientOutputTokens,
        clientTotalTokens: merged?.clientTotalTokens,
        usageParsed: merged?.clientTotalTokens !== undefined,
        qualityScore: quality.qualityScore,
        matchedFiles: quality.matchedFiles,
        missingFiles: quality.missingFiles,
        matchedConcepts: quality.matchedConcepts,
        missingConcepts: quality.missingConcepts,
        mcpToolsDetected,
        exitCode: code,
        note: quality.note,
      };

      fs.writeFileSync(
        path.join(input.runDir, "metadata.json"),
        `${JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), args, exitCode: code, usageParsed: result.usageParsed, mcpToolsDetected }, null, 2)}\n`,
        "utf8",
      );
      fs.writeFileSync(path.join(input.runDir, "usage.json"), `${JSON.stringify(merged ?? {}, null, 2)}\n`, "utf8");
      fs.writeFileSync(path.join(input.runDir, "quality.json"), `${JSON.stringify(quality, null, 2)}\n`, "utf8");

      if (code !== 0) {
        reject(new Error(`Codex repeat ${input.repeat} exited ${code}`));
        return;
      }
      if (!result.usageParsed) {
        reject(new Error(`Codex repeat ${input.repeat} usage not parsed`));
        return;
      }
      resolve(result);
    });
  });
}

export function summarizeGraphifyRealRuns(
  runsRoot = GRAPHIFY_REAL_RUNS_DIR,
  codexBin = DEFAULT_CODEX_BIN,
): GraphifyRealUsageSummary {
  const profile = getCodexQaTask("auth-discovery");
  if (!profile) throw new Error("auth-discovery profile missing");

  const repeats: GraphifyCodexRepeatResult[] = [];
  for (let repeat = 1; repeat <= REQUIRED_REPEATS; repeat += 1) {
    const runDir = path.join(runsRoot, `repeat-${repeat}`);
    const stdoutPath = path.join(runDir, "stdout.txt");
    const stderrPath = path.join(runDir, "stderr.txt");
    if (!fs.existsSync(stdoutPath)) continue;

    const stdout = fs.readFileSync(stdoutPath, "utf8");
    const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, "utf8") : "";
    const usage = parseCodexUsageFromOutput(stdout, stderr);
    const merged = usage ? mergeUsageWithTotal(usage) : null;
    const answerText = extractCodexAnswerText(stdout, stderr);
    const quality = scoreCodexQaText(profile, answerText);
    const metadataPath = path.join(runDir, "metadata.json");
    const metadata = fs.existsSync(metadataPath)
      ? (JSON.parse(fs.readFileSync(metadataPath, "utf8")) as { exitCode?: number | null; mcpToolsDetected?: boolean })
      : {};

    repeats.push({
      repeat,
      runDir,
      clientInputTokens: merged?.clientInputTokens,
      clientOutputTokens: merged?.clientOutputTokens,
      clientTotalTokens: merged?.clientTotalTokens,
      usageParsed: merged?.clientTotalTokens !== undefined,
      qualityScore: quality.qualityScore,
      matchedFiles: quality.matchedFiles,
      missingFiles: quality.missingFiles,
      matchedConcepts: quality.matchedConcepts,
      missingConcepts: quality.missingConcepts,
      mcpToolsDetected: metadata.mcpToolsDetected ?? detectMcpToolsInOutput(stdout, stderr),
      exitCode: metadata.exitCode ?? null,
      note: quality.note,
    });
  }

  const clientTotals = repeats.filter((r) => r.usageParsed).map((r) => r.clientTotalTokens!);
  const qualityScores = repeats.map((r) => r.qualityScore);
  const allUsageParsed = repeats.length === REQUIRED_REPEATS && repeats.every((r) => r.usageParsed);
  let incomplete = !allUsageParsed;
  let incompleteReason: string | undefined;
  if (repeats.length < REQUIRED_REPEATS) {
    incomplete = true;
    incompleteReason = `Expected ${REQUIRED_REPEATS} repeats, found ${repeats.length}.`;
  } else if (!allUsageParsed) {
    incomplete = true;
    incompleteReason = "One or more repeats missing parsed Codex usage.";
  }

  return {
    generatedAt: new Date().toISOString(),
    taskName: "auth-discovery",
    measuredClient: "codex",
    codexBin,
    graphifyContextFile: GRAPHIFY_AUTH_OUTPUT,
    repeats,
    clientTotals,
    qualityScores,
    stats: calculateRepeatStats(clientTotals),
    allUsageParsed,
    incomplete,
    incompleteReason,
  };
}

export function writeGraphifyRealUsageSummary(summary: GraphifyRealUsageSummary, runsRoot = GRAPHIFY_REAL_RUNS_DIR): {
  jsonPath: string;
  mdPath: string;
} {
  const jsonPath = path.join(runsRoot, "summary.json");
  const mdPath = path.join(runsRoot, "summary.md");
  const lines = [
    "# Graphify-arm Codex real usage summary",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    `- Task: ${summary.taskName}`,
    `- Measured client: ${summary.measuredClient}`,
    `- Codex binary: ${summary.codexBin}`,
    `- Graphify context: ${summary.graphifyContextFile}`,
    `- Repeats: ${summary.repeats.length}`,
    `- All usage parsed: ${summary.allUsageParsed ? "yes" : "no"}`,
    summary.incompleteReason ? `- Incomplete reason: ${summary.incompleteReason}` : "",
    "",
    "## Repeats",
    "",
    "| Repeat | Client total | Quality | Files | MCP detected |",
    "| --- | ---: | ---: | --- | --- |",
    ...summary.repeats.map(
      (r) =>
        `| ${r.repeat} | ${r.clientTotalTokens ?? "n/a"} | ${r.qualityScore}/10 | ${r.matchedFiles.length}/5 | ${r.mcpToolsDetected ? "yes" : "no"} |`,
    ),
    "",
    "## Totals",
    "",
    `- Client totals: ${summary.clientTotals.join(", ") || "n/a"}`,
    `- Quality scores: ${summary.qualityScores.join(", ") || "n/a"}`,
    summary.stats
      ? `- Mean / median client tokens: ${summary.stats.mean} / ${summary.stats.median}`
      : "- Mean / median client tokens: n/a",
    "",
    "Graphify-arm Codex runs use Graphify context in the prompt only (no repo-context-mcp MCP). Compare against existing repo-context locked combined totals via `benchmark:graphify-head-to-head`.",
    "",
  ];
  fs.mkdirSync(runsRoot, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${lines.filter((l) => l !== "").join("\n")}\n`, "utf8");
  return { jsonPath, mdPath };
}

export async function runGraphifyCodexRepeats(options: {
  codexBin?: string;
  repoPath?: string;
  graphifyOutputFile?: string;
  runsRoot?: string;
  repeats?: number;
}): Promise<GraphifyRealUsageSummary> {
  const repoPath = path.resolve(options.repoPath ?? process.cwd());
  const codexBin = options.codexBin ?? DEFAULT_CODEX_BIN;
  const graphifyOutputFile = path.resolve(repoPath, options.graphifyOutputFile ?? GRAPHIFY_AUTH_OUTPUT);
  const runsRoot = path.resolve(repoPath, options.runsRoot ?? GRAPHIFY_REAL_RUNS_DIR);
  const repeats = options.repeats ?? REQUIRED_REPEATS;

  if (!fs.existsSync(graphifyOutputFile)) {
    throw new Error(`Graphify output file not found: ${graphifyOutputFile}`);
  }
  const graphifyOutput = fs.readFileSync(graphifyOutputFile, "utf8");
  const prompt = buildGraphifyCodexPrompt(graphifyOutput);

  for (let index = 1; index <= repeats; index += 1) {
    const runDir = path.join(runsRoot, `repeat-${index}`);
    console.log(`[graphify-real-usage] Running Codex repeat ${index}/${repeats}`);
    await runCodexOnce({ codexBin, repoPath, prompt, runDir, repeat: index });
  }

  const summary = summarizeGraphifyRealRuns(runsRoot, codexBin);
  writeGraphifyRealUsageSummary(summary, runsRoot);
  return summary;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const mode = readStringArg(args, "mode") ?? "run";
  const codexBin = readStringArg(args, "codex-bin") ?? DEFAULT_CODEX_BIN;
  const runsRoot = path.resolve(readStringArg(args, "runs-root") ?? GRAPHIFY_REAL_RUNS_DIR);

  if (mode === "summarize") {
    const summary = summarizeGraphifyRealRuns(runsRoot, codexBin);
    const { jsonPath, mdPath } = writeGraphifyRealUsageSummary(summary, runsRoot);
    console.log(`summary_json=${jsonPath}`);
    console.log(`summary_md=${mdPath}`);
    console.log(`incomplete=${summary.incomplete}`);
    if (summary.incomplete) process.exit(1);
    return;
  }

  const summary = await runGraphifyCodexRepeats({
    codexBin,
    repoPath: readStringArg(args, "repo"),
    graphifyOutputFile: readStringArg(args, "graphify-output-file"),
    runsRoot,
    repeats: readNumberArg(args, "repeat") ?? REQUIRED_REPEATS,
  });
  const { jsonPath, mdPath } = writeGraphifyRealUsageSummary(summary, runsRoot);
  console.log(`summary_json=${jsonPath}`);
  console.log(`summary_md=${mdPath}`);
  console.log(`client_totals=${summary.clientTotals.join(",")}`);
  console.log(`quality_scores=${summary.qualityScores.join(",")}`);
  if (summary.incomplete) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
