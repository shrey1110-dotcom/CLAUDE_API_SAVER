import path from "node:path";
import { ensureAbDirectories, planFilePath, writeCurrentPlan, writeJsonFile } from "./paths.js";
import { DEFAULT_TASK_PROMPT } from "./prompts.js";
import type { AbTestPlan } from "./types.js";

function createPlanId(taskName: string): string {
  const normalized = taskName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return `${normalized}-${Date.now()}`;
}

function main(): void {
  ensureAbDirectories();
  const taskName = "auth-discovery";
  const plan: AbTestPlan = {
    id: createPlanId(taskName),
    createdAt: new Date().toISOString(),
    client: "claude_code",
    repoPath: path.resolve("."),
    taskName,
    taskPrompt: DEFAULT_TASK_PROMPT,
    modes: ["no_mcp", "context_broker_locked"],
    notes:
      "Claude Code locked A/B plan. Claude savings are NOT proven until ab:claude:real-check passes with real parsed usage.",
  };

  writeJsonFile(planFilePath(plan.id), plan);
  writeCurrentPlan(plan);

  console.log("Claude A/B plan helper");
  console.log("");
  console.log(`Created A/B plan: ${plan.id}`);
  console.log("client=claude_code");
  console.log("task=auth-discovery");
  console.log("");
  console.log("Claude savings are NOT proven. Real parsed usage is required.");
  console.log("");
  console.log("1) Preflight:");
  console.log("npm run ab:claude:doctor");
  console.log("npm run build && npm run graph:build && npm run context:build");
  console.log("");
  console.log("2) Configure locked MCP (context_status + context_pack only):");
  console.log("examples/claude-code/ab/context-broker-locked.mcp.json");
  console.log("Set MCP_TOOL_PROFILE=codex_locked (alias: locked)");
  console.log("");
  console.log("3) No MCP baseline (3 repeats):");
  console.log("AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode no_mcp --repo . --task auth-discovery --repeat 3 --yes");
  console.log("");
  console.log("4) Locked broker (3 repeats):");
  console.log("npm run telemetry:clean");
  console.log("AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode context_broker_locked --repo . --task auth-discovery --repeat 3 --yes");
  console.log("");
  console.log("5) Usage requirement:");
  console.log("- Parser reads structured usage fields only (input_tokens, output_tokens, cache fields).");
  console.log("- If CLI output lacks usage, record manually: npm run ab:record -- --mode ... --client-total-tokens <n>");
  console.log("- Never estimate tokens from transcript length.");
  console.log("");
  console.log("6) Reports and proof gate:");
  console.log("npm run ab:claude:ingest");
  console.log("npm run ab:claude:report");
  console.log("npm run ab:claude:real-check");
  console.log("");
  console.log("Optional adapter config: .mcp-ab-tests/claude-adapter.json");
  console.log("This command does not run Claude or claim savings.");
}

main();
