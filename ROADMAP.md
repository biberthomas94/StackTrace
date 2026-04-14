# StackTrace — Roadmap

## Phase 1: Data Foundation (Weeks 1-4)

Goal: Build the extraction pipeline that turns SEC filings into structured supplier data.

### Week 1 — SEC EDGAR Integration

- [ ] EDGAR company search endpoint: accept company name, return CIK number and metadata
- [ ] Handle company name variants and common aliases
- [ ] 10-K and 10-Q filing index retrieval: given a CIK, find the most recent annual/quarterly filing
- [ ] Filing full-text download: retrieve the complete HTML filing document
- [ ] Respect EDGAR rate limits (10 requests/second with proper User-Agent)
- [ ] Unit tests for CIK resolution and filing retrieval

**Exit criteria:** Given "Apple", the pipeline returns the full text of Apple Inc.'s most recent 10-K.

### Week 2 — Filing Parser

- [ ] HTML-to-text parser for SEC filing format (handle nested tables, exhibits, inline XBRL)
- [ ] Section extractor: isolate Item 1 (Business) and Item 1A (Risk Factors) from 10-K
- [ ] Handle filing format variations across different filers (some use Item 1A, others "RISK FACTORS" as heading)
- [ ] Section boundary detection (stop at next Item heading or exhibit boundary)
- [ ] Text cleanup: strip boilerplate headers/footers, normalize whitespace
- [ ] Test against 20 filings from different industries and filing agents

**Exit criteria:** Given a 10-K filing, the parser extracts the Risk Factors section with >95% accuracy across tested filings.

### Week 3 — LLM Extraction Pipeline

- [ ] Claude API integration with structured output (JSON response format)
- [ ] Supplier extraction prompt v1.0 (see docs/PROMPTS.md)
- [ ] Response parsing: extract supplier name, relationship type, dependency level, confidence score, source quote
- [ ] Source anchor validation: verify quoted text exists in source document
- [ ] Retry logic with exponential backoff for API failures
- [ ] Cost tracking: log token usage per extraction
- [ ] Run extraction against 50 test filings, review output quality

**Exit criteria:** Pipeline extracts suppliers from a 10-K Risk Factors section with >80% precision on manual review of 50 filings.

### Week 4 — Entity Resolution and Batch Processing

- [ ] Company name normalization (lowercase, remove suffixes, standardize punctuation)
- [ ] Fuzzy matching implementation (Levenshtein + token-set)
- [ ] pgvector setup: generate and store embeddings for company names
- [ ] Vector similarity search for entity matching
- [ ] Canonical entity creation and merge logic
- [ ] Batch job: run full pipeline against S&P 500 companies
- [ ] Store all results in PostgreSQL (companies, suppliers, relationships, extractions tables)
- [ ] Batch job monitoring and error reporting

**Exit criteria:** S&P 500 batch run completes successfully. Entity resolution correctly merges >90% of duplicate supplier names on manual spot-check.

---

## Phase 2: Core Product (Weeks 5-10)

Goal: Build the API and frontend that turns pipeline data into a user-facing product.

### Week 5 — Database and API Foundation

- [ ] PostgreSQL schema deployment (all tables from docs/SCHEMA.md)
- [ ] Database migration tooling (node-pg-migrate or similar)
- [ ] Seed script: load S&P 500 batch results
- [ ] API scaffolding: Express server, middleware stack, error handling
- [ ] `GET /api/search?q={company_name}` — search companies by name, return matches
- [ ] `GET /api/companies/:id/supply-chain` — return supplier graph for a company
- [ ] `GET /api/companies/:id/health-score` — return health score and component breakdown
- [ ] API response format standardized (consistent envelope, error codes)

**Exit criteria:** API returns supplier graph and health score for any S&P 500 company from cached data.

### Week 6 — Health Score Engine

- [ ] Supplier diversification score calculation
- [ ] Geographic spread score calculation (Herfindahl index)
- [ ] Tier depth score calculation
- [ ] Financial stability score calculation (filing language analysis)
- [ ] Data confidence score calculation
- [ ] Composite score with weighting
- [ ] Risk flag generation from component scores and trigger conditions
- [ ] Score recalculation job for batch refresh
- [ ] `GET /api/companies/:id/risk-flags` — return risk flags with severity

**Exit criteria:** Health scores match expected ranges on 10 manually reviewed companies (e.g., Apple should score high on diversification, low on geographic concentration due to China dependency).

### Week 7 — Frontend: Search and Results

- [ ] React app scaffolding (Vite or Create React App)
- [ ] Search page: centered search bar with autocomplete
- [ ] Company autocomplete: debounced API calls, fuzzy match display
- [ ] Results page layout: hero score card, risk flags section
- [ ] Hero card: company name, large health score number, one-line summary
- [ ] Risk flags: card list with red/yellow/green severity indicators
- [ ] Loading states and error states
- [ ] Routing between search and results

**Exit criteria:** User can type "Apple" in search bar, select from autocomplete, and see health score and risk flags.

### Week 8 — Spider Map Visualization

- [ ] D3.js (or React Flow) graph component
- [ ] Company node at center, supplier nodes radiating outward
- [ ] Edge thickness based on relationship strength/mention frequency
- [ ] Node color based on supplier risk level (green/yellow/red)
- [ ] Tier-2 suppliers shown as smaller nodes connected to tier-1
- [ ] Click/tap node to show detail panel (supplier name, relationship type, confidence, evidence link)
- [ ] "View Supply Chain Map" button on results page
- [ ] Zoom and pan controls for dense graphs
- [ ] Show top 15 suppliers by default, "show all" toggle for dense graphs

**Exit criteria:** Spider map renders correctly for companies with 5-50 suppliers, is interactive, and doesn't become unreadable.

### Week 9 — Caching and Performance

- [ ] Redis integration for API response caching (1-hour TTL)
- [ ] Search cache logic: check cache before triggering pipeline
- [ ] On-demand pipeline trigger for uncached companies
- [ ] WebSocket or polling for on-demand search progress ("Analyzing filing... Extracting suppliers... Calculating score...")
- [ ] Verify cached search returns in <500ms
- [ ] Verify on-demand search completes in <30s
- [ ] Cache invalidation on batch refresh
- [ ] Rate limiting middleware (10 req/min public, 60 req/min authenticated)

**Exit criteria:** Cached search < 500ms. Uncached search < 30s. Rate limiting blocks excessive requests.

### Week 10 — Mobile Responsive and Polish

- [ ] Mobile layout: single column, stacked cards, touch-friendly tap targets
- [ ] Tablet layout: two-column where appropriate
- [ ] Spider map touch interactions (pinch to zoom, tap to select)
- [ ] Cross-browser testing (Chrome, Safari, Firefox, Edge)
- [ ] Accessibility pass: keyboard navigation, ARIA labels, color contrast
- [ ] Empty states, edge cases (company with 0 suppliers, company not found)
- [ ] Error boundary components
- [ ] Favicon, meta tags, Open Graph tags for link previews

**Exit criteria:** Product is usable on an iPhone SE through a 27" desktop monitor. No layout breaks. WCAG AA color contrast.

---

## Phase 3: Billing and Launch (Weeks 11-14)

Goal: Add authentication, billing, and ship to real users.

### Week 11 — Authentication

- [ ] User registration (email + password)
- [ ] Password hashing (bcrypt)
- [ ] Login endpoint, JWT issuance
- [ ] Protected route middleware
- [ ] Account page: email, plan, usage stats
- [ ] Password reset flow (email link)
- [ ] OAuth: Google sign-in (optional, adds conversion)
- [ ] Anonymous search tracking (IP-based, first search only)

**Exit criteria:** Users can register, log in, and see their account page. Anonymous users can make 1 search.

### Week 12 — Stripe Billing

- [ ] Stripe account setup, product and price creation
- [ ] Checkout session creation for Pro and Premium tiers
- [ ] Webhook handler: subscription created, updated, cancelled, payment failed
- [ ] Usage tracking: increment search count on each search, enforce limits
- [ ] Upgrade/downgrade flow in account page
- [ ] Billing history display
- [ ] Graceful degradation: if Stripe is down, allow existing subscribers to continue (fail open on billing, fail closed on new subscriptions)

**Exit criteria:** Complete subscription lifecycle works: sign up free → upgrade to Pro → search 25 times → hit limit → upgrade to Premium → unlimited. Downgrade and cancellation work correctly.

### Week 13 — Landing Page and SEO

- [ ] Landing page with value proposition, example output, pricing table
- [ ] "Try it free" CTA leading to search page
- [ ] Basic SEO: title tags, meta descriptions, structured data
- [ ] Analytics integration (Plausible, no cookie banner needed)
- [ ] Terms of service and privacy policy pages
- [ ] Contact/feedback form

**Exit criteria:** Landing page loads in <2s, communicates the product clearly, has working CTAs.

### Week 14 — Staging and Soft Launch

- [ ] Staging environment deployment (Railway or Render)
- [ ] Environment variable management (staging vs production)
- [ ] Database backup configuration
- [ ] Error monitoring setup (Sentry)
- [ ] Smoke test: full user journey (search → register → subscribe → search again)
- [ ] Bug fixes from staging testing
- [ ] Invite 20-50 beta users from waitlist
- [ ] Collect feedback, prioritize fixes

**Exit criteria:** Product is live on a staging URL. Beta users can complete the full journey without critical bugs.

---

## Phase 4: Growth (Months 4-6)

Goal: Add features that drive retention and expand data coverage.

### Month 4 — Alerts and Portfolio

- [ ] 8-K monitoring: poll EDGAR RSS feed for new 8-K filings from tracked suppliers
- [ ] Alert matching: check new 8-Ks against Pro/Premium users' searched companies
- [ ] Email notification pipeline (SendGrid integration)
- [ ] Alert preferences: frequency (immediate, daily digest), types of 8-K to flag
- [ ] Portfolio view page: add/remove companies, view scores in a dashboard
- [ ] Cross-portfolio analysis: identify suppliers that appear across multiple portfolio companies
- [ ] Portfolio health score (weighted average of company scores)

### Month 5 — Additional Data Sources

- [ ] ImportYeti integration: customs data extraction, shipper/consignee matching
- [ ] Entity resolution: match ImportYeti shipper names to existing supplier entities
- [ ] USASpending.gov integration: government contract data, awardee matching
- [ ] Update health score methodology to incorporate new data signals
- [ ] Recalculate scores for S&P 500 with enriched data
- [ ] UI updates: show data source badges on supplier nodes ("SEC filing", "Customs record", "Govt contract")

### Month 6 — Scale and Distribution

- [ ] USPTO PatentsView integration: patent co-filing as technology dependency signal
- [ ] Expand pre-processed company list from S&P 500 to Russell 1000
- [ ] Performance optimization for larger company coverage
- [ ] SEO content: auto-generated supply chain summary pages for top companies
- [ ] Social sharing: "Share this company's supply chain report" with preview card
- [ ] Referral program (free searches for inviting friends)
- [ ] Evaluate paid data source ROI based on subscriber count and feedback
- [ ] Begin planning enterprise/API tier if demand signals are present
