import fs from "node:fs";
import path from "node:path";

export function resolveRoot(root?: string): string {
  const resolved = path.resolve(root ?? process.cwd());
  if (!fs.existsSync(resolved)) {
    throw new Error(`Root directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Root path is not a directory: ${resolved}`);
  }
  return resolved;
}
