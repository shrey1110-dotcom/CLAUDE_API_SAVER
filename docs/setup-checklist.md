# Setup checklist

Follow these steps to use repo-context-mcp in a target repository.

## 1. Clone and install

```bash
git clone <your-repo-url>
cd repo-context-mcp
npm install
```

## 2. Build

```bash
npm run build
```

## 3. Index your project

From the repository you want agents to analyze (often the same repo or a sibling checkout):

```bash
cd /path/to/your-project
/path/to/repo-context-mcp/npm run graph:build --prefix /path/to/repo-context-mcp
```

Or install repo-context-mcp in the project and run from there:

```bash
npm run graph:build
npm run context:build
```

## 4. Verify

```bash
npm run doctor
```

Expect graph cache and context capsules to show **OK**.

## 5. Configure your MCP client

Pick one:

- [Cursor](client-configs/cursor.md)
- [Codex](client-configs/codex.md)
- [Claude Code](client-configs/claude-code.md)
- [Claude Desktop](client-configs/claude-desktop.md)
- [Generic stdio](client-configs/generic-stdio.md)

Use the compact env block from the client doc. Point `command` / `args` at `dist/index.js` (or `repo-context-mcp` if installed globally).

## 6. Reload the client

Restart or reload MCP in your client so the server connects.

## 7. Run a benchmark (optional)

```bash
npm run benchmark:context
```

This measures MCP output size only — not real client billing.

## 8. Run an A/B test (recommended)

Use a template from [ab-test-templates/](ab-test-templates/) and follow [multi-client-ab-tests.md](multi-client-ab-tests.md).

Record client usage with and without MCP before claiming savings.

For guided runs, use [ab-testing.md](ab-testing.md).
