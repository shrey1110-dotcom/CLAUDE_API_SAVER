import { getMaxResponseChars } from "./config.js";

const TRUNCATION_NOTICE = "[truncated: output exceeded response cap]";

export interface CappedOutput {
  text: string;
  truncated: boolean;
}

export function formatToolResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  const capped = capJsonOutputWithMeta(data);
  return {
    content: [{ type: "text", text: capped.text }],
  };
}

export function capJsonOutputWithMeta(data: unknown): CappedOutput {
  const maxBytes = getMaxResponseChars();
  let working = structuredClone(data) as unknown;
  let text = JSON.stringify(working, null, 2);

  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, truncated: false };
  }

  let truncated = true;
  for (let attempt = 0; attempt < 10; attempt++) {
    const arrayLimit = Math.max(1, 12 - attempt * 2);
    working = trimPayload(working, arrayLimit);
    const payload = { ...(working as object), _truncated: true, _notice: TRUNCATION_NOTICE };
    text = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(text, "utf8") <= maxBytes) {
      return { text, truncated };
    }
  }

  text = JSON.stringify({ _truncated: true, _notice: TRUNCATION_NOTICE, preview: summarizePayload(working) }, null, 2);
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    text = JSON.stringify({ _truncated: true, _notice: TRUNCATION_NOTICE }, null, 2);
  }
  return { text, truncated: true };
}

export function capJsonOutput(data: unknown): string {
  return capJsonOutputWithMeta(data).text;
}

export function getOutputCharCount(result: { content?: Array<{ type?: string; text?: string }> }): number {
  return result.content?.find((item) => item.type === "text")?.text?.length ?? 0;
}

function trimPayload(data: unknown, arrayLimit = 10): unknown {
  if (Array.isArray(data)) {
    let trimmed = data.slice(0, Math.max(1, Math.min(data.length, arrayLimit)));
    const maxBytes = getMaxResponseChars();
    while (trimmed.length > 1 && Buffer.byteLength(JSON.stringify(trimmed), "utf8") > maxBytes) {
      trimmed = trimmed.slice(0, Math.max(1, Math.floor(trimmed.length / 2)));
    }
    return trimmed;
  }

  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        result[key] = value.slice(0, Math.min(value.length, arrayLimit));
      } else if (value && typeof value === "object") {
        result[key] = trimPayload(value, arrayLimit);
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
