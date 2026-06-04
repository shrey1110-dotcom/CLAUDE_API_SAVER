import { asMode, parseCliArgs, readStringArg } from "./cli.js";
import { getModePrompt } from "./prompts.js";
import { readCurrentPlan } from "./paths.js";

function usage(): string {
  return "Usage: npm run ab:prompt -- --mode <no_mcp|compact_search|graph|context_broker|context_broker_locked>";
}

function main(): void {
  const args = parseCliArgs();
  const mode = asMode(readStringArg(args, "mode"));
  const plan = readCurrentPlan();

  if (!mode) {
    console.error(usage());
    process.exit(1);
  }
  if (!plan) {
    console.error("No active A/B plan found. Run npm run ab:create first.");
    process.exit(1);
  }

  const prompt = getModePrompt(mode, plan.taskPrompt);
  console.log(`# A/B Prompt (${mode})`);
  console.log("");
  console.log(prompt);
  console.log("");
  if (mode !== "no_mcp") {
    console.log("Tip: run `npm run telemetry:clean` before this MCP-enabled mode and `npm run telemetry:report` after the run.");
  }
}

main();
