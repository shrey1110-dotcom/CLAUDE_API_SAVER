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

Set `MCP_TOOL_PROFILE` only when you intentionally want to limit exposed tools for a controlled test. The default profile is `full`.

Profiles:

- `full`: all tools
- `context_only`: `context_status`, `context_pack`, `impact_pack`
- `codex_locked`: `context_status`, `context_pack`
- `graph`: graph tools only
- `search`: repo map/search/symbol command tools only

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

## Codex locked context-broker mode

The first real Codex A/B test in full `context_broker` mode **failed** with `TOOL_LOOP_FAILURE`: Codex entered a tool exploration loop (`graph_symbol`, `graph_neighbors`, `get_symbol_context` repeated dozens of times). MCP output was only ~15k tokens, but Codex client tokens exploded. See `docs/postmortems/codex-full-context-failure.md` and `npm run analyze:failed-codex`.

**For Codex token-saving proof, use `context_broker_locked` — not full `context_broker`.** Full D1 is exploratory/debug only.

Locked mode limits repo-context-mcp to `context_status` and `context_pack` through `MCP_TOOL_PROFILE=codex_locked`. It keeps the full MCP implementation available for normal clients and configs, but removes fallback tools from the Codex proof surface.

Use:

- `examples/codex/ab/no-mcp.config.toml` for A
- `examples/codex/ab/context-broker.config.toml` for D1
- `examples/codex/ab/context-broker-locked.config.toml` for D2

D2 proves the product hypothesis only if:

```text
Codex client total D2 + MCP tokens D2 < no-MCP total
```

and quality is equal or better and routing is correct.

**Codex auth-discovery locked proof is complete** (`PROVEN_SAVINGS_STABLE`). See [proofs/codex-auth-discovery-locked.md](../proofs/codex-auth-discovery-locked.md). Do not use full `context_broker` for savings proof.

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
- `examples/codex/ab/context-broker-locked.config.toml`

Modes:

- **A no_mcp**: no repo-context-mcp server configured
- **D1 context_broker**: repo-context-mcp configured with compact env defaults and the full toolset
- **D2 context_broker_locked**: repo-context-mcp configured with `MCP_TOOL_PROFILE=codex_locked`

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

AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --repeat 3 --yes

npm run telemetry:report
npm run ab:report
npm run ab:compare
npm run ab:real-check
```

If Codex usage is not parseable from JSON usage output, enter real usage manually:

```bash
npm run ab:record -- --mode no_mcp --client codex
npm run ab:record -- --mode context_broker_locked --client codex --use-telemetry
```

Do not claim savings unless `npm run ab:real-check` returns `PROVEN SAVINGS`.
