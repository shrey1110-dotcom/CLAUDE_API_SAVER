import { describe, expect, it } from "vitest";
import { CODEX_QA_TASKS } from "../src/ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../src/ab/codexQa/scoring.js";
import { parseMcpToolCounts } from "../src/ab/codexQa/suite.js";

describe("Codex multi-task QA suite", () => {
  it("defines the required five task profiles", () => {
    expect(CODEX_QA_TASKS.map((task) => task.taskName)).toEqual([
      "auth-discovery",
      "impact-analysis",
      "edit-planning",
      "architecture-discovery",
      "onboarding-map",
    ]);
    for (const task of CODEX_QA_TASKS) {
      expect(task.prompt).toContain("Do not edit files");
      expect(task.expectedConcepts.length).toBeGreaterThan(0);
      expect(task.expectedFilePatterns.length).toBeGreaterThan(0);
      expect(task.expectedOutputCategories.length).toBeGreaterThan(0);
      expect(task.passThreshold).toBeGreaterThanOrEqual(8);
    }
  });

  it("scores auth-discovery quality from answer text", () => {
    const auth = CODEX_QA_TASKS[0];
    const score = scoreCodexQaText(
      auth,
      [
        "tests/fixtures/simple-node-app/src/auth/login.ts",
        "tests/fixtures/simple-node-app/src/auth/session.ts",
        "tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts",
        "tests/fixtures/monorepo-app/packages/api/src/session.service.ts",
        "tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx",
        "authentication login session frontend api file function why matters",
      ].join("\n"),
    );
    expect(score.passed).toBe(true);
    expect(score.qualityScore).toBeGreaterThanOrEqual(9);
  });

  it("counts only completed repo-context MCP tool calls", () => {
    const stdout = [
      JSON.stringify({
        type: "item.completed",
        item: { type: "mcp_tool_call", server: "repo-context-mcp", tool: "context_status" },
      }),
      JSON.stringify({
        type: "item.started",
        item: { type: "mcp_tool_call", server: "repo-context-mcp", tool: "context_pack" },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "mcp_tool_call", server: "repo-context-mcp", tool: "context_pack" },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "mcp_tool_call", server: "other", tool: "search_code" },
      }),
    ].join("\n");
    expect(parseMcpToolCounts(stdout)).toEqual({ context_status: 1, context_pack: 1 });
  });
});

