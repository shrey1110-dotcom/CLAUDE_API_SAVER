import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readNumberArg, readStringArg } from "../ab/cli.js";
import { logContextQuery } from "../queries/logger.js";
import { buildContextPack } from "./broker.js";
import { formatContextPackMarkdown } from "./formatPack.js";
import type { ContextMode } from "./types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function asMode(value: string | undefined): ContextMode {
  const modes: ContextMode[] = ["discovery", "edit", "test", "debug", "impact"];
  return modes.includes(value as ContextMode) ? (value as ContextMode) : "discovery";
}

function main(): void {
  const args = parseCliArgs();
  const task = readStringArg(args, "task");
  if (!task) {
    console.error("Usage: npm run context:pack -- --task \"...\" [--mode discovery] [--budget 1000] [--format json|markdown] [--out path]");
    process.exit(1);
  }

  const mode = asMode(readStringArg(args, "mode"));
  const budget = readNumberArg(args, "budget") ?? 1000;
  const format = (readStringArg(args, "format") ?? "json").toLowerCase();
  const out = readStringArg(args, "out");
  const root = readStringArg(args, "root") ?? ROOT;

  const pack = buildContextPack({ task, root, mode, budgetTokens: budget });
  logContextQuery({
    task,
    mode,
    budgetTokens: budget,
    fileCount: pack.files.length,
    symbolCount: pack.symbols.length,
    docCount: pack.docs?.length ?? 0,
    assetCount: pack.assets?.length ?? 0,
    conceptCount: pack.concepts?.length ?? 0,
    estimatedOutputTokens: pack.estimatedOutputTokens ?? 0,
    truncated: pack.truncated,
    source: "context:pack-cli",
  });

  const output = format === "markdown" ? formatContextPackMarkdown(pack) : `${JSON.stringify(pack, null, 2)}\n`;

  if (out) {
    const outPath = path.resolve(out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, "utf8");
    console.log(`Context pack written to ${outPath}`);
    console.log(`Estimated output tokens: ${pack.estimatedOutputTokens ?? "unknown"}`);
  } else {
    process.stdout.write(output);
  }
}

main();
