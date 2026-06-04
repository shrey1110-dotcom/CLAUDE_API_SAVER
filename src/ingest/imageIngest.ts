import fs from "node:fs";
import path from "node:path";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { MAX_SNIPPET_CHARS, MAX_TAGS, type IngestAssetInput, type IngestAssetResult } from "./types.js";
import { guessTagsFromPath } from "./registry.js";

function nodeId(kind: string, relativePath: string): string {
  return `${kind}:${relativePath}`;
}

function parseSvgLabels(content: string): string[] {
  const labels: string[] = [];
  const textPattern = /<text[^>]*>([^<]{1,80})<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = textPattern.exec(content)) !== null) {
    const label = match[1].replace(/\s+/g, " ").trim();
    if (label.length > 1) labels.push(label);
    if (labels.length >= 8) break;
  }
  return labels;
}

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function ingestImageAsset(input: IngestAssetInput, content?: string): IngestAssetResult {
  const ext = path.extname(input.relativePath).toLowerCase();
  const isDiagram = ext === ".svg";
  const kind = isDiagram ? "diagram" : "image";
  const assetId = nodeId(kind, input.relativePath);
  const tags = guessTagsFromPath(input.relativePath);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  let labels: string[] = [];
  if (isDiagram && content) {
    labels = parseSvgLabels(content);
    tags.push(...labels.flatMap((label) => guessTagsFromPath(label)));
  }

  const summary =
    labels.length > 0
      ? `Diagram labels: ${labels.slice(0, 4).join(", ")}`
      : `${kind} asset (${input.sizeBytes} bytes), metadata only.`;

  nodes.push({
    id: assetId,
    type: isDiagram ? "diagram" : "image",
    name: path.basename(input.relativePath),
    path: input.relativePath,
    summary: summary.length <= MAX_SNIPPET_CHARS ? summary : summary.slice(0, MAX_SNIPPET_CHARS),
    tags: [...new Set(tags)].slice(0, MAX_TAGS),
    sizeBytes: input.sizeBytes,
    extension: ext,
    mimeType: MIME_BY_EXT[ext],
    sourceType: kind,
    extractionStatus: labels.length > 0 ? "extracted" : "metadata_only",
    title: path.basename(input.relativePath, ext),
    headings: labels.length ? labels : undefined,
  } as GraphNode);

  if (tags.length > 0) {
    const conceptId = `concept:${tags[0]}`;
    nodes.push({
      id: conceptId,
      type: "concept",
      name: tags[0],
      summary: `Concept from ${kind} path/labels`,
      tags: tags.slice(0, MAX_TAGS),
      sourceType: kind,
      extractionStatus: "metadata_only",
    } as GraphNode);
    edges.push({ from: assetId, to: conceptId, type: "related_to", weight: 0.5 });
    edges.push({ from: conceptId, to: assetId, type: "explains", weight: 0.3 });
  }

  return { nodes, edges };
}
