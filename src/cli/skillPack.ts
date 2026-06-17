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

export const CLAUDE_PACK_DEFAULT_BUDGET = 900;

/**
 * Claude-optimized pack: skips proof-minimal slimming so the pack keeps
 * relationship-bearing fields (concepts, commands) and a larger file list.
 * Budget stays compact (default 900 tokens).
 */
export function buildClaudeSkillPack(options: SkillPackOptions): ContextPackResult {
  const budget = options.budgetTokens ?? CLAUDE_PACK_DEFAULT_BUDGET;
  clearSkillPackEnv();
  return buildContextPack({
    task: options.task,
    root: options.root,
    mode: options.mode ?? "discovery",
    budgetTokens: budget,
  });
}

export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}
