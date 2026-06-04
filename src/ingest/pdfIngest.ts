import path from "node:path";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { MAX_SNIPPET_CHARS, MAX_TAGS, type IngestAssetInput, type IngestAssetResult } from "./types.js";
import { guessTagsFromPath } from "./registry.js";

function nodeId(relativePath: string): string {
  return `pdf:${relativePath}`;
}

export function ingestPdfAsset(input: IngestAssetInput): IngestAssetResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const pdfId = nodeId(input.relativePath);
  const title = path.basename(input.relativePath, ".pdf");
  const tags = guessTagsFromPath(input.relativePath);

  nodes.push({
    id: pdfId,
    type: "pdf",
    name: title,
    path: input.relativePath,
    summary: `PDF asset (${input.sizeBytes} bytes). Local text extraction not enabled.`,
    tags: tags.slice(0, MAX_TAGS),
    sizeBytes: input.sizeBytes,
    extension: ".pdf",
    mimeType: "application/pdf",
    sourceType: "pdf",
    extractionStatus: "unsupported_without_optional_dependency",
    title,
  } as GraphNode);

  if (tags.length > 0) {
    const conceptId = `concept:${tags[0]}`;
    nodes.push({
      id: conceptId,
      type: "concept",
      name: tags[0],
      summary: `Concept tag from PDF filename/path`,
      tags,
      sourceType: "pdf",
      extractionStatus: "metadata_only",
    } as GraphNode);
    edges.push({ from: pdfId, to: conceptId, type: "related_to", weight: 0.4 });
  }

  return { nodes, edges };
}
