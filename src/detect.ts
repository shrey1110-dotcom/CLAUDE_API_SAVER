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

export function detectPackageManager(root: string): string | null {
  for (const [file, manager] of Object.entries(LOCKFILES)) {
    if (fs.existsSync(path.join(root, file))) {
      return manager;
    }
  }
  if (fs.existsSync(path.join(root, "package.json"))) {
    return "npm";
  }
  return null;
}

export function detectLanguages(root: string): string[] {
  const languages = new Set<string>();
  for (const [marker, language] of Object.entries(LANGUAGE_MARKERS)) {
    if (fs.existsSync(path.join(root, marker))) {
      languages.add(language);
    }
  }
  return [...languages];
}

