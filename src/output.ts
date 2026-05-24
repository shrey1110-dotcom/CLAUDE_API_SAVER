import { MAX_OUTPUT_BYTES } from "./constants.js";

const TRUNCATION_NOTICE = "[truncated: output exceeded 30KB cap]";

export function formatToolResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  const text = capJsonOutput(data);
  return {
    content: [{ type: "text", text }],
  };
}

export function capJsonOutput(data: unknown): string {
  let working = structuredClone(data) as unknown;
  let text = JSON.stringify(working, null, 2);

  if (Buffer.byteLength(text, "utf8") <= MAX_OUTPUT_BYTES) {
    return text;
  }

  working = trimPayload(working);
  text = JSON.stringify({ ...(working as object), _truncated: true, _notice: TRUNCATION_NOTICE }, null, 2);

  if (Buffer.byteLength(text, "utf8") <= MAX_OUTPUT_BYTES) {
    return text;
  }

  text = JSON.stringify({ _notice: TRUNCATION_NOTICE, preview: summarizePayload(working) }, null, 2);
  if (Buffer.byteLength(text, "utf8") > MAX_OUTPUT_BYTES) {
    return JSON.stringify({ _notice: TRUNCATION_NOTICE }, null, 2);
  }
  return text;
}
