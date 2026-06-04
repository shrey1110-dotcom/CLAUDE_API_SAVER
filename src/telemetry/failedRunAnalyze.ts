import { assessContextBrokerToolLoop, type ToolLoopAssessment } from "../ab/toolLoopPolicy.js";
import { analyzeTelemetry } from "./analyze.js";
import { readTelemetryEntries } from "./reader.js";
import type { TelemetryEntry } from "./types.js";

export interface FailedCodexRunAnalysis {
  logFile: string;
  entries: TelemetryEntry[];
  telemetry: ReturnType<typeof analyzeTelemetry>;
  toolLoop: ToolLoopAssessment;
  callSequence: string[];
  unnecessaryTools: string[];
  contextPackOverCalled: boolean;
  graphAmplifiedLoop: boolean;
}

export function analyzeFailedCodexLog(logFile: string): FailedCodexRunAnalysis {
  const entries = readTelemetryEntries(logFile);
  const telemetry = analyzeTelemetry(entries);
  const toolLoop = assessContextBrokerToolLoop({ entries, counts: telemetry.callsByTool, totalCalls: telemetry.totalCalls });
  const unnecessaryTools = [...new Set(entries.map((entry) => entry.tool))].filter(
    (tool) => tool !== "context_status" && tool !== "context_pack",
  );

  return {
    logFile,
    entries,
    telemetry,
    toolLoop,
    callSequence: entries.map((entry) => entry.tool),
    unnecessaryTools,
    contextPackOverCalled: (telemetry.callsByTool.context_pack ?? 0) > 1,
    graphAmplifiedLoop:
      toolLoop.graphToolCalls > 2 ||
      toolLoop.symbolToolCalls > 2 ||
      toolLoop.repeatedLoopPattern,
  };
}

export function formatFailedCodexAnalysis(analysis: FailedCodexRunAnalysis): string {
  const lines: string[] = [];
  lines.push("Failed Codex full context_broker telemetry analysis");
  lines.push("");
  lines.push(`Log file: ${analysis.logFile}`);
  lines.push(`Total tool calls: ${analysis.telemetry.totalCalls}`);
  lines.push(`Estimated MCP output tokens: ${analysis.telemetry.estimatedTotalTokens}`);
  lines.push("");
  lines.push("Call counts by tool:");
  for (const stats of analysis.telemetry.toolStats) {
    lines.push(`- ${stats.tool}: ${stats.calls} calls, ~${stats.estimatedOutputTokens} tokens`);
  }
  lines.push("");
  lines.push("Largest responses:");
  for (const entry of analysis.telemetry.largestResponses.slice(0, 5)) {
    lines.push(`- ${entry.tool}: ${entry.outputChars} chars (~${entry.estimatedOutputTokens} tokens)`);
  }
  lines.push("");
  lines.push(`Tool call sequence (first 30): ${analysis.callSequence.slice(0, 30).join(" -> ")}`);
  lines.push("");
  if (analysis.toolLoop.firstRouteDriftAfterContextPack) {
    const drift = analysis.toolLoop.firstRouteDriftAfterContextPack;
    lines.push(
      `First route drift after context_pack: call #${drift.index + 1} used ${drift.tool} at ${drift.timestamp}`,
    );
  } else {
    lines.push("First route drift after context_pack: not detected");
  }
  lines.push(`Unnecessary/fallback tools used: ${analysis.unnecessaryTools.length ? analysis.unnecessaryTools.join(", ") : "none"}`);
  lines.push(`context_pack called more than expected: ${analysis.contextPackOverCalled ? "yes" : "no"}`);
  lines.push(`graph/symbol loop amplified: ${analysis.graphAmplifiedLoop ? "yes" : "no"}`);
  lines.push(`Repeated loop pattern: ${analysis.toolLoop.repeatedLoopPattern ? "yes" : "no"}`);
  lines.push(`Tool-loop failure: ${analysis.toolLoop.toolLoopFailure ? "yes" : "no"}`);
  if (analysis.toolLoop.reasons.length > 0) {
    lines.push("Failure reasons:");
    for (const reason of analysis.toolLoop.reasons) {
      lines.push(`- ${reason}`);
    }
  }
  if (analysis.toolLoop.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of analysis.toolLoop.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join("\n");
}
