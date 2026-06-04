import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTH_DISCOVERY_EXPECTED_FILES } from "../src/ab/authDiscoveryQuality.js";
import { compareFileContextResults, tokenWin } from "../src/ab/fileContext/compare.js";
import {
  FC_COMPARISON_FILE,
  FC_CURRENT_PLAN_FILE,
  FC_REPORT_FILE,
  FC_RESULTS_DIR,
  planFilePath,
  readCurrentFileContextPlan,
  resultFilePath,
  writeCurrentFileContextPlan,
  writeFcJson,
} from "../src/ab/fileContext/paths.js";
import {
  FILE_CONTEXT_DEFAULT_TASK,
  FILE_CONTEXT_TEST_A_PROMPT,
  FILE_CONTEXT_TEST_B_PROMPT,
} from "../src/ab/fileContext/prompts.js";
import { renderFileContextReport } from "../src/ab/fileContext/report.js";
import type { FileContextPlan, FileContextResult } from "../src/ab/fileContext/types.js";

const ORIGINAL_CWD = process.cwd();
let tempDir: string;

function makePlan(overrides: Partial<FileContextPlan> = {}): FileContextPlan {
  return {
    id: "file-context-test-plan",
    createdAt: new Date().toISOString(),
    client: "chatgpt",
    model: "gpt-4o",
    repoPath: tempDir,
    task: FILE_CONTEXT_DEFAULT_TASK,
    contextPackPath: ".context-packs/auth-discovery.md",
    contextPackEstimatedTokens: 541,
    testAPrompt: FILE_CONTEXT_TEST_A_PROMPT,
    testBPrompt: FILE_CONTEXT_TEST_B_PROMPT,
    ...overrides,
  };
}

function makeResult(
  mode: FileContextResult["mode"],
  overrides: Partial<FileContextResult> = {},
): FileContextResult {
  return {
    id: `${mode}-result`,
    planId: "file-context-test-plan",
    mode,
    client: "chatgpt",
    model: "gpt-4o",
    task: FILE_CONTEXT_DEFAULT_TASK,
    prompt: mode === "no_context" ? FILE_CONTEXT_TEST_A_PROMPT : FILE_CONTEXT_TEST_B_PROMPT,
    tokenUsageSource: "unavailable",
    expectedFilesFound: 3,
    foundExpectedFiles: false,
    qualityScore: 6,
    filesListed: [],
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-context-ab-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("file-context A/B", () => {
  it("creates a file-context plan file", () => {
    const plan = makePlan();
    writeFcJson(planFilePath(plan.id), plan);
    writeCurrentFileContextPlan(plan);
    const current = readCurrentFileContextPlan();
    expect(current?.id).toBe(plan.id);
    expect(current?.testAPrompt).toContain("authentication");
    expect(fs.existsSync(path.join(tempDir, planFilePath(plan.id)))).toBe(true);
  });

  it("records no_context result", () => {
    const plan = makePlan();
    writeCurrentFileContextPlan(plan);
    const result = makeResult("no_context", {
      qualityScore: 7,
      expectedFilesFound: 4,
      filesListed: [AUTH_DISCOVERY_EXPECTED_FILES[0]],
    });
    writeFcJson(resultFilePath(plan.id, "no_context"), result);
    expect(fs.existsSync(path.join(tempDir, resultFilePath(plan.id, "no_context")))).toBe(true);
  });

  it("records file_context_pack result with pack metadata", () => {
    const plan = makePlan();
    writeCurrentFileContextPlan(plan);
    const result = makeResult("file_context_pack", {
      contextPackPath: ".context-packs/auth-discovery.md",
      contextPackEstimatedTokens: 541,
      qualityScore: 9,
      expectedFilesFound: 5,
      foundExpectedFiles: true,
    });
    writeFcJson(resultFilePath(plan.id, "file_context_pack"), result);
    const saved = JSON.parse(
      fs.readFileSync(path.join(tempDir, resultFilePath(plan.id, "file_context_pack")), "utf8"),
    ) as FileContextResult;
    expect(saved.contextPackEstimatedTokens).toBe(541);
  });

  it("compare reports quality win when B scores higher", () => {
    const plan = makePlan();
    const a = makeResult("no_context", { qualityScore: 6, expectedFilesFound: 3 });
    const b = makeResult("file_context_pack", {
      qualityScore: 9,
      expectedFilesFound: 5,
      contextPackEstimatedTokens: 541,
    });
    const comparison = compareFileContextResults(plan, a, b);
    expect(comparison.verdict).toBe("QUALITY_WIN");
    expect(comparison.qualityWin).toBe(true);
    expect(comparison.tokenWin).toBe(false);
  });

  it("compare token win only with real usage on both sides", () => {
    const plan = makePlan();
    const a = makeResult("no_context", {
      qualityScore: 8,
      expectedFilesFound: 5,
      clientTotalTokens: 10_000,
      tokenUsageSource: "real",
    });
    const b = makeResult("file_context_pack", {
      qualityScore: 8,
      expectedFilesFound: 5,
      clientTotalTokens: 8000,
      contextPackEstimatedTokens: 541,
      tokenUsageSource: "real",
    });
    const comparison = compareFileContextResults(plan, a, b);
    expect(tokenWin(a, b)).toBe(true);
    expect(comparison.verdict).toBe("TOKEN_SAVINGS_PROVEN");
    expect(comparison.tokenWin).toBe(true);
  });

  it("returns TOKEN_USAGE_UNAVAILABLE when token numbers missing", () => {
    const plan = makePlan();
    const a = makeResult("no_context", { qualityScore: 7, expectedFilesFound: 4 });
    const b = makeResult("file_context_pack", {
      qualityScore: 7,
      expectedFilesFound: 4,
      contextPackEstimatedTokens: 541,
    });
    const comparison = compareFileContextResults(plan, a, b);
    expect(comparison.verdict).toBe("TOKEN_USAGE_UNAVAILABLE");
    expect(comparison.tokenComparisonAvailable).toBe(false);
  });

  it("estimated token usage does not count as proof", () => {
    const plan = makePlan();
    const a = makeResult("no_context", {
      qualityScore: 7,
      expectedFilesFound: 4,
      clientTotalTokens: 10_000,
      tokenUsageSource: "estimated",
    });
    const b = makeResult("file_context_pack", {
      qualityScore: 7,
      expectedFilesFound: 4,
      clientTotalTokens: 1000,
      contextPackEstimatedTokens: 541,
      tokenUsageSource: "estimated",
    });
    const comparison = compareFileContextResults(plan, a, b);
    expect(comparison.tokenWin).toBe(false);
    expect(comparison.verdict).toBe("TOKEN_USAGE_UNAVAILABLE");
  });

  it("report generation includes verdict and token warning", () => {
    const plan = makePlan();
    const a = makeResult("no_context", { qualityScore: 6, expectedFilesFound: 3 });
    const b = makeResult("file_context_pack", {
      qualityScore: 9,
      expectedFilesFound: 5,
      contextPackEstimatedTokens: 541,
    });
    const comparison = compareFileContextResults(plan, a, b);
    const report = renderFileContextReport(comparison);
    expect(report).toContain("QUALITY_WIN");
    expect(report).toContain("Token savings are not proven");
    expect(report).toContain(".context-packs/auth-discovery.md");
    writeFcJson(FC_REPORT_FILE, { note: "skip" });
    fs.writeFileSync(path.join(tempDir, FC_REPORT_FILE), report, "utf8");
    expect(fs.existsSync(path.join(tempDir, FC_REPORT_FILE))).toBe(true);
  });

  it("returns INCOMPLETE_TEST when a mode is missing", () => {
    const plan = makePlan();
    const a = makeResult("no_context");
    const comparison = compareFileContextResults(plan, a, undefined);
    expect(comparison.verdict).toBe("INCOMPLETE_TEST");
  });
});
