# Skill-mode head-to-head benchmark

Last updated: 2026-06-11

## Purpose

Compare **Graphify query output** vs **repo-context skill pack output** under the same no-MCP Codex workflow.

This is the apples-to-apples comparison for CLI/skill adoption:

- Graphify: `graphify query "<task>"` → paste output into Codex prompt
- repo-context: `repo-context pack "<task>" --budget 500 --format markdown` → paste output into Codex prompt

Neither arm mounts MCP tools.

## Related benchmarks

| Script | Measures |
| --- | --- |
| `benchmark:best-effort-skill-head-to-head` | Graphify multi-query + GRAPH_REPORT vs repo-context ultra pack |
| `benchmark:context-efficiency` | Context token reduction, files/1k, quality/1k |
| `benchmark:token-floor` | Codex fixed overhead vs context-dependent band |
| `benchmark:end-to-end-ai-cost` | Codex-only vs Gemini build + Codex totals |
| `benchmark:skill-suite-head-to-head` | Five QA tasks, 3 repeats/arm |

**Important:** Large context-size reduction does not imply proportional Codex total-token reduction. Codex has ~21k fixed supplied-context overhead (see token-floor).

## Commands

```bash
npm run graph:build
npm run context:build

# Generate outputs
graphify query "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters." \
  > .mcp-benchmarks/graphify-auth-output.txt

repo-context pack "Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters." \
  --budget 500 --format markdown --out .mcp-benchmarks/repo-context-auth-output.txt

# Run 3 Codex repeats per arm (real usage)
npm run benchmark:skill-head-to-head -- --codex-bin /path/to/codex

# Self-iteration loop (records failed iterations)
npm run self:prove-skill-head-to-head -- --codex-bin /path/to/codex
```

## Artifacts

- `.mcp-benchmarks/skill-head-to-head/summary.md`
- `.mcp-benchmarks/skill-head-to-head/summary.json`
- `.mcp-benchmarks/skill-head-to-head/iterations/iteration-N/summary.{md,json}`

## Verdict rules

A scoped superiority claim is allowed only when:

- repo-context **median client tokens** < Graphify **median client tokens**
- repo-context **minimum quality** ≥ Graphify **minimum quality**
- both arms use **no MCP**
- same Codex CLI, 3 repeats per arm
- parsed real usage exists
- no cross-contamination between arms

Allowed claim when passed:

> On auth-discovery in this repo, using Codex CLI with supplied context and no MCP tools, repo-context skill mode used X% fewer median tokens than Graphify query output with equal or better quality.

Otherwise:

> No scoped token-superiority claim is allowed.

## Non-claims

- MCP locked-mode totals are not comparable to this skill-mode benchmark.
- Diagnostic compression ratios are not proof of real client savings.
- Do not claim Graphify superiority unless this harness verdict allows it.

## Claude variant (supplied-context, Claude profile)

A Claude-specific variant exists alongside the Codex harness. It is a separate
metric and never comparable to the Codex numbers above.

- Commands:
  - `npm run benchmark:claude-pack-quality` — local pre-Claude gate: generates
    `repo-context pack --profile claude` packs for the 5 benchmark tasks, scores
    them with the shared rubrics (`src/benchmark/claudeTaskRubrics.ts`), and
    compares against the Graphify-derived contexts. Gates: quality ≥
    Graphify-derived on ≥4/5 tasks and ≥70% smaller context on every task.
  - `npm run benchmark:claude-skill-head-to-head` — writes prompts/contexts for
    3 repeats × 2 arms × 5 tasks, imports Claude answers from the run folders,
    and scores them.
  - `npm run self:prove-claude-skill-head-to-head` — iteration loop; writes
    `.mcp-benchmarks/claude/iterations/iteration-N/summary.{md,json}` and stops
    on SUCCESS (≥4/5 quality, ≥70% reduction) or STRETCH (5/5 quality).
- Arms: "Graphify-derived context" (graph.json keyword extraction +
  GRAPH_REPORT.md; `graphify query` unavailable/hanging in Graphify 0.8.36) vs
  `repo-context pack --profile claude` (budget 900).
- Fairness: `npm run benchmark:audit` includes `scripts/claude-fairness-audit.mjs`
  (no rubric paths in profile generation code, no rubric imports in generation
  code, no cross-arm contamination, identical prompt templates).
- Exact Claude token usage is not captured in Cursor; the Claude variant makes
  no token-savings claims. Latest result (2026-06-11, iteration 2): 70%+ smaller
  context on 5/5 tasks, equal-or-better quality on 5/5 tasks.
