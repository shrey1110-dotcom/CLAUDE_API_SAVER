import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ingestImageAsset } from "../src/ingest/imageIngest.js";
import { ingestMarkdownAsset } from "../src/ingest/markdownIngest.js";
import { ingestPdfAsset } from "../src/ingest/pdfIngest.js";
import { ingestTranscriptAsset } from "../src/ingest/transcriptIngest.js";
import { mergeMultimodalIntoGraph } from "../src/ingest/multimodalBuild.js";
import { spawnSync } from "node:child_process";
import { buildContextPack } from "../src/context/broker.js";
import { formatContextPackMarkdown } from "../src/context/formatPack.js";
import { getQueriesLogPath } from "../src/queries/paths.js";
import { toolsForProfile } from "../src/toolProfiles.js";
import { evaluateAuthDiscoveryPack } from "../src/taskProfiles/authDiscovery.js";
import type { RepoGraph } from "../src/graph/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("multimodal ingestion", () => {
  it("creates doc and heading nodes from markdown", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mm-md-"));
    tempDirs.push(root);
    const rel = "docs/auth.md";
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, rel),
      "# Auth\n\nLogin/session notes for tests/fixtures/simple-node-app/src/auth/login.ts\n",
      "utf8",
    );
    const result = ingestMarkdownAsset({ root, relativePath: rel, sizeBytes: 120 });
    expect(result.nodes.some((n) => n.type === "doc")).toBe(true);
    expect(result.nodes.some((n) => n.type === "heading")).toBe(true);
    expect(result.edges.some((e) => e.type === "contains")).toBe(true);
    const raw = JSON.stringify(result.nodes);
    expect(raw.length).toBeLessThan(8000);
  });

  it("creates metadata-only PDF node without extractor", () => {
    const result = ingestPdfAsset({ root: "/tmp", relativePath: "docs/guide.pdf", sizeBytes: 4096 });
    expect(result.nodes[0].type).toBe("pdf");
    expect(result.nodes[0].extractionStatus).toBe("unsupported_without_optional_dependency");
  });

  it("creates image metadata and parses SVG labels", () => {
    const svg = '<svg><text>Login Flow</text><text>Session</text></svg>';
    const result = ingestImageAsset({ root: "/tmp", relativePath: "docs/diagrams/auth-flow.svg", sizeBytes: 200 }, svg);
    expect(result.nodes[0].type).toBe("diagram");
    expect(result.nodes[0].headings).toContain("Login Flow");
  });

  it("ingests transcript sidecar and links media", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mm-tr-"));
    tempDirs.push(root);
    const rel = "media/demo.vtt";
    fs.mkdirSync(path.join(root, "media"), { recursive: true });
    fs.writeFileSync(path.join(root, rel), "WEBVTT\n\n00:00.000 --> 00:01.000\nauth login session\n", "utf8");
    const result = ingestTranscriptAsset({ root, relativePath: rel, sizeBytes: 80 });
    expect(result.nodes[0].type).toBe("transcript");
    expect(result.edges.some((e) => e.type === "transcript_of")).toBe(true);
  });

  it("merges multimodal nodes into graph without large raw content", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mm-graph-"));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs/auth.md"), "# Auth\nSession login\n", "utf8");
    const base: RepoGraph = {
      version: "1.0.0",
      root,
      generatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
    };
    const merged = mergeMultimodalIntoGraph(base, root);
    expect(merged.stats.docCount).toBeGreaterThan(0);
    expect(JSON.stringify(merged.graph).length).toBeLessThan(20000);
  });
});

describe("context broker multimodal", () => {
  it("codex_locked exposes only context_status and context_pack", () => {
    expect(toolsForProfile("codex_locked")).toEqual(["context_status", "context_pack"]);
  });

  it("auth-discovery pack finds 5/5 expected files on fixture repo", () => {
    const pack = buildContextPack({
      task: "Find where authentication, login, or user session logic is implemented",
      root: process.cwd(),
      budgetTokens: 1000,
    });
    const evalResult = evaluateAuthDiscoveryPack(pack.files.map((f) => f.path));
    expect(evalResult.foundExpectedFiles).toBe(true);
    expect(pack.estimatedOutputTokens).toBeLessThanOrEqual(1000);
  });

  it("context:pack CLI writes markdown under budget", () => {
    const root = process.cwd();
    const out = path.join(root, ".context-packs", "test-auth-discovery.md");
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const run = spawnSync(
      "node",
      [
        "dist/context/packContext.js",
        "--task",
        "Find where authentication, login, or user session logic is implemented",
        "--budget",
        "1000",
        "--format",
        "markdown",
        "--out",
        out,
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(run.status).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    const text = fs.readFileSync(out, "utf8");
    expect(text).toContain("## Files");
    expect(text.length).toBeLessThan(1000 * 4);
    expect(fs.existsSync(getQueriesLogPath(root))).toBe(true);
  });

  it("formatContextPackMarkdown includes docs/assets sections when present", () => {
    const md = formatContextPackMarkdown({
      task: "auth",
      mode: "discovery",
      budgetTokens: 1000,
      summary: "test",
      files: [],
      symbols: [],
      docs: [{ path: "docs/auth.md", reason: "match", score: 10 }],
      assets: [{ path: "docs/diagram.svg", type: "diagram", reason: "match", score: 8 }],
      concepts: [{ name: "auth", reason: "cluster", score: 9 }],
      nextSteps: [],
      needsFullFileRead: false,
      truncated: false,
    });
    expect(md).toContain("## Docs");
    expect(md).toContain("## Assets");
    expect(md).toContain("## Concepts");
  });
});
