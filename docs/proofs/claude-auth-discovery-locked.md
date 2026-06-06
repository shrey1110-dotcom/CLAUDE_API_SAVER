# Claude auth-discovery locked proof

Last updated: 2026-06-06

## Status

**NOT_STARTED**

Claude savings are **not proven** until this doc shows `PROVEN_SAVINGS_STABLE` with real parsed Claude usage from `ab:claude:real-check`.

## Test task

- Task: `auth-discovery`
- Prompt: find authentication, login, and session logic (do not edit files)
- Mode: `context_broker_locked` with `MCP_TOOL_PROFILE=codex_locked` (generic two-tool locked profile)
- Client: Claude Code CLI

## Expected files (quality rubric)

1. `tests/fixtures/simple-node-app/src/auth/login.ts`
2. `tests/fixtures/simple-node-app/src/auth/session.ts`
3. `tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts`
4. `tests/fixtures/monorepo-app/packages/api/src/session.service.ts`
5. `tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx`

Quality parity requires 5/5 expected files and locked score ≥ no-MCP score.

## Proof rule

1. Three no-MCP repeats with **real parsed Claude usage**
2. Three locked repeats with **real parsed Claude usage**
3. Locked routing: `context_status` + `context_pack` only (no graph/search/symbol tools)
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

If Claude CLI output lacks usage fields, record real usage manually with `npm run ab:record` before real-check.

## Current results

### No-MCP baseline

- Client total tokens: no data
- Combined total tokens: no data
- Repeats: 0/3
- Usage parsed: no
- Quality: -

### Locked mode

- Client total tokens: no data
- Combined total tokens: no data
- Repeats: 0/3
- Usage parsed: no
- MCP tokens (est.): -
- Tools used: -
- Forbidden tools: none
- Routing: inconclusive
- Quality: -

### Savings (only valid when usage parsed)

- Mean savings %: n/a
- Median savings %: n/a

## Verdict

- **NOT_STARTED**
- No Claude A/B runs recorded yet.

## Non-claims

- Claude savings are **not proven** unless verdict is `PROVEN_SAVINGS_STABLE`
- Do not use full `context_broker` for Claude proof
- Do not compare against Graphify without a head-to-head test
- Codex locked proof does not imply Claude savings
