# Benchmarks

Internal benchmarks measure **MCP tool output size** in this repository. They do **not** measure real client billing unless you run a separate A/B test.

## Commands

| Script | What it simulates |
| --- | --- |
| `npm run benchmark:workflow` | Legacy mix: `repo_map`, multiple `search_code`, outlines, symbol context |
| `npm run benchmark:graph` | Graph tools for an auth/login/session discovery task |
| `npm run benchmark:context` | **`context_status` + `context_pack`** (recommended path) |

Results are written under `.mcp-telemetry/` (e.g. `benchmark-workflow.json`, `benchmark-graph.json`, `benchmark-context.json`).

## Estimated tokens

Benchmarks use `estimated tokens ≈ UTF-8 character count / 4`. This is a rough proxy, not tokenizer-accurate.

## Current reference (this repo, after build)

| Benchmark | Approx. MCP output tokens | Notes |
| --- | ---: | --- |
| workflow | ~2,406 | Baseline tool mix |
| graph | ~1,613 | Four graph tool calls |
| context | ~668 | Two calls; primary broker path |

**MCP-only savings (context vs workflow):** about 1,738 fewer estimated MCP output tokens in this scripted scenario (~72% reduction vs workflow). This does **not** guarantee lower Cursor/Codex/Claude bills.

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
- Before claiming improvements in docs or marketing
