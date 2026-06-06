import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  scoreAuthDiscoveryAnswer,
  extractMcpToolsFromClaudeTranscript,
  AUTH_DISCOVERY_TASK,
} from "../authDiscoveryQuality.js";
import { asMode, parseCliArgs, readBooleanArg, readNumberArg, readStringArg } from "../cli.js";
import {
  AB_CLAUDE_ADAPTER_CONFIG,
  AB_CLAUDE_RUNS_DIR,
  ensureAbDirectories,
  readCurrentPlan,
  readJsonFile,
  resolveAbPath,
  resultFilePath,
  writeJsonFile,
} from "../paths.js";
import { getModePrompt } from "../prompts.js";
import { readMcpTelemetryForAb } from "../readMcpTelemetryForAb.js";
import type { AbRunResult } from "../types.js";
import { isClaudeSpawnError, printClaudeNotFoundHints } from "./claudeCliSupport.js";
import { LOCKED_CLAUDE_CONFIG, NO_MCP_CLAUDE_CONFIG } from "./claudeCliSupport.js";
import { mergeClaudeUsageWithTotal, parseClaudeUsageFromOutput } from "./claudeUsage.js";
import type { ClaudeAdapterConfig } from "./types.js";

interface ClaudeRunData {
  runDir: string;
  promptPath: string;
  configPath: string;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  usageParsed: boolean;
  parsedUsage: ReturnType<typeof mergeClaudeUsageWithTotal> | null;
}

function isClaudeAdapterEnabled(): boolean {
  return process.env.AB_ENABLE_CLAUDE_ADAPTER === "1";
}

function usage(): string {
  return [
    "Usage:",
    "  npm run ab:claude -- --mode <no_mcp|context_broker_locked> --repo <path> --yes",
    "Optional:",
    "  --task auth-discovery --repeat <n> --claude-bin <bin> --config <configPath> --out <dir>",
    "Safety:",
    "  Requires AB_ENABLE_CLAUDE_ADAPTER=1 and --yes.",
    "  Does not mutate global Claude config.",
  ].join("\n");
}

function defaultAdapterConfig(): ClaudeAdapterConfig {
  return {
    claudeBin: "claude",
    baseArgs: [],
    promptArgMode: "stdin",
    configArgs: [],
    cwd: "{repoPath}",
  };
}

function loadClaudeAdapterConfig(): ClaudeAdapterConfig {
  const config = readJsonFile<Partial<ClaudeAdapterConfig>>(AB_CLAUDE_ADAPTER_CONFIG);
  if (!config) return defaultAdapterConfig();
  const merged = { ...defaultAdapterConfig(), ...config };
  if (!merged.claudeBin || !Array.isArray(merged.baseArgs) || !Array.isArray(merged.configArgs)) {
    throw new Error(`Invalid Claude adapter config at ${resolveAbPath(AB_CLAUDE_ADAPTER_CONFIG)}.`);
  }
  return merged;
}

function cleanTelemetryLogs(): void {
  spawnSync("node", ["dist/scripts/cleanTelemetry.js"], { stdio: "ignore" });
}

function saveTelemetrySnapshot(runDir: string): ReturnType<typeof readMcpTelemetryForAb> {
  const telemetry = readMcpTelemetryForAb();
  if (telemetry) {
    fs.writeFileSync(path.join(runDir, "telemetry-summary.json"), `${JSON.stringify(telemetry, null, 2)}\n`, "utf8");
  }
  return telemetry;
}

function formatTemplated(value: string, vars: Record<string, string>): string {
  let out = value;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, val);
  }
  return out;
}

async function runOnce(input: {
  command: string;
  args: string[];
  cwd: string;
  prompt: string;
  runDir: string;
  promptPath: string;
  configPath: string;
  promptArgMode: ClaudeAdapterConfig["promptArgMode"];
}): Promise<ClaudeRunData> {
  console.log(`[ab:claude] Running: ${input.command} ${input.args.join(" ")}`);
  return await new Promise<ClaudeRunData>((resolve, reject) => {
    const child = spawn(input.command, input.args, { cwd: input.cwd, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (isClaudeSpawnError(error)) {
        printClaudeNotFoundHints(input.command);
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Claude command exited with code ${code}`));
        return;
      }
      const parsed = parseClaudeUsageFromOutput(stdout, stderr);
      const usage = parsed ? mergeClaudeUsageWithTotal(parsed) : null;
      fs.writeFileSync(path.join(input.runDir, "stdout.txt"), stdout, "utf8");
      fs.writeFileSync(path.join(input.runDir, "stderr.txt"), stderr, "utf8");
      fs.writeFileSync(
        path.join(input.runDir, "transcript.md"),
        `# Claude Run Transcript\n\n## Command\n\n\`${input.command} ${input.args.join(" ")}\`\n\n## Stdout\n\n\`\`\`text\n${stdout}\n\`\`\`\n\n## Stderr\n\n\`\`\`text\n${stderr}\n\`\`\`\n`,
        "utf8",
      );
      resolve({
        runDir: input.runDir,
        promptPath: input.promptPath,
        configPath: input.configPath,
        command: input.command,
        args: input.args,
        stdout,
        stderr,
        usageParsed: usage !== null,
        parsedUsage: usage,
      });
    });

    if (input.promptArgMode === "stdin") {
      if (!child.stdin.destroyed) {
        child.stdin.write(input.prompt);
        child.stdin.end();
      }
    }
  });
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const yes = readBooleanArg(args, "yes") === true;
  const mode = asMode(readStringArg(args, "mode"));
  const repo = readStringArg(args, "repo");
  const taskArg = readStringArg(args, "task");
  const model = readStringArg(args, "model");
  const repeat = Math.max(1, Math.min(readNumberArg(args, "repeat") ?? 1, 10));
  const outDirArg = readStringArg(args, "out") ?? AB_CLAUDE_RUNS_DIR;
  const claudeBinArg = readStringArg(args, "claude-bin");
  const configArg = readStringArg(args, "config");

  if (!isClaudeAdapterEnabled()) {
    throw new Error("Claude adapter is disabled. Set AB_ENABLE_CLAUDE_ADAPTER=1 to enable.");
  }
  if (!yes) {
    throw new Error("Claude adapter requires --yes.");
  }
  if (!mode || !repo) {
    console.error(usage());
    process.exit(1);
  }
  if (!["no_mcp", "context_broker_locked"].includes(mode)) {
    throw new Error("Claude adapter only supports --mode no_mcp or context_broker_locked.");
  }

  const plan = readCurrentPlan();
  if (!plan) {
    throw new Error("No active A/B plan. Run npm run ab:claude:plan or ab:create first.");
  }

  const adapter = loadClaudeAdapterConfig();
  if (claudeBinArg) {
    adapter.claudeBin = claudeBinArg;
  }

  const selectedConfig =
    configArg ??
    (mode === "no_mcp" ? path.resolve(NO_MCP_CLAUDE_CONFIG) : path.resolve(LOCKED_CLAUDE_CONFIG));
  if (!fs.existsSync(selectedConfig)) {
    throw new Error(`Claude config not found: ${selectedConfig}`);
  }

  ensureAbDirectories();
  const outDir = resolveAbPath(outDirArg);
  fs.mkdirSync(outDir, { recursive: true });

  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const taskName = taskArg ?? plan.taskName;
  const prompt = getModePrompt(mode, plan.taskPrompt);
  const runResults: ClaudeRunData[] = [];
  const perRunMcpTokens: number[] = [];
  const qualityScores: Array<{ answerQuality: number; foundExpectedFiles: boolean; note: string }> = [];

  const persistPartial = (): void => {
    if (runResults.length === 0) return;
    const latest = runResults.at(-1)!;
    const clientTotalTokenRepeats = runResults
      .map((run) => run.parsedUsage?.clientTotalTokens)
      .filter((value): value is number => typeof value === "number");
    const mcpTotal = perRunMcpTokens.reduce((sum, value) => sum + value, 0);
    const combinedTotalTokenRepeats =
      clientTotalTokenRepeats.length > 0
        ? clientTotalTokenRepeats.map((total, index) => total + (perRunMcpTokens[index] ?? 0))
        : undefined;
    const quality = qualityScores.at(-1);
    const tools = extractMcpToolsFromClaudeTranscript(`${latest.stdout}\n${latest.stderr}`);
    const result: AbRunResult = {
      id: `${plan.id}-${mode}-claude-partial-${Date.now()}`,
      planId: plan.id,
      mode,
      client: "claude_code",
      model: model ?? plan.model,
      repoPath: path.resolve(repo),
      prompt,
      completedAt: new Date().toISOString(),
      clientTotalTokens: latest.parsedUsage?.clientTotalTokens,
      clientTotalTokenRepeats: clientTotalTokenRepeats.length > 0 ? clientTotalTokenRepeats : undefined,
      mcpEstimatedOutputTokens: mcpTotal,
      mcpToolCalls: tools.length,
      mcpToolsUsed: tools,
      combinedTotalTokens:
        latest.parsedUsage?.clientTotalTokens !== undefined
          ? latest.parsedUsage.clientTotalTokens + mcpTotal
          : undefined,
      combinedTotalTokenRepeats,
      answerQuality: quality?.answerQuality,
      foundExpectedFiles: quality?.foundExpectedFiles,
      adapterRunCount: runResults.length,
      transcriptPath: path.join(latest.runDir, "transcript.md"),
      usageParsed: clientTotalTokenRepeats.length > 0,
      notes: `Partial run (${runResults.length}/${repeat}). ${quality?.note ?? ""}`.trim(),
    };
    writeJsonFile(resultFilePath(plan.id, mode), result);
  };

  for (let i = 1; i <= repeat; i += 1) {
    if (mode === "context_broker_locked") {
      cleanTelemetryLogs();
    }
    const runDir = path.join(outDir, `${runTimestamp}-${mode}-${i}`);
    fs.mkdirSync(runDir, { recursive: true });
    const promptPath = path.join(runDir, "prompt.txt");
    fs.writeFileSync(promptPath, prompt, "utf8");
    const runConfigPath = path.join(runDir, "claude.config.json");
    fs.copyFileSync(selectedConfig, runConfigPath);

    const vars = {
      promptFile: promptPath,
      configPath: runConfigPath,
      repoPath: path.resolve(repo),
      model: model ?? "",
      task: taskName,
    };

    const argsList: string[] = [...adapter.baseArgs.map((arg) => formatTemplated(arg, vars))];
    argsList.push(...adapter.configArgs.map((arg) => formatTemplated(arg, vars)));

    if (adapter.promptArgMode === "dash_p") {
      argsList.push("-p", prompt);
    } else if (adapter.promptArgMode === "prompt-file-arg") {
      const fileArgs = adapter.promptFileArgs ?? ["--prompt-file", "{promptFile}"];
      argsList.push(...fileArgs.map((arg) => formatTemplated(arg, vars)));
    }

    let runData: ClaudeRunData;
    try {
      runData = await runOnce({
        command: adapter.claudeBin,
        args: argsList,
        cwd: formatTemplated(adapter.cwd, vars),
        prompt,
        runDir,
        promptPath,
        configPath: runConfigPath,
        promptArgMode: adapter.promptArgMode,
      });
    } catch (error) {
      persistPartial();
      throw error;
    }

    const telemetry = mode === "context_broker_locked" ? saveTelemetrySnapshot(runDir) : null;
    perRunMcpTokens.push(telemetry?.estimatedMcpOutputTokens ?? 0);

    if (taskName === AUTH_DISCOVERY_TASK) {
      const scored = scoreAuthDiscoveryAnswer(`${runData.stdout}\n${runData.stderr}`);
      qualityScores.push({
        answerQuality: scored.answerQuality,
        foundExpectedFiles: scored.foundExpectedFiles,
        note: scored.note,
      });
    }

    fs.writeFileSync(
      path.join(runDir, "run.json"),
      `${JSON.stringify(
        {
          mode,
          task: taskName,
          model,
          command: runData.command,
          args: runData.args,
          cwd: formatTemplated(adapter.cwd, vars),
          configPath: runConfigPath,
          promptPath,
          usageParsed: runData.usageParsed,
          parsedUsage: runData.parsedUsage,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    runResults.push(runData);
  }

  const latest = runResults.at(-1)!;
  const parsed = latest.parsedUsage;
  const clientTotalTokenRepeats = runResults
    .map((run) => run.parsedUsage?.clientTotalTokens)
    .filter((value): value is number => typeof value === "number");
  const mcpTotal = perRunMcpTokens.reduce((sum, value) => sum + value, 0);
  const combinedTotalTokenRepeats =
    clientTotalTokenRepeats.length > 0
      ? clientTotalTokenRepeats.map((total, index) => total + (perRunMcpTokens[index] ?? 0))
      : undefined;
  const quality = qualityScores.reduce(
    (worst, current) => (current.answerQuality < worst.answerQuality ? current : worst),
    qualityScores[0] ?? { answerQuality: 0, foundExpectedFiles: false, note: "" },
  );
  const mcpTools =
    mode === "context_broker_locked"
      ? [...new Set(runResults.flatMap((run) => extractMcpToolsFromClaudeTranscript(`${run.stdout}\n${run.stderr}`)))]
      : [];
  const mcpToolCallCounts: Record<string, number> = {};
  for (const tool of mcpTools) {
    mcpToolCallCounts[tool] = runResults.reduce(
      (count, run) =>
        count + extractMcpToolsFromClaudeTranscript(`${run.stdout}\n${run.stderr}`).filter((name) => name === tool).length,
      0,
    );
  }

  const result: AbRunResult = {
    id: `${plan.id}-${mode}-claude-${Date.now()}`,
    planId: plan.id,
    mode,
    client: "claude_code",
    model: model ?? plan.model,
    repoPath: path.resolve(repo),
    prompt,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    clientInputTokens: parsed?.clientInputTokens,
    clientOutputTokens: parsed?.clientOutputTokens,
    clientCacheWriteTokens: parsed?.clientCacheWriteTokens,
    clientCacheReadTokens: parsed?.clientCacheReadTokens,
    clientTotalTokens: parsed?.clientTotalTokens,
    mcpToolCalls: mode === "context_broker_locked" ? mcpTools.length * runResults.length : 0,
    mcpEstimatedOutputTokens: mode === "context_broker_locked" ? mcpTotal : 0,
    mcpLargestResponseChars: 0,
    mcpToolsUsed: mode === "context_broker_locked" ? mcpTools : [],
    mcpToolCallCounts: mode === "context_broker_locked" ? mcpToolCallCounts : {},
    combinedTotalTokens:
      parsed?.clientTotalTokens !== undefined
        ? parsed.clientTotalTokens + (mode === "context_broker_locked" ? perRunMcpTokens.at(-1) ?? 0 : 0)
        : undefined,
    clientTotalTokenRepeats: clientTotalTokenRepeats.length > 0 ? clientTotalTokenRepeats : undefined,
    combinedTotalTokenRepeats,
    answerQuality: qualityScores.length > 0 ? quality.answerQuality : undefined,
    foundExpectedFiles: qualityScores.length > 0 ? quality.foundExpectedFiles : undefined,
    adapterName: "claude_cli",
    adapterCommand: `${latest.command} ${latest.args.join(" ")}`.trim(),
    adapterConfigPath: latest.configPath,
    adapterOutputDir: latest.runDir,
    adapterStdoutPath: path.join(latest.runDir, "stdout.txt"),
    adapterStderrPath: path.join(latest.runDir, "stderr.txt"),
    adapterRunCount: runResults.length,
    transcriptPath: path.join(latest.runDir, "transcript.md"),
    telemetryReportPath: mode === "context_broker_locked" ? path.resolve(".mcp-telemetry/report.md") : undefined,
    usageParsed: latest.usageParsed,
    usageManuallyEntered: false,
    notes: latest.usageParsed
      ? `Usage parsed from Claude output. ${quality.note}`.trim()
      : "Real Claude usage required — record manually with ab:record if CLI output lacks usage fields.",
  };
  writeJsonFile(resultFilePath(plan.id, mode), result);

  console.log(`Claude runs completed: ${runResults.length}`);
  console.log(`Latest run directory: ${latest.runDir}`);
  console.log(`Result file updated for mode ${mode}.`);
  if (!latest.usageParsed) {
    console.log("Claude usage was not found in output. Mark as INCOMPLETE_TEST until real usage is recorded.");
  }
}

const isMain = process.argv[1]?.endsWith("claudeCli.js");
if (isMain) {
  main().catch((error) => {
    if (isClaudeSpawnError(error)) {
      process.exit(1);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
