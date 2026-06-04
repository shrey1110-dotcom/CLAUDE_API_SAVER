export interface ContextQueryLogEntry {
  timestamp: string;
  task: string;
  mode: string;
  budgetTokens: number;
  fileCount: number;
  symbolCount: number;
  docCount: number;
  assetCount: number;
  conceptCount: number;
  estimatedOutputTokens: number;
  truncated: boolean;
  source: string;
}
