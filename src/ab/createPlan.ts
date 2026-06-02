import path from "node:path";
import { asClient, parseCliArgs, readStringArg, splitList } from "./cli.js";
import { DEFAULT_AB_MODES, DEFAULT_TASK_PROMPT } from "./prompts.js";
import { ensureAbDirectories, planFilePath, writeCurrentPlan, writeJsonFile } from "./paths.js";
import type { AbMode, AbTestPlan } from "./types.js";

function asModes(input: string[] | undefined): AbMode[] | undefined {
  if (!input || input.length === 0) {
    return undefined;
  }
  const valid = input.filter((item): item is AbMode => DEFAULT_AB_MODES.includes(item as AbMode));
  return valid.length > 0 ? valid : undefined;
}

function toPlanId(taskName: string): string {
  const normalized = taskName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return `${normalized}-${Date.now()}`;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run ab:create -- --client <cursor|codex|claude_code|claude_desktop|generic> --repo <path> --task <name>",
    "Optional:",
    "  --task-prompt <text> --model <name> --notes <text> --modes no_mcp,compact_search,graph,context_broker",
  ].join("\n");
}

function main(): void {
  const args = parseCliArgs();
  const client = asClient(readStringArg(args, "client"));
  const repoArg = readStringArg(args, "repo") ?? ".";
  const taskName = readStringArg(args, "task");

  if (!client || !taskName) {
    console.error(usage());
    process.exit(1);
  }

  const taskPrompt = readStringArg(args, "task-prompt") ?? DEFAULT_TASK_PROMPT;
  const model = readStringArg(args, "model");
  const notes = readStringArg(args, "notes");
  const modes = asModes(splitList(readStringArg(args, "modes"))) ?? DEFAULT_AB_MODES;

  const plan: AbTestPlan = {
    id: toPlanId(taskName),
    createdAt: new Date().toISOString(),
    client,
    repoPath: path.resolve(repoArg),
    taskName,
    taskPrompt,
    modes,
    model,
    notes,
  };

  ensureAbDirectories();
  writeJsonFile(planFilePath(plan.id), plan);
  writeCurrentPlan(plan);

  console.log(`Created A/B plan: ${plan.id}`);
  console.log(`Client: ${plan.client}`);
  console.log(`Repo: ${plan.repoPath}`);
  console.log(`Modes: ${plan.modes.join(", ")}`);
}

main();
