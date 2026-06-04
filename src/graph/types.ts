export type GraphNodeType =
  | "file"
  | "directory"
  | "symbol"
  | "function"
  | "class"
  | "interface"
  | "type"
  | "constant"
  | "route"
  | "config"
  | "command"
  | "test"
  | "concept"
  | "doc"
  | "heading"
  | "pdf"
  | "image"
  | "diagram"
  | "media"
  | "transcript"
  | "asset";

export type GraphEdgeType =
  | "contains"
  | "imports"
  | "exports"
  | "references"
  | "calls"
  | "tests"
  | "configures"
  | "related_to"
  | "mentions"
  | "explains"
  | "documents"
  | "derived_from"
  | "transcript_of";

export type ExtractionStatus =
  | "extracted"
  | "metadata_only"
  | "unsupported_without_optional_dependency"
  | "transcript_sidecar";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  path?: string;
  line?: number;
  language?: string;
  summary?: string;
  tags?: string[];
  sizeBytes?: number;
  hash?: string;
  mimeType?: string;
  extension?: string;
  extractionStatus?: ExtractionStatus | string;
  sourceType?: string;
  title?: string;
  headings?: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
  weight?: number;
}

export interface RepoGraph {
  version: string;
  root: string;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphManifest {
  version: string;
  root: string;
  generatedAt: string;
  fileCount: number;
  symbolCount: number;
  nodeCount: number;
  edgeCount: number;
  files: Array<{
    path: string;
    hash: string;
    mtimeMs?: number;
    sizeBytes?: number;
  }>;
}

export interface GraphStatus {
  exists: boolean;
  root: string;
  generatedAt?: string;
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  symbolCount: number;
  stale?: boolean;
  suggestedCommand?: string;
}

export interface GraphQueryResult {
  query: string;
  results: Array<{
    id: string;
    type: string;
    name: string;
    path?: string;
    line?: number;
    summary?: string;
    tags?: string[];
    score: number;
    reason: string;
    related?: Array<{
      id: string;
      type: string;
      name: string;
      path?: string;
      line?: number;
    }>;
  }>;
  truncated: boolean;
}

export interface GraphNeighborResult {
  nodeId: string;
  depth: number;
  neighbors: Array<{
    id: string;
    type: string;
    name: string;
    path?: string;
    line?: number;
    edgeType: string;
    direction: "in" | "out";
  }>;
  truncated: boolean;
}

export interface GraphSymbolResult {
  symbol: string;
  matches: Array<{
    id: string;
    name: string;
    type: string;
    path?: string;
    line?: number;
    summary?: string;
    neighbors?: Array<{ id: string; type: string; name: string; path?: string; line?: number }>;
    relatedTests?: string[];
    relatedConfigs?: string[];
  }>;
  truncated: boolean;
}

export interface GraphPathResult {
  from: string;
  to: string;
  paths: Array<{
    nodes: Array<{ id: string; name: string; type: string; path?: string }>;
    length: number;
  }>;
  truncated: boolean;
}

export const GRAPH_VERSION = "1.0.0";
