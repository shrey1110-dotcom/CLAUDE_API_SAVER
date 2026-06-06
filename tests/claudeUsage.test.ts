import { describe, expect, it } from "vitest";
import {
  dedupeStreamingUsageEntries,
  estimateUsageFromTextLength,
  mergeClaudeUsageWithTotal,
  parseClaudeUsageFromOutput,
} from "../src/ab/adapters/claudeUsage.js";

describe("claude usage parser", () => {
  it("parses flat usage fields", () => {
    const usage = parseClaudeUsageFromOutput(
      '{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":10,"cache_read_input_tokens":20}',
      "",
    );
    expect(usage?.clientInputTokens).toBe(100);
    expect(usage?.clientOutputTokens).toBe(50);
    expect(usage?.clientCacheWriteTokens).toBe(10);
    expect(usage?.clientCacheReadTokens).toBe(20);
    expect(mergeClaudeUsageWithTotal(usage!).clientTotalTokens).toBe(180);
  });

  it("parses nested usage fields", () => {
    const usage = parseClaudeUsageFromOutput('{"usage":{"input_tokens":100,"output_tokens":50}}', "");
    expect(usage?.clientInputTokens).toBe(100);
    expect(usage?.clientOutputTokens).toBe(50);
  });

  it("parses message nested usage", () => {
    const usage = parseClaudeUsageFromOutput('{"message":{"usage":{"input_tokens":90,"output_tokens":40}}}', "");
    expect(usage?.clientInputTokens).toBe(90);
    expect(usage?.clientOutputTokens).toBe(40);
  });

  it("parses result nested usage", () => {
    const usage = parseClaudeUsageFromOutput('{"result":{"usage":{"input_tokens":70,"output_tokens":30}}}', "");
    expect(usage?.clientInputTokens).toBe(70);
    expect(usage?.clientOutputTokens).toBe(30);
  });

  it("parses camelCase fields", () => {
    const usage = parseClaudeUsageFromOutput(
      '{"inputTokens":11,"outputTokens":22,"cacheCreationInputTokens":3,"cacheReadInputTokens":4,"totalTokens":40}',
      "",
    );
    expect(usage?.clientInputTokens).toBe(11);
    expect(usage?.clientOutputTokens).toBe(22);
    expect(usage?.clientCacheWriteTokens).toBe(3);
    expect(usage?.clientCacheReadTokens).toBe(4);
    expect(usage?.clientTotalTokens).toBe(40);
  });

  it("parses optional cost fields without treating cost as proof", () => {
    const usage = parseClaudeUsageFromOutput('{"usage":{"input_tokens":10,"output_tokens":5,"costUSD":0.02}}', "");
    expect(usage?.costUsd).toBe(0.02);
    expect(usage?.clientInputTokens).toBe(10);
  });

  it("returns null when usage is absent", () => {
    expect(parseClaudeUsageFromOutput("plain text answer", "")).toBeNull();
  });

  it("does not infer usage from transcript length", () => {
    const longText = "x".repeat(50_000);
    expect(estimateUsageFromTextLength(longText)).toBeNull();
    expect(parseClaudeUsageFromOutput(longText, "")).toBeNull();
  });

  it("dedupes repeated streaming chunks when message IDs are present", () => {
    const jsonl = [
      '{"id":"msg-1","usage":{"input_tokens":100,"output_tokens":10}}',
      '{"id":"msg-1","usage":{"input_tokens":100,"output_tokens":10}}',
      '{"id":"msg-2","usage":{"input_tokens":5,"output_tokens":2}}',
    ].join("\n");
    const usage = parseClaudeUsageFromOutput(jsonl, "");
    expect(usage?.clientInputTokens).toBe(5);
    expect(usage?.clientOutputTokens).toBe(2);

    const entries = dedupeStreamingUsageEntries([
      { messageId: "msg-1", usage: { clientInputTokens: 100, clientOutputTokens: 10 } },
      { messageId: "msg-1", usage: { clientInputTokens: 100, clientOutputTokens: 10 } },
      { messageId: "msg-2", usage: { clientInputTokens: 5, clientOutputTokens: 2 } },
    ]);
    expect(entries).toHaveLength(2);
  });
});
