import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { EXCLUDE_DIRS, MAX_FILE_BYTES, MAX_WALK_FILES } from "./constants.js";
import { resolveSafePath, toRelativePath } from "./pathSafety.js";

export interface SearchMatch {
  filePath: string;
  lineNumber: number;
  line: string;
  context: string[];
}

export interface RipgrepOptions {
  root: string;
  query: string;
  maxResults: number;
  filePath?: string;
}

export function isRipgrepAvailable(): boolean {
  const result = spawnSync("rg", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}
