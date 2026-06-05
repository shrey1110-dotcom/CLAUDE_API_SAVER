# Next benchmark phase

Last updated: 2026-06-05

Roadmap after the scoped Codex locked proof (`PROVEN_SAVINGS_STABLE` for auth-discovery).

## Current state

**Proven (scoped):** Codex CLI `0.137.0-alpha.4`, `auth-discovery`, `context_broker_locked`, this repo.

**Not proven:** Cursor, Claude, Gemini, other tasks, full `context_broker`, Graphify superiority, arbitrary repos.

## A. Harder task suite

Run each with the same proof gate: real client usage + quality parity + locked routing.

| Task | Description | Suggested mode |
|------|-------------|----------------|
| Impact analysis | Changed files / diff impact for a refactor | `impact_pack` + locked |
| Edit planning | Plan edits without implementing | `context_pack` locked |
| Architecture discovery | Map subsystems and dependencies | `context_pack` locked |
| Large repo onboarding | First-session orientation in a bigger codebase | `context_pack` locked |

For each task:

1. Define expected files/concepts and quality rubric
2. Run no-context or no-MCP baseline (3 repeats if possible)
3. Run locked broker (3 repeats)
4. Record with `ab:file-context:*` or client-specific A/B tooling
5. Require `ab:real-check` before any savings claim

## B. Client expansion

| Client | Method | Status |
|--------|--------|--------|
| Cursor | Manual usage panel + MCP locked profile | Not started |
| Claude Code | Project MCP + locked profile | Not started |
| Gemini CLI | MCP config + locked profile | Not started |
| Web LLMs (ChatGPT, Claude web, Gemini web) | `context:pack` file mode + `ab:file-context:*` | Tooling ready |

### Cursor proof checklist

```bash
npm run build && npm run graph:build && npm run context:build
# MCP_TOOL_PROFILE=codex_locked in Cursor MCP config
# Task: auth-discovery (same as Codex proof)
# Record: client input/output/total from usage panel
npm run ab:create -- --client cursor --repo . --task auth-discovery
npm run ab:record -- --mode no_mcp ...
npm run ab:record -- --mode context_broker_locked --use-telemetry
npm run ab:real-check
```

## C. Head-to-head benchmark

Three-way comparison on the **same repo, task, model/settings, repeat count, and quality rubric**:

| Arm | Description |
|-----|-------------|
| A | No context / no MCP baseline |
| B | Graphify or other graph/context tool |
| C | repo-context-mcp locked broker |

### Warning

**Do not claim superiority over Graphify until a head-to-head test is completed** with real usage totals and equal-or-better quality on both sides.

Record:

- Client tokens (real, not estimated)
- Quality score and expected files/concepts
- Tool routing evidence
- Combined totals (client + any tool output tokens)

## D. Proof gate (all future benchmarks)

Every new benchmark must pass:

1. **3 repeats** (or document why fewer)
2. **Real client usage** (not transcript length, not MCP telemetry alone)
3. **Quality parity** (equal or better vs baseline)
4. **Locked routing** for broker proof (`context_status` + `context_pack` only)
5. **`ab:real-check`** returns `PROVEN_SAVINGS_STABLE` or equivalent scoped verdict

Do not update marketing claims until the gate passes.

## E. What not to do

- Do not expose more tools in locked mode
- Do not use full `context_broker` for savings proof
- Do not claim universal savings from one Codex result
- Do not modify historical proof data
- Do not skip quality checks for higher token savings

## Related docs

- [docs/handoffs/cursor-continuation-after-codex-proof.md](handoffs/cursor-continuation-after-codex-proof.md)
- [docs/proofs/codex-auth-discovery-locked.md](proofs/codex-auth-discovery-locked.md)
- [docs/file-context-ab-test.md](file-context-ab-test.md)
- [docs/ab-testing.md](ab-testing.md)
