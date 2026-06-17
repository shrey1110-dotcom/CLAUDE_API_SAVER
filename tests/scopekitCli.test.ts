import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RENAME_NOTICE,
  formatHelp,
  invokedBinary,
  printRenameNoticeIfLegacy,
} from "../src/cli/branding.js";
import {
  SCOPEKIT_MARK_BEGIN,
  SCOPEKIT_MARK_END,
  installAssistant,
  installClaudeInstructions,
  installCodexAgents,
  installCursorRule,
  installMcpSnippet,
} from "../src/cli/install.js";
import { runSetup } from "../src/cli/setup.js";
import { isCliInvocation } from "../src/cli/router.js";

describe("ScopeKit branding", () => {
  it("detects invoked binary names", () => {
    expect(invokedBinary(["node", "/usr/local/bin/scopekit", "help"])).toBe("scopekit");
    expect(invokedBinary(["node", "/usr/local/bin/repo-context", "help"])).toBe("repo-context");
    expect(invokedBinary(["node", "/usr/local/bin/repo-context-mcp"])).toBe("repo-context-mcp");
  });

  it("includes rename notice for legacy binaries in help", () => {
    const help = formatHelp("repo-context");
    expect(help).toContain("ScopeKit");
    expect(help).toContain(RENAME_NOTICE);
  });

  it("prints rename notice only for legacy binaries", () => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (msg: string) => lines.push(msg);
    try {
      printRenameNoticeIfLegacy("repo-context");
      printRenameNoticeIfLegacy("scopekit");
    } finally {
      console.error = original;
    }
    expect(lines).toEqual([RENAME_NOTICE]);
  });
});

describe("ScopeKit setup/install", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scopekit-setup-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("setup dry-run reports files without writing", () => {
    const root = tempRepo();
    const { results } = runSetup({
      root,
      dryRun: true,
      yes: true,
      cursor: true,
      claude: true,
      codex: true,
      mcp: false,
    });
    expect(results.every((r) => r.action === "dry-run")).toBe(true);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".cursor/rules/scopekit.mdc"))).toBe(false);
  });

  it("merges Claude instructions into CLAUDE.md", () => {
    const root = tempRepo();
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Existing\n\nKeep this.\n", "utf8");
    const result = installClaudeInstructions({ root, dryRun: false });
    const content = fs.readFileSync(result.path, "utf8");
    expect(content).toContain("Keep this.");
    expect(content).toContain(SCOPEKIT_MARK_BEGIN);
    expect(content).toContain("scopekit pack");
    const second = installClaudeInstructions({ root, dryRun: false });
    expect(second.action).toBe("updated");
    expect(fs.readFileSync(second.path, "utf8").split(SCOPEKIT_MARK_BEGIN).length).toBe(2);
  });

  it("merges Codex instructions into AGENTS.md", () => {
    const root = tempRepo();
    installCodexAgents({ root, dryRun: false });
    const content = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(content).toContain(SCOPEKIT_MARK_BEGIN);
    expect(content).toContain("--profile ultra");
  });

  it("creates Cursor scopekit rule", () => {
    const root = tempRepo();
    const result = installCursorRule({ root, dryRun: false });
    const content = fs.readFileSync(result.path, "utf8");
    expect(result.relativePath).toBe(".cursor/rules/scopekit.mdc");
    expect(content).toContain("alwaysApply: false");
    expect(content).toContain(SCOPEKIT_MARK_END);
  });

  it("writes MCP config snippet without secrets", () => {
    const root = tempRepo();
    installMcpSnippet({ root, dryRun: false });
    const json = JSON.parse(fs.readFileSync(path.join(root, ".scopekit/mcp-config.example.json"), "utf8"));
    expect(json.mcpServers.scopekit.command).toBe("scopekit");
    expect(json.mcpServers.scopekit.args).toEqual(["mcp"]);
    expect(JSON.stringify(json)).not.toMatch(/api[_-]?key|secret|token/i);
  });

  it("install commands target correct files", () => {
    const root = tempRepo();
    for (const target of ["cursor", "claude", "codex", "mcp"] as const) {
      const results = installAssistant(target, { root, dryRun: false });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.action).not.toBe("skipped");
    }
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".scopekit/mcp-config.example.json"))).toBe(true);
  });

  it("setup writes local docs folder", () => {
    const root = tempRepo();
    runSetup({ root, dryRun: false, yes: true, cursor: true, claude: false, codex: false, mcp: false });
    expect(fs.existsSync(path.join(root, ".scopekit/README.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".scopekit/examples.md"))).toBe(true);
  });
});

describe("ScopeKit CLI routing", () => {
  it("recognizes setup command", () => {
    expect(isCliInvocation(["node", "dist/index.js", "setup"])).toBe(true);
    expect(isCliInvocation(["node", "dist/index.js", "--help"])).toBe(true);
    expect(isCliInvocation(["node", "dist/index.js"])).toBe(true);
  });
});
