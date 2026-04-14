# StackTrace — Database Schema

PostgreSQL with the pgvector extension for vector similarity search.

---

## Extension Setup

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- trigram similarity for fuzzy text matching
```

---

## Tables

### companies

Canonical record for every company in the system — both the companies users search for and the suppliers identified in their supply chains.

```sql
CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,                    -- canonical display name ("Apple Inc.")
    name_normalized TEXT NOT NULL,                    -- lowercase, no punctuation, standardized suffixes ("apple")
    name_embedding  VECTOR(1536),                     -- vector embedding of company name for similarity search
    cik             TEXT UNIQUE,                       -- SEC Central Index Key (NULL for non-public companies)
    ticker          TEXT,                              -- stock ticker symbol (NULL for non-public)
    sic_code        TEXT,                              -- Standard Industrial Classification code
    country         TEXT DEFAULT 'US',                 -- country of incorporation/headquarters
    is_public       BOOLEAN DEFAULT FALSE,             -- whether this company files with SEC
    metadata        JSONB DEFAULT '{}',                -- flexible storage for additional attributes
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_companies_name_normalized ON companies (name_normalized);
CREATE INDEX idx_companies_cik ON companies (cik) WHERE cik IS NOT NULL;
CREATE INDEX idx_companies_ticker ON companies (ticker) WHERE ticker IS NOT NULL;
CREATE INDEX idx_companies_name_trgm ON companies USING gin (name_normalized gin_trgm_ops);
CREATE INDEX idx_companies_name_embedding ON companies USING ivfflat (name_embedding vector_cosine_ops) WITH (lists = 100);
```

**Design decisions:**
- `name` vs `name_normalized`: Display name preserves casing and legal suffixes for the UI. Normalized name is used for deduplication and search. Keeping both avoids runtime normalization.
- `name_embedding`: Stored as a 1536-dimension vector (OpenAI ada-002 or equivalent). Used for entity resolution when fuzzy string matching fails. The ivfflat index trades some recall for dramatically faster queries at scale.
- `cik` is nullable because many suppliers are private companies that don't file with the SEC.
- `metadata` JSONB handles fields that vary by company (e.g., DUNS number, UEI from USASpending, ImportYeti slug) without schema bloat.
- `pg_trgm` index on `name_normalized` enables fast LIKE/similarity queries for autocomplete.

---

### suppliers

A supplier is a company identified as a supplier to another company. This table stores the supplier-side metadata that is specific to the supplier role.

```sql
CREATE TABLE suppliers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    category        TEXT,                              -- supplier category: "raw_materials", "manufacturing", "logistics", "technology", "services"
    country         TEXT,                              -- country where supplier operations are located (may differ from HQ)
    is_public       BOOLEAN DEFAULT FALSE,             -- whether supplier is a public company (convenience denorm from companies)
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_suppliers_company_id ON suppliers (company_id);
CREATE INDEX idx_suppliers_category ON suppliers (category) WHERE category IS NOT NULL;
```

**Design decisions:**
- Suppliers are a role, not a separate entity. The `companies` table holds the canonical entity; the `suppliers` table holds role-specific attributes. A company can be both a search target and a supplier to another company.
- `country` here is the country of the supplier's operations relevant to this supply relationship, which can differ from the company's incorporation country. Samsung is a Korean company, but their Vietnam factory is the relevant location for a specific supply relationship.
- `is_public` is denormalized from `companies` for query convenience — avoids a join when filtering suppliers by public/private status in scoring.

---

### relationships

The core graph edge: Company A is supplied by Supplier B. Each row represents one directional supply relationship.

```sql
CREATE TABLE relationships (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id),     -- the company being supplied
    supplier_id         UUID NOT NULL REFERENCES suppliers(id),     -- the supplier
    relationship_type   TEXT NOT NULL,                               -- "raw_materials", "manufacturing", "logistics", "technology", "services", "unknown"
    dependency_level    TEXT,                                        -- "sole_source", "primary", "secondary", "minor"
    mention_count       INTEGER DEFAULT 1,                          -- how many times this relationship appears across all data sources
    confidence          NUMERIC(3,2) NOT NULL DEFAULT 0.50,         -- aggregate confidence score (0.00-1.00)
    first_seen          DATE,                                       -- date of earliest filing/record mentioning this relationship
    last_seen           DATE,                                       -- date of most recent filing/record mentioning this relationship
    is_active           BOOLEAN DEFAULT TRUE,                       -- FALSE if the relationship appears to have ended
    evidence_summary    TEXT,                                        -- one-line human-readable summary: "Named as sole-source chip fabricator in 10-K Risk Factors (2024)"
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(company_id, supplier_id, relationship_type)
);

CREATE INDEX idx_relationships_company_id ON relationships (company_id);
CREATE INDEX idx_relationships_supplier_id ON relationships (supplier_id);
CREATE INDEX idx_relationships_confidence ON relationships (confidence DESC);
CREATE INDEX idx_relationships_active ON relationships (company_id) WHERE is_active = TRUE;
```

**Design decisions:**
- `UNIQUE(company_id, supplier_id, relationship_type)`: A supplier can have multiple relationship types with the same company (e.g., Samsung supplies both chips and displays to Apple), but each specific relationship type is unique.
- `confidence` is the aggregate across all data sources. If EDGAR extraction gives 0.8 and ImportYeti confirms with physical shipment data, confidence increases. This is the score used for display filtering.
- `mention_count` tracks how many independent data points support this relationship. More mentions = higher confidence in existence (though not necessarily higher dependency).
- `first_seen` / `last_seen` enable staleness detection. A relationship last seen 3+ years ago may no longer be active.
- `evidence_summary` is a pre-computed string for the UI — avoids re-computing it from raw extraction data on every request.

---

### data_sources

Registry of data sources and their processing status. Tracks which sources have been ingested and when.

```sql
CREATE TABLE data_sources (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,              -- "sec_edgar", "importyeti", "usaspending", "uspto"
    display_name    TEXT NOT NULL,                     -- "SEC EDGAR", "ImportYeti", "USASpending.gov", "USPTO PatentsView"
    source_type     TEXT NOT NULL,                     -- "filing", "customs", "contract", "patent"
    is_active       BOOLEAN DEFAULT TRUE,              -- whether this source is currently being ingested
    last_ingestion  TIMESTAMPTZ,                       -- when the last batch run completed
    config          JSONB DEFAULT '{}',                -- source-specific configuration (base URLs, rate limits, etc.)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Design decisions:**
- This is a lookup/config table, not a high-volume table. It exists so that extraction records can reference their source and so the pipeline can track ingestion status per source.
- `config` JSONB stores source-specific settings (e.g., EDGAR User-Agent, ImportYeti base URL) so they're centrally managed and visible in the database.

---

### extractions

Raw extraction records from each data source. Every time the pipeline extracts supplier data from a filing or record, one row is created. This is the audit trail.

```sql
CREATE TABLE extractions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id),
    data_source_id      UUID NOT NULL REFERENCES data_sources(id),
    source_document     TEXT NOT NULL,                   -- identifier for the specific document (e.g., EDGAR accession number, ImportYeti shipment ID)
    source_url          TEXT,                             -- direct URL to the source document
    filing_date         DATE,                             -- date the source document was filed/created
    section             TEXT,                              -- which section was extracted from (e.g., "item_1a_risk_factors", "item_1_business")
    raw_text            TEXT,                              -- the extracted text that was sent to the LLM
    extraction_result   JSONB NOT NULL,                   -- full structured output from the LLM (array of supplier extractions)
    model_used          TEXT,                              -- which LLM model was used ("claude-sonnet-4-20250514")
    token_count_input   INTEGER,                          -- input tokens consumed
    token_count_output  INTEGER,                          -- output tokens consumed
    processing_time_ms  INTEGER,                          -- wall clock time for the extraction
    status              TEXT DEFAULT 'completed',         -- "completed", "failed", "pending_review"
    error_message       TEXT,                              -- error details if status = "failed"
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_extractions_company_id ON extractions (company_id);
CREATE INDEX idx_extractions_source ON extractions (data_source_id);
CREATE INDEX idx_extractions_filing_date ON extractions (filing_date DESC);
CREATE INDEX idx_extractions_status ON extractions (status) WHERE status != 'completed';
```

**Design decisions:**
- `raw_text` stores the input sent to the LLM. This enables re-extraction if prompts improve without re-downloading filings.
- `extraction_result` is the full JSON output from the LLM, stored verbatim. The pipeline processes this into `relationships` rows, but the raw output is kept for debugging, auditing, and reprocessing.
- Token counts and processing time enable cost tracking and performance monitoring.
- `status` partial index on non-completed records makes it fast to find failed or pending extractions for retry.

---

### search_cache

Pre-computed search results. When a user searches for a company, the API checks this table first. If a fresh result exists, it's returned directly without hitting the pipeline.

```sql
CREATE TABLE search_cache (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    health_score    NUMERIC(3,1) NOT NULL,              -- composite score 0.0-10.0
    score_breakdown JSONB NOT NULL,                     -- component scores: {"diversification": 7.2, "geographic": 4.1, ...}
    risk_flags      JSONB NOT NULL,                     -- array of risk flag objects: [{"type": "geographic_concentration", "severity": "high", "message": "..."}]
    supplier_graph  JSONB NOT NULL,                     -- full graph data for spider map rendering: nodes, edges, positions
    supplier_count  INTEGER NOT NULL,                   -- number of identified suppliers (denormalized for display)
    data_sources    TEXT[] DEFAULT '{}',                 -- which data sources contributed to this result
    confidence_avg  NUMERIC(3,2),                       -- average confidence across all relationships
    computed_at     TIMESTAMPTZ DEFAULT NOW(),           -- when this cache entry was computed
    expires_at      TIMESTAMPTZ NOT NULL,               -- when this cache entry should be refreshed
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_search_cache_company ON search_cache (company_id);
CREATE INDEX idx_search_cache_expires ON search_cache (expires_at) WHERE expires_at > NOW();
```

**Design decisions:**
- `UNIQUE` on `company_id`: one cached result per company. Updating replaces the previous cache entry.
- All display data is pre-computed and stored in JSONB columns (`score_breakdown`, `risk_flags`, `supplier_graph`). The API reads one row and returns it directly — no joins, no computation at query time.
- `supplier_graph` contains the full D3-ready graph structure (nodes with positions, edges with weights). The frontend renders it without transformation.
- `expires_at` rather than a TTL column because it's easier to query ("WHERE expires_at > NOW()") and doesn't require computing expiration at read time.
- `data_sources` array tracks provenance — the UI shows "Based on SEC filings" or "Based on SEC filings + Customs records" depending on which sources contributed.

---

### users

User accounts for authentication and usage tracking.

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                      -- bcrypt hash
    name            TEXT,
    auth_provider   TEXT DEFAULT 'email',               -- "email", "google"
    auth_provider_id TEXT,                               -- OAuth provider's user ID
    email_verified  BOOLEAN DEFAULT FALSE,
    searches_used   INTEGER DEFAULT 0,                  -- searches used in current billing period
    period_start    DATE DEFAULT CURRENT_DATE,          -- start of current billing period
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_auth_provider ON users (auth_provider, auth_provider_id) WHERE auth_provider != 'email';
```

**Design decisions:**
- `searches_used` and `period_start` track usage for billing enforcement. On the first day of each billing period (triggered by Stripe webhook on renewal), `searches_used` resets to 0.
- `auth_provider` + `auth_provider_id` support OAuth login. A user who signs up with Google has `auth_provider = 'google'` and their Google user ID in `auth_provider_id`. `password_hash` is set to a random value for OAuth users (they never use it).
- No separate `profiles` table. At this scale, user attributes belong on the user row. Split when there's a reason to.

---

### subscriptions

Stripe subscription records. Tracks what plan each user is on and their subscription lifecycle.

```sql
CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id),
    stripe_customer_id  TEXT NOT NULL,                   -- Stripe customer ID (cus_xxx)
    stripe_subscription_id TEXT UNIQUE,                  -- Stripe subscription ID (sub_xxx), NULL for free tier
    plan                TEXT NOT NULL DEFAULT 'free',    -- "free", "pro", "premium"
    status              TEXT NOT NULL DEFAULT 'active',  -- "active", "past_due", "cancelled", "trialing"
    searches_limit      INTEGER NOT NULL DEFAULT 3,     -- max searches per billing period for this plan
    current_period_start TIMESTAMPTZ,                    -- Stripe billing period start
    current_period_end   TIMESTAMPTZ,                    -- Stripe billing period end
    cancelled_at        TIMESTAMPTZ,                     -- when the user cancelled (still active until period end)
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_status ON subscriptions (status) WHERE status = 'active';
```

**Design decisions:**
- Separate from `users` because subscription state is owned by Stripe. The webhook handler updates this table; the application reads it. Keeping it separate makes the Stripe integration boundary clean.
- `searches_limit` is denormalized from the plan definition. This avoids a lookup table and makes it trivial to implement custom limits (e.g., a promotional "50 searches" one-time tier).
- `plan` is a string, not a foreign key to a plans table. Three plans don't justify a lookup table. If pricing becomes complex (annual vs monthly, add-ons, enterprise custom), add a plans table then.
- Free tier users get a subscription row with `plan = 'free'` and `stripe_subscription_id = NULL`. This keeps the usage-checking query consistent: always check `subscriptions` for the user's limit.

---

## Schema Diagram (Relationships)

```
users ──────── subscriptions
                    
companies ──── suppliers ──── relationships ──── companies
    │                              │
    │                              │
    ├── extractions ──── data_sources
    │
    └── search_cache
```

- `companies` is the central entity. It appears on both sides of `relationships` (as the company being analyzed and as the supplier).
- `suppliers` links to `companies` — every supplier is a company.
- `relationships` connects a company to its suppliers with typed, scored edges.
- `extractions` is the audit trail of how data entered the system.
- `search_cache` is the pre-computed API response for a company.
- `users` and `subscriptions` are the auth/billing domain, connected only through API logic (not foreign keys to the data domain).

---

## Migrations

Use `node-pg-migrate` for schema migrations, stored in `scripts/migrations/`. Each migration is a timestamped SQL file:

```
scripts/migrations/
├── 001_create_extensions.sql
├── 002_create_companies.sql
├── 003_create_suppliers.sql
├── 004_create_relationships.sql
├── 005_create_data_sources.sql
├── 006_create_extractions.sql
├── 007_create_search_cache.sql
├── 008_create_users.sql
└── 009_create_subscriptions.sql
```

Run forward: `npm run migrate up`
Roll back one: `npm run migrate down`
