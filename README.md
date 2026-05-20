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

To enable telemetry, set `MCP_TELEMETRY=1` in the MCP server env block (see the example config above).

## Telemetry

Lightweight telemetry helps measure whether MCP tools are returning compact context instead of large responses.

### Enable logging

Set this environment variable for the MCP server:

```bash
export MCP_TELEMETRY=1
```

In Cursor, add it to [`.cursor/mcp.json`](.cursor/mcp.json):

```json
"env": {
  "MCP_TELEMETRY": "1"
}
```

Each MCP tool call appends one JSON line to `.mcp-telemetry/logs.jsonl` with:

- timestamp
- tool name
- truncated input arguments
- execution duration in ms
- output character count
- estimated output tokens (`chars / 4`)
- success or error

Telemetry never logs full file contents beyond the existing capped tool output.

### Validate the server locally

```bash
npm run validate
```

This runs `build`, `telemetry:test`, `telemetry:summary`, and `telemetry:report` in one step.

### Run a telemetry test

```bash
npm run build
npm run telemetry:test
```

This calls each MCP tool once with sample inputs, writes telemetry logs, generates `.mcp-telemetry/report.md`, and prints the report path.

### View a quick summary

```bash
npm run telemetry:summary
```

### Generate a markdown report

```bash
npm run telemetry:report
```

The report is written to `.mcp-telemetry/report.md` and includes:

- total tool calls
- estimated total MCP output tokens
- average response size
- top most-used tools
- largest responses
- token savings opportunities
- warnings for excessively large outputs
- recommendations for reducing MCP context size
- a section titled `Paste this report into ChatGPT for optimization advice`
- the last 20 MCP tool calls
- average duration by tool
- estimated token cost by tool

### Share results with ChatGPT

1. Use the MCP server in Cursor with `MCP_TELEMETRY=1`.
2. Run `npm run telemetry:report`.
3. Open `.mcp-telemetry/report.md`.
4. Copy the section `Paste this report into ChatGPT for optimization advice`.
5. Paste it into ChatGPT and ask for concrete tool-level changes to reduce token usage.

### Deep tests and benchmarks

```bash
npm run test:all
npm run benchmark:workflow
npm run deep-test:report
```

- `npm run test` — core tool + telemetry tests against fixture repos
- `npm run test:edge` — edge cases and env fallbacks
- `npm run test:security` — path safety and log hardening
- `npm run test:benchmark` — output budget env tests
- `npm run benchmark:workflow` — realistic repo-discovery simulation
- `npm run deep-test:report` — writes `.mcp-telemetry/deep-test-report.md`

Interpret `.mcp-telemetry/deep-test-report.md` before the Cursor A/B test. It validates correctness and compactness, not real Cursor/Codex savings.

### Run a Cursor A/B test

See [docs/cursor-ab-test.md](docs/cursor-ab-test.md) for a step-by-step guide to compare Cursor token usage with MCP disabled vs enabled. Do not assume savings until you complete both sides of that test.

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


## Quick start

1. `npm install`
2. `npm run build`
3. Enable the MCP server in Cursor
