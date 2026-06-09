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
