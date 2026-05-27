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

## Token savings test

See `docs/multi-client-ab-tests.md`.
