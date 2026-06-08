import { CODEX_QA_TASKS } from "../ab/codexQa/profiles.js";
import type { ContextMode } from "../context/types.js";

export const COMPRESSION_BUDGET_TOKENS = 1000;

export interface CompressionTaskConfig {
  taskName: string;
  prompt: string;
  mode: ContextMode;
  expectedFilePatterns: string[];
  expectedConcepts: string[];
  minExpectedFileMatches: number;
  minExpectedConceptMatches: number;
}

const MODE_BY_TASK: Record<string, ContextMode> = {
  "auth-discovery": "discovery",
  "impact-analysis": "impact",
  "edit-planning": "edit",
  "architecture-discovery": "discovery",
  "onboarding-map": "discovery",
};

export const COMPRESSION_TASKS: CompressionTaskConfig[] = CODEX_QA_TASKS.map((profile) => ({
  taskName: profile.taskName,
  prompt: profile.prompt,
  mode: MODE_BY_TASK[profile.taskName] ?? "discovery",
  expectedFilePatterns: profile.expectedFilePatterns,
  expectedConcepts: profile.expectedConcepts,
  minExpectedFileMatches: profile.minExpectedFileMatches,
  minExpectedConceptMatches: profile.minExpectedConceptMatches,
}));
