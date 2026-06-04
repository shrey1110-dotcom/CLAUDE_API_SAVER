# File-context A/B test (universal, no MCP)

Test **repo-context-mcp** with any LLM — ChatGPT, Claude web, Gemini web, Cursor, Codex, or local models — by comparing answers **with** and **without** a generated context pack file.

No MCP server. No Codex CLI. Paste or upload the pack file.

## 1. Purpose

- Test whether `context_pack` improves answer **quality** and/or reduces client **effort** without MCP.
- This does **not** automatically prove token savings unless the client exposes token usage.
- It **can** prove quality and context usefulness (file recall, explanation clarity).

Record results in [ab-test-templates/file-context-template.md](ab-test-templates/file-context-template.md).

## 2. Setup

From the repo root:

```bash
npm run build
npm run graph:build
npm run context:build
npm run context:pack -- \
  --task "Find where authentication, login, or user session logic is implemented" \
  --budget 1000 \
  --format markdown \
  --out .context-packs/auth-discovery.md
```

Print full instructions anytime:

```bash
npm run ab:file-context:instructions
```

## 3. Test A — no context pack

**Prompt (exact):**

```text
Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.
```

**Record:**

| Field | Notes |
| --- | --- |
| Client / model | e.g. ChatGPT-4o, Claude 3.5, Gemini 2.0 |
| Answer | Paste or link |
| Files found | List paths mentioned |
| Expected files found | Count out of 5 (see below) |
| Quality | 1–10 |
| Token / cost | If the client shows usage |
| Time / effort | Wall clock or subjective effort |
| Notes | Repo access method (upload zip, paste tree, etc.) |

## 4. Test B — with context pack

Attach or paste `.context-packs/auth-discovery.md` (or upload alongside the repo).

**Prompt (exact):**

```text
Use the provided context pack. Do not ask to scan the repo unless the context pack says full file verification is needed.

Task:
Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.
```

Record the **same fields** as Test A.

## 5. Expected files (5)

Score how many of these appear in the answer:

1. `tests/fixtures/simple-node-app/src/auth/login.ts`
2. `tests/fixtures/simple-node-app/src/auth/session.ts`
3. `tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts`
4. `tests/fixtures/monorepo-app/packages/api/src/session.service.ts`
5. `tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx`

## 6. Verdict rules

| Verdict | Rule |
| --- | --- |
| **Quality win (B)** | B finds more expected files **or** gives clearly better explanations for the same files |
| **Token win (B)** | B total token/cost is lower than A **and** quality is equal or better — only when usage data is available |
| **Incomplete** | No token data available — quality comparison still valid; do not claim token savings |
| **No win** | B does not beat A on quality or tokens |

Do not claim end-to-end token savings without measured usage from both runs.

## 7. Scoring table (quick compare)

| Metric | Test A (no pack) | Test B (with pack) |
| --- | --- | --- |
| Client / model | | |
| Expected files / 5 | | |
| Quality (1–10) | | |
| Tokens / cost | | |
| Time / effort | | |
| Notes | | |

**Overall verdict:** quality win / token win / incomplete / no win

## 8. How to record and compare results

Use the CLI to store measurable results (no synthetic proof):

```bash
# 1. Create a plan for your client/model
npm run ab:file-context:create -- --client chatgpt --model gpt-4o --repo .

# 2. Run Test A in your LLM, then record
npm run ab:file-context:record -- \
  --mode no_context \
  --quality 7 \
  --expected-files-found 3 \
  --files-listed "tests/fixtures/simple-node-app/src/auth/login.ts" \
  --token-usage unavailable \
  --notes "ChatGPT web, repo uploaded as zip"

# 3. Run Test B with context pack attached, then record
npm run ab:file-context:record -- \
  --mode file_context_pack \
  --quality 9 \
  --expected-files-found 5 \
  --found true \
  --context-pack-tokens 541 \
  --client-total 4200 \
  --token-usage real \
  --files-listed "tests/fixtures/simple-node-app/src/auth/login.ts,tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx"

# 4. Compare and generate report
npm run ab:file-context:compare
npm run ab:file-context:report
```

**Report path:** `.mcp-ab-tests/reports/file-context-ab-report.md`

**Token usage values:**

| Value | Meaning |
| --- | --- |
| `real` | Client exposed actual billing/usage totals — required for token savings proof |
| `estimated` | Recorded for notes only — **does not** count as proof |
| `unavailable` | No usage data — quality comparison still valid |

**Verdicts:** `QUALITY_WIN`, `TOKEN_SAVINGS_PROVEN`, `QUALITY_AND_TOKEN_WIN`, `NO_MEANINGFUL_CHANGE`, `QUALITY_REGRESSION`, `TOKEN_USAGE_UNAVAILABLE`, `INCOMPLETE_TEST`

Do not use synthetic or estimated tokens to claim `TOKEN_SAVINGS_PROVEN`.

## 9. Related docs

- Result template: [ab-test-templates/file-context-template.md](ab-test-templates/file-context-template.md)
- Universal CLI: [universal-llm-usage.md](universal-llm-usage.md)
- MCP A/B (when client supports it): [ab-testing.md](ab-testing.md)
