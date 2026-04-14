# StackTrace — Product Requirements Document

## Product Overview

StackTrace is a supply chain intelligence tool for retail investors. It takes a public company name as input and returns a visual supply chain map, a composite health score (0-10), and plain English risk flags. The goal is to give individual investors visibility into supply chain risk — something currently locked behind expensive institutional tools — using entirely free, public data sources.

### Mission

Make supply chain risk visible to every investor, not just institutions with six-figure data budgets.

### Problem

When a key supplier to Apple, Toyota, or any public company has a factory fire, goes bankrupt, or gets hit with sanctions, the stock moves before most retail investors understand why. Supply chain data exists in public filings, customs records, and government databases, but it's scattered across multiple sources, written in legal/regulatory language, and requires hours of manual research to assemble.

### Solution

StackTrace automates the work of a supply chain analyst: it pulls data from SEC filings, customs records, government contracts, and patent databases, uses LLM extraction to identify supplier relationships, scores the health of the supply chain, and presents everything in a visual, plain English interface.

---

## Target Customer

**Primary:** Retail investors who actively research individual stocks before buying. They read 10-K filings or at least skim earnings calls. They use tools like Finviz, Seeking Alpha, or Yahoo Finance. They want to understand what they own but don't have access to institutional supply chain databases.

**Secondary:** Individual financial analysts, investment bloggers, and newsletter writers who cover specific sectors and want supply chain data to support their analysis.

**Explicitly not:** Institutional investors (they have existing tools), compliance teams (different product — that's RegForge), or passive index fund investors (they don't research individual companies).

---

## User Stories

### Core Search Flow

1. **As a retail investor**, I want to type a company name and immediately see who their key suppliers are, so I can understand the company's supply chain dependencies.

2. **As a retail investor**, I want to see a single health score (0-10) for a company's supply chain, so I can quickly assess whether supply chain risk is something I need to worry about.

3. **As a retail investor**, I want risk flags written in plain English, so I don't need a supply chain or compliance background to understand the risks.

4. **As a retail investor**, I want to see a visual map of the supply chain, so I can understand geographic concentration and supplier relationships at a glance.

### Alerts

5. **As a Pro subscriber**, I want to receive an email when a key supplier in my search history files an 8-K (material event), so I'm not caught off guard by supply chain disruptions.

### Portfolio

6. **As a Premium subscriber**, I want to add multiple companies to a portfolio view, so I can monitor supply chain health across all my positions.

7. **As a Premium subscriber**, I want to see which suppliers appear across multiple portfolio companies, so I can understand concentration risk in my portfolio.

### Account

8. **As a free user**, I want to search 3 times per month without creating an account, so I can evaluate the product before committing.

9. **As a user**, I want to upgrade to a paid plan with my credit card, so I can unlock more searches and alerts.

---

## MVP Feature List

### Must Have (Launch Blockers)

- Company search by name with autocomplete from pre-processed company list
- Supplier extraction from SEC 10-K and 10-Q filings
- Supply chain spider map visualization (company at center, suppliers as nodes)
- Health score (0-10) displayed as hero card
- Plain English risk flags (minimum 3 flag types: geographic concentration, supplier concentration, financial instability)
- Search result caching — pre-process top 500 S&P companies so results are instant
- Basic user authentication (email/password)
- Free tier with 3 searches/month (no account required for first search)
- Stripe integration for Pro ($12.99/mo) and Premium ($24.99/mo) tiers
- Mobile-responsive design
- Rate limiting on API

### Nice to Have (Post-Launch)

- ImportYeti customs data integration (adds physical shipment data to filing-based relationships)
- USASpending.gov government contract data
- USPTO patent co-filing data
- 8-K alert emails for Pro and Premium subscribers
- Portfolio view for Premium subscribers
- Search history for logged-in users
- PDF export of supply chain report
- Supplier detail drill-down (click a supplier node to see underlying evidence)
- Dark mode

### Explicitly Out of Scope

- Real-time stock price integration or trading signals
- Institutional API access or bulk data licensing
- Compliance or sanctions screening (that's RegForge)
- Non-US companies or non-English filings
- Supply chain optimization recommendations
- Competitor analysis or market share data
- Mobile native apps (web only, but mobile-responsive)

---

## Data Sources

| Source | What It Provides | MVP? |
|--------|-----------------|------|
| SEC EDGAR | 10-K, 10-Q full text; 8-K event filings; company metadata (CIK, SIC codes) | Yes |
| ImportYeti | US Customs Bill of Lading records: shipper, consignee, goods description, origin | Post-MVP |
| USASpending.gov | Federal contract awards: awardee, amount, agency, NAICS code | Post-MVP |
| USPTO PatentsView | Patent filings: assignee, co-inventors, patent classifications | Post-MVP |

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for full API documentation.

---

## Extraction Pipeline

### Overview

The pipeline runs as a batch process against SEC EDGAR filings. For the MVP, it pre-processes filings for the S&P 500 and caches the results. On-demand extraction handles any company not in the cache.

### Pipeline Steps

1. **Company Resolution** — Match user input to an SEC CIK number using the EDGAR company search endpoint. Handle common variants (e.g., "Apple" → Apple Inc., CIK 0000320193).

2. **Filing Retrieval** — Pull the most recent 10-K filing (annual report) for the resolved CIK. Fall back to 10-Q (quarterly) if no 10-K exists within the last 18 months.

3. **Section Extraction** — Extract the "Risk Factors" section (Item 1A) and the "Business" section (Item 1) from the filing. These sections contain the highest density of supplier mentions.

4. **LLM Supplier Extraction** — Send extracted sections to Claude API with a structured prompt that requests supplier names, relationship types, and confidence scores. See [docs/PROMPTS.md](docs/PROMPTS.md) for prompt templates.

5. **Entity Resolution** — Normalize extracted supplier names against known entities. Match "TSMC", "Taiwan Semiconductor", and "Taiwan Semiconductor Manufacturing Co., Ltd." to the same entity. See [docs/ENTITY_RESOLUTION.md](docs/ENTITY_RESOLUTION.md).

6. **Enrichment** — For each resolved supplier, check if they are also a public company (have their own CIK). If so, pull their filing data to create second-tier supplier links and financial health indicators.

7. **Scoring** — Calculate the composite health score using the methodology below.

8. **Caching** — Store the complete result (supplier graph, scores, flags) in the search_cache table with a 7-day TTL.

---

## Health Score Methodology

The health score is a composite 0-10 score where 10 is the healthiest (most resilient) supply chain and 0 is the most fragile.

### Component Scores (each 0-10, weighted)

| Component | Weight | What It Measures | How It's Calculated |
|-----------|--------|-----------------|-------------------|
| Supplier Diversification | 30% | How many distinct suppliers a company has | Scaled from count of unique suppliers. <5 suppliers = 2, 5-15 = 5, 15-30 = 7, 30+ = 9. Adjusted down if any single supplier represents >40% of mentions. |
| Geographic Spread | 25% | How concentrated suppliers are in one country or region | Herfindahl index across supplier countries. HHI < 0.15 = 9, 0.15-0.30 = 7, 0.30-0.50 = 5, 0.50-0.75 = 3, >0.75 = 1. |
| Tier Depth | 15% | Whether sub-supplier relationships are visible | Score based on how many tier-2+ suppliers are identified. 0 tier-2 = 3, 1-5 = 5, 5-15 = 7, 15+ = 9. |
| Financial Stability | 15% | Whether key suppliers are financially healthy | For public suppliers: based on recent filing language (going concern mentions, debt ratio mentions). Non-public suppliers get a neutral 5. |
| Data Confidence | 15% | How much data we actually have | Percentage of the score backed by high-confidence extractions (>0.8). Low data = low confidence = score pulled toward 5 (uncertain, not bad). |

### Final Score

```
health_score = (diversification * 0.30) + (geographic * 0.25) + (tier_depth * 0.15) + (financial * 0.15) + (confidence * 0.15)
```

Rounded to one decimal place. Displayed as an integer on the hero card with the decimal available on hover/drill-down.

### Risk Flag Generation

Risk flags are generated from component scores and specific trigger conditions:

| Flag | Trigger Condition | Example Output |
|------|------------------|----------------|
| Single-source dependency | Any supplier represents >50% of relationship mentions | "Over half of disclosed supplier relationships point to a single company (Foxconn)" |
| Geographic concentration | >60% of suppliers in one country | "78% of identified suppliers are based in China" |
| Thin data | Fewer than 3 suppliers extracted with >0.7 confidence | "Limited supplier data available — score based on sparse disclosures" |
| Going concern | Any key supplier's filing mentions "going concern" | "Key supplier (Supplier Name) flagged going concern risk in latest filing" |
| Recent 8-K | Key supplier filed 8-K in last 30 days | "Supplier Name filed a material event disclosure on [date]" |

---

## UI Requirements

### Design Principles

1. **Mobile-first** — Design for phone screens first. Desktop is a wider version, not a different product.
2. **Plain English** — No jargon. No acronyms without explanation. Write for someone who reads Seeking Alpha, not someone who reads compliance manuals.
3. **Score as hero** — The health score is the first and largest element a user sees. Everything else supports it.
4. **Progressive disclosure** — Show the score and flags first. Spider map is one tap/click deeper. Raw evidence is another level deeper.

### Pages

**Search page (home)**
- Single search bar, centered
- Autocomplete dropdown showing matched company names
- Below search bar: "Try: Apple, Tesla, Nike" as suggestion chips
- No login required for first search

**Results page**
- Hero card: company name, health score (large number), one-line summary ("Moderately concentrated supply chain with strong diversification")
- Risk flags section: 2-5 flags as cards with red/yellow/green indicators
- "View Supply Chain Map" button → expands or navigates to spider map
- Spider map: company at center, tier-1 suppliers as connected nodes, tier-2 if available. Nodes colored by risk. Tap a node for detail panel.
- Evidence section (collapsed by default): "Based on [filing name] filed [date]" with link to SEC filing

**Portfolio page (Premium only)**
- List of saved companies with their current health scores
- Sort by score (ascending = most at-risk first)
- Cross-portfolio flag: "3 of your portfolio companies depend on TSMC"

**Account page**
- Current plan and usage (searches used / searches available)
- Upgrade/downgrade buttons
- Alert preferences (Pro and Premium)

### Responsive Breakpoints

- Mobile: < 768px (single column, stacked cards)
- Tablet: 768-1024px (two-column where appropriate)
- Desktop: > 1024px (spider map gets more horizontal space)

---

## Pricing Tiers

| | Free | Pro | Premium |
|---|------|-----|---------|
| Price | $0 | $12.99/month | $24.99/month |
| Searches per month | 3 | 25 | Unlimited |
| Account required | No (first search) | Yes | Yes |
| Health score + risk flags | Yes | Yes | Yes |
| Spider map | Yes | Yes | Yes |
| Search history | No | Yes | Yes |
| 8-K email alerts | No | Yes (up to 10 companies) | Yes (unlimited) |
| Portfolio view | No | No | Yes |
| PDF export | No | No | Yes |

---

## Build Phases

### Phase 1: Data Foundation (Weeks 1-4)

| Week | Deliverable |
|------|------------|
| 1 | SEC EDGAR integration: company search by name, CIK resolution, 10-K full-text retrieval |
| 2 | Filing parser: extract Item 1 (Business) and Item 1A (Risk Factors) from 10-K HTML |
| 3 | LLM extraction pipeline: send sections to Claude, parse structured supplier output, store with confidence scores |
| 4 | Entity resolution: normalize supplier names, deduplicate, link public suppliers to their own CIK. Batch run against S&P 500. |

### Phase 2: Core Product (Weeks 5-10)

| Week | Deliverable |
|------|------------|
| 5 | PostgreSQL schema deployed. API endpoints: search company, get supply chain, get health score |
| 6 | Health score calculation engine. Risk flag generation. |
| 7 | React app: search page, results page with hero score card and risk flags |
| 8 | Spider map visualization (D3.js or similar). Node drill-down panel. |
| 9 | Search caching layer. Pre-process top 500 companies. Performance optimization. |
| 10 | Mobile responsive pass. Cross-browser testing. Error states and loading states. |

### Phase 3: Billing and Launch (Weeks 11-14)

| Week | Deliverable |
|------|------------|
| 11 | User authentication (email/password + OAuth). Account page. |
| 12 | Stripe integration. Subscription management. Usage tracking and enforcement. |
| 13 | Landing page. SEO basics. Analytics (Plausible or similar). |
| 14 | Staging deployment. Bug fixes. Soft launch to waitlist. |

### Phase 4: Growth (Months 4-6)

- 8-K alert system (monitor EDGAR RSS, match against user watchlists, send emails)
- Portfolio view for Premium subscribers
- ImportYeti integration (customs data layer)
- USASpending.gov integration (government contract layer)
- USPTO PatentsView integration (patent co-filing layer)
- Public launch and marketing push

---

## Success Metrics

### Launch (End of Week 14)

- Top 500 S&P companies pre-processed and searchable
- Search returns results in under 3 seconds for cached companies
- On-demand search completes in under 30 seconds for uncached companies
- Health score calculated for every searchable company
- Zero unhandled errors in core search flow

### Month 2

- 500 unique users
- 50 paid subscribers (any tier)
- < 5% churn rate on paid plans
- Average session duration > 2 minutes

### Month 6

- 5,000 unique users
- 500 paid subscribers
- MRR > $5,000
- 3+ data sources integrated
- < 3% monthly churn

---

## Open Questions

1. **Confidence threshold for display** — At what extraction confidence level do we suppress a supplier from appearing in results? Current thinking: show suppliers with >0.5 confidence but visually distinguish low-confidence (0.5-0.7) from high-confidence (>0.7) with dashed vs. solid lines on the spider map.

2. **Score staleness** — How old can cached data be before we force a re-extraction? Current thinking: 7-day TTL on cache, but 90-day TTL on the underlying extraction if the filing hasn't changed (10-Ks are annual).

3. **Private company suppliers** — Many suppliers won't be public companies, so we can't pull their filings. How do we score financial stability for private suppliers? Current thinking: neutral score (5/10) with a "limited data" flag.

4. **International suppliers** — We're starting US-only, but many suppliers are international (TSMC, Samsung). Do we attempt to resolve foreign filings? Current thinking: no foreign filings in MVP, but use customs data (ImportYeti) in Phase 4 to add international supplier context.

5. **Hallucination risk** — LLMs may extract supplier names that don't actually exist in the filing. How aggressively do we validate? Current thinking: require exact string match back to the source text as a post-extraction validation step.

6. **Free tier abuse** — 3 searches/month without an account invites abuse via IP rotation. Do we require email verification even for free tier? Current thinking: first search is truly anonymous, but searches 2-3 require email (not full account creation).

7. **Spider map complexity** — For companies with 50+ identified suppliers, the spider map becomes unreadable. Current thinking: show top 15 suppliers by mention frequency, with "show all" toggle.
