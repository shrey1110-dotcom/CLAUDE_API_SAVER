# repo-context

**repo-context** is a coding-agent context skill that generates task-specific context packs for AI coding assistants. Use the **CLI/skill workflow by default**; **MCP is optional** for agents that want live tool access.

Package name remains `repo-context-mcp` for compatibility. Binaries: `repo-context` and `repo-context-mcp`.

Works with **Cursor**, **OpenAI Codex**, **Claude Code**, **Claude Desktop**, and any **stdio MCP** client.

> **Token savings are not guaranteed.** This project includes A/B tooling to prove or disprove savings per client/task. Benchmarks measure MCP output size, not end-to-end client usage.

## Proven Scope

One real Codex proof is complete:

- Client: Codex CLI `0.137.0-alpha.4`
- Task: `auth-discovery`
- Mode: `context_broker_locked`
- Routing: `context_status` + `context_pack` only
- No-MCP baseline: `210,298` / `450,685` / `273,530`
- Locked combined: `62,509` / `62,495` / `62,276`
- Mean savings: `80.0%`
- Median savings: `77.2%`
- Quality: `9/10` vs `9/10`
- Expected files: `5/5`
- Verdict: `PROVEN_SAVINGS_STABLE`

Allowed claim: repo-context-mcp locked broker proved stable savings for Codex CLI auth-discovery in this repo. See [docs/proofs/codex-auth-discovery-locked.md](docs/proofs/codex-auth-discovery-locked.md).

Skill-mode head-to-head (auth-discovery, no MCP, supplied context): `SCOPED_SKILL_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT` — see [docs/benchmarks/skill-head-to-head.md](docs/benchmarks/skill-head-to-head.md). Scoped claim only; not a universal Graphify superiority claim.

Best-effort skill benchmark (auth-discovery): repo-context ultra pack is ~89% smaller context than Graphify best-effort with 5/5 vs 1/5 files locally; Codex median reduction ~7.6% (fixed client overhead — see `npm run benchmark:token-floor`). Context-efficiency metrics: `npm run benchmark:context-efficiency`.

Claude supplied-context benchmark (2026-06-11, separate metric from Codex): the `--profile claude` pack produced 70%+ smaller supplied context than Graphify-derived context on 5/5 tasks with equal-or-better quality on 5/5 tasks (`graphify query` unavailable in 0.8.36; exact Claude token usage not captured, so no Claude token-savings claim). See `docs/benchmarks.md`.

Not yet proven:

- MCP-mode token superiority vs Graphify (different usage modes; not apples-to-apples).
- Not proven for Cursor, Claude, Gemini, or other clients.
- Not proven for all tasks.
- Not proven for full `context_broker` mode.

Graphify diagnostic head-to-head (auth-discovery, Graphify 0.8.36 Gemini): complete — diagnostic only, no superiority claim. Real client usage comparison not yet recorded. Protocol: [docs/benchmarks/graphify-head-to-head.md](docs/benchmarks/graphify-head-to-head.md).

**Diagnostic compression** (raw repo tokens ÷ `context_pack` tokens) is comparable in shape to Graphify-style metrics but is **not proof of real agent savings**. Run `npm run benchmark:compression`. Real savings require `ab:real-check` with parsed client usage.

## Usage modes

| Mode | When to use |
|------|-------------|
| **Skill/CLI (default)** | `repo-context query` / `repo-context pack` — paste or pipe markdown into any assistant; avoids MCP client overhead |
| **MCP (optional)** | `repo-context mcp` — live `context_status` + `context_pack` for MCP-capable agents |

## What this is

A local, read-only context broker that builds deterministic repo intelligence (graph, capsules, multimodal metadata) offline, then answers with compact task-specific context packs instead of full file dumps or graph tool loops.

## What problem it solves

Agents often waste context on repeated `repo_map` / search / full-file reads. repo-context-mcp lets agents call **`context_pack`** once with a task description and a token budget, then drill down only when needed.

## How it works

1. **Build** (npm scripts): scan the repo → `.repo-context-graph/graph.json` + capsules  
2. **Serve** (stdio MCP): agents call `context_status` → `context_pack` → fallbacks  
3. **Measure** (optional): `MCP_TELEMETRY=1` logs tool output sizes locally  

MCP tools never write source code. Only local cache/telemetry files are written by npm scripts.

## Quick start

```bash
git clone https://github.com/shrey1110-dotcom/CLAUDE_API_SAVER.git
cd CLAUDE_API_SAVER   # or your fork path
npm install
npm run build
repo-context index .
repo-context status
repo-context pack "Where is auth implemented?" --budget 500 --format markdown
repo-context pack "Plan a safe refactor" --profile claude   # richer Claude-optimized pack (budget 900)
repo-context install cursor
repo-context install codex
npm run doctor
npm run benchmark:context
npm run benchmark:compression
```

Optional MCP: `repo-context mcp` (or configure as stdio MCP server via `repo-context-mcp`).

## Build graph and context

Run in the repository you want indexed (usually the project root):

```bash
npm run graph:build   # code + deterministic multimodal docs/assets
npm run context:build
```

Re-run after large refactors.

## Universal LLM mode (no MCP)

Generate a portable context pack for any LLM client:

```bash
npm run context:pack -- --task "your task" --budget 1000 --format markdown --out .context-packs/task.md
```

See [docs/universal-llm-usage.md](docs/universal-llm-usage.md).

## Broker-first architecture

The knowledge graph and multimodal ingestion feed **`context_pack` internally**. Agents should not wander through graph/search tools — use **`context_pack` first**, fallbacks only when needed. **Locked mode** (`codex_locked`) exposes only `context_status` + `context_pack` to prevent tool loops.

Strategy: [docs/broker-first-context-strategy.md](docs/broker-first-context-strategy.md) · Status: [docs/product-status.md](docs/product-status.md) · Proofs: [docs/proofs/README.md](docs/proofs/README.md) · Handoff: [docs/handoffs/cursor-continuation-after-codex-proof.md](docs/handoffs/cursor-continuation-after-codex-proof.md)

Real token savings require per-client A/B proof (`ab:real-check`), not benchmarks alone.

## Add to an MCP client

1. Point the client at `dist/index.js` (or `repo-context-mcp` after `npm link`).  
2. Set the compact env block (see [examples/generic-stdio/mcp-server.json](examples/generic-stdio/mcp-server.json)).  
3. Reload MCP in the client.

Client guides: [docs/client-configs/](docs/client-configs/)

## Recommended agent instructions

Give your agent this policy (also in [docs/agent-instructions/AGENTS.md](docs/agent-instructions/AGENTS.md)):

```text
Use repo-context-mcp as a context broker. First call context_status, then context_pack with budgetTokens 1000. Use full file reads only when exact implementation verification is needed.
```

**Tool order:** `context_status` → `context_pack` → `impact_pack` (for diffs) → `graph_query` / `graph_symbol` → `get_symbol_context` → `search_code` / `repo_map`

## MCP tools

| Tool | When to use |
| --- | --- |
| `context_pack` | **First** — task-specific files, symbols, commands |
| `impact_pack` | Changed files / diff impact |
| `context_status` | Check if index exists |
| `graph_query` | Fallback if `context_pack` is not enough |
| `graph_symbol` | Fallback symbol lookup |
| `get_symbol_context` | Exact code snippets |
| `search_code` / `repo_map` | Index missing or last resort |

## Environment (compact defaults)

```json
{
  "MCP_TELEMETRY": "1",
  "MCP_OUTPUT_MODE": "compact",
  "MCP_MAX_RESPONSE_CHARS": "9000",
  "MCP_DEFAULT_SEARCH_RESULTS": "5",
  "MCP_TREE_DEPTH": "2",
  "MCP_SYMBOL_CONTEXT_LINES": "14"
}
```

Use `MCP_TOOL_PROFILE` to limit exposed tools for controlled client tests. Default is `full`.

| Profile | Exposed tools |
| --- | --- |
| `full` | all MCP tools |
| `context_only` | `context_status`, `context_pack`, `impact_pack` |
| `codex_locked` | `context_status`, `context_pack` |
| `graph` | graph tools |
| `search` | repo map/search/symbol command tools |

## CLI

After `npm run build`:

```bash
npm start
# or
npx repo-context-mcp   # when linked or installed
```

## Benchmarks

```bash
npm run benchmark:context   # recommended path (~668 MCP tokens in reference repo)
npm run benchmark:context-locked
npm run benchmark:graph
npm run benchmark:workflow
```

See [docs/benchmarks.md](docs/benchmarks.md). Benchmarks measure **MCP output size**, not client billing.

## Telemetry

```bash
export MCP_TELEMETRY=1   # in MCP server env
npm run telemetry:clean  # before a measured session
npm run telemetry:report
```

## Safety

Read-only MCP tools; local cache only. Details: [docs/safety.md](docs/safety.md)

## Supported clients

| Client | Doc |
| --- | --- |
| Cursor | [docs/client-configs/cursor.md](docs/client-configs/cursor.md) |
| Codex | [docs/client-configs/codex.md](docs/client-configs/codex.md) |
| Claude Code | [docs/client-configs/claude-code.md](docs/client-configs/claude-code.md) |
| Claude Desktop | [docs/client-configs/claude-desktop.md](docs/client-configs/claude-desktop.md) |
| Generic stdio | [docs/client-configs/generic-stdio.md](docs/client-configs/generic-stdio.md) |

Setup checklist: [docs/setup-checklist.md](docs/setup-checklist.md)

## Limitations

- Heuristic graph (not a typechecker)  
- No embeddings or LLM summaries in v0.1.0  
- No guaranteed token savings without per-client A/B tests  

## Measuring real savings

Use [docs/multi-client-ab-tests.md](docs/multi-client-ab-tests.md) and [docs/ab-test-templates/](docs/ab-test-templates/).

```text
client_total_with_mcp + MCP_estimated_output_tokens < client_total_without_mcp
```

Quality must be equal or better.

## Guided A/B tooling

```bash
npm run ab:create -- --client cursor --repo . --task auth-discovery
npm run ab:prompt -- --mode no_mcp
npm run ab:record -- --mode no_mcp
npm run ab:report
npm run ab:compare
```

Guide: [docs/ab-testing.md](docs/ab-testing.md)

### Codex A/B testing quickstart

Use locked mode for the primary Codex proof path. The first real Codex A/B test increased usage because Codex entered a tool exploration loop; `context_broker_locked` limits exposed MCP tools to `context_status` and `context_pack`.

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

The Codex adapter is experimental and disabled by default. If Codex usage cannot be parsed from real JSON usage output, enter real usage manually with `npm run ab:record`. Do not claim real savings unless `ab:real-check` returns `PROVEN SAVINGS`.

## Development

```bash
npm run dev
npm run test:all
npm run doctor
npm run smoke:mcp
npm run release:check
npm run compat:report
```

Product overview: [docs/product.md](docs/product.md) · Status: [docs/product-status.md](docs/product-status.md) · Next benchmarks: [docs/next-benchmark-phase.md](docs/next-benchmark-phase.md) · Changelog: [CHANGELOG.md](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE)
