import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GRAPHIFY_HEAD_TO_HEAD_JSON,
  GRAPHIFY_HEAD_TO_HEAD_MD,
  determineVerdict,
  evaluateRealUsageComparison,
  renderGraphifyHeadToHeadMarkdown,
  runGraphifyHeadToHead,
  writeGraphifyHeadToHeadReport,
} from "../src/benchmark/graphifyHeadToHead.js";

const REPO_ROOT = path.resolve(".");
const REPORT_DIR = path.join(REPO_ROOT, ".mcp-benchmarks");
const FIXTURE_OUTPUT = "tests/fixtures/graphify-auth-discovery-output.txt";

beforeAll(() => {
  const build = spawnSync("npm", ["run", "graph:build"], { cwd: REPO_ROOT, encoding: "utf8", shell: true });
  if (build.status !== 0) {
    throw new Error(`graph:build failed: ${build.stderr}`);
  }
  const context = spawnSync("npm", ["run", "context:build"], { cwd: REPO_ROOT, encoding: "utf8", shell: true });
  if (context.status !== 0) {
    throw new Error(`context:build failed: ${context.stderr}`);
  }
});

afterAll(() => {
  for (const file of [GRAPHIFY_HEAD_TO_HEAD_MD, GRAPHIFY_HEAD_TO_HEAD_JSON]) {
    const full = path.join(REPO_ROOT, file);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
    }
  }
});

describe("benchmark:graphify-head-to-head", () => {
  it("marks NOT_RUN or NEEDS_QUERY_COMMAND when Graphify is unavailable and no command is supplied", () => {
    const report = runGraphifyHeadToHead({
      taskName: "auth-discovery",
      repoPath: REPO_ROOT,
      graphifyBin: "__definitely_missing_graphify_binary__",
    });
    expect(["NOT_RUN", "NEEDS_QUERY_COMMAND"]).toContain(report.graphify.armStatus);
    expect(report.verdict).toMatch(/GRAPHIFY_NOT_RUN|GRAPHIFY_FOUND_NEEDS_EXPLICIT_QUERY_COMMAND/);
    expect(report.allowedClaim.toLowerCase()).not.toContain("beat graphify");
    expect(report.allowedClaim.toLowerCase()).not.toContain("universal");
  });

  it("scores saved Graphify output and the repo-context diagnostic arm", () => {
    const report = runGraphifyHeadToHead({
      taskName: "auth-discovery",
      repoPath: REPO_ROOT,
      graphifyOutputFile: FIXTURE_OUTPUT,
    });

    expect(report.graphify.armStatus).toBe("OUTPUT_FILE");
    expect(report.graphify.outputTokens).toBeGreaterThan(0);
    expect(report.graphify.matchedFiles.length).toBeGreaterThanOrEqual(5);
    expect(report.graphify.qualityScore).toBeGreaterThan(0);
    expect(report.repoContext.contextPackTokens).toBeGreaterThan(0);
    expect(report.repoContext.matchedFiles.length).toBeGreaterThan(0);
    expect(report.repoContext.qualityScore).toBeGreaterThan(0);
    expect(report.fullRawRepoTokens).toBeGreaterThan(0);
    expect(report.repoContext.fullRepoCompressionRatio).toBeGreaterThan(1);
    expect(report.repoContext.relevantFilesCompressionRatio).toBeGreaterThan(0);
  });

  it("allows a scoped real-usage claim when repo-context wins on tokens with equal/better quality", () => {
    const realUsage = evaluateRealUsageComparison({
      graphifyCombinedTotals: "100000,98000,102000",
      repoContextCombinedTotals: "62500,62495,62276",
      graphifyQualityScores: "10,10,10",
      repoContextQualityScores: "10,10,10",
    });
    expect(realUsage?.supportsScopedClaim).toBe(true);
    const verdict = determineVerdict(
      {
        armStatus: "OUTPUT_FILE",
        status: "OUTPUT_FILE",
        outputTokens: 1000,
        matchedFiles: [],
        missingFiles: [],
        matchedConcepts: [],
        missingConcepts: [],
        qualityScore: 10,
        fullRepoCompressionRatio: 10,
        relevantFilesCompressionRatio: 5,
      },
      realUsage,
    );
    expect(verdict.verdict).toBe("SCOPED_REAL_USAGE_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT_MCP");
    expect(verdict.allowedClaim).toContain("Scoped");
    expect(verdict.allowedClaim).not.toMatch(/beat graphify/i);
  });

  it("blocks comparative claims when repo-context has lower tokens but worse quality", () => {
    const realUsage = evaluateRealUsageComparison({
      graphifyCombinedTotals: "100000,98000,102000",
      repoContextCombinedTotals: "62500,62495,62276",
      graphifyQualityScores: "10,10,10",
      repoContextQualityScores: "8,8,8",
    });
    expect(realUsage?.supportsScopedClaim).toBe(false);
    expect(realUsage?.scopedClaimReason).toContain("minimum quality");
    const verdict = determineVerdict(
      {
        armStatus: "OUTPUT_FILE",
        status: "OUTPUT_FILE",
        outputTokens: 1000,
        matchedFiles: [],
        missingFiles: [],
        matchedConcepts: [],
        missingConcepts: [],
        qualityScore: 8,
        fullRepoCompressionRatio: 10,
        relevantFilesCompressionRatio: 5,
      },
      realUsage,
    );
    expect(verdict.verdict).toBe("DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM");
  });

  it("report markdown includes required non-claim language and arm statuses", () => {
    const report = runGraphifyHeadToHead({
      taskName: "auth-discovery",
      repoPath: REPO_ROOT,
      graphifyOutputFile: FIXTURE_OUTPUT,
    });
    const markdown = renderGraphifyHeadToHeadMarkdown(report);
    expect(markdown).toContain("Diagnostic compression is not proof of real client savings");
    expect(markdown).toContain("No Graphify superiority claim without same-repo same-task real measured usage");
    expect(markdown).toContain("Graphify arm");
    expect(markdown).toContain("repo-context-mcp (broker_locked diagnostic arm)");
    expect(markdown).toContain(`Status: ${report.graphify.armStatus}`);
    expect(markdown).toContain(`Status: ${report.repoContext.status}`);
    expect(markdown).not.toMatch(/we beat graphify/i);
  });

  it("writes report files via CLI script", () => {
    const run = spawnSync(
      "npm",
      ["run", "benchmark:graphify-head-to-head", "--", "--task", "auth-discovery", "--graphify-output-file", FIXTURE_OUTPUT],
      { cwd: REPO_ROOT, encoding: "utf8", shell: true },
    );
    expect(run.status).toBe(0);
    expect(fs.existsSync(path.join(REPO_ROOT, GRAPHIFY_HEAD_TO_HEAD_MD))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, GRAPHIFY_HEAD_TO_HEAD_JSON))).toBe(true);
    const json = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, GRAPHIFY_HEAD_TO_HEAD_JSON), "utf8"));
    expect(json.taskName).toBe("auth-discovery");
    expect(json.repoContext.contextPackTokens).toBeGreaterThan(0);
    expect(json.graphify.armStatus).toBe("OUTPUT_FILE");
  });

  it("writeGraphifyHeadToHeadReport persists JSON fields required by the protocol", () => {
    const report = runGraphifyHeadToHead({
      taskName: "auth-discovery",
      repoPath: REPO_ROOT,
      graphifyOutputFile: FIXTURE_OUTPUT,
      graphifyCombinedTotals: "100000,98000,102000",
      repoContextCombinedTotals: "62500,62495,62276",
      graphifyQualityScores: "10,10,10",
      repoContextQualityScores: "10,10,10",
    });
    const { jsonPath } = writeGraphifyHeadToHeadReport(report, ".mcp-benchmarks");
    const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(json.fullRawRepoTokens).toBeGreaterThan(0);
    expect(json.relevantRawFileTokens).toBeGreaterThan(0);
    expect(json.graphify.armStatus).toBeDefined();
    expect(json.repoContext.contextPackTokens).toBeGreaterThan(0);
    expect(json.diagnosticWinner).toBeTruthy();
    expect(json.realUsage.supportsScopedClaim).toBe(true);
    expect(json.verdict).toBe("SCOPED_REAL_USAGE_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT_MCP");
  });
});
