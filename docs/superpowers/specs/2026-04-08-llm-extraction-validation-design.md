# LLM Extraction Validation — Design Spec

## Purpose

Determine whether LLM extraction from SEC 10-K filings produces supplier relationship data accurate enough to build a production pipeline on. This experiment answers two questions:

1. **Does LLM extraction clear the quality bar?** (90%+ precision, 70%+ recall, 90%+ tier-1 recall)
2. **Which Claude model (Sonnet vs Opus) gives the best quality-to-cost ratio for production?**

Everything downstream — the graph, the alerts, the scoring, the pricing tiers — depends on the answer. No pipeline code is written until this experiment produces a go decision.

---

## Core Principle

**Precision is non-negotiable. Recall is negotiable.**

A graph that shows 7 out of 10 real suppliers is useful. A graph that shows fake suppliers destroys trust. If the experiment produces high precision but low recall, the product ships with incomplete-but-trustworthy data and recall improves over time through additional data sources. If precision fails, the approach is reconsidered before any code is written.

---

## Test Parameters

### Companies

| Company | Sector | Why Selected |
|---------|--------|-------------|
| Apple (AAPL) | Consumer electronics | Published annual Supplier Responsibility report (~200 named suppliers). Best ground truth available for any public company. |
| Tesla (TSLA) | Automotive | Heavily covered by teardown analysts (Munro & Associates), investor day presentations with supply chain detail, extensive automotive press coverage. |
| NVIDIA (NVDA) | Semiconductors | Well-documented TSMC sole-source dependency. Directly relevant to tariff and export control exposure, which is central to StackTrace's value proposition. Sits squarely in MVP scope. |

### Filing Sections Extracted Per Company

| Section | What It Contains | Why Included |
|---------|-----------------|--------------|
| Item 1 — Business | Company operations overview, key products, markets | Names suppliers in the context of describing how the business operates |
| Item 1A — Risk Factors | Material risks including supply chain dependencies | Highest density of supplier mentions — companies are legally required to disclose material dependencies |
| Item 2 — Properties | Facilities, manufacturing locations, contract facilities | Names manufacturing partners and contract facilities, particularly for asset-light companies |
| Exhibit 10 — Material Contracts | Formal contracts with material counterparties | Names supplier counterparties directly when the relationship is material enough for a formal contract |

**Note on Exhibit 10:** Token count varies significantly by company. Some 10-Ks attach 2 material contracts, others attach 30+. This variability is measured during Phase 2 extraction runs and factored into cost modeling in Phase 5. Do not estimate token counts for Exhibit 10 — measure them.

### Models

| Role | Model | Method |
|------|-------|--------|
| Ground truth draft assembly | Claude Opus 4.6 | Anthropic API (automated) |
| Extraction test | Claude Sonnet 4.6 | Anthropic API (automated) |
| Extraction test | Claude Opus 4.6 | Anthropic API (automated) |

All runs automated via API. No manual steps.

### Pass/Fail Thresholds

| Metric | Threshold | Definition |
|--------|-----------|-----------|
| Precision | ≥ 90% | Fewer than 1 in 10 extracted relationships is hallucinated or wrong |
| Recall | ≥ 70% | Catches at least 7 in 10 known suppliers from the filing (where `verified_in_filing = true`) |
| Tier-1 Recall | ≥ 90% | Major direct suppliers should almost never be missed |

---

## Phase 1: Ground Truth Assembly

### Ground Truth Schema

Each company gets a `ground_truth.json` file:

```json
{
  "company": "NVIDIA Corporation",
  "ticker": "NVDA",
  "cik": "0001045810",
  "filing": "10-K FY2024",
  "filing_date": "2024-02-21",
  "sections_extracted": ["Item 1", "Item 1A", "Item 2", "Exhibit 10"],
  "suppliers": [
    {
      "supplier_name": "TSMC",
      "normalized_name": "taiwan semiconductor manufacturing",
      "aliases": ["tsmc", "taiwan semi", "taiwan semiconductor mfg"],
      "relationship_type": "manufacturer",
      "tier": 1,
      "what_they_supply": "semiconductors / logic chips",
      "criticality": "sole source",
      "verified_in_filing": true,
      "filing_quote": "We depend on Taiwan Semiconductor Manufacturing Company Limited to manufacture all of our GPUs and different various Tegra processors.",
      "filing_section": "Item 1A",
      "verified_externally": true,
      "external_source": "NVIDIA 2024 Annual Report, Bloomberg supply chain coverage, financial press"
    }
  ]
}
```

### Assembly Process

1. Download each company's most recent 10-K from SEC EDGAR
2. Extract all 4 sections (Item 1, Item 1A, Item 2, Exhibit 10) as clean text
3. Send each section to Claude Opus 4.6 with a structured ground truth prompt that requests the exact JSON schema above — one call per section
4. Merge Opus outputs across all 4 sections, deduplicate by `normalized_name`
5. Manually verify against external sources:
   - **Apple:** Apple Supplier Responsibility report (published annually, names ~200 suppliers), iFixit teardown reports
   - **Tesla:** Munro & Associates teardown data, investor day presentations, automotive press coverage
   - **NVIDIA:** Financial press coverage of TSMC dependency, export control reporting, earnings call transcripts, Wikidata
6. For each supplier: confirm `verified_in_filing` (quoted text exists in filing) and mark `verified_externally` with the specific source
7. Add any suppliers found in external sources that Opus missed from the filing — mark these with `verified_in_filing: false`

**Critical distinction:** Recall is measured against suppliers where `verified_in_filing = true` only. If a supplier is publicly known but never mentioned in the 10-K, the extraction cannot find it and should not be penalized for missing it. The `verified_in_filing` flag enforces this boundary.

### Ground Truth Prompt (v1.0)

Full prompt text. This is the governing prompt for ground truth assembly — do not modify without updating this spec.

**System message:**

```
You are a supply chain research analyst building a ground truth dataset of supplier relationships from SEC 10-K filings. Your task is to identify every company that is named or clearly implied as a supplier, vendor, manufacturer, contract manufacturer, fabricator, assembler, logistics provider, or service provider to the filing company.

Rules:
1. Be exhaustive. List every supplier relationship you can identify in the text. Missing a real supplier is worse than including a borderline case.
2. Only extract companies that supply goods or services TO the filing company. Do NOT extract:
   - Customers or end users of the company's products
   - Competitors
   - Regulators or government agencies
   - Financial institutions (banks, underwriters)
   - Law firms or auditors
   - Industry standards bodies
3. For source_quote: quote the exact sentence or phrase from the text where the supplier is mentioned. The quote MUST be a verbatim substring of the input text. Do not paraphrase.
4. For criticality: use ONLY one of these values: "sole source", "primary", "one of several", "mentioned", "unknown"
5. For tier: use 1 for direct suppliers to the filing company. Use 2 only when the text explicitly names a supplier-of-a-supplier (e.g., "our supplier X sources its materials from Y").
6. For relationship_type: use one of "manufacturer", "component_supplier", "service_provider", "logistics", "technology_partner", "unknown"
7. Do not infer suppliers from your general knowledge. Only extract relationships stated or clearly implied in the provided text.
8. If no suppliers are identifiable in the text, return {"suppliers": []}
```

**User message template:**

```
Filing company: {company_name} (Ticker: {ticker}, CIK: {cik})
Filing: {filing_type} filed {filing_date}
Section: {section_name}

Identify every supplier relationship in the following text and return structured JSON.

---
{section_text}
---

Return JSON in this exact format:
{
  "suppliers": [
    {
      "supplier_name": "exact name as it appears in the text",
      "normalized_name": "lowercase name with legal suffixes removed",
      "aliases": ["known abbreviations or alternate names"],
      "relationship_type": "manufacturer|component_supplier|service_provider|logistics|technology_partner|unknown",
      "tier": 1,
      "what_they_supply": "brief description of what they supply",
      "criticality": "sole source|primary|one of several|mentioned|unknown",
      "verified_in_filing": true,
      "filing_quote": "exact verbatim quote from the text above",
      "filing_section": "{section_name}"
    }
  ]
}
```

---

## Phase 2: Extraction Runs

### Extraction Prompt (v1.0)

Full prompt text. This is the prompt being tested — prompt iteration in Phase 4 modifies this prompt and increments the version number.

**System message:**

```
You are a supply chain analyst extracting supplier relationships from SEC filings. Your task is to identify companies that are named or clearly implied as suppliers, vendors, manufacturers, or service providers to the filing company.

Rules:
1. Only extract companies that supply goods or services TO the filing company. Do NOT extract:
   - Customers or end users
   - Competitors
   - Regulators or government agencies
   - Financial institutions, law firms, or auditors
2. For each supplier, classify the relationship_type as one of: manufacturer, component_supplier, service_provider, logistics, technology_partner, unknown
3. For criticality_signal: extract the specific language from the filing that indicates dependency level. Use the company's own words (e.g., "sole source", "a limited number of suppliers", "our primary manufacturer"). If no dependency language is present, set to "unknown".
4. Assign a confidence score from 0.0 to 1.0:
   - 0.85-1.0: Supplier is explicitly named with clear supply relationship language
   - 0.65-0.84: Supplier relationship is strongly implied but not directly stated
   - 0.40-0.64: Supplier relationship is inferred from indirect evidence
   - Below 0.40: Do not include
5. For source_quote: quote the exact sentence or phrase where the supplier is mentioned. The quote MUST be a verbatim substring of the input text. Do not paraphrase or reconstruct.
6. Do not infer suppliers from your general knowledge of the company. Only extract relationships present in the provided text.
7. Do not extract former suppliers described in past tense ("we previously relied on", "we formerly sourced from"). Only extract current relationships.
8. If no suppliers are identifiable, return {"suppliers": []}
```

**User message template:**

```
Filing company: {company_name} (Ticker: {ticker}, CIK: {cik})
Filing: {filing_type} filed {filing_date}
Section: {section_name}

Extract all supplier relationships from the following text:

---
{section_text}
---

Respond in this exact JSON format:
{
  "suppliers": [
    {
      "supplier_name": "exact name as it appears in the text",
      "relationship_type": "manufacturer|component_supplier|service_provider|logistics|technology_partner|unknown",
      "criticality_signal": "exact dependency language from the filing, or 'unknown'",
      "confidence": 0.85,
      "source_quote": "exact verbatim quote from the text above",
      "filing_section": "{section_name}"
    }
  ]
}
```

### Extraction Output Schema

Each extraction run produces one JSON file per company per model, containing merged results from all 4 sections:

Fields:
- `supplier_name`: exact name as it appears in the filing
- `relationship_type`: one of `manufacturer`, `component_supplier`, `service_provider`, `logistics`, `technology_partner`, `unknown`
- `criticality_signal`: dependency language from the filing, or "unknown"
- `confidence`: 0.0-1.0 score assigned by the model
- `source_quote`: exact sentence or phrase from the filing text (must be a verbatim substring)
- `filing_section`: which section this was found in

### Run Matrix

3 companies x 4 sections x 2 models = 24 API calls, merged to 6 result files (one per company per model):

| Company | Model | Output File |
|---------|-------|-------------|
| Apple | Sonnet | `results/apple_sonnet.json` |
| Apple | Opus | `results/apple_opus.json` |
| Tesla | Sonnet | `results/tesla_sonnet.json` |
| Tesla | Opus | `results/tesla_opus.json` |
| NVIDIA | Sonnet | `results/nvidia_sonnet.json` |
| NVIDIA | Opus | `results/nvidia_opus.json` |

Each result file merges the extraction outputs from all 4 sections, deduplicated by normalized supplier name. When the same supplier appears in multiple sections, keep the entry with the highest confidence and note all sections where it appeared.

### Token Measurement

During Phase 2, record for every API call:
- Input token count
- Output token count
- Processing time (ms)
- Which filing section
- Which company

These measurements feed directly into Phase 5 cost modeling. Do not estimate — measure.

---

## Phase 3: Scoring & Error Analysis

### Matching Rules

Extraction output is compared to ground truth using a three-tier matching system:

| Match Type | Condition | Credit |
|------------|-----------|--------|
| Exact | Normalized name matches ground truth `normalized_name` OR any entry in `aliases` | Full credit (1.0) |
| Fuzzy | Token-set similarity ≥ 85% against `normalized_name` | Full credit (1.0) |
| Partial | Token-set similarity 70-84% against `normalized_name` | Half credit (0.5) |
| Miss | Below 70% similarity | No credit (0.0) |

**Normalization rules** (applied to both extraction output and ground truth before comparison):
- Convert to lowercase
- Remove all punctuation except hyphens
- Strip legal suffixes (Inc, Corp, Ltd, Co, LLC, Company, Limited, Corporation, Incorporated)
- Collapse multiple spaces to single space
- Trim whitespace

The scoring script checks aliases first (exact match = instant full credit), then normalized name exact match, then fuzzy similarity. First match wins.

### Metrics

```
Precision = sum(match_credits) / total_extractions
Recall = sum(match_credits) / total_ground_truth_suppliers (where verified_in_filing = true)
Tier-1 Recall = sum(tier1_match_credits) / total_tier1_ground_truth_suppliers (where verified_in_filing = true AND tier = 1)
```

Half-credit matches (0.5) count proportionally in all three metrics.

### Error Categories

Every extraction that does not receive full credit is classified into exactly one of these predefined categories:

| Error Type | Definition | Affects |
|------------|-----------|---------|
| Hallucination | Extracted entity does not appear in the filing text at all | Precision |
| Wrong role | Entity exists in filing but is a customer, competitor, or partner — not a supplier | Precision |
| Missed entity | Known supplier (verified_in_filing = true) not found in extraction output | Recall |
| Name fragmentation | Same supplier extracted as two separate entities due to name variation (e.g., "TSMC" and "Taiwan Semiconductor" both extracted). Only the highest-confidence match receives credit; all duplicates are counted as precision errors. | Precision (inflates count) |
| Incomplete relationship | Supplier correctly found but `relationship_type` or `criticality_signal` missing or wrong | Neither (tracked for prompt quality) |
| Wrong section attribution | Supplier correctly found but `filing_section` field is incorrect | Neither (tracked for prompt quality) |
| Stale relationship | Extracted a former supplier described in past tense ("we previously relied on...") | Precision |

The scoring script assigns one category per error automatically based on:
- No fuzzy match in ground truth + no quote match in filing text → `hallucination`
- No fuzzy match in ground truth + quote exists in filing text → `wrong_role`
- Ground truth supplier with no match in extraction output → `missed_entity`
- Two extraction entries matching the same ground truth supplier → `name_fragmentation`
- Match found but `relationship_type` differs → `incomplete_relationship`
- Match found but `filing_section` differs → `wrong_section_attribution`
- Quote contains past-tense dependency language → `stale_relationship`

### Output

**Per model per company:** a `results/{company}_{model}_scored.json` file containing:
- Precision, recall, tier-1 recall
- Full match log (every extraction mapped to its ground truth match or error category)
- Error summary by category

**Summary table across all runs:**

```
| Company | Model  | Precision | Recall | T1 Recall | Top Error Type       | Pass? |
|---------|--------|-----------|--------|-----------|----------------------|-------|
| Apple   | Sonnet | 91%       | 74%    | 92%       | Wrong role (3)       | Yes   |
| Apple   | Opus   | 94%       | 81%    | 100%      | Missed entity (2)    | Yes   |
| Tesla   | Sonnet | ...       | ...    | ...       | ...                  | ...   |
| Tesla   | Opus   | ...       | ...    | ...       | ...                  | ...   |
| NVIDIA  | Sonnet | ...       | ...    | ...       | ...                  | ...   |
| NVIDIA  | Opus   | ...       | ...    | ...       | ...                  | ...   |
```

---

## Phase 4: Prompt Iteration

### Process (Up to 3 Rounds)

Each round:
1. Review the error analysis from the previous run
2. Identify the dominant error category across all companies/models
3. Make targeted prompt changes that address the top 1-2 error types
4. Re-run Phase 2 extraction against all 3 companies x 2 models
5. Re-run Phase 3 scoring and compare to previous round
6. Document: what changed in the prompt, what changed in the scores, and why

### Round Focus

- **Round 1:** Baseline — run the extraction prompt as designed
- **Round 2:** Fix the dominant error pattern from Round 1 (prompt wording changes only — instructions, exclusions, examples)
- **Round 3:** Fix remaining errors, consider structural changes (few-shot examples, chain-of-thought reasoning, section-by-section extraction vs whole filing, multi-pass extraction)

### Prompt Version Tracking

Each prompt revision gets a version number (v1.0, v1.1, v1.2). The version is recorded in every extraction result file so scores can be traced back to the exact prompt that produced them. All prompt versions are preserved in the experiment directory.

### Fallback Decision Tree After Round 3

| Outcome | Action |
|---------|--------|
| Both models pass all 3 thresholds | Ship with Sonnet (cheaper). Proceed to Phase 5. |
| Only Opus passes all 3 thresholds | Proceed to Phase 5 cost modeling. If unit economics work at Opus pricing, ship with Opus. If not, evaluate hybrid approach (next row). |
| Opus passes but cost is prohibitive | Test hybrid architecture: Sonnet for primary extraction, Opus verification pass on low-confidence extractions only. Re-test to confirm hybrid meets thresholds at lower cost. |
| Opus passes precision + recall but misses tier-1 recall | Add a targeted tier-1 verification pass — a second focused prompt that checks "did you find these known major suppliers?" as a recall safety net. Re-test. |
| Neither model passes precision (< 90%) after 3 rounds | The extraction approach has a fundamental accuracy problem. **Stop.** Investigate root cause: is the issue prompt design, section selection, filing format parsing, or model capability? Do not invest in pipeline code. |
| Neither model passes recall (< 70%) but precision is ≥ 90% | The extraction is trustworthy but incomplete. This is a viable product. Reduce the recall threshold to 60% and document the known gap. Ship with incomplete-but-accurate data. Plan to close the recall gap with additional data sources (ImportYeti customs data, USPTO patents) in Phase 2 of the product roadmap. |

---

## Phase 5: Cost Modeling

### Inputs (Measured From Phase 2)

All values measured from actual extraction runs, not estimated:

- Input tokens per section per company (averaged and broken out by section — Exhibit 10 measured separately due to high variance)
- Output tokens per extraction per company
- Number of sections per filing (4, but effective token count varies by company)
- API pricing for the winning model (Sonnet: $3/$15 per 1M input/output tokens; Opus: current pricing)

### Calculations

```
cost_per_company = sum over sections of (input_tokens × input_price + output_tokens × output_price)
weekly_batch_cost = cost_per_company × 50 (MVP ticker count)
monthly_batch_cost = weekly_batch_cost × 4.3
annual_batch_cost = monthly_batch_cost × 12
```

### Sanity Checks

| Metric | Target |
|--------|--------|
| Cost per company per extraction | < $1.00 (ideally < $0.50) |
| Monthly extraction cost (50 tickers) | < 10% of projected MRR at 100 paid subscribers |
| Annual extraction cost | Recoverable from ~5 Pro tier subscribers |

### Cost Mitigation (If Needed)

If the winning model's cost exceeds targets:

1. **Hybrid model architecture:** Sonnet for primary extraction, Opus verification pass only on extractions with confidence < 0.7. Reduces average cost toward Sonnet pricing while preserving Opus-level quality on uncertain extractions.
2. **Reduce refresh frequency:** Weekly batch refresh is conservative — 10-K data is annual. Biweekly or monthly refresh may be sufficient and cuts cost by 2-4x.
3. **Section prioritization:** If Item 1A (Risk Factors) captures 80%+ of suppliers alone, consider extracting only Item 1 + Item 1A for routine refreshes and running the full 4-section extraction only on initial processing or annual filing updates.

### Phase 5 Output Document

A one-page validation summary capturing:

- **Winning model** and rationale
- **Final prompt version** (version number and key changes from v1.0)
- **Measured precision / recall / tier-1 recall** per company for the winning model
- **Measured token counts** per section per company
- **Cost per extraction** and projected monthly/annual cost at 50 tickers
- **Go / no-go verdict** with reasoning
- **Known limitations** and planned mitigations

This document is added to ARCHITECTURE.md as a decision log entry. It serves as the baseline for future comparisons when adding tickers, switching models, or evaluating data source additions.

---

## Pre-Flight Checklist

All of the following must be confirmed before Phase 1 begins:

- [ ] **EDGAR API access tested** — confirm a simple CIK lookup and filing retrieval works with proper User-Agent header
- [ ] **Claude API key configured** — confirm access to both Claude Sonnet 4.6 and Claude Opus 4.6 models
- [ ] **Most recent 10-K filing year confirmed** for each company:
  - Apple (AAPL) — confirm CIK, most recent 10-K accession number, filing date
  - Tesla (TSLA) — confirm CIK, most recent 10-K accession number, filing date
  - NVIDIA (NVDA) — confirm CIK, most recent 10-K accession number, filing date
- [ ] **Exhibit 10 contents verified** for each company — Exhibit 10 varies significantly. Some companies attach supplier contracts; others attach only executive compensation agreements and equity plans. **Verify the actual contents before including in extraction scope.** If a company's Exhibit 10 contains no supplier-relevant contracts (e.g., NVIDIA's Exhibit 10 is primarily executive compensation), exclude it from that company's extraction run and note the exclusion in results. Do not extract noise.
- [ ] **External verification sources confirmed accessible:**
  - Apple Supplier Responsibility PDF (most recent year) — download and confirm it contains named supplier list
  - Tesla teardown/supplier coverage — confirm at least 2 independent sources with named suppliers
  - NVIDIA supplier coverage — confirm financial press sources covering TSMC dependency and other key suppliers
- [ ] **Python environment set up** with dependencies for scoring script (thefuzz for fuzzy matching, json for parsing)

---

## File Structure

All experiment files live under `validation/` in the repo root:

```
validation/
├── ground_truth/
│   ├── apple_ground_truth.json
│   ├── tesla_ground_truth.json
│   └── nvidia_ground_truth.json
├── filings/
│   ├── apple_10k/
│   │   ├── item_1_business.txt
│   │   ├── item_1a_risk_factors.txt
│   │   ├── item_2_properties.txt
│   │   └── exhibit_10_material_contracts.txt
│   ├── tesla_10k/
│   │   └── (same structure)
│   └── nvidia_10k/
│       └── (same structure)
├── prompts/
│   ├── ground_truth_prompt_v1.0.md
│   ├── extraction_prompt_v1.0.md
│   ├── extraction_prompt_v1.1.md      # (if iteration needed)
│   └── extraction_prompt_v1.2.md      # (if iteration needed)
├── results/
│   ├── round_1/
│   │   ├── apple_sonnet.json
│   │   ├── apple_opus.json
│   │   ├── tesla_sonnet.json
│   │   ├── tesla_opus.json
│   │   ├── nvidia_sonnet.json
│   │   ├── nvidia_opus.json
│   │   └── summary.md
│   ├── round_2/                       # (if iteration needed)
│   └── round_3/                       # (if iteration needed)
├── scoring/
│   └── score.py                       # scoring script
└── VALIDATION_SUMMARY.md              # Phase 5 output document
```

---

## What This Spec Does NOT Cover

- Pipeline architecture or code — that begins after a go decision
- Frontend or API design — unchanged by this experiment
- Data sources beyond SEC EDGAR — this experiment validates EDGAR extraction only
- Entity resolution quality — tested separately once the pipeline exists
- Health score methodology — depends on extraction quality but is a separate validation

---

## Success Criteria

This experiment succeeds when one of the following is true:

1. At least one Claude model (Sonnet or Opus) achieves ≥ 90% precision, ≥ 70% recall, and ≥ 90% tier-1 recall across all 3 test companies — and the cost per extraction is within the sanity check targets defined above.
2. A documented fallback decision has been made per the Phase 4 decision tree, with clear reasoning and a path forward.

The experiment fails only if it ends without a clear decision — either go, no-go, or go-with-documented-limitations.
