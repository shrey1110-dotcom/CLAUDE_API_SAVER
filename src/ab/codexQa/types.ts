import type { AbMode } from "../types.js";
import type { CodexQaScore } from "./scoring.js";

export type CodexQaTaskVerdict =
  | "PROVEN_SAVINGS_STABLE"
  | "PROMISING_BUT_UNSTABLE"
  | "NO_MEANINGFUL_CHANGE"
  | "INCREASED_USAGE"
  | "QUALITY_REGRESSION"
  | "ROUTING_FAILURE"
  | "INCOMPLETE_TEST";

export type CodexQaAggregateVerdict =
  | "PROVEN_MULTI_TASK_SAVINGS"
  | "MIXED_RESULTS"
  | "INCOMPLETE_TEST"
  | "FAILED_MULTI_TASK";

export interface CodexQaRunSummary {
  runDir: string;
  mode: AbMode;
  index: number;
  command: string;
  args: string[];
  usageParsed: boolean;
  clientInputTokens?: number;
  clientOutputTokens?: number;
  clientTotalTokens?: number;
  mcpEstimatedOutputTokens: number;
  mcpToolsUsed: string[];
  mcpToolCallCounts: Record<string, number>;
  mcpToolCalls: number;
  quality: CodexQaScore;
  stdoutPath: string;
  stderrPath: string;
  transcriptPath: string;
}

export interface CodexQaModeResult {
  taskName: string;
  mode: "no_mcp" | "context_broker_locked";
  repeats: CodexQaRunSummary[];
  clientTotals: number[];
  mcpTokens: number[];
  combinedTotals: number[];
  usageParsed: boolean;
  quality: CodexQaScore;
  outputDir?: string;
  notes?: string;
}

export interface CodexQaFilePackResult {
  taskName: string;
  markdownPath: string;
  jsonPath: string;
  estimatedOutputTokens: number;
  budgetPass: boolean;
  quality: CodexQaScore;
}

export interface CodexQaTaskResult {
  taskName: string;
  prompt: string;
  noMcp?: CodexQaModeResult;
  locked?: CodexQaModeResult;
  filePack?: CodexQaFilePackResult;
  verdict: CodexQaTaskVerdict;
  reasons: string[];
  meanSavingsPercent?: number;
  medianSavingsPercent?: number;
  meanSavingsTokens?: number;
  medianSavingsTokens?: number;
}

export interface CodexQaSuiteFile {
  id: string;
  createdAt: string;
  repoPath: string;
  codexBin: string;
  repeat: number;
  taskNames: string[];
}

export interface CodexQaSuiteReport {
  suite: CodexQaSuiteFile;
  tasks: CodexQaTaskResult[];
  aggregateVerdict: CodexQaAggregateVerdict;
}

