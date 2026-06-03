import fs from "node:fs";
import path from "node:path";
import {
  scoreAuthDiscoveryAnswer,
  extractMcpToolsFromClaudeTranscript,
  AUTH_DISCOVERY_TASK,
} from "./authDiscoveryQuality.js";
import { mergeClaudeUsageWithTotal, parseClaudeUsageFromOutput } from "./adapters/claudeUsage.js";
import {
  AB_CLAUDE_RUNS_DIR,
  ensureAbDirectories,
  readCurrentPlan,
  resolveAbPath,
  resultFilePath,
  writeJsonFile,
} from "./paths.js";
import type { AbMode, AbRunResult, AbTestPlan } from "./types.js";

interface RunFolder {
  dir: string;
  mode: AbMode;
  index: number;
  runJsonPath: string;
}

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseModeFromDirName(name: string): { mode: AbMode; index: number } | null {
  const match = name.match(/-(no_mcp|context_broker_locked)-(\d+)$/);
  if (!match) return null;
  return { mode: match[1] as AbMode, index: Number(match[2]) };
}

function listRunFolders(): RunFolder[] {
  const root = resolveAbPath(AB_CLAUDE_RUNS_DIR);
  if (!fs.existsSync(root)) return [];
  const folders: RunFolder[] = [];
  for (const name of fs.readdirSync(root)) {
    const parsed = parseModeFromDirName(name);
    if (!parsed) continue;
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    folders.push({
      dir,
      mode: parsed.mode,
      index: parsed.index,
      runJsonPath: path.join(dir, "run.json"),
    });
  }
  return folders.sort((a, b) => a.mode.localeCompare(b.mode) || a.index - b.index);
}

function latestBatchFolders(folders: RunFolder[]): RunFolder[] {
  if (folders.length === 0) return folders;
  const batchKey = (dir: string): string => {
    const base = path.basename(dir);
    const match = base.match(/^(.*)-(no_mcp|context_broker_locked)-\d+$/);
    return match?.[1] ?? base;
  };
  const batches = [...new Set(folders.map((folder) => batchKey(folder.dir)))].sort();
  const latest = batches[batches.length - 1];
  return folders.filter((folder) => batchKey(folder.dir) === latest);
}

function readRunUsage(folder: RunFolder): ReturnType<typeof mergeClaudeUsageWithTotal> | null {
  if (fs.existsSync(folder.runJsonPath)) {
    try {
      const runJson = JSON.parse(fs.readFileSync(folder.runJsonPath, "utf8")) as {
        parsedUsage?: ReturnType<typeof mergeClaudeUsageWithTotal>;
      };
      if (runJson.parsedUsage) return mergeClaudeUsageWithTotal(runJson.parsedUsage);
    } catch {
      // fall through
    }
  }
  const stdout = readText(path.join(folder.dir, "stdout.txt"));
  const stderr = readText(path.join(folder.dir, "stderr.txt"));
  const parsed = parseClaudeUsageFromOutput(stdout, stderr);
  return parsed ? mergeClaudeUsageWithTotal(parsed) : null;
}

function readRunMcpTelemetry(folder: RunFolder): {
  mcpToolCalls: number;
  mcpEstimatedOutputTokens: number;
  mcpLargestResponseChars: number;
  mcpToolsUsed: string[];
  mcpToolCallCounts: Record<string, number>;
} {
  const snapshotPath = path.join(folder.dir, "telemetry-summary.json");
  if (fs.existsSync(snapshotPath)) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as {
      mcpToolCalls?: number;
      totalMcpToolCalls?: number;
      mcpEstimatedOutputTokens?: number;
      estimatedMcpOutputTokens?: number;
      mcpLargestResponseChars?: number;
      largestResponseChars?: number;
      mcpToolsUsed?: string[];
      toolsUsed?: string[];
      mcpToolCallCounts?: Record<string, number>;
      callsByTool?: Record<string, number>;
    };
    return {
      mcpToolCalls: snapshot.mcpToolCalls ?? snapshot.totalMcpToolCalls ?? 0,
      mcpEstimatedOutputTokens: snapshot.mcpEstimatedOutputTokens ?? snapshot.estimatedMcpOutputTokens ?? 0,
      mcpLargestResponseChars: snapshot.mcpLargestResponseChars ?? snapshot.largestResponseChars ?? 0,
      mcpToolsUsed: snapshot.mcpToolsUsed ?? snapshot.toolsUsed ?? [],
      mcpToolCallCounts: snapshot.mcpToolCallCounts ?? snapshot.callsByTool ?? {},
    };
  }

  const transcript = readText(path.join(folder.dir, "transcript.md"));
  const stdout = readText(path.join(folder.dir, "stdout.txt"));
  const tools = extractMcpToolsFromClaudeTranscript(`${transcript}\n${stdout}`);
  const counts: Record<string, number> = {};
  for (const tool of tools) {
    counts[tool] = (counts[tool] ?? 0) + 1;
  }
  return {
    mcpToolCalls: tools.length,
    mcpEstimatedOutputTokens: 0,
    mcpLargestResponseChars: 0,
    mcpToolsUsed: tools,
    mcpToolCallCounts: counts,
  };
}

function buildResultFromFolders(plan: AbTestPlan, mode: AbMode, folders: RunFolder[]): AbRunResult | null {
  if (folders.length === 0) return null;

  const usages = folders.map((folder) => readRunUsage(folder));
  const clientTotals = usages
    .map((usage) => usage?.clientTotalTokens)
    .filter((value): value is number => typeof value === "number");

  const latest = folders[folders.length - 1];
  const perFolderQuality =
    plan.taskName === AUTH_DISCOVERY_TASK
      ? folders.map((folder) =>
          scoreAuthDiscoveryAnswer(
            `${readText(path.join(folder.dir, "transcript.md"))}\n${readText(path.join(folder.dir, "stdout.txt"))}`,
          ),
        )
      : [];
  const quality =
    perFolderQuality.length === 0
      ? undefined
      : mode === "no_mcp"
        ? perFolderQuality.reduce((best, current) => (current.answerQuality > best.answerQuality ? current : best))
        : perFolderQuality.reduce((worst, current) => (current.answerQuality < worst.answerQuality ? current : worst));

  const isMcpMode = mode === "context_broker_locked";
  const perRunMcpTokens = folders.map((folder) => {
    const snapshotPath = path.join(folder.dir, "telemetry-summary.json");
    if (fs.existsSync(snapshotPath)) {
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as {
        mcpEstimatedOutputTokens?: number;
        estimatedMcpOutputTokens?: number;
      };
      return snapshot.mcpEstimatedOutputTokens ?? snapshot.estimatedMcpOutputTokens ?? 0;
    }
    const mcp = readRunMcpTelemetry(folder);
    return mcp.mcpEstimatedOutputTokens;
  });
  const mcpTotal = perRunMcpTokens.reduce((sum, value) => sum + value, 0);
  const mcp = isMcpMode ? readRunMcpTelemetry(latest) : undefined;
  if (isMcpMode && mcp) {
    if (mcp.mcpToolsUsed.length === 0) {
      for (const folder of folders) {
        const tools = extractMcpToolsFromClaudeTranscript(
          `${readText(path.join(folder.dir, "transcript.md"))}\n${readText(path.join(folder.dir, "stdout.txt"))}`,
        );
        for (const tool of tools) {
          if (!mcp.mcpToolsUsed.includes(tool)) mcp.mcpToolsUsed.push(tool);
          mcp.mcpToolCallCounts[tool] = (mcp.mcpToolCallCounts[tool] ?? 0) + 1;
        }
      }
    }
    mcp.mcpToolCalls = Object.values(mcp.mcpToolCallCounts).reduce((sum, count) => sum + count, 0);
  }

  const combinedRepeats =
    clientTotals.length > 0 ? clientTotals.map((total, index) => total + (perRunMcpTokens[index] ?? 0)) : undefined;

  const latestUsage = usages.filter((usage) => usage !== null).at(-1) ?? null;
  const usageParsed = clientTotals.length === folders.length && clientTotals.length > 0;

  return {
    id: `${plan.id}-${mode}-claude-ingested-${Date.now()}`,
    planId: plan.id,
    mode,
    client: "claude_code",
    repoPath: plan.repoPath,
    prompt: latest.dir,
    completedAt: new Date().toISOString(),
    clientInputTokens: latestUsage?.clientInputTokens,
    clientOutputTokens: latestUsage?.clientOutputTokens,
    clientTotalTokens: latestUsage?.clientTotalTokens ?? clientTotals[clientTotals.length - 1],
    clientTotalTokenRepeats: clientTotals.length > 0 ? clientTotals : undefined,
    mcpToolCalls: mcp?.mcpToolCalls ?? 0,
    mcpEstimatedOutputTokens: isMcpMode ? mcpTotal : 0,
    mcpLargestResponseChars: mcp?.mcpLargestResponseChars ?? 0,
    mcpToolsUsed: mcp?.mcpToolsUsed ?? [],
    mcpToolCallCounts: mcp?.mcpToolCallCounts ?? {},
    combinedTotalTokens:
      latestUsage?.clientTotalTokens !== undefined
        ? latestUsage.clientTotalTokens + (isMcpMode ? perRunMcpTokens.at(-1) ?? 0 : 0)
        : undefined,
    combinedTotalTokenRepeats: combinedRepeats,
    answerQuality: quality?.answerQuality,
    foundExpectedFiles: quality?.foundExpectedFiles,
    adapterName: "claude_cli_ingest",
    adapterRunCount: folders.length,
    adapterOutputDir: folders[0]?.dir ?? latest.dir,
    adapterStdoutPath: path.join(latest.dir, "stdout.txt"),
    adapterStderrPath: path.join(latest.dir, "stderr.txt"),
    transcriptPath: path.join(latest.dir, "transcript.md"),
    usageParsed,
    usageManuallyEntered: false,
    notes: usageParsed
      ? (quality?.note ?? `Ingested ${folders.length} Claude run folder(s) for ${mode}.`)
      : `Partial ingest (${folders.length} folder(s)); real Claude usage missing for ${folders.length - clientTotals.length} run(s).`,
  };
}

export function ingestClaudeRunsForPlan(plan: AbTestPlan): AbRunResult[] {
  const folders = listRunFolders();
  const byMode = new Map<AbMode, RunFolder[]>();
  for (const folder of folders) {
    if (!plan.modes.includes(folder.mode)) continue;
    const list = byMode.get(folder.mode) ?? [];
    list.push(folder);
    byMode.set(folder.mode, list);
  }

  const ingested: AbRunResult[] = [];
  for (const [mode, modeFolders] of byMode) {
    const batchFolders = latestBatchFolders(modeFolders);
    const result = buildResultFromFolders(plan, mode, batchFolders);
    if (!result) continue;
    writeJsonFile(resultFilePath(plan.id, mode), result);
    ingested.push(result);
  }
  return ingested;
}

function main(): void {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found.");
    process.exit(1);
  }
  ensureAbDirectories();
  const ingested = ingestClaudeRunsForPlan(plan);
  console.log(`Ingested ${ingested.length} mode result(s) from ${resolveAbPath(AB_CLAUDE_RUNS_DIR)}.`);
  for (const result of ingested) {
    console.log(
      `- ${result.mode}: repeats=${result.clientTotalTokenRepeats?.length ?? 0}, usageParsed=${result.usageParsed}, quality=${result.answerQuality ?? "-"}`,
    );
  }
}

const isMain = process.argv[1]?.endsWith("ingestClaudeRuns.js");
if (isMain) {
  main();
}
// ingest reads latest batch per mode
