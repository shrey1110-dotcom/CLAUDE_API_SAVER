import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".mcp-benchmarks/graphify-best-effort");
const OUT_FILE = path.join(OUT_DIR, "graphify-best-effort-context.txt");
const REPORT = path.join(OUT_DIR, "05-graph-report.md");

function extractReportSections(markdown) {
  const wanted = [
    "Community 39",
    "Community 62",
    "Community 76",
    "Community 79",
    "Community 85",
    "Community 88",
  ];
  const lines = markdown.split("\n");
  const chunks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!wanted.some((w) => line.includes(w))) continue;
    const section = [];
    for (let j = i; j < lines.length && j < i + 6; j += 1) {
      section.push(lines[j]);
      if (j > i && lines[j].startsWith("### Community ") && !lines[j].includes(line.match(/Community \d+/)?.[0] ?? "")) break;
    }
    chunks.push(section.join("\n"));
  }
  return chunks.join("\n\n");
}

const sources = [
  { id: "03-symbols.txt", reason: "Best query retrieval: symbol names returned LoginPage.tsx fixture paths" },
  { id: "01-original.txt", reason: "Original task query output (Graphify BFS from login-related seeds)" },
  { id: "02-concrete.txt", reason: "Concrete TypeScript auth/session query output" },
  { id: "05-graph-report.md (excerpt)", reason: "GRAPH_REPORT community sections mentioning auth/login/session nodes" },
];

const excluded = [
  "04-context-budget.txt — matched budget.ts nodes, not auth fixtures",
  "04b-context-auth.txt — explicit context filters hit src/context/types.ts, not fixtures",
];

const parts = [
  "# Graphify best-effort context (auth-discovery)",
  "",
  "Built from normal Graphify CLI outputs only. No repo-context output. No manual expected-file injection.",
  "",
  "## Sources included",
  ...sources.map((s) => `- ${s.id}: ${s.reason}`),
  "",
  "## Sources excluded",
  ...excluded.map((s) => `- ${s}`),
  "",
];

for (const file of ["03-symbols.txt", "01-original.txt", "02-concrete.txt"]) {
  const p = path.join(OUT_DIR, file);
  if (!fs.existsSync(p)) continue;
  parts.push(`---`, `## From ${file}`, "", fs.readFileSync(p, "utf8").trim(), "");
}

if (fs.existsSync(REPORT)) {
  const excerpt = extractReportSections(fs.readFileSync(REPORT, "utf8"));
  if (excerpt.trim()) {
    parts.push("---", "## From GRAPH_REPORT.md (Graphify-generated excerpts)", "", excerpt.trim(), "");
  }
}

fs.writeFileSync(OUT_FILE, `${parts.join("\n")}\n`, "utf8");
console.log(`Wrote ${OUT_FILE} (${fs.statSync(OUT_FILE).size} bytes)`);
