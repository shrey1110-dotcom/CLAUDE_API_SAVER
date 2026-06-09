# Codex Multi-Task Locked QA Report

Generated: 2026-06-11T00:46:06.428Z

## Aggregate

- Aggregate verdict: INCOMPLETE_TEST
- Tasks completed: 2/5
- Tasks proven saved: 2
- Tasks inconclusive: 3
- Tasks worse/regressed: 0

## Token Savings

| Task | Verdict | No-MCP totals | Locked client totals | Locked MCP tokens | Locked combined totals | Mean savings | Median savings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| auth-discovery | PROVEN_SAVINGS_STABLE | 210298, 450685, 273530 | 61790, 61827, 61674 | 867, 868, 868 | 62657, 62695, 62542 | 79.9% | 77.1% |
| impact-analysis | PROVEN_SAVINGS_STABLE | 1182210, 879664, 1265488 | 62465, 62164, 62272 | 654, 654, 654 | 63119, 62818, 62926 | 94.3% | 94.7% |
| edit-planning | INCOMPLETE_TEST | - | - | - | - | - | - |
| architecture-discovery | INCOMPLETE_TEST | - | - | - | - | - | - |
| onboarding-map | INCOMPLETE_TEST | - | - | - | - | - | - |

## Quality

| Task | No-MCP quality | Locked quality | Expected files/concepts pass | Notes |
| --- | ---: | ---: | --- | --- |
| auth-discovery | 9 | 10 | yes | auth-discovery scoring: files 5/5, concepts 6/6, categories 3/3. |
| impact-analysis | 10 | 10 | yes | impact-analysis scoring: files 8/8, concepts 7/7, categories 4/4. |
| edit-planning | - | - | no | - |
| architecture-discovery | - | - | no | - |
| onboarding-map | - | - | no | - |

## File Context Packs

| Task | Markdown | JSON | Estimated tokens | Budget pass | File/concept pass |
| --- | --- | --- | ---: | --- | --- |
| auth-discovery | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/auth-discovery.md | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/auth-discovery.json | 773 | yes | yes |
| impact-analysis | - | - | - | no | no |
| edit-planning | - | - | - | no | no |
| architecture-discovery | - | - | - | no | no |
| onboarding-map | - | - | - | no | no |

## Per-Task Details

### auth-discovery

Prompt: Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.

- Verdict: PROVEN_SAVINGS_STABLE
- Reasons: -
- Routing tools: context_status, context_pack, context_status, context_pack, context_status, context_pack
- Forbidden tools present: no

### impact-analysis

Prompt: Find all files likely affected if session validation behavior changes. Include related tests, configs, API/frontend entry points, and risks. Do not edit files.

- Verdict: PROVEN_SAVINGS_STABLE
- Reasons: -
- Routing tools: context_status, context_pack, context_status, context_pack, context_status, context_pack
- Forbidden tools present: no

### edit-planning

Prompt: Plan the smallest safe change to add refresh-token expiration handling. Include exact files, symbols, tests, and risks. Do not edit files.

- Verdict: INCOMPLETE_TEST
- Reasons: missing no_mcp 3-repeat real usage; missing context_broker_locked 3-repeat real usage
- Routing tools: -
- Forbidden tools present: -

### architecture-discovery

Prompt: Summarize the authentication, routing, API, frontend, and test boundaries in this repo. Do not edit files.

- Verdict: INCOMPLETE_TEST
- Reasons: missing no_mcp 3-repeat real usage; missing context_broker_locked 3-repeat real usage
- Routing tools: -
- Forbidden tools present: -

### onboarding-map

Prompt: Give a compact onboarding map for this repo: major areas, important configs, test commands, auth/session flow, and where a new contributor should start. Do not edit files.

- Verdict: INCOMPLETE_TEST
- Reasons: missing no_mcp 3-repeat real usage; missing context_broker_locked 3-repeat real usage
- Routing tools: -
- Forbidden tools present: -

## Allowed Claim

Only the existing scoped Codex auth-discovery locked proof remains allowed unless this report reaches PROVEN_MULTI_TASK_SAVINGS.

## Non-Claims

- Not proven against Graphify.
- Not proven for Cursor, Claude, Gemini, or other clients.
- Not proven for all tasks unless every task in this QA suite passes, and then only for all tasks in this QA suite.
- Not proven for full context_broker mode.
