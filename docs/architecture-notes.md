# StackTrace MVP Architecture Notes

Last updated: 2026-05-03

Canonical project path:

```text
C:\Users\biber\OneDrive\Desktop\StackTrace
```

## Guiding Principle

StackTrace should be evidence-first.

No supplier relationship should become trusted graph data unless it has source evidence attached. Models can propose candidates, but source records and human review decide whether the edge becomes part of the trusted dataset.

## Current Architecture

```text
SEC EDGAR
  -> src/sec-pipeline.js
  -> data/raw/sec/
  -> data/processed/sec/
  -> data/processed/reports/*.company-report.json

Manual EDGAR relationship seed
  -> data/seeds/edgar-relationships.json
  -> src/build-network-map.js
  -> data/processed/graphs/edgar-seed.graph.json

Dashboard renderer
  -> src/render-stacktrace-dashboard.js
  -> data/processed/graphs/edgar-seed.graph.html

Review server
  -> src/review-server.js
  -> http://localhost:4173
  -> data/processed/reviews/relationship-reviews.json
```

## Current Graph Shape

```json
{
  "nodes": [
    {
      "id": "company:nvda",
      "type": "public_company",
      "label": "NVIDIA CORP",
      "ticker": "NVDA"
    },
    {
      "id": "entity:taiwan-semiconductor-manufacturing-company-limited",
      "type": "supply_chain_entity",
      "label": "Taiwan Semiconductor Manufacturing Company Limited",
      "aliases": ["TSMC"]
    }
  ],
  "edges": [
    {
      "id": "edge:nvda-taiwan-semiconductor-manufacturing-company-limited-foundry-2026-02-25",
      "source": "company:nvda",
      "target": "entity:taiwan-semiconductor-manufacturing-company-limited",
      "type": "foundry",
      "direction": "source_uses_target",
      "confidence": "verified_from_single_source",
      "evidence": [
        {
          "sourceSystem": "SEC EDGAR",
          "sourceForm": "10-K",
          "sourceDate": "2026-02-25",
          "sourcePath": "data/processed/sec/NVDA/filings/2026-02-25_10-K_000104581026000021.txt",
          "sourceLine": 288,
          "quote": "..."
        }
      ]
    }
  ]
}
```

## API Contract

Internal review UI:

```text
GET /api/graph-with-reviews
```

Returns the graph with review state merged into each edge:

```json
{
  "edges": [
    {
      "id": "edge:...",
      "review": {
        "edgeId": "edge:...",
        "status": "candidate",
        "notes": "",
        "reviewer": "",
        "updatedAt": ""
      }
    }
  ]
}
```

Investor-facing graph:

```text
GET /api/graph/approved
```

Returns only edges whose review status is `approved`, plus only the nodes needed by those approved edges.

Save review decision:

```text
POST /api/reviews
```

Body:

```json
{
  "edgeId": "edge:...",
  "status": "approved",
  "notes": "Confirmed from source quote.",
  "reviewer": "local-reviewer"
}
```

## Future Postgres Schema

Recommended core tables:

```text
entities
entity_aliases
relationships
relationship_evidence
relationship_reviews
source_documents
filings
shipments
policy_flags
ip_assets
ip_events
transcripts
```

### entities

```text
id
canonical_name
entity_type: public_company | private_company | university | person | government | unknown
ticker
cik
lei
country
created_at
updated_at
```

### entity_aliases

```text
id
entity_id
alias
source_system
confidence
created_at
```

### relationships

```text
id
source_entity_id
target_entity_id
relationship_type
direction
confidence
first_seen_at
last_seen_at
created_at
updated_at
```

### relationship_evidence

```text
id
relationship_id
source_system
source_document_id
source_date
quote_or_record
source_url
raw_ref
confidence_contribution
created_at
```

### relationship_reviews

```text
id
relationship_id
status: candidate | approved | rejected
notes
reviewer
updated_at
```

### source_documents

```text
id
source_system
source_type
source_url
local_path
retrieved_at
document_date
metadata_json
```

### ip_assets

Patent/public IP assets should be linked to entities as signals, not treated as direct supply-chain proof.

```text
id
jurisdiction
asset_type: patent_application | granted_patent | trademark | design
publication_number
application_number
patent_number
title
abstract
filing_date
publication_date
grant_date
status
cpc_codes
assignee_entity_id
applicant_entity_id
raw_source_id
created_at
updated_at
```

### ip_events

```text
id
ip_asset_id
event_type: filed | published | assigned | abandoned | granted | office_action | continuation | maintenance
event_date
source_system
source_url
raw_payload
created_at
```

## Evidence Sources and Intended Role

### SEC EDGAR

Role:

```text
Confirmation, named relationships, risk factors, customer/supplier concentration language, source citations.
```

Strength:

```text
High credibility, sparse coverage.
```

### Customs Data

Role:

```text
Primary discovery layer for supplier/import relationships.
```

Strength:

```text
Potentially broad, but requires licensing validation and careful entity resolution.
```

### Patents / USPTO

Role:

```text
Technology relationship signals, assignee/applicant networks, co-assignment, citations, innovation direction.
```

Strength:

```text
Useful for opportunity discovery, not direct supplier proof.
```

### Earnings Call Transcripts

Role:

```text
Context, management commentary, recent changes, supply/demand constraints.
```

Strength:

```text
Timely, often qualitative.
```

### Policy Lists

Role:

```text
Risk overlay: OFAC, BIS/Commerce, tariff-related exposure, export controls.
```

Strength:

```text
High user value, but needs careful distinction between confirmed list matches and possible exposure.
```

## Confidence Model

Current label:

```text
verified_from_single_source
```

Future recommendation:

```text
candidate
source_cited
multi_source_verified
reviewed_verified
rejected
stale
```

Confidence should consider:

```text
source credibility
source count
source recency
relationship specificity
entity-resolution certainty
human review status
```

## Migration Guidance

Keep the JSON prototype until:

- Candidate volume grows beyond easy manual review.
- Review state needs user accounts or multi-reviewer history.
- Entity resolution requires durable aliases and embeddings.
- Patent/customs/policy tables need indexing.

Then migrate to Supabase/Postgres with `pgvector` for entity matching.
