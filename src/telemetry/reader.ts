import fs from "node:fs";
import path from "node:path";
import { TELEMETRY_LOG_FILE, type TelemetryEntry } from "./types.js";

export function readTelemetryEntries(logFile = TELEMETRY_LOG_FILE): TelemetryEntry[] {
  const absolutePath = path.resolve(logFile);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  const entries: TelemetryEntry[] = [];

  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as Partial<TelemetryEntry>;
      if (!parsed.timestamp || !parsed.tool || typeof parsed.durationMs !== "number") {
        console.error(`[telemetry] skipping malformed entry on line ${index + 1}`);
        continue;
      }

      entries.push({
        timestamp: parsed.timestamp,
        tool: parsed.tool,
        args: (parsed.args ?? {}) as Record<string, unknown>,
        durationMs: parsed.durationMs,
        outputChars: Number(parsed.outputChars ?? 0),
        estimatedOutputTokens: Number(parsed.estimatedOutputTokens ?? Math.ceil(Number(parsed.outputChars ?? 0) / 4)),
        success: Boolean(parsed.success),
        error: parsed.error,
      });
    } catch {
      console.error(`[telemetry] skipping invalid JSON on line ${index + 1}`);
    }
  }

  return entries;
}
