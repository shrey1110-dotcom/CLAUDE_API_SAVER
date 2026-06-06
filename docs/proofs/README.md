# Proof index

Scoped proof results for repo-context-mcp. Each proof applies only to its stated client, task, repo, and mode.

## Active proofs

### Codex auth-discovery locked

| Field | Value |
|-------|-------|
| Name | Codex auth-discovery locked proof |
| Client | Codex CLI `0.137.0-alpha.4` |
| Task | `auth-discovery` |
| Mode | `context_broker_locked` |
| Tool profile | `MCP_TOOL_PROFILE=codex_locked` |
| Verdict | `PROVEN_SAVINGS_STABLE` |

**Doc:** [codex-auth-discovery-locked.md](codex-auth-discovery-locked.md)

**Report:** `.mcp-ab-tests/reports/codex-locked-proof-report.md`

**Allowed claim:**

```text
repo-context-mcp context_broker_locked produced PROVEN_SAVINGS_STABLE on Codex CLI 0.137.0-alpha.4 for auth-discovery, reducing combined mean token usage by 80.0% and median token usage by 77.2% versus no MCP, with equal 9/10 quality and 5/5 expected files found.
```

**Limitations:**

- This repo only
- Auth-discovery task only
- Locked mode only (not full `context_broker`)
- Not proven for Cursor, Claude, Gemini, or other clients
- Not proven against Graphify or other tools

### Claude auth-discovery locked

| Field | Value |
|-------|-------|
| Name | Claude auth-discovery locked proof |
| Client | Claude Code CLI |
| Task | `auth-discovery` |
| Mode | `context_broker_locked` |
| Tool profile | `MCP_TOOL_PROFILE=codex_locked` (alias: `locked`) |
| Verdict | `NOT_STARTED` |

**Doc:** [claude-auth-discovery-locked.md](claude-auth-discovery-locked.md)

**Status:** Tooling ready (`ab:claude:*`). **Claude savings are not proven.**

## Failed runs (do not use as proof)

| Run | Verdict | Doc |
|-----|---------|-----|
| Codex full `context_broker` | `TOOL_LOOP_FAILURE` | [postmortem](../postmortems/codex-full-context-failure.md) |

## How to add a new proof

1. Run A/B with real client usage (3 repeats)
2. Use locked profile for broker proof (`context_status` + `context_pack` only)
3. Pass `npm run ab:real-check`
4. Add a scoped proof doc under `docs/proofs/`
5. Update this index with verdict, allowed claim, and limitations
6. Do not claim savings until `ab:real-check` passes

## Related

- [product-status.md](../product-status.md)
- [handoffs/cursor-continuation-after-codex-proof.md](../handoffs/cursor-continuation-after-codex-proof.md)
- [next-benchmark-phase.md](../next-benchmark-phase.md)
