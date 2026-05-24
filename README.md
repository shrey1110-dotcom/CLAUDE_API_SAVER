# repo-context-mcp

A local, read-only MCP server that helps Cursor and Codex use less context by returning small, precise repository information instead of large file dumps.

## Features

- **Read-only tools only** — no write, delete, edit, or shell execution tools
- **Path sandboxing** — never reads outside the configured project root
- **Output caps** — tool responses are capped at about 30KB
- **Fast search** — uses ripgrep (`rg`) when available, with a Node fallback

## Requirements

- Node.js 18+
- Optional: [ripgrep](https://github.com/BurntSushi/ripgrep) installed and available on `PATH`

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Run

```bash
npm start
```

The server communicates over stdio. Logs are written to stderr only.

## Development

```bash
npm run dev
```

## Cursor MCP setup

1. Build the server:

   ```bash
   npm install
   npm run build
   ```

2. This repo includes an example config at [`.cursor/mcp.json`](.cursor/mcp.json):

   ```json
   {
     "mcpServers": {
       "repo-context-mcp": {
         "type": "stdio",
         "command": "node",
         "args": ["${workspaceFolder}/dist/index.js"]
       }
     }
   }
   ```

3. Open Cursor Settings → MCP and enable `repo-context-mcp`.
4. Rebuild after code changes (`npm run build`).

## Tools

### `repo_map`

Returns a compact repository overview.

**Input**

- `root?` — project root (defaults to current working directory)

**Output**

- detected package manager
- languages and frameworks
- important config files
- package scripts
- top-level directory tree (excluding `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`)

### `search_code`

Search code and return precise matches with context.

**Input**

- `query` — search string or regex
- `root?` — project root
- `maxResults?` — default `20`

**Output**

- file path
- line number
- matching line
- 2 lines before and after the match

### `get_file_outline`

Return a lightweight outline for one file.

**Input**

- `filePath` — path relative to root
- `root?` — project root

**Output**

- imports
- exported functions/classes/constants
- top-level functions/classes

### `get_symbol_context`

Find a symbol and return compact code blocks around its definition.

**Input**

- `symbol` — function, class, or constant name
- `root?` — project root
- `maxResults?` — default `5`

**Output**

- matching file paths
- symbol line number
- compact code block around the definition

### `get_project_commands`

Return runnable project commands.

**Input**

- `root?` — project root

**Output**

- package scripts
- likely test command
- likely lint command
- likely dev command

Reads `package.json`, `pyproject.toml`, `Makefile`, `Cargo.toml`, and `go.mod` when present.

## Security

- All file reads are constrained to the resolved project root
- No API keys or network access required
- No subprocess execution beyond optional ripgrep for search
- No mutating operations

## License

MIT

