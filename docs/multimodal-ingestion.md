# Multimodal ingestion

Deterministic, local ingestion for docs/assets/media. No external APIs. No LLM summaries.

## Supported v1

| Type | Extensions | Behavior |
|------|------------|----------|
| Markdown | `.md`, `.mdx` | Doc + heading nodes, path mentions, concept tags |
| Text/docs | `.txt`, `.rst`, `.json`, `.yaml`, `.yml`, `.toml`, `.sql`, `.graphql` | Doc nodes, compact snippets |
| PDF | `.pdf` | Metadata-only node if no local extractor |
| Images | `.png`, `.jpg`, `.jpeg`, `.webp` | Metadata-only asset nodes |
| Diagrams | `.svg` | Metadata + simple `<text>` label parsing |
| Media | `.mp3`, `.wav`, `.mp4`, `.mov`, `.webm` | Metadata-only media nodes |
| Transcripts | `.vtt`, `.srt`, `.transcript.txt` | Transcript nodes, media links |

## Not supported yet

- OCR on images
- Audio/video transcription
- External APIs
- Embeddings (optional experimental flag only, not enabled)
- Full PDF text extraction (optional dependency path documented for future)

## Build

```bash
npm run graph:build
```

Multimodal ingestion runs as part of graph build and merges nodes into `.repo-context-graph/graph.json`.

## Caps

- No full file contents in graph JSON
- Snippets capped (~240 chars)
- Max headings/tags per asset
- Excluded dirs: `node_modules`, `.git`, `.mcp-telemetry`, `.mcp-ab-tests`, `.context-packs`, etc.
