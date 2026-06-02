import fs from "node:fs";
import { spawn } from "node:child_process";
import { AB_COMMAND_ADAPTER_CONFIG, readJsonFile, resolveAbPath } from "../paths.js";
import type { CommandAdapterConfig, CommandAdapterRunInput, CommandAdapterRunOutput } from "./types.js";

function parseUsage(raw: string, parser: CommandAdapterConfig["usageParser"]): Record<string, unknown> | undefined {
  if (parser === "json") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? { text: trimmed } : undefined;
}

export function isCommandAdapterEnabled(): boolean {
  return process.env.AB_ENABLE_COMMAND_ADAPTER === "1";
}

export function loadCommandAdapterConfig(): CommandAdapterConfig | null {
  const config = readJsonFile<CommandAdapterConfig>(AB_COMMAND_ADAPTER_CONFIG);
  if (!config) {
    return null;
  }
  if (!config.command || !Array.isArray(config.args)) {
    throw new Error("Invalid command adapter config: command and args are required.");
  }
  return config;
}

export async function runCommandAdapter(input: CommandAdapterRunInput): Promise<CommandAdapterRunOutput> {
  if (!isCommandAdapterEnabled()) {
    throw new Error("Command adapter is disabled. Set AB_ENABLE_COMMAND_ADAPTER=1 to enable.");
  }
  if (!input.yes) {
    throw new Error("Command adapter requires --yes for explicit confirmation.");
  }

  const config = loadCommandAdapterConfig();
  if (!config) {
    throw new Error(`Missing adapter config at ${resolveAbPath(AB_COMMAND_ADAPTER_CONFIG)}.`);
  }
  if (!fs.existsSync(input.promptFile)) {
    throw new Error(`Prompt file not found: ${input.promptFile}`);
  }

  const resolvedArgs = config.args.map((arg) => arg.replaceAll("{promptFile}", input.promptFile));
  console.log(`[ab:adapter] Running command: ${config.command} ${resolvedArgs.join(" ")}`);

  return await new Promise<CommandAdapterRunOutput>((resolve, reject) => {
    const child = spawn(config.command, resolvedArgs, { shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command adapter exited with code ${code}.`));
        return;
      }
      const usageRaw = config.usageOutput === "stderr" ? stderr : stdout;
      resolve({
        stdout,
        stderr,
        parsedUsage: parseUsage(usageRaw, config.usageParser),
      });
    });
  });
}
