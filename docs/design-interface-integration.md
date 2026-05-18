# StackTrace Design Interface Integration

The current MVP data service exposes the same workflow the final StackTrace design interface should use.

## Local API

Start the review server:

```powershell
cd "C:\Users\biber\Documents\Codex\2026-04-27\files-mentioned-by-the-user-stacktrace"
npm.cmd run graph:serve
```

Base URL:

```text
http://localhost:4173
```

## Endpoints

```text
GET  /api/graph
GET  /api/graph-with-reviews
GET  /api/graph/approved
GET  /api/reviews
POST /api/reviews
```

Use `/api/graph-with-reviews` for the internal review/buildout interface.

Use `/api/graph/approved` for investor-facing views where rejected or unreviewed relationships should not appear.

## Frontend Client

The reusable client lives at:

```text
src/stacktrace-api-client.mjs
```

For a React/React Flow design interface:

```js
import {
  fetchStackTraceGraph,
  saveRelationshipReview,
  toReactFlowElements,
} from "./stacktrace-api-client.mjs";

const graph = await fetchStackTraceGraph("http://localhost:4173");
const { nodes, edges } = toReactFlowElements(graph);

await saveRelationshipReview(
  {
    edgeId: selectedEdge.id,
    status: "approved",
    notes: "Confirmed from SEC 10-K evidence.",
    reviewer: "Thomas",
  },
  "http://localhost:4173",
);
```

## Data Contract

Each edge carries evidence and review state:

```json
{
  "id": "edge:nvda-tsmc-foundry-2026-02-25",
  "source": "company:nvda",
  "target": "entity:tsmc",
  "type": "foundry",
  "confidence": "verified_from_single_source",
  "evidence": [
    {
      "sourceSystem": "SEC EDGAR",
      "sourceForm": "10-K",
      "sourceDate": "2026-02-25",
      "quote": "..."
    }
  ],
  "review": {
    "status": "approved",
    "notes": "Confirmed.",
    "reviewer": "Thomas",
    "updatedAt": "..."
  }
}
```

## Migration Path

1. JSON file persistence now.
2. Supabase/Postgres table later.
3. Same frontend endpoints and edge shape.

Suggested Postgres tables:

```text
entities
relationships
relationship_evidence
relationship_reviews
```

The design interface should not care whether persistence is JSON or Postgres as long as these endpoints keep the same response shape.
