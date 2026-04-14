# StackTrace

Supply chain intelligence for retail investors.

Type any public company name. Get a visual supply chain map, a health score from 0-10, and plain English risk flags — in seconds.

## What This Is

StackTrace maps the hidden supply chain behind every publicly traded company by combining SEC filings, US Customs data, government contracts, and patent records. It translates raw data into a single health score and actionable risk flags so individual investors can spot supply chain risk before it hits the stock price.

## Who It's For

Retail investors and individual analysts who want institutional-grade supply chain visibility without a Bloomberg terminal or a compliance background.

## Design Principles

- **Data accuracy over feature breadth.** Every data point cites its primary source document, filing date, and confidence score. No relationship is displayed without a traceable origin.
- **Pipeline before UI.** Build sequence is: validate extraction quality → working data pipeline → functional graph on real data → UI polish. Never the reverse.
- **Free tier built for virality.** The free tier is genuinely useful so users share supply chain graphs during news events. Virality is the distribution strategy.
- **Politically neutral by design.** Stack Trace surfaces factual exposure data — tariff schedules, sanction flags, concentration metrics — with no editorial framing. The data is equally useful regardless of a user's view on the underlying policy.
- **Retail-first, always.** No institutional enterprise sales. The Analyst tier is self-serve only with explicit caps on team size and API usage. The product is designed for individual investors and independent analysts.

## What You Get

- **Supply chain spider map** — visual graph of a company's key suppliers, sub-suppliers, and geographic concentration
- **Health score (0-10)** — composite score reflecting supplier diversification, geographic risk, financial stability, and dependency concentration
- **Risk flags in plain English** — "65% of raw materials sourced from a single region" instead of jargon
- **Contagion alerts** — get notified when any node in a tracked company's supply chain files a material 8-K, receives a new sanction designation, or falls under a new tariff schedule — before the downstream impact hits the stock price. Available on paid tiers.
- **Portfolio view** — monitor supply chain health across your entire portfolio (paid tier)
- **Government policy overlay** — every supply chain node flagged in real time against active tariff schedules (Federal Register), OFAC SDN List, and Commerce Department Entity List. Nodes color-coded by exposure level.
- **Timeline scrubber** — drag to any historical quarter to see the supply chain graph as it existed at that point in time. Every relationship is timestamped to its source filing date.
- **One-click shareable graphs** — export any supply chain graph as a shareable image for X, Reddit, or PDF report inclusion.

## Health Score

Every company receives a composite supply chain health score from **0-10**. Lower scores indicate higher risk.

The score is calculated across four dimensions:

| Dimension | What It Measures |
|-----------|-----------------|
| Geographic concentration | % of supply chain nodes concentrated in a single country or region |
| Supplier diversification | Number of independent suppliers per component category |
| Dependency concentration | % of a critical input sourced from a single supplier |
| Policy exposure | Number of supply chain nodes currently subject to active tariffs, sanctions, or export controls |

Full weighting logic and scoring formula documented in [docs/SCORING.md](docs/SCORING.md).

> **Note:** The health score is an informational tool derived from public data. It is not investment advice.

## Data Sources

All free, public data:

| Source | What It Provides |
|--------|-----------------|
| SEC EDGAR | 10-K/10-Q filings, 8-K event disclosures, supplier mentions |
| ImportYeti | US Customs Bill of Lading records — who ships what to whom |
| USPTO PatentsView | Patent filings — technology dependencies and co-innovation |
| Federal Register | Active tariff schedules by HTS code and country of origin |
| OFAC SDN List | Sanctioned entity designations — flagged directly on supply chain graph nodes |
| Commerce Dept Entity List | Export control designations, critical for semiconductor supply chain mapping |

> **Note:** Government contract data (USASpending.gov) is scoped to Phase 2 for government-exposed sectors. It does not meaningfully contribute to supply chain mapping for the initial 50-ticker MVP scope (consumer tech, semiconductors, automotive).

## Entity Resolution

Supplier names appear differently across data sources — "Samsung SDI Co. Ltd" in an EDGAR filing, "Samsung SDI" in a customs record, "SDI Corporation" in a patent filing. StackTrace uses vector similarity matching (pgvector) to resolve these variations into unified entities across all sources. This cross-source validation layer is what makes the graph trustworthy. See [docs/ENTITY_RESOLUTION.md](docs/ENTITY_RESOLUTION.md) for full methodology.

## Data Accuracy & Source Attribution

Every relationship in the supply chain graph is traceable to a primary source document. When you click any node or edge in the graph, the source panel shows:

- The originating document (e.g., "Tesla 10-K, FY2024, Risk Factors section")
- The filing or record date
- The data source (EDGAR / Customs / USPTO / Federal Register)
- A confidence score based on cross-source validation

Relationships confirmed by multiple independent sources are marked **verified**. Single-source relationships are marked **unconfirmed** until validated. StackTrace does not display hallucinated or inferred relationships — every edge in the graph has a document citation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Data pipeline | Python (extraction, NLP, scoring) |
| API | Node.js / Express |
| Frontend | React |
| Database | PostgreSQL with pgvector |
| LLM | Claude API (extraction and classification) |

> **Build sequence note:** Application code will not be written until LLM extraction quality is validated against ground truth supply chain data. The pipeline layer is built and validated before any frontend work begins.

## Repository Structure

```
StackTrace/
├── README.md
├── PRD.md                          # Product requirements document
├── ARCHITECTURE.md                 # Technical architecture decisions
├── ROADMAP.md                      # Phased build plan
├── docs/
│   ├── DATA_SOURCES.md             # Detailed data source documentation
│   ├── SCHEMA.md                   # PostgreSQL database schema
│   ├── ENTITY_RESOLUTION.md        # Entity matching methodology
│   ├── PROMPTS.md                  # LLM prompt library
│   └── SCORING.md                  # Health score methodology and weighting logic
├── pipeline/                       # Python data pipeline (TBD)
├── api/                            # Node.js API server (TBD)
├── web/                            # React frontend (TBD)
├── .env.example
└── .gitignore
```

## MVP Scope

The initial launch covers the **50 highest-tariff-exposure tickers** in the following sectors:

- Consumer electronics (AAPL, DELL, HPQ, etc.)
- Semiconductors (NVDA, AMD, INTC, QCOM, TSM, etc.)
- Automotive (TSLA, F, GM, etc.)
- Retail importers (AMZN, WMT, NKE, etc.)

**Data sources for MVP:** SEC EDGAR and USPTO PatentsView only. US Customs (ImportYeti) is added in Phase 2 once revenue justifies the data feed. Government policy overlay (Federal Register, OFAC, Commerce Entity List) is included from MVP launch as it is free and public.

Full ticker coverage expands in Phase 2 after MVP validation.

## Current Status

**Pre-development — documentation and architecture phase.**

No application code exists yet. Current focus is:

1. Validating LLM extraction quality against known supply chain data (ground truth test on Tesla / Apple 10-K before pipeline build begins)
2. Finalizing architecture documentation
3. Defining the health score methodology (see SCORING.md)

See [ROADMAP.md](ROADMAP.md) for the full phased build plan.

## Pricing

| Tier | Price | Includes |
|------|-------|----------|
| Free | $0/forever | Tier 1 graph only, top 50 tickers, unlimited views, no alerts |
| Pro | $229-$299/yr (billed annually) | Full Tier 1/2/3 graph depth, contagion alerts, timeline scrubber, tariff/sanction overlay |
| Analyst | $799-$999/yr (billed annually) | Everything in Pro + AI supply chain memo layer, API access — for independent analysts, newsletter writers, and small RIAs only. Self-serve. No enterprise sales. |

## Quick Start

> Application code has not been written yet. This section will be updated when the pipeline, API, and frontend are buildable.

```bash
# Clone the repo
git clone https://github.com/your-org/StackTrace.git
cd StackTrace

# Copy environment variables
cp .env.example .env

# Fill in your API keys in .env, then:
# Pipeline setup (Python)
cd pipeline && pip install -r requirements.txt

# API setup (Node.js)
cd ../api && npm install

# Frontend setup (React)
cd ../web && npm install
```

> Quick Start will be populated when Phase 1 pipeline code is complete. Subscribe to repo updates or follow [@StackTraceApp] on X for build progress.

## License

See [LICENSE](LICENSE).
