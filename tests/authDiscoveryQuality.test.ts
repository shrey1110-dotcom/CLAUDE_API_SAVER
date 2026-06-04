import { describe, expect, it } from "vitest";
import {
  AUTH_DISCOVERY_EXPECTED_FILES,
  extractMcpToolsFromCodexTranscript,
  scoreAuthDiscoveryAnswer,
} from "../src/ab/authDiscoveryQuality.js";

describe("auth-discovery quality scoring", () => {
  it("scores 9/10 when all expected files are mentioned", () => {
    const text = AUTH_DISCOVERY_EXPECTED_FILES.join("\n");
    const score = scoreAuthDiscoveryAnswer(text);
    expect(score.foundExpectedFiles).toBe(true);
    expect(score.answerQuality).toBe(9);
    expect(score.missing).toHaveLength(0);
  });

  it("scores 7/10 when one expected file is missing", () => {
    const text = AUTH_DISCOVERY_EXPECTED_FILES.filter((file) => !file.includes("LoginPage")).join("\n");
    const score = scoreAuthDiscoveryAnswer(text);
    expect(score.foundExpectedFiles).toBe(false);
    expect(score.answerQuality).toBe(7);
    expect(score.missing).toHaveLength(1);
  });

  it("extracts MCP tools from Codex JSON transcript lines", () => {
    const text = [
      '{"type":"item.completed","item":{"type":"mcp_tool_call","server":"repo-context-mcp","tool":"context_status"}}',
      '{"type":"item.completed","item":{"type":"mcp_tool_call","server":"repo-context-mcp","tool":"context_pack"}}',
    ].join("\n");
    expect(extractMcpToolsFromCodexTranscript(text)).toEqual(["context_status", "context_pack"]);
  });
});
