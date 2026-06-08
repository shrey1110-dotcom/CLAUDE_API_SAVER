# Graphify head-to-head protocol

Last updated: 2026-06-06

Compare **diagnostic compression** and **real client usage** on the same repo, task, and client settings. Do **not** claim repo-context-mcp beat Graphify without completing this protocol with measured results.

## Background

| Metric | Graphify public reference | repo-context-mcp |
| --- | --- | --- |
| Diagnostic compression | ~71.5× on Karpathy mixed corpus (raw corpus tokens ÷ graph query tokens) | `npm run benchmark:compression` |
| Real A/B savings | Not automatically comparable | `ab:real-check` with parsed client usage |

Diagnostic compression is **not** proof of real agent billing reduction.

## Three-way comparison

Run all arms with the **same**:

- Repository checkout and commit
- Task prompt (start with `auth-discovery`)
- Client and model
- Fresh sessions (no shared history)
- 3 repeats per arm
- Quality rubric (expected files/concepts)
- Token accounting method

| Arm | Description |
| --- | --- |
| **A** | No context — baseline agent run without MCP/repo tools |
| **B** | Graphify — graph build + closest equivalent query for the task |
| **C** | repo-context-mcp `context_broker_locked` — `context_status` + `context_pack` only |

## Metrics to record

### Diagnostic compression (Graphify-comparable shape)

```text
full_repo_compression_ratio = full_raw_repo_tokens / compact_context_tokens
relevant_files_compression_ratio = relevant_raw_file_tokens / compact_context_tokens
```

For repo-context-mcp arm C, compact context = `context_pack` output at budget 1000.

For Graphify arm B, compact context = measured graph/query output tokens for the task.

### Real client usage (proof-grade)

```text
combined_total = client_total_tokens + MCP_or_tool_output_tokens
```

Record **parsed** usage from client billing fields. Never infer from transcript length.

### Quality

- Expected files found (auth-discovery: 5/5 fixture paths)
- Expected concepts present
- Answer quality score (task rubric)
- Tool-loop risk (call counts, forbidden tools in locked mode)

### Operational

- Setup steps and time
- Config files touched (repo-context-mcp uses isolated example configs; do not edit tracked source)
- Repeat stability (mean, median, outlier warning)

## repo-context-mcp commands (arm C)

```bash
npm install && npm run build && npm run graph:build && npm run context:build
npm run benchmark:compression
npm run ab:codex:plan   # or ab:claude:plan for Claude
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode no_mcp --repo . --task auth-discovery --repeat 3 --yes
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --task auth-discovery --repeat 3 --yes
npm run ab:codex:ingest && npm run ab:codex:report && npm run ab:real-check
```

## Graphify commands (arm B) — manual

Graphify installs vary. If `graphify` is on PATH:

```bash
which graphify
graphify --help
```

Then run the closest equivalent for your install:

1. Build/index the same repo
2. Run an auth-discovery-style query (find authentication, login, session logic)
3. Capture output token estimate (chars ÷ 4 or tokenizer if available)
4. Record quality against the same 5 expected fixture files

Write results to `.mcp-benchmarks/graphify-head-to-head-report.md`. If Graphify is not installed, mark **NOT_RUN**.

```bash
npm run benchmark:graphify-head-to-head
```

## Verdict rules

| Claim | Allowed when |
| --- | --- |
| Diagnostic compression ratio for repo-context-mcp | `benchmark:compression` report exists |
| Real savings for a client/task | `ab:real-check` → `PROVEN_SAVINGS_STABLE` |
| Better than Graphify | Same-repo same-task head-to-head shows lower real combined tokens **and** equal/better quality **and** stable repeats |

## Non-claims

- repo-context-mcp has **not** beaten Graphify head-to-head yet
- Codex `PROVEN_SAVINGS_STABLE` does not imply Graphify superiority
- Graphify 71.5× is a **different corpus and metric** — cite it as reference only
- Do not confuse diagnostic compression with universal agent savings

## Related

- [../benchmarks.md](../benchmarks.md)
- [../proofs/codex-auth-discovery-locked.md](../proofs/codex-auth-discovery-locked.md)
- [../product-status.md](../product-status.md)
