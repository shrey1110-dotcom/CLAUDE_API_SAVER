# Generic stdio MCP client

## Support

Any MCP client that launches a stdio server can use repo-context-mcp.

## Requirements

- Node.js 18+
- Built server at `dist/index.js`
- Graph and context built in the target repo:

```bash
npm run graph:build
npm run context:build
```

## Example config shape

```json
{
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
```

Set the client working directory to the repository under analysis.

## Token savings test

See `docs/multi-client-ab-tests.md`.

## A/B quickstart for this client

1. Run no-MCP baseline.
2. Run context broker mode (`context_status` + `context_pack` first).
3. Record token/cost/quality numbers from your client output.
4. Generate report via `npm run ab:report`.
5. Apply verdict from `npm run ab:compare`.

Automatic collection is optional and requires explicit command-adapter configuration.
