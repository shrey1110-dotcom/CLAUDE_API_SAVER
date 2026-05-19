import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { truncateTelemetryValue } from "../src/telemetry/logger.js";
import { readTelemetryEntries } from "../src/telemetry/reader.js";
import { analyzeTelemetry } from "../src/telemetry/analyze.js";
import { getFileOutline } from "../src/tools/getFileOutline.js";
import { searchCodeTool } from "../src/tools/searchCode.js";
import { resolveSafePath } from "../src/pathSafety.js";
import { fixturePath } from "./helpers.js";

describe("security", () => {
  const root = fixturePath("simple-node-app");

  it("rejects parent path traversal", () => {
    expect(() => getFileOutline("../../etc/passwd", root)).toThrow(/escapes project root/i);
  });

  it("rejects absolute paths outside root", () => {
    expect(() => resolveSafePath(root, "/etc/passwd")).toThrow(/escapes project root/i);
  });

  it("rejects symlinks pointing outside root", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-sec-"));
    const outsideFile = path.join(tempDir, "outside.txt");
    fs.writeFileSync(outsideFile, "secret");
    const linkPath = path.join(root, "escape-link");
    try {
      fs.symlinkSync(outsideFile, linkPath);
      expect(() => getFileOutline("escape-link", root)).toThrow(/symlink|escapes project root/i);
    } finally {
      try {
        fs.unlinkSync(linkPath);
      } catch {
        /* ignore */
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects huge files for outline", () => {
    const bigFile = path.join(root, "big.txt");
    fs.writeFileSync(bigFile, "a".repeat(300_000));
    try {
      expect(() => getFileOutline("big.txt", root)).toThrow(/too large/i);
    } finally {
      fs.unlinkSync(bigFile);
    }
  });

  it("skips binary files in node search fallback", () => {
    const binPath = path.join(root, "data.bin");
    fs.writeFileSync(binPath, Buffer.from([0, 1, 2, 0, 4]));
    try {
      const result = searchCodeTool("\0", root, 5);
      expect(result.matches.every((m) => m.filePath !== "data.bin")).toBe(true);
    } finally {
      fs.unlinkSync(binPath);
    }
  });

  it("truncates telemetry args", () => {
    const truncated = truncateTelemetryValue({ query: "x".repeat(1000) }) as { query: string };
    expect(truncated.query.length).toBeLessThan(600);
    expect(truncated.query).toContain("[truncated]");
  });

  it("skips malformed telemetry lines", () => {
    const tempLog = path.join(os.tmpdir(), `mcp-malformed-${Date.now()}.jsonl`);
    fs.writeFileSync(tempLog, '{"tool":"x"}\nnot-json\n{"timestamp":"t","tool":"y","args":{},"durationMs":1,"outputChars":1,"estimatedOutputTokens":1,"success":true}\n');
    const entries = readTelemetryEntries(tempLog);
    expect(entries.length).toBe(1);
    expect(() => analyzeTelemetry(entries)).not.toThrow();
    fs.unlinkSync(tempLog);
  });
});
