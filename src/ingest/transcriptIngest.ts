import fs from "node:fs";
import path from "node:path";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { MAX_SNIPPET_CHARS, MAX_TAGS, type IngestAssetInput, type IngestAssetResult } from "./types.js";
import { guessTagsFromPath } from "./registry.js";

function nodeId(relativePath: string): string {
  return `transcript:${relativePath}`;
}

function stripVttSrt(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^\d+$/.test(line.trim()) && !line.includes("-->"))
    .join(" ");
}

function compactSnippet(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= MAX_SNIPPET_CHARS ? normalized : `${normalized.slice(0, MAX_SNIPPET_CHARS - 3)}...`;
}

export function ingestTranscriptAsset(input: IngestAssetInput, content?: string): IngestAssetResult {
  const raw = content ?? fs.readFileSync(path.join(input.root, input.relativePath), "utf8");
  const text = stripVttSrt(raw);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const transcriptId = nodeId(input.relativePath);
  const tags = [...guessTagsFromPath(input.relativePath), ...guessTagsFromPath(text.slice(0, 300))].slice(0, MAX_TAGS);

  nodes.push({
    id: transcriptId,
    type: "transcript",
    name: path.basename(input.relativePath),
    path: input.relativePath,
    summary: compactSnippet(text),
    tags: [...new Set(tags)].slice(0, MAX_TAGS),
    sizeBytes: input.sizeBytes,
    extension: path.extname(input.relativePath).toLowerCase(),
    sourceType: "transcript",
    extractionStatus: "transcript_sidecar",
    title: path.basename(input.relativePath),
  } as GraphNode);

  const mediaGuess = input.relativePath
    .replace(/\.transcript\.txt$/i, "")
    .replace(/\.(vtt|srt)$/i, "");
  if (mediaGuess !== input.relativePath) {
    const mediaId = `media:${mediaGuess}`;
    edges.push({ from: transcriptId, to: mediaId, type: "transcript_of", weight: 1 });
    edges.push({ from: mediaId, to: transcriptId, type: "contains", weight: 0.8 });
  }

  if (tags.length > 0) {
    const conceptId = `concept:${tags[0]}`;
    nodes.push({
      id: conceptId,
      type: "concept",
      name: tags[0],
      summary: `Concept from transcript ${input.relativePath}`,
      tags,
      sourceType: "transcript",
      extractionStatus: "extracted",
    } as GraphNode);
    edges.push({ from: transcriptId, to: conceptId, type: "derived_from", weight: 0.6 });
  }

  return { nodes, edges };
}
