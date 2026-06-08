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
| `npm run benchmark:graphify-head-to-head` | Graphify protocol report (runs Graphify only if installed) |
| `npm run benchmark:workflow` | Legacy mix: `repo_map`, multiple `search_code`, outlines, symbol context |
| `npm run benchmark:graph` | Graph tools for auth/login/session discovery |
| `npm run benchmark:context` | `context_status` + `context_pack` (recommended MCP path) |
| `npm run benchmark:context-locked` | Locked two-tool path only |

Results:

- Compression: `.mcp-benchmarks/`
- Other benchmarks: `.mcp-telemetry/` (e.g. `benchmark-workflow.json`, `benchmark-graph.json`, `benchmark-context.json`)

## Estimated tokens

Benchmarks use `estimated tokens ≈ UTF-8 character count / 4`. This is a rough proxy, not tokenizer-accurate.

## Current status vs Graphify

| Claim | Status |
| --- | --- |
| Real Codex auth-discovery savings | **Proven** — `PROVEN_SAVINGS_STABLE` (80.0% mean / 77.2% median) |
| Published diagnostic compression ratio vs Graphify 71.5× | **Not published** — run `benchmark:compression` per repo |
| Beat Graphify head-to-head | **Not proven** — see [benchmarks/graphify-head-to-head.md](benchmarks/graphify-head-to-head.md) |

Do **not** claim repo-context-mcp beat Graphify without a same-repo same-task head-to-head.

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
