import fs from "node:fs";
import path from "node:path";
import { analyzeTelemetry } from "./analyze.js";
import { readTelemetryEntries } from "./reader.js";
import {
  EXCESSIVE_OUTPUT_CHARS,
  TELEMETRY_DIR,
  TELEMETRY_LOG_FILE,
  TELEMETRY_REPORT_FILE,
  type TelemetryEntry,
} from "./types.js";

function formatEntryLine(entry: TelemetryEntry): string {
  const status = entry.success ? "success" : "error";
  return `- ${entry.timestamp} | ${entry.tool} | ${status} | ${entry.outputChars.toLocaleString()} chars (~${entry.estimatedOutputTokens.toLocaleString()} tokens) | ${entry.durationMs}ms`;
}

function renderReport(analysis: ReturnType<typeof analyzeTelemetry>): string {
  const topTools = analysis.toolStats.slice(0, 5);
  const warnings =
    analysis.excessiveOutputWarnings.length > 0
      ? analysis.excessiveOutputWarnings.map(
          (warning) =>
            `- ${warning.timestamp} | ${warning.tool} returned ${warning.outputChars.toLocaleString()} chars (~${warning.estimatedOutputTokens.toLocaleString()} tokens), above the ${EXCESSIVE_OUTPUT_CHARS.toLocaleString()}-char warning threshold`,
        )
      : ["- No excessively large outputs detected."];

  const largestResponses =
    analysis.largestResponses.length > 0
      ? analysis.largestResponses.map(
          (entry) =>
            `- ${entry.timestamp} | ${entry.tool} | ${entry.outputChars.toLocaleString()} chars (~${entry.estimatedOutputTokens.toLocaleString()} tokens)`,
        )
      : ["- No tool calls recorded yet."];

  const savings = analysis.savingsOpportunities.map((item) => `- ${item}`);
  const recommendations = analysis.recommendations.map((item) => `- ${item}`);
  const lastCalls = analysis.lastCalls.map((entry) => formatEntryLine(entry));
  const durationByTool = analysis.toolStats.map(
    (stats) => `- ${stats.tool}: ${stats.avgDurationMs.toLocaleString()} ms average over ${stats.calls} call(s)`,
  );
  const tokenCostByTool = analysis.toolStats.map(
    (stats) =>
      `- ${stats.tool}: ~${Math.round(stats.estimatedOutputTokens / Math.max(stats.calls, 1)).toLocaleString()} tokens per call (${stats.estimatedOutputTokens.toLocaleString()} total)`,
  );

  return `# repo-context-mcp Telemetry Report

Generated: ${new Date().toISOString()}
Log file: \`${TELEMETRY_LOG_FILE}\`

## Overview

- Total tool calls: ${analysis.totalCalls}
- Estimated total tokens returned by MCP tools: ${analysis.estimatedTotalTokens.toLocaleString()}
- Average response size: ${analysis.avgResponseChars.toLocaleString()} chars (~${Math.ceil(analysis.avgResponseChars / 4).toLocaleString()} tokens)
- Successful calls: ${analysis.successfulCalls}
- Failed calls: ${analysis.failedCalls}

## Top Most-Used Tools

${topTools.length ? topTools.map((stats) => `- ${stats.tool}: ${stats.calls} call(s)`).join("\n") : "- No tool calls recorded yet."}

## Largest Responses

${largestResponses.join("\n")}

## Estimated Token Savings Opportunities

${savings.join("\n")}

## Warnings

${warnings.join("\n")}

## Recommendations for Reducing MCP Context Size

${recommendations.join("\n")}

## Paste this report into ChatGPT for optimization advice

Use this section as a compact handoff for ChatGPT. Ask it to suggest tool-level changes that reduce MCP context while preserving usefulness.

### Summary for ChatGPT

- Total MCP tool calls: ${analysis.totalCalls}
- Estimated MCP output tokens: ${analysis.estimatedTotalTokens.toLocaleString()}
- Average response size: ${analysis.avgResponseChars.toLocaleString()} chars
- Most-used tools: ${topTools.map((stats) => `${stats.tool} (${stats.calls})`).join(", ") || "none"}
- Largest observed response: ${analysis.largestResponses[0]?.outputChars.toLocaleString() ?? 0} chars
- Failed calls: ${analysis.failedCalls}

### Last 20 MCP Tool Calls

${lastCalls.length ? lastCalls.join("\n") : "- No tool calls recorded yet."}

### Average Duration by Tool

${durationByTool.length ? durationByTool.join("\n") : "- No timing data yet."}

### Estimated Token Cost by Tool

${tokenCostByTool.length ? tokenCostByTool.join("\n") : "- No token cost data yet."}
`;
}

export function generateTelemetryReport(logFile = TELEMETRY_LOG_FILE, reportFile = TELEMETRY_REPORT_FILE): string {
  const entries = readTelemetryEntries(logFile);
  const analysis = analyzeTelemetry(entries);
  const markdown = renderReport(analysis);

  fs.mkdirSync(path.resolve(TELEMETRY_DIR), { recursive: true });
  fs.writeFileSync(path.resolve(reportFile), markdown, "utf8");
  return path.resolve(reportFile);
}

if (process.argv[1]?.endsWith("report.js")) {
  const reportPath = generateTelemetryReport();
  console.log(`Telemetry report written to ${reportPath}`);
}
