export interface ContextCapsule {
  topic: string;
  summary: string;
  files: string[];
  symbols: string[];
  commands: string[];
  tags: string[];
  updatedAt: string;
}

export interface ContextManifest {
  version: string;
  root: string;
  generatedAt: string;
  capsuleCount: number;
  topics: string[];
}

export interface ContextStatus {
  graphExists: boolean;
  capsulesExist: boolean;
  capsuleCount: number;
  lastBuildTime?: string;
  graphNodeCount: number;
  graphEdgeCount: number;
  suggestedCommands: string[];
}

export type ContextMode = "discovery" | "edit" | "test" | "debug" | "impact";

export interface ContextPackResult {
  task: string;
  mode: string;
  budgetTokens: number;
  summary: string;
  files: Array<{ path: string; reason: string; score: number }>;
  symbols: Array<{ name: string; kind?: string; path?: string; line?: number; reason: string }>;
  docs?: Array<{ path: string; reason: string; score: number }>;
  assets?: Array<{ path: string; type: string; reason: string; score: number }>;
  concepts?: Array<{ name: string; reason: string; score: number }>;
  commands?: { test?: string; lint?: string; dev?: string };
  nextSteps: string[];
  needsFullFileRead: boolean;
  truncated: boolean;
  estimatedOutputTokens?: number;
  generatedAt?: string;
}

export interface ImpactPackResult {
  changedFiles: string[];
  likelyDependents: string[];
  relatedTests: string[];
  relatedCommands: string[];
  riskLevel: "low" | "medium" | "high";
  nextSteps: string[];
  truncated: boolean;
}

export const CONTEXT_VERSION = "1.0.0";

export const CAPSULE_TOPICS = [
  "auth",
  "routing",
  "api",
  "database",
  "frontend",
  "tests",
  "config",
  "styling",
  "state",
  "build",
  "deployment",
] as const;
