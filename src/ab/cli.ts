import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AbClient, AbMode } from "./types.js";

export const AB_CLIENTS: AbClient[] = ["cursor", "codex", "claude_code", "claude_desktop", "generic"];
export const AB_MODES: AbMode[] = ["no_mcp", "compact_search", "graph", "context_broker", "context_broker_locked"];

export type CliArgs = Record<string, string | boolean>;

export function parseCliArgs(argv = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const stripped = token.slice(2);
    if (stripped.includes("=")) {
      const [key, ...parts] = stripped.split("=");
      args[key] = parts.join("=");
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[stripped] = true;
      continue;
    }
    args[stripped] = next;
    i += 1;
  }
  return args;
}

export function readStringArg(args: CliArgs, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readNumberArg(args: CliArgs, key: string): number | undefined {
  const value = readStringArg(args, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readBooleanArg(args: CliArgs, key: string): boolean | undefined {
  const value = args[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
}

export function splitList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}

export function asClient(value: string | undefined): AbClient | undefined {
  if (!value) {
    return undefined;
  }
  return AB_CLIENTS.includes(value as AbClient) ? (value as AbClient) : undefined;
}

export function asMode(value: string | undefined): AbMode | undefined {
  if (!value) {
    return undefined;
  }
  return AB_MODES.includes(value as AbMode) ? (value as AbMode) : undefined;
}

export async function promptText(question: string): Promise<string | undefined> {
  if (!input.isTTY) {
    return undefined;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim();
    return answer.length > 0 ? answer : undefined;
  } finally {
    rl.close();
  }
}
