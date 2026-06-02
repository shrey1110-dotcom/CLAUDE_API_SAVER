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

export interface CodexAdapterConfig {
  codexBin: string;
  baseArgs: string[];
  promptArgMode: "stdin" | "prompt-file-arg";
  promptFileArgs?: string[];
  configArgs: string[];
  cwd: string;
}
