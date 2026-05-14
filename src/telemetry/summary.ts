import { analyzeTelemetry } from "./analyze.js";
import { readTelemetryEntries } from "./reader.js";
import { TELEMETRY_LOG_FILE } from "./types.js";

function printSummary(): void {
  const entries = readTelemetryEntries();
  const analysis = analyzeTelemetry(entries);

  console.log(`Telemetry log: ${TELEMETRY_LOG_FILE}`);
  console.log(`Total tool calls: ${analysis.totalCalls}`);
  console.log(`Successful calls: ${analysis.successfulCalls}`);
  console.log(`Failed calls: ${analysis.failedCalls}`);
  console.log("");

  console.log("Calls by tool:");
  for (const [tool, count] of Object.entries(analysis.callsByTool).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tool}: ${count}`);
  }
  console.log("");

  console.log(`Total output chars: ${analysis.totalOutputChars.toLocaleString()}`);
  console.log(`Estimated output tokens: ${analysis.estimatedTotalTokens.toLocaleString()}`);
  console.log(`Average response size: ${analysis.avgResponseChars.toLocaleString()} chars`);
  console.log("");

  console.log("Average output size by tool:");
  for (const stats of analysis.toolStats) {
    console.log(
      `  ${stats.tool}: ${stats.avgOutputChars.toLocaleString()} chars (~${Math.ceil(stats.avgOutputChars / 4).toLocaleString()} tokens), ${stats.avgDurationMs}ms avg`,
    );
  }
  console.log("");

  console.log("Largest 10 tool responses:");
  if (analysis.largestResponses.length === 0) {
    console.log("  (none)");
  } else {
    for (const entry of analysis.largestResponses) {
      console.log(
        `  ${entry.timestamp} | ${entry.tool} | ${entry.outputChars.toLocaleString()} chars (~${entry.estimatedOutputTokens.toLocaleString()} tokens) | ${entry.durationMs}ms`,
      );
    }
  }
}

printSummary();
