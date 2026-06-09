# Cursor continuation after Codex proof

Last updated: 2026-06-10

Handoff for continuing **repo-context-mcp** in Cursor after the scoped Codex locked proof milestone.

## 1. Project identity

**repo-context-mcp** is a **broker-first context intelligence layer** for coding agents.

- Build deterministic local repo intelligence from code, docs, config, metadata, transcripts, and assets
- **`context_pack`** is the primary product interface
- Graph and multimodal data stay **internal**
- Locked profiles prevent agents from wandering through graph/search/symbol tools
- Support MCP, CLI, and file-output workflows
- Prove real token savings per client/task through A/B tests — never assume them

Primary MCP tools: `context_status`, `context_pack`, `impact_pack`.

Locked profile: `MCP_TOOL_PROFILE=codex_locked` → only `context_status` + `context_pack`.

## 2. Current capabilities

| Area | Status |
|------|--------|
| MCP server (stdio) | Yes |
| `context_pack` / `impact_pack` | Yes |
| Knowledge graph + context capsules | Yes |
| Deterministic multimodal ingestion | Yes |
| `context:pack` CLI/file mode | Yes |
| Query logs + self-iteration | Yes |
| Locked profiles (`codex_locked`) | Yes |
| A/B testing + file-context A/B | Yes |
| Codex adapter + failed-run analyzer | Yes |

## 3. Proven Codex savings milestone

| Field | Value |
|-------|-------|
| Client | Codex CLI `0.137.0-alpha.4` |
| Task | `auth-discovery` |
| Mode | `context_broker_locked` |
| Verdict | `PROVEN_SAVINGS_STABLE` |

### No-MCP baseline (3 repeats)

| Repeat | Client tokens |
|--------|--------------:|
| 1 | 210,298 |
| 2 | 450,685 |
| 3 | 273,530 |
| Mean | 311,504 |
| Median | 273,530 |

### Locked combined (client + MCP)

| Repeat | Combined |
|--------|---------:|
| 1 | 62,509 |
| 2 | 62,495 |
| 3 | 62,276 |
| Mean | 62,427 |
| Median | 62,495 |

Locked client tokens: 61,633 / 61,634 / 61,503. Locked MCP tokens: 876 / 861 / 773 (2,510 total).

Mean savings: **80.0%**. Median savings: **77.2%**.

### Routing (locked)

- `context_status` + `context_pack` only
- 6 MCP calls across 3 repeats (2 per repeat)
- No forbidden tools (`graph_query`, `graph_symbol`, `get_symbol_context`, etc.)

### Quality

- No-MCP quality: 9/10
- Locked quality: 9/10
- Expected auth files: **5/5**

## 4. Allowed proof claim

For this repo and this task only:

```text
repo-context-mcp context_broker_locked produced PROVEN_SAVINGS_STABLE on Codex CLI 0.137.0-alpha.4 for auth-discovery, reducing combined mean token usage by 80.0% and median token usage by 77.2% versus no MCP, with equal 9/10 quality, 5/5 expected files found, and routing limited to context_status + context_pack only.
```

## 5. Claims not allowed

- Not proven against Graphify or any other tool
- Not proven for Cursor, Claude, Gemini, or other clients
- Not proven for all tasks
- Not proven for full `context_broker` mode
- Not proven for arbitrary repositories or production codebases
- Not proven universally

Use: **"Proven for Codex CLI auth-discovery locked mode."** Not: **"Proven universally."**

## 6. Failed full-context lesson

Full `context_broker` mode failed with **TOOL_LOOP_FAILURE**:

| Tool | Calls |
|------|------:|
| `get_symbol_context` | 22 |
| `graph_neighbors` | 13 |
| `graph_symbol` | 12 |
| `context_pack` | 5 |
| `graph_query` | 4 |
| `context_status` | 3 |

~59 MCP calls, ~15,237 MCP output tokens. Codex wandered through graph/symbol tools instead of using `context_pack` once.

**Lesson:** The graph feeds `context_pack` internally. Do not expose graph/search/symbol tools for savings proof. **Locked mode is the proof path.**

See: [docs/postmortems/codex-full-context-failure.md](../postmortems/codex-full-context-failure.md)

## 7. Current validation status

Latest validation passed:

- `npm run build`
- `npm run graph:build` / `context:build`
- `npm run test:all`
- `npm run benchmark:context-locked`
- `npm run telemetry:context-test`
- `npm run context:pack`
- `npm run release:check`

Locked benchmark: 2 tools, ~596 MCP tokens, 5/5 auth files, no fallback tools.

## 8. Proof artifacts

| Artifact | Path |
|----------|------|
| Proof doc | [docs/proofs/codex-auth-discovery-locked.md](../proofs/codex-auth-discovery-locked.md) |
| Locked proof report | `.mcp-ab-tests/reports/codex-locked-proof-report.md` |
| Latest A/B report | `.mcp-ab-tests/reports/latest-ab-report.md` |
| Failed full-context logs | `.mcp-ab-tests/failed-runs/codex-full-context-logs.jsonl` |
| Locked transcript (repeat 1) | `.mcp-ab-tests/codex-runs/2026-06-05T05-53-59-079Z-context_broker_locked-1/transcript.md` |

## 9. Graphify diagnostic head-to-head (complete)

Auth-discovery diagnostic run with Graphify 0.8.36 (Gemini backend) is documented in [docs/benchmarks/graphify-head-to-head.md](../benchmarks/graphify-head-to-head.md). Harness verdict: `DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM`. No real Graphify client usage totals were recorded.

**Security:** A Gemini API key was exposed in chat during this run. Rotate it in [Google AI Studio](https://aistudio.google.com/apikey) and keep `GEMINI_API_KEY` in the local shell only — never commit or paste into docs.

## 10. Next recommended work

See [docs/next-benchmark-phase.md](../next-benchmark-phase.md).

1. **Real Graphify client usage head-to-head** — same repo/task/client/model, 3+ repeats, parsed totals
2. **Cursor manual proof** — same auth-discovery task, locked profile, real usage totals
3. **Harder task suite** — impact analysis, edit planning, architecture discovery
4. **Client expansion** — Claude Code, Gemini CLI

## 11. Key docs

- [docs/product-status.md](../product-status.md)
- [docs/broker-first-context-strategy.md](../broker-first-context-strategy.md)
- [docs/proofs/README.md](../proofs/README.md)
- [docs/codex-local-proof.md](../codex-local-proof.md)
- [docs/file-context-ab-test.md](../file-context-ab-test.md)
- [docs/ab-testing.md](../ab-testing.md)
