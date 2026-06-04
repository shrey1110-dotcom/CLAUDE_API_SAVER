import path from "node:path";

export const TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".rst",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".sql",
  ".graphql",
]);

export const PDF_EXTENSIONS = new Set([".pdf"]);
export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const DIAGRAM_EXTENSIONS = new Set([".svg"]);
export const MEDIA_EXTENSIONS = new Set([".mp3", ".wav", ".mp4", ".mov", ".webm"]);
export const TRANSCRIPT_EXTENSIONS = new Set([".vtt", ".srt"]);
export const TRANSCRIPT_SUFFIX = ".transcript.txt";

export type IngestKind = "markdown" | "text" | "pdf" | "image" | "diagram" | "media" | "transcript";

export function classifyIngestPath(relativePath: string): IngestKind | null {
  const ext = path.extname(relativePath).toLowerCase();
  if (relativePath.endsWith(TRANSCRIPT_SUFFIX)) return "transcript";
  if (TEXT_EXTENSIONS.has(ext)) {
    return ext === ".md" || ext === ".mdx" ? "markdown" : "text";
  }
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (DIAGRAM_EXTENSIONS.has(ext)) return "diagram";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (MEDIA_EXTENSIONS.has(ext)) return "media";
  if (TRANSCRIPT_EXTENSIONS.has(ext)) return "transcript";
  return null;
}

export function guessTagsFromPath(relativePath: string): string[] {
  const parts = relativePath
    .toLowerCase()
    .split(/[/_.-]+/)
    .filter((part) => part.length > 2 && !["src", "docs", "test", "tests", "fixtures"].includes(part));
  return [...new Set(parts)].slice(0, 6);
}
