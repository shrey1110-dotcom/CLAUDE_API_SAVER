import { asClient, asMode, parseCliArgs, promptText, readBooleanArg, readNumberArg, readStringArg, splitList } from "./cli.js";
import { getModePrompt } from "./prompts.js";
import { ensureAbDirectories, readCurrentPlan, resultFilePath, writeJsonFile } from "./paths.js";
import { readMcpTelemetryForAb } from "./readMcpTelemetryForAb.js";
import type { AbRunResult } from "./types.js";

function sumDefined(values: Array<number | undefined>): number | undefined {
  const nums = values.filter((value): value is number => typeof value === "number");
  if (nums.length === 0) {
    return undefined;
  }
  return nums.reduce((sum, value) => sum + value, 0);
}

async function getTextOrPrompt(value: string | undefined, question: string): Promise<string | undefined> {
  if (value) {
    return value;
  }
  return await promptText(question);
}

async function getNumberOrPrompt(value: number | undefined, question: string): Promise<number | undefined> {
  if (typeof value === "number") {
    return value;
  }
  const answer = await promptText(question);
  if (!answer) {
    return undefined;
  }
  const parsed = Number(answer);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function getBooleanOrPrompt(value: boolean | undefined, question: string): Promise<boolean | undefined> {
  if (typeof value === "boolean") {
    return value;
  }
  const answer = await promptText(question);
  if (!answer) {
    return undefined;
  }
  const normalized = answer.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run ab:record -- --mode <mode> [--client-total <n>] [--mcp-tokens <n>] [--quality <1-10>] [--found <true|false>]",
    "Optional:",
    "  --use-telemetry --client <client> --model <model> --tools-used a,b --files-read x,y --notes <text>",
  ].join("\n");
}

async function main(): Promise<void> {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found. Run npm run ab:create first.");
    process.exit(1);
  }

  const args = parseCliArgs();
  const mode = asMode(readStringArg(args, "mode"));
  if (!mode) {
    console.error(usage());
    process.exit(1);
  }

  const useTelemetry = readBooleanArg(args, "use-telemetry") === true;
  const telemetry = useTelemetry ? readMcpTelemetryForAb() : null;

  const client = asClient(readStringArg(args, "client")) ?? plan.client;
  const model = await getTextOrPrompt(readStringArg(args, "model") ?? plan.model, "Model (optional): ");

  const clientInputTokens = await getNumberOrPrompt(readNumberArg(args, "client-input"), "Client input tokens: ");
  const clientOutputTokens = await getNumberOrPrompt(readNumberArg(args, "client-output"), "Client output tokens: ");
  const clientCacheWriteTokens = await getNumberOrPrompt(readNumberArg(args, "cache-write"), "Client cache write tokens: ");
  const clientCacheReadTokens = await getNumberOrPrompt(readNumberArg(args, "cache-read"), "Client cache read tokens: ");
  const computedClientTotal = sumDefined([
    clientInputTokens,
    clientOutputTokens,
    clientCacheWriteTokens,
    clientCacheReadTokens,
  ]);
  const clientTotalTokens =
    (await getNumberOrPrompt(readNumberArg(args, "client-total"), "Client total tokens: ")) ?? computedClientTotal;
  const clientCost = await getNumberOrPrompt(readNumberArg(args, "client-cost"), "Client cost (optional): ");

  const mcpToolCalls =
    mode === "no_mcp"
      ? 0
      : (await getNumberOrPrompt(readNumberArg(args, "mcp-calls") ?? telemetry?.totalMcpToolCalls, "MCP tool calls: "));
  const mcpEstimatedOutputTokens =
    mode === "no_mcp"
      ? 0
      : (await getNumberOrPrompt(
          readNumberArg(args, "mcp-tokens") ?? telemetry?.estimatedMcpOutputTokens,
          "MCP estimated output tokens: ",
        ));
  const mcpLargestResponseChars =
    mode === "no_mcp"
      ? 0
      : (await getNumberOrPrompt(
          readNumberArg(args, "mcp-largest") ?? telemetry?.largestResponseChars,
          "MCP largest response chars: ",
        ));

  const mcpToolsUsed =
    mode === "no_mcp"
      ? []
      : splitList(readStringArg(args, "mcp-tools")) ??
        splitList(await promptText("MCP tools used (comma-separated, optional): ")) ??
        telemetry?.toolsUsed ??
        [];

  const toolsUsed =
    splitList(readStringArg(args, "tools-used")) ??
    splitList(await promptText("Client tools used (comma-separated, optional): "));
  const filesRead =
    splitList(readStringArg(args, "files-read")) ??
    splitList(await promptText("Files read/inspected (comma-separated, optional): "));

  const answerQuality = await getNumberOrPrompt(readNumberArg(args, "quality"), "Answer quality (1-10): ");
  const foundExpectedFiles = await getBooleanOrPrompt(readBooleanArg(args, "found"), "Found expected files? (yes/no): ");
  const notes = await getTextOrPrompt(readStringArg(args, "notes"), "Notes (optional): ");

  const combinedTotalTokens =
    typeof clientTotalTokens === "number" && typeof mcpEstimatedOutputTokens === "number"
      ? clientTotalTokens + mcpEstimatedOutputTokens
      : undefined;

  const now = new Date().toISOString();
  const result: AbRunResult = {
    id: `${plan.id}-${mode}-${Date.now()}`,
    planId: plan.id,
    mode,
    client,
    model,
    repoPath: plan.repoPath,
    prompt: getModePrompt(mode, plan.taskPrompt),
    startedAt: now,
    completedAt: now,
    clientInputTokens,
    clientOutputTokens,
    clientCacheWriteTokens,
    clientCacheReadTokens,
    clientTotalTokens,
    clientCost,
    mcpToolCalls,
    mcpEstimatedOutputTokens,
    mcpLargestResponseChars,
    mcpToolsUsed,
    combinedTotalTokens,
    filesRead,
    toolsUsed,
    answerQuality,
    foundExpectedFiles,
    notes,
  };

  ensureAbDirectories();
  writeJsonFile(resultFilePath(plan.id, mode), result);

  console.log(`Recorded A/B result for mode ${mode}`);
  if (typeof result.combinedTotalTokens === "number") {
    console.log(`Combined total tokens: ${result.combinedTotalTokens}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
