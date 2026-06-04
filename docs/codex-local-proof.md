# Codex local proof runbook

Use this guide on a **local machine with Codex CLI installed** to run or verify the locked `context_broker_locked` A/B proof.

**Status:** Codex auth-discovery locked proof is **complete** (`PROVEN_SAVINGS_STABLE`). See [proofs/codex-auth-discovery-locked.md](proofs/codex-auth-discovery-locked.md).

**Codex CLI is not available in CI/agent environments.** Proof must run locally where `codex` is installed and authenticated.

**Do not use full `context_broker` for Codex savings proof.** The first real Codex test failed with a tool exploration loop (`TOOL_LOOP_FAILURE`). See `docs/postmortems/codex-full-context-failure.md`.

Do **not** claim savings from benchmarks, MCP telemetry alone, or synthetic data. Only real Codex usage numbers count.

## 1. Check Codex installation

```bash
which codex
codex --version
```

If `codex` is not on PATH:

```bash
npm run codex:doctor -- --codex-bin /absolute/path/to/codex
```

Run the doctor any time before a proof attempt:

```bash
npm run codex:doctor
```

Doctor checks:

- Codex on PATH and `codex --version`
- Optional `--codex-bin` path
- `examples/codex/ab/context-broker-locked.config.toml`
- build / graph / context readiness
- exact locked-repeat command

## 2. Preflight (repo ready)

```bash
npm run build
npm run graph:build
npm run context:build
npm run telemetry:clean
npm run telemetry:context-test
npm run benchmark:context-locked
```

Expected: only `context_status` + `context_pack`; no `repo_map`, `search_code`, or graph/symbol tools.

## 3. Create or reuse an A/B plan

If you do not already have a plan:

```bash
npm run ab:create -- --client codex --repo . --task auth-discovery
```

The **no_mcp baseline** is already complete (3 real repeats). Do **not** rerun `no_mcp` unless those result files are missing or corrupt.

## 4. Run no_mcp baseline (only if needed)

```bash
npm run telemetry:clean
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode no_mcp --repo . --repeat 3 --yes
```

If Codex is not on PATH:

```bash
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode no_mcp --repo . --repeat 3 --yes --codex-bin /absolute/path/to/codex
```

## 5. Run locked repeats (main proof step)

```bash
npm run telemetry:clean
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --repeat 3 --yes
```

With explicit binary:

```bash
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --repeat 3 --yes --codex-bin /absolute/path/to/codex
```

Locked mode exposes only `context_status` and `context_pack` (`MCP_TOOL_PROFILE=codex_locked`).

## 6. Resume after quota / usage limit

Partial runs are preserved under `.mcp-ab-tests/codex-runs/`. When quota resets:

1. Check doctor: `npm run codex:doctor`
2. Clean telemetry: `npm run telemetry:clean`
3. Rerun locked repeats (ingest picks up all valid run folders):

```bash
AB_ENABLE_CODEX_ADAPTER=1 npm run ab:codex -- --mode context_broker_locked --repo . --repeat 3 --yes
```

Or print the full command list:

```bash
npm run codex:proof:locked:instructions
```

## 7. Ingest and prove

```bash
npm run telemetry:report
npm run ab:ingest-codex
npm run ab:report
npm run ab:compare
npm run ab:proof-report
npm run ab:real-check
```

Proof report: `.mcp-ab-tests/reports/codex-locked-proof-report.md`

Proof doc: [proofs/codex-auth-discovery-locked.md](proofs/codex-auth-discovery-locked.md) · Index: [proofs/README.md](proofs/README.md)

## 8. What `PROVEN_SAVINGS_STABLE` requires

All of the following must be true:

1. **3 locked repeats** completed with real Codex usage parsed (or manually entered via `ab:record`).
2. **Routing correct**: only `context_status` + `context_pack`; no forbidden tools.
3. **Quality parity**: locked quality ≥ no_mcp quality; auth-discovery must find **5/5** expected files and score **≥ 9/10**.
4. **Savings rule** (combined = Codex client + MCP output):

   `locked_combined < no_mcp_client` for mean **and** median, each by **at least 5%**.

Expected auth-discovery files:

- `tests/fixtures/simple-node-app/src/auth/login.ts`
- `tests/fixtures/simple-node-app/src/auth/session.ts`
- `tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts`
- `tests/fixtures/monorepo-app/packages/api/src/session.service.ts`
- `tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx`

## 9. If Codex is missing

When `ab:codex` cannot spawn `codex` (ENOENT), you will see:

```
Codex CLI was not found.
Run: which codex
Or pass: --codex-bin /absolute/path/to/codex
You must run this on a machine with Codex CLI installed.
```

Run the proof on a machine where Codex CLI is installed and authenticated.

## 10. Other verdicts

| Verdict | Meaning |
| --- | --- |
| `INCOMPLETE_TEST` | Fewer than 3 locked repeats or missing usage |
| `QUALITY_REGRESSION` | Expected files missing or quality below baseline |
| `ROUTING_FAILURE` | Forbidden tools used or wrong MCP route |
| `INCREASED_USAGE_*` | Quality OK but combined tokens higher than no_mcp |
| `PROMISING_BUT_UNSTABLE` | Savings with high variance across repeats |

If locked mode loses despite good quality, do **not** add more tools. Test a harder task (impact analysis) next.
