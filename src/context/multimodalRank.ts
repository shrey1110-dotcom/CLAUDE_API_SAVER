import { loadGraph } from "../graph/queryGraph.js";
import type { GraphNode } from "../graph/types.js";

function normalizeTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
}

function scoreNode(node: GraphNode, terms: string[]): number {
  const haystack = `${node.name} ${node.summary ?? ""} ${(node.tags ?? []).join(" ")} ${(node.headings ?? []).join(" ")} ${node.path ?? ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 10;
  }
  if (node.type === "doc" || node.type === "heading") score += 4;
  if (node.type === "pdf" || node.type === "diagram") score += 3;
  if (node.type === "image" || node.type === "media") score += 2;
  if (node.type === "transcript") score += 5;
  if (node.type === "concept") score += 6;
  return score;
}

export function rankMultimodalForTask(
  task: string,
  root?: string,
): {
  docs: Array<{ path: string; reason: string; score: number }>;
  assets: Array<{ path: string; type: string; reason: string; score: number }>;
  concepts: Array<{ name: string; reason: string; score: number }>;
} {
  const graph = loadGraph(root);
  if (!graph) return { docs: [], assets: [], concepts: [] };

  const terms = normalizeTerms(task);
  const docs: Array<{ path: string; reason: string; score: number }> = [];
  const assets: Array<{ path: string; type: string; reason: string; score: number }> = [];
  const concepts: Array<{ name: string; reason: string; score: number }> = [];

  for (const node of graph.nodes) {
    const score = scoreNode(node, terms);
    if (score < 8) continue;

    if ((node.type === "doc" || node.type === "heading" || node.type === "pdf") && node.path) {
      docs.push({
        path: node.path,
        reason:
          node.type === "pdf"
            ? "pdf metadata matches task terms"
            : node.type === "heading"
              ? `heading "${node.name}" matches task`
              : "doc content/path matches task terms",
        score,
      });
    } else if (["image", "diagram", "media", "transcript"].includes(node.type) && node.path) {
      assets.push({
        path: node.path,
        type: node.type,
        reason:
          node.type === "transcript"
            ? "transcript sidecar matches task terms"
            : `${node.type} filename/tags match task`,
        score,
      });
    } else if (node.type === "concept") {
      concepts.push({
        name: node.name,
        reason: "concept cluster matches task terms",
        score,
      });
    }
  }

  return {
    docs: docs.sort((a, b) => b.score - a.score).slice(0, 5),
    assets: assets.sort((a, b) => b.score - a.score).slice(0, 4),
    concepts: concepts.sort((a, b) => b.score - a.score).slice(0, 5),
  };
}
