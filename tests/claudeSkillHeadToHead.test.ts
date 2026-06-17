import { describe, expect, it } from "vitest";
import { buildClaudeSkillPack, CLAUDE_PACK_DEFAULT_BUDGET } from "../src/cli/skillPack.js";
import { formatClaudeMarkdown, buildModuleMap } from "../src/cli/formatClaudeMarkdown.js";
import { detectTaskIntent, collectPathTermAnchors, significantTerms } from "../src/context/taskIntent.js";
import {
  CLAUDE_BENCHMARK_TASKS,
  estimateContextTokens,
  scoreTextAgainstRubric,
} from "../src/benchmark/claudeTaskRubrics.js";

const repoRoot = ".";

describe("claude profile intent detection", () => {
  it("detects inflected impact phrasing", () => {
    expect(detectTaskIntent("Find the files most likely impacted by changing context_pack behavior")).toBe(
      "impact_analysis",
    );
  });

  it("detects edit-planning phrasing", () => {
    expect(detectTaskIntent("Plan a safe edit to improve context-pack behavior while preserving tests")).toBe(
      "edit_planning",
    );
  });

  it("detects architecture phrasing", () => {
    expect(detectTaskIntent("Explain the architecture of this repo's context-building system")).toBe(
      "architecture",
    );
  });

  it("filters stopwords from term expansion", () => {
    const terms = significantTerms(["the", "do", "by", "context", "pack", "broker"]);
    expect(terms).toEqual(["context", "pack", "broker"]);
  });
});

describe("claude profile pack generation", () => {
  it("path-term anchors find compound-named files without hardcoded paths", () => {
    const anchors = collectPathTermAnchors(
      "changing context_pack behavior or broker context selection",
      repoRoot,
      10,
    );
    const paths = anchors.map((a) => a.path);
    expect(paths.some((p) => p.startsWith("src/context/"))).toBe(true);
  });

  it("produces a non-empty pack within budget for every benchmark task", () => {
    for (const task of CLAUDE_BENCHMARK_TASKS) {
      const pack = buildClaudeSkillPack({ task: task.prompt, root: repoRoot });
      expect(pack.files.length, task.id).toBeGreaterThan(0);
      const markdown = formatClaudeMarkdown(pack, { root: repoRoot });
      expect(estimateContextTokens(markdown), task.id).toBeLessThanOrEqual(CLAUDE_PACK_DEFAULT_BUDGET);
      expect(markdown).toContain("## ");
    }
  });

  it("module map reflects the real src layout", () => {
    const map = buildModuleMap(repoRoot);
    expect(map.length).toBeGreaterThan(3);
    expect(map.join("\n")).toContain("src/context/");
  });
});

describe("claude task rubric scorer", () => {
  it("scores 0 for empty text and 10 for full coverage", () => {
    const empty = scoreTextAgainstRubric("impact-analysis", "");
    expect(empty.quality).toBe(0);
    const full = scoreTextAgainstRubric(
      "impact-analysis",
      "broker.ts packContext buildContextPack proofMinimalPack taskIntent formatPack",
    );
    expect(full.quality).toBe(10);
  });

  it("never marks unanswered repeats as scored", () => {
    const score = scoreTextAgainstRubric("unknown-task", "anything");
    expect(score.totalExpected).toBe(0);
  });
});
