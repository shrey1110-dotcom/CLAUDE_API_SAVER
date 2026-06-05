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
| D1 | Context broker (`context_pack` first, full toolset exposed) — **exploratory for Codex, not savings proof** |
| D2 | Locked context broker for Codex (`context_status` + `context_pack` only) |

D2 is the main Codex product proof. D1 failed with `TOOL_LOOP_FAILURE` when Codex over-used graph/symbol tools (~59 MCP calls, ~15k MCP tokens, client tokens worse than baseline). Analyze with `npm run analyze:failed-codex`. D2 wins only if `client total D2 + MCP output D2 < no-MCP total` and quality is equal or better.

**Codex auth-discovery locked proof is complete** (`PROVEN_SAVINGS_STABLE`). See [proofs/codex-auth-discovery-locked.md](proofs/codex-auth-discovery-locked.md).

Warning: if telemetry shows `repo_map`/`search_code` as dominant tools during normal discovery, the agent is not using v2 context-broker routing correctly.

## Codex locked context-broker mode

The first real Codex A/B test increased usage because Codex entered a tool exploration loop. Locked mode exists to reduce that variance by exposing only `context_status` and `context_pack` through `MCP_TOOL_PROFILE=codex_locked`.

Recommended Codex ladder:

- A: `no_mcp`
- D1: `context_broker` full toolset
- D2: `context_broker_locked`

## Per-client checklist

### Cursor

- Same repo and model for A-D
- Fresh chat per run
- Record Cursor input/output/cache/total from usage panel
- Configure MCP via `docs/client-configs/cursor.md`
- For MCP modes (B/C/D): run `npm run telemetry:clean` before the run, then `npm run telemetry:report`

### Codex

- Same repo and model settings when possible
- Fresh session per run; use three repeats when possible
- Test A: no MCP with `examples/codex/ab/no-mcp.config.toml`
- Test D1: context broker with `examples/codex/ab/context-broker.config.toml`
- Test D2: locked context broker with `examples/codex/ab/context-broker-locked.config.toml`
- Record Codex usage if the CLI exposes it; otherwise enter real usage manually with `ab:record`
- Configure via `docs/client-configs/codex.md`
- Use `npm run ab:real-check` as the final proof gate

Quickstart:

```bash
npm run ab:codex:plan
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode no_mcp --repo . --repeat 3 --yes
npm run telemetry:clean
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --repeat 3 --yes
npm run telemetry:report
npm run ab:report
npm run ab:compare
npm run ab:real-check
```

If Codex usage is not parseable, manually record real Codex usage numbers before `ab:real-check`.

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
