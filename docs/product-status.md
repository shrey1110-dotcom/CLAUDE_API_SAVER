# Product status

Last updated: 2026-06-05

## 1. Current product summary

**repo-context-mcp** is a universal MCP + CLI context broker for coding agents.

It builds deterministic local context intelligence from:

- code
- docs
- config
- metadata
- transcripts
- assets

It exposes:

- **`context_pack`** as the primary product interface
- **`impact_pack`** for change impact
- **locked profiles** for tool-loop prevention
- **CLI/file output** for any LLM (with or without MCP)

## 2. Current capabilities

| Area | Status |
|------|--------|
| MCP server (stdio) | Yes |
| `context_pack` / `impact_pack` | Yes |
| Knowledge graph + context capsules | Yes |
| Deterministic multimodal ingestion | Yes |
| Markdown/docs ingestion | Yes |
| PDF metadata nodes | Yes |
| Image/media metadata nodes | Yes |
| Transcript sidecar ingestion | Yes |
| Concept clusters | Yes |
| `context:pack` CLI/file mode | Yes |
| Query logs (`.repo-context-queries/`) | Yes |
| Self-iteration (`self:analyze`, `self:recommend`, `self:iterate`) | Yes |
| Locked profiles (`codex_locked`) | Yes |
| A/B testing tooling | Yes |
| Client docs (Codex, Cursor, Claude, Gemini, generic) | Yes |
| Telemetry | Yes |

## 3. What is proven

Only the following are supported claims:

- **Codex CLI auth-discovery locked proof:** `context_broker_locked` reached `PROVEN_SAVINGS_STABLE` on Codex CLI `0.137.0-alpha.4` for the `auth-discovery` task in this repo.
  - No-MCP baseline: 210,298 / 450,685 / 273,530
  - Locked combined: 62,509 / 62,495 / 62,276
  - Mean savings: 80.0%
  - Median savings: 77.2%
  - Quality: 9/10 vs 9/10
  - Expected files: 5/5
  - Routing: `context_status` + `context_pack` only
  - Verdict: `PROVEN_SAVINGS_STABLE`
- `benchmark:context-locked` passes in this repo
- `context_pack` finds **5/5** expected auth-discovery files in the locked benchmark
- `context:pack` generates a compact auth-discovery pack (~541 estimated output tokens under 1000 budget)
- Locked route uses only `context_status` + `context_pack` and avoids tool-loop patterns seen in full `context_broker` mode
- Failed Codex full-context run is diagnosed as **TOOL_LOOP_FAILURE** (59 MCP calls, graph/symbol loop)
- Deterministic multimodal ingestion works locally (no external APIs, no LLM summaries)

Proof details: [proofs/codex-auth-discovery-locked.md](proofs/codex-auth-discovery-locked.md) · Index: [proofs/README.md](proofs/README.md) · Report: `.mcp-ab-tests/reports/codex-locked-proof-report.md`

## 4. Not yet proven

Do **not** claim:

- Superiority over Graphify or any other tool
- Savings for Cursor, Claude, Gemini, or other clients
- Savings across all tasks
- Savings for full `context_broker` mode
- Multimodal extraction quality in large real-world repos
- Savings for arbitrary repositories or production codebases without running the same proof gate

## 5. Positioning

**repo-context-mcp is broker-first, not graph-first.**

- The graph is an **internal intelligence layer**
- **`context_pack` is the product interface**
- **Locked profiles** prevent agent over-query loops
- **A/B tooling** decides whether savings are real

Label: **experimental context compression infrastructure**.

Do not claim general token savings. The only allowed savings claim is the scoped Codex CLI auth-discovery locked proof above. Require users to run `ab:real-check` for their client/task.

## 6. Competitive note

We do not frame repo-context-mcp as a Graphify clone.

Tools like Graphify show the value of repository knowledge graphs, but **repo-context-mcp** focuses on broker-first delivery, locked routing, and proof-driven token evaluation.

## 7. Proof roadmap

| Step | Action | Status |
|------|--------|--------|
| 1 | Codex locked proof (`context_broker_locked`, 3 repeats, auth-discovery) | **Complete** — `PROVEN_SAVINGS_STABLE` |
| 2 | Run Cursor manual proof if usage numbers are available | Not started |
| 3 | Claude Code proof (`ab:claude:*` tooling + locked config) | Tooling ready — proof `NOT_STARTED` |
| 4 | Run Gemini CLI proof | Not started |
| 5 | Harder tasks: impact analysis, edit planning, architecture discovery, large repo onboarding | Not started |

## 8. Next head-to-head benchmark

Run a direct three-way benchmark with the same repo, task, model/settings, repeat count, quality rubric, and real usage totals:

- A: no context
- B: Graphify
- C: repo-context-mcp locked broker

## 9. Release recommendation

- **Label:** experimental
- **Claim:** context compression infrastructure with one scoped Codex CLI proof
- **Do not claim:** general token savings
- **Require:** `ab:real-check` per client/task before any savings statement

See also: [broker-first-context-strategy.md](broker-first-context-strategy.md), [product.md](product.md), [ab-testing.md](ab-testing.md), [handoffs/cursor-continuation-after-codex-proof.md](handoffs/cursor-continuation-after-codex-proof.md), [next-benchmark-phase.md](next-benchmark-phase.md).
