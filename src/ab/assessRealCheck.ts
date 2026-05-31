import fs from "node:fs";
import { extractMcpToolsFromCodexTranscript } from "./authDiscoveryQuality.js";
import { combinedRepeatStats, clientRepeatStats } from "./repeatStats.js";
import { assessContextBrokerToolLoop } from "./toolLoopPolicy.js";
import type { AbRunResult, AbTestPlan } from "./types.js";

export type RealCheckStatus =
  | "PROVEN_SAVINGS"
  | "PROVEN_SAVINGS_STABLE"
  | "PROMISING_BUT_UNSTABLE"
  | "NO_MEANINGFUL_CHANGE"
  | "INCREASED_USAGE"
  | "INCREASED_USAGE_STABLE"
  | "INCREASED_USAGE_WITH_OUTLIER"
  | "TOOL_LOOP_FAILURE"
  | "ROUTING_FAILURE"
  | "INCOMPLETE_TEST"
  | "QUALITY_REGRESSION";

const LOCKED_FORBIDDEN_TOOLS = [
  "graph_query",
  "graph_symbol",
  "graph_neighbors",
  "graph_paths",
  "repo_map",
  "search_code",
  "get_symbol_context",
];

const REQUIRED_REPEATS = 3;

function findMode(results: AbRunResult[], mode: "no_mcp" | "context_broker_locked"): AbRunResult | undefined {
  return results.find((result) => result.mode === mode);
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toolsFromResult(result: AbRunResult | undefined): string[] {
  const tools = [...(result?.mcpToolsUsed ?? []), ...(result?.toolsUsed ?? [])].map((tool) => tool.toLowerCase());
  const stdoutPath = result?.adapterStdoutPath;
  const text =
    stdoutPath && fs.existsSync(stdoutPath)
      ? fs.readFileSync(stdoutPath, "utf8")
      : result?.transcriptPath && fs.existsSync(result.transcriptPath)
        ? fs.readFileSync(result.transcriptPath, "utf8")
        : "";
  if (text.length > 0) {
    tools.push(...extractMcpToolsFromCodexTranscript(text).map((tool) => tool.toLowerCase()));
  }
  return [...new Set(tools)];
}

function hasContextPack(result: AbRunResult | undefined): boolean {
  return toolsFromResult(result).some((tool) => tool === "context_pack" || tool.includes("context_pack"));
}

function hasContextStatus(result: AbRunResult | undefined): boolean {
  return toolsFromResult(result).some((tool) => tool === "context_status" || tool.includes("context_status"));
}

function forbiddenLockedTools(result: AbRunResult | undefined): string[] {
  const tools = toolsFromResult(result);
  return LOCKED_FORBIDDEN_TOOLS.filter((bad) => tools.some((tool) => tool === bad || tool.includes(bad)));
}

function lockedRoutingFailure(result: AbRunResult | undefined): string | null {
  if (!result) return null;
  const forbidden = forbiddenLockedTools(result);
  if (forbidden.length > 0) {
    return `context_broker_locked used forbidden tools: ${forbidden.join(", ")}.`;
  }
  if (!hasContextStatus(result) || !hasContextPack(result)) {
    return "context_status/context_pack not both present.";
  }
  const counts = result.mcpToolCallCounts;
  if (counts && Object.keys(counts).length > 0) {
    const contextPackCalls = counts.context_pack ?? 0;
    const contextStatusCalls = counts.context_status ?? 0;
    const totalCalls = result.mcpToolCalls ?? contextPackCalls + contextStatusCalls;
    const repeats = Math.max(1, result.adapterRunCount ?? result.clientTotalTokenRepeats?.length ?? 1);
    if (contextPackCalls > repeats || contextStatusCalls > repeats || totalCalls > repeats * 2) {
      return `context_broker_locked made ${totalCalls} MCP calls (context_status=${contextStatusCalls}, context_pack=${contextPackCalls}).`;
    }
    return null;
  }
  const tools = toolsFromResult(result);
  if (tools.length > 2) {
    return `context_broker_locked used unexpected tools: ${tools.join(", ")}.`;
  }
  return null;
}

function savingsPercent(baseline: number, candidate: number): number {
  return ((baseline - candidate) / baseline) * 100;
}

function clientLabel(client: AbTestPlan["client"]): string {
  if (client === "claude_code" || client === "claude_desktop") return "Claude";
  if (client === "codex") return "Codex";
  return "Client";
}

export interface RealCheckAssessment {
  status: RealCheckStatus;
  reasons: string[];
  logs: string[];
}

export function assessRealCheck(plan: AbTestPlan, results: AbRunResult[]): RealCheckAssessment {
  const baseline = findMode(results, "no_mcp");
  const locked = findMode(results, "context_broker_locked");
  const fullBroker = results.find((result) => result.mode === "context_broker");
  const reasons: string[] = [];
  const logs: string[] = [];
  let status: RealCheckStatus = "INCOMPLETE_TEST";
  const label = clientLabel(plan.client);

  if (fullBroker) {
    const loop = assessContextBrokerToolLoop({
      counts: fullBroker.mcpToolCallCounts ?? {},
      totalCalls: fullBroker.mcpToolCalls,
    });
    const baselineCombined = baseline ? combinedRepeatStats(baseline) : undefined;
    const brokerCombined = combinedRepeatStats(fullBroker);
    if (loop.toolLoopFailure && baselineCombined && brokerCombined && brokerCombined.mean > baselineCombined.mean) {
      logs.push("context_broker_diagnostic=TOOL_LOOP_FAILURE");
      for (const reason of loop.reasons) {
        logs.push(`context_broker_loop_reason=${reason}`);
      }
    }
  }

  if (!baseline) {
    reasons.push("no_mcp baseline result is missing.");
  } else if (!baseline.clientTotalTokenRepeats || baseline.clientTotalTokenRepeats.length < REQUIRED_REPEATS) {
    reasons.push(`no_mcp needs ${REQUIRED_REPEATS} real repeats (have ${baseline.clientTotalTokenRepeats?.length ?? 0}).`);
  } else if (!hasNumber(baseline.answerQuality)) {
    reasons.push(`no_mcp answer quality is missing (use ingest or ab:record).`);
  } else if (!baseline.usageParsed && !baseline.usageManuallyEntered) {
    reasons.push(`${label} baseline usage must be auto-parsed or manually entered.`);
  }

  if (!locked) {
    reasons.push("context_broker_locked result is missing.");
  } else {
    const lockedRepeats = locked.clientTotalTokenRepeats?.length ?? 0;
    if (lockedRepeats < REQUIRED_REPEATS) {
      reasons.push(`context_broker_locked needs ${REQUIRED_REPEATS} real repeats (have ${lockedRepeats}).`);
    }
    if (!locked.usageParsed && !locked.usageManuallyEntered) {
      reasons.push(`Locked ${label} usage must be auto-parsed or manually entered.`);
    }
    if (!hasNumber(locked.answerQuality)) {
      reasons.push("context_broker_locked answer quality is missing.");
    }
    const routingFailure = lockedRoutingFailure(locked);
    if (routingFailure) {
      status = "ROUTING_FAILURE";
      reasons.push(routingFailure);
    }
  }

  if (reasons.length === 0 && baseline && locked) {
    if (locked.foundExpectedFiles !== true) {
      status = "QUALITY_REGRESSION";
      reasons.push("Locked mode did not find all expected auth-discovery files.");
    } else if ((locked.answerQuality ?? 0) < (baseline.answerQuality ?? 0)) {
      status = "QUALITY_REGRESSION";
      reasons.push("Locked quality is lower than no_mcp baseline.");
    } else {
      const baselineCombined = combinedRepeatStats(baseline);
      const lockedCombined = combinedRepeatStats(locked);
      if (!baselineCombined || !lockedCombined) {
        reasons.push("Combined repeat stats are missing.");
      } else {
        const meanSavings = savingsPercent(baselineCombined.mean, lockedCombined.mean);
        const medianSavings = savingsPercent(baselineCombined.median, lockedCombined.median);

        logs.push(`baseline_client_mean=${baselineCombined.mean}`);
        logs.push(`baseline_client_median=${baselineCombined.median}`);
        logs.push(`locked_client_mean=${clientRepeatStats(locked)?.mean ?? "-"}`);
        logs.push(`locked_client_median=${clientRepeatStats(locked)?.median ?? "-"}`);
        logs.push(`locked_mcp_tokens_total=${locked.mcpEstimatedOutputTokens ?? 0}`);
        logs.push(`locked_combined_mean=${lockedCombined.mean}`);
        logs.push(`locked_combined_median=${lockedCombined.median}`);
        logs.push(`mean_savings_percent=${meanSavings.toFixed(1)}`);
        logs.push(`median_savings_percent=${medianSavings.toFixed(1)}`);

        if (medianSavings >= 5 && meanSavings >= 5 && !lockedCombined.outlierWarning) {
          status = "PROVEN_SAVINGS_STABLE";
        } else if (medianSavings >= 5 && meanSavings < 0 && lockedCombined.outlierWarning) {
          status = "PROMISING_BUT_UNSTABLE";
        } else if (meanSavings < -5 && medianSavings < -5) {
          status = lockedCombined.outlierWarning ? "INCREASED_USAGE_WITH_OUTLIER" : "INCREASED_USAGE_STABLE";
        } else if (meanSavings > 0 || medianSavings > 0) {
          status = "PROVEN_SAVINGS";
        } else {
          status = "NO_MEANINGFUL_CHANGE";
        }
      }
    }
  }

  return { status, reasons, logs };
}
// proof gate mirrors codex real-check rules
