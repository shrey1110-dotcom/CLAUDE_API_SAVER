import fs from "node:fs";
import path from "node:path";
import {
  FRAMEWORK_HINTS,
  IMPORTANT_CONFIG_FILES,
  LANGUAGE_MARKERS,
  LOCKFILES,
} from "./constants.js";

export interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

