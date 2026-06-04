export type AbMode = "no_mcp" | "compact_search" | "graph" | "context_broker" | "context_broker_locked";

export type AbClient = "cursor" | "codex" | "claude_code" | "claude_desktop" | "generic";

export interface AbTestPlan {
  id: string;
  createdAt: string;
  client: AbClient;
  repoPath: string;
  taskName: string;
  taskPrompt: string;
  modes: AbMode[];
  model?: string;
  notes?: string;
}

export interface AbRunResult {
  id: string;
  planId: string;
  mode: AbMode;
  client: AbClient;
  model?: string;
  repoPath: string;
  prompt: string;
  startedAt?: string;
  completedAt?: string;

  clientInputTokens?: number;
  clientOutputTokens?: number;
  clientCacheWriteTokens?: number;
  clientCacheReadTokens?: number;
  clientTotalTokens?: number;
  clientCost?: number;

  mcpToolCalls?: number;
  mcpEstimatedOutputTokens?: number;
  mcpLargestResponseChars?: number;
  mcpToolsUsed?: string[];
  mcpToolCallCounts?: Record<string, number>;

  combinedTotalTokens?: number;
  clientTotalTokenRepeats?: number[];
  combinedTotalTokenRepeats?: number[];

  filesRead?: string[];
  toolsUsed?: string[];
  answerQuality?: number;
  foundExpectedFiles?: boolean;
  notes?: string;

  adapterName?: string;
  adapterCommand?: string;
  adapterConfigPath?: string;
  adapterOutputDir?: string;
  adapterStdoutPath?: string;
  adapterStderrPath?: string;
  adapterRunCount?: number;
  transcriptPath?: string;
  telemetryReportPath?: string;
  usageParsed?: boolean;
  usageManuallyEntered?: boolean;
}

export interface AbComparisonReport {
  plan: AbTestPlan;
  results: AbRunResult[];
  winner?: AbMode;
  verdict:
    | "saved_tokens"
    | "no_meaningful_change"
    | "increased_tokens"
    | "quality_regression"
    | "inconclusive"
    | "TOOL_LOOP_FAILURE"
    | "ROUTING_FAILURE"
    | "INCREASED_USAGE_STABLE"
    | "INCREASED_USAGE_WITH_OUTLIER"
    | "PROMISING_BUT_UNSTABLE"
    | "PROVEN_SAVINGS_STABLE";
  summary: string;
}
