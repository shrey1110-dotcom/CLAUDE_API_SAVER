export type FileContextMode = "no_context" | "file_context_pack";

export type FileContextClient =
  | "chatgpt"
  | "claude_web"
  | "gemini_web"
  | "cursor"
  | "codex"
  | "claude_code"
  | "generic";

export type TokenUsageSource = "real" | "estimated" | "unavailable";

export type FileContextVerdict =
  | "QUALITY_WIN"
  | "TOKEN_SAVINGS_PROVEN"
  | "QUALITY_AND_TOKEN_WIN"
  | "NO_MEANINGFUL_CHANGE"
  | "QUALITY_REGRESSION"
  | "TOKEN_USAGE_UNAVAILABLE"
  | "INCOMPLETE_TEST";

export interface FileContextPlan {
  id: string;
  createdAt: string;
  client: FileContextClient;
  model?: string;
  repoPath: string;
  task: string;
  contextPackPath: string;
  contextPackEstimatedTokens?: number;
  testAPrompt: string;
  testBPrompt: string;
  notes?: string;
}

export interface FileContextResult {
  id: string;
  planId: string;
  mode: FileContextMode;
  client: FileContextClient;
  model?: string;
  task: string;
  prompt: string;
  contextPackPath?: string;
  contextPackEstimatedTokens?: number;
  clientInputTokens?: number;
  clientOutputTokens?: number;
  clientTotalTokens?: number;
  clientCost?: number;
  tokenUsageSource: TokenUsageSource;
  expectedFilesFound: number;
  foundExpectedFiles: boolean;
  qualityScore: number;
  filesListed: string[];
  notes?: string;
  recordedAt: string;
}

export interface FileContextComparison {
  plan: FileContextPlan;
  resultA?: FileContextResult;
  resultB?: FileContextResult;
  verdict: FileContextVerdict;
  qualityWin: boolean;
  tokenWin: boolean;
  tokenComparisonAvailable: boolean;
  summary: string;
  comparedAt: string;
}
