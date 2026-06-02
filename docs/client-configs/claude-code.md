# Claude Code

## Support

Claude Code supports project MCP configuration via `.mcp.json` or CLI MCP settings (see Anthropic docs for your version).

## Example

```json
{
  "mcpServers": {
    "repo-context-mcp": {
      "type": "stdio",
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

Run `context_status` in a fresh session after building graph and context in the repo.

## Recommended routing order

1. `context_status`
2. `context_pack` with `budgetTokens: 1000`
3. `impact_pack` for changed-files/diff tasks
4. `get_symbol_context` only for exact symbol verification
5. `graph_query` / `graph_symbol` only if context is insufficient
6. `search_code` / `repo_map` only as last-resort fallback

If telemetry shows `repo_map`/`search_code` dominating discovery, update prompts/instructions to enforce context_pack-first behavior.

## Token savings test

See `docs/multi-client-ab-tests.md`.

## A/B quickstart for this client

1. Run no-MCP baseline.
2. Run context broker mode (`context_status` + `context_pack` first).
3. Record token/cost/quality numbers manually from Claude Code outputs.
4. Generate report via `npm run ab:report`.
5. Apply verdict from `npm run ab:compare`.

This project does not assume Claude Code usage can be auto-read unless you configure an adapter.
