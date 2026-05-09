import { getConfig } from "../config.js";
import { searchCode } from "../ripgrep.js";
import { resolveRoot } from "../pathSafety.js";

export function searchCodeTool(query: string, root?: string, maxResults?: number) {
  if (!query.trim()) {
    throw new Error("query is required");
  }

  const config = getConfig();
  const resolvedRoot = resolveRoot(root);
  const limit = maxResults ?? config.defaultSearchResults;
  const matches = searchCode({
    root: resolvedRoot,
    query,
    maxResults: limit,
    contextPadding: config.searchContextPadding,
  });

  const capped = matches.length >= limit;

  return {
    root: resolvedRoot,
    query,
    matchCount: matches.length,
    maxResults: limit,
    truncated: capped,
    matches: matches.map((match) => ({
      filePath: match.filePath,
      lineNumber: match.lineNumber,
      line: match.line,
      context: match.context,
    })),
  };
}
