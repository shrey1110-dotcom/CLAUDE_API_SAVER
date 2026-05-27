import fs from "node:fs";
import path from "node:path";
import { resolveRoot } from "../pathSafety.js";

export const GRAPH_DIR = ".repo-context-graph";
export const GRAPH_FILE = "graph.json";
export const MANIFEST_FILE = "manifest.json";
export const CAPSULES_FILE = "capsules.json";
export const CONTEXT_MANIFEST_FILE = "context-manifest.json";

export interface GraphCachePaths {
  root: string;
  graphDir: string;
  graphPath: string;
  manifestPath: string;
  capsulesPath: string;
  contextManifestPath: string;
}

export function getGraphCachePaths(root?: string): GraphCachePaths {
  const resolvedRoot = resolveRoot(root);
  const graphDir = path.join(resolvedRoot, GRAPH_DIR);
  return {
    root: resolvedRoot,
    graphDir,
    graphPath: path.join(graphDir, GRAPH_FILE),
    manifestPath: path.join(graphDir, MANIFEST_FILE),
    capsulesPath: path.join(graphDir, CAPSULES_FILE),
    contextManifestPath: path.join(graphDir, CONTEXT_MANIFEST_FILE),
  };
}

export function ensureGraphDir(root?: string): string {
  const { graphDir } = getGraphCachePaths(root);
  fs.mkdirSync(graphDir, { recursive: true });
  return graphDir;
}
