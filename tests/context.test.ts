import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildContextPack, buildImpactPack, getContextStatus } from "../src/context/broker.js";
import { writeContextCapsules } from "../src/context/buildContext.js";
import { loadCapsules } from "../src/context/loadContext.js";
import { getGraphCachePaths } from "../src/graph/paths.js";
import { writeRepoGraph } from "../src/graph/buildGraph.js";
import { fixturePath, outputMeta } from "./helpers.js";

describe("context broker", () => {
  const root = fixturePath("monorepo-app");

  it("context:build creates capsules.json and context-manifest.json", () => {
    writeRepoGraph(root);
    const { manifest } = writeContextCapsules(root);
    const paths = getGraphCachePaths(root);
    expect(fs.existsSync(paths.capsulesPath)).toBe(true);
    expect(fs.existsSync(paths.contextManifestPath)).toBe(true);
    expect(manifest.capsuleCount).toBeGreaterThan(0);
  });

  it("capsules stay under 1200 chars each", () => {
    const capsules = loadCapsules(root)!;
    for (const capsule of capsules) {
      expect(JSON.stringify(capsule).length).toBeLessThanOrEqual(1200);
    }
  });

  it("capsules include auth/config/tests topics when relevant", () => {
    const capsules = loadCapsules(root)!;
    const topics = capsules.map((c) => c.topic);
    expect(topics).toContain("auth");
    expect(topics).toContain("config");
    expect(topics).toContain("tests");
  });

  it("context_status handles missing capsules", () => {
    const status = getContextStatus(fixturePath("empty-repo"));
    expect(status.capsulesExist).toBe(false);
    expect(status.suggestedCommands.length).toBeGreaterThan(0);
  });

  it("context_pack finds auth/login/session files", () => {
    writeRepoGraph(root);
    writeContextCapsules(root);
    const pack = buildContextPack({
      task: "authentication login session",
      root,
      budgetTokens: 1000,
    });
    const text = JSON.stringify(pack);
    expect(text).toMatch(/auth|login|session/i);
    expect(pack.files.length).toBeGreaterThan(0);
  });

  it("context_pack respects budgetTokens", () => {
    const pack = buildContextPack({ task: "auth", root, budgetTokens: 400 });
    const meta = outputMeta(pack);
    expect(meta.chars).toBeLessThanOrEqual(400 * 4 + 100);
  });

  it("context_pack does not return full files", () => {
    const pack = buildContextPack({ task: "auth", root, budgetTokens: 1000 });
    const text = JSON.stringify(pack);
    expect(text).not.toContain("export async function");
    expect(text).not.toContain("password");
  });

  it("impact_pack returns risk and dependents structure", () => {
    writeRepoGraph(root);
    writeContextCapsules(root);
    const impact = buildImpactPack({
      changedFiles: ["packages/api/src/auth.controller.ts"],
      root,
      budgetTokens: 1000,
    });
    expect(impact.changedFiles.length).toBe(1);
    expect(["low", "medium", "high"]).toContain(impact.riskLevel);
  });

  it("invalid budget values fall back safely", () => {
    const pack = buildContextPack({ task: "auth", root, budgetTokens: 99999 });
    expect(pack.budgetTokens).toBeLessThanOrEqual(2500);
  });
});
