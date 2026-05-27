import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getConfig, resetConfigForTests } from "../src/config.js";
import { repoMap } from "../src/tools/repoMap.js";
import { searchCodeTool } from "../src/tools/searchCode.js";
import { getFileOutline } from "../src/tools/getFileOutline.js";
import { getSymbolContext } from "../src/tools/getSymbolContext.js";
import { getProjectCommands } from "../src/tools/getProjectCommands.js";
import { fixturePath, outputMeta, runWithEnv } from "./helpers.js";

describe("repo_map", () => {
  it("detects npm and TypeScript in simple-node-app", () => {
    const result = repoMap(fixturePath("simple-node-app"));
    expect(result.packageManager).toBe("npm");
    expect(result.languages).toContain("javascript/typescript");
    expect(result.configFiles).toContain("package.json");
    expect(result.scripts).toContain("dev");
    const treeJson = JSON.stringify(result.tree);
    expect(treeJson).not.toContain("node_modules");
    expect(treeJson).toContain("auth");
  });

  it("handles monorepo nested packages", () => {
    const result = repoMap(fixturePath("monorepo-app"));
    const treeJson = JSON.stringify(result.tree);
    expect(treeJson).toContain("packages");
    expect(treeJson).toContain("apps");
  });

  it("excludes noisy directories", () => {
    const result = repoMap(fixturePath("noisy-large-repo"));
    const treeJson = JSON.stringify(result.tree);
    expect(treeJson).not.toContain("node_modules");
    expect(treeJson).not.toContain(".git");
    expect(treeJson).not.toContain("dist");
    expect(treeJson).toContain("real-file.ts");
  });

  it("detects python project markers", () => {
    const result = repoMap(fixturePath("non-node-project"));
    expect(result.languages).toContain("python");
    expect(result.configFiles).toContain("pyproject.toml");
    expect(result.configFiles).toContain("Makefile");
  });

  it("handles empty repo gracefully", () => {
    const result = repoMap(fixturePath("empty-repo"));
    expect(result.packageManager).toBeNull();
    expect(result.tree).toEqual([]);
  });

  it("respects output cap", () => {
    process.env.MCP_MAX_RESPONSE_CHARS = "1200";
    resetConfigForTests();
    const meta = outputMeta(repoMap(fixturePath("simple-node-app")));
    expect(meta.chars).toBeLessThanOrEqual(1200);
    delete process.env.MCP_MAX_RESPONSE_CHARS;
    resetConfigForTests();
  });
});

describe("search_code", () => {
  const root = fixturePath("simple-node-app");

  it("finds login/session terms", () => {
    const result = searchCodeTool("login", root, 10);
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matches.some((m) => m.filePath.includes("login"))).toBe(true);
  });

  it("returns compact context", () => {
    const result = searchCodeTool("session", root, 3);
    for (const match of result.matches) {
      if (match.context) {
        expect(match.context.length).toBeLessThanOrEqual(3);
      }
      expect(match.line).not.toMatch(/\n/);
    }
    expect(result.resultTruncated).toBeDefined();
  });

  it("respects default max results from config", () => {
    process.env.MCP_DEFAULT_SEARCH_RESULTS = "2";
    resetConfigForTests();
    const result = searchCodeTool("login", root);
    expect(result.matchCount).toBeLessThanOrEqual(2);
    delete process.env.MCP_DEFAULT_SEARCH_RESULTS;
    resetConfigForTests();
  });

  it("excludes lock files in noisy repo", () => {
    const result = searchCodeTool("noise", fixturePath("noisy-large-repo"), 20);
    expect(result.matches.every((m) => !m.filePath.endsWith("package-lock.json"))).toBe(true);
  });

  it("handles no matches gracefully", () => {
    const result = searchCodeTool("zzzz-not-found-token", root, 5);
    expect(result.matchCount).toBe(0);
  });

  it("handles regex-special characters safely", () => {
    expect(() => searchCodeTool("login(", root, 3)).not.toThrow();
  });

  it("marks truncated when capped", () => {
    const result = searchCodeTool("export", root, 1);
    expect(result.truncated).toBe(true);
  });
});

describe("get_file_outline", () => {
  it("extracts compact imports and symbols", () => {
    const outline = getFileOutline("src/auth/login.ts", fixturePath("simple-node-app"));
    expect(outline.topLevel.some((item) => (typeof item === "string" ? item : item.name) === "loginUser")).toBe(true);
    expect(outline.symbolsTotal).toBeGreaterThan(0);
    expect(JSON.stringify(outline)).not.toContain("password");
  });

  it("handles edge symbol file types", () => {
    const outline = getFileOutline("src/symbols.ts", fixturePath("edge-symbols-project"));
    const names = [...outline.exports, ...outline.topLevel].map((item) =>
      typeof item === "string" ? item : item.name,
    );
    expect(names.some((n) => n.includes("LoginService") || n === "LoginService")).toBe(true);
  });

  it("respects output cap", () => {
    runWithEnv({ MCP_MAX_RESPONSE_CHARS: "800" }, () => {
      const meta = outputMeta(getFileOutline("src/symbols.ts", fixturePath("edge-symbols-project")));
      expect(meta.chars).toBeLessThanOrEqual(800);
      expect(meta.truncated).toBe(true);
    });
  });
});

describe("get_symbol_context", () => {
  it("finds loginUser without matching login substring only", () => {
    const result = getSymbolContext("loginUser", fixturePath("edge-symbols-project"), 5);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((m) => m.block.join("\n").includes("loginUser"))).toBe(true);
  });

  it("returns line ranges and truncates huge bodies", () => {
    runWithEnv({ MCP_SYMBOL_CONTEXT_LINES: "8" }, () => {
      const result = getSymbolContext("huge", fixturePath("edge-symbols-project"), 1);
      expect(result.matches[0]?.startLine).toBeGreaterThan(0);
      expect(result.matches[0]?.truncated || result.matches[0]?.block.some((l) => l.includes("[truncated"))).toBeTruthy();
    });
  });

  it("handles no match gracefully", () => {
    const result = getSymbolContext("DoesNotExistSymbol", fixturePath("simple-node-app"), 3);
    expect(result.matches).toEqual([]);
  });
});

describe("get_project_commands", () => {
  it("detects npm scripts in node app", () => {
    const result = getProjectCommands(fixturePath("simple-node-app"));
    expect(result.scripts).toContain("dev");
    expect(result.likelyDev).toBe("dev");
  });

  it("detects makefile and pyproject commands", () => {
    runWithEnv({ MCP_OUTPUT_MODE: "normal" }, () => {
      const result = getProjectCommands(fixturePath("non-node-project"));
      expect(result.sources).toContain("pyproject.toml");
      expect(result.sources).toContain("Makefile");
      expect(result.likelyTest).toBeTruthy();
    });
  });
});
