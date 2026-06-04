# Postmortem: Codex full context_broker A/B failure

Generated: 2026-06-05

## 1. Executive summary

**What failed:** Real Codex A/B test in full `context_broker` mode (D1) increased end-to-end token usage versus the `no_mcp` baseline. Codex entered a tool exploration loop using graph and symbol tools after `context_pack`.

**Why it matters:** The product hypothesis is that compact MCP context reduces *total* agent tokens. This run proved the opposite for Codex when too many tools were exposed.

**Were savings proven?** **No** for full `context_broker` (D1). Full `context_broker` is **not** a valid Codex savings proof mode. Locked `context_broker_locked` (only `context_status` + `context_pack`) is the recommended proof path. Locked auth-discovery proof later reached **`PROVEN_SAVINGS_STABLE`** — see [proofs/codex-auth-discovery-locked.md](../proofs/codex-auth-discovery-locked.md).

## 2. Test setup

| Item | Value |
| --- | --- |
| Client | Codex CLI |
| Task | auth-discovery |
| Baseline | `no_mcp` — 3 real repeats |
| Failed mode | `context_broker` (full tool surface) |
| Proof rule | `client_total_with_mcp + MCP_output_tokens < client_total_without_mcp` with equal/better quality |

### no_mcp baseline (valid)

| Repeat | Client tokens |
| ---: | ---: |
| 1 | 210,298 |
| 2 | 450,685 |
| 3 | 273,530 |
| Mean | 311,504 |
| Median | 273,530 |

## 3. Observed failure

Full `context_broker` Codex usage was worse than `no_mcp` on combined tokens. One repeat exploded to **454,563** client tokens.

Failed MCP telemetry (`.mcp-ab-tests/failed-runs/codex-full-context-logs.jsonl`):

| Tool | Calls | Role |
| --- | ---: | --- |
| `context_status` | 3 | Expected once |
| `context_pack` | 5 | Expected once |
| `graph_query` | 4 | Fallback — over budget |
| `graph_symbol` | 12 | Graph traversal loop |
| `graph_neighbors` | 13 | Graph traversal loop |
| `get_symbol_context` | 22 | Symbol verification loop |
| **Total MCP calls** | **59** | Budget failure (>10) |
| **MCP output tokens** | **~15,235** | Moderate |

**Route drift:** After the first `context_pack`, Codex began calling `get_symbol_context`, then `graph_symbol` / `graph_neighbors` repeatedly instead of answering from the pack.

## 4. Root cause analysis

| Cause | Applies |
| --- | --- |
| Too many exposed tools | **Yes** — full profile exposes graph, symbol, search tools |
| Weak routing constraints | **Yes** — prompt allowed fallback without hard caps |
| Graph traversal loop | **Yes** — `graph_symbol` + `graph_neighbors` repeated |
| Symbol verification loop | **Yes** — `get_symbol_context` × 22 |
| Fallback tools too available | **Yes** |
| Codex tool-choice variance | **Yes** — client-side exploration |
| Full context_broker unsafe for Codex proof | **Yes** |

**Primary conclusion:** The bottleneck was **Codex client tool-loop behavior**, not MCP output size alone (~15k MCP tokens vs hundreds of thousands of client tokens).

## 5. Evidence from logs

Analyze with:

```bash
npm run analyze:failed-codex
```

Key observations:

- `context_pack` called **5×** instead of 1
- `graph_symbol` **12×**, `graph_neighbors` **13×**
- `get_symbol_context` **22×**
- Total MCP output ~**15k** while Codex client tokens exploded on outlier repeat
- MCP telemetry alone does **not** prove savings

## 6. Fixes already implemented

- `MCP_TOOL_PROFILE=codex_locked` — exposes only `context_status` + `context_pack`
- `context_broker_locked` A/B mode and locked Codex config
- `benchmark:context-locked` — 2 calls, ~598 MCP tokens, 5/5 expected files
- `context_pack` recall fix — all 5 auth/session fixture files in benchmark
- Stricter `context_broker` prompt with hard fallback budgets
- `assessContextBrokerToolLoop` — detects tool-loop failures in reports/compare
- `npm run analyze:failed-codex` — failed telemetry postmortem analyzer
- `npm run codex:doctor` / `codex:proof:locked:instructions` — local proof runbook
- Proof tooling: `ab:ingest-codex`, `ab:proof-report`, `ab:real-check`

## 7. Remaining blockers

- Codex CLI not available in CI/agent environment (`ENOENT`)
- Need **3 fresh post-recall-fix** `context_broker_locked` repeats
- Need real Codex usage parsed per repeat
- Need quality **≥ 9** and **5/5** expected files
- Stale locked repeat (pre-recall-fix, 3/5 files) must **not** be used as proof

## 8. Recommended next experiment

1. **Do not** rerun full `context_broker` as a Codex savings proof.
2. **Do not** rerun `no_mcp` (baseline is valid).
3. On a local machine with Codex CLI:

```bash
npm run codex:proof:locked:instructions
```

4. Compare mean/median **combined** tokens (client + MCP) vs `no_mcp`.
5. Require `ab:real-check` → `PROVEN_SAVINGS_STABLE` before claiming savings.

## 9. What not to do

- Do not expose graph/search/symbol tools to Codex for savings proof
- Do not add more MCP tools to locked mode
- Do not claim savings from telemetry or benchmarks alone
- Do not use the stale locked repeat as proof
- Do not ignore quality (5/5 files, score ≥ 9)
