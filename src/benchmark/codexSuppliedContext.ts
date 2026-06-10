import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { mergeUsageWithTotal, parseCodexUsageFromOutput } from "../ab/adapters/codexUsage.js";
import { getCodexQaTask } from "../ab/codexQa/profiles.js";
import { scoreCodexQaText } from "../ab/codexQa/scoring.js";

export const DEFAULT_CODEX_BIN =
  "/Users/shreyanshsharma/.vscode/extensions/openai.chatgpt-26.602.71036-darwin-arm64/bin/macos-aarch64/codex";

export interface SuppliedContextCodexRepeat {
  repeat: number;
  arm: string;
  runDir: string;
  clientInputTokens?: number;
  clientOutputTokens?: number;
  clientTotalTokens?: number;
  usageParsed: boolean;
  qualityScore: number;
  matchedFiles: string[];
  missingFiles: string[];
  matchedConcepts: string[];
  missingConcepts: string[];
  mcpToolsDetected: boolean;
  crossContamination: boolean;
  exitCode: number | null;
  note: string;
}

export function codexArgsNoMcp(repoPath: string): string[] {
  return ["-a", "never", "exec", "--ignore-user-config", "--cd", repoPath, "--sandbox", "read-only", "--json", "-"];
}

export function extractCodexAnswerText(stdout: string, stderr: string): string {
  const parts: string[] = [];
  for (const line of `${stdout}\n${stderr}`.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        item?: { type?: string; text?: string; aggregated_output?: string };
      };
      if (parsed.type === "item.completed" && parsed.item?.type === "agent_message" && parsed.item.text) {
        parts.push(parsed.item.text);
      }
      if (parsed.type === "item.completed" && parsed.item?.type === "command_execution" && parsed.item.aggregated_output) {
        parts.push(parsed.item.aggregated_output);
      }
    } catch {
      // Skip non-JSON lines.
    }
  }
  if (parts.length > 0) return parts.join("\n\n");
  return `${stdout}\n${stderr}`;
}

export function detectMcpToolsInOutput(stdout: string, stderr: string): boolean {
  for (const line of `${stdout}\n${stderr}`.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as { type?: string; item?: { type?: string; server?: string } };
      if (parsed.type === "mcp_tool_call") return true;
      if (parsed.item?.type === "mcp_tool_call") return true;
      if (parsed.type === "item.completed" && parsed.item?.type === "mcp_tool_call") return true;
    } catch {
      // Non-JSON line.
    }
  }
  return false;
}

export function detectCrossContamination(
  arm: "graphify" | "repo-context",
  stdout: string,
  stderr: string,
  prompt: string,
): boolean {
  const combined = `${stdout}\n${stderr}\n${prompt}`.toLowerCase();
  if (arm === "graphify") {
    return combined.includes("repo-context skill") || combined.includes("# repo context:");
  }
  return combined.includes("graphify query result") || combined.includes("graphify context only");
}

const NO_SHELL_RULE =
  "Do not run shell commands or search the repo. Use ONLY the supplied context below. No MCP tools.";

export function buildGraphifySkillPrompt(graphifyOutput: string, task: string, compact = false): string {
  const body = compact
    ? `Task: ${task}
${NO_SHELL_RULE}
Use Graphify context only. No edits. Compact table: file | role | key symbols.

Graphify:
${graphifyOutput}`
    : `You are evaluating this repo using Graphify context only.

Task:
${task}

Use the Graphify query result below as your primary context source. Do not use repo-context-mcp. Do not use MCP tools. Do not edit files. Do not browse or search raw repo files unless absolutely necessary. If the Graphify context is insufficient, say what is missing rather than guessing.

Graphify query result:
${graphifyOutput}

Answer with:
- exact files
- functions/symbols if present
- why each matters
- any missing context or uncertainty`;
  return body;
}

export function buildRepoContextSkillPrompt(repoContextOutput: string, task: string, compact = false): string {
  const body = compact
    ? `Task: ${task}
${NO_SHELL_RULE}
Use repo-context pack only. No edits. Compact table: file | role | key symbols.

Pack:
${repoContextOutput}`
    : `You are evaluating this repo using repo-context skill output only.

Task:
${task}

Use the repo-context pack below as your primary context source. Do not mount MCP tools. Do not use Graphify. Do not edit files. Do not browse or search raw repo files unless absolutely necessary. If the pack is insufficient, say what is missing rather than guessing.

repo-context pack:
${repoContextOutput}

Answer with:
- exact files
- functions/symbols if present
- why each matters
- any missing context or uncertainty`;
  return body;
}

export async function runSuppliedContextCodexOnce(input: {
  codexBin: string;
  repoPath: string;
  prompt: string;
  runDir: string;
  repeat: number;
  arm: "graphify" | "repo-context";
  taskName?: string;
}): Promise<SuppliedContextCodexRepeat> {
  const taskName = input.taskName ?? "auth-discovery";
  const profile = getCodexQaTask(taskName);
  if (!profile) throw new Error(`${taskName} profile missing`);

  fs.mkdirSync(input.runDir, { recursive: true });
  const promptPath = path.join(input.runDir, "prompt.txt");
  const stdoutPath = path.join(input.runDir, "stdout.txt");
  const stderrPath = path.join(input.runDir, "stderr.txt");
  fs.writeFileSync(promptPath, input.prompt, "utf8");

  const args = codexArgsNoMcp(input.repoPath);
  const startedAt = new Date().toISOString();

  return await new Promise((resolve, reject) => {
    const child = spawn(input.codexBin, args, { cwd: input.repoPath, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.stdin.write(input.prompt);
    child.stdin.end();
    child.on("close", (code) => {
      fs.writeFileSync(stdoutPath, stdout, "utf8");
      fs.writeFileSync(stderrPath, stderr, "utf8");

      const usage = parseCodexUsageFromOutput(stdout, stderr);
      const merged = usage ? mergeUsageWithTotal(usage) : null;
      const answerText = extractCodexAnswerText(stdout, stderr);
      const quality = scoreCodexQaText(profile, answerText);
      const mcpToolsDetected = detectMcpToolsInOutput(stdout, stderr);
      const crossContamination = detectCrossContamination(input.arm, stdout, stderr, input.prompt);

      const result: SuppliedContextCodexRepeat = {
        repeat: input.repeat,
        arm: input.arm,
        runDir: input.runDir,
        clientInputTokens: merged?.clientInputTokens,
        clientOutputTokens: merged?.clientOutputTokens,
        clientTotalTokens: merged?.clientTotalTokens,
        usageParsed: merged?.clientTotalTokens !== undefined,
        qualityScore: quality.qualityScore,
        matchedFiles: quality.matchedFiles,
        missingFiles: quality.missingFiles,
        matchedConcepts: quality.matchedConcepts,
        missingConcepts: quality.missingConcepts,
        mcpToolsDetected,
        crossContamination,
        exitCode: code,
        note: quality.note,
      };

      fs.writeFileSync(
        path.join(input.runDir, "metadata.json"),
        `${JSON.stringify(
          {
            startedAt,
            finishedAt: new Date().toISOString(),
            arm: input.arm,
            args,
            exitCode: code,
            usageParsed: result.usageParsed,
            mcpToolsDetected,
            crossContamination,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      fs.writeFileSync(path.join(input.runDir, "quality.json"), `${JSON.stringify(quality, null, 2)}\n`, "utf8");

      if (code !== 0) {
        reject(new Error(`Codex ${input.arm} repeat ${input.repeat} exited ${code}`));
        return;
      }
      if (!result.usageParsed) {
        reject(new Error(`Codex ${input.arm} repeat ${input.repeat} usage not parsed`));
        return;
      }
      if (mcpToolsDetected) {
        reject(new Error(`Codex ${input.arm} repeat ${input.repeat} detected MCP tools`));
        return;
      }
      if (crossContamination) {
        reject(new Error(`Codex ${input.arm} repeat ${input.repeat} cross-contamination detected`));
        return;
      }
      resolve(result);
    });
  });
}
