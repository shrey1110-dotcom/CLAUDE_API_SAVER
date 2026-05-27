import { getGraphNeighbors, getGraphPaths, getGraphStatus, getGraphSymbol, queryGraph } from "../graph/queryGraph.js";

export function graphStatus(root?: string) {
  const status = getGraphStatus(root);
  return {
    exists: status.exists,
    nodeCount: status.nodeCount,
    edgeCount: status.edgeCount,
    fileCount: status.fileCount,
    symbolCount: status.symbolCount,
    generatedAt: status.generatedAt,
    root: status.root,
    stale: status.stale ?? false,
    suggestedCommand: status.suggestedCommand,
  };
}

export function graphQuery(
  query: string,
  root?: string,
  maxResults?: number,
  budgetTokens?: number,
) {
  return queryGraph(query, { root, maxResults, budgetTokens });
}

export function graphNeighbors(input: {
  nodeId?: string;
  path?: string;
  symbol?: string;
  depth?: number;
  maxResults?: number;
  root?: string;
  budgetTokens?: number;
}) {
  return getGraphNeighbors(input);
}

export function graphSymbol(symbol: string, root?: string, maxResults?: number, budgetTokens?: number) {
  return getGraphSymbol({ symbol, root, maxResults, budgetTokens });
}

export function graphPaths(from: string, to: string, root?: string, maxDepth?: number, budgetTokens?: number) {
  return getGraphPaths({ from, to, root, maxDepth, budgetTokens });
}
