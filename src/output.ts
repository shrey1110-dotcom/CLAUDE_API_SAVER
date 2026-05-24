import { MAX_OUTPUT_BYTES } from "./constants.js";

const TRUNCATION_NOTICE = "[truncated: output exceeded 30KB cap]";

export function formatToolResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  const text = capJsonOutput(data);
  return {
    content: [{ type: "text", text }],
  };
}
