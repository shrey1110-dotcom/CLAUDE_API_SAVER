import { parseCliArgs, readBooleanArg, readNumberArg, readStringArg, splitList } from "../cli.js";
import { allExpectedFilesFound, countExpectedFilesFromList } from "./scoring.js";
import { promptForMode } from "./prompts.js";
import {
  ensureFcDirectories,
  readCurrentFileContextPlan,
  resultFilePath,
  writeFcJson,
} from "./paths.js";
import type { FileContextClient, FileContextMode, FileContextResult, TokenUsageSource } from "./types.js";

const FC_MODES: FileContextMode[] = ["no_context", "file_context_pack"];
const FC_CLIENTS: FileContextClient[] = [
  "chatgpt",
  "claude_web",
  "gemini_web",
  "cursor",
  "codex",
  "claude_code",
  "generic",
];

function asMode(value: string | undefined): FileContextMode | undefined {
  if (!value) return undefined;
  return FC_MODES.includes(value as FileContextMode) ? (value as FileContextMode) : undefined;
}

function asClient(value: string | undefined): FileContextClient | undefined {
  if (!value) return undefined;
  return FC_CLIENTS.includes(value as FileContextClient) ? (value as FileContextClient) : undefined;
}

function asTokenUsage(value: string | undefined): TokenUsageSource | undefined {
  if (!value) return undefined;
  if (value === "real" || value === "estimated" || value === "unavailable") {
    return value;
  }
  return undefined;
}

function inferTokenUsage(
  explicit: TokenUsageSource | undefined,
  clientTotal?: number,
): TokenUsageSource {
  if (explicit) return explicit;
  if (typeof clientTotal === "number") return "estimated";
  return "unavailable";
}

function usage(): string {
  return [
    "Usage:",
    "  npm run ab:file-context:record -- --mode <no_context|file_context_pack> --quality <1-10>",
    "Required:",
    "  --expected-files-found <0-5> OR --files-listed path1,path2",
    "Optional:",
    "  --client --model --prompt --context-pack-path --context-pack-tokens",
    "  --client-input --client-output --client-total --client-cost",
    "  --token-usage real|estimated|unavailable --found true|false --notes <text>",
  ].join("\n");
}

function main(): void {
  const plan = readCurrentFileContextPlan();
  if (!plan) {
    console.error("No active file-context plan. Run npm run ab:file-context:create first.");
    process.exit(1);
  }

  const args = parseCliArgs();
  const mode = asMode(readStringArg(args, "mode"));
  if (!mode) {
    console.error(usage());
    process.exit(1);
  }

  const qualityScore = readNumberArg(args, "quality");
  if (typeof qualityScore !== "number" || qualityScore < 1 || qualityScore > 10) {
    console.error("--quality <1-10> is required.");
    process.exit(1);
  }

  const filesListed =
    splitList(readStringArg(args, "files-listed")) ?? [];
  const expectedFromArg = readNumberArg(args, "expected-files-found");
  const expectedFilesFound =
    typeof expectedFromArg === "number"
      ? Math.min(5, Math.max(0, expectedFromArg))
      : countExpectedFilesFromList(filesListed);

  const foundArg = readBooleanArg(args, "found");
  const foundExpectedFiles =
    typeof foundArg === "boolean" ? foundArg : allExpectedFilesFound(expectedFilesFound);

  const clientInputTokens = readNumberArg(args, "client-input");
  const clientOutputTokens = readNumberArg(args, "client-output");
  const clientTotalArg = readNumberArg(args, "client-total");
  const computedTotal =
    [clientInputTokens, clientOutputTokens].every((v) => typeof v === "number")
      ? (clientInputTokens ?? 0) + (clientOutputTokens ?? 0)
      : undefined;
  const clientTotalTokens = clientTotalArg ?? computedTotal;

  const tokenUsageSource = inferTokenUsage(
    asTokenUsage(readStringArg(args, "token-usage")),
    clientTotalTokens,
  );

  if (tokenUsageSource === "real" && typeof clientTotalTokens !== "number") {
    console.error("--token-usage real requires --client-total or input+output totals.");
    process.exit(1);
  }

  const contextPackPath =
    mode === "file_context_pack"
      ? readStringArg(args, "context-pack-path") ?? plan.contextPackPath
      : undefined;
  const contextPackEstimatedTokens =
    mode === "file_context_pack"
      ? readNumberArg(args, "context-pack-tokens") ?? plan.contextPackEstimatedTokens
      : undefined;

  const result: FileContextResult = {
    id: `${plan.id}-${mode}-${Date.now()}`,
    planId: plan.id,
    mode,
    client: asClient(readStringArg(args, "client")) ?? plan.client,
    model: readStringArg(args, "model") ?? plan.model,
    task: plan.task,
    prompt: readStringArg(args, "prompt") ?? promptForMode(mode),
    contextPackPath,
    contextPackEstimatedTokens,
    clientInputTokens,
    clientOutputTokens,
    clientTotalTokens,
    clientCost: readNumberArg(args, "client-cost"),
    tokenUsageSource,
    expectedFilesFound,
    foundExpectedFiles,
    qualityScore,
    filesListed,
    notes: readStringArg(args, "notes"),
    recordedAt: new Date().toISOString(),
  };

  ensureFcDirectories();
  writeFcJson(resultFilePath(plan.id, mode), result);

  console.log(`Recorded file-context result: ${mode}`);
  console.log(`Expected files: ${result.expectedFilesFound}/5`);
  console.log(`Quality: ${result.qualityScore}`);
  console.log(`Token usage: ${result.tokenUsageSource}`);
  if (typeof result.clientTotalTokens === "number") {
    console.log(`Client total tokens: ${result.clientTotalTokens}`);
  }
}

main();
