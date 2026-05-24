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

function trimPayload(data: unknown): unknown {
  if (Array.isArray(data)) {
    let trimmed = data.slice(0, Math.max(1, Math.floor(data.length / 2)));
    while (trimmed.length > 1 && Buffer.byteLength(JSON.stringify(trimmed), "utf8") > MAX_OUTPUT_BYTES) {
      trimmed = trimmed.slice(0, Math.max(1, Math.floor(trimmed.length / 2)));
    }
    return trimmed;
  }

  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        result[key] = value.slice(0, Math.min(value.length, 10));
      } else if (value && typeof value === "object") {
        result[key] = trimPayload(value);
      } else if (typeof value === "string" && value.length > 500) {
        result[key] = `${value.slice(0, 500)}...`;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  if (typeof data === "string" && data.length > 1000) {
    return `${data.slice(0, 1000)}...`;
  }

  return data;
}

function summarizePayload(data: unknown): unknown {
  if (Array.isArray(data)) {
    return { type: "array", length: data.length, sample: data.slice(0, 3) };
  }
  if (data && typeof data === "object") {
    return { type: "object", keys: Object.keys(data).slice(0, 20) };
  }
  return data;
}

export function toolError(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}
