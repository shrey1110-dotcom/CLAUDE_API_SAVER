import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildSkillPack, estimateTokensFromText } from "../src/cli/skillPack.js";
import { formatSkillMarkdown } from "../src/cli/formatSkillMarkdown.js";
import { installAssistant } from "../src/cli/install.js";
import { isCliInvocation } from "../src/cli/router.js";
import { getCodexQaTask } from "../src/ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../src/ab/codexQa/scoring.js";
import { AUTH_DISCOVERY_EXPECTED_FILES } from "../src/ab/authDiscoveryQuality.js";
import { resetConfigForTests } from "../src/config.js";
import {
  detectCrossContamination,
  detectMcpToolsInOutput,
} from "../src/benchmark/codexSuppliedContext.js";
import {
  evaluateSkillHeadToHead,
  writeRepoContextSkillOutput,
} from "../src/benchmark/skillHeadToHead.js";

const AUTH_TASK =
  "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.";

afterEach(() => {
  delete process.env.MCP_CONTEXT_PACK_MINIMAL;
  resetConfigForTests();
});

describe("skill CLI", () => {
  it("detects CLI invocation commands", () => {
    expect(isCliInvocation(["node", "dist/index.js", "pack"])).toBe(true);
    expect(isCliInvocation(["node", "dist/index.js"])).toBe(false);
    expect(isCliInvocation(["node", "dist/index.js", "mcp"])).toBe(true);
  });

  it("pack markdown is compact and covers auth-discovery", () => {
    const pack = buildSkillPack({ task: AUTH_TASK, budgetTokens: 500 });
    const markdown = formatSkillMarkdown(pack, "standard");
    const profile = getCodexQaTask("auth-discovery")!;
    const score = scoreCodexQaText(profile, markdown);
    const tokens = estimateTokensFromText(markdown);

    expect(tokens).toBeLessThanOrEqual(500);
    expect(score.matchedFiles.length).toBe(5);
    expect(score.qualityScore).toBeGreaterThanOrEqual(9);
    for (const file of AUTH_DISCOVERY_EXPECTED_FILES) {
      expect(markdown).toContain(file);
    }
    expect(markdown).not.toContain("## Docs");
  });

  it("query-style pack output includes concepts", () => {
    const pack = buildSkillPack({ task: AUTH_TASK, budgetTokens: 500 });
    const markdown = formatSkillMarkdown(pack, "ultra");
    const profile = getCodexQaTask("auth-discovery")!;
    const score = scoreCodexQaText(profile, markdown);
    expect(score.expectedConceptsFound).toBe(true);
    expect(score.matchedConcepts.length).toBeGreaterThanOrEqual(3);
  });

  it("writes repo-context skill output file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-skill-"));
    const { outPath, outputTokens } = writeRepoContextSkillOutput(tmp, { task: AUTH_TASK });
    expect(fs.existsSync(outPath)).toBe(true);
    expect(outputTokens).toBeLessThanOrEqual(500);
    expect(fs.readFileSync(outPath, "utf8").length).toBeGreaterThan(50);
  });

  it("install cursor and codex safely with marked sections", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-install-"));
    const cursorPath = installAssistant("cursor", tmp);
    const codexPath = installAssistant("codex", tmp);
    expect(fs.existsSync(cursorPath)).toBe(true);
    expect(fs.readFileSync(cursorPath, "utf8")).toContain("repo-context:begin");
    expect(fs.existsSync(codexPath)).toBe(true);
    const second = installAssistant("cursor", tmp);
    expect(second).toBe(cursorPath);
    expect(fs.readFileSync(cursorPath, "utf8").split("repo-context:begin").length).toBe(2);
  });

  it("evaluates skill head-to-head verdict without superiority when tokens lose", () => {
    const evaluated = evaluateSkillHeadToHead({
      generatedAt: new Date().toISOString(),
      taskName: "auth-discovery",
      measuredClient: "codex",
      codexBin: "codex",
      noMcp: true,
      graphifyContextFile: "g.txt",
      repoContextContextFile: "r.txt",
      graphifyOutputTokens: 700,
      repoContextOutputTokens: 250,
      markdownProfile: "standard",
      compactPrompt: false,
      graphifyRepeats: [
        { repeat: 1, arm: "graphify", runDir: "g1", usageParsed: true, qualityScore: 3, matchedFiles: [], missingFiles: [], matchedConcepts: [], missingConcepts: [], mcpToolsDetected: false, crossContamination: false, exitCode: 0, note: "" },
        { repeat: 2, arm: "graphify", runDir: "g2", usageParsed: true, qualityScore: 4, matchedFiles: [], missingFiles: [], matchedConcepts: [], missingConcepts: [], mcpToolsDetected: false, crossContamination: false, exitCode: 0, note: "" },
        { repeat: 3, arm: "graphify", runDir: "g3", usageParsed: true, qualityScore: 3, matchedFiles: [], missingFiles: [], matchedConcepts: [], missingConcepts: [], mcpToolsDetected: false, crossContamination: false, exitCode: 0, note: "" },
      ],
      repoContextRepeats: [
        { repeat: 1, arm: "repo-context", runDir: "r1", usageParsed: true, qualityScore: 10, matchedFiles: [], missingFiles: [], matchedConcepts: [], missingConcepts: [], mcpToolsDetected: false, crossContamination: false, exitCode: 0, note: "" },
        { repeat: 2, arm: "repo-context", runDir: "r2", usageParsed: true, qualityScore: 10, matchedFiles: [], missingFiles: [], matchedConcepts: [], missingConcepts: [], mcpToolsDetected: false, crossContamination: false, exitCode: 0, note: "" },
        { repeat: 3, arm: "repo-context", runDir: "r3", usageParsed: true, qualityScore: 10, matchedFiles: [], missingFiles: [], matchedConcepts: [], missingConcepts: [], mcpToolsDetected: false, crossContamination: false, exitCode: 0, note: "" },
      ],
      graphifyClientTotals: [22000, 22100, 21900],
      repoContextClientTotals: [25000, 24000, 24500],
      graphifyQualityScores: [3, 4, 3],
      repoContextQualityScores: [10, 10, 10],
      graphifyStats: { values: [22000, 22100, 21900], mean: 22000, median: 22000, min: 21900, max: 22100, standardDeviation: 100 },
      repoContextStats: { values: [25000, 24000, 24500], mean: 24500, median: 24500, min: 24000, max: 25000, standardDeviation: 500 },
      graphifyMinQuality: 3,
      repoContextMinQuality: 10,
      supportsScopedClaim: false,
      scopedClaimReason: "pending",
      incomplete: false,
    });
    expect(evaluated.supportsScopedClaim).toBe(false);
    expect(evaluated.verdict).toBe("SKILL_HEAD_TO_HEAD_COMPLETE_NO_SUPERIORITY_CLAIM");
  });

  it("detects MCP usage and cross-contamination", () => {
    expect(detectMcpToolsInOutput('{"type":"item.completed","item":{"type":"mcp_tool_call"}}', "")).toBe(true);
    expect(detectMcpToolsInOutput('rg output mentions "context_pack" in package.json', "")).toBe(false);
    expect(
      detectCrossContamination("graphify", "answer", "", "Graphify query result:\nfoo"),
    ).toBe(false);
    expect(
      detectCrossContamination("graphify", "used repo-context skill output", "", "Graphify only"),
    ).toBe(true);
  });

  it.skipIf(!fs.existsSync(path.resolve(".mcp-ab-tests/codex-qa/results/auth-discovery/context_broker_locked.json")))(
    "leaves existing MCP proof artifacts structurally intact",
    () => {
    const proofPath = path.resolve(".mcp-ab-tests/codex-qa/results/auth-discovery/context_broker_locked.json");
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8")) as {
      mode?: string;
      repeats?: Array<{ runDir?: string }>;
    };
    expect(proof.mode).toBe("context_broker_locked");
    expect(proof.repeats?.every((r) => r.runDir?.includes("context_broker_locked"))).toBe(true);
    expect(proof.repeats?.some((r) => r.runDir?.includes("proof_min"))).toBe(false);
  },
  );
});
