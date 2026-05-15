import { formatToolResult, getOutputCharCount } from "../output.js";
import { repoMap } from "../tools/repoMap.js";
import { searchCodeTool } from "../tools/searchCode.js";
import { getFileOutline } from "../tools/getFileOutline.js";
import { getSymbolContext } from "../tools/getSymbolContext.js";
import { getProjectCommands } from "../tools/getProjectCommands.js";

const root = process.cwd();

const samples = [
  { tool: "repo_map", data: repoMap(root) },
  { tool: "search_code", data: searchCodeTool("login", root, 5) },
  { tool: "get_file_outline", data: getFileOutline("src/index.ts", root) },
  { tool: "get_symbol_context", data: getSymbolContext("repoMap", root, 2) },
  { tool: "get_project_commands", data: getProjectCommands(root) },
];

let totalChars = 0;
let largest = { tool: "", chars: 0 };

for (const sample of samples) {
  const chars = getOutputCharCount(formatToolResult(sample.data));
  totalChars += chars;
  if (chars > largest.chars) {
    largest = { tool: sample.tool, chars };
  }
  console.log(`${sample.tool}: ${chars.toLocaleString()} chars`);
}

console.log(`total: ${totalChars.toLocaleString()} chars (~${Math.ceil(totalChars / 4).toLocaleString()} tokens)`);
console.log(`largest: ${largest.tool} (${largest.chars.toLocaleString()} chars)`);
