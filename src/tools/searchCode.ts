import { getConfig, isCompactMode } from "../config.js";
import { searchCode } from "../ripgrep.js";
import { resolveRoot } from "../pathSafety.js";

export function searchCodeTool(query: string, root?: string, maxResults?: number) {
  if (!query.trim()) {
    throw new Error("query is required");
  }

  const config = getConfig();
  const resolvedRoot = resolveRoot(root);
  const requested = maxResults ?? config.defaultSearchResults;
  const limit = isCompactMode() ? Math.min(requested, config.maxCompactSearchResults) : requested;
  const padding = config.searchContextPadding;

  const matches = searchCode({
    root: resolvedRoot,
    query,
    maxResults: limit,
    contextPadding: padding,
  });

  const resultTruncated = matches.length >= limit;
  const compact = isCompactMode();

  return {
    ...(compact ? {} : { root: resolvedRoot }),
    query,
    matchCount: matches.length,
    maxResults: limit,
    resultTruncated,
    truncated: resultTruncated,
    matches: matches.map((match) => {
      const entry: {
        filePath: string;
        lineNumber: number;
        line: string;
        context?: string[];
      } = {
        filePath: match.filePath,
        lineNumber: match.lineNumber,
        line: match.line.trimEnd(),
      };

      if (!compact || padding > 0) {
        entry.context =
          padding === 0
            ? [`${match.lineNumber}: ${match.line.trimEnd()}`]
            : match.context;
      }

      return entry;
    }),
  };
}
