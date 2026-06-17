# Benchmarks

Internal benchmarks measure **MCP tool output size** and **diagnostic compression** in this repository. They do **not** measure real client billing unless you run a separate A/B test.

## Two metric types (do not confuse them)

### Diagnostic compression (Graphify-comparable shape)

Compares raw repository token estimates to compact `context_pack` output:

```text
full_repo_compression_ratio = full_raw_repo_tokens / context_pack_tokens
relevant_files_compression_ratio = relevant_raw_file_tokens / context_pack_tokens
```

- Comparable in *shape* to Graphify-style claims (e.g. 71.5× on the Karpathy mixed corpus: raw corpus tokens ÷ graph query tokens)
- **Not proof** of real agent billing reduction
- Run: `npm run benchmark:compression`
- Output: `.mcp-benchmarks/compression-report.md` and `.mcp-benchmarks/compression-report.json`

> **Diagnostic compression is not proof of real agent savings.**

### Real A/B savings (proof-grade)

Compares parsed client usage:

```text
combined_total = client_total_tokens + MCP_estimated_output_tokens
```

- Requires no-MCP vs locked broker runs with **real parsed usage**
- Proof gate: `npm run ab:real-check` → `PROVEN_SAVINGS_STABLE`
- Only scoped Codex auth-discovery locked proof is complete in this repo today

## Commands

| Script | What it measures |
| --- | --- |
| `npm run benchmark:compression` | Diagnostic compression for 5 tasks (`context_pack` budget 1000) |
| `npm run benchmark:graphify-head-to-head` | Diagnostic head-to-head scoring (repo-context arm always; Graphify arm from saved output or commands) |
| `npm run benchmark:skill-head-to-head` | **Skill-mode** no-MCP Codex head-to-head: Graphify query output vs repo-context pack output |
| `npm run benchmark:best-effort-skill-head-to-head` | Best-effort Graphify (multi-query + report) vs repo-context pack |
| `npm run benchmark:context-efficiency` | Context size, files/1k tokens, quality/1k tokens (uses best-effort artifacts) |
| `npm run benchmark:token-floor` | Codex supplied-context floor: empty vs small vs repo-context vs Graphify |
| `npm run benchmark:end-to-end-ai-cost` | Codex-only vs end-to-end AI tokens (Graphify Gemini build when logged) |
| `npm run benchmark:skill-suite-head-to-head` | Five-task skill suite (no MCP, 3 repeats/arm) |
| `npm run self:prove-skill-head-to-head` | Self-iteration loop for skill-mode benchmark (preserves failed iterations) |
| `npm run self:prove-skill-suite-head-to-head` | Self-iteration wrapper for skill suite |
| `npm run benchmark:workflow` | Legacy mix: `repo_map`, multiple `search_code`, outlines, symbol context |
| `npm run benchmark:graph` | Graph tools for auth/login/session discovery |
| `npm run benchmark:context` | `context_status` + `context_pack` (recommended MCP path) |
| `npm run benchmark:context-locked` | Locked two-tool path only |

Results:

- Compression: `.mcp-benchmarks/`
- Other benchmarks: `.mcp-telemetry/` (e.g. `benchmark-workflow.json`, `benchmark-graph.json`, `benchmark-context.json`)

## Estimated tokens

Benchmarks use `estimated tokens ≈ UTF-8 character count / 4`. This is a rough proxy, not tokenizer-accurate.

## Context efficiency vs real Codex savings

On auth-discovery best-effort (this repo), repo-context context can be **~86–93% smaller** than Graphify best-effort context while listing **more expected files** and scoring higher on local quality-per-context-token metrics (`npm run benchmark:context-efficiency`).

Real Codex median totals often drop only **~7%** because Codex has a large fixed supplied-context overhead (~21k tokens). See `npm run benchmark:token-floor`.

End-to-end AI-token cost including Graphify Gemini first-run build is measured by `npm run benchmark:end-to-end-ai-cost`. Extraction Gemini tokens are reported as **unknown** when not logged; clustering tokens are parsed from `graphify-out/.graphify_analysis.json` when present.

## Current status vs Graphify

| Claim | Status |
| --- | --- |
| Real Codex auth-discovery savings | **Proven** — `PROVEN_SAVINGS_STABLE` (80.0% mean / 77.2% median) |
| Published diagnostic compression ratio vs Graphify 71.5× | **Not published** — run `benchmark:compression` per repo |
| Graphify auth-discovery diagnostic head-to-head (Gemini) | **Complete** — Graphify 0/5 files, 2/10 quality vs repo-context 5/5 files, 10/10 quality; harness `DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM` |
| Beat Graphify in real client usage | **Not proven** — no real Graphify usage totals recorded |

Do **not** claim repo-context-mcp beat Graphify overall. Diagnostic scoring alone does not allow a superiority claim. See [benchmarks/graphify-head-to-head.md](benchmarks/graphify-head-to-head.md).

## Compression tasks

`benchmark:compression` runs these tasks with `context_pack` budget 1000:

- `auth-discovery`
- `impact-analysis`
- `edit-planning`
- `architecture-discovery`
- `onboarding-map`

Each task reports file/concept coverage, output budget pass/fail, and both compression ratios.

## MCP-only reference (this repo, after build)

| Benchmark | Approx. MCP output tokens | Notes |
| --- | ---: | --- |
| workflow | ~2,406 | Baseline tool mix |
| graph | ~1,613 | Four graph tool calls |
| context | ~668 | Two calls; primary broker path |

**MCP-only savings (context vs workflow):** about 72% fewer estimated MCP output tokens in the scripted scenario. This does **not** guarantee lower client bills.

## Real client comparison

Success is only proven per client when:

```text
client_total_with_mcp + MCP_estimated_output_tokens < client_total_without_mcp
```

and answer quality is equal or better.

See [multi-client-ab-tests.md](multi-client-ab-tests.md) and [ab-test-templates/](ab-test-templates/).

## When to re-run

- After changing compact defaults or tool output shapes
- After major graph/context logic changes
- Before comparing diagnostic compression numbers in docs
- Before claiming improvements in docs or marketing

---

## Claude Supplied-Context Benchmark (2026-06-11)

**Scope:** Claude (Cursor IDE, Sonnet 4.5) evaluated both arms using supplied context only. No MCP in either arm. 3 repeats per arm per task.

**Commit:** `652981d` · **Branch:** `clean-main` · **Graphify:** v0.8.36 (Gemini, 1794 nodes/4105 edges/113 communities)

> Exact Claude token usage was **not captured** (running in Cursor IDE without API counter). Token comparison is INCOMPLETE.

### Context size (supplied tokens, estimated)

| Task | Graphify | repo-context | Reduction |
|---|---:|---:|---:|
| auth-discovery | ~1,730 | ~101 | 94.2% |
| impact-analysis | ~1,864 | ~58 | 96.9% |
| edit-planning | ~2,004 | ~61 | 97.0% |
| architecture-discovery | ~2,057 | ~87 | 95.8% |
| onboarding-map | ~2,177 | ~110 | 94.9% |
| **Median** | **~1,864** | **~87** | **95.3%** |

repo-context supplied **94–97% smaller context** on all 5 tasks.

### Quality (0–10, using existing repo rubrics)

| Task | Graphify | repo-context | Winner |
|---|---:|---:|---|
| auth-discovery | 6.0 | **10.0** | repo-context |
| impact-analysis | **10.0** | 0.0 | graphify |
| edit-planning | **10.0** | 2.0 | graphify |
| architecture-discovery | **10.0** | 8.3 | graphify |
| onboarding-map | 8.0 | **10.0** | repo-context |

**Quality wins: graphify 3/5, repo-context 2/5**

### Key findings

- **repo-context was smaller on all 5 tasks** (context-efficiency wins: 5/5).
- **Quality was mixed.** repo-context won where it returned exact file paths (auth-discovery, onboarding-map). Graphify won where repo-context returned empty context (impact-analysis, edit-planning) or sparse context (architecture-discovery).
- **repo-context failure mode:** The `context_pack` with `--budget 500` returned empty results for `impact-analysis` and `edit-planning` task queries. This is a real limitation, not hidden.
- **Graphify limitation:** `graphify query` is unavailable in v0.8.36; context was built from graph.json keyword extraction and community names. Some community labels were misleading (e.g. "Login Logic" community contained benchmark docs, not login code).

### Allowed claim from this benchmark

> "On a Claude supplied-context benchmark over the public repo, repo-context skill mode produced 94–97% smaller supplied context than Graphify best-effort on all 5 tasks. Quality was mixed: repo-context had higher quality on 2/5 tasks; Graphify on 3/5. Exact Claude token usage was not captured."

### Artifacts

- `.mcp-benchmarks/claude/iterations/iteration-1/` — preserved baseline run (this section)
- `.mcp-benchmarks/claude/runs/<task>/<arm>/repeat-N/` — individual run answers and quality scores

---

## Claude Supplied-Context Benchmark — Iteration 2, Claude profile (2026-06-11)

**Scope:** Same repo, same 5 tasks, same prompt template, same Graphify-derived contexts as iteration 1. The repo-context arm switched from the ultra skill pack (budget 500) to the new **Claude profile** (`repo-context pack "<task>" --profile claude`, budget 900). 3 repeats per arm per task; no MCP in either arm.

**Arm labels:** The Graphify arm is **"Graphify-derived context"** (graph.json keyword extraction + GRAPH_REPORT.md excerpts) because `graphify query` is unavailable/hanging in Graphify 0.8.36. It is not "graphify query best-effort".

> Exact Claude token usage was **not captured** (Cursor IDE, no API counter). Token comparison remains INCOMPLETE. No Claude token-savings claims are made.

### What changed (product fixes only; rubrics, prompts, and the Graphify arm unchanged)

1. Intent detection handles inflections ("impacted"), edit-planning phrasing, and architecture phrasing (previously these fell to a generic path that returned empty packs).
2. Stopword filtering in term expansion (a stopword like "do" could previously outrank real path matches).
3. Generic path-term anchor retrieval (camelCase/snake_case subtoken matching against graph file paths — no hardcoded paths).
4. Import-statement neighbor expansion (files imported by top matches join the pack).
5. Claude-profile markdown: file roles, import-derived relationship notes, module map, tests, validation commands, risk notes.

### Context size (same estimator both arms)

| Task | Graphify-derived | repo-context (claude profile) | Reduction |
|---|---:|---:|---:|
| auth-discovery | ~1,731 | ~210 | 87.9% |
| impact-analysis | ~1,865 | ~315 | 83.1% |
| edit-planning | ~2,005 | ~316 | 84.2% |
| architecture-discovery | ~2,058 | ~427 | 79.3% |
| onboarding-map | ~2,178 | ~419 | 80.8% |

Context-efficiency wins: **5/5** (all ≥ 79% smaller; gate was ≥ 70%).

### Quality (median of 3 repeats, same rubrics as iteration 1)

| Task | Graphify-derived | repo-context (claude profile) | Winner |
|---|---:|---:|---|
| auth-discovery | 8.0 | **10.0** | repo-context |
| impact-analysis | 10.0 | 10.0 | tie |
| edit-planning | 10.0 | 10.0 | tie |
| architecture-discovery | 10.0 | 10.0 | tie |
| onboarding-map | 6.0 | **10.0** | repo-context |

Quality: repo-context **equal or better on 5/5 tasks** (2 outright wins, 3 ties).

### Validation

- `npm run benchmark:claude-pack-quality` — local pre-Claude gate: PASS
- `npm run benchmark:audit` — incl. Claude-profile fairness/leakage audit: PASS
- `npm run self:prove-claude-skill-head-to-head` — verdict: STRETCH (iteration 2)
- Failed iteration 1 preserved at `.mcp-benchmarks/claude/iterations/iteration-1/`

### Allowed claim from this benchmark

> "On the Claude supplied-context benchmark over the public repo, repo-context's Claude profile produced 70%+ smaller supplied context than Graphify-derived context on 5/5 tasks, with equal or better quality on 5/5 tasks. Exact Claude token usage was not available from Cursor."

**Not allowed:** Claude token-savings claims; "beats Graphify overall"/universal superiority (single repo, 5 tasks, and Graphify's query mode could not be exercised); comparing these Claude scores to Codex scores as the same metric.

### Artifacts

- `.mcp-benchmarks/claude/summary.md` / `summary.json` — full iteration-2 report
- `.mcp-benchmarks/claude/quality-improvement/` — diagnosis, local gate, fairness audit
- `.mcp-benchmarks/claude/iterations/iteration-{1,2}/` — full iteration history
