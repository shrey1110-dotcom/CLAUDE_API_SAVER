import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES, toolsForProfile } from "../src/toolProfiles.js";

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
    expect(source).not.toContain(".cursor/mcp.json");
  });

  it("README describes ScopeKit skill-first positioning", () => {
    const readme = fs.readFileSync(path.resolve("README.md"), "utf8");
    expect(readme).toMatch(/ScopeKit/i);
    expect(readme).toMatch(/task-complete context packs/i);
    expect(readme).toMatch(/CLI\/skill workflow by default/i);
    expect(readme).toMatch(/Cursor|Codex|Claude/i);
    expect(readme).toMatch(/npm install -g scopekit/i);
    expect(readme).not.toMatch(/Graphify-inspired/i);
  });

  it("client docs exist for major MCP clients", () => {
    const docs = [
      "docs/client-configs/cursor.md",
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

  it("MCP_TOOL_PROFILE=codex_locked exposes only context_status and context_pack", () => {
    expect(toolsForProfile("codex_locked")).toEqual(["context_status", "context_pack"]);
  });

  it("MCP_TOOL_PROFILE=context_only exposes context broker tools", () => {
    expect(toolsForProfile("context_only")).toEqual(["context_status", "context_pack", "impact_pack"]);
  });

  it("full profile still exposes all tools", () => {
    expect(toolsForProfile("full")).toEqual(MCP_TOOL_NAMES);
  });

  it("tool descriptions enforce context-pack-first routing", () => {
    const index = fs.readFileSync(path.resolve("src/index.ts"), "utf8");
    expect(index).toContain("PRIMARY TOOL");
    expect(index).toContain("LAST-RESORT FALLBACK");
    expect(index).toContain("FALLBACK ONLY");
  });

  it("docs include fallback-dominance routing warning", () => {
    const docs = [
      "docs/ab-testing.md",
      "docs/multi-client-ab-tests.md",
      "docs/agent-instructions/AGENTS.md",
    ];
    for (const doc of docs) {
      const text = fs.readFileSync(path.resolve(doc), "utf8").toLowerCase();
      expect(text).toContain("repo_map");
      expect(text).toContain("search_code");
      expect(text).toContain("telemetry");
    }
  });
});
