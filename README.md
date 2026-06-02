# repo-context-mcp

**Universal MCP context broker for coding agents** — compact repo graph, context packs, and optional telemetry.

Works with **Cursor**, **OpenAI Codex**, **Claude Code**, **Claude Desktop**, and any **stdio MCP** client.

## What this is

A local, read-only MCP server that builds a small knowledge graph and topic capsules offline, then answers agent requests with **compact context packages** instead of full file dumps.

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
npm run graph:build
npm run context:build
npm run doctor
npm run benchmark:context
```

## Build graph and context

Run in the repository you want indexed (usually the project root):

```bash
npm run graph:build
npm run context:build
```

Re-run after large refactors.

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

## Development

```bash
npm run dev
npm run test:all
npm run doctor
npm run smoke:mcp
npm run release:check
npm run compat:report
```

Product overview: [docs/product.md](docs/product.md) · Changelog: [CHANGELOG.md](CHANGELOG.md)

## License

MIT — see [LICENSE](LICENSE)
