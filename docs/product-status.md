# Product status

Last updated: 2026-06-11

## 1. Current product summary

**repo-context** is a coding-agent context skill and CLI context broker with **optional MCP** support.

Default consumer workflow: `repo-context query` / `repo-context pack` (skill/CLI mode). MCP (`repo-context mcp`) is optional for live tool access.

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

## 4. Diagnostic compression vs real A/B savings

| Metric | What it measures | Proof grade? |
| --- | --- | --- |
| **Diagnostic compression** | `full_raw_repo_tokens / context_pack_tokens` (Graphify-comparable shape) | No — run `npm run benchmark:compression` |
| **Real A/B savings** | Parsed no-MCP vs locked broker client usage + MCP output | Yes — only when `ab:real-check` passes |

- repo-context-mcp has **proven real Codex savings** for auth-discovery (`PROVEN_SAVINGS_STABLE`)
- repo-context-mcp does **not** yet have a published diagnostic compression ratio benchmarked against Graphify's 71.5× Karpathy corpus claim
- One **diagnostic** Graphify Gemini head-to-head for auth-discovery is complete (Graphify 0.8.36): Graphify query 785 tokens, 0/5 files, 2/10 quality; repo-context `context_pack` 705 tokens, 5/5 files, 10/10 quality. Harness verdict: `DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM`. MCP-mode real usage comparison: no superiority claim.
- **Skill-mode** head-to-head (auth-discovery, no MCP, supplied context, Codex CLI 0.137.0-alpha.4): verdict `SCOPED_SKILL_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT`. Graphify median client tokens 22,212; repo-context median 21,371; quality 3–4/10 vs 10/10. **Scoped claim allowed** for this benchmark only.
- **Best-effort skill head-to-head** (auth-discovery): repo-context context ~88% smaller than Graphify best-effort; local quality 9/10 vs 3/10; Codex median reduction ~7.3% (token-floor explains fixed overhead). Context-efficiency and end-to-end AI-cost benchmarks: `benchmark:context-efficiency`, `benchmark:token-floor`, `benchmark:end-to-end-ai-cost`.
- **Claude supplied-context benchmark** (2026-06-11, 5 tasks, Graphify v0.8.36 Gemini, 3 repeats/arm, no MCP): repo-context supplied context was **94–97% smaller** than Graphify best-effort on all 5 tasks (median 95.3% reduction). Quality: repo-context 2/5 tasks (auth-discovery, onboarding-map); Graphify 3/5 tasks (impact-analysis, edit-planning, architecture-discovery). Exact Claude token usage not captured (Cursor IDE, no API counter). Context-efficiency claim allowed; quality claim is mixed; Claude token-savings claim NOT ALLOWED. See `.mcp-benchmarks/claude/summary.md`.

See [benchmarks.md](benchmarks.md), [benchmarks/graphify-head-to-head.md](benchmarks/graphify-head-to-head.md), and [benchmarks/skill-head-to-head.md](benchmarks/skill-head-to-head.md).

## 5. Not yet proven

Do **not** claim:

- Universal superiority over Graphify outside the scoped skill-mode benchmark
- Savings for Cursor, Claude, Gemini, or other clients
- Savings across all tasks
- Savings for full `context_broker` mode
- Multimodal extraction quality in large real-world repos
- Savings for arbitrary repositories or production codebases without running the same proof gate

## 6. Positioning

**repo-context is a coding-agent context skill with optional MCP.**

- **Default workflow:** CLI/skill mode (`repo-context query`, `repo-context pack`)
- **Optional:** MCP live tools (`repo-context mcp`)
- The graph is an **internal intelligence layer**
- **`context_pack` / skill pack output is the product interface**
- **Locked profiles** prevent agent over-query loops
- **A/B tooling** decides whether savings are real

Label: **context skill + optional MCP broker**.

Do not claim general token savings. The only allowed savings claim is the scoped Codex CLI auth-discovery locked proof above. Require users to run `ab:real-check` for their client/task.

## 7. Competitive note

We do not frame repo-context-mcp as a Graphify clone.

Tools like Graphify show the value of repository knowledge graphs, but **repo-context-mcp** focuses on broker-first delivery, locked routing, and proof-driven token evaluation.

## 8. Proof roadmap

| Step | Action | Status |
|------|--------|--------|
| 1 | Codex locked proof (`context_broker_locked`, 3 repeats, auth-discovery) | **Complete** — `PROVEN_SAVINGS_STABLE` |
| 2 | Run Cursor manual proof if usage numbers are available | Not started |
| 3 | Claude Code proof (`ab:claude:*` tooling + locked config) | Tooling ready — proof `NOT_STARTED` |
| 4 | Run Gemini CLI proof | Not started |
| 5 | Harder tasks: impact analysis, edit planning, architecture discovery, large repo onboarding | Not started |

## 9. Graphify head-to-head status

| Step | Status |
| --- | --- |
| Diagnostic auth-discovery (Graphify Gemini vs repo-context `context_pack`) | **Complete** — no superiority claim |
| Real client usage head-to-head (same repo/task/client/model, 3+ repeats/arm) | **Not started** |

Remaining for a proof-grade comparison: run arms A (no context), B (Graphify client), and C (repo-context locked broker) with parsed usage totals and equal/better quality gates.

## 10. Release recommendation

- **Label:** experimental
- **Claim:** context compression infrastructure with one scoped Codex CLI proof
- **Do not claim:** general token savings
- **Require:** `ab:real-check` per client/task before any savings statement

See also: [broker-first-context-strategy.md](broker-first-context-strategy.md), [product.md](product.md), [ab-testing.md](ab-testing.md), [handoffs/cursor-continuation-after-codex-proof.md](handoffs/cursor-continuation-after-codex-proof.md), [next-benchmark-phase.md](next-benchmark-phase.md).
