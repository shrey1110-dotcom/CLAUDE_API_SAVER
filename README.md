# repo-context-mcp: Universal MCP Context Broker for Coding Agents

A local, read-only MCP server with a knowledge graph and context broker so agents can request the smallest useful context package instead of repeatedly searching and reading full files.

**Supported clients:** Cursor, OpenAI Codex, Claude Code, Claude Desktop, and any generic stdio MCP client.

Do not assume token savings until you complete per-client A/B testing ([docs/multi-client-ab-tests.md](docs/multi-client-ab-tests.md)).

## Features

- **Context broker** — `context_pack` and `impact_pack` return compact file/symbol/command packages
- **Local knowledge graph** — built offline under `.repo-context-graph/`
- **Read-only MCP tools** — no write/edit/delete or unrestricted shell tools
- **Compact output modes** — aggressive caps and minified JSON in compact mode
- **Telemetry** — optional logging to `.mcp-telemetry/`
- **Universal** — stdio transport; not Cursor-specific

## Quick start

```bash
npm install
npm run build
npm run graph:build
npm run context:build
npm start
```

## Recommended agent workflow

1. Build graph once: `npm run graph:build`
2. Build context capsules: `npm run context:build`
3. Agents call `context_pack` first
4. Use graph tools only if `context_pack` is insufficient
5. Use `search_code` / `repo_map` only when graph/context is missing
6. Read full files only as a last resort

## MCP tools (v2)

| Tool | Priority | Purpose |
| --- | --- | --- |
| `context_status` | High | Check graph/capsule index |
| `context_pack` | **Primary** | Smallest useful context for a task |
| `impact_pack` | High | Dependents/tests/commands for changes |
| `graph_status` | Medium | Graph index metadata |
| `graph_query` | Medium | Search the knowledge graph |
| `graph_symbol` | Medium | Symbol lookup in the graph |
| `graph_neighbors` | Low | Expand neighbors |
| `graph_paths` | Low | Short paths between nodes |
| `get_symbol_context` | Fallback | Exact code snippets |
| `get_project_commands` | Fallback | Scripts and likely commands |
| `search_code` | Fallback | Ripgrep search |
| `repo_map` | Fallback | Tree and project metadata |

## Environment (compact defaults)

```json
{
  "MCP_TELEMETRY": "1",
  "MCP_OUTPUT_MODE": "compact",
  "MCP_MAX_RESPONSE_CHARS": "9000",
  "MCP_DEFAULT_SEARCH_RESULTS": "5",
  "MCP_TREE_DEPTH": "2",
  "MCP_SYMBOL_CONTEXT_LINES": "14"
}
```

## Scripts

```bash
npm run build
npm run graph:build
npm run context:build
npm run benchmark:graph
npm run benchmark:context
npm run benchmark:workflow
npm run compat:report
npm run test:all
npm run telemetry:report
```

## Client setup

- [Cursor](docs/client-configs/cursor.md)
- [Codex](docs/client-configs/codex.md)
- [Claude Code](docs/client-configs/claude-code.md)
- [Claude Desktop](docs/client-configs/claude-desktop.md)
- [Generic stdio](docs/client-configs/generic-stdio.md)

Examples: [examples/](examples/)

Agent policy: [docs/agent-instructions/AGENTS.md](docs/agent-instructions/AGENTS.md)

## Graph cache

Written by npm scripts only (not MCP tools):

- `.repo-context-graph/graph.json`
- `.repo-context-graph/manifest.json`
- `.repo-context-graph/capsules.json`
- `.repo-context-graph/context-manifest.json`

## Telemetry

Set `MCP_TELEMETRY=1` on the MCP server process. Reports go to `.mcp-telemetry/`.

```bash
npm run telemetry:clean   # before a measured MCP session
npm run telemetry:report
```

## Testing

```bash
npm run test:all
```

## License

MIT
