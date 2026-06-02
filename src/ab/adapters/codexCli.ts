import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
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
    "  npm run ab:codex -- --mode <no_mcp|context_broker> --repo <path> --yes",
    "Optional:",
    "  --model <model> --repeat <n> --codex-bin <bin> --config <configPath> --out <dir>",
    "Safety:",
    "  Requires AB_ENABLE_CODEX_ADAPTER=1 and --yes.",
  ].join("\n");
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
    child.on("error", (error) => reject(error));
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
  if (!["no_mcp", "context_broker"].includes(mode)) {
    throw new Error("Codex adapter only supports --mode no_mcp or --mode context_broker.");
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

  for (let i = 1; i <= repeat; i += 1) {
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

    const runData = await runOnce({
      command: adapter.codexBin,
      args: argsList,
      cwd: formatTemplated(adapter.cwd, vars),
      prompt,
      runDir,
      promptPath,
      configPath: runConfigPath,
    });
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
  const telemetry = mode === "context_broker" ? readMcpTelemetryForAb() : null;
  const parsed = latest.parsedUsage;

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
    mcpToolCalls: mode === "context_broker" ? telemetry?.totalMcpToolCalls : 0,
    mcpEstimatedOutputTokens: mode === "context_broker" ? telemetry?.estimatedMcpOutputTokens : 0,
    mcpLargestResponseChars: mode === "context_broker" ? telemetry?.largestResponseChars : 0,
    mcpToolsUsed: mode === "context_broker" ? telemetry?.toolsUsed : [],
    combinedTotalTokens:
      parsed?.clientTotalTokens !== undefined
        ? parsed.clientTotalTokens + (mode === "context_broker" ? telemetry?.estimatedMcpOutputTokens ?? 0 : 0)
        : undefined,
    adapterName: "codex_cli",
    adapterCommand: `${latest.command} ${latest.args.join(" ")}`.trim(),
    adapterConfigPath: latest.configPath,
    adapterOutputDir: latest.runDir,
    adapterStdoutPath: path.join(latest.runDir, "stdout.txt"),
    adapterStderrPath: path.join(latest.runDir, "stderr.txt"),
    adapterRunCount: runResults.length,
    transcriptPath: path.join(latest.runDir, "transcript.md"),
    telemetryReportPath: mode === "context_broker" ? path.resolve(".mcp-telemetry/report.md") : undefined,
    usageParsed: latest.usageParsed,
    usageManuallyEntered: false,
    notes: latest.usageParsed ? "Usage parsed from Codex output." : "usage numbers required",
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
