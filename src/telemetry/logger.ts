import fs from "node:fs";
import path from "node:path";
import {
  getTelemetryLogFile,
  MAX_ARG_STRING_LENGTH,
  TELEMETRY_DIR,
  type TelemetryEntry,
} from "./types.js";

export function isTelemetryEnabled(): boolean {
  return process.env.MCP_TELEMETRY === "1";
}

export function truncateTelemetryValue(value: unknown, maxLength = MAX_ARG_STRING_LENGTH): unknown {
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => truncateTelemetryValue(item, maxLength));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = truncateTelemetryValue(nested, maxLength);
    }
    return result;
  }

  return value;
}

export function extractOutputText(result: {
  content?: Array<{ type?: string; text?: string }>;
}): string {
  if (!result.content?.length) {
    return "";
  }
  return result.content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text ?? "")
    .join("\n");
}

export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 4);
}

function ensureTelemetryDir(): void {
  fs.mkdirSync(path.resolve(TELEMETRY_DIR), { recursive: true });
}

export function logTelemetryEvent(partial: Omit<TelemetryEntry, "timestamp" | "estimatedOutputTokens">): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  const entry: TelemetryEntry = {
    timestamp: new Date().toISOString(),
    estimatedOutputTokens: estimateTokensFromChars(partial.outputChars),
    ...partial,
    args: truncateTelemetryValue(partial.args) as Record<string, unknown>,
  };

  ensureTelemetryDir();
  fs.appendFileSync(path.resolve(getTelemetryLogFile()), `${JSON.stringify(entry)}\n`, "utf8");
}

export async function withTelemetry<T extends { content?: Array<{ type?: string; text?: string }>; isError?: boolean }>(
  tool: string,
  args: Record<string, unknown>,
  handler: () => T | Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    const result = await handler();
    const outputText = extractOutputText(result);
    logTelemetryEvent({
      tool,
      args,
      durationMs: Math.round(performance.now() - startedAt),
      outputChars: outputText.length,
      success: !result.isError,
      error: result.isError ? outputText.slice(0, 500) : undefined,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logTelemetryEvent({
      tool,
      args,
      durationMs: Math.round(performance.now() - startedAt),
      outputChars: message.length,
      success: false,
      error: message,
    });
    throw error;
  }
}
