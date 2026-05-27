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

## Token savings test

See `docs/multi-client-ab-tests.md`.
