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
