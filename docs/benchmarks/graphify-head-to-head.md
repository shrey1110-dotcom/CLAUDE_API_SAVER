# Graphify head-to-head protocol

Last updated: 2026-06-10

Compare **diagnostic compression** and **real client usage** on the same repo, task, and client settings. Do **not** claim repo-context-mcp beat Graphify without completing this protocol with measured results.

## Background

| Metric | Graphify public reference | repo-context-mcp |
| --- | --- | --- |
| Diagnostic compression | ~71.5× on Karpathy mixed corpus (raw corpus tokens ÷ graph query tokens) | `npm run benchmark:compression` |
| Real A/B savings | Not automatically comparable | `ab:real-check` with parsed client usage |

Diagnostic compression is **not** proof of real agent billing reduction.

## Executable harness

`npm run benchmark:graphify-head-to-head` is now a real harness, not a manual checklist only.

It always computes the **repo-context-mcp broker_locked diagnostic arm**:

- build `context_pack` for the selected task (budget 1000)
- estimate `context_pack` tokens
- score expected files/concepts with the Codex QA rubric
- report `full_repo_compression_ratio` and `relevant_files_compression_ratio`

It optionally scores a **Graphify arm** from:

- a saved output file (`--graphify-output-file`)
- an explicit query command (`--graphify-query-command`, with optional `--graphify-build-command`)
- or marks `NOT_RUN` / `NEEDS_QUERY_COMMAND` when Graphify is not executable without your install-specific command

Reports are written to:

- `.mcp-benchmarks/graphify-head-to-head-report.md`
- `.mcp-benchmarks/graphify-head-to-head-report.json`

### Example 1 — protocol only (repo-context diagnostic arm)

```bash
npm run benchmark:graphify-head-to-head -- --task auth-discovery
```

If Graphify is not on PATH, the report marks `GRAPHIFY_NOT_RUN`. If Graphify is on PATH but no query command is supplied, the report marks `GRAPHIFY_FOUND_NEEDS_EXPLICIT_QUERY_COMMAND`.

### Example 2 — score saved Graphify output

```bash
npm run benchmark:graphify-head-to-head -- \
  --task auth-discovery \
  --graphify-output-file .mcp-benchmarks/graphify-auth-output.txt
```

### Example 3 — run Graphify command

Graphify installs vary. Supply your install-specific build and query commands:

```bash
npm run benchmark:graphify-head-to-head -- \
  --task auth-discovery \
  --graphify-build-command "<GRAPHIFY_BUILD_COMMAND>" \
  --graphify-query-command "<GRAPHIFY_QUERY_COMMAND>"
```

Optional flags:

- `--repo .`
- `--graphify-bin graphify`

### Example 4 — recorded real-usage verdict

After you have same-repo same-task same-client measured repeats for both arms:

```bash
npm run benchmark:graphify-head-to-head -- \
  --task auth-discovery \
  --graphify-output-file .mcp-benchmarks/graphify-auth-output.txt \
  --graphify-combined-totals "100000,98000,102000" \
  --repo-context-combined-totals "62500,62495,62276" \
  --graphify-quality-scores "10,10,10" \
  --repo-context-quality-scores "10,10,10"
```

The harness computes mean/median combined tokens, reductions, and minimum quality per arm. A scoped comparative claim is allowed only when:

1. at least 3 repeats per arm
2. repo-context median combined tokens < Graphify median combined tokens
3. repo-context minimum quality ≥ Graphify minimum quality
4. both arms were run on the same repo/task/client/model (you must record this; the harness does not verify client/model automatically)

Conservative verdicts:

| Verdict | Meaning |
| --- | --- |
| `GRAPHIFY_NOT_RUN` | Graphify arm not executed |
| `GRAPHIFY_FOUND_NEEDS_EXPLICIT_QUERY_COMMAND` | Binary found; needs explicit command or saved output |
| `GRAPHIFY_RUN_FAILED` | Build/query command failed |
| `DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM` | Diagnostic scoring done; no scoped real-usage claim |
| `SCOPED_REAL_USAGE_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT_MCP` | Recorded same-task usage supports repo-context for this task only |

## Completed run — auth-discovery (Graphify Gemini, diagnostic only)

This repo completed one **diagnostic** head-to-head for `auth-discovery` using Graphify with the Gemini backend. This is **not** proof of real client usage superiority.

| Field | Value |
| --- | --- |
| Graphify package | `graphifyy` (PyPI) |
| Graphify version | `0.8.36` |
| Backend | Gemini |
| Mode | Full Graphify Gemini mode (semantic extraction + clustering) |
| Build command | `graphify . --backend gemini` |
| Report/HTML command | `graphify cluster-only . --backend=gemini` |
| Query command | `graphify query "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters."` |
| Graph stats | 1,552 nodes, 3,440 edges, 100 communities |
| `graphify-out/graph.json` | yes |
| `graphify-out/GRAPH_REPORT.md` | yes |
| `graphify-out/graph.html` | yes |
| Saved Graphify output | `.mcp-benchmarks/graphify-auth-output.txt` |
| Harness reports | `.mcp-benchmarks/graphify-head-to-head-report.md`, `.mcp-benchmarks/graphify-head-to-head-report.json` |

### Diagnostic scoring (auth-discovery)

| Metric | Graphify (Gemini query) | repo-context-mcp (`context_pack`) |
| --- | ---: | ---: |
| Output tokens | 785 | 705 |
| Expected files matched | 0/5 | 5/5 |
| Concepts matched | 2/6 | 5/6 |
| Quality score | 2/10 | 10/10 |
| Diagnostic winner | — | repo-context-mcp (higher quality score) |
| Harness verdict | `DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM` | same |
| Real Graphify usage totals | not recorded | — |
| Scoped superiority claim allowed | **no** | — |

**Allowed wording:**

> In a same-repo auth-discovery diagnostic run using Graphify 0.8.36 with Gemini backend, Graphify's query output matched 0/5 expected files with a 2/10 quality score, while repo-context-mcp matched 5/5 expected files with a 10/10 quality score using fewer compact-context tokens. This is diagnostic scoring only; no real Graphify client usage totals were recorded, so no superiority claim is allowed.

Install Graphify with Gemini support:

```bash
uv tool install "graphifyy[gemini,leiden]"
export GEMINI_API_KEY="..."   # set locally; never commit
graphify . --backend gemini
graphify cluster-only . --backend=gemini
graphify query "<task prompt>" > .mcp-benchmarks/graphify-auth-output.txt
npm run benchmark:graphify-head-to-head -- --task auth-discovery --graphify-output-file .mcp-benchmarks/graphify-auth-output.txt
```

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

For Graphify arm B, compact context = measured graph/query output tokens for the task (chars ÷ 4 in the harness).

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

## Skill-mode comparison (apples-to-apples)

For Graphify-style **query output vs repo-context pack output** with **no MCP**, use the skill-mode benchmark instead:

- Protocol: [skill-head-to-head.md](skill-head-to-head.md)
- Script: `npm run benchmark:skill-head-to-head`

MCP locked-mode totals are **not** comparable to Graphify query output without matching usage modes.

## Non-claims

- Diagnostic result alone **cannot** prove repo-context-mcp is better than Graphify
- Real-usage comparison requires the same repo, task, client, and model
- Equal or better quality is required before any scoped comparative claim
- No universal savings claim is allowed
- One auth-discovery **diagnostic** head-to-head with Graphify Gemini is complete; harness verdict is `DIAGNOSTIC_HEAD_TO_HEAD_COMPLETE_NO_REAL_USAGE_SUPERIORITY_CLAIM`
- repo-context-mcp has **not** beaten Graphify in **real client usage** unless a report reaches `SCOPED_REAL_USAGE_HEAD_TO_HEAD_SUPPORTS_REPO_CONTEXT_MCP` with recorded repeats
- Codex `PROVEN_SAVINGS_STABLE` does not imply Graphify superiority
- Graphify 71.5× is a **different corpus and metric** — cite it as reference only
- Do not confuse diagnostic compression with universal agent savings

## Related

- [../benchmarks.md](../benchmarks.md)
- [../proofs/codex-auth-discovery-locked.md](../proofs/codex-auth-discovery-locked.md)
- [../product-status.md](../product-status.md)
