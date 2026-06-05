# Broker-first context intelligence strategy

## Architecture

**repo-context-mcp** is a broker-first context intelligence layer for coding agents.

1. Ingest project knowledge deterministically (code, docs, metadata, transcripts, assets)
2. Build a local knowledge graph and context capsules **internally**
3. **`context_pack` queries the graph** and returns one compact, task-specific pack
4. Locked profiles prevent agents from wandering through graph/search tools
5. A/B tooling proves or disproves real token savings per client/task

The graph is an internal intelligence layer. **`context_pack` is the product interface.**

## Capability matrix

| # | Capability | repo-context-mcp today | Next step | Expose to agent? | Feed context_pack? |
|---|------------|------------------------|-----------|------------------|-------------------|
| 1 | Code graph | Yes (`graph:build`) | Improve symbol edges | Fallback only | Yes |
| 2 | Docs graph | Yes (markdown/doc nodes) | More doc↔code links | No | Yes |
| 3 | PDFs | Metadata-only v1 | Optional local extractor | No | Yes (metadata) |
| 4 | Images/diagrams | Metadata + SVG labels | Optional OCR later | No | Yes (metadata) |
| 5 | Audio/video transcripts | Sidecar transcripts only | No auto-transcribe | No | Yes |
| 6 | Concept clusters | Yes (`concept` nodes) | Synonym tuning | No | Yes |
| 7 | Query logs | Yes (`.repo-context-queries/`) | More task profiles | No | Yes (ranking input) |
| 8 | Context broker | Yes (`context_pack`) | Multimodal ranking | **Yes (primary)** | N/A |
| 9 | Locked tool profiles | Yes (`codex_locked`) | Codex auth-discovery proof complete | Yes (locked only) | N/A |
| 10 | A/B proof system | Yes | Cursor / Claude / Gemini proofs | No | N/A |
| 11 | Self-iteration loop | Yes (`self:*`) | Safe synonym updates | No | Yes |

## Conclusion

Do **not** expose multimodal graph traversal as many separate tools. Multimodal and graph data should **feed `context_pack` internally**.

Primary agent interface:

1. `context_status`
2. `context_pack`
3. `impact_pack` (diff/change tasks)

Locked Codex proof uses only `context_status` + `context_pack`.

Codex auth-discovery locked proof reached `PROVEN_SAVINGS_STABLE` (scoped). Other clients/tasks still require `ab:real-check` before any savings claim.

## Competitive context (not product identity)

Tools like Graphify demonstrate the value of repository knowledge graphs. **repo-context-mcp** is a different product: broker-first delivery, locked routing to prevent tool loops, and proof-driven token evaluation per client/task. We do not position ourselves as a Graphify clone or competitor claim.
