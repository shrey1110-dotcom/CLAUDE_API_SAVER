import fs from "node:fs";
import { getGraphCachePaths } from "../graph/paths.js";
import type { ContextCapsule, ContextManifest } from "./types.js";

export function loadCapsules(root?: string): ContextCapsule[] | null {
  const { capsulesPath } = getGraphCachePaths(root);
  try {
    if (!fs.existsSync(capsulesPath)) return null;
    return JSON.parse(fs.readFileSync(capsulesPath, "utf8")) as ContextCapsule[];
  } catch {
    return null;
  }
}

export function loadContextManifest(root?: string): ContextManifest | null {
  const { contextManifestPath } = getGraphCachePaths(root);
  try {
    if (!fs.existsSync(contextManifestPath)) return null;
    return JSON.parse(fs.readFileSync(contextManifestPath, "utf8")) as ContextManifest;
  } catch {
    return null;
  }
}

export function findCapsuleForTask(capsules: ContextCapsule[], task: string): ContextCapsule | null {
  const terms = task.toLowerCase().split(/\s+/).filter(Boolean);
  let best: ContextCapsule | null = null;
  let bestScore = 0;

  for (const capsule of capsules) {
    let score = 0;
    const haystack = [capsule.topic, capsule.summary, ...capsule.tags, ...capsule.files.join(" ")].join(" ").toLowerCase();
    for (const term of terms) {
      if (haystack.includes(term)) score += 2;
      if (capsule.topic === term) score += 5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = capsule;
    }
  }

  return bestScore > 0 ? best : null;
}
