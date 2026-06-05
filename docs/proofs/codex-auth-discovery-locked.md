# Codex Auth-Discovery Locked Proof

Last updated: 2026-06-05

## Scope

This proof applies only to:

- Client: Codex CLI `0.137.0-alpha.4`
- Codex binary: `/Users/shreyanshsharma/.vscode/extensions/openai.chatgpt-26.602.30954-darwin-arm64/bin/macos-aarch64/codex`
- Repo/task: this repository, `auth-discovery`
- Mode: `context_broker_locked`
- Tool profile: `MCP_TOOL_PROFILE=codex_locked`
- Exposed MCP tools: `context_status`, `context_pack`
- Verdict: `PROVEN_SAVINGS_STABLE`

Do not generalize this result to other clients, other tasks, or full `context_broker` mode.

## Test Setup

The task was:

```text
Find where authentication, login, or user session logic is implemented in this repo.
Do not edit files. Give exact files, functions, and a short explanation of why each matters.
```

The no-MCP baseline was reused from the completed Codex A/B run. The locked run used three fresh Codex repeats.

## Proof artifacts

| Artifact | Path |
|----------|------|
| Locked proof report | `.mcp-ab-tests/reports/codex-locked-proof-report.md` |
| Latest A/B report | `.mcp-ab-tests/reports/latest-ab-report.md` |
| Locked transcript (repeat 1) | `.mcp-ab-tests/codex-runs/2026-06-05T05-53-59-079Z-context_broker_locked-1/transcript.md` |
| Proof index | [proofs/README.md](README.md) |

## Results

| Metric | No MCP | Locked broker |
| --- | ---: | ---: |
| Repeat 1 | 210,298 | 62,509 |
| Repeat 2 | 450,685 | 62,495 |
| Repeat 3 | 273,530 | 62,276 |
| Mean | 311,504.33 | 62,426.67 |
| Median | 273,530 | 62,495 |
| Mean savings | - | 80.0% |
| Median savings | - | 77.2% |
| Quality | 9/10 | 9/10 |
| Expected files found | 5/5 | 5/5 |

Locked Codex client-token repeats before MCP output were:

- 61,633
- 61,634
- 61,503

Locked MCP output tokens were:

- 876
- 861
- 773

Total locked MCP output tokens: 2,510.

## Routing Evidence

Locked mode used only:

- `context_status`
- `context_pack`

Forbidden tools were absent:

- `graph_query`
- `graph_symbol`
- `graph_neighbors`
- `graph_paths`
- `repo_map`
- `search_code`
- `get_symbol_context`
- `get_project_commands`

Total MCP calls across three repeats: 6.

Per repeat:

- `context_status`: 1
- `context_pack`: 1

## Quality Evidence

Both no-MCP and locked mode scored 9/10 on the auth-discovery quality check.

Locked mode found all 5 expected files:

1. `tests/fixtures/simple-node-app/src/auth/login.ts`
2. `tests/fixtures/simple-node-app/src/auth/session.ts`
3. `tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts`
4. `tests/fixtures/monorepo-app/packages/api/src/session.service.ts`
5. `tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx`

## Allowed Claim

For this repo and this task only:

```text
repo-context-mcp context_broker_locked produced PROVEN_SAVINGS_STABLE on Codex CLI 0.137.0-alpha.4 for auth-discovery, reducing combined mean token usage by 80.0% and median token usage by 77.2% versus no MCP, with equal 9/10 quality and 5/5 expected files found.
```

## Not Yet Proven

The following claims are not supported by this proof:

- Not proven against Graphify.
- Not proven for Cursor, Claude, Gemini, or other clients.
- Not proven for all tasks.
- Not proven for full `context_broker` mode.
- Not proven for arbitrary repositories or larger production codebases.

## Next Head-To-Head Benchmark

Run a direct three-way benchmark:

- A: no context
- B: Graphify
- C: repo-context-mcp locked broker

Use the same repo, task, model/settings, repeat count, quality rubric, and real client usage totals for all three modes.

