# Cursor A/B Test: repo-context-mcp Token Usage

This guide helps you measure whether **repo-context-mcp** actually reduces Cursor/Codex token usage compared to working without MCP tools.

Do not assume the MCP saves tokens until you complete both tests below and compare the numbers.

## Setup

### Enable MCP with telemetry

1. Build the server:

   ```bash
   npm install
   npm run build
   ```

2. Enable the MCP server in [`.cursor/mcp.json`](../.cursor/mcp.json) with telemetry:

   ```json
   {
     "mcpServers": {
       "repo-context-mcp": {
         "type": "stdio",
         "command": "node",
         "args": ["${workspaceFolder}/dist/index.js"],
         "env": {
           "MCP_TELEMETRY": "1"
         }
       }
     }
   }
   ```

3. Restart or reload MCP in **Cursor Settings → MCP**.

4. After each test session, generate a report:

   ```bash
   npm run telemetry:report
   ```

### Disable MCP temporarily

For **Test A**, disable the server in Cursor Settings → MCP (toggle off `repo-context-mcp`) or remove/comment out the server block in `.cursor/mcp.json`, then reload MCP.

### Test hygiene

- **Use a fresh Cursor chat** for each run so prior context does not skew token counts.
- **Use the same model** for Test A and Test B (for example, the same Claude or GPT model tier).
- **Use the exact prompts below** so results are comparable.
- Run tests on the **same repository** and similar time of day if possible.
- Do not edit files during either test (read-only investigation only).

---

## Test A: MCP disabled

**Prompt (copy exactly):**

```text
Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give me the exact files, functions, and a short explanation of why each file matters.
```

### Record your results

| Metric | Value |
| --- | --- |
| Cursor input tokens | |
| Cursor output tokens | |
| Cache write | |
| Cache read | |
| Total tokens / cost | |
| Files inspected (approx.) | |
| Answer quality (1–10) | |
| Notes | |

**Where to find token usage:** Cursor chat usage panel / account usage for that session.

---

## Test B: MCP enabled

**Prompt (copy exactly):**

```text
Use the repo-context MCP tools first before reading broad file contents. Prefer repo_map, search_code, get_file_outline, and get_symbol_context. Do not edit files.

Find where authentication, login, or user session logic is implemented in this repo. Give me the exact files, functions, and a short explanation of why each file matters.
```

### Record your results

| Metric | Value |
| --- | --- |
| Cursor input tokens | |
| Cursor output tokens | |
| Cache write | |
| Cache read | |
| Total tokens / cost | |
| MCP tool calls | |
| MCP estimated output tokens | |
| Largest MCP response (chars / est. tokens) | |
| Files inspected (approx.) | |
| Answer quality (1–10) | |
| Notes | |

**MCP metrics:** run `npm run telemetry:summary` or open [`.mcp-telemetry/report.md`](../.mcp-telemetry/report.md) after the session.

---

## Success criteria

**Quantitative rule:**

```text
The MCP is helping only if:
Cursor total usage with MCP + MCP estimated output tokens < Cursor total usage without MCP
```

Define **Cursor total usage** as the session total you recorded (input + output + cache-related usage as shown in Cursor).

**Qualitative success signs:**

- Cursor calls `repo_map`, `search_code`, or `get_symbol_context` before broad file reads
- Fewer full-file reads than Test A
- Same or better answer quality (within 1 point on your 1–10 scale)
- MCP output stays below roughly **5k–15k estimated tokens** for the task

---

## Failure signs

- Cursor ignores MCP tools and reads many full files anyway
- MCP returns huge `repo_map` or `search_code` responses (check `.mcp-telemetry/report.md`)
- Cursor still reads many full files after MCP results
- Total usage (Cursor + MCP tokens) is **equal or higher** than Test A
- Answer quality gets worse

---

## What to do if it fails

1. **Shrink `repo_map` output** — reduce tree depth or omit noisy fields if the report shows large `repo_map` responses.
2. **Reduce `search_code` default `maxResults`** — use smaller limits in tool calls and project rules.
3. **Tighten `get_symbol_context` snippets** — lower `maxResults` and prefer narrow symbol names.
4. **Add or improve Cursor project rules** — see [`.cursor/rules/repo-context-mcp.mdc`](../.cursor/rules/repo-context-mcp.mdc).
5. **Make tool descriptions more explicit** in `src/index.ts` so the model reaches for MCP tools first.
6. **Remove noisy output from `repo_map`** — avoid returning long README/config excerpts in the tree summary.

Re-run Test B after each change and compare telemetry reports.

---

## Reference: automated local validation

Before running Cursor A/B tests, run the deep test pass:

```bash
npm run test:all
npm run benchmark:workflow
npm run deep-test:report
```

Then open [`.mcp-telemetry/deep-test-report.md`](../.mcp-telemetry/deep-test-report.md) for correctness, security, output-budget, and workflow benchmark summaries.

`npm run validate` is included inside `test:all` and still runs telemetry summary/report generation.

**Reminder:** deep tests prove MCP output is compact and useful. They do **not** prove Cursor/Codex token savings. Only the MCP-disabled vs MCP-enabled A/B comparison below can do that.
