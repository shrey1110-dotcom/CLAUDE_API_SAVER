# Product positioning

## What repo-context-mcp is

A **universal MCP context broker** for coding agents. It runs as a local stdio MCP server and returns small, task-specific context packages so agents spend fewer tokens on repo discovery.

**Primary interface:** `context_pack` — one call with a task string and `budgetTokens`.

**Supporting layers:**

1. Context capsules (offline, topic summaries)
2. Knowledge graph (files, symbols, edges)
3. Compact legacy tools (`search_code`, `repo_map`, `get_symbol_context`)

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

repo-context-mcp front-loads a **local index** (graph + capsules) and answers with **compact structured context** instead.

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
