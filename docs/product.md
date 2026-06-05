# Product positioning

## What repo-context-mcp is

A **broker-first context intelligence layer** for coding agents. It builds deterministic local repo intelligence (code, docs, metadata, transcripts, assets) and returns compact task-specific context packs through **MCP**, **CLI**, or **file output**.

**Primary interface:** `context_pack` — one call with a task string and `budgetTokens`.

> Token savings are not guaranteed. Use A/B tooling (`ab:real-check`) to prove or disprove savings per client/task. Benchmarks are not end-to-end usage proof.

**Supporting layers:**

1. Context capsules (offline, topic summaries)
2. Knowledge graph (code + deterministic multimodal docs/assets)
3. Self-iteration loop (`self:analyze` / `self:recommend`) from measured failures
4. Compact legacy tools (`search_code`, `repo_map`, `get_symbol_context`) — fallback only
5. Locked profiles (`codex_locked`) — proof path with 2 tools only

## What it is not

- Not a code editor or IDE plugin
- Not a full code intelligence platform or language server
- Not a replacement for TypeScript, ESLint, or test runners
- Not a guarantee of lower client token bills without measured A/B tests

## Problem it solves

Agents often burn context by:

- Reading entire files before knowing which files matter
- Running many broad searches
- Re-loading the same repo structure every session

repo-context-mcp front-loads a **local index** (graph + capsules + multimodal metadata) and answers with **compact structured context** via `context_pack`. The graph is internal; agents should not traverse it directly unless fallbacks are required.

## Broker-first, not graph-first

- Graph and multimodal data **feed `context_pack` internally**
- **Locked profiles** prevent tool-loop over-querying
- **Universal CLI/file mode** works with any LLM (web, local, or without MCP)
- **Self-iteration** improves broker behavior from measured failures — never fakes proof
- **Real proof** requires client usage totals from A/B tests

See [product-status.md](product-status.md) and [broker-first-context-strategy.md](broker-first-context-strategy.md).

## How agents should use it

1. `context_status` — index exists?
2. `context_pack` — discovery, debug, edit/test planning
3. `impact_pack` — changed files / diff impact
4. `graph_query` / `graph_symbol` — only if `context_pack` is insufficient
5. `get_symbol_context` — exact code when needed
6. `search_code` / `repo_map` — fallback when index missing
7. Full file reads — only for edits or verification

## Roadmap (not in v0.1.0)

- Incremental graph rebuilds
- Optional SQLite backend
- Optional embeddings
- Optional LLM-generated summaries (offline build only)
- Per-client token benchmark harness
- npm publish / `npx` distribution polish
- Remote Streamable HTTP transport
