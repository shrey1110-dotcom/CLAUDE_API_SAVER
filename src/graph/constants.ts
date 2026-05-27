export const GRAPH_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".mcp-telemetry",
  ".repo-context-graph",
  ".turbo",
  ".cache",
  "vendor",
  "target",
]);

export const GRAPH_SKIP_FILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
]);

export const GRAPH_SKIP_SUFFIXES = [".min.js", ".min.css", ".map", ".lock"];

export const GRAPH_CONFIG_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "pyproject.toml",
  "Makefile",
  "Dockerfile",
  ".env.example",
]);

export const SYMBOL_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
]);

export const MAX_GRAPH_FILES = 8000;
