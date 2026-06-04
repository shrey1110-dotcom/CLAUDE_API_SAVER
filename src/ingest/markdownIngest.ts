import fs from "node:fs";
import path from "node:path";
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { MAX_HEADINGS, MAX_SNIPPET_CHARS, MAX_TAGS, type IngestAssetInput, type IngestAssetResult } from "./types.js";
import { guessTagsFromPath } from "./registry.js";

function nodeId(kind: string, relativePath: string, suffix = ""): string {
  return `${kind}:${relativePath}${suffix ? `#${suffix}` : ""}`;
}

function compactSnippet(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= MAX_SNIPPET_CHARS ? normalized : `${normalized.slice(0, MAX_SNIPPET_CHARS - 3)}...`;
}

function parseHeadings(content: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  for (const line of content.split("\n")) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    headings.push({ level: match[1].length, text: match[2].trim() });
    if (headings.length >= MAX_HEADINGS) break;
  }
  return headings;
}

function extractPathMentions(text: string): string[] {
  const matches = text.match(/(?:tests\/|src\/|docs\/|packages\/)[a-zA-Z0-9_./-]+\.[a-z]{1,4}/g) ?? [];
  return [...new Set(matches)].slice(0, 8);
}

export function ingestMarkdownAsset(input: IngestAssetInput, content?: string): IngestAssetResult {
  const text = content ?? fs.readFileSync(path.join(input.root, input.relativePath), "utf8");
  const ext = path.extname(input.relativePath).toLowerCase();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const docId = nodeId("doc", input.relativePath);
  const headings = parseHeadings(text);
  const headingTexts = headings.map((h) => h.text);
  const tags = [
    ...guessTagsFromPath(input.relativePath),
    ...headingTexts.flatMap((h) => guessTagsFromPath(h)),
  ].slice(0, MAX_TAGS);

  nodes.push({
    id: docId,
    type: "doc",
    name: path.basename(input.relativePath),
    path: input.relativePath,
    summary: compactSnippet(text),
    tags: [...new Set(tags)].slice(0, MAX_TAGS),
    sizeBytes: input.sizeBytes,
    extension: ext,
    mimeType: "text/markdown",
    sourceType: "markdown",
    extractionStatus: "extracted",
    title: path.basename(input.relativePath, ext),
    headings: headingTexts,
  } as GraphNode);

  for (const [index, heading] of headings.entries()) {
    const headingId = nodeId("heading", input.relativePath, String(index));
    nodes.push({
      id: headingId,
      type: "heading",
      name: heading.text,
      path: input.relativePath,
      summary: `Heading level ${heading.level}`,
      tags: guessTagsFromPath(heading.text),
      sourceType: "markdown",
      extractionStatus: "extracted",
    } as GraphNode);
    edges.push({ from: docId, to: headingId, type: "contains", weight: 1 });
    edges.push({ from: headingId, to: docId, type: "documents", weight: 0.8 });
  }

  for (const mention of extractPathMentions(text)) {
    edges.push({ from: docId, to: `file:${mention}`, type: "mentions", weight: 0.7 });
    edges.push({ from: docId, to: `file:${mention}`, type: "references", weight: 0.6 });
  }

  if (tags.length > 0) {
    const conceptId = `concept:${tags[0]}`;
    nodes.push({
      id: conceptId,
      type: "concept",
      name: tags[0],
      summary: `Concept derived from ${input.relativePath}`,
      tags,
      sourceType: "markdown",
      extractionStatus: "derived_from",
    } as GraphNode);
    edges.push({ from: docId, to: conceptId, type: "derived_from", weight: 0.5 });
    edges.push({ from: conceptId, to: docId, type: "explains", weight: 0.4 });
  }

  return { nodes, edges };
}
