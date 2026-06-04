import type { TelemetryEntry } from "../telemetry/types.js";

export const CONTEXT_BROKER_BUDGET = {
  contextStatusMax: 2,
  contextPackMax: 2,
  graphToolsMax: 2,
  getSymbolContextMax: 2,
  totalWarning: 6,
  totalFailure: 10,
} as const;

export const GRAPH_TOOLS = ["graph_query", "graph_symbol", "graph_neighbors", "graph_paths"] as const;
export const SYMBOL_TOOLS = ["get_symbol_context"] as const;
export const FALLBACK_TOOLS = [
  ...GRAPH_TOOLS,
  ...SYMBOL_TOOLS,
  "repo_map",
  "search_code",
  "get_project_commands",
] as const;

export const LOCKED_ALLOWED_TOOLS = ["context_status", "context_pack"] as const;

export interface ToolCallCounts {
  [tool: string]: number;
}

export interface ToolLoopAssessment {
  totalCalls: number;
  counts: ToolCallCounts;
  graphToolCalls: number;
  symbolToolCalls: number;
  fallbackToolCalls: number;
  toolLoopFailure: boolean;
  routingFailure: boolean;
  toolLoopWarning: boolean;
  repeatedLoopPattern: boolean;
  firstRouteDriftAfterContextPack?: {
    index: number;
    tool: string;
    timestamp: string;
  };
  reasons: string[];
  warnings: string[];
}

function sumCounts(counts: ToolCallCounts, tools: readonly string[]): number {
  return tools.reduce((sum, tool) => sum + (counts[tool] ?? 0), 0);
}

export function countsFromEntries(entries: TelemetryEntry[]): ToolCallCounts {
  const counts: ToolCallCounts = {};
  for (const entry of entries) {
    counts[entry.tool] = (counts[entry.tool] ?? 0) + 1;
  }
  return counts;
}

export function countsFromRecord(record: Record<string, number> | undefined): ToolCallCounts {
  return { ...(record ?? {}) };
}

export function totalCallsFromCounts(counts: ToolCallCounts): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export function findFirstRouteDriftAfterContextPack(
  entries: TelemetryEntry[],
): ToolLoopAssessment["firstRouteDriftAfterContextPack"] {
  const firstPackIndex = entries.findIndex((entry) => entry.tool === "context_pack");
  if (firstPackIndex < 0) return undefined;

  for (let index = firstPackIndex + 1; index < entries.length; index += 1) {
    const entry = entries[index];
    if (FALLBACK_TOOLS.some((tool) => entry.tool === tool || entry.tool.includes(tool))) {
      return { index, tool: entry.tool, timestamp: entry.timestamp };
    }
    if (entry.tool === "context_pack" && index > firstPackIndex) {
      return { index, tool: entry.tool, timestamp: entry.timestamp };
    }
  }
  return undefined;
}

export function detectRepeatedLoopPattern(entries: TelemetryEntry[]): boolean {
  const loopTools = new Set<string>([...GRAPH_TOOLS, ...SYMBOL_TOOLS]);
  let previous = "";
  let streak = 0;
  for (const entry of entries) {
    if (!loopTools.has(entry.tool)) {
      previous = "";
      streak = 0;
      continue;
    }
    if (entry.tool === previous) {
      streak += 1;
      if (streak >= 3) return true;
    } else {
      previous = entry.tool;
      streak = 1;
    }
  }
  return false;
}

export function assessContextBrokerToolLoop(input: {
  counts?: ToolCallCounts;
  totalCalls?: number;
  entries?: TelemetryEntry[];
}): ToolLoopAssessment {
  const counts = input.counts ?? (input.entries ? countsFromEntries(input.entries) : {});
  const totalCalls = input.totalCalls ?? totalCallsFromCounts(counts);
  const graphToolCalls = sumCounts(counts, GRAPH_TOOLS);
  const symbolToolCalls = sumCounts(counts, SYMBOL_TOOLS);
  const fallbackToolCalls = sumCounts(counts, FALLBACK_TOOLS);
  const reasons: string[] = [];
  const warnings: string[] = [];

  if ((counts.context_status ?? 0) > CONTEXT_BROKER_BUDGET.contextStatusMax) {
    reasons.push(`context_status called ${counts.context_status} times (max ${CONTEXT_BROKER_BUDGET.contextStatusMax}).`);
  }
  if ((counts.context_pack ?? 0) > CONTEXT_BROKER_BUDGET.contextPackMax) {
    reasons.push(`context_pack called ${counts.context_pack} times (max ${CONTEXT_BROKER_BUDGET.contextPackMax}).`);
  }
  if (graphToolCalls > CONTEXT_BROKER_BUDGET.graphToolsMax) {
    reasons.push(`graph tools called ${graphToolCalls} times (max ${CONTEXT_BROKER_BUDGET.graphToolsMax}).`);
  }
  if (symbolToolCalls > CONTEXT_BROKER_BUDGET.getSymbolContextMax) {
    reasons.push(`get_symbol_context called ${symbolToolCalls} times (max ${CONTEXT_BROKER_BUDGET.getSymbolContextMax}).`);
  }
  if (totalCalls > CONTEXT_BROKER_BUDGET.totalWarning) {
    warnings.push(`total MCP calls ${totalCalls} exceeds warning threshold ${CONTEXT_BROKER_BUDGET.totalWarning}.`);
  }
  if (totalCalls > CONTEXT_BROKER_BUDGET.totalFailure) {
    reasons.push(`total MCP calls ${totalCalls} exceeds failure threshold ${CONTEXT_BROKER_BUDGET.totalFailure}.`);
  }

  const repeatedLoopPattern = input.entries ? detectRepeatedLoopPattern(input.entries) : false;
  if (repeatedLoopPattern) {
    reasons.push("repeated graph/symbol tool loop pattern detected.");
  }

  const firstRouteDriftAfterContextPack = input.entries
    ? findFirstRouteDriftAfterContextPack(input.entries)
    : undefined;

  const toolLoopFailure =
    reasons.length > 0 || repeatedLoopPattern || graphToolCalls > CONTEXT_BROKER_BUDGET.graphToolsMax;
  const routingFailure = fallbackToolCalls > 0 && toolLoopFailure;

  return {
    totalCalls,
    counts,
    graphToolCalls,
    symbolToolCalls,
    fallbackToolCalls,
    toolLoopFailure,
    routingFailure,
    toolLoopWarning: warnings.length > 0,
    repeatedLoopPattern,
    firstRouteDriftAfterContextPack,
    reasons,
    warnings,
  };
}
