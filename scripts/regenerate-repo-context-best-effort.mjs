#!/usr/bin/env node
import { buildSkillPack } from "../dist/cli/skillPack.js";
import { formatSkillMarkdown } from "../dist/cli/formatSkillMarkdown.js";
import fs from "node:fs";
import path from "node:path";

const TASK =
  "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.";
const OUT = path.resolve(".mcp-benchmarks/repo-context-best-effort-context.txt");

const pack = buildSkillPack({ task: TASK, budgetTokens: 500 });
const markdown = formatSkillMarkdown(pack, "ultra");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, markdown, "utf8");
console.log(`Wrote ${OUT} (~${Math.ceil(markdown.length / 4)} tokens)`);
