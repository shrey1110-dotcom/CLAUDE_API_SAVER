# File-context A/B result template

Universal test: **no context pack (A)** vs **generated context pack file (B)**. No MCP required.

| Field | Value |
| --- | --- |
| Repo | |
| Task | Find where authentication, login, or user session logic is implemented |
| Context pack path | `.context-packs/auth-discovery.md` |
| Date | |
| Tester | |

## Setup commands run

```bash
npm run build
npm run graph:build
npm run context:build
npm run context:pack -- --task "Find where authentication, login, or user session logic is implemented" --budget 1000 --format markdown --out .context-packs/auth-discovery.md
```

Pack estimated output tokens: ___

---

## Test A — no context pack

| Field | Value |
| --- | --- |
| Client / model | |
| Prompt version | file-context-ab-test.md Test A |
| Answer | |
| Files found | |
| Expected files / 5 | /5 |
| Quality (1–10) | |
| Tokens / cost | |
| Time / effort | |
| Notes | |

### Expected file checklist (A)

- [ ] `tests/fixtures/simple-node-app/src/auth/login.ts`
- [ ] `tests/fixtures/simple-node-app/src/auth/session.ts`
- [ ] `tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts`
- [ ] `tests/fixtures/monorepo-app/packages/api/src/session.service.ts`
- [ ] `tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx`

---

## Test B — with context pack

| Field | Value |
| --- | --- |
| Client / model | |
| Prompt version | file-context-ab-test.md Test B |
| Context pack attached | yes / no |
| Answer | |
| Files found | |
| Expected files / 5 | /5 |
| Quality (1–10) | |
| Tokens / cost | |
| Time / effort | |
| Notes | |

### Expected file checklist (B)

- [ ] `tests/fixtures/simple-node-app/src/auth/login.ts`
- [ ] `tests/fixtures/simple-node-app/src/auth/session.ts`
- [ ] `tests/fixtures/monorepo-app/packages/api/src/auth.controller.ts`
- [ ] `tests/fixtures/monorepo-app/packages/api/src/session.service.ts`
- [ ] `tests/fixtures/monorepo-app/apps/web/src/LoginPage.tsx`

---

## Comparison

| Metric | A (no pack) | B (with pack) | Winner |
| --- | --- | --- | --- |
| Expected files / 5 | | | |
| Quality (1–10) | | | |
| Tokens / cost | | | |
| Time / effort | | | |

## Verdict

- [ ] **Quality win (B)** — more expected files or better explanations
- [ ] **Token win (B)** — lower tokens/cost with equal or better quality (usage data required)
- [ ] **Incomplete** — no token data; quality-only comparison
- [ ] **No win** — B did not improve A

**Summary:**

```text
(one paragraph: what improved, what did not, whether token savings can be claimed)
```

**Do not claim token savings unless both runs have comparable usage totals.**
