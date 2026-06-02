export interface ParsedCodexUsage {
  clientInputTokens?: number;
  clientOutputTokens?: number;
  clientCacheWriteTokens?: number;
  clientCacheReadTokens?: number;
  clientTotalTokens?: number;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function walkForUsage(obj: unknown, out: ParsedCodexUsage): void {
  if (!obj || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    const n = toNumber(value);
    if (n !== undefined) {
      if (["input_tokens", "inputtokens", "prompt_tokens", "prompttokens"].includes(lower)) out.clientInputTokens = n;
      if (["output_tokens", "outputtokens", "completion_tokens", "completiontokens"].includes(lower)) out.clientOutputTokens = n;
      if (["cache_write_tokens", "cachewritetokens"].includes(lower)) out.clientCacheWriteTokens = n;
      if (["cache_read_tokens", "cachereadtokens"].includes(lower)) out.clientCacheReadTokens = n;
      if (["total_tokens", "totaltokens"].includes(lower)) out.clientTotalTokens = n;
    }
    if (value && typeof value === "object") {
      walkForUsage(value, out);
    }
  }
}

function jsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function parseUsageFromJsonCandidates(text: string): ParsedCodexUsage | null {
  const candidates = jsonObjectCandidates(text);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const out: ParsedCodexUsage = {};
      walkForUsage(parsed, out);
      if (
        out.clientInputTokens !== undefined ||
        out.clientOutputTokens !== undefined ||
        out.clientTotalTokens !== undefined ||
        out.clientCacheReadTokens !== undefined ||
        out.clientCacheWriteTokens !== undefined
      ) {
        return out;
      }
    } catch {
      // Skip invalid JSON chunks.
    }
  }
  return null;
}

export function parseCodexUsageFromOutput(stdout: string, stderr: string): ParsedCodexUsage | null {
  const combined = `${stdout}\n${stderr}`;
  return parseUsageFromJsonCandidates(combined);
}

export function mergeUsageWithTotal(usage: ParsedCodexUsage): ParsedCodexUsage {
  if (usage.clientTotalTokens !== undefined) {
    return usage;
  }
  const parts = [
    usage.clientInputTokens,
    usage.clientOutputTokens,
    usage.clientCacheReadTokens,
    usage.clientCacheWriteTokens,
  ].filter((value): value is number => typeof value === "number");
  if (parts.length > 0) {
    return { ...usage, clientTotalTokens: parts.reduce((sum, value) => sum + value, 0) };
  }
  return usage;
}
