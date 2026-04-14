# StackTrace — Data Sources

## SEC EDGAR

### What It Provides

The SEC's Electronic Data Gathering, Analysis, and Retrieval system contains every filing made by public companies in the United States. For StackTrace, the critical filings are:

- **10-K (Annual Report):** Contains Item 1 (Business description) and Item 1A (Risk Factors), which are the densest sources of supplier mentions. Companies are legally required to disclose material dependencies and risks, which means supply chain relationships that could materially affect the business are documented here.
- **10-Q (Quarterly Report):** Similar structure to 10-K but filed quarterly. Useful for detecting changes in supplier relationships between annual filings.
- **8-K (Current Report):** Filed when a material event occurs (acquisition, bankruptcy, contract termination). Used for real-time alerting when a supplier files a material event.
- **Company metadata:** CIK (Central Index Key) numbers, SIC codes, company name, state of incorporation, filing history.

### API Endpoints

| Endpoint | Purpose | URL Pattern |
|----------|---------|-------------|
| Company Search | Find CIK by company name | `https://efts.sec.gov/LATEST/search-index?q={name}&dateRange=custom&startdt=2020-01-01&enddt=2025-12-31` |
| Company Tickers | Bulk CIK-to-ticker mapping | `https://www.sec.gov/files/company_tickers.json` |
| Filing Index | List filings for a CIK | `https://data.sec.gov/submissions/CIK{cik_padded}.json` |
| Filing Document | Retrieve full filing text | `https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}` |
| Full-Text Search | Search across all filings | `https://efts.sec.gov/LATEST/search-index?q={query}&forms=10-K` |
| XBRL Companion | Structured financial data | `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik_padded}.json` |

### Rate Limits

- **10 requests per second** with a properly formatted User-Agent header
- User-Agent must include a company name and contact email: `StackTrace admin@stacktrace.app`
- Requests without proper User-Agent will be throttled to 1 req/sec or blocked entirely
- No API key required
- No daily or monthly limits

### Cost

**Free.** EDGAR is a public government service. No API key, no billing, no terms of service beyond the rate limit.

### What It Unlocks for StackTrace

EDGAR is the primary data source for MVP. It provides:
- **Supplier identification:** 10-K Risk Factors sections explicitly name suppliers that represent material dependencies
- **Relationship context:** Filings describe the nature of supplier relationships (sole source, critical component, manufacturing partner)
- **Financial health signals:** Language like "going concern," "material weakness," or "supply disruption" in a supplier's own filings indicates financial instability
- **Temporal data:** Filing history shows how supplier relationships change over time
- **8-K alerting:** RSS feeds of new 8-K filings enable real-time monitoring of supplier events

---

## ImportYeti (US Customs Bill of Lading)

### What It Provides

ImportYeti aggregates US Customs Bill of Lading records, which document every shipment entering the United States by sea. Each record contains:

- **Shipper (exporter):** The foreign company sending goods
- **Consignee (importer):** The US company receiving goods
- **Goods description:** Free-text description of what was shipped
- **Origin country:** Where the shipment originated
- **Weight and quantity:** Physical volume of the shipment
- **Date:** When the shipment arrived

This is physical evidence of supply chain relationships — not just what companies say in filings, but what actually ships between them.

### API Endpoints

ImportYeti provides a web interface at `https://www.importyeti.com/company/{company-name}`. There is no official public API, but the site's internal API can be accessed:

| Endpoint | Purpose | URL Pattern |
|----------|---------|-------------|
| Company Search | Find companies by name | `https://www.importyeti.com/api/search?q={name}` |
| Company Suppliers | List suppliers for a company | `https://www.importyeti.com/api/company/{slug}/suppliers` |
| Shipment Records | Individual shipment details | `https://www.importyeti.com/api/company/{slug}/shipments` |

### Rate Limits

- No documented rate limits, but aggressive scraping will result in IP blocking
- Recommend: 1 request per second, rotating user agents
- Consider reaching out for API partnership if volume exceeds casual use

### Cost

**Free** for web access and reasonable API usage. No API key required. Paid plans exist for bulk data export and higher limits but are not needed for StackTrace's pre-processing model.

### What It Unlocks for StackTrace

ImportYeti is the highest-value post-MVP data source:
- **Physical verification:** Confirms supplier relationships with actual shipment data, not just filing mentions
- **Geographic precision:** Shows exactly which countries and ports goods ship from, far more granular than filing disclosures
- **Volume signals:** Shipment frequency and weight indicate the scale of dependency on each supplier
- **Unlisted suppliers:** Discovers suppliers that companies don't mention in filings (especially lower-tier or commodity suppliers)
- **Temporal patterns:** Shipment frequency over time shows whether a supplier relationship is growing, stable, or declining

---

## USASpending.gov

### What It Provides

USASpending.gov is the US government's public database of federal spending. It contains:

- **Contract awards:** Every federal contract, including the awardee (company), amount, awarding agency, NAICS code, and contract description
- **Sub-awards:** Sub-contracts under prime awards, revealing sub-supplier relationships
- **Recipient profiles:** Company details including DUNS/UEI numbers, location, and total government business

For StackTrace, this reveals which companies are government suppliers and which companies supply the government suppliers.

### API Endpoints

| Endpoint | Purpose | URL Pattern |
|----------|---------|-------------|
| Recipient Search | Find companies by name | `https://api.usaspending.gov/api/v2/autocomplete/recipient/` |
| Recipient Profile | Company's government contracting history | `https://api.usaspending.gov/api/v2/recipient/{id}/` |
| Award Search | Search contract awards | `https://api.usaspending.gov/api/v2/search/spending_by_award/` |
| Sub-Awards | Sub-contracts under a prime award | `https://api.usaspending.gov/api/v2/subawards/` |

All endpoints accept POST requests with JSON bodies for filtering.

### Rate Limits

- No API key required
- No documented rate limits
- Recommend: 5 requests per second to be respectful of a government service
- Bulk data downloads available for larger analysis

### Cost

**Free.** Government open data. No API key, no billing, no registration.

### What It Unlocks for StackTrace

- **Government dependency signal:** Companies with large government contract portfolios have a different risk profile (budget-dependent, security clearance requirements, political risk)
- **Sub-supplier discovery:** Sub-award data reveals supply chain relationships that don't appear in SEC filings
- **Revenue concentration:** If a supplier derives >30% of revenue from government contracts, that's a risk flag (budget cuts, sequestration)
- **NAICS classification:** Standardized industry codes help categorize suppliers and assess sector-level risk

---

## USPTO PatentsView

### What It Provides

PatentsView is the USPTO's public research platform for US patent data. It provides:

- **Patent records:** Patent number, title, abstract, claims, filing and grant dates
- **Assignees:** Companies that own the patents
- **Inventors:** Individual inventors and their affiliations
- **CPC/USPC classifications:** Technology categories
- **Citations:** Which patents cite which other patents

For StackTrace, patents reveal technology dependencies: if Company A's patents heavily cite Company B's patents, or if Company A and Company B co-file patents, there's likely a technology supply relationship.

### API Endpoints

| Endpoint | Purpose | URL Pattern |
|----------|---------|-------------|
| Patents | Search and retrieve patents | `https://api.patentsview.org/patents/query` |
| Assignees | Search companies as patent holders | `https://api.patentsview.org/assignees/query` |
| Inventors | Search individual inventors | `https://api.patentsview.org/inventors/query` |
| CPC Subgroups | Technology classification lookup | `https://api.patentsview.org/cpc_subgroups/query` |

All endpoints accept POST requests with a query language for filtering and field selection.

### Rate Limits

- No API key required
- 45 requests per minute
- Maximum 10,000 results per query
- Bulk data downloads available for full-corpus analysis

### Cost

**Free.** Government open data. No API key, no billing.

### What It Unlocks for StackTrace

- **Technology dependency mapping:** Citation analysis reveals which companies depend on which other companies' technology
- **Innovation health:** Patent filing velocity for a supplier indicates R&D investment and long-term viability
- **Concentration risk:** If a company's patents all cite a single supplier's technology, that's a technology lock-in risk
- **Cross-reference signal:** Patents co-assigned to two companies confirm a deep partnership not always disclosed in filings
- **This is the lowest-priority data source for MVP** but adds a unique signal dimension that no competitor combines with supply chain data

---

## Claude API (Anthropic)

### What It Provides

Claude is used as the extraction engine, not a data source. It reads SEC filing text and produces structured supplier data. Specifically:

- **Supplier name extraction** from narrative text
- **Relationship classification** (raw materials, manufacturing, logistics, technology, services)
- **Dependency level assessment** (sole source, primary, secondary, minor)
- **Confidence scoring** for each extraction
- **Source quote identification** linking each extraction to specific filing text

### API Endpoint

| Endpoint | Purpose | URL |
|----------|---------|-----|
| Messages | Send text, receive structured extraction | `https://api.anthropic.com/v1/messages` |

### Rate Limits

Depends on API tier:

| Tier | Requests/min | Tokens/min | Tokens/day |
|------|-------------|-----------|-----------|
| Tier 1 (default) | 50 | 40,000 | 1,000,000 |
| Tier 2 | 1,000 | 80,000 | 2,500,000 |
| Tier 3 | 2,000 | 160,000 | 5,000,000 |

For batch processing S&P 500, Tier 1 is sufficient if jobs run overnight.

### Cost

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|----------------------|
| Claude Sonnet | $3.00 | $15.00 |
| Claude Haiku | $0.25 | $1.25 |

Estimated cost per company extraction: ~$0.02-0.05 (Sonnet) or ~$0.002-0.005 (Haiku).

Weekly S&P 500 batch with Sonnet: ~$15/week (~$60/month).

### What It Unlocks for StackTrace

- **Structured data from unstructured text:** SEC filings are narrative prose. Claude converts them to structured JSON with supplier names, relationship types, and confidence scores.
- **Relationship context:** Unlike keyword matching, Claude understands that "we rely on" means a supply dependency while "we compete with" does not.
- **Confidence scoring:** Claude assesses its own certainty, allowing StackTrace to filter out low-confidence extractions and flag uncertain results to users.
- **Scalability:** Unlike human analysts, Claude can process hundreds of filings per day at consistent quality.
