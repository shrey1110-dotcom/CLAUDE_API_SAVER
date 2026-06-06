# Claude A/B readiness checklist

Last updated: 2026-06-04

Codex-level readiness for Claude Code locked auth-discovery proof (tooling only — no live proof yet).

## Checklist

- [x] `ab:claude` script
- [x] `ab:claude:doctor` script
- [x] `ab:claude:plan` script
- [x] `ab:claude:ingest` script
- [x] `ab:claude:report` script
- [x] `ab:claude:real-check` script
- [x] Claude CLI adapter (`src/ab/adapters/claudeCli.ts`)
- [x] Claude binary support / `--claude-bin`
- [x] Claude usage parser (`src/ab/adapters/claudeUsage.ts`)
- [x] Claude run folder layout (`.mcp-ab-tests/claude-runs/`)
- [x] Claude ingest to shared A/B result schema
- [x] Claude proof report (`ab:claude:report`)
- [x] Claude locked MCP config (`examples/claude-code/ab/context-broker-locked.mcp.json`)
- [x] Claude locked docs updated
- [x] Claude proof doc starts `NOT_STARTED` / `INCOMPLETE_TEST`
- [x] Tests for safety gates
- [x] Tests for usage parsing
- [x] Tests for report generation
- [x] Tests for locked config
- [x] `release:check` coverage
- [x] No Claude savings claim in docs

## Not complete (requires live Claude runs)

- [ ] Three no-MCP repeats with parsed usage
- [ ] Three locked repeats with parsed usage
- [ ] `ab:claude:real-check` → `PROVEN_SAVINGS_STABLE`

## Live proof command

```bash
npm run ab:claude:doctor
npm run ab:claude:plan
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode no_mcp --repo . --task auth-discovery --repeat 3 --yes
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode context_broker_locked --repo . --task auth-discovery --repeat 3 --yes
npm run ab:claude:ingest
npm run ab:claude:report
npm run ab:claude:real-check
```

## Profile note

`MCP_TOOL_PROFILE=codex_locked` is the generic two-tool locked profile (`context_status` + `context_pack` only). Alias: `locked`.
