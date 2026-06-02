import type { AbClient } from "../types.js";

export interface CommandAdapterConfig {
  client: AbClient;
  command: string;
  args: string[];
  usageOutput: "stdout" | "stderr";
  usageParser: "json" | "text";
}

export interface CommandAdapterRunInput {
  promptFile: string;
  yes: boolean;
}

export interface CommandAdapterRunOutput {
  stdout: string;
  stderr: string;
  parsedUsage?: Record<string, unknown>;
}
