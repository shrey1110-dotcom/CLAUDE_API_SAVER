# External Claude Code tester handoff

Last updated: 2026-06-06

You are running the **Claude auth-discovery locked A/B proof** for [repo-context-mcp](https://github.com/shrey1110-dotcom/CLAUDE_API_SAVER). Your job is to execute the proof pipeline on a machine with **Claude Code CLI** installed. **Do not edit tracked repo files.** Local artifacts under `.mcp-ab-tests/` and `.mcp-telemetry/` are expected and gitignored.

## Current product status

| Item | Status |
|------|--------|
| Codex locked proof | `PROVEN_SAVINGS_STABLE` (scoped; Codex only) |
| Claude locked proof | `NOT_STARTED` |
| Claude savings claim | **Not allowed** until `ab:claude:real-check` returns `PROVEN_SAVINGS_STABLE` |

---

## 1. Clone the repo

```bash
git clone git@github.com:shrey1110-dotcom/CLAUDE_API_SAVER.git
cd CLAUDE_API_SAVER
git checkout clean-main
```

HTTPS alternative:

```bash
git clone https://github.com/shrey1110-dotcom/CLAUDE_API_SAVER.git
cd CLAUDE_API_SAVER
```

---

## 2. Setup

```bash
npm install
npm run build
npm run graph:build
npm run context:build
```

Optional sanity check (should pass on a healthy clone):

```bash
npm run test:all
npm run release:check
```

---

## 3. Claude CLI check

```bash
which claude
claude --version
```

If `claude` is not on PATH:

```bash
npm run ab:claude:doctor -- --claude-bin /absolute/path/to/claude
```

Doctor exits `0` only when Claude CLI, build, graph cache, context capsules, and locked config files are all present. **Claude savings are not proven** — doctor will say so.

---

## 4. Preflight

```bash
npm run ab:claude:doctor
npm run ab:claude:plan
```

`ab:claude:plan` creates `.mcp-ab-tests/current-plan.json` (gitignored). It prints the full pipeline and reminds you that real parsed usage is required.

### Locked MCP config (required for `context_broker_locked`)

The example file `examples/claude-code/ab/context-broker-locked.mcp.json` uses a placeholder path. **Do not edit tracked files.** Instead, create a local copy (gitignored path is fine):

```bash
REPO_ROOT="$(pwd)"
sed "s|/path/to/repo-context-mcp|${REPO_ROOT}|g" \
  examples/claude-code/ab/context-broker-locked.mcp.json \
  > .mcp-ab-tests/claude-locked.local.mcp.json
```

Verify the copy includes:

- `MCP_TELEMETRY=1`
- `MCP_OUTPUT_MODE=compact`
- `MCP_TOOL_PROFILE=codex_locked` (alias: `locked`)
- `MCP_MAX_RESPONSE_CHARS=9000`
- `MCP_DEFAULT_SEARCH_RESULTS=5`
- `MCP_TREE_DEPTH=2`
- `MCP_SYMBOL_CONTEXT_LINES=14`

Locked profile exposes **only** `context_status` and `context_pack`. It must **not** expose `repo_map`, `search_code`, `get_symbol_context`, `get_project_commands`, or any `graph_*` tools.

Pass your local config on locked runs:

```bash
--config .mcp-ab-tests/claude-locked.local.mcp.json
```

---

## 5. A/B commands (exact sequence)

Set adapter flag once per shell session:

```bash
export AB_ENABLE_CLAUDE_ADAPTER=1
```

Optional if Claude is not on PATH:

```bash
CLAUDE_BIN="--claude-bin /absolute/path/to/claude"
```

### 5a. No-MCP baseline — 3 repeats

```bash
npm run telemetry:clean
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- \
  --mode no_mcp \
  --repo . \
  --task auth-discovery \
  --repeat 3 \
  --yes \
  $CLAUDE_BIN
```

### 5b. Locked broker — 3 repeats

```bash
npm run telemetry:clean
AB_ENABLE_CLAUDE_ADAPTER=1 npm run ab:claude -- \
  --mode context_broker_locked \
  --repo . \
  --task auth-discovery \
  --repeat 3 \
  --yes \
  --config .mcp-ab-tests/claude-locked.local.mcp.json \
  $CLAUDE_BIN
```

### 5c. Ingest, report, real-check

```bash
npm run ab:claude:ingest
npm run ab:claude:report
npm run ab:claude:real-check
```

**Before live runs:** `ab:claude:report` shows `proof_verdict=NOT_STARTED` and `ab:claude:real-check` shows `ab_claude_real_check_status=INCOMPLETE_TEST`. That is correct.

---

## 6. Expected files (auth-discovery quality rubric)

The answer must reference these five fixture paths:

1. `tests/fixtures/simple-node-app/src/auth/login.ts`
2. `tests/fixtures/simple-node-app/src/auth/session.ts`
3. `tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts`
4. `tests/fixtures/monorepo-app/packages/api/src/session.service.ts`
5. `tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx`

Quality parity requires **5/5 expected files** and locked answer quality ≥ no-MCP quality.

---

## 7. Proof rule

All of the following must be true before any Claude savings statement:

1. **3 no-MCP repeats** with **real parsed Claude usage** (`usageParsed: true` on the result)
2. **3 locked repeats** with **real parsed Claude usage**
3. Locked routing uses **`context_status` + `context_pack` only** — no forbidden tools
4. `npm run ab:claude:real-check` returns **`PROVEN_SAVINGS_STABLE`**
5. Tokens are **never** inferred from transcript length

If Claude CLI output lacks usage fields, record real usage manually **before** real-check:

```bash
npm run ab:record -- --mode no_mcp --client-total-tokens <n>
npm run ab:record -- --mode context_broker_locked --client-total-tokens <n>
```

Until usage is parsed, verdict must remain **`INCOMPLETE_TEST`**.

---

## 8. Final response format (send back to repo owner)

Reply with this structure:

```text
Claude proof run complete

Environment:
- Claude version: <claude --version output>
- Repo commit: <git rev-parse --short HEAD>
- OS:

Preflight:
- ab:claude:doctor: pass/fail
- graph:build + context:build: pass/fail

Runs:
- no_mcp repeats completed: N/3, usage parsed: yes/no
- context_broker_locked repeats completed: N/3, usage parsed: yes/no
- Locked tools observed: <list or "context_status, context_pack only">
- Forbidden tools observed: <none or list>

Quality:
- no_mcp expected files: N/5, quality score:
- locked expected files: N/5, quality score:

Tokens (from parsed usage only):
- no_mcp mean/median client total:
- locked mean/median combined total:
- mean savings %:
- median savings %:

Gates:
- ab:claude:report proof_verdict=
- ab:claude:real-check status=

Artifacts (paths only, do not paste secrets):
- .mcp-ab-tests/claude-runs/<latest>/
- .mcp-ab-tests/reports/claude-auth-discovery-locked-report.md
```

---

## 9. Non-claims (mandatory)

- **Do not claim Claude savings** unless `ab:claude:real-check` returns `PROVEN_SAVINGS_STABLE`.
- **Do not** use full `context_broker` mode for this proof — use `context_broker_locked` only.
- **Do not** compare against Graphify or other tools without a dedicated head-to-head test.
- Codex `PROVEN_SAVINGS_STABLE` does **not** imply Claude savings.
- Benchmark MCP output size is **not** the same as real client token usage.

---

## Reference docs

- [Claude Code client config](../client-configs/claude-code.md)
- [Claude proof doc](../proofs/claude-auth-discovery-locked.md)
- [Claude A/B readiness checklist](claude-ab-readiness.md)
- [Product status](../product-status.md)
