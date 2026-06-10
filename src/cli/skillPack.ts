import { resetConfigForTests } from "../config.js";
import { buildContextPack } from "../context/broker.js";
import type { ContextMode, ContextPackResult } from "../context/types.js";

export const SKILL_PACK_DEFAULT_BUDGET = 500;
export const SKILL_PACK_MAX_FILES = 6;
export const SKILL_PACK_MAX_SYMBOLS = 6;

export interface SkillPackOptions {
  task: string;
  root?: string;
  mode?: ContextMode;
  budgetTokens?: number;
}

export function applySkillPackEnv(budgetTokens = SKILL_PACK_DEFAULT_BUDGET): void {
  process.env.MCP_CONTEXT_PACK_MINIMAL = "1";
  process.env.MCP_CONTEXT_PACK_BUDGET_TOKENS = String(budgetTokens);
  process.env.MCP_CONTEXT_PACK_MAX_FILES = String(SKILL_PACK_MAX_FILES);
  process.env.MCP_CONTEXT_PACK_MAX_SYMBOLS = String(SKILL_PACK_MAX_SYMBOLS);
  resetConfigForTests();
}

export function clearSkillPackEnv(): void {
  delete process.env.MCP_CONTEXT_PACK_MINIMAL;
  delete process.env.MCP_CONTEXT_PACK_BUDGET_TOKENS;
  delete process.env.MCP_CONTEXT_PACK_MAX_FILES;
  delete process.env.MCP_CONTEXT_PACK_MAX_SYMBOLS;
  resetConfigForTests();
}

export function buildSkillPack(options: SkillPackOptions): ContextPackResult {
  const budget = options.budgetTokens ?? SKILL_PACK_DEFAULT_BUDGET;
  applySkillPackEnv(budget);
  try {
    return buildContextPack({
      task: options.task,
      root: options.root,
      mode: options.mode ?? "discovery",
      budgetTokens: budget,
    });
  } finally {
    clearSkillPackEnv();
  }
}

export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}
