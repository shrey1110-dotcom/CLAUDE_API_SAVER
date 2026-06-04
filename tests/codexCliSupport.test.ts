import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLockedProofCommands,
  lockedRepeatCommand,
  printCodexNotFoundHints,
  probeCodexBin,
} from "../src/ab/adapters/codexCliSupport.js";

describe("codexCliSupport", () => {
  it("printCodexNotFoundHints includes actionable guidance", () => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      printCodexNotFoundHints("codex");
    } finally {
      console.error = original;
    }
    const output = lines.join("\n");
    expect(output).toContain("Codex CLI was not found.");
    expect(output).toContain("Run: which codex");
    expect(output).toContain("--codex-bin /absolute/path/to/codex");
  });

  it("probeCodexBin fails cleanly for missing absolute path", () => {
    const missing = path.join("/tmp", "repo-context-mcp-missing-codex-binary");
    const probe = probeCodexBin(missing);
    expect(probe.found).toBe(false);
    expect(probe.error).toContain("does not exist");
  });

  it("buildLockedProofCommands includes ingest and real-check", () => {
    const commands = buildLockedProofCommands("/repo");
    expect(commands[0]).toBe("cd /repo");
    expect(commands).toContain("npm run ab:ingest-codex");
    expect(commands).toContain("npm run ab:real-check");
    expect(lockedRepeatCommand("/repo")).toContain("context_broker_locked");
  });
});
