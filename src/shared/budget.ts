import { getMaxResponseChars } from "../config.js";

export function budgetToChars(budgetTokens: number): number {
  return budgetTokens * 4;
}

export function clampBudgetTokens(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function capByBudget<T>(
  payload: T,
  budgetTokens: number,
): { payload: T; truncated: boolean; charCount: number } {
  const maxChars = Math.min(budgetToChars(budgetTokens), getMaxResponseChars());
  let text = JSON.stringify(payload);
  if (text.length <= maxChars) {
    return { payload, truncated: false, charCount: text.length };
  }

  const working = structuredClone(payload) as T & Record<string, unknown>;
  let truncated = true;

  for (const key of ["results", "neighbors", "matches", "paths", "files", "symbols", "docs", "assets", "concepts", "nextSteps"]) {
    const value = working[key];
    if (!Array.isArray(value) || value.length <= 1) {
      continue;
    }
    while (value.length > 1) {
      value.pop();
      text = JSON.stringify(working);
      if (text.length <= maxChars) {
        return { payload: working as T, truncated, charCount: text.length };
      }
    }
  }

  text = text.slice(0, maxChars - 20) + '","truncated":true}';
  try {
    return { payload: JSON.parse(text) as T, truncated: true, charCount: text.length };
  } catch {
    return {
      payload: { ...payload, truncated: true } as T,
      truncated: true,
      charCount: JSON.stringify({ ...payload, truncated: true }).length,
    };
  }
}
