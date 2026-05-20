import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config.js";
import { capJsonOutputWithMeta } from "../src/output.js";
import { repoMap } from "../src/tools/repoMap.js";
import { searchCodeTool } from "../src/tools/searchCode.js";
import { getSymbolContext } from "../src/tools/getSymbolContext.js";
import { fixturePath, outputMeta, runWithEnv } from "./helpers.js";

describe("output budgets", () => {
  const root = fixturePath("simple-node-app");

  it("defaults to compact mode", () => {
    runWithEnv({ MCP_OUTPUT_MODE: undefined }, () => {
      expect(getConfig().outputMode).toBe("compact");
    });
  });

  it("compact mode produces smaller output than detailed", () => {
    let compactSize = 0;
    let detailedSize = 0;
    runWithEnv({ MCP_OUTPUT_MODE: "compact" }, () => {
      compactSize = outputMeta(repoMap(root)).chars;
    });
    runWithEnv({ MCP_OUTPUT_MODE: "detailed", MCP_TREE_DEPTH: "3" }, () => {
      detailedSize = outputMeta(repoMap(root)).chars;
    });
    expect(compactSize).toBeLessThanOrEqual(detailedSize);
  });

  it("honors MCP_MAX_RESPONSE_CHARS for all tools", () => {
    runWithEnv({ MCP_MAX_RESPONSE_CHARS: "12000" }, () => {
      const outputs = [
        repoMap(root),
        searchCodeTool("login", root, 8),
        getSymbolContext("loginUser", root, 2),
      ];
      for (const output of outputs) {
        expect(outputMeta(output).chars).toBeLessThanOrEqual(12_000);
      }
    });
  });

  it("honors MCP_DEFAULT_SEARCH_RESULTS and MCP_SYMBOL_CONTEXT_LINES", () => {
    runWithEnv({ MCP_DEFAULT_SEARCH_RESULTS: "3", MCP_SYMBOL_CONTEXT_LINES: "12" }, () => {
      expect(getConfig().defaultSearchResults).toBe(3);
      expect(getConfig().symbolContextLines).toBe(12);
      const search = searchCodeTool("export", root);
      expect(search.maxResults).toBe(3);
    });
  });

  it("never exceeds configured cap in capJsonOutputWithMeta", () => {
    runWithEnv({ MCP_MAX_RESPONSE_CHARS: "5000" }, () => {
      const capped = capJsonOutputWithMeta({ items: Array.from({ length: 200 }, (_, i) => ({ id: i, text: "x".repeat(80) })) });
      expect(Buffer.byteLength(capped.text, "utf8")).toBeLessThanOrEqual(5000);
    });
  });
});
