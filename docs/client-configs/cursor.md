# Cursor

## Support

Cursor supports stdio MCP servers via project or user config.

## Config location

- Project: `.cursor/mcp.json`
- User: Cursor Settings → MCP

## Example

```json
{
  "mcpServers": {
    "repo-context-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
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

1. `npm run build && npm run graph:build && npm run context:build`
2. Reload MCP in Cursor Settings.
3. Ask the agent to run `context_status`.

## Token savings test

See `docs/multi-client-ab-tests.md`. Measure Cursor usage per session; do not assume savings without A/B data.
