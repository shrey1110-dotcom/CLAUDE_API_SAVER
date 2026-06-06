# Claude Desktop

## Support

Claude Desktop supports MCP via `claude_desktop_config.json`.

## Config location

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

## Example

```json
{
  "mcpServers": {
    "repo-context-mcp": {
      "command": "node",
      "args": ["/path/to/repo-context-mcp/dist/index.js"],
      "env": {
        "MCP_TELEMETRY": "1",
        "MCP_OUTPUT_MODE": "compact",
        "MCP_MAX_RESPONSE_CHARS": "9000",
        "MCP_DEFAULT_SEARCH_RESULTS": "5",
        "MCP_TREE_DEPTH": "2",
        "MCP_SYMBOL_CONTEXT_LINES": "14"
      }
    }
  }
}
```

## Verify

Restart Claude Desktop after config changes; run `context_status` from a chat.

## Recommended routing order

1. `context_status`
2. `context_pack` with `budgetTokens: 1000`
3. `impact_pack` for changed-files/diff tasks
4. `get_symbol_context` only for exact symbol verification
5. `graph_query` / `graph_symbol` only if context is insufficient
6. `search_code` / `repo_map` only as last-resort fallback

If telemetry shows `repo_map`/`search_code` as dominant discovery tools, the client is not following v2 routing.

## Token savings test

**Claude Desktop savings are not proven.** Use manual `ab:record` or file-context A/B (`ab:file-context:*`). For automated Claude Code proof tooling, see [claude-code.md](claude-code.md).

See `docs/multi-client-ab-tests.md`.

## A/B quickstart for this client

1. Run no-MCP baseline.
2. Run context broker mode (`context_status` + `context_pack` first).
3. Record token/cost/quality numbers manually from Claude Desktop usage views.
4. Generate report via `npm run ab:report`.
5. Apply verdict from `npm run ab:compare`.

GUI usage is manual by default; no automatic usage-panel scraping is assumed.
