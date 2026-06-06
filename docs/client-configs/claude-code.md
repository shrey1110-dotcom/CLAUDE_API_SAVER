# Claude Code

## Support

Claude Code supports project MCP configuration via `.mcp.json` or CLI MCP settings (see Anthropic docs for your version).

**Claude savings are not proven.** Real parsed usage is required before any savings claim.

## Full MCP example (exploratory)

```json
{
  "mcpServers": {
    "repo-context-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/repo-context-mcp/dist/index.js"],
      "env": {
        "MCP_TELEMETRY": "1",
        "MCP_OUTPUT_MODE": "compact",
        "MCP_MAX_RESPONSE_CHARS": "9000",
        "MCP_DEFAULT_SEARCH_RESULTS": "5",
        "MCP_TREE_DEPTH": "2",
        "MCP_SYMBOL_CONTEXT_LINES": "14"
      }
    }
  }
}
```

## Locked proof config (required for savings proof)

Use `examples/claude-code/ab/context-broker-locked.mcp.json`:

- `MCP_TOOL_PROFILE=codex_locked` (alias: `locked`)
- Exposes **only** `context_status` + `context_pack`
- Do **not** use full `context_broker` for Claude proof

## Verify

Run `context_status` in a fresh session after building graph and context in the repo.

## Recommended routing order (full toolset only)

1. `context_status`
2. `context_pack` with `budgetTokens: 1000`
3. `impact_pack` for changed-files/diff tasks
4. `get_symbol_context` only for exact symbol verification
5. `graph_query` / `graph_symbol` only if context is insufficient
6. `search_code` / `repo_map` only as last-resort fallback

For **locked proof**, only steps 1–2 are available by design.

## Automated A/B (Codex-level tooling)

```bash
npm run ab:claude:doctor
npm run ab:claude:plan
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode no_mcp --repo . --task auth-discovery --repeat 3 --yes
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode context_broker_locked --repo . --task auth-discovery --repeat 3 --yes
npm run ab:claude:ingest
npm run ab:claude:report
npm run ab:claude:real-check
```

Requires `AB_ENABLE_CLAUDE_ADAPTER=1` and `--yes`. Optional: `--claude-bin /absolute/path/to/claude`.

If Claude CLI output lacks usage fields, record real usage manually with `npm run ab:record` before `ab:claude:real-check`. **Never estimate tokens from transcript length.**

Proof doc: [proofs/claude-auth-discovery-locked.md](../proofs/claude-auth-discovery-locked.md)

## Manual fallback

1. Run no-MCP baseline.
2. Run locked broker (`context_status` + `context_pack` only).
3. Record token/cost/quality from Claude Code outputs.
4. `npm run ab:record` with real usage numbers.
5. `npm run ab:claude:report` and `npm run ab:claude:real-check`.
