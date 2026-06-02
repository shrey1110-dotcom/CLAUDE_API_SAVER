# OpenAI Codex

## Support

Codex CLI supports MCP servers via TOML configuration when MCP is enabled for your environment.
Codex may be used from CLI and IDE experiences depending on your setup.

## Config location

- Project-scoped config (recommended for A/B tests): `.codex/config.toml`
- User-scoped config: `~/.codex/config.toml`

For controlled A/B tests, use isolated project-scoped configs and do not mutate the global `~/.codex/config.toml`.

## Example

```toml
[mcp_servers.repo-context-mcp]
command = "node"
args = ["/path/to/repo-context-mcp/dist/index.js"]

[mcp_servers.repo-context-mcp.env]
MCP_TELEMETRY = "1"
MCP_OUTPUT_MODE = "compact"
MCP_MAX_RESPONSE_CHARS = "9000"
MCP_DEFAULT_SEARCH_RESULTS = "5"
MCP_TREE_DEPTH = "2"
MCP_SYMBOL_CONTEXT_LINES = "14"
```

## Verify

Run `context_status` from the agent after `npm run graph:build` and `npm run context:build` in the target repo.

## Recommended routing order

1. `context_status`
2. `context_pack` with `budgetTokens: 1000`
3. `impact_pack` for diff tasks
4. `get_symbol_context` only for exact symbol verification
5. `graph_query` / `graph_symbol` only if context is insufficient
6. `search_code` / `repo_map` only as last-resort fallback

If telemetry shows `repo_map`/`search_code` as top discovery tools, the v2 route is being bypassed.

## Token savings test

See `docs/multi-client-ab-tests.md`. Record Codex usage if exposed; compare with MCP disabled.
Usage/tokens must come from Codex output, usage reporting, compliance/billing APIs, or manual entry if not exposed locally.
Do not claim savings from transcript length or character counts.

Final proof requires:

```text
context_broker_client_total + MCP_estimated_output_tokens < no_mcp_client_total
```

with answer quality equal or better.

## A/B quickstart for this client

1. Run no-MCP baseline.
2. Run context broker mode (`context_status` + `context_pack` first).
3. Record token/cost/quality numbers from Codex output or usage tools.
4. Generate report via `npm run ab:report`.
5. Apply verdict from `npm run ab:compare`.

Automatic usage parsing only works if you explicitly configure the optional command adapter.

## Controlled Codex A/B configs

Use templates:

- `examples/codex/ab/no-mcp.config.toml`
- `examples/codex/ab/context-broker.config.toml`

Modes:

- **A no_mcp**: no repo-context-mcp server configured
- **D context_broker**: repo-context-mcp configured with compact env defaults

## Experimental Codex adapter config

If you want semi-automated CLI execution, create `.mcp-ab-tests/codex-adapter.json`:

```json
{
  "codexBin": "codex",
  "baseArgs": [],
  "promptArgMode": "stdin",
  "configArgs": ["--config", "{configPath}"],
  "cwd": "{repoPath}"
}
```

This is optional and disabled unless `AB_ENABLE_CODEX_ADAPTER=1` with `--yes`.

## Codex A/B testing quickstart

Use isolated configs where possible. Codex may also use project-scoped `.codex/config.toml` or user config, but A/B tests should avoid mutating `~/.codex/config.toml`.

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

If Codex usage is not parseable from JSON usage output, enter real usage manually:

```bash
npm run ab:record -- --mode no_mcp --client codex
npm run ab:record -- --mode context_broker --client codex --use-telemetry
```

Do not claim savings unless `npm run ab:real-check` returns `PROVEN SAVINGS`.
