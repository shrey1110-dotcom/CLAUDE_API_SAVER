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
- For Codex, use Codex usage output/reporting/compliance APIs when available, otherwise enter usage manually.

## Modes

- **A no MCP**: baseline without MCP tools.
- **B compact search**: favor `repo_map`, `search_code`, `get_project_commands`, `get_symbol_context`.
- **C graph**: favor `graph_status`, `graph_query`, `graph_symbol`.
- **D context broker**: call `context_status` then `context_pack` first.

For mode D, treat `repo_map` / `search_code` as last-resort fallback only if `context_pack` is missing, errors, or is explicitly insufficient.

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
npm run ab:real-check
```

For route sanity checks before real A/B sessions:

```bash
npm run telemetry:clean
npm run telemetry:context-test
```

## Recording results

`ab:record` accepts either:

- CLI flags (`--client-total`, `--quality`, `--found`, etc.)
- Interactive stdin prompts if fields are omitted.

If `clientTotalTokens` is missing but input/output/cache fields are present, the total is auto-calculated.

If `--use-telemetry` is passed, MCP tool calls/tokens/largest response/tools can be auto-read from `.mcp-telemetry/logs.jsonl`.

For Codex adapter runs:

- `npm run ab:codex` tries to parse usage from Codex output.
- If usage is not found, it prints: `Codex usage was not found in output. Record real Codex usage manually with ab:record.`
- Do not infer usage from transcript length.

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
- Codex automation must use isolated config files (project-scoped or temp) and must not mutate `~/.codex/config.toml`.

## Important warning

Benchmarks and telemetry can indicate potential improvements, but they are not proof of real savings. Real savings must be validated per client with A/B runs and quality parity.
If telemetry shows `repo_map`/`search_code` dominating normal discovery runs, routing is not using v2 correctly.
Do not claim savings from transcript length alone.

For Codex, `ab:real-check` is the final gate. It returns `INCOMPLETE TEST` until real Codex client totals are auto-parsed or manually recorded.

## Codex A/B testing quickstart

```bash
npm run ab:codex:plan

AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode no_mcp --repo . --repeat 3 --yes

npm run telemetry:clean

AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker --repo . --repeat 3 --yes

npm run telemetry:report
npm run ab:report
npm run ab:compare
npm run ab:real-check
```

Use isolated configs from `examples/codex/ab/`. If Codex usage is not parseable, record real usage manually with `ab:record` before running `ab:real-check`.
