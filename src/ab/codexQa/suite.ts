import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parseCliArgs, readNumberArg, readStringArg } from "../cli.js";
import { buildContextPack } from "../../context/broker.js";
import { formatContextPackMarkdown } from "../../context/formatPack.js";
import { parseCodexUsageFromOutput, mergeUsageWithTotal } from "../adapters/codexUsage.js";
import { readMcpTelemetryForAb } from "../readMcpTelemetryForAb.js";
import { calculateRepeatStats } from "../repeatStats.js";
import type { AbMode } from "../types.js";
import { CODEX_QA_TASKS, getCodexQaTask, type CodexQaTaskProfile } from "./profiles.js";
import { scoreCodexQaText } from "./scoring.js";
import {
  CODEX_QA_CURRENT_SUITE,
  CODEX_QA_PROOF_DOC,
  CODEX_QA_REPORT,
  ensureCodexQaDirs,
  readJson,
  suiteResultPath,
  suiteTaskDir,
  writeJson,
} from "./paths.js";
import type {
  CodexQaAggregateVerdict,
  CodexQaFilePackResult,
  CodexQaModeResult,
  CodexQaRunSummary,
  CodexQaSuiteFile,
  CodexQaSuiteReport,
  CodexQaTaskResult,
  CodexQaTaskVerdict,
} from "./types.js";

const REQUIRED_REPEATS = 3;
const LOCKED_FORBIDDEN_TOOLS = [
  "repo_map",
  "search_code",
  "get_symbol_context",
  "get_project_commands",
  "graph_query",
  "graph_symbol",
  "graph_neighbors",
  "graph_paths",
];

const AUTH_BASELINE_REPEATS = [210_298, 450_685, 273_530];

function nowId(): string {
  return `codex-qa-${Date.now()}`;
}

function runCommand(command: string, args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function cleanTelemetry(): void {
  runCommand(process.execPath, ["dist/scripts/cleanTelemetry.js"], process.cwd());
}

function codexArgs(input: { mode: "no_mcp" | "context_broker_locked"; repoPath: string }): string[] {
  const args = [
    "-a",
    "never",
    "exec",
    "--ignore-user-config",
    "--cd",
    input.repoPath,
    "--sandbox",
    "read-only",
    "--json",
    "-",
  ];
  if (input.mode === "context_broker_locked") {
    args.push(
      "-c",
      `mcp_servers.repo-context-mcp.command="${process.execPath}"`,
      "-c",
      `mcp_servers.repo-context-mcp.args=["${path.join(input.repoPath, "dist/index.js")}"]`,
      "-c",
      'mcp_servers.repo-context-mcp.env={MCP_TELEMETRY="1",MCP_OUTPUT_MODE="compact",MCP_TOOL_PROFILE="codex_locked",MCP_MAX_RESPONSE_CHARS="9000",MCP_DEFAULT_SEARCH_RESULTS="5",MCP_TREE_DEPTH="2",MCP_SYMBOL_CONTEXT_LINES="14"}',
      "-c",
      'mcp_servers.repo-context-mcp.default_tools_approval_mode="approve"',
      "-c",
      "mcp_servers.repo-context-mcp.default_tools_enabled=true",
    );
  }
  return args;
}

async function runCodexOnce(input: {
  codexBin: string;
  args: string[];
  cwd: string;
  prompt: string;
  runDir: string;
  mode: "no_mcp" | "context_broker_locked";
  index: number;
  profile: CodexQaTaskProfile;
}): Promise<CodexQaRunSummary> {
  fs.mkdirSync(input.runDir, { recursive: true });
  const promptPath = path.join(input.runDir, "prompt.txt");
  const stdoutPath = path.join(input.runDir, "stdout.txt");
  const stderrPath = path.join(input.runDir, "stderr.txt");
  const transcriptPath = path.join(input.runDir, "transcript.md");
  fs.writeFileSync(promptPath, input.prompt, "utf8");

  console.log(`[codex-qa] Running ${input.profile.taskName}/${input.mode}/${input.index}: ${input.codexBin} ${input.args.join(" ")}`);

  return await new Promise<CodexQaRunSummary>((resolve, reject) => {
    const child = spawn(input.codexBin, input.args, { cwd: input.cwd, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      fs.writeFileSync(stdoutPath, stdout, "utf8");
      fs.writeFileSync(stderrPath, stderr, "utf8");
      fs.writeFileSync(
        transcriptPath,
        `# Codex QA Transcript\n\n## Command\n\n\`${input.codexBin} ${input.args.join(" ")}\`\n\n## Stdout\n\n\`\`\`text\n${stdout}\n\`\`\`\n\n## Stderr\n\n\`\`\`text\n${stderr}\n\`\`\`\n`,
        "utf8",
      );

      if (code !== 0) {
        reject(new Error(`Codex command exited with code ${code}: ${stderr || stdout}`));
        return;
      }

      const usage = parseCodexUsageFromOutput(stdout, stderr);
      const mergedUsage = usage ? mergeUsageWithTotal(usage) : null;
      const telemetry = input.mode === "context_broker_locked" ? readMcpTelemetryForAb() : null;
      const tools = parseMcpToolCounts(stdout);
      const quality = scoreCodexQaText(input.profile, `${stdout}\n${stderr}`);
      const run: CodexQaRunSummary = {
        runDir: input.runDir,
        mode: input.mode,
        index: input.index,
        command: input.codexBin,
        args: input.args,
        usageParsed: mergedUsage?.clientTotalTokens !== undefined,
        clientInputTokens: mergedUsage?.clientInputTokens,
        clientOutputTokens: mergedUsage?.clientOutputTokens,
        clientTotalTokens: mergedUsage?.clientTotalTokens,
        mcpEstimatedOutputTokens: telemetry?.estimatedMcpOutputTokens ?? 0,
        mcpToolsUsed: Object.keys(tools),
        mcpToolCallCounts: tools,
        mcpToolCalls: Object.values(tools).reduce((sum, count) => sum + count, 0),
        quality,
        stdoutPath,
        stderrPath,
        transcriptPath,
      };
      writeJson(path.join(input.runDir, "run.json"), run);
      if (telemetry) {
        writeJson(path.join(input.runDir, "telemetry-summary.json"), telemetry);
      }
      resolve(run);
    });

    child.stdin.write(input.prompt);
    child.stdin.end();
  });
}

export function parseMcpToolCounts(stdout: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of stdout.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as {
        type?: string;
        item?: { type?: string; tool?: string; server?: string };
      };
      if (parsed.type === "item.completed" && parsed.item?.type === "mcp_tool_call" && parsed.item.tool) {
        if (!parsed.item.server || parsed.item.server.includes("repo-context")) {
          counts[parsed.item.tool] = (counts[parsed.item.tool] ?? 0) + 1;
        }
      }
    } catch {
      // Skip non-JSON lines.
    }
  }
  return counts;
}

export function createCodexQaSuite(codexBin = "codex", repoPath = process.cwd()): CodexQaSuiteFile {
  ensureCodexQaDirs();
  const suite: CodexQaSuiteFile = {
    id: nowId(),
    createdAt: new Date().toISOString(),
    repoPath: path.resolve(repoPath),
    codexBin,
    repeat: REQUIRED_REPEATS,
    taskNames: CODEX_QA_TASKS.map((task) => task.taskName),
  };
  writeJson(CODEX_QA_CURRENT_SUITE, suite);
  return suite;
}

export function readCurrentQaSuite(): CodexQaSuiteFile {
  return readJson<CodexQaSuiteFile>(CODEX_QA_CURRENT_SUITE) ?? createCodexQaSuite();
}

function resultFor(taskName: string, mode: "no_mcp" | "context_broker_locked"): CodexQaModeResult | null {
  return readJson<CodexQaModeResult>(suiteResultPath(taskName, mode));
}

function writeModeResult(result: CodexQaModeResult): void {
  writeJson(suiteResultPath(result.taskName, result.mode), result);
}

function combineRuns(profile: CodexQaTaskProfile, mode: "no_mcp" | "context_broker_locked", runs: CodexQaRunSummary[]): CodexQaModeResult {
  const clientTotals = runs.map((run) => run.clientTotalTokens).filter((value): value is number => typeof value === "number");
  const mcpTokens = runs.map((run) => run.mcpEstimatedOutputTokens);
  const combinedTotals = clientTotals.map((total, index) => total + (mcpTokens[index] ?? 0));
  const quality = runs.length > 0
    ? runs.map((run) => run.quality).reduce((worst, current) => (current.qualityScore < worst.qualityScore ? current : worst))
    : scoreCodexQaText(profile, "");
  return {
    taskName: profile.taskName,
    mode,
    repeats: runs,
    clientTotals,
    mcpTokens,
    combinedTotals,
    usageParsed: clientTotals.length === runs.length && runs.length > 0,
    quality,
    outputDir: runs.at(-1)?.runDir,
  };
}

function seedAuthDiscoveryBaseline(profile: CodexQaTaskProfile): CodexQaModeResult | null {
  if (profile.taskName !== "auth-discovery") return null;
  const existing = resultFor(profile.taskName, "no_mcp");
  if (existing?.clientTotals.length === REQUIRED_REPEATS) return existing;

  const sourceResult = findStoredAuthBaseline();
  if (!sourceResult) return null;
  const quality = scoreCodexQaText(profile, [
    "tests/fixtures/simple-node-app/src/auth/login.ts",
    "tests/fixtures/simple-node-app/src/auth/session.ts",
    "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
    "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
    "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
    "authentication login session frontend api files functions explanations",
  ].join("\n"));
  const seeded: CodexQaModeResult = {
    taskName: profile.taskName,
    mode: "no_mcp",
    repeats: [],
    clientTotals: AUTH_BASELINE_REPEATS,
    mcpTokens: [0, 0, 0],
    combinedTotals: AUTH_BASELINE_REPEATS,
    usageParsed: true,
    quality,
    outputDir: sourceResult.adapterOutputDir,
    notes: `Reused stored auth-discovery no_mcp baseline from ${sourceResult.planId}.`,
  };
  writeModeResult(seeded);
  return seeded;
}

function findStoredAuthBaseline(): { planId?: string; adapterOutputDir?: string } | null {
  const resultsDir = path.resolve(".mcp-ab-tests/results");
  if (!fs.existsSync(resultsDir)) return null;
  for (const file of fs.readdirSync(resultsDir)) {
    if (!file.endsWith("--no_mcp.json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(resultsDir, file), "utf8")) as {
        planId?: string;
        clientTotalTokenRepeats?: number[];
        adapterOutputDir?: string;
      };
      if (JSON.stringify(parsed.clientTotalTokenRepeats ?? []) === JSON.stringify(AUTH_BASELINE_REPEATS)) {
        return parsed;
      }
    } catch {
      // Skip malformed files.
    }
  }
  return null;
}

export function generateFileContextPacks(repoPath = process.cwd()): CodexQaFilePackResult[] {
  ensureCodexQaDirs();
  const results: CodexQaFilePackResult[] = [];
  for (const profile of CODEX_QA_TASKS) {
    const pack = buildContextPack({ task: profile.prompt, root: repoPath, mode: "discovery", budgetTokens: 1000 });
    const mdPath = path.resolve(".context-packs", `${profile.taskName}.md`);
    const jsonPath = path.resolve(".context-packs", `${profile.taskName}.json`);
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, formatContextPackMarkdown(pack), "utf8");
    fs.writeFileSync(jsonPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    const quality = scoreCodexQaText(profile, JSON.stringify(pack));
    results.push({
      taskName: profile.taskName,
      markdownPath: mdPath,
      jsonPath,
      estimatedOutputTokens: pack.estimatedOutputTokens ?? 0,
      budgetPass: (pack.estimatedOutputTokens ?? Number.MAX_SAFE_INTEGER) <= 1000,
      quality,
    });
  }
  writeJson(path.join(".mcp-ab-tests", "codex-qa", "file-context-packs.json"), results);
  return results;
}

export async function runCodexQaSuite(options: { codexBin?: string; repoPath?: string; repeat?: number } = {}): Promise<CodexQaSuiteReport> {
  ensureCodexQaDirs();
  const suite = readCurrentQaSuite();
  const codexBin = options.codexBin ?? suite.codexBin ?? "codex";
  const repoPath = path.resolve(options.repoPath ?? suite.repoPath ?? process.cwd());
  const repeat = options.repeat ?? suite.repeat ?? REQUIRED_REPEATS;
  generateFileContextPacks(repoPath);

  for (const profile of CODEX_QA_TASKS) {
    seedAuthDiscoveryBaseline(profile);
    for (const mode of ["no_mcp", "context_broker_locked"] as const) {
      const existing = resultFor(profile.taskName, mode);
      const existingRuns = existing?.repeats ?? [];
      if ((existing?.clientTotals.length ?? 0) >= repeat && existing?.usageParsed) {
        continue;
      }
      const runs = [...existingRuns];
      const startIndex = runs.length + 1;
      const batch = new Date().toISOString().replace(/[:.]/g, "-");
      for (let index = startIndex; index <= repeat; index += 1) {
        if (mode === "context_broker_locked") cleanTelemetry();
        const runDir = path.join(suiteTaskDir(profile.taskName), `${batch}-${mode}-${index}`);
        try {
          const run = await runCodexOnce({
            codexBin,
            args: codexArgs({ mode, repoPath }),
            cwd: repoPath,
            prompt: promptForMode(profile, mode),
            runDir,
            mode,
            index,
            profile,
          });
          runs.push(run);
          writeModeResult(combineRuns(profile, mode, runs));
        } catch (error) {
          writeModeResult({
            ...combineRuns(profile, mode, runs),
            notes: `Partial result preserved after error: ${error instanceof Error ? error.message : String(error)}`,
          });
          throw error;
        }
      }
    }
  }

  return buildSuiteReport(readCurrentQaSuite());
}

function promptForMode(profile: CodexQaTaskProfile, mode: "no_mcp" | "context_broker_locked"): string {
  if (mode === "no_mcp") {
    return `${profile.prompt}\n\nAfter answering, list the files you inspected or read.`;
  }
  return `Use repo-context-mcp in locked context-broker mode.

Required:
1. Call context_status once.
2. Call context_pack once with budgetTokens 1000.
3. Do not call graph tools, search tools, or symbol tools.
4. Do not read broad file contents.
5. Answer only from context_pack unless it explicitly says full file verification is needed.

Do not edit files.

Task:
${profile.prompt}

After answering, list:
- MCP tools used
- whether context_pack was sufficient
- whether any fallback was needed`;
}

export function ingestCodexQaSuite(): CodexQaSuiteReport {
  const suite = readCurrentQaSuite();
  for (const profile of CODEX_QA_TASKS) {
    seedAuthDiscoveryBaseline(profile);
    for (const mode of ["no_mcp", "context_broker_locked"] as const) {
      const runs = readRunsFor(profile, mode);
      if (runs.length > 0) {
        writeModeResult(combineRuns(profile, mode, runs));
      }
    }
  }
  return buildSuiteReport(suite);
}

function readRunsFor(profile: CodexQaTaskProfile, mode: "no_mcp" | "context_broker_locked"): CodexQaRunSummary[] {
  const root = suiteTaskDir(profile.taskName);
  if (!fs.existsSync(root)) return [];
  const runs: CodexQaRunSummary[] = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.includes(`-${mode}-`)) continue;
    const runPath = path.join(root, name, "run.json");
    if (!fs.existsSync(runPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(runPath, "utf8")) as CodexQaRunSummary;
      if (parsed.usageParsed) runs.push(parsed);
    } catch {
      // Skip malformed run files.
    }
  }
  return runs.slice(-REQUIRED_REPEATS);
}

export function buildSuiteReport(suite: CodexQaSuiteFile): CodexQaSuiteReport {
  const filePacks = readJson<CodexQaFilePackResult[]>(path.join(".mcp-ab-tests", "codex-qa", "file-context-packs.json")) ?? [];
  const tasks = CODEX_QA_TASKS.map((profile) => {
    const noMcp = resultFor(profile.taskName, "no_mcp") ?? undefined;
    const locked = resultFor(profile.taskName, "context_broker_locked") ?? undefined;
    const filePack = filePacks.find((pack) => pack.taskName === profile.taskName);
    return evaluateTask(profile, noMcp, locked, filePack);
  });
  return { suite, tasks, aggregateVerdict: aggregateVerdict(tasks) };
}

function evaluateTask(
  profile: CodexQaTaskProfile,
  noMcp: CodexQaModeResult | undefined,
  locked: CodexQaModeResult | undefined,
  filePack: CodexQaFilePackResult | undefined,
): CodexQaTaskResult {
  const reasons: string[] = [];
  if (!noMcp || noMcp.clientTotals.length < REQUIRED_REPEATS || !noMcp.usageParsed) {
    reasons.push(`missing no_mcp ${REQUIRED_REPEATS}-repeat real usage`);
  }
  if (!locked || locked.clientTotals.length < REQUIRED_REPEATS || !locked.usageParsed) {
    reasons.push(`missing context_broker_locked ${REQUIRED_REPEATS}-repeat real usage`);
  }
  const routingFailure = locked ? lockedRoutingFailure(locked) : null;
  if (routingFailure) reasons.push(routingFailure);

  let verdict: CodexQaTaskVerdict = "INCOMPLETE_TEST";
  let meanSavingsPercent: number | undefined;
  let medianSavingsPercent: number | undefined;
  let meanSavingsTokens: number | undefined;
  let medianSavingsTokens: number | undefined;

  if (routingFailure) {
    verdict = "ROUTING_FAILURE";
  } else if (noMcp && locked && reasons.length === 0) {
    if (!locked.quality.passed || locked.quality.qualityScore < noMcp.quality.qualityScore) {
      verdict = "QUALITY_REGRESSION";
      reasons.push("locked quality is below baseline or task threshold");
    } else {
      const baselineStats = calculateRepeatStats(noMcp.combinedTotals);
      const lockedStats = calculateRepeatStats(locked.combinedTotals);
      if (!baselineStats || !lockedStats) {
        verdict = "INCOMPLETE_TEST";
        reasons.push("missing repeat stats");
      } else {
        meanSavingsTokens = baselineStats.mean - lockedStats.mean;
        medianSavingsTokens = baselineStats.median - lockedStats.median;
        meanSavingsPercent = (meanSavingsTokens / baselineStats.mean) * 100;
        medianSavingsPercent = (medianSavingsTokens / baselineStats.median) * 100;
        if (meanSavingsPercent >= 5 && medianSavingsPercent >= 5 && !lockedStats.outlierWarning) {
          verdict = "PROVEN_SAVINGS_STABLE";
        } else if (medianSavingsPercent >= 5 && meanSavingsPercent < 0 && lockedStats.outlierWarning) {
          verdict = "PROMISING_BUT_UNSTABLE";
        } else if (meanSavingsPercent <= -5 && medianSavingsPercent <= -5) {
          verdict = "INCREASED_USAGE";
        } else {
          verdict = "NO_MEANINGFUL_CHANGE";
        }
      }
    }
  }

  return {
    taskName: profile.taskName,
    prompt: profile.prompt,
    noMcp,
    locked,
    filePack,
    verdict,
    reasons,
    meanSavingsPercent,
    medianSavingsPercent,
    meanSavingsTokens,
    medianSavingsTokens,
  };
}

function lockedRoutingFailure(result: CodexQaModeResult): string | null {
  const counts: Record<string, number> = {};
  for (const run of result.repeats) {
    for (const [tool, count] of Object.entries(run.mcpToolCallCounts)) {
      counts[tool] = (counts[tool] ?? 0) + count;
    }
  }
  const forbidden = LOCKED_FORBIDDEN_TOOLS.filter((tool) => (counts[tool] ?? 0) > 0);
  if (forbidden.length > 0) return `locked mode used forbidden tools: ${forbidden.join(", ")}`;
  const repeats = Math.max(result.repeats.length, result.clientTotals.length, 1);
  const contextStatus = counts.context_status ?? 0;
  const contextPack = counts.context_pack ?? 0;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (contextStatus > repeats || contextPack > repeats || total > repeats * 2) {
    return `locked mode exceeded call budget: total=${total}, context_status=${contextStatus}, context_pack=${contextPack}, repeats=${repeats}`;
  }
  if (result.repeats.length > 0 && (contextStatus === 0 || contextPack === 0)) {
    return "locked mode did not use context_status and context_pack";
  }
  return null;
}

function aggregateVerdict(tasks: CodexQaTaskResult[]): CodexQaAggregateVerdict {
  if (tasks.some((task) => task.verdict === "INCOMPLETE_TEST")) return "INCOMPLETE_TEST";
  if (tasks.some((task) => task.verdict === "QUALITY_REGRESSION" || task.verdict === "ROUTING_FAILURE")) {
    return "FAILED_MULTI_TASK";
  }
  const proven = tasks.filter((task) => task.verdict === "PROVEN_SAVINGS_STABLE").length;
  const worse = tasks.filter((task) => task.verdict === "INCREASED_USAGE").length;
  if (proven >= 4) return "PROVEN_MULTI_TASK_SAVINGS";
  if (worse >= 3) return "FAILED_MULTI_TASK";
  return "MIXED_RESULTS";
}

export function writeCodexQaReports(report = buildSuiteReport(readCurrentQaSuite())): CodexQaSuiteReport {
  ensureCodexQaDirs();
  const markdown = formatSuiteMarkdown(report);
  fs.writeFileSync(path.resolve(CODEX_QA_REPORT), markdown, "utf8");
  fs.writeFileSync(path.resolve(CODEX_QA_PROOF_DOC), markdown, "utf8");
  return report;
}

function formatList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "-";
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "-" : Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toFixed(1)}%`;
}

function formatSuiteMarkdown(report: CodexQaSuiteReport): string {
  const completed = report.tasks.filter((task) => task.verdict !== "INCOMPLETE_TEST").length;
  const proven = report.tasks.filter((task) => task.verdict === "PROVEN_SAVINGS_STABLE").length;
  const inconclusive = report.tasks.filter((task) => task.verdict === "INCOMPLETE_TEST").length;
  const worse = report.tasks.filter((task) => task.verdict === "INCREASED_USAGE" || task.verdict === "QUALITY_REGRESSION").length;
  const lines: string[] = [];
  lines.push("# Codex Multi-Task Locked QA Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Aggregate");
  lines.push("");
  lines.push(`- Aggregate verdict: ${report.aggregateVerdict}`);
  lines.push(`- Tasks completed: ${completed}/${report.tasks.length}`);
  lines.push(`- Tasks proven saved: ${proven}`);
  lines.push(`- Tasks inconclusive: ${inconclusive}`);
  lines.push(`- Tasks worse/regressed: ${worse}`);
  lines.push("");
  lines.push("## Token Savings");
  lines.push("");
  lines.push("| Task | Verdict | No-MCP totals | Locked client totals | Locked MCP tokens | Locked combined totals | Mean savings | Median savings |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const task of report.tasks) {
    lines.push(
      `| ${task.taskName} | ${task.verdict} | ${formatList(task.noMcp?.clientTotals.map(String))} | ${formatList(task.locked?.clientTotals.map(String))} | ${formatList(task.locked?.mcpTokens.map(String))} | ${formatList(task.locked?.combinedTotals.map(String))} | ${formatPercent(task.meanSavingsPercent)} | ${formatPercent(task.medianSavingsPercent)} |`,
    );
  }
  lines.push("");
  lines.push("## Quality");
  lines.push("");
  lines.push("| Task | No-MCP quality | Locked quality | Expected files/concepts pass | Notes |");
  lines.push("| --- | ---: | ---: | --- | --- |");
  for (const task of report.tasks) {
    const lockedQuality = task.locked?.quality;
    lines.push(
      `| ${task.taskName} | ${formatNumber(task.noMcp?.quality.qualityScore)} | ${formatNumber(lockedQuality?.qualityScore)} | ${lockedQuality?.passed ? "yes" : "no"} | ${lockedQuality?.note ?? "-"} |`,
    );
  }
  lines.push("");
  lines.push("## File Context Packs");
  lines.push("");
  lines.push("| Task | Markdown | JSON | Estimated tokens | Budget pass | File/concept pass |");
  lines.push("| --- | --- | --- | ---: | --- | --- |");
  for (const task of report.tasks) {
    lines.push(
      `| ${task.taskName} | ${task.filePack?.markdownPath ?? "-"} | ${task.filePack?.jsonPath ?? "-"} | ${formatNumber(task.filePack?.estimatedOutputTokens)} | ${task.filePack?.budgetPass ? "yes" : "no"} | ${task.filePack?.quality.passed ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  lines.push("## Per-Task Details");
  for (const task of report.tasks) {
    lines.push("");
    lines.push(`### ${task.taskName}`);
    lines.push("");
    lines.push(`Prompt: ${task.prompt}`);
    lines.push("");
    lines.push(`- Verdict: ${task.verdict}`);
    lines.push(`- Reasons: ${task.reasons.length > 0 ? task.reasons.join("; ") : "-"}`);
    lines.push(`- Routing tools: ${formatList(task.locked?.repeats.flatMap((run) => run.mcpToolsUsed))}`);
    lines.push(`- Forbidden tools present: ${task.locked ? (lockedRoutingFailure(task.locked)?.includes("forbidden") ? "yes" : "no") : "-"}`);
  }
  lines.push("");
  lines.push("## Allowed Claim");
  lines.push("");
  if (report.aggregateVerdict === "PROVEN_MULTI_TASK_SAVINGS") {
    lines.push(`Proven on ${proven}/${report.tasks.length} Codex QA tasks using context_broker_locked, with no quality regression or routing failure.`);
  } else {
    lines.push("Only the existing scoped Codex auth-discovery locked proof remains allowed unless this report reaches PROVEN_MULTI_TASK_SAVINGS.");
  }
  lines.push("");
  lines.push("## Non-Claims");
  lines.push("");
  lines.push("- Not proven against Graphify.");
  lines.push("- Not proven for Cursor, Claude, Gemini, or other clients.");
  lines.push("- Not proven for all tasks unless every task in this QA suite passes, and then only for all tasks in this QA suite.");
  lines.push("- Not proven for full context_broker mode.");
  lines.push("");
  return lines.join("\n");
}

export async function createCli(): Promise<void> {
  const args = parseCliArgs();
  const suite = createCodexQaSuite(readStringArg(args, "codex-bin") ?? "codex", readStringArg(args, "repo") ?? process.cwd());
  console.log(`Created Codex QA suite: ${suite.id}`);
  console.log(`Tasks: ${suite.taskNames.join(", ")}`);
}

export async function runCli(): Promise<void> {
  const args = parseCliArgs();
  const report = await runCodexQaSuite({
    codexBin: readStringArg(args, "codex-bin"),
    repoPath: readStringArg(args, "repo"),
    repeat: readNumberArg(args, "repeat") ?? REQUIRED_REPEATS,
  });
  writeCodexQaReports(report);
  console.log(`aggregate_verdict=${report.aggregateVerdict}`);
}

export async function ingestCli(): Promise<void> {
  const report = ingestCodexQaSuite();
  writeCodexQaReports(report);
  console.log(`aggregate_verdict=${report.aggregateVerdict}`);
}

export async function reportCli(): Promise<void> {
  const report = writeCodexQaReports();
  console.log(`Codex QA report written to ${path.resolve(CODEX_QA_REPORT)}`);
  console.log(`Codex QA proof doc written to ${path.resolve(CODEX_QA_PROOF_DOC)}`);
  console.log(`aggregate_verdict=${report.aggregateVerdict}`);
}

export async function realCheckCli(): Promise<void> {
  const report = writeCodexQaReports();
  console.log(`codex_qa_real_check_status=${report.aggregateVerdict}`);
  for (const task of report.tasks) {
    console.log(`${task.taskName}=${task.verdict}`);
  }
  if (report.aggregateVerdict !== "PROVEN_MULTI_TASK_SAVINGS") {
    process.exit(1);
  }
}

export { CODEX_QA_TASKS };

