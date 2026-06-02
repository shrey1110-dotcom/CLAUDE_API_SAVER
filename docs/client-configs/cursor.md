# Cursor

## Support

Cursor supports stdio MCP servers through project or user MCP configuration.

## Config location

- Project config: `.cursor/mcp.json`
- User config: Cursor Settings -> MCP

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

1. Build and index: `npm run build && npm run graph:build && npm run context:build`
2. Reload MCP in Cursor.
3. Run `context_status` in a new chat.

## A/B quickstart for this client

1. Run no-MCP baseline.
2. Run context broker mode (`context_status` + `context_pack` first).
3. Record token/cost/quality numbers manually from the Cursor UI.
4. Generate report via `npm run ab:report`.
5. Apply verdict from `npm run ab:compare`.

Cursor usage panels are not read programmatically by default in this project.
