# StackTrace MVP Next Actions

Last updated: 2026-05-03

Canonical project path:

```text
C:\Users\biber\OneDrive\Desktop\StackTrace
```

## Immediate Next Steps

1. Improve the dashboard UI so it more closely matches the chosen StackTrace mockup.
   - Tighten node positioning and spacing.
   - Make the graph responsive.
   - Improve selected-edge highlighting.
   - Replace placeholder glyphs with cleaner icons or lucide icons once in a real frontend stack.

2. Make review persistence more complete.
   - Save notes independently, not only when a status button is clicked.
   - Add reviewed timestamp and reviewer display in the evidence drawer.
   - Add a visible count of approved/candidate/rejected edges.
   - Add a reset or export option for review decisions.

3. Add a relationship review table/view.
   - List all edges.
   - Filter by `candidate`, `approved`, `rejected`.
   - Sort by company, target entity, relationship type, source date.

4. Run local model extraction against SEC snippets.
   - Start the local OpenAI-compatible model server.
   - Set `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY`.
   - Run `npm.cmd run extract:candidates -- NVDA TSLA AAPL`.
   - Compare extracted candidates against manually seeded relationships.

5. Add an approval pipeline from candidates to seed relationships.
   - Candidate JSON should not automatically become approved graph data.
   - Add a review step.
   - Approved candidates should append to or regenerate `data/seeds/edgar-relationships.json`.

## Near-Term Data Work

1. Entity resolution foundation.
   - Canonical entity names.
   - Alias table.
   - Ticker/CIK mappings.
   - Country/jurisdiction.
   - Parent/subsidiary relationships.

2. Patent data investigation.
   - Use official USPTO/PatentsView sources for public patent applications, grants, assignments, assignees, CPC classifications, and citations.
   - Treat patents as technology relationship signals, not direct supplier proof.
   - Add source-specific `ip_assets` and `ip_events` tables when moving to Postgres.

3. Policy data investigation.
   - OFAC SDN list.
   - BIS/Commerce consolidated screening list.
   - Federal Register tariff-related notices.
   - Trade/tariff flags need country, HS code, product category, and confidence handling.

4. Customs data vendor validation.
   - Confirm data provider terms before subscribing.
   - Validate API/export access, redistribution rights, caching rights, and commercial-use rights.
   - Test whether records can resolve to public-company suppliers with acceptable precision.

## Frontend/Product Next Steps

1. Decide whether to keep prototyping as standalone HTML or move to a real React/Vite app.
   - Standalone HTML is fast for proof-of-concept.
   - React/Vite plus React Flow is better for the actual product UI.

2. If moving to React:
   - Create route/layout for StackTrace dashboard.
   - Use `src/stacktrace-api-client.mjs` as the data client.
   - Consume `/api/graph-with-reviews`.
   - Convert graph to React Flow nodes/edges.
   - Build reusable components:
     - `Sidebar`
     - `SignalBar`
     - `SupplierNetwork`
     - `RelationshipFlow`
     - `EvidenceDrawer`
     - `ReviewControls`

3. Add investor-facing approved graph mode.
   - Use `/api/graph/approved`.
   - Hide review controls.
   - Keep evidence drawer read-only.

## Database Migration Path

Current:

```text
JSON files under data/
```

Next:

```text
Local Postgres or Supabase Postgres
```

Eventually:

```text
Supabase managed Postgres + pgvector
```

Do not migrate too early. Move once the data model has stabilized enough that JSON is becoming painful.

## Open Questions

- Where is the original StackTrace design project source, if it exists outside this workspace?
- Which local model server will be used on the Mac Mini: LM Studio, llama.cpp server, Ollama-compatible proxy, LocalAI, or another OpenAI-compatible wrapper?
- Which customs-data provider should be tested first?
- Should the first true MVP focus on NVIDIA only, or a 10-company semiconductor/AI hardware basket?
- How should confidence labels be named for users: `candidate`, `source-cited`, `multi-source verified`, etc.?

## Suggested Next Chat Task

Best immediate task for the next chat:

```text
Continue from the handoff docs and build the relationship review table/view, then wire approved/candidate/rejected counts into the dashboard.
```
