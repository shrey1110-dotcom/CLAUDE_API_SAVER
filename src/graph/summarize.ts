const TAG_KEYWORDS: Array<[RegExp, string]> = [
  [/auth|login|session|password|token/i, "auth"],
  [/login/i, "login"],
  [/session/i, "session"],
  [/route|router|controller/i, "route"],
  [/controller/i, "controller"],
  [/service/i, "service"],
  [/api/i, "api"],
  [/test|spec|__tests__/i, "test"],
  [/config|settings/i, "config"],
  [/react|jsx|tsx/i, "react"],
  [/frontend|client|ui|page|component/i, "frontend"],
  [/database|db|schema|migration|sql|prisma/i, "database"],
  [/style|css|scss|tailwind/i, "style"],
  [/build|webpack|vite|rollup/i, "build"],
  [/deploy|docker|k8s|helm/i, "deploy"],
  [/state|store|redux|zustand/i, "state"],
];

export function deriveTags(...parts: string[]): string[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  const tags = new Set<string>();
  for (const [pattern, tag] of TAG_KEYWORDS) {
    if (pattern.test(text)) {
      tags.add(tag);
    }
  }
  return [...tags].slice(0, 8);
}

export function summarizeFile(relativePath: string, symbolNames: string[]): string {
  const base = pathBasename(relativePath);
  const lower = relativePath.toLowerCase();
  const names = symbolNames.slice(0, 4).join(", ");

  if (/login|auth/i.test(lower)) {
    return truncateSummary(`Auth module ${base} exporting ${names || "symbols"}.`);
  }
  if (/session/i.test(lower)) {
    return truncateSummary(`Session helper module ${base} with ${names || "session helpers"}.`);
  }
  if (/controller/i.test(lower)) {
    return truncateSummary(`API controller ${base} for related routes.`);
  }
  if (/page|component|tsx|jsx/i.test(lower)) {
    return truncateSummary(`UI component ${base}.`);
  }
  if (/test|spec/i.test(lower)) {
    return truncateSummary(`Test file ${base}.`);
  }
  if (/package\.json|tsconfig|vite\.config|next\.config|pyproject|makefile|dockerfile/i.test(lower)) {
    return truncateSummary(`Project config file ${base}.`);
  }
  if (symbolNames.length > 0) {
    return truncateSummary(`Source file ${base} with ${names}.`);
  }
  return truncateSummary(`Source file ${base}.`);
}

export function summarizeSymbol(
  kind: string,
  name: string,
  relativePath: string,
): string {
  return truncateSummary(`${kind} ${name} in ${relativePath}`);
}

function pathBasename(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
}

function truncateSummary(text: string): string {
  return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
}
