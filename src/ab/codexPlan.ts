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
    client: "codex",
    repoPath: path.resolve("."),
    taskName,
    taskPrompt: DEFAULT_TASK_PROMPT,
    modes: ["no_mcp", "context_broker", "context_broker_locked"],
    notes:
      "Experimental Codex A/B plan. Do not claim savings until ab:real-check has real Codex usage data. Locked mode is the primary proof path for Codex.",
  };

  writeJsonFile(planFilePath(plan.id), plan);
  writeCurrentPlan(plan);

  console.log("Codex A/B plan helper");
  console.log("");
  console.log(`Created A/B plan: ${plan.id}`);
  console.log("client=codex");
  console.log("task=auth-discovery");
  console.log("");
  console.log("1) Build and preflight context route:");
  console.log("npm run build");
  console.log("npm run graph:build");
  console.log("npm run context:build");
  console.log("npm run telemetry:context-test");
  console.log("");
  console.log("2) No MCP:");
  console.log("AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode no_mcp --repo . --repeat 3 --yes");
  console.log("");
  console.log("3) D1 context broker, full toolset:");
  console.log("npm run telemetry:clean");
  console.log("AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker --repo . --repeat 3 --yes");
  console.log("npm run telemetry:report");
  console.log("");
  console.log("4) D2 locked context broker, Codex proof path:");
  console.log("npm run telemetry:clean");
  console.log("AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --repeat 3 --yes");
  console.log("npm run telemetry:report");
  console.log("");
  console.log("5) Final reports and proof gate:");
  console.log("npm run ab:report");
  console.log("npm run ab:compare");
  console.log("npm run ab:real-check");
  console.log("");
  console.log("Warning: If Codex usage cannot be parsed automatically, manually record real Codex usage numbers before running ab:real-check.");
  console.log("This command does not run Codex or claim savings.");
}

main();
