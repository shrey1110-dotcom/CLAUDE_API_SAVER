import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { scoreAuthDiscoveryAnswer, extractMcpToolsFromCodexTranscript, AUTH_DISCOVERY_TASK } from "../authDiscoveryQuality.js";
import { asMode, parseCliArgs, readBooleanArg, readNumberArg, readStringArg } from "../cli.js";
import {
  AB_CODEX_ADAPTER_CONFIG,
  AB_CODEX_RUNS_DIR,
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
import { isCodexSpawnError, printCodexNotFoundHints } from "./codexCliSupport.js";
import { mergeUsageWithTotal, parseCodexUsageFromOutput } from "./codexUsage.js";
import type { CodexAdapterConfig } from "./types.js";

interface CodexRunData {
  runDir: string;
  promptPath: string;
  configPath: string;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  usageParsed: boolean;
  parsedUsage: ReturnType<typeof mergeUsageWithTotal> | null;
}

function isCodexAdapterEnabled(): boolean {
  return process.env.AB_ENABLE_CODEX_ADAPTER === "1";
}

function usage(): string {
  return [
    "Usage:",
    "  npm run ab:codex -- --mode <no_mcp|context_broker|context_broker_locked> --repo <path> --yes",
    "Optional:",
    "  --model <model> --repeat <n> --codex-bin <bin> --config <configPath> --out <dir>",
    "Safety:",
    "  Requires AB_ENABLE_CODEX_ADAPTER=1 and --yes.",
  ].join("\n");
}

function isMcpMode(mode: string): boolean {
  return mode === "context_broker" || mode === "context_broker_locked";
}

function defaultAdapterConfig(): CodexAdapterConfig {
  return {
    codexBin: "codex",
    baseArgs: [],
    promptArgMode: "stdin",
    configArgs: ["--config", "{configPath}"],
    cwd: "{repoPath}",
  };
}

function loadCodexAdapterConfig(): CodexAdapterConfig {
  const config = readJsonFile<Partial<CodexAdapterConfig>>(AB_CODEX_ADAPTER_CONFIG);
  if (!config) return defaultAdapterConfig();
  const merged = { ...defaultAdapterConfig(), ...config };
  if (!merged.codexBin || !Array.isArray(merged.baseArgs) || !Array.isArray(merged.configArgs)) {
    throw new Error(`Invalid codex adapter config at ${resolveAbPath(AB_CODEX_ADAPTER_CONFIG)}.`);
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
}): Promise<CodexRunData> {
  console.log(`[ab:codex] Running: ${input.command} ${input.args.join(" ")}`);
  return await new Promise<CodexRunData>((resolve, reject) => {
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
      if (isCodexSpawnError(error)) {
        printCodexNotFoundHints(input.command);
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Codex command exited with code ${code}`));
        return;
      }
      const parsed = parseCodexUsageFromOutput(stdout, stderr);
      const usage = parsed ? mergeUsageWithTotal(parsed) : null;
      fs.writeFileSync(path.join(input.runDir, "stdout.txt"), stdout, "utf8");
      fs.writeFileSync(path.join(input.runDir, "stderr.txt"), stderr, "utf8");
      fs.writeFileSync(
        path.join(input.runDir, "transcript.md"),
        `# Codex Run Transcript\n\n## Command\n\n\`${input.command} ${input.args.join(" ")}\`\n\n## Stdout\n\n\`\`\`text\n${stdout}\n\`\`\`\n\n## Stderr\n\n\`\`\`text\n${stderr}\n\`\`\`\n`,
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

    if (!child.stdin.destroyed) {
      child.stdin.write(input.prompt);
      child.stdin.end();
    }
  });
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const yes = readBooleanArg(args, "yes") === true;
  const mode = asMode(readStringArg(args, "mode"));
  const repo = readStringArg(args, "repo");
  const model = readStringArg(args, "model");
  const repeat = Math.max(1, Math.min(readNumberArg(args, "repeat") ?? 1, 10));
  const outDirArg = readStringArg(args, "out") ?? AB_CODEX_RUNS_DIR;
  const codexBinArg = readStringArg(args, "codex-bin");
  const configArg = readStringArg(args, "config");

  if (!isCodexAdapterEnabled()) {
    throw new Error("Codex adapter is disabled. Set AB_ENABLE_CODEX_ADAPTER=1 to enable.");
  }
  if (!yes) {
    throw new Error("Codex adapter requires --yes.");
  }
  if (!mode || !repo) {
    console.error(usage());
    process.exit(1);
  }
  if (!["no_mcp", "context_broker", "context_broker_locked"].includes(mode)) {
    throw new Error("Codex adapter only supports --mode no_mcp, context_broker, or context_broker_locked.");
  }

  const plan = readCurrentPlan();
  if (!plan) {
    throw new Error("No active A/B plan. Run npm run ab:create first.");
  }

  const adapter = loadCodexAdapterConfig();
  if (codexBinArg) {
    adapter.codexBin = codexBinArg;
  }

  const selectedConfig =
    configArg ??
    (mode === "no_mcp"
      ? path.resolve("examples/codex/ab/no-mcp.config.toml")
      : mode === "context_broker_locked"
        ? path.resolve("examples/codex/ab/context-broker-locked.config.toml")
        : path.resolve("examples/codex/ab/context-broker.config.toml"));
  if (!fs.existsSync(selectedConfig)) {
    throw new Error(`Codex config not found: ${selectedConfig}`);
  }

  ensureAbDirectories();
  const outDir = resolveAbPath(outDirArg);
  fs.mkdirSync(outDir, { recursive: true });

  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prompt = getModePrompt(mode, plan.taskPrompt);
  const runResults: CodexRunData[] = [];
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
    const tools = extractMcpToolsFromCodexTranscript(`${latest.stdout}\n${latest.stderr}`);
    const result: AbRunResult = {
      id: `${plan.id}-${mode}-codex-partial-${Date.now()}`,
      planId: plan.id,
      mode,
      client: "codex",
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
    if (isMcpMode(mode)) {
      cleanTelemetryLogs();
    }
    const runDir = path.join(outDir, `${runTimestamp}-${mode}-${i}`);
    fs.mkdirSync(runDir, { recursive: true });
    const promptPath = path.join(runDir, "prompt.txt");
    fs.writeFileSync(promptPath, prompt, "utf8");
    const runConfigPath = path.join(runDir, "codex.config.toml");
    fs.copyFileSync(selectedConfig, runConfigPath);

    const vars = {
      promptFile: promptPath,
      configPath: runConfigPath,
      repoPath: path.resolve(repo),
      model: model ?? "",
    };

    const argsList: string[] = [...adapter.baseArgs.map((arg) => formatTemplated(arg, vars))];
    argsList.push(...adapter.configArgs.map((arg) => formatTemplated(arg, vars)));
    if (model) {
      argsList.push("--model", model);
    }
    if (adapter.promptArgMode === "prompt-file-arg") {
      const fileArgs = adapter.promptFileArgs ?? ["--prompt-file", "{promptFile}"];
      argsList.push(...fileArgs.map((arg) => formatTemplated(arg, vars)));
    }

    let runData: CodexRunData;
    try {
      runData = await runOnce({
        command: adapter.codexBin,
        args: argsList,
        cwd: formatTemplated(adapter.cwd, vars),
        prompt,
        runDir,
        promptPath,
        configPath: runConfigPath,
      });
    } catch (error) {
      persistPartial();
      throw error;
    }

    const telemetry = isMcpMode(mode) ? saveTelemetrySnapshot(runDir) : null;
    perRunMcpTokens.push(telemetry?.estimatedMcpOutputTokens ?? 0);

    if (plan.taskName === AUTH_DISCOVERY_TASK) {
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
  const mcpTools = isMcpMode(mode)
    ? [...new Set(runResults.flatMap((run) => extractMcpToolsFromCodexTranscript(`${run.stdout}\n${run.stderr}`)))]
    : [];
  const mcpToolCallCounts: Record<string, number> = {};
  for (const tool of mcpTools) {
    mcpToolCallCounts[tool] = runResults.reduce(
      (count, run) => count + extractMcpToolsFromCodexTranscript(`${run.stdout}\n${run.stderr}`).filter((name) => name === tool).length,
      0,
    );
  }

  const result: AbRunResult = {
    id: `${plan.id}-${mode}-codex-${Date.now()}`,
    planId: plan.id,
    mode,
    client: "codex",
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
    mcpToolCalls: isMcpMode(mode) ? mcpTools.length * runResults.length : 0,
    mcpEstimatedOutputTokens: isMcpMode(mode) ? mcpTotal : 0,
    mcpLargestResponseChars: 0,
    mcpToolsUsed: isMcpMode(mode) ? mcpTools : [],
    mcpToolCallCounts: isMcpMode(mode) ? mcpToolCallCounts : {},
    combinedTotalTokens:
      parsed?.clientTotalTokens !== undefined
        ? parsed.clientTotalTokens + (isMcpMode(mode) ? perRunMcpTokens.at(-1) ?? 0 : 0)
        : undefined,
    clientTotalTokenRepeats: clientTotalTokenRepeats.length > 0 ? clientTotalTokenRepeats : undefined,
    combinedTotalTokenRepeats,
    answerQuality: qualityScores.length > 0 ? quality.answerQuality : undefined,
    foundExpectedFiles: qualityScores.length > 0 ? quality.foundExpectedFiles : undefined,
    adapterName: "codex_cli",
    adapterCommand: `${latest.command} ${latest.args.join(" ")}`.trim(),
    adapterConfigPath: latest.configPath,
    adapterOutputDir: latest.runDir,
    adapterStdoutPath: path.join(latest.runDir, "stdout.txt"),
    adapterStderrPath: path.join(latest.runDir, "stderr.txt"),
    adapterRunCount: runResults.length,
    transcriptPath: path.join(latest.runDir, "transcript.md"),
    telemetryReportPath: isMcpMode(mode) ? path.resolve(".mcp-telemetry/report.md") : undefined,
    usageParsed: latest.usageParsed,
    usageManuallyEntered: false,
    notes: latest.usageParsed
      ? `Usage parsed from Codex output. ${quality.note}`.trim()
      : "usage numbers required",
  };
  writeJsonFile(resultFilePath(plan.id, mode), result);

  console.log(`Codex runs completed: ${runResults.length}`);
  console.log(`Latest run directory: ${latest.runDir}`);
  console.log(`Result file updated for mode ${mode}.`);
  if (!latest.usageParsed) {
    console.log("Codex usage was not found in output. Record real Codex usage manually with ab:record.");
  }
}

main().catch((error) => {
  if (isCodexSpawnError(error)) {
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
