export interface ParsedClaudeUsage {
  clientInputTokens?: number;
  clientOutputTokens?: number;
  clientCacheWriteTokens?: number;
  clientCacheReadTokens?: number;
  clientTotalTokens?: number;
  costUsd?: number;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function applyUsageField(key: string, value: unknown, out: ParsedClaudeUsage): void {
  const n = toNumber(value);
  if (n === undefined) return;
  const lower = normalizeKey(key);
  if (["inputtokens", "prompttokens"].includes(lower)) out.clientInputTokens = n;
  if (["outputtokens", "completiontokens"].includes(lower)) out.clientOutputTokens = n;
  if (["cachecreationinputtokens", "cachewritetokens", "cachewritetoken"].includes(lower)) {
    out.clientCacheWriteTokens = n;
  }
  if (["cachereadinputtokens", "cachereadtokens", "cachereadtoken"].includes(lower)) {
    out.clientCacheReadTokens = n;
  }
  if (["totaltokens"].includes(lower)) out.clientTotalTokens = n;
  if (["costusd", "totalcostusd", "totalcost"].includes(lower)) out.costUsd = n;
}

function walkForUsage(obj: unknown, out: ParsedClaudeUsage): void {
  if (!obj || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    applyUsageField(key, value, out);
    if (value && typeof value === "object") {
      walkForUsage(value, out);
    }
  }
}

function hasUsageFields(out: ParsedClaudeUsage): boolean {
  return (
    out.clientInputTokens !== undefined ||
    out.clientOutputTokens !== undefined ||
    out.clientTotalTokens !== undefined ||
    out.clientCacheReadTokens !== undefined ||
    out.clientCacheWriteTokens !== undefined
  );
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
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
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

function messageIdFromObject(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const record = obj as Record<string, unknown>;
  for (const key of ["id", "message_id", "messageId"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  const message = record.message;
  if (message && typeof message === "object") {
    const nested = message as Record<string, unknown>;
    for (const key of ["id", "message_id", "messageId"]) {
      const value = nested[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return undefined;
}

function parseUsageObject(obj: unknown): ParsedClaudeUsage | null {
  const out: ParsedClaudeUsage = {};
  walkForUsage(obj, out);
  return hasUsageFields(out) ? out : null;
}

function parseJsonlLines(text: string): Array<{ usage: ParsedClaudeUsage; messageId?: string }> {
  const entries: Array<{ usage: ParsedClaudeUsage; messageId?: string }> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const usage = parseUsageObject(parsed);
      if (!usage) continue;
      entries.push({ usage, messageId: messageIdFromObject(parsed) });
    } catch {
      // skip invalid JSONL
    }
  }
  return entries;
}

export function dedupeStreamingUsageEntries(
  entries: Array<{ usage: ParsedClaudeUsage; messageId?: string }>,
): ParsedClaudeUsage[] {
  const seenIds = new Set<string>();
  const deduped: ParsedClaudeUsage[] = [];
  for (const entry of entries) {
    if (entry.messageId) {
      if (seenIds.has(entry.messageId)) continue;
      seenIds.add(entry.messageId);
    }
    deduped.push(entry.usage);
  }
  return deduped;
}

function mergeUsageParts(usages: ParsedClaudeUsage[]): ParsedClaudeUsage | null {
  if (usages.length === 0) return null;
  const merged: ParsedClaudeUsage = {};
  for (const usage of usages) {
    if (usage.clientInputTokens !== undefined) merged.clientInputTokens = usage.clientInputTokens;
    if (usage.clientOutputTokens !== undefined) merged.clientOutputTokens = usage.clientOutputTokens;
    if (usage.clientCacheWriteTokens !== undefined) merged.clientCacheWriteTokens = usage.clientCacheWriteTokens;
    if (usage.clientCacheReadTokens !== undefined) merged.clientCacheReadTokens = usage.clientCacheReadTokens;
    if (usage.clientTotalTokens !== undefined) merged.clientTotalTokens = usage.clientTotalTokens;
    if (usage.costUsd !== undefined) merged.costUsd = usage.costUsd;
  }
  return hasUsageFields(merged) ? merged : null;
}

function parseUsageFromJsonCandidates(text: string): ParsedClaudeUsage | null {
  const jsonlEntries = parseJsonlLines(text);
  if (jsonlEntries.length > 0) {
    const deduped = dedupeStreamingUsageEntries(jsonlEntries);
    return mergeUsageParts(deduped);
  }

  for (const candidate of jsonObjectCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const usage = parseUsageObject(parsed);
      if (usage) return usage;
    } catch {
      // skip invalid JSON
    }
  }
  return null;
}

export function parseClaudeUsageFromOutput(stdout: string, stderr: string): ParsedClaudeUsage | null {
  const combined = `${stdout}\n${stderr}`;
  return parseUsageFromJsonCandidates(combined);
}

export function mergeClaudeUsageWithTotal(usage: ParsedClaudeUsage): ParsedClaudeUsage {
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

export function estimateUsageFromTextLength(_text: string): ParsedClaudeUsage | null {
  return null;
}
