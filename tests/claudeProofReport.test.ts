import { describe, expect, it } from "vitest";
import { buildClaudeProofMarkdown, deriveClaudeProofVerdict } from "../src/ab/claudeProofReport.js";
import type { AbRunResult } from "../src/ab/types.js";

describe("claude proof report", () => {
  it("starts NOT_STARTED with no results", () => {
    const verdict = deriveClaudeProofVerdict(undefined, undefined);
    expect(verdict.verdict).toBe("NOT_STARTED");
    const markdown = buildClaudeProofMarkdown([]);
    expect(markdown).toContain("NOT_STARTED");
    expect(markdown).toContain("Claude savings are **not proven**");
  });

  it("reports INCOMPLETE_TEST when locked usage is missing", () => {
    const baseline: AbRunResult = {
      id: "b1",
      planId: "p1",
      mode: "no_mcp",
      client: "claude_code",
      repoPath: ".",
      prompt: "x",
      clientTotalTokenRepeats: [100, 100, 100],
      answerQuality: 9,
      foundExpectedFiles: true,
      usageParsed: true,
    };
    const locked: AbRunResult = {
      id: "l1",
      planId: "p1",
      mode: "context_broker_locked",
      client: "claude_code",
      repoPath: ".",
      prompt: "x",
      mcpToolsUsed: ["context_status", "context_pack"],
      answerQuality: 9,
      foundExpectedFiles: true,
      usageParsed: false,
    };
    const verdict = deriveClaudeProofVerdict(baseline, locked);
    expect(verdict.verdict).toBe("INCOMPLETE_TEST");
    const markdown = buildClaudeProofMarkdown([baseline, locked]);
    expect(markdown).toContain("**INCOMPLETE_TEST**");
    expect(markdown).not.toMatch(/## Verdict[\s\S]*\*\*PROVEN_SAVINGS_STABLE\*\*/);
  });

  it("does not claim savings in report markdown", () => {
    const markdown = buildClaudeProofMarkdown([]);
    expect(markdown).not.toMatch(/proven savings for claude/i);
    expect(markdown).toContain("Non-claims");
  });
});
// verdict tests use synthetic run payloads
