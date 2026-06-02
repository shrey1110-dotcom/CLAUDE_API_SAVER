# Claude agent instructions

Same policy as `AGENTS.md`:

Use repo-context-mcp as a context broker.

Order:

1. `context_status`
2. `context_pack`
3. `impact_pack`
4. `get_symbol_context` (only for exact function/class verification)
5. `graph_query` / `graph_symbol` (fallback when context_pack is insufficient)
6. `search_code` / `repo_map`
7. Full file reads only when editing or verifying exact details

Respect `budgetTokens`. Prefer one `context_pack` over many searches.
If telemetry shows `repo_map`/`search_code` dominating normal discovery, routing is not using v2 correctly.
