import fs from "node:fs";
import path from "node:path";
import { resolveRoot, toRelativePath } from "../pathSafety.js";
import { GRAPH_EXCLUDE_DIRS } from "../graph/constants.js";
import type { GraphEdge, GraphNode, RepoGraph } from "../graph/types.js";
import { ingestImageAsset } from "./imageIngest.js";
import { ingestMarkdownAsset } from "./markdownIngest.js";
import { ingestPdfAsset } from "./pdfIngest.js";
import { classifyIngestPath } from "./registry.js";
import { ingestTextAsset } from "./textIngest.js";
import { ingestTranscriptAsset } from "./transcriptIngest.js";
import type { MultimodalBuildStats } from "./types.js";

const MAX_MULTIMODAL_FILES = 500;

function shouldSkipDir(name: string): boolean {
  return GRAPH_EXCLUDE_DIRS.has(name);
}

function walkMultimodalFiles(root: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (files.length >= MAX_MULTIMODAL_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_MULTIMODAL_FILES) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".github") continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const rel = toRelativePath(root, fullPath);
        if (classifyIngestPath(rel)) files.push(rel);
      }
    }
  }

  walk(root);
  return files;
}

function ingestMediaMetadata(input: { root: string; relativePath: string; sizeBytes: number }): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const mediaId = `media:${input.relativePath}`;
  const ext = path.extname(input.relativePath).toLowerCase();
  return {
    nodes: [
      {
        id: mediaId,
        type: "media",
        name: path.basename(input.relativePath),
        path: input.relativePath,
        summary: `Media asset (${input.sizeBytes} bytes), metadata only.`,
        sizeBytes: input.sizeBytes,
        extension: ext,
        sourceType: "media",
        extractionStatus: "metadata_only",
        title: path.basename(input.relativePath, ext),
      } as GraphNode,
    ],
    edges: [],
  };
}

export function ingestMultimodalAssets(root?: string): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: MultimodalBuildStats;
} {
  const resolvedRoot = resolveRoot(root);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const stats: MultimodalBuildStats = {
    docCount: 0,
    headingCount: 0,
    pdfCount: 0,
    imageCount: 0,
    mediaCount: 0,
    transcriptCount: 0,
    conceptCount: 0,
    edgeCount: 0,
  };

  for (const relativePath of walkMultimodalFiles(resolvedRoot)) {
    const fullPath = path.join(resolvedRoot, relativePath);
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(fullPath).size;
    } catch {
      continue;
    }

    const kind = classifyIngestPath(relativePath);
    if (!kind) continue;

    const input = { root: resolvedRoot, relativePath, sizeBytes };
    let result: { nodes: GraphNode[]; edges: GraphEdge[] };

    try {
      if (kind === "markdown") {
        result = ingestMarkdownAsset(input);
        stats.docCount += 1;
        stats.headingCount += result.nodes.filter((n) => n.type === "heading").length;
      } else if (kind === "text") {
        const content = fs.readFileSync(fullPath, "utf8");
        result = ingestTextAsset(input, content);
        stats.docCount += 1;
      } else if (kind === "pdf") {
        result = ingestPdfAsset(input);
        stats.pdfCount += 1;
      } else if (kind === "image" || kind === "diagram") {
        const content = kind === "diagram" ? fs.readFileSync(fullPath, "utf8") : undefined;
        result = ingestImageAsset(input, content);
        stats.imageCount += result.nodes.filter((n) => n.type === "image" || n.type === "diagram").length;
      } else if (kind === "transcript") {
        result = ingestTranscriptAsset(input);
        stats.transcriptCount += 1;
      } else if (kind === "media") {
        result = ingestMediaMetadata(input);
        stats.mediaCount += 1;
      } else {
        continue;
      }
    } catch {
      continue;
    }

    stats.conceptCount += result.nodes.filter((n) => n.type === "concept").length;
    nodes.push(...result.nodes);
    edges.push(...result.edges);
  }

  stats.edgeCount = edges.length;
  return { nodes, edges, stats };
}

export function mergeMultimodalIntoGraph(graph: RepoGraph, root?: string): { graph: RepoGraph; stats: MultimodalBuildStats } {
  const { nodes, edges, stats } = ingestMultimodalAssets(root);
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  const mergedNodes = [...graph.nodes];
  for (const node of nodes) {
    if (!existingIds.has(node.id)) {
      existingIds.add(node.id);
      mergedNodes.push(node);
    }
  }

  const edgeKeys = new Set(graph.edges.map((e) => `${e.from}|${e.to}|${e.type}`));
  const mergedEdges = [...graph.edges];
  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key);
      mergedEdges.push(edge);
    }
  }

  return {
    graph: { ...graph, nodes: mergedNodes, edges: mergedEdges },
    stats,
  };
}
