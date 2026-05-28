import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CORE_SRC = path.resolve("src");

function readCoreSources(): string {
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "scripts") continue;
        walk(full);
      } else if (entry.name.endsWith(".ts")) {
        files.push(fs.readFileSync(full, "utf8"));
      }
    }
  }
  walk(CORE_SRC);
  return files.join("\n");
}

describe("client-agnostic packaging", () => {
  it("core code does not hardcode client-specific config paths", () => {
    const source = readCoreSources();
    expect(source).not.toContain("mcp-server.json");
  });

  it("README describes universal MCP usage", () => {
    const readme = fs.readFileSync(path.resolve("README.md"), "utf8");
    expect(readme).toMatch(/Universal MCP context broker/i);
    expect(readme).toMatch(/Codex|Claude/i);
  });

  it("client docs exist for major MCP clients", () => {
    const docs = [
      "docs/client-configs/codex.md",
      "docs/client-configs/claude-code.md",
      "docs/client-configs/claude-desktop.md",
      "docs/client-configs/generic-stdio.md",
    ];
    for (const doc of docs) {
      expect(fs.existsSync(path.resolve(doc))).toBe(true);
    }
  });

  it("agent instruction docs exist", () => {
    const docs = [
      "docs/agent-instructions/AGENTS.md",
      "docs/agent-instructions/CLAUDE.md",
      "docs/agent-instructions/GENERIC-MCP-CLIENT.md",
    ];
    for (const doc of docs) {
      expect(fs.existsSync(path.resolve(doc))).toBe(true);
    }
  });

  it("exposed tool count stays reasonably small", () => {
    const index = fs.readFileSync(path.resolve("src/index.ts"), "utf8");
    const toolCount = (index.match(/server\.tool\(/g) ?? []).length;
    expect(toolCount).toBeLessThanOrEqual(14);
    expect(toolCount).toBeGreaterThanOrEqual(10);
  });
});
