# StackTrace — Entity Resolution

## The Problem

The same company appears under different names across different data sources and even within the same filing:

| Source | How They Write It |
|--------|------------------|
| SEC 10-K filing | "Taiwan Semiconductor Manufacturing Company, Limited" |
| SEC 10-K filing (same document, different paragraph) | "TSMC" |
| US Customs Bill of Lading | "TAIWAN SEMICONDUCTOR MFG CO LTD" |
| USASpending.gov | "Taiwan Semiconductor Manufacturing Co., Ltd." |
| USPTO patent | "Taiwan Semiconductor Manufacturing Co." |
| Investor conversation | "Taiwan Semi" |

All six refer to the same entity. If we don't resolve them, a company that depends heavily on TSMC might appear to have six different suppliers instead of one — which would inflate the diversification score, hide concentration risk, and produce a misleading health score.

Entity resolution is not optional. It is a correctness requirement.

---

## Resolution Strategy

Entity resolution uses a three-tier matching approach, from fastest/cheapest to slowest/most expensive. Each tier is tried in order; if a match is found, subsequent tiers are skipped.

### Tier 1: Exact Match After Normalization

**What it does:** Normalize both the input name and all known entity names, then check for exact string equality.

**Normalization steps:**

1. Convert to lowercase
2. Remove all punctuation except hyphens and ampersands
3. Standardize legal suffixes:
   - "incorporated", "inc" → remove
   - "corporation", "corp" → remove
   - "company", "co" → remove
   - "limited", "ltd" → remove
   - "llc", "l.l.c." → remove
   - "plc", "p.l.c." → remove
   - "the" (leading) → remove
4. Collapse multiple spaces to single space
5. Trim whitespace

**Examples:**

| Input | Normalized |
|-------|-----------|
| "Apple Inc." | "apple" |
| "Apple Incorporated" | "apple" |
| "APPLE INC" | "apple" |
| "The Boeing Company" | "boeing" |
| "Boeing Co." | "boeing" |

**Performance:** O(1) lookup against a hash index on `companies.name_normalized`. Resolves ~60% of matches in practice.

**Limitations:** Fails on abbreviations ("TSMC" ≠ "taiwan semiconductor manufacturing"), DBA names, and significant word order differences.

---

### Tier 2: Fuzzy String Matching

**What it does:** Compares the normalized input against all known entities using multiple string similarity algorithms, then selects the best match above a threshold.

**Algorithms used (in combination):**

1. **Token-set ratio** (from fuzzywuzzy/thefuzz): Splits both strings into token sets and compares, ignoring word order. "Taiwan Semiconductor Manufacturing" vs "Semiconductor Manufacturing Taiwan" = 100% match. This handles reordering.

2. **Partial ratio**: Finds the best matching substring. "TSMC Taiwan Semiconductor" partially matches "Taiwan Semiconductor Manufacturing Company" on the overlapping substring.

3. **Trigram similarity** (pg_trgm in PostgreSQL): Breaks strings into 3-character sequences and measures overlap. Fast, handles typos and abbreviations. Available as a PostgreSQL operator (`%` and `similarity()` function).

**Matching logic:**

```python
def fuzzy_match(input_name: str, candidates: list[str]) -> str | None:
    normalized = normalize(input_name)
    
    # PostgreSQL trigram pre-filter: get top 20 candidates by trigram similarity
    # This is done in SQL: SELECT * FROM companies WHERE name_normalized % {normalized} ORDER BY similarity(name_normalized, {normalized}) DESC LIMIT 20
    
    best_match = None
    best_score = 0
    
    for candidate in pre_filtered_candidates:
        token_set = fuzz.token_set_ratio(normalized, candidate.name_normalized)
        partial = fuzz.partial_ratio(normalized, candidate.name_normalized)
        combined = (token_set * 0.6) + (partial * 0.4)
        
        if combined > best_score:
            best_score = combined
            best_match = candidate
    
    if best_score >= 85:
        return best_match  # high confidence match
    elif best_score >= 70:
        return best_match  # medium confidence, flag for review
    else:
        return None  # no match
```

**Thresholds:**

| Score Range | Action |
|-------------|--------|
| >= 85 | Auto-match. High confidence this is the same entity. |
| 70-84 | Provisional match. Used for scoring but flagged in the UI with lower confidence. |
| < 70 | No match. Create a new entity. |

**Performance:** The pg_trgm pre-filter runs in <10ms on 100K entities (GIN index). The Python fuzzy matching on 20 candidates is negligible. Total: <50ms per resolution.

**Limitations:** Fails on acronyms where the letters don't appear in the full name in sequence. "IBM" doesn't fuzzy-match well to "International Business Machines" because the token overlap is zero.

---

### Tier 3: Vector Similarity

**What it does:** Compares vector embeddings of company names using cosine similarity. Embeddings capture semantic meaning, so "IBM" and "International Business Machines" have similar embeddings even though they share no tokens.

**Implementation:**

1. Generate an embedding for the input name using an embedding model (OpenAI text-embedding-ada-002 or a local alternative like sentence-transformers)
2. Query pgvector for the nearest neighbors by cosine similarity
3. Accept matches above a similarity threshold

```sql
SELECT id, name, 1 - (name_embedding <=> $1) AS similarity
FROM companies
WHERE 1 - (name_embedding <=> $1) > 0.85
ORDER BY name_embedding <=> $1
LIMIT 5;
```

**Thresholds:**

| Cosine Similarity | Action |
|-------------------|--------|
| >= 0.92 | Auto-match |
| 0.85-0.91 | Provisional match with confidence penalty |
| < 0.85 | No match |

**Performance:** pgvector ivfflat index query: ~20ms on 100K entities. Embedding generation: ~100ms per name (API call) or ~5ms (local model). Total: <150ms per resolution.

**Limitations:** Embedding models can produce false positives for companies with similar names in different industries. "Apple Inc" (technology) and "Apple Hospitality REIT" (real estate) will have very similar embeddings. Disambiguation requires additional context (SIC code, CIK, filing content).

---

## Edge Cases

### Abbreviations and Acronyms

| Input | Expected Match | Challenge |
|-------|---------------|-----------|
| "TSMC" | Taiwan Semiconductor Manufacturing Company | Acronyms have no token overlap with full names |
| "IBM" | International Business Machines | Same as above |
| "3M" | 3M Company | Short names are ambiguous |
| "AT&T" | AT&T Inc | Special characters in names |

**Solution:** Maintain an alias table mapping known abbreviations to canonical entities. Populated from SEC EDGAR's company tickers file (which maps tickers and common names to CIKs) and manually extended.

```sql
CREATE TABLE company_aliases (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID NOT NULL REFERENCES companies(id),
    alias       TEXT NOT NULL,
    alias_normalized TEXT NOT NULL,
    source      TEXT DEFAULT 'manual'  -- "edgar_tickers", "manual", "learned"
);

CREATE UNIQUE INDEX idx_aliases_normalized ON company_aliases (alias_normalized);
```

The alias table is checked before Tier 1. If the input matches an alias, resolution is immediate.

### Subsidiary vs Parent

| Input | Could Match | Correct Resolution |
|-------|------------|-------------------|
| "Google" | Alphabet Inc | Parent company — resolve to Alphabet |
| "YouTube" | Alphabet Inc | Subsidiary — resolve to Alphabet (for supply chain purposes) |
| "AWS" | Amazon.com Inc | Division — resolve to Amazon |
| "Instagram" | Meta Platforms Inc | Subsidiary — resolve to Meta |

**Solution:** For supply chain analysis, subsidiaries and divisions are resolved to their publicly traded parent. The pipeline maintains a parent-subsidiary mapping seeded from SEC filings (10-K Exhibit 21 lists significant subsidiaries). When a subsidiary name is extracted as a supplier, it resolves to the parent for scoring purposes, but the subsidiary name is preserved in the `evidence_summary` for display.

### Company Name Changes

| Old Name | New Name | Filing Period |
|----------|---------|---------------|
| Facebook, Inc. | Meta Platforms, Inc. | Changed October 2021 |
| Google Inc. | Alphabet Inc. | Changed October 2015 |
| Philip Morris International | Altria Group (domestic) | Split in 2008 |

**Solution:** CIK numbers don't change when a company renames. Use CIK as the stable identifier and update the canonical `name` when a new filing uses a different name. Old names become aliases.

### Same Name, Different Company

| Name | Company 1 | Company 2 |
|------|-----------|-----------|
| "Mercury Systems" | Mercury Systems Inc (defense electronics, CIK 868703) | Mercury General Corp (insurance, CIK 883984) |
| "Delta" | Delta Air Lines (airline) | Delta Electronics (electronics manufacturer) |

**Solution:** Disambiguation uses CIK when available. When resolving from a source without CIK (ImportYeti, USPTO), use SIC code or industry context from the surrounding text to select the correct entity. If ambiguous, create both as candidates and let the confidence scoring sort it out (the one with corroborating evidence from other sources wins).

### Non-English Company Names

| Source Name | English Equivalent |
|------------|-------------------|
| "三星電子" | Samsung Electronics |
| "トヨタ自動車" | Toyota Motor Corporation |

**Solution:** Out of scope for MVP. US customs records and SEC filings use English names. Non-English names will only appear if a future data source introduces them.

---

## Pipeline Integration

Entity resolution runs at two points in the pipeline:

1. **Post-extraction:** After the LLM extracts supplier names from a filing, each name is resolved against known entities. Matches are linked; new entities are created.

2. **Cross-source merging:** When a new data source is integrated (e.g., ImportYeti in Phase 4), its entities are bulk-resolved against the existing entity database. This is a batch job that runs the three-tier process on every new entity name.

### Resolution Flow

```
Input: "Taiwan Semiconductor Mfg Co Ltd"
    │
    ├─ Check alias table → no match
    │
    ├─ Tier 1: normalize → "taiwan semiconductor mfg"
    │   └─ Exact match in companies.name_normalized? → no match
    │
    ├─ Tier 2: fuzzy match
    │   └─ pg_trgm pre-filter → top candidates:
    │       1. "taiwan semiconductor manufacturing" (similarity: 0.78)
    │       2. "taiwan semiconductor" (similarity: 0.65)
    │   └─ token_set_ratio("taiwan semiconductor mfg", "taiwan semiconductor manufacturing") = 88
    │   └─ 88 >= 85 → AUTO-MATCH → company_id: abc-123
    │
    └─ Result: matched to "Taiwan Semiconductor Manufacturing Company, Limited" with confidence 0.88
```

### Feedback Loop

When a user searches for a company and the resolution makes an incorrect match (detectable through future user feedback or manual review), the correction is stored and the algorithm learns:

- Incorrect matches become negative examples in the alias table (alias with a `DO NOT MATCH` flag)
- Correct matches that required Tier 3 are promoted to the alias table for future Tier 1 matching
- Over time, the alias table grows and fewer resolutions need fuzzy or vector matching
