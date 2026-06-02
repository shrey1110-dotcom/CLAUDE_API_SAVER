import { readCurrentPlan, readPlanResults } from "./paths.js";
import type { AbRunResult } from "./types.js";

type RealCheckStatus =
  | "PROVEN SAVINGS"
  | "NO MEANINGFUL CHANGE"
  | "INCREASED USAGE"
  | "ROUTING FAILURE"
  | "INCOMPLETE TEST"
  | "QUALITY REGRESSION";

function findMode(results: AbRunResult[], mode: "no_mcp" | "context_broker"): AbRunResult | undefined {
  return results.find((result) => result.mode === mode);
}

function hasContextPack(result: AbRunResult | undefined): boolean {
  const tools = [...(result?.mcpToolsUsed ?? []), ...(result?.toolsUsed ?? [])].map((tool) => tool.toLowerCase());
  return tools.some((tool) => tool === "context_pack" || tool.includes("context_pack"));
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function main(): void {
  const plan = readCurrentPlan();
  if (!plan) {
    console.error("No active A/B plan found. Run npm run ab:create first.");
    process.exit(1);
  }

  const results = readPlanResults(plan.id);
  const baseline = findMode(results, "no_mcp");
  const broker = findMode(results, "context_broker");

  let status: RealCheckStatus = "INCOMPLETE TEST";
  const reasons: string[] = [];

  if (!baseline || !broker) {
    reasons.push("Both no_mcp and context_broker runs are required.");
  } else if (!hasContextPack(broker)) {
    status = "ROUTING FAILURE";
    reasons.push("context_broker mode did not use context_pack.");
  } else if (
    !hasNumber(baseline.clientTotalTokens) ||
    !hasNumber(broker.clientTotalTokens) ||
    !hasNumber(broker.mcpEstimatedOutputTokens)
  ) {
    reasons.push("Real client total tokens are required for no_mcp and context_broker runs.");
    if (plan.client === "codex") {
      reasons.push("Codex usage must be auto-parsed from real output or manually recorded with ab:record.");
    }
  } else if (!hasNumber(baseline.answerQuality) || !hasNumber(broker.answerQuality)) {
    reasons.push("Answer quality scores are required for no_mcp and context_broker runs.");
  } else if (broker.answerQuality < baseline.answerQuality || broker.foundExpectedFiles !== true) {
    status = "QUALITY REGRESSION";
    reasons.push("context_broker answer quality is lower than baseline or expected files were not found.");
  } else {
    const combined = broker.clientTotalTokens + broker.mcpEstimatedOutputTokens;
    const delta = baseline.clientTotalTokens - combined;
    if (delta > 0) {
      status = "PROVEN SAVINGS";
    } else if (delta === 0) {
      status = "NO MEANINGFUL CHANGE";
    } else {
      status = "INCREASED USAGE";
    }
    console.log(`baseline_client_total_tokens=${baseline.clientTotalTokens}`);
    console.log(`context_broker_client_total_tokens=${broker.clientTotalTokens}`);
    console.log(`context_broker_mcp_tokens=${broker.mcpEstimatedOutputTokens}`);
    console.log(`context_broker_combined_total=${combined}`);
    console.log(`savings_vs_baseline=${delta}`);
    if (plan.client === "codex") {
      const noMcpSource = baseline.usageParsed ? "auto-parsed" : baseline.usageManuallyEntered ? "manual" : "missing";
      const brokerSource = broker.usageParsed ? "auto-parsed" : broker.usageManuallyEntered ? "manual" : "missing";
      console.log(`codex_no_mcp_usage_source=${noMcpSource}`);
      console.log(`codex_context_broker_usage_source=${brokerSource}`);
    }
  }

  console.log(`ab_real_check_status=${status}`);
  if (reasons.length > 0) {
    console.log("reasons:");
    for (const reason of reasons) {
      console.log(`- ${reason}`);
    }
  }

  if (status !== "PROVEN SAVINGS") {
    process.exit(1);
  }
}

main();
