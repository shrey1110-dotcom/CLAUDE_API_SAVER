import { describe, expect, it } from "vitest";
import { resetConfigForTests } from "../src/config.js";
import { getConfig } from "../src/config.js";
import { capJsonOutputWithMeta } from "../src/output.js";
import { repoMap } from "../src/tools/repoMap.js";
import { searchCodeTool } from "../src/tools/searchCode.js";
import { getFileOutline } from "../src/tools/getFileOutline.js";
import { getSymbolContext } from "../src/tools/getSymbolContext.js";
import { fixturePath, outputMeta, runWithEnv } from "./helpers.js";

describe("edge cases", () => {
  it("repo_map does not embed README contents", () => {
    const result = repoMap(fixturePath("simple-node-app"));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Auth demo project");
  });

  it("repo_map returns script names only in compact mode", () => {
    runWithEnv({ MCP_OUTPUT_MODE: "compact" }, () => {
      const result = repoMap(fixturePath("simple-node-app"));
      expect(Array.isArray(result.scripts)).toBe(true);
      expect((result.scripts as string[]).includes("dev")).toBe(true);
    });
  });

  it("invalid env values fall back to safe defaults", () => {
    runWithEnv(
      {
        MCP_OUTPUT_MODE: "invalid",
        MCP_MAX_RESPONSE_CHARS: "abc",
        MCP_DEFAULT_SEARCH_RESULTS: "-5",
        MCP_TREE_DEPTH: "999",
      },
      () => {
        const config = getConfig();
        expect(config.outputMode).toBe("compact");
        expect(config.defaultSearchResults).toBe(8);
        expect(config.treeDepth).toBeLessThanOrEqual(6);
        expect(config.maxResponseChars).toBe(30_720);
      },
    );
  });

  it("search_code uses case-sensitive matching by default", () => {
    const lower = searchCodeTool("login", fixturePath("simple-node-app"), 5);
    const upper = searchCodeTool("LOGIN", fixturePath("simple-node-app"), 5);
    expect(lower.matchCount).toBeGreaterThan(0);
    expect(upper.matchCount).toBe(0);
  });

  it("search_code escapes invalid regex patterns safely", () => {
    expect(() => searchCodeTool("login(", fixturePath("simple-node-app"), 5)).not.toThrow();
    const result = searchCodeTool("loginUser", fixturePath("simple-node-app"), 5);
    expect(result.matchCount).toBeGreaterThan(0);
  });

  it("get_file_outline handles file with few symbols", () => {
    const outline = getFileOutline("src/utils.ts", fixturePath("simple-node-app"));
    expect(outline.topLevel.length).toBeGreaterThan(0);
  });

  it("get_symbol_context handles duplicate symbols across files", () => {
    const result = getSymbolContext("login", fixturePath("edge-symbols-project"), 10);
    const files = new Set(result.matches.map((m) => m.filePath));
    expect(files.size).toBeGreaterThanOrEqual(1);
  });

  it("normal and detailed modes still respect caps", () => {
    for (const mode of ["normal", "detailed"] as const) {
      runWithEnv({ MCP_OUTPUT_MODE: mode, MCP_MAX_RESPONSE_CHARS: "1500" }, () => {
        const meta = outputMeta(repoMap(fixturePath("monorepo-app")));
        expect(meta.chars).toBeLessThanOrEqual(1500);
      });
    }
  });

  it("capJsonOutputWithMeta sets truncated flag", () => {
    process.env.MCP_MAX_RESPONSE_CHARS = "200";
    resetConfigForTests();
    const capped = capJsonOutputWithMeta({ data: "x".repeat(500) });
    expect(capped.truncated).toBe(true);
    delete process.env.MCP_MAX_RESPONSE_CHARS;
    resetConfigForTests();
  });
});
