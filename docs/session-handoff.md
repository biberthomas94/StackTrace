# StackTrace MVP Session Handoff

Last updated: 2026-05-03

## Project Path

```text
C:\Users\biber\OneDrive\Desktop\StackTrace
```

## Product Direction

StackTrace is being built as a supply-chain intelligence product for retail equity investors. The MVP focuses on source-cited public-company supplier relationships, starting with SEC EDGAR evidence and expanding later into customs data, patent data, earnings-call transcripts, OFAC/export-control lists, tariff exposure, and policy overlays.

The working product shape is:

```text
Raw source data
-> extracted relationship candidates
-> evidence-backed graph edges
-> human review workflow
-> approved supplier network
-> investor-facing StackTrace dashboard
```

## Current Working Prototype

Local app URL:

```text
http://localhost:4173
```

Run from the project path:

```powershell
npm.cmd run graph:serve
```

Regenerate the current graph and dashboard:

```powershell
npm.cmd run graph:seed
npm.cmd run graph:render
```

Pull fresh SEC company reports:

```powershell
npm.cmd run sec:report -- NVDA TSLA AAPL --limit 1 --forms 10-K
```

## What Has Been Built

- SEC EDGAR pipeline that resolves tickers, pulls submissions/company facts, downloads filings, extracts rough filing text, and creates company report JSON.
- Initial EDGAR-backed supplier relationship seed file.
- Graph builder that converts relationship seeds into nodes/edges/evidence JSON.
- StackTrace-style dashboard UI at `localhost:4173`, modeled after the planned dark supplier-network interface.
- Evidence drawer showing selected relationship evidence.
- Review persistence flow with statuses: `candidate`, `approved`, `rejected`.
- JSON-backed local review store.
- API endpoints for future frontend integration.
- Local-model extraction hook for an OpenAI-compatible model endpoint.

## Key Files

```text
package.json
README.md

src/sec-pipeline.js
src/extract-candidates.js
src/build-network-map.js
src/render-stacktrace-dashboard.js
src/render-network-map.js
src/review-server.js
src/stacktrace-api-client.mjs

prompts/relationship-extraction.md

data/seeds/edgar-relationships.json
data/processed/graphs/edgar-seed.graph.json
data/processed/graphs/edgar-seed.graph.html
data/processed/graphs/edgar-seed.graph.svg
data/processed/reviews/relationship-reviews.json

docs/design-interface-integration.md
docs/session-handoff.md
docs/next-actions.md
docs/architecture-notes.md
```

## Current Evidence-Backed Relationships

From SEC EDGAR 10-K evidence:

```text
NVDA -> TSMC: foundry / wafer production
NVDA -> Samsung Electronics: foundry / wafer production
NVDA -> SK Hynix: memory supplier
NVDA -> Micron: memory supplier
NVDA -> Hon Hai Precision / Foxconn: contract manufacturer
NVDA -> Wistron: contract manufacturer
NVDA -> Fabrinet: contract manufacturer
TSLA -> Panasonic: battery-cell supplier
TSLA -> CATL: battery-cell supplier
```

Important caveat: exposure estimates, policy flags, and deeper tiers in the current dashboard are placeholders or partial UI scaffolding until customs, policy, transcript, and patent data are connected.

## API Endpoints

Served by `src/review-server.js`:

```text
GET  /api/graph
GET  /api/graph-with-reviews
GET  /api/graph/approved
GET  /api/reviews
POST /api/reviews
```

Use:

```text
/api/graph-with-reviews
```

for the internal build/review UI.

Use:

```text
/api/graph/approved
```

for investor-facing views where unreviewed/rejected edges should be hidden.

## Review Persistence

Review decisions are saved locally to:

```text
data/processed/reviews/relationship-reviews.json
```

Current persistence is JSON by design for the prototype. Later migration target is Supabase/Postgres.

## Local Model Extraction Hook

The extraction script expects an OpenAI-compatible local model endpoint:

```powershell
$env:LLM_BASE_URL="http://127.0.0.1:1234/v1"
$env:LLM_MODEL="your-local-model-name"
$env:LLM_API_KEY="not-needed"

npm.cmd run extract:candidates -- NVDA
```

This was added for the user's Mac Mini/local OpenCL model setup. It has not yet been fully exercised in this Windows workspace.

## Important Context From Prior Discussion

- The MVP should be evidence-first, not UI-first.
- SEC filings are useful for named relationships, confirmation, risk language, and source citations, but they are sparse and uneven.
- Customs data is expected to become the primary discovery layer.
- Patent data should be treated as technology/relationship signals, not direct supply-chain proof by itself.
- Future database should be organized around `entities`, `relationships`, `relationship_evidence`, `relationship_reviews`, and source-specific tables.
- The user likes the StackTrace cockpit-style UI: left watchlist/alerts, central supplier network, bottom relationship flow, right selected evidence drawer.

## New Chat Startup Prompt

Paste this into a new Codex chat:

```text
Please continue the StackTrace MVP from the existing project. Start by reading:

C:\Users\biber\OneDrive\Desktop\StackTrace\docs\session-handoff.md
C:\Users\biber\OneDrive\Desktop\StackTrace\docs\next-actions.md
C:\Users\biber\OneDrive\Desktop\StackTrace\docs\architecture-notes.md

Project path:
C:\Users\biber\OneDrive\Desktop\StackTrace

The local app is served at:
http://localhost:4173

Please inspect the current repo state before making changes, preserve existing work, and continue from the next-actions list.
```
