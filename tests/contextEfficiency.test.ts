import { describe, expect, it } from "vitest";
import { buildContextEfficiencyMetrics, compareContextEfficiency } from "../src/benchmark/contextEfficiencyMetrics.js";

describe("context_efficiency_metrics", () => {
  it("computes per-1k metrics and comparison", () => {
    const graphify = buildContextEfficiencyMetrics({
      arm: "graphify",
      contextTokens: 1000,
      score: {
        taskName: "auth-discovery",
        matchedFiles: ["a"],
        missingFiles: [],
        matchedConcepts: ["login"],
        missingConcepts: [],
        matchedCategories: ["files"],
        missingCategories: [],
        expectedFilesFound: false,
        expectedConceptsFound: false,
        outputCategoriesFound: true,
        qualityScore: 3,
        passed: false,
        note: "",
      },
      expectedFileCount: 5,
      expectedConceptCount: 6,
    });
    const repo = buildContextEfficiencyMetrics({
      arm: "repo-context",
      contextTokens: 200,
      score: {
        taskName: "auth-discovery",
        matchedFiles: ["a", "b", "c", "d", "e"],
        missingFiles: [],
        matchedConcepts: ["login", "session"],
        missingConcepts: [],
        matchedCategories: ["files"],
        missingCategories: [],
        expectedFilesFound: true,
        expectedConceptsFound: true,
        outputCategoriesFound: true,
        qualityScore: 10,
        passed: true,
        note: "",
      },
      expectedFileCount: 5,
      expectedConceptCount: 6,
    });
    const cmp = compareContextEfficiency(graphify, repo);
    expect(cmp.contextTokenReductionPct).toBe(80);
    expect(cmp.fileCoverageMultiplier).toBe(5);
    expect(repo.filesPer1000ContextTokens).toBeGreaterThan(graphify.filesPer1000ContextTokens);
    expect(repo.qualityPer1000ContextTokens).toBeGreaterThan(graphify.qualityPer1000ContextTokens);
  });
});
