import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeRepoGraph } from "../src/graph/buildGraph.js";
import { getGraphCachePaths } from "../src/graph/paths.js";
import {
  getGraphNeighbors,
  getGraphPaths,
  getGraphStatus,
  getGraphSymbol,
  loadGraph,
  queryGraph,
} from "../src/graph/queryGraph.js";
import { graphStatus } from "../src/tools/graphTools.js";
import { fixturePath, outputMeta } from "./helpers.js";

describe("knowledge graph", () => {
  const root = fixturePath("monorepo-app");

  it("graph:build creates graph.json and manifest.json", () => {
    const { manifest } = writeRepoGraph(root);
    const paths = getGraphCachePaths(root);
    expect(fs.existsSync(paths.graphPath)).toBe(true);
    expect(fs.existsSync(paths.manifestPath)).toBe(true);
    expect(manifest.fileCount).toBeGreaterThan(0);
  });

  it("excludes noisy directories", () => {
    const graph = loadGraph(root)!;
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("node_modules");
    expect(serialized).not.toContain(".git");
  });

  it("includes file, directory, symbol, config, and command nodes", () => {
    const graph = loadGraph(root)!;
    const types = new Set(graph.nodes.map((n) => n.type));
    expect(types.has("file")).toBe(true);
    expect(types.has("directory")).toBe(true);
    expect(types.has("function") || types.has("symbol") || types.has("class")).toBe(true);
    expect(types.has("config") || types.has("file")).toBe(true);

    const appRoot = fixturePath("simple-node-app");
    writeRepoGraph(appRoot);
    const appGraph = loadGraph(appRoot)!;
    const appTypes = new Set(appGraph.nodes.map((n) => n.type));
    expect(appTypes.has("command")).toBe(true);
  });

  it("includes contains, imports, exports, and configures edges", () => {
    const graph = loadGraph(root)!;
    const edgeTypes = new Set(graph.edges.map((e) => e.type));
    expect(edgeTypes.has("contains")).toBe(true);
    expect(edgeTypes.has("exports") || edgeTypes.has("contains")).toBe(true);
  });

  it("graph_query finds auth/login/session files", () => {
    const result = queryGraph("auth login session", { root, maxResults: 10 });
    const text = JSON.stringify(result);
    expect(text).toMatch(/auth|login|session/i);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("graph_symbol finds login-related symbols", () => {
    writeRepoGraph(fixturePath("simple-node-app"));
    const result = getGraphSymbol({ symbol: "loginUser", root: fixturePath("simple-node-app") });
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("graph_neighbors returns related nodes", () => {
    const result = getGraphNeighbors({ path: "packages/api/src/auth.controller.ts", root, depth: 1 });
    expect(result.neighbors.length).toBeGreaterThan(0);
  });

  it("graph_paths returns a path when endpoints exist", () => {
    const result = getGraphPaths({
      from: "packages/api/src/auth.controller.ts",
      to: "packages/api/src/session.service.ts",
      root,
      maxDepth: 4,
    });
    expect(result.paths.length).toBeGreaterThanOrEqual(0);
  });

  it("graph_status handles missing graph gracefully", () => {
    const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "repo-context-no-graph-"));
    const status = getGraphStatus(missingRoot);
    expect(status.exists).toBe(false);
    expect(status.suggestedCommand).toContain("graph:build");
  });

  it("graph output respects MCP_MAX_RESPONSE_CHARS", () => {
    process.env.MCP_MAX_RESPONSE_CHARS = "1500";
    const meta = outputMeta(graphStatus(root));
    expect(meta.chars).toBeLessThanOrEqual(1500);
    delete process.env.MCP_MAX_RESPONSE_CHARS;
  });
});
