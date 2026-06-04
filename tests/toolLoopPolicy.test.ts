import { describe, expect, it } from "vitest";
import { toolsForProfile } from "../src/toolProfiles.js";
import { assessContextBrokerToolLoop, CONTEXT_BROKER_BUDGET } from "../src/ab/toolLoopPolicy.js";

describe("toolLoopPolicy", () => {
  it("codex_locked exposes only context_status and context_pack", () => {
    const tools = toolsForProfile("codex_locked");
    expect(tools).toEqual(["context_status", "context_pack"]);
  });

  it("full profile still exposes all tools", () => {
    const tools = toolsForProfile("full");
    expect(tools).toContain("graph_symbol");
    expect(tools).toContain("search_code");
    expect(tools.length).toBeGreaterThan(2);
  });

  it("assessContextBrokerToolLoop respects fallback budgets", () => {
    const ok = assessContextBrokerToolLoop({
      counts: { context_status: 1, context_pack: 1 },
      totalCalls: 2,
    });
    expect(ok.toolLoopFailure).toBe(false);

    const bad = assessContextBrokerToolLoop({
      counts: { context_status: 1, context_pack: 5, graph_symbol: 12, get_symbol_context: 22 },
      totalCalls: 40,
    });
    expect(bad.toolLoopFailure).toBe(true);
    expect(bad.reasons.some((reason) => reason.includes("context_pack"))).toBe(true);
    expect(bad.totalCalls).toBeGreaterThan(CONTEXT_BROKER_BUDGET.totalFailure);
  });
});
