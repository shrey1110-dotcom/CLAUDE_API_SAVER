import type { ContextPackResult } from "./types.js";

export function formatContextPackMarkdown(pack: ContextPackResult): string {
  const lines: string[] = [];
  lines.push("# Context Pack");
  lines.push("");
  lines.push(`- Task: ${pack.task}`);
  lines.push(`- Mode: ${pack.mode}`);
  lines.push(`- Generated: ${pack.generatedAt ?? new Date().toISOString()}`);
  lines.push(`- Budget tokens: ${pack.budgetTokens}`);
  lines.push(`- Estimated output tokens: ${pack.estimatedOutputTokens ?? "unknown"}`);
  lines.push(`- Truncated: ${pack.truncated ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(pack.summary);
  lines.push("");
  lines.push("## Files");
  lines.push("");
  for (const file of pack.files) {
    lines.push(`- \`${file.path}\` (score ${file.score}) — ${file.reason}`);
  }
  lines.push("");
  lines.push("## Symbols");
  lines.push("");
  for (const sym of pack.symbols) {
    const loc = sym.path ? ` @ ${sym.path}${sym.line ? `:${sym.line}` : ""}` : "";
    lines.push(`- \`${sym.name}\`${loc} — ${sym.reason}`);
  }
  if (pack.docs?.length) {
    lines.push("");
    lines.push("## Docs");
    lines.push("");
    for (const doc of pack.docs) {
      lines.push(`- \`${doc.path}\` (score ${doc.score}) — ${doc.reason}`);
    }
  }
  if (pack.assets?.length) {
    lines.push("");
    lines.push("## Assets");
    lines.push("");
    for (const asset of pack.assets) {
      lines.push(`- \`${asset.path}\` [${asset.type}] (score ${asset.score}) — ${asset.reason}`);
    }
  }
  if (pack.concepts?.length) {
    lines.push("");
    lines.push("## Concepts");
    lines.push("");
    for (const concept of pack.concepts) {
      lines.push(`- **${concept.name}** (score ${concept.score}) — ${concept.reason}`);
    }
  }
  if (pack.commands) {
    lines.push("");
    lines.push("## Commands");
    lines.push("");
    if (pack.commands.test) lines.push(`- test: \`${pack.commands.test}\``);
    if (pack.commands.lint) lines.push(`- lint: \`${pack.commands.lint}\``);
    if (pack.commands.dev) lines.push(`- dev: \`${pack.commands.dev}\``);
  }
  lines.push("");
  lines.push("## Next steps");
  lines.push("");
  for (const step of pack.nextSteps) {
    lines.push(`- ${step}`);
  }
  lines.push("");
  lines.push(`## Needs full file read`);
  lines.push("");
  lines.push(pack.needsFullFileRead ? "yes" : "no");
  lines.push("");
  return lines.join("\n");
}
