# Universal LLM usage (CLI and file output)

Use `context:pack` to generate a portable context file for **any LLM** — with or without MCP.

- **MCP clients** (Cursor, Codex, Claude Code, etc.): use `context_status` + `context_pack` via MCP
- **Any other client** (Claude web, ChatGPT, Gemini, local LLMs): use CLI/file output below

Token savings still require per-client A/B proof (`ab:real-check`). File output proves compact context generation, not end-to-end billing savings.

```bash
npm run build
npm run graph:build
npm run context:build

npm run context:pack -- \
  --task "Find where authentication, login, or user session logic is implemented" \
  --mode discovery \
  --budget 1000 \
  --format markdown \
  --out .context-packs/auth-discovery.md
```

## Options

| Flag | Description |
|------|-------------|
| `--task` | Task description (required) |
| `--mode` | `discovery`, `edit`, `test`, `debug`, `impact` |
| `--budget` | Token budget (default 1000) |
| `--format` | `json` or `markdown` |
| `--out` | Output file path |

## Works with

- Claude web, ChatGPT web, Gemini web
- Local LLMs
- Codex without MCP
- Cursor without MCP

Paste the generated pack instead of asking the model to explore the repo manually.

Query metadata is logged to `.repo-context-queries/queries.jsonl` (no source contents).
