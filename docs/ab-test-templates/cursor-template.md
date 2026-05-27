# Cursor A/B test template

## Session

| Field | Value |
| --- | --- |
| Client | Cursor |
| Model | |
| Repo | |
| Mode | A: no MCP / B: compact tools / C: graph / D: context_pack |
| Date | |

## Prompt

```text
(paste exact prompt)
```

## Measurements

| Field | Value |
| --- | --- |
| Client input tokens | |
| Client output tokens | |
| Cache write | |
| Cache read | |
| Client total | |
| MCP estimated output tokens | |
| Combined total (client + MCP) | |
| Tools used | |
| Files read (approx.) | |
| Answer quality (1–10) | |
| Found expected files/functions? | yes / partial / no |

## Notes



## Verdict

- [ ] Saved tokens vs baseline
- [ ] No meaningful change
- [ ] Increased tokens
- [ ] Inconclusive

**Rule:** combined total with MCP must be **lower** than without MCP, and quality must be **equal or better**, to claim savings.
