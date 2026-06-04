import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readStringArg } from "../ab/cli.js";
import { buildLockedProofCommands } from "../ab/adapters/codexCliSupport.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function main(): void {
  const args = parseCliArgs();
  const codexBinArg = readStringArg(args, "codex-bin");

  console.log("Codex locked proof — run these commands on a machine with Codex CLI installed.\n");
  if (!codexBinArg) {
    console.log("If codex is not on PATH, add: --codex-bin /absolute/path/to/codex\n");
  }

  for (const command of buildLockedProofCommands(ROOT, codexBinArg)) {
    console.log(command);
  }
}

main();
