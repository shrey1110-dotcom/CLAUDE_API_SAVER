import type { GraphEdge, GraphNode } from "../graph/types.js";

export type IngestSourceType =
  | "text"
  | "markdown"
  | "pdf"
  | "image"
  | "diagram"
  | "media"
  | "transcript"
  | "asset";

export type ExtractionStatus =
  | "extracted"
  | "metadata_only"
  | "unsupported_without_optional_dependency"
  | "transcript_sidecar";

export interface IngestAssetInput {
  root: string;
  relativePath: string;
  sizeBytes: number;
}

export interface IngestAssetResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface MultimodalBuildStats {
  docCount: number;
  headingCount: number;
  pdfCount: number;
  imageCount: number;
  mediaCount: number;
  transcriptCount: number;
  conceptCount: number;
  edgeCount: number;
}

export const MAX_SNIPPET_CHARS = 240;
export const MAX_HEADINGS = 12;
export const MAX_TAGS = 8;
