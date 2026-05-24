# repo-context-mcp

A local, read-only MCP server that helps Cursor and Codex use less context by returning small, precise repository information instead of large file dumps.

## Features

- **Read-only tools only** — no write, delete, edit, or shell execution tools
- **Path sandboxing** — never reads outside the configured project root
- **Output caps** — tool responses are capped at about 30KB
- **Fast search** — uses ripgrep (`rg`) when available, with a Node fallback
