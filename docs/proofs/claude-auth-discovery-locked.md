# Claude auth-discovery locked proof

Last updated: 2026-06-04

## Status

**NOT_STARTED**

Claude savings are **not proven** until this doc shows `PROVEN_SAVINGS_STABLE` with real parsed Claude usage from `ab:claude:real-check`.

## Test task

- Task: `auth-discovery`
- Mode: `context_broker_locked` with `MCP_TOOL_PROFILE=codex_locked` (alias: `locked`)
- Client: Claude Code CLI

## Proof rule

1. Three no-MCP repeats with **real parsed Claude usage**
2. Three locked repeats with **real parsed Claude usage**
3. Locked routing: `context_status` + `context_pack` only
4. `npm run ab:claude:real-check` returns `PROVEN_SAVINGS_STABLE`
5. Do not infer tokens from transcript length

## How to run

```bash
npm run ab:claude:doctor
npm run ab:claude:plan
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode no_mcp --repo . --task auth-discovery --repeat 3 --yes
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- --mode context_broker_locked --repo . --task auth-discovery --repeat 3 --yes
npm run ab:claude:ingest
npm run ab:claude:report
npm run ab:claude:real-check
```

## Non-claims

- Claude savings are **not proven**
- Full `context_broker` is not the Claude proof path
- Codex locked proof does not imply Claude savings
