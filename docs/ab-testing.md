# A/B Testing Workflows

This project includes a real A/B testing system for evaluating whether MCP usage reduces total context usage for a specific client and task.

## What A/B testing means here

We compare four modes for the same task prompt:

- A: `no_mcp`
- B: `compact_search`
- C: `graph`
- D: `context_broker`

The system combines manually entered client usage metrics with MCP telemetry output metrics.

## Why client token usage must be measured separately

Most GUI clients do not expose token and cost metrics programmatically. Because of that:

- Guided/manual mode is the default and primary path.
- You must record client usage numbers per run.
- MCP benchmark numbers alone are not proof of real client savings.

## Modes

- **A no MCP**: baseline without MCP tools.
- **B compact search**: favor `repo_map`, `search_code`, `get_project_commands`, `get_symbol_context`.
- **C graph**: favor `graph_status`, `graph_query`, `graph_symbol`.
- **D context broker**: call `context_status` then `context_pack` first.

## Recommended testing strategy

- First test: **A vs D** (fastest decision).
- Full ladder test: **A/B/C/D** for deeper comparison.

## Guided manual flow

```bash
npm run ab:create -- --client cursor --repo . --task auth-discovery

npm run ab:prompt -- --mode no_mcp
# run prompt in client manually, record usage

npm run ab:record -- --mode no_mcp

npm run telemetry:clean
npm run ab:prompt -- --mode context_broker
# run prompt in client manually
npm run telemetry:report
npm run ab:record -- --mode context_broker --use-telemetry

npm run ab:report
npm run ab:compare
```

## Recording results

`ab:record` accepts either:

- CLI flags (`--client-total`, `--quality`, `--found`, etc.)
- Interactive stdin prompts if fields are omitted.

If `clientTotalTokens` is missing but input/output/cache fields are present, the total is auto-calculated.

If `--use-telemetry` is passed, MCP tool calls/tokens/largest response/tools can be auto-read from `.mcp-telemetry/logs.jsonl`.

## How verdicts are interpreted

Baseline is `no_mcp`. For each MCP mode:

- `combinedTotalTokens = clientTotalTokens + mcpEstimatedOutputTokens`
- Quality validity requires:
  - `answerQuality >= baselineQuality`
  - `foundExpectedFiles === true`

Verdicts:

- `saved_tokens`: best quality-valid MCP mode saves at least 5%.
- `no_meaningful_change`: best quality-valid MCP mode is within +/-5%.
- `increased_tokens`: all quality-valid MCP modes are more than 5% worse.
- `quality_regression`: token savings exist, but quality parity fails.
- `inconclusive`: required fields are missing.

## Optional command adapter (experimental)

An optional adapter can run a configured client command, but it is disabled by default.

Requirements:

- Set `AB_ENABLE_COMMAND_ADAPTER=1`.
- Create `.mcp-ab-tests/client-adapter.json`.
- Pass explicit `--yes` when running adapter commands.

Safety properties:

- Uses `spawn(command, args, { shell: false })`.
- Does not expose command execution via MCP tools.
- Does not require storing API keys in this repo.

## Important warning

Benchmarks and telemetry can indicate potential improvements, but they are not proof of real savings. Real savings must be validated per client with A/B runs and quality parity.
