# ScopeKit npm publish confirmation

Verified: 2026-06-12 (local machine, public npm registry)

## 1. Package name

`scopekit`

## 2. Published version

`0.2.0` (only version on registry; `latest` dist-tag)

## 3. npm package URL

https://www.npmjs.com/package/scopekit

## 4. Registry verification summary

`npm view scopekit name version dist-tags bin license repository homepage --json`:

| Field | Value |
|-------|-------|
| name | `scopekit` |
| version | `0.2.0` |
| dist-tags.latest | `0.2.0` |
| bin | `scopekit`, `repo-context`, `repo-context-mcp` → `dist/index.js` |
| license | MIT |
| repository | `git+https://github.com/shrey1110-dotcom/CLAUDE_API_SAVER.git` |
| homepage | `https://github.com/shrey1110-dotcom/CLAUDE_API_SAVER#readme` |

`npm info scopekit`: 1 version published; tarball `scopekit-0.2.0.tgz`; unpacked size ~1.5 MB; dependencies `@modelcontextprotocol/sdk`, `zod`.

## 5. Global install verified

```bash
npm uninstall -g scopekit
npm install -g scopekit
```

- Binary: `/opt/homebrew/bin/scopekit`
- Installed version (from `node_modules/scopekit/package.json`): `0.2.0`

## 6. Setup command verified

```bash
scopekit setup --dry-run   # lists files to write, no changes
scopekit setup --yes         # creates repo-local skill files
```

## 7. npx command verified

```bash
npx scopekit --help
npx scopekit setup --dry-run
npx scopekit install claude --dry-run
npx scopekit pack "Find auth/session logic" --profile claude --format markdown
```

All succeeded. Registry `latest` is `0.2.0`; global install confirms `0.2.0`. CLI has no `--version` flag.

## 8. Core commands verified

| Command | Result |
|---------|--------|
| `scopekit --help` | OK — shows ScopeKit usage, profiles, legacy alias note |
| `scopekit status` | OK — JSON cache status (empty in fresh temp dir) |
| `scopekit setup --dry-run` | OK |
| `scopekit install claude --dry-run` | OK — would write `CLAUDE.md` |
| `scopekit install cursor --dry-run` | OK — would write `.cursor/rules/scopekit.mdc` |
| `scopekit install codex --dry-run` | OK — would write `AGENTS.md` |
| `scopekit install mcp --dry-run` | OK — would write `.scopekit/mcp-config.example.json` |
| `scopekit pack "Find auth/session logic" --profile claude --format markdown` | OK — markdown pack (minimal in empty repo) |
| `scopekit pack "Find auth/session logic" --profile ultra --format markdown` | OK — ultra pack |
| `scopekit query "Where is authentication handled?"` | OK — compact answer (0 files in empty repo) |

`scopekit index` was not required for query in the empty test repo; query returned a valid response without prior indexing.

## 9. Legacy aliases verified

| Alias | Result |
|-------|--------|
| `repo-context --help` | OK — prints rename notice to stderr: *"repo-context has been renamed to ScopeKit. Use \`scopekit ...\` going forward."* |
| `repo-context status` | OK — rename notice + JSON status |
| `repo-context pack "..." --profile claude --format markdown` | OK — rename notice + pack output |
| `repo-context-mcp --help` | OK — rename notice + help (no MCP stdio session started) |

## 10. Setup file creation verified

Test repo: `/tmp/scopekit-real-install-test` (`git init` + `scopekit setup --yes`)

Files created:

- `CLAUDE.md` — ScopeKit section; `scopekit pack "<task>" --profile claude`
- `AGENTS.md` — ScopeKit section; `scopekit pack "<task>" --profile ultra`
- `.cursor/rules/scopekit.mdc` — Cursor rule; `scopekit pack "<task>" --profile claude`
- `.scopekit/README.md` — ScopeKit quick commands
- `.scopekit/examples.md` — profile guidance
- `.scopekit/mcp-config.example.json` — created via `scopekit install mcp --yes`; uses `"command": "scopekit"`, `"args": ["mcp"]`

Also created: `.repo-context-queries/queries.jsonl` (query telemetry in empty repo).

Inspected generated instruction files: no secrets; all mention ScopeKit and correct pack/MCP commands.

## 11. Failures or limitations

- No `--version` CLI flag (not a publish failure; version confirmed via global `package.json` and registry).
- `pack` / `query` in an empty temp repo return minimal context (expected without `scopekit index .`).
- `repo-context-mcp` help only; MCP stdio server not smoke-tested (would hang without timeout).
- `scopekit status` suggests `npm run graph:build` / `context:build` in empty repos; bundled `scopekit index` is the intended path for end users.

## 12. Website / landing page

No website or landing page files were edited during this verification.

## 13. Secrets

No npm tokens, `.npmrc` contents, API keys, or other secrets were printed, written, committed, or published during verification.
