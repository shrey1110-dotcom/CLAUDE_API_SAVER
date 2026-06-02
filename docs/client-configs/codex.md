# OpenAI Codex

## Support

Codex CLI supports MCP servers via TOML configuration when MCP is enabled for your environment.

## Config location

Typically `~/.codex/config.toml` (see your Codex version docs).

## Example

```toml
[mcp_servers.repo-context-mcp]
command = "node"
args = ["/path/to/repo-context-mcp/dist/index.js"]

[mcp_servers.repo-context-mcp.env]
MCP_TELEMETRY = "1"
MCP_OUTPUT_MODE = "compact"
MCP_MAX_RESPONSE_CHARS = "9000"
MCP_DEFAULT_SEARCH_RESULTS = "5"
MCP_TREE_DEPTH = "2"
MCP_SYMBOL_CONTEXT_LINES = "14"
```

## Verify

Run `context_status` from the agent after `npm run graph:build` and `npm run context:build` in the target repo.

## Recommended routing order

1. `context_status`
2. `context_pack` with `budgetTokens: 1000`
3. `impact_pack` for diff tasks
4. `get_symbol_context` only for exact symbol verification
5. `graph_query` / `graph_symbol` only if context is insufficient
6. `search_code` / `repo_map` only as last-resort fallback

If telemetry shows `repo_map`/`search_code` as top discovery tools, the v2 route is being bypassed.

## Token savings test

See `docs/multi-client-ab-tests.md`. Record Codex usage if exposed; compare with MCP disabled.

## A/B quickstart for this client

1. Run no-MCP baseline.
2. Run context broker mode (`context_status` + `context_pack` first).
3. Record token/cost/quality numbers from Codex output or usage tools.
4. Generate report via `npm run ab:report`.
5. Apply verdict from `npm run ab:compare`.

Automatic usage parsing only works if you explicitly configure the optional command adapter.
