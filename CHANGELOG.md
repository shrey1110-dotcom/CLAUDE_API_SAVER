# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0

Initial MVP:

- Universal stdio MCP server for coding agents
- Compact repo tools (`repo_map`, `search_code`, `get_symbol_context`, `get_project_commands`)
- Local knowledge graph cache (`.repo-context-graph/`)
- Context capsules and `context_pack` broker
- `impact_pack` for change analysis
- Graph query tools (`graph_query`, `graph_symbol`, and lower-priority neighbors/paths)
- Optional telemetry and reports
- Internal benchmarks (workflow, graph, context)
- Multi-client docs (Cursor, Codex, Claude Code, Claude Desktop, generic stdio)
- Safety-focused read-only MCP design
- `doctor` and `release:check` scripts for setup validation
