import { parseToolProfile, type McpToolProfile } from "./toolProfiles.js";

export type OutputMode = "compact" | "normal" | "detailed";

export interface McpConfig {
  outputMode: OutputMode;
  toolProfile: McpToolProfile;
  maxResponseChars: number;
  defaultSearchResults: number;
  maxCompactSearchResults: number;
  defaultSymbolResults: number;
  treeDepth: number;
  symbolContextLines: number;
  searchContextPadding: number;
  searchContextLines: number;
  maxTreeEntriesPerDir: number;
  contextPackMinimal: boolean;
  contextPackBudgetTokens: number;
  contextPackMaxFiles: number;
  contextPackMaxSymbols: number;
}

type ModeDefaults = Omit<
  McpConfig,
  | "outputMode"
  | "toolProfile"
  | "contextPackMinimal"
  | "contextPackBudgetTokens"
  | "contextPackMaxFiles"
  | "contextPackMaxSymbols"
>;

const COMPACT_DEFAULTS: ModeDefaults = {
  maxResponseChars: 9000,
  defaultSearchResults: 5,
  maxCompactSearchResults: 10,
  defaultSymbolResults: 3,
  treeDepth: 2,
  symbolContextLines: 14,
  searchContextPadding: 0,
  searchContextLines: 0,
  maxTreeEntriesPerDir: 6,
};

const NORMAL_DEFAULTS: ModeDefaults = {
  maxResponseChars: 30_720,
  defaultSearchResults: 8,
  maxCompactSearchResults: 100,
  defaultSymbolResults: 5,
  treeDepth: 3,
  symbolContextLines: 20,
  searchContextPadding: 1,
  searchContextLines: 1,
  maxTreeEntriesPerDir: 12,
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
  const modeDefaults = outputMode === "compact" ? COMPACT_DEFAULTS : NORMAL_DEFAULTS;
  const searchContextLines = parsePositiveInt(
    process.env.MCP_SEARCH_CONTEXT_LINES,
    modeDefaults.searchContextLines,
    0,
    5,
  );
  const searchPadding =
    process.env.MCP_SEARCH_CONTEXT_LINES !== undefined
      ? searchContextLines
      : outputMode === "compact"
        ? modeDefaults.searchContextPadding
        : outputMode === "normal"
          ? 1
          : 2;

  cached = {
    outputMode,
    toolProfile: parseToolProfile(process.env.MCP_TOOL_PROFILE),
    maxResponseChars: parsePositiveInt(
      process.env.MCP_MAX_RESPONSE_CHARS,
      modeDefaults.maxResponseChars,
      1,
      100_000,
    ),
    defaultSearchResults: parsePositiveInt(
      process.env.MCP_DEFAULT_SEARCH_RESULTS,
      modeDefaults.defaultSearchResults,
      1,
      100,
    ),
    maxCompactSearchResults: modeDefaults.maxCompactSearchResults,
    defaultSymbolResults: modeDefaults.defaultSymbolResults,
    treeDepth: parsePositiveInt(process.env.MCP_TREE_DEPTH, modeDefaults.treeDepth, 0, 6),
    symbolContextLines: parsePositiveInt(
      process.env.MCP_SYMBOL_CONTEXT_LINES,
      modeDefaults.symbolContextLines,
      5,
      80,
    ),
    searchContextPadding: searchPadding,
    searchContextLines,
    maxTreeEntriesPerDir: modeDefaults.maxTreeEntriesPerDir,
    contextPackMinimal: process.env.MCP_CONTEXT_PACK_MINIMAL === "1",
    contextPackBudgetTokens: parsePositiveInt(process.env.MCP_CONTEXT_PACK_BUDGET_TOKENS, 1000, 300, 2500),
    contextPackMaxFiles: parsePositiveInt(process.env.MCP_CONTEXT_PACK_MAX_FILES, 6, 3, 12),
    contextPackMaxSymbols: parsePositiveInt(process.env.MCP_CONTEXT_PACK_MAX_SYMBOLS, 6, 2, 15),
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
