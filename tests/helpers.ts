import path from "node:path";
import { fileURLToPath } from "node:url";
import { resetConfigForTests } from "../src/config.js";
import { capJsonOutputWithMeta, formatToolResult } from "../src/output.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_ROOT = path.join(TEST_DIR, "fixtures");

export function fixturePath(name: string): string {
  return path.join(FIXTURES_ROOT, name);
}

export function runWithEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetConfigForTests();
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetConfigForTests();
  }
}

export function outputMeta(data: unknown): { chars: number; truncated: boolean; text: string } {
  const formatted = formatToolResult(data);
  const text = formatted.content[0]?.text ?? "";
  const capped = capJsonOutputWithMeta(data);
  return {
    chars: text.length,
    truncated: capped.truncated || text.includes("_truncated"),
    text,
  };
}

export function parseToolJson<T>(data: unknown): T {
  const { text } = outputMeta(data);
  return JSON.parse(text) as T;
}
