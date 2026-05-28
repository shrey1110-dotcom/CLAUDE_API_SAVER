# Safety model

## MCP tools (agent-facing)

- **Read-only** against source code: no write, edit, delete, or unrestricted shell MCP tools.
- Tools return compact JSON summaries, outlines, graph nodes, and small symbol snippets — not full-repo dumps by default.
- Path resolution stays inside the configured project root, with symlink escape checks.

## Local scripts (developer-facing)

These npm scripts may write **only** local cache/telemetry under the repo:

| Path | Written by |
| --- | --- |
| `.repo-context-graph/` | `graph:build`, `context:build` |
| `.mcp-telemetry/` | telemetry when `MCP_TELEMETRY=1` |

Both directories are gitignored.

## What we do not do

- No external APIs
- No LLM calls for indexing or summaries
- No embeddings in v0.1.0
- No secret scanning in telemetry (logs tool names, args metadata, output sizes)

## Telemetry

When `MCP_TELEMETRY=1`, the server appends JSON lines to `.mcp-telemetry/logs.jsonl` with tool name, timing, and output character counts. Review before sharing logs.

## User responsibilities

- Do not commit `.mcp-telemetry/` or `.repo-context-graph/` if they contain sensitive path names from your machine.
- Avoid indexing repos with secrets in filenames you do not want in local cache JSON.
- Rebuild graph/context after large refactors: `npm run graph:build && npm run context:build`.

## Known limitations

- Graph import/call edges are heuristic, not typechecker-accurate.
- `impact_pack` may run a narrow `git diff --name-only` helper internally; it is not exposed as an MCP shell tool.
- Compact mode trades readability for smaller responses.
- Benchmark token estimates are not the same as client billed tokens.
