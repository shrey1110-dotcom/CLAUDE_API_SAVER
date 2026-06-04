import path from "node:path";
import { parseCliArgs, readNumberArg, readStringArg } from "../cli.js";
import {
  FILE_CONTEXT_DEFAULT_PACK_PATH,
  FILE_CONTEXT_DEFAULT_TASK,
  FILE_CONTEXT_TEST_A_PROMPT,
  FILE_CONTEXT_TEST_B_PROMPT,
} from "./prompts.js";
import { ensureFcDirectories, planFilePath, writeCurrentFileContextPlan, writeFcJson } from "./paths.js";
import type { FileContextClient, FileContextPlan } from "./types.js";

const FC_CLIENTS: FileContextClient[] = [
  "chatgpt",
  "claude_web",
  "gemini_web",
  "cursor",
  "codex",
  "claude_code",
  "generic",
];

function asFileContextClient(value: string | undefined): FileContextClient | undefined {
  if (!value) return undefined;
  return FC_CLIENTS.includes(value as FileContextClient) ? (value as FileContextClient) : undefined;
}

function toPlanId(task: string): string {
  const normalized = task.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40);
  return `file-context-${normalized}-${Date.now()}`;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run ab:file-context:create -- --client <chatgpt|claude_web|gemini_web|cursor|codex|claude_code|generic> --repo <path>",
    "Optional:",
    "  --model <name> --task <text> --context-pack-path <path> --context-pack-tokens <n> --notes <text>",
  ].join("\n");
}

function main(): void {
  const args = parseCliArgs();
  const client = asFileContextClient(readStringArg(args, "client"));
  const repoArg = readStringArg(args, "repo") ?? ".";

  if (!client) {
    console.error(usage());
    process.exit(1);
  }

  const plan: FileContextPlan = {
    id: toPlanId(readStringArg(args, "task") ?? FILE_CONTEXT_DEFAULT_TASK),
    createdAt: new Date().toISOString(),
    client,
    model: readStringArg(args, "model"),
    repoPath: path.resolve(repoArg),
    task: readStringArg(args, "task") ?? FILE_CONTEXT_DEFAULT_TASK,
    contextPackPath: readStringArg(args, "context-pack-path") ?? FILE_CONTEXT_DEFAULT_PACK_PATH,
    contextPackEstimatedTokens: readNumberArg(args, "context-pack-tokens"),
    testAPrompt: FILE_CONTEXT_TEST_A_PROMPT,
    testBPrompt: FILE_CONTEXT_TEST_B_PROMPT,
    notes: readStringArg(args, "notes"),
  };

  ensureFcDirectories();
  writeFcJson(planFilePath(plan.id), plan);
  writeCurrentFileContextPlan(plan);

  console.log(`Created file-context A/B plan: ${plan.id}`);
  console.log(`Client: ${plan.client}`);
  console.log(`Repo: ${plan.repoPath}`);
  console.log(`Context pack: ${plan.contextPackPath}`);
  console.log("\nNext:");
  console.log("  npm run ab:file-context:record -- --mode no_context ...");
  console.log("  npm run ab:file-context:record -- --mode file_context_pack ...");
  console.log("  npm run ab:file-context:compare");
}

main();
