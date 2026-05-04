export type OutputMode = "compact" | "normal" | "detailed";

export interface McpConfig {
  outputMode: OutputMode;
  maxResponseChars: number;
  defaultSearchResults: number;
  treeDepth: number;
  symbolContextLines: number;
  searchContextPadding: number;
}

const DEFAULTS: McpConfig = {
  outputMode: "compact",
  maxResponseChars: 30_720,
  defaultSearchResults: 8,
  treeDepth: 2,
  symbolContextLines: 20,
  searchContextPadding: 1,
};

let cached: McpConfig | null = null;

function parseOutputMode(value: string | undefined): OutputMode {
  if (value === "normal" || value === "detailed") {
    return value;
  }
  return "compact";
}

function parsePositiveInt(value: string | undefined, fallback: number, min = 1, max = 100_000): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export function getConfig(): McpConfig {
  if (cached) {
    return cached;
  }

  const outputMode = parseOutputMode(process.env.MCP_OUTPUT_MODE);
  const searchPadding = outputMode === "compact" ? 1 : outputMode === "normal" ? 2 : 2;

  cached = {
    outputMode,
    maxResponseChars: parsePositiveInt(process.env.MCP_MAX_RESPONSE_CHARS, DEFAULTS.maxResponseChars, 1, 100_000),
    defaultSearchResults: parsePositiveInt(process.env.MCP_DEFAULT_SEARCH_RESULTS, DEFAULTS.defaultSearchResults, 1, 100),
    treeDepth: parsePositiveInt(process.env.MCP_TREE_DEPTH, DEFAULTS.treeDepth, 0, 6),
    symbolContextLines: parsePositiveInt(
      process.env.MCP_SYMBOL_CONTEXT_LINES,
      DEFAULTS.symbolContextLines,
      5,
      80,
    ),
    searchContextPadding: searchPadding,
  };

  return cached;
}

export function getMaxResponseChars(): number {
  return getConfig().maxResponseChars;
}

export function isCompactMode(): boolean {
  return getConfig().outputMode === "compact";
}

export function resetConfigForTests(): void {
  cached = null;
}
