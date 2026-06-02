import { readTelemetryEntries } from "../telemetry/reader.js";

export interface AbTelemetrySummary {
  totalMcpToolCalls: number;
  estimatedMcpOutputTokens: number;
  largestResponseChars: number;
  toolsUsed: string[];
  callsByTool: Record<string, number>;
}

export function readMcpTelemetryForAb(): AbTelemetrySummary | null {
  const entries = readTelemetryEntries();
  if (entries.length === 0) {
    return null;
  }

  const callsByTool: Record<string, number> = {};
  let estimatedMcpOutputTokens = 0;
  let largestResponseChars = 0;

  for (const entry of entries) {
    estimatedMcpOutputTokens += entry.estimatedOutputTokens;
    largestResponseChars = Math.max(largestResponseChars, entry.outputChars);
    callsByTool[entry.tool] = (callsByTool[entry.tool] ?? 0) + 1;
  }

  return {
    totalMcpToolCalls: entries.length,
    estimatedMcpOutputTokens,
    largestResponseChars,
    toolsUsed: Object.keys(callsByTool).sort(),
    callsByTool,
  };
}
