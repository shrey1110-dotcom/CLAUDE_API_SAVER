import { describe, expect, it } from "vitest";
import { getCodexQaTask } from "../src/ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../src/ab/codexQa/scoring.js";
import { buildContextPack } from "../src/context/broker.js";
import { detectTaskIntent, extractTaskPhrases } from "../src/context/taskIntent.js";

const repoRoot = ".";

describe("task intent routing", () => {
  it("detects onboarding without auth-only narrowing", () => {
    const profile = getCodexQaTask("onboarding-map")!;
    expect(detectTaskIntent(profile.prompt, "discovery")).toBe("onboarding");
  });

  it("detects session edit planning", () => {
    const profile = getCodexQaTask("edit-planning")!;
    expect(detectTaskIntent(profile.prompt, "edit")).toBe("session_edit");
  });

  it("normalizes refresh-token phrase for concept scoring", () => {
    const phrases = extractTaskPhrases("add refresh-token expiration handling");
    expect(phrases).toContain("refresh token");
    expect(phrases).toContain("expiration");
  });

  it("edit-planning and onboarding-map packs are task-complete under 1000 tokens", () => {
    for (const taskName of ["edit-planning", "onboarding-map"] as const) {
      const profile = getCodexQaTask(taskName)!;
      const mode = taskName === "edit-planning" ? "edit" : "discovery";
      const pack = buildContextPack({ task: profile.prompt, root: repoRoot, mode, budgetTokens: 1000 });
      const score = scoreCodexQaText(profile, JSON.stringify(pack));
      expect(pack.estimatedOutputTokens ?? 0).toBeLessThanOrEqual(1000);
      expect(score.expectedFilesFound).toBe(true);
      expect(score.expectedConceptsFound).toBe(true);
      expect(score.expectedFilesFound && score.expectedConceptsFound).toBe(true);
    }
  });
});
