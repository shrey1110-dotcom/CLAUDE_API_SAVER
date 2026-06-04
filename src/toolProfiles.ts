export const MCP_TOOL_PROFILES = ["full", "context_only", "graph", "search", "codex_locked"] as const;

export type McpToolProfile = (typeof MCP_TOOL_PROFILES)[number];

export const MCP_TOOL_NAMES = [
  "context_status",
  "context_pack",
  "impact_pack",
  "graph_status",
  "graph_query",
  "graph_symbol",
  "graph_neighbors",
  "graph_paths",
  "repo_map",
  "search_code",
  "get_symbol_context",
  "get_project_commands",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

const PROFILE_TOOLS: Record<McpToolProfile, readonly McpToolName[]> = {
  full: MCP_TOOL_NAMES,
  context_only: ["context_status", "context_pack", "impact_pack"],
  codex_locked: ["context_status", "context_pack"],
  graph: ["graph_status", "graph_query", "graph_symbol", "graph_neighbors", "graph_paths"],
  search: ["repo_map", "search_code", "get_symbol_context", "get_project_commands"],
};

export function parseToolProfile(value: string | undefined): McpToolProfile {
  if (value && MCP_TOOL_PROFILES.includes(value as McpToolProfile)) {
    return value as McpToolProfile;
  }
  return "full";
}

export function toolsForProfile(profile: McpToolProfile): readonly McpToolName[] {
  return PROFILE_TOOLS[profile];
}

export function isToolExposed(tool: McpToolName, profile: McpToolProfile): boolean {
  return toolsForProfile(profile).includes(tool);
}
