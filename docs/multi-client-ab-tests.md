# Multi-client A/B tests

Do not claim token savings until you complete measured A/B runs per client.

## Universal success rule

```text
MCP/context broker helps only if:

client_total_with_mcp + MCP_estimated_output_tokens < client_total_without_mcp

and answer quality is equal or better.
```

## Comparison ladder

| Mode | Description |
| --- | --- |
| A | No MCP |
| B | Compact MCP search tools (`repo_map`, `search_code`, …) |
| C | Knowledge graph tools (`graph_query`, `graph_symbol`, …) |
| D | Context broker (`context_pack` first) |

D wins only if `client total D + context_pack MCP output < all other modes` and quality is equal or better.

## Per-client checklist

### Cursor

- Same repo and model for A–D
- Fresh chat per run
- Record Cursor input/output/cache/total from usage panel
- MCP test: enable `.cursor/mcp.json`, run `npm run telemetry:clean` before B–D
- After MCP runs: `npm run telemetry:report`

### Codex

- Same repo and model settings when possible
- Fresh session per run
- Record Codex usage if the CLI exposes it
- Configure via `docs/client-configs/codex.md`

### Claude Code

- Fresh session per run
- Project MCP config per `docs/client-configs/claude-code.md`

### Claude Desktop

- Fresh conversation per run
- Config per `docs/client-configs/claude-desktop.md`

### Generic stdio MCP

- Fresh session per run
- Set working directory to target repo
- See `docs/client-configs/generic-stdio.md`

## What to record

- Client token/cost numbers (if available)
- MCP estimated output tokens from telemetry
- Answer quality (1–10)
- Whether correct files/functions were identified
- Whether full files were read unnecessarily

## Build before MCP tests

```bash
npm run build
npm run graph:build
npm run context:build
```
