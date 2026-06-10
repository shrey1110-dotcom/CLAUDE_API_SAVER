import type { scoreCodexQaText } from "../ab/codexQa/scoring.js";

export interface ContextEfficiencyArmMetrics {
  arm: string;
  contextTokens: number;
  matchedFiles: number;
  expectedFiles: number;
  qualityScore: number;
  matchedConcepts: number;
  expectedConcepts: number;
  taskComplete: boolean;
  contextCompletenessRatio: number;
  filesPer1000ContextTokens: number;
  qualityPer1000ContextTokens: number;
}

export interface ContextEfficiencyComparison {
  graphify: ContextEfficiencyArmMetrics;
  repoContext: ContextEfficiencyArmMetrics;
  contextTokenReductionPct: number | null;
  fileCoverageMultiplier: number | null;
  qualityPerTokenMultiplier: number | null;
}

export function buildContextEfficiencyMetrics(input: {
  arm: string;
  contextTokens: number;
  score: ReturnType<typeof scoreCodexQaText>;
  expectedFileCount: number;
  expectedConceptCount: number;
}): ContextEfficiencyArmMetrics {
  const contextTokens = Math.max(1, input.contextTokens);
  const matchedFiles = input.score.matchedFiles.length;
  const matchedConcepts = input.score.matchedConcepts.length;
  const taskComplete = input.score.expectedFilesFound && input.score.passed;
  return {
    arm: input.arm,
    contextTokens: input.contextTokens,
    matchedFiles,
    expectedFiles: input.expectedFileCount,
    qualityScore: input.score.qualityScore,
    matchedConcepts,
    expectedConcepts: input.expectedConceptCount,
    taskComplete,
    contextCompletenessRatio:
      input.expectedFileCount > 0 ? Math.round((matchedFiles / input.expectedFileCount) * 1000) / 1000 : 0,
    filesPer1000ContextTokens: Math.round((matchedFiles / contextTokens) * 1000 * 100) / 100,
    qualityPer1000ContextTokens: Math.round((input.score.qualityScore / contextTokens) * 1000 * 100) / 100,
  };
}

export function compareContextEfficiency(
  graphify: ContextEfficiencyArmMetrics,
  repoContext: ContextEfficiencyArmMetrics,
): ContextEfficiencyComparison {
  const contextTokenReductionPct =
    graphify.contextTokens > 0
      ? Math.round((1 - repoContext.contextTokens / graphify.contextTokens) * 1000) / 10
      : null;
  const fileCoverageMultiplier =
    graphify.matchedFiles > 0 ? Math.round((repoContext.matchedFiles / graphify.matchedFiles) * 100) / 100 : null;
  const qualityPerTokenMultiplier =
    graphify.qualityPer1000ContextTokens > 0
      ? Math.round((repoContext.qualityPer1000ContextTokens / graphify.qualityPer1000ContextTokens) * 100) / 100
      : null;
  return { graphify, repoContext, contextTokenReductionPct, fileCoverageMultiplier, qualityPerTokenMultiplier };
}
