# Codex Multi-Task Locked QA Report

Generated: 2026-06-06T01:35:05.022Z

## Aggregate

- Aggregate verdict: INCOMPLETE_TEST
- Tasks completed: 1/5
- Tasks proven saved: 1
- Tasks inconclusive: 4
- Tasks worse/regressed: 0

## Token Savings

| Task | Verdict | No-MCP totals | Locked client totals | Locked MCP tokens | Locked combined totals | Mean savings | Median savings |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| auth-discovery | PROVEN_SAVINGS_STABLE | 210298, 450685, 273530 | 61790, 61827, 61674 | 867, 868, 868 | 62657, 62695, 62542 | 79.9% | 77.1% |
| impact-analysis | INCOMPLETE_TEST | 1182210, 879664, 1265488 | - | - | - | - | - |
| edit-planning | INCOMPLETE_TEST | - | - | - | - | - | - |
| architecture-discovery | INCOMPLETE_TEST | - | - | - | - | - | - |
| onboarding-map | INCOMPLETE_TEST | - | - | - | - | - | - |

## Quality

| Task | No-MCP quality | Locked quality | Expected files/concepts pass | Notes |
| --- | ---: | ---: | --- | --- |
| auth-discovery | 9 | 10 | yes | auth-discovery scoring: files 5/5, concepts 6/6, categories 3/3. |
| impact-analysis | 10 | 1 | no | impact-analysis scoring: files 0/8, concepts 0/7, categories 0/4. |
| edit-planning | - | - | no | - |
| architecture-discovery | - | - | no | - |
| onboarding-map | - | - | no | - |

## File Context Packs

| Task | Markdown | JSON | Estimated tokens | Budget pass | File/concept pass |
| --- | --- | --- | ---: | --- | --- |
| auth-discovery | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/auth-discovery.md | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/auth-discovery.json | 818 | yes | yes |
| impact-analysis | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/impact-analysis.md | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/impact-analysis.json | 833 | yes | yes |
| edit-planning | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/edit-planning.md | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/edit-planning.json | 844 | yes | no |
| architecture-discovery | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/architecture-discovery.md | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/architecture-discovery.json | 812 | yes | yes |
| onboarding-map | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/onboarding-map.md | /Users/shreyanshsharma/Downloads/Claude_api_saver/.context-packs/onboarding-map.json | 830 | yes | no |

## Per-Task Details

### auth-discovery

Prompt: Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.

- Verdict: PROVEN_SAVINGS_STABLE
- Reasons: -
- Routing tools: context_status, context_pack, context_status, context_pack, context_status, context_pack
- Forbidden tools present: no

### impact-analysis

Prompt: Find all files likely affected if session validation behavior changes. Include related tests, configs, API/frontend entry points, and risks. Do not edit files.

- Verdict: INCOMPLETE_TEST
- Reasons: missing context_broker_locked 3-repeat real usage
- Routing tools: -
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
