# Generic MCP client A/B test template

| Field | Value |
| --- | --- |
| Client | |
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
| Combined total | |
| Tools used | |
| Files read | |
| Answer quality (1–10) | |
| Found expected files/functions? | |

## Notes



## Verdict

**Success rule:**

```text
client_total_with_mcp + MCP_estimated_output_tokens < client_total_without_mcp
```

and answer quality is equal or better.
