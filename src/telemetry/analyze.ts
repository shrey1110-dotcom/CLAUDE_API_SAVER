import {
  EXCESSIVE_OUTPUT_CHARS,
  EXCESSIVE_OUTPUT_TOKENS,
  type TelemetryAnalysis,
  type TelemetryEntry,
  type ToolStats,
} from "./types.js";

function buildToolStats(entries: TelemetryEntry[]): ToolStats[] {
  const grouped = new Map<string, TelemetryEntry[]>();

  for (const entry of entries) {
    const bucket = grouped.get(entry.tool) ?? [];
    bucket.push(entry);
    grouped.set(entry.tool, bucket);
  }

  return [...grouped.entries()]
    .map(([tool, toolEntries]) => {
      const totalOutputChars = toolEntries.reduce((sum, entry) => sum + entry.outputChars, 0);
      const totalDurationMs = toolEntries.reduce((sum, entry) => sum + entry.durationMs, 0);
      const estimatedOutputTokens = toolEntries.reduce((sum, entry) => sum + entry.estimatedOutputTokens, 0);

      return {
        tool,
        calls: toolEntries.length,
        totalOutputChars,
        estimatedOutputTokens,
        avgOutputChars: Math.round(totalOutputChars / toolEntries.length),
        avgDurationMs: Math.round(totalDurationMs / toolEntries.length),
        errors: toolEntries.filter((entry) => !entry.success).length,
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

function buildSavingsOpportunities(toolStats: ToolStats[]): string[] {
  const opportunities: string[] = [];

  for (const stats of toolStats) {
    if (stats.avgOutputChars > 8_000) {
      opportunities.push(
        `${stats.tool} averages ${stats.avgOutputChars.toLocaleString()} chars (~${Math.ceil(stats.avgOutputChars / 4).toLocaleString()} tokens). Consider lowering limits or narrowing inputs.`,
      );
    }

    if (stats.tool === "search_code" && stats.avgOutputChars > 4_000) {
      opportunities.push("search_code responses are large. Try smaller maxResults or more specific queries.");
    }

    if (stats.tool === "get_symbol_context" && stats.avgOutputChars > 3_000) {
      opportunities.push("get_symbol_context may be returning wide blocks. Reduce maxResults or target narrower symbols.");
    }

    if (stats.tool === "repo_map" && stats.avgOutputChars > 6_000) {
      opportunities.push("repo_map tree output may be too verbose for large repos. Consider shallow tree depth in a future version.");
    }
  }

  if (opportunities.length === 0) {
    opportunities.push("No major savings opportunities detected yet. Collect more telemetry during real client sessions.");
  }

  return opportunities;
}

function buildRecommendations(toolStats: ToolStats[], entries: TelemetryEntry[]): string[] {
  const recommendations = [
    "Prefer repo_map and get_project_commands before broad file reads.",
    "Use search_code with low maxResults before requesting symbol context.",
    "Use get_file_outline instead of returning whole files when possible.",
    "Keep get_symbol_context maxResults at 3-5 unless necessary.",
  ];

  const failed = entries.filter((entry) => !entry.success);
  if (failed.length > 0) {
    recommendations.push(`Review ${failed.length} failed tool call(s) and tighten input validation or defaults.`);
  }

  const slowTools = toolStats.filter((stats) => stats.avgDurationMs > 500);
  for (const stats of slowTools) {
    recommendations.push(`${stats.tool} averages ${stats.avgDurationMs}ms. Cache or narrow its inputs if latency matters.`);
  }

  return recommendations;
}

export function analyzeTelemetry(entries: TelemetryEntry[]): TelemetryAnalysis {
  const successfulCalls = entries.filter((entry) => entry.success).length;
  const totalOutputChars = entries.reduce((sum, entry) => sum + entry.outputChars, 0);
  const estimatedTotalTokens = entries.reduce((sum, entry) => sum + entry.estimatedOutputTokens, 0);
  const callsByTool = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.tool] = (acc[entry.tool] ?? 0) + 1;
    return acc;
  }, {});

  const toolStats = buildToolStats(entries);
  const largestResponses = [...entries].sort((a, b) => b.outputChars - a.outputChars).slice(0, 10);
  const lastCalls = [...entries].slice(-20);

  const excessiveOutputWarnings = entries
    .filter((entry) => entry.outputChars >= EXCESSIVE_OUTPUT_CHARS || entry.estimatedOutputTokens >= EXCESSIVE_OUTPUT_TOKENS)
    .map((entry) => ({
      tool: entry.tool,
      outputChars: entry.outputChars,
      estimatedOutputTokens: entry.estimatedOutputTokens,
      timestamp: entry.timestamp,
    }));

  return {
    totalCalls: entries.length,
    successfulCalls,
    failedCalls: entries.length - successfulCalls,
    callsByTool,
    totalOutputChars,
    estimatedTotalTokens,
    avgResponseChars: entries.length ? Math.round(totalOutputChars / entries.length) : 0,
    toolStats,
    largestResponses,
    lastCalls,
    excessiveOutputWarnings,
    savingsOpportunities: buildSavingsOpportunities(toolStats),
    recommendations: buildRecommendations(toolStats, entries),
  };
}
