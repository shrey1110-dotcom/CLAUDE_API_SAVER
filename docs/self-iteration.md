# Self-iteration loop

Deterministic improvement of **broker behavior** (`context_pack` ranking, synonyms, caps) based on measured failures from telemetry, A/B reports, and query logs.

**No LLM calls. No fake proof. Never weakens quality or proof thresholds.**

## Commands

```bash
npm run self:analyze
npm run self:recommend
npm run self:iterate
npm run self:iterate -- --apply-safe
```

## Inputs

- `.mcp-telemetry/logs.jsonl`
- `.mcp-ab-tests/reports/*.md`
- `.mcp-ab-tests/results/*.json`
- `.repo-context-queries/queries.jsonl`
- `.mcp-ab-tests/failed-runs/codex-full-context-logs.jsonl`

## Outputs

- `.mcp-self-improve/recommendations.md`
- `.mcp-self-improve/recommendations.json`
- `.mcp-self-improve/iteration-report.md`

## Recommendation classes

| Class | Meaning |
|-------|---------|
| `safe_auto` | May apply with `--apply-safe` (e.g. synonym config) |
| `needs_review` | Human review required |
| `do_not_auto_apply` | Never auto-apply (expose tools, claim savings, weaken thresholds) |

## Hard guardrails

`self:iterate` must **never**:

- Claim token savings
- Modify proof results or historical run data
- Delete failed evidence
- Expose more tools in locked mode
- Weaken quality/proof thresholds
- Call external APIs or LLMs

With `--apply-safe`, validation runs: `build`, `test:ab`, `benchmark:context-locked`, `release:check`.
