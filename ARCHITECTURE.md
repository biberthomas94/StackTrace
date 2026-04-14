# StackTrace — Architecture Decisions

This document records the key technical decisions behind StackTrace's architecture, the reasoning behind each, and the trade-offs accepted.

---

## Repository Structure

```
StackTrace/
├── pipeline/           # Python — data extraction, LLM calls, scoring
│   ├── extractors/     # Per-source extraction modules (edgar, importyeti, etc.)
│   ├── resolvers/      # Entity resolution and normalization
│   ├── scoring/        # Health score calculation
│   ├── prompts/        # Prompt templates for LLM extraction
│   └── jobs/           # Batch job scripts (pre-process S&P 500, cache refresh)
├── api/                # Node.js — REST API serving frontend
│   ├── routes/         # Express route handlers
│   ├── middleware/     # Auth, rate limiting, usage tracking
│   ├── services/       # Business logic layer
│   └── db/             # Database queries and connection management
├── web/                # React — frontend SPA
│   ├── components/     # Reusable UI components
│   ├── pages/          # Page-level components
│   ├── hooks/          # Custom React hooks
│   └── utils/          # Frontend utilities
├── shared/             # Shared constants, types, configs used by both api and pipeline
├── docs/               # Documentation
└── scripts/            # Dev scripts, database migrations, seed data
```

### Why This Structure

**Python pipeline + Node.js API instead of all-Python or all-Node:**

The pipeline is compute-heavy, sequential, and benefits from Python's ecosystem for text processing, NLP, and data manipulation (BeautifulSoup for HTML parsing, pandas for data wrangling, httpx for async HTTP). The API is I/O-heavy, concurrent, and benefits from Node's event loop for handling many simultaneous user requests with low latency.

The two never run in the same process. The pipeline writes to PostgreSQL. The API reads from PostgreSQL. They share a database, not a runtime. This is a clean separation that lets each layer use the best tool for its job.

**Monorepo instead of separate repos:**

At this stage, one developer is building everything. Separate repos add coordination overhead (cross-repo PRs, version pinning, deployment synchronization) with no benefit. The monorepo keeps all documentation, schema migrations, and shared configuration in one place. If the team grows beyond 3-4 engineers, splitting into separate repos becomes worth discussing.

---

## PostgreSQL Over Neo4j

Supply chain data is a graph. Neo4j is a graph database. Using PostgreSQL instead of Neo4j is a deliberate trade-off.

### Why PostgreSQL Wins Here

1. **Query patterns are simple.** The product shows a company's tier-1 suppliers and optionally tier-2. That's a one-hop or two-hop join. PostgreSQL handles this with a single recursive CTE or two joins. We don't need Cypher's arbitrary-depth traversals.

2. **The data is relational beyond the graph.** Users, subscriptions, search history, audit logs, extraction metadata — all naturally relational. Using Neo4j for the graph means also running PostgreSQL (or equivalent) for everything else. Two databases doubles operational complexity.

3. **pgvector for entity resolution.** We need vector similarity search to match company name variants. pgvector is a PostgreSQL extension. Using Neo4j would mean adding a third system (a vector store) or using Neo4j's less mature vector support.

4. **Operational simplicity.** One database to back up, monitor, tune, and pay for. PostgreSQL is available as a managed service on every cloud provider. Neo4j managed (Aura) is more expensive and less flexible.

5. **Familiarity.** The founder has production experience with PostgreSQL. Learning Neo4j adds risk to the timeline with no compensating benefit at this data scale.

### When This Decision Should Be Revisited

If the product evolves to require deep graph traversals (e.g., "find all companies within 5 hops of a sanctioned entity" or "shortest path between two companies through their supply chains"), a graph database becomes worth the added complexity. That's not in the current roadmap.

---

## Caching Strategy

### Problem

Every search requires pulling SEC filings (large HTML documents), sending text to the Claude API (expensive, slow), running entity resolution, and computing scores. A cold search takes 15-30 seconds and costs ~$0.02-0.05 in API calls. That's unacceptable for user experience and unsustainable at scale.

### Solution: Pre-Process and Cache

**Batch pre-processing:** Run the full extraction pipeline against the S&P 500 companies on a weekly schedule. Store the complete result — supplier graph, health score, risk flags, evidence links — in the `search_cache` table. This covers the companies that 80%+ of retail investors care about.

**Query-time cost: near zero.** When a user searches for "Apple", the API reads from cache. No EDGAR calls, no LLM calls, no computation. Response time: <500ms.

**On-demand fallback:** For companies not in the cache (smaller caps, recent IPOs), the API triggers a synchronous pipeline run. The user sees a loading state for 15-30 seconds. The result is cached for future searches.

### Cache Layers

| Layer | What's Cached | TTL | Storage |
|-------|--------------|-----|---------|
| Search results | Complete supplier graph, scores, flags | 7 days | PostgreSQL `search_cache` table |
| Filing text | Raw extracted sections from 10-K/10-Q | 90 days (filings are annual) | PostgreSQL `extractions` table |
| Entity mappings | Company name → canonical entity | Indefinite (manual refresh) | PostgreSQL `suppliers` table |
| API responses | HTTP response for identical search queries | 1 hour | Redis |

### Cost Model

| Scenario | EDGAR API | Claude API | Total per Search |
|----------|-----------|-----------|-----------------|
| Cache hit | $0 | $0 | $0 |
| Cache miss (on-demand) | $0 (free) | ~$0.03 | ~$0.03 |
| Weekly batch (500 companies) | $0 (free) | ~$15 | ~$15/week |

At $15/week for batch processing, the total LLM cost is ~$60/month to keep the S&P 500 current. This is well within budget and scales linearly with the number of pre-processed companies.

---

## LLM Extraction Approach

### Why LLM Instead of Rule-Based NLP

SEC filings don't follow a consistent structure. Supplier names appear in different contexts, with different phrasing, across different sections. Rule-based NER (named entity recognition) can extract company names, but can't determine:

- Whether a named company is a supplier, customer, competitor, or partner
- The type of relationship (raw materials, manufacturing, logistics, technology licensing)
- The relative importance of the relationship

An LLM can read a paragraph like "We depend on Taiwan Semiconductor Manufacturing Company for the fabrication of substantially all of our chip designs" and extract: `{supplier: "Taiwan Semiconductor Manufacturing Company", relationship: "chip fabrication", dependency_level: "high"}`.

### Confidence Scoring

Every extraction includes a confidence score (0.0-1.0) assigned by the LLM based on:

- **Explicit mention** (0.85-1.0): The filing directly names a supplier in a supply chain context
- **Strong implication** (0.65-0.84): The filing describes a dependency without naming the specific entity, but context makes identification clear
- **Weak inference** (0.40-0.64): The LLM infers a relationship from indirect evidence (e.g., patent co-filings, geographic references)
- **Below threshold** (<0.40): Not stored

### Hallucination Prevention

LLMs can fabricate supplier names that sound plausible but don't appear in the source text. Mitigation strategy:

1. **Source anchoring:** The prompt instructs the LLM to quote the exact sentence where each supplier is mentioned. If the quoted text doesn't appear in the source document (fuzzy match, allowing for minor formatting differences), the extraction is flagged.

2. **Known entity validation:** Extracted names are checked against a known entity database (public company list from SEC, plus accumulated entities from prior extractions). Unknown entities aren't rejected but get a confidence penalty (-0.1).

3. **Cross-filing validation:** If the same supplier appears in multiple filings from the same company (e.g., 10-K and 10-Q from different periods), confidence increases (+0.1). This is checked during batch processing.

4. **Human review queue:** Extractions with confidence between 0.4 and 0.6 and no source anchor match are queued for manual review. At scale, this becomes a training data source for fine-tuning.

---

## Entity Resolution

### Problem

The same company appears under different names across data sources:

- SEC filing: "Taiwan Semiconductor Manufacturing Company, Limited"
- Customs record: "TSMC"
- Government contract: "Taiwan Semiconductor Mfg Co Ltd"
- Patent filing: "Taiwan Semiconductor Manufacturing Co."

These all need to resolve to a single canonical entity.

### Approach

Entity resolution uses a three-tier matching strategy:

1. **Exact match** after normalization (lowercase, remove punctuation, standardize suffixes like Inc/Corp/Ltd) — fast, high precision
2. **Fuzzy string match** using Levenshtein distance and token-set similarity — catches abbreviations and word order variations
3. **Vector similarity** using pgvector embeddings of company names — catches semantic equivalents that string matching misses

See [docs/ENTITY_RESOLUTION.md](docs/ENTITY_RESOLUTION.md) for the full methodology.

### Why Not a Third-Party Entity Resolution Service

Services like OpenCorporates or Dun & Bradstreet provide entity resolution, but:
- They cost money (per-lookup pricing erodes margins)
- They add an external dependency to the critical path
- The entity resolution problem for StackTrace is narrow (US public companies + their named suppliers), not the full global corporate graph
- Building it in-house creates a compounding asset: every resolved entity improves future matching

---

## Why Free Data Sources First

### Strategic Reasoning

1. **Validate demand before spending.** If retail investors don't care about supply chain data presented this way, it doesn't matter how good the data is. Free sources are sufficient to test the hypothesis.

2. **Free sources are substantial.** SEC EDGAR contains every public company's detailed risk disclosures. ImportYeti has US customs records for millions of shipments. USASpending.gov has every federal contract. These aren't toy datasets.

3. **Paid data is a moat, not a foundation.** Once the product has paying users and validated demand, adding Bloomberg Supply Chain, Panjiva, or FactSet data creates a competitive advantage. But paying for data before having revenue is a cash burn risk.

4. **LLM extraction is the differentiator, not raw data.** The raw data is the same data available to anyone. The value is in the extraction, resolution, scoring, and presentation. That's the product, and it's built entirely on top of the pipeline, not the data source.

### Planned Paid Sources (Phase 4+)

| Source | What It Adds | Estimated Cost | Trigger to Add |
|--------|-------------|----------------|---------------|
| Bloomberg SPLC | Verified supplier relationships | ~$2,000/month | 500+ paid subscribers |
| Panjiva | Global trade data beyond US customs | ~$1,500/month | International expansion |
| FactSet Supply Chain | Pre-built relationship graphs | ~$3,000/month | Enterprise tier launch |
| Altana Atlas | AI-mapped global supply chain | Custom pricing | Series A fundraise |

---

## Infrastructure Decisions

### Deployment Target: Railway or Render (MVP)

For MVP, use a single-provider PaaS that supports both Python and Node.js services with managed PostgreSQL and Redis. Railway and Render both fit. No Kubernetes, no AWS multi-service orchestration — that's premature complexity.

### Why Not Serverless

The pipeline runs long-running batch jobs (minutes to hours). The API benefits from persistent database connection pools. Neither maps well to serverless functions. A persistent process model (containers or VMs) is simpler and more predictable.

### Why Not Microservices

One developer. Three conceptual services (pipeline, API, frontend) are already separated into directories with their own dependency management. They deploy independently. That's enough service separation. Adding API gateways, service meshes, or message queues adds complexity without adding capability at this scale.
