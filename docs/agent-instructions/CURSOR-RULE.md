# Cursor rule text

Copy into `.cursor/rules/` or project rules:

Use repo-context-mcp as a context broker.

Order:

1. Use `context_status` if unsure whether the context index exists.
2. Use `context_pack` first for repo discovery, debugging, edit planning, and test planning.
3. Use `impact_pack` when changing existing files or analyzing diffs.
4. Use `graph_query` or `graph_symbol` only if `context_pack` is insufficient.
5. Use `get_symbol_context` only when exact function/class context is needed.
6. Use `search_code` / `repo_map` only if context_pack and graph context are insufficient.
7. Read full files only when editing or verifying exact implementation details.

Prefer one small `context_pack` call over many broad searches. Respect `budgetTokens`. Avoid broad file reads unless necessary.
