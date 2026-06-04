import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContextPack, buildImpactPack, getContextStatus } from "../src/context/broker.js";
import { writeContextCapsules } from "../src/context/buildContext.js";
import { loadCapsules } from "../src/context/loadContext.js";
import { getGraphCachePaths } from "../src/graph/paths.js";
import { writeRepoGraph } from "../src/graph/buildGraph.js";
import { toolsForProfile } from "../src/toolProfiles.js";
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

  it("auth-discovery context_pack includes expected fixture files with compact output", () => {
    const repoRoot = path.resolve(".");
    writeRepoGraph(repoRoot);
    writeContextCapsules(repoRoot);
    const pack = buildContextPack({
      task: "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.",
      root: repoRoot,
      budgetTokens: 1000,
    });
    const paths = new Set(pack.files.map((file) => file.path));
    expect(paths.has("tests/fixtures/simple-node-app/src/auth/login.ts")).toBe(true);
    expect(paths.has("tests/fixtures/simple-node-app/src/auth/session.ts")).toBe(true);
    expect(paths.has("tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts")).toBe(true);
    expect(paths.has("tests/fixtures/monorepo-app/packages/api/src/session.service.ts")).toBe(true);
    expect(paths.has("tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx")).toBe(true);
    const meta = outputMeta(pack);
    expect(meta.chars).toBeLessThan(4000);
  });

  it("codex_locked profile exposes only context_status and context_pack", () => {
    const tools = toolsForProfile("codex_locked");
    expect(tools).toEqual(["context_status", "context_pack"]);
  });

  it("context_pack uses graph internally while locked profile hides graph tools", () => {
    const source = fs.readFileSync(path.resolve("src/context/broker.ts"), "utf8");
    expect(source).toContain("queryGraph(");
    const tools = toolsForProfile("codex_locked");
    expect(tools).not.toContain("graph_query");
    expect(tools).not.toContain("graph_symbol");
    expect(tools).not.toContain("graph_neighbors");
  });
});
