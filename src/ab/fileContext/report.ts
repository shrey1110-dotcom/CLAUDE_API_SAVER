import { combinedTokensB, tokenWin } from "./compare.js";
import type { FileContextComparison, FileContextResult } from "./types.js";

export function renderFileContextReport(comparison: FileContextComparison): string {
  const { plan, resultA, resultB, verdict, summary, tokenComparisonAvailable: tokensOk } = comparison;
  const lines: string[] = [
    "# File-context A/B report",
    "",
    `Generated: ${comparison.comparedAt}`,
    "",
    "## Setup",
    "",
    `- Plan ID: \`${plan.id}\``,
    `- Client: ${plan.client}`,
    `- Model: ${plan.model ?? "n/a"}`,
    `- Repo: \`${plan.repoPath}\``,
    `- Task: ${plan.task}`,
    `- Context pack: \`${plan.contextPackPath}\``,
    `- Context pack estimated tokens: ${plan.contextPackEstimatedTokens ?? "n/a"}`,
    "",
    "## Prompts",
    "",
    "### Test A — no_context",
    "",
    "```text",
    plan.testAPrompt,
    "```",
    "",
    "### Test B — file_context_pack",
    "",
    "Attach context pack file, then:",
    "",
    "```text",
    plan.testBPrompt,
    "```",
    "",
    "## Result table",
    "",
    "| Mode | Client | Model | Quality | Expected /5 | Tokens | Usage source |",
    "| --- | --- | --- | ---: | ---: | --- | --- |",
  ];

  const row = (mode: string, r: FileContextResult | undefined): void => {
    if (!r) {
      lines.push(`| ${mode} | — | — | — | — | — | — |`);
      return;
    }
    const tokens =
      r.mode === "file_context_pack" && typeof r.clientTotalTokens === "number"
        ? `${combinedTokensB(r)} (client ${r.clientTotalTokens} + pack ${r.contextPackEstimatedTokens ?? 0})`
        : String(r.clientTotalTokens ?? "n/a");
    lines.push(
      `| ${mode} | ${r.client} | ${r.model ?? "n/a"} | ${r.qualityScore} | ${r.expectedFilesFound}/5 | ${tokens} | ${r.tokenUsageSource} |`,
    );
  };

  row("no_context (A)", resultA);
  row("file_context_pack (B)", resultB);

  lines.push(
    "",
    "## Quality comparison",
    "",
    `- Quality win (B): ${comparison.qualityWin ? "yes" : "no"}`,
  );

  if (resultA && resultB) {
    lines.push(
      `- A quality: ${resultA.qualityScore}, expected files: ${resultA.expectedFilesFound}/5`,
      `- B quality: ${resultB.qualityScore}, expected files: ${resultB.expectedFilesFound}/5`,
    );
  }

  lines.push("", "## Token comparison", "");

  if (!tokensOk) {
    lines.push(
      "- Real token usage unavailable for one or both runs.",
      "- **Token savings are not proven.** Estimated or missing usage does not count as proof.",
      "- Record `--token-usage real` with `--client-total` only when the client exposes actual billing/usage totals.",
    );
  } else if (resultA && resultB) {
    const aTotal = resultA.clientTotalTokens!;
    const bTotal = combinedTokensB(resultB)!;
    const win = tokenWin(resultA, resultB);
    lines.push(
      `- A client total: ${aTotal}`,
      `- B combined (client + context pack): ${bTotal}`,
      `- Token win (B): ${win ? "yes" : "no"}`,
    );
    if (!win) {
      lines.push("- Real token usage recorded but B did not beat A.");
    }
  }

  lines.push(
    "",
    "## Final verdict",
    "",
    `**${verdict}**`,
    "",
    summary,
    "",
  );

  if (!tokensOk || !comparison.tokenWin) {
    lines.push(
      "> **Warning:** Token savings are not proven unless both runs have **real** client usage totals and B combined tokens are lower than A.",
      "",
    );
  }

  if (resultA?.tokenUsageSource === "estimated" || resultB?.tokenUsageSource === "estimated") {
    lines.push(
      "> **Note:** Estimated token usage was recorded but does **not** count toward TOKEN_SAVINGS_PROVEN.",
      "",
    );
  }

  lines.push("## Files listed", "");
  if (resultA) {
    lines.push("### Test A", "", ...(resultA.filesListed.length ? resultA.filesListed.map((f) => `- ${f}`) : ["- (none)"]), "");
  }
  if (resultB) {
    lines.push("### Test B", "", ...(resultB.filesListed.length ? resultB.filesListed.map((f) => `- ${f}`) : ["- (none)"]), "");
  }

  return `${lines.join("\n")}\n`;
}
