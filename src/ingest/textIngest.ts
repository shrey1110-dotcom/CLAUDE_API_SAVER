import fs from "node:fs";
import path from "node:path";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { MAX_SNIPPET_CHARS, MAX_TAGS, type IngestAssetInput, type IngestAssetResult } from "./types.js";
import { guessTagsFromPath } from "./registry.js";

function nodeId(kind: string, relativePath: string): string {
  return `${kind}:${relativePath}`;
}

function compactSnippet(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= MAX_SNIPPET_CHARS ? normalized : `${normalized.slice(0, MAX_SNIPPET_CHARS - 3)}...`;
}

function extractPathMentions(text: string): string[] {
  const matches = text.match(/(?:tests\/|src\/|docs\/|packages\/)[a-zA-Z0-9_./-]+\.[a-z]{1,4}/g) ?? [];
  return [...new Set(matches)].slice(0, 8);
}

export function ingestTextAsset(input: IngestAssetInput, content: string): IngestAssetResult {
  const ext = path.extname(input.relativePath).toLowerCase();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const docId = nodeId("doc", input.relativePath);
  const tags = guessTagsFromPath(input.relativePath);

  nodes.push({
    id: docId,
    type: "doc",
    name: path.basename(input.relativePath),
    path: input.relativePath,
    summary: compactSnippet(content),
    tags: [...new Set(tags)].slice(0, MAX_TAGS),
    sizeBytes: input.sizeBytes,
    extension: ext,
    sourceType: "text",
    extractionStatus: "extracted",
    title: path.basename(input.relativePath, ext),
  } as GraphNode);

  for (const mention of extractPathMentions(content)) {
    edges.push({ from: docId, to: `file:${mention}`, type: "mentions", weight: 0.6 });
    edges.push({ from: docId, to: `file:${mention}`, type: "references", weight: 0.5 });
  }

  return { nodes, edges };
}
