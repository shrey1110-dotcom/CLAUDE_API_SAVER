import { afterEach, describe, expect, it } from "vitest";
import { getCodexQaTask } from "../src/ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../src/ab/codexQa/scoring.js";
import { AUTH_DISCOVERY_EXPECTED_FILES } from "../src/ab/authDiscoveryQuality.js";
import { buildContextPack, getContextStatus } from "../src/context/broker.js";
import { resetConfigForTests } from "../src/config.js";
import { toolsForProfile } from "../src/toolProfiles.js";
import fs from "node:fs";
import path from "node:path";

const AUTH_PROMPT =
  "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.";

const PROOF_DOC = path.resolve("docs/proofs/codex-auth-discovery-locked.md");
const IMPACT_PROOF_DOC = path.resolve("docs/proofs/codex-multi-task-locked.md");

afterEach(() => {
  delete process.env.MCP_CONTEXT_PACK_MINIMAL;
  delete process.env.MCP_CONTEXT_PACK_BUDGET_TOKENS;
  delete process.env.MCP_CONTEXT_PACK_MAX_FILES;
  delete process.env.MCP_CONTEXT_PACK_MAX_SYMBOLS;
  delete process.env.MCP_TOOL_PROFILE;
  resetConfigForTests();
});

describe("broker_proof_min", () => {
  it("exposes only context_status and context_pack", () => {
    expect(toolsForProfile("broker_proof_min")).toEqual(["context_status", "context_pack"]);
    expect(toolsForProfile("broker_proof_min")).not.toContain("graph_query");
    expect(toolsForProfile("broker_proof_min")).not.toContain("search_code");
  });

  it("builds auth-discovery minimal pack with 5/5 expected files within budget", () => {
    process.env.MCP_CONTEXT_PACK_MINIMAL = "1";
    process.env.MCP_CONTEXT_PACK_BUDGET_TOKENS = "500";
    process.env.MCP_CONTEXT_PACK_MAX_FILES = "6";
    process.env.MCP_CONTEXT_PACK_MAX_SYMBOLS = "6";
    resetConfigForTests();

    const pack = buildContextPack({ task: AUTH_PROMPT, mode: "discovery", budgetTokens: 500 });
    const profile = getCodexQaTask("auth-discovery")!;
    const score = scoreCodexQaText(profile, JSON.stringify(pack));

    expect(pack.estimatedOutputTokens ?? 0).toBeLessThanOrEqual(700);
    expect(score.matchedFiles.length).toBe(5);
    for (const file of AUTH_DISCOVERY_EXPECTED_FILES) {
      expect(score.matchedFiles).toContain(file);
      expect(pack.files.some((entry) => entry.path === file)).toBe(true);
    }
    expect(score.qualityScore).toBeGreaterThanOrEqual(9);
    expect(pack.docs).toBeUndefined();
    expect(pack.concepts).toBeUndefined();
    expect(pack.files.every((file) => !file.path.startsWith("docs/proofs/"))).toBe(true);
    expect(pack.files.every((file) => !file.path.startsWith("src/ab/"))).toBe(true);
  });

  it("includes expected auth concepts in minimal pack scoring", () => {
    process.env.MCP_CONTEXT_PACK_MINIMAL = "1";
    process.env.MCP_CONTEXT_PACK_BUDGET_TOKENS = "500";
    resetConfigForTests();

    const pack = buildContextPack({ task: AUTH_PROMPT, mode: "discovery", budgetTokens: 500 });
    const profile = getCodexQaTask("auth-discovery")!;
    const score = scoreCodexQaText(profile, JSON.stringify(pack));
    expect(score.expectedConceptsFound).toBe(true);
    expect(score.matchedConcepts.length).toBeGreaterThanOrEqual(3);
  });

  it("compacts context_status in minimal mode", () => {
    process.env.MCP_CONTEXT_PACK_MINIMAL = "1";
    resetConfigForTests();
    const status = getContextStatus(process.cwd());
    expect(status.graphExists).toBeDefined();
    expect(status.graphNodeCount).toBe(0);
    expect(status.graphEdgeCount).toBe(0);
  });

  it.skipIf(!fs.existsSync(path.resolve(".mcp-ab-tests/codex-qa/results/auth-discovery/context_broker_locked.json")))(
    "leaves existing auth-discovery proof data unchanged",
    () => {
    const proofPath = path.resolve(".mcp-ab-tests/codex-qa/results/auth-discovery/context_broker_locked.json");
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8")) as {
      mode?: string;
      repeats?: Array<{ runDir?: string; quality?: { qualityScore?: number; expectedFilesFound?: boolean } }>;
      quality?: { qualityScore?: number };
    };
    expect(proof.mode).toBe("context_broker_locked");
    expect(proof.repeats?.length).toBe(3);
    expect(proof.repeats?.every((run) => run.runDir?.includes("2026-06-06T01-19-51-500Z-context_broker_locked"))).toBe(
      true,
    );
    expect(proof.quality?.qualityScore).toBe(10);
    expect(proof.repeats?.every((run) => run.quality?.expectedFilesFound)).toBe(true);
  },
  );

  it.skipIf(!fs.existsSync(path.resolve(".mcp-ab-tests/codex-qa/results/impact-analysis/context_broker_locked.json")))(
    "leaves impact-analysis proof data unchanged",
    () => {
    const proofPath = path.resolve(".mcp-ab-tests/codex-qa/results/impact-analysis/context_broker_locked.json");
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8")) as { repeats?: unknown[] };
    expect(proof.repeats?.length).toBeGreaterThanOrEqual(3);
  },
  );

  it("does not claim Graphify superiority in proof docs", () => {
    const authProof = fs.readFileSync(PROOF_DOC, "utf8");
    const multiProof = fs.readFileSync(IMPACT_PROOF_DOC, "utf8");
    expect(authProof.toLowerCase()).not.toMatch(/beat graphify|beats graphify/);
    expect(multiProof.toLowerCase()).not.toMatch(/beat graphify|beats graphify/);
  });
});
