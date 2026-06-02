export interface TelemetryEntry {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  outputChars: number;
  estimatedOutputTokens: number;
  success: boolean;
  error?: string;
}

export interface ToolStats {
  tool: string;
  calls: number;
  totalOutputChars: number;
  estimatedOutputTokens: number;
  avgOutputChars: number;
  avgDurationMs: number;
  errors: number;
}

export interface TelemetryAnalysis {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  callsByTool: Record<string, number>;
  totalOutputChars: number;
  estimatedTotalTokens: number;
  avgResponseChars: number;
  toolStats: ToolStats[];
  largestResponses: TelemetryEntry[];
  lastCalls: TelemetryEntry[];
  excessiveOutputWarnings: Array<{ tool: string; outputChars: number; estimatedOutputTokens: number; timestamp: string }>;
  savingsOpportunities: string[];
  recommendations: string[];
}

export const TELEMETRY_DIR = ".mcp-telemetry";
export const TELEMETRY_LOG_FILE = `${TELEMETRY_DIR}/logs.jsonl`;
export const TELEMETRY_REPORT_FILE = `${TELEMETRY_DIR}/report.md`;

export function getTelemetryLogFile(): string {
  const override = process.env.MCP_TELEMETRY_LOG_FILE?.trim();
  return override && override.length > 0 ? override : TELEMETRY_LOG_FILE;
}

export function getTelemetryReportFile(): string {
  const override = process.env.MCP_TELEMETRY_REPORT_FILE?.trim();
  return override && override.length > 0 ? override : TELEMETRY_REPORT_FILE;
}

export const MAX_ARG_STRING_LENGTH = 500;
export const EXCESSIVE_OUTPUT_CHARS = 20_000;
export const EXCESSIVE_OUTPUT_TOKENS = Math.ceil(EXCESSIVE_OUTPUT_CHARS / 4);
