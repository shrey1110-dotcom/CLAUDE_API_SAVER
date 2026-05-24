import { searchCode } from "../ripgrep.js";
import { resolveRoot } from "../pathSafety.js";

export function searchCodeTool(query: string, root?: string, maxResults = 20) {
  if (!query.trim()) {
    throw new Error("query is required");
  }

  const resolvedRoot = resolveRoot(root);
  const matches = searchCode({
    root: resolvedRoot,
    query,
    maxResults,
  });

  return {
    root: resolvedRoot,
    query,
    matchCount: matches.length,
    matches: matches.map((match) => ({
      filePath: match.filePath,
      lineNumber: match.lineNumber,
      line: match.line,
      context: match.context,
    })),
  };
}
