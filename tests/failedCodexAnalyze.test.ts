import path from "node:path";
import { describe, expect, it } from "vitest";
import { assessContextBrokerToolLoop } from "../src/ab/toolLoopPolicy.js";
import { analyzeFailedCodexLog, formatFailedCodexAnalysis } from "../src/telemetry/failedRunAnalyze.js";

const FIXTURE = path.resolve("tests/fixtures/codex-full-context-failure.jsonl");

describe("failed Codex log analyzer", () => {
  it("detects tool loop from failed full context_broker fixture", () => {
    const analysis = analyzeFailedCodexLog(FIXTURE);
    expect(analysis.telemetry.totalCalls).toBe(59);
    expect(analysis.telemetry.callsByTool.context_pack).toBe(5);
    expect(analysis.telemetry.callsByTool.graph_symbol).toBe(12);
    expect(analysis.telemetry.callsByTool.graph_neighbors).toBe(13);
    expect(analysis.telemetry.callsByTool.get_symbol_context).toBe(22);
    expect(analysis.telemetry.estimatedTotalTokens).toBeGreaterThan(14_000);
    expect(analysis.toolLoop.toolLoopFailure).toBe(true);
    expect(analysis.graphAmplifiedLoop).toBe(true);
    expect(analysis.contextPackOverCalled).toBe(true);
    expect(analysis.unnecessaryTools.length).toBeGreaterThan(0);
    expect(analysis.toolLoop.firstRouteDriftAfterContextPack?.tool).toBe("context_pack");
  });

  it("formats actionable analysis output", () => {
    const text = formatFailedCodexAnalysis(analyzeFailedCodexLog(FIXTURE));
    expect(text).toContain("Total tool calls: 59");
    expect(text).toContain("graph/symbol loop amplified: yes");
    expect(text).toContain("Tool-loop failure: yes");
  });

  it("flags TOOL_LOOP_FAILURE for graph/symbol overuse in A/B counts", () => {
    const loop = assessContextBrokerToolLoop({
      counts: {
        context_status: 1,
        context_pack: 1,
        graph_symbol: 12,
        graph_neighbors: 13,
        get_symbol_context: 22,
      },
      totalCalls: 49,
    });
    expect(loop.toolLoopFailure).toBe(true);
    expect(loop.graphToolCalls).toBe(25);
    expect(loop.symbolToolCalls).toBe(22);
    expect(loop.reasons.join(" ")).toMatch(/graph tools/);
    expect(loop.reasons.join(" ")).toMatch(/get_symbol_context/);
  });
});
