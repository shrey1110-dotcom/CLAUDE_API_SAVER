export const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
]);

export const TREE_EXCLUDE_DIRS = new Set([...EXCLUDE_DIRS, ".cursor"]);

export const MAX_OUTPUT_BYTES = 30_720;

export const MAX_FILE_BYTES = 512 * 1024;

export const MAX_OUTLINE_FILE_BYTES = 256 * 1024;

export const MAX_SYMBOL_BLOCK_LINES = 40;

export const MAX_WALK_FILES = 5000;
