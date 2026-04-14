# StackTrace — Prompt Library

All prompts are versioned. Each prompt includes the system message, user message template, expected output format, performance notes, and known limitations.

---

## 1. Supplier Extraction from 10-K Risk Factors

**Version:** 1.0
**Model:** Claude Sonnet
**Purpose:** Extract supplier names, relationship types, and dependency levels from SEC 10-K filing sections.

### System Message

```
You are a supply chain analyst extracting supplier relationships from SEC filings. Your task is to identify companies that are named or clearly implied as suppliers, vendors, manufacturers, or service providers to the filing company.

Rules:
1. Only extract companies that supply goods or services TO the filing company. Do not extract customers, competitors, partners, or regulatory bodies.
2. For each supplier, identify the relationship type: raw_materials, manufacturing, logistics, technology, services, or unknown.
3. Assess dependency level: sole_source (explicitly stated as only supplier), primary (described as key/critical/major), secondary (mentioned but not described as critical), minor (mentioned in passing).
4. Assign a confidence score from 0.0 to 1.0 based on how explicitly the supplier relationship is stated.
5. Quote the exact sentence or phrase from the text where the supplier is mentioned. The quote must be a verbatim substring of the input text.
6. Do not infer suppliers that are not mentioned or clearly implied in the text. Do not use your general knowledge of the company's supply chain.
7. If no suppliers are identifiable, return an empty array.
```

### User Message Template

```
Filing company: {company_name} (CIK: {cik})
Filing type: {filing_type} (filed {filing_date})
Section: {section_name}

Extract all supplier relationships from the following text:

---
{section_text}
---

Respond in JSON format:
{
  "suppliers": [
    {
      "name": "Supplier Company Name",
      "relationship_type": "manufacturing|raw_materials|logistics|technology|services|unknown",
      "dependency_level": "sole_source|primary|secondary|minor",
      "confidence": 0.85,
      "source_quote": "exact quote from the text",
      "notes": "brief explanation of why this is classified as a supplier"
    }
  ]
}
```

### Expected Output Example

```json
{
  "suppliers": [
    {
      "name": "Taiwan Semiconductor Manufacturing Company",
      "relationship_type": "manufacturing",
      "dependency_level": "primary",
      "confidence": 0.92,
      "source_quote": "We depend on Taiwan Semiconductor Manufacturing Company, or TSMC, to manufacture substantially all of our semiconductor products.",
      "notes": "Explicitly named as manufacturer of semiconductor products with strong dependency language ('substantially all')."
    },
    {
      "name": "Foxconn Technology Group",
      "relationship_type": "manufacturing",
      "dependency_level": "primary",
      "confidence": 0.78,
      "source_quote": "Our products are assembled by a limited number of contract manufacturers, primarily located in China.",
      "notes": "Not named directly in this excerpt but Foxconn is the implied manufacturer. Lower confidence because the name is inferred from context rather than explicit mention."
    }
  ]
}
```

### Performance Notes

- **Precision on 50-filing test set:** 83%. Most false positives are companies mentioned as partners or customers that the LLM misclassifies as suppliers.
- **Recall on 50-filing test set:** 71%. Misses suppliers mentioned only by product name ("our Gorilla Glass supplier") without naming the company (Corning).
- **Average confidence calibration:** Confidence scores correlate with actual accuracy. Extractions scored >0.8 are correct ~90% of the time. Extractions scored 0.5-0.8 are correct ~65% of the time.
- **Token usage:** Average 10-K Risk Factors section is ~8,000-15,000 tokens input. Output averages ~500-1,500 tokens. Total cost per extraction: ~$0.03 with Sonnet.

### Known Limitations

1. **Inferred suppliers:** When a filing says "our sole-source supplier of optical components" without naming the company, the LLM sometimes fills in a name from its training data. Rule 6 in the system prompt mitigates this, but it's not 100% effective. The source_quote validation step in the pipeline catches most cases.
2. **Competitors misclassified as suppliers:** Technology companies often mention competitors in risk factors. "We compete with Intel for..." can be misread as a supply relationship if the surrounding context discusses components. The explicit instruction to exclude competitors helps but edge cases remain.
3. **Conglomerate ambiguity:** When a filing mentions "Samsung," it's unclear whether this refers to Samsung Electronics (chip supplier), Samsung Display (display supplier), or Samsung SDI (battery supplier). The current prompt doesn't attempt disambiguation — it extracts "Samsung" and lets entity resolution handle the mapping.
4. **Historical relationships:** Filings sometimes discuss former suppliers ("we previously relied on..."). The prompt doesn't explicitly filter these out. The `first_seen`/`last_seen` fields in the database provide some temporal context, but current-vs-historical classification needs improvement.

---

## 2. Customs Data Goods Description Classification

**Version:** 1.0
**Model:** Claude Haiku (cost-sensitive, high volume)
**Purpose:** Classify free-text goods descriptions from US Customs Bill of Lading records into standardized product categories.

### System Message

```
You are a trade classification specialist. Given a free-text goods description from a US Customs Bill of Lading record, classify it into one of the following categories:

Categories:
- semiconductors: chips, wafers, integrated circuits, processors, memory modules
- electronics_components: capacitors, resistors, PCBs, connectors, sensors
- displays: LCD panels, OLED screens, touch modules, display glass
- batteries: lithium cells, battery packs, battery materials
- raw_materials: metals, chemicals, minerals, polymers, resins
- mechanical_parts: enclosures, housings, fasteners, molds, stampings
- optical: lenses, cameras, optical sensors, fiber optic components
- packaging: boxes, labels, protective packaging, pallets
- textiles: fabrics, yarns, garments, footwear materials
- food_ingredients: agricultural products, food additives, flavors
- pharmaceuticals: active ingredients, excipients, medical devices
- machinery: manufacturing equipment, tools, industrial machines
- other: anything that doesn't fit the above categories

Respond with only the category name and a confidence score.
```

### User Message Template

```
Classify this goods description:

"{goods_description}"

Respond in JSON:
{"category": "category_name", "confidence": 0.85}
```

### Expected Output Example

```json
{"category": "semiconductors", "confidence": 0.95}
```

### Performance Notes

- **Accuracy on 200-record test set:** 89%. Most errors are in the "other" category (records that should be classified but are too vague) and boundary cases between categories (e.g., "optical sensor module" — is it electronics_components or optical?).
- **Using Haiku for cost:** At $0.25/1M input tokens, classifying 10,000 customs records costs ~$0.50. This is a high-volume, low-complexity task where Haiku is appropriate.
- **Latency:** ~200ms per classification with Haiku. Batch processing uses asyncio to parallelize.

### Known Limitations

1. **Vague descriptions:** Many customs records have intentionally vague descriptions ("ELECTRONIC PARTS", "MISC COMPONENTS", "CONSUMER GOODS"). These get classified as "other" with low confidence. They represent ~15% of records.
2. **Multi-category shipments:** A single Bill of Lading can contain multiple product types ("DISPLAY PANELS AND BATTERY MODULES"). The prompt returns only one category. For MVP, the primary/first-mentioned item determines the category. A multi-label version is planned for v2.0.
3. **Coded descriptions:** Some importers use internal codes ("MODEL A1234 REV C"). These are unclassifiable without additional context.

---

## 3. Health Score Signal Extraction

**Version:** 1.0
**Model:** Claude Sonnet
**Purpose:** Extract health signals from SEC filing text that feed into the health score calculation. This complements the structured supplier extraction by identifying broader supply chain health indicators.

### System Message

```
You are a financial analyst evaluating supply chain health from SEC filing disclosures. Extract signals that indicate the strength or fragility of the company's supply chain.

For each signal, classify it as:
- positive: indicates supply chain resilience (diversification, long-term contracts, multiple sources)
- negative: indicates supply chain fragility (single source, geographic concentration, recent disruption)
- neutral: factual statement without clear positive/negative implication

Extract the following signal types when present:
1. supplier_count: any mention of how many suppliers the company uses
2. geographic_concentration: mentions of where suppliers or manufacturing is located
3. sole_source: any dependency on a single supplier for a critical input
4. contract_duration: mentions of long-term vs short-term supplier agreements
5. disruption_history: past supply chain disruptions mentioned in the filing
6. mitigation_strategy: actions taken to reduce supply chain risk (dual-sourcing, safety stock, reshoring)
7. going_concern: language suggesting a supplier or the company itself faces viability risk
8. regulatory_risk: supply chain risks from tariffs, sanctions, export controls, or regulatory changes
```

### User Message Template

```
Company: {company_name}
Filing: {filing_type} filed {filing_date}

Extract supply chain health signals from the following text:

---
{section_text}
---

Respond in JSON format:
{
  "signals": [
    {
      "type": "signal_type",
      "sentiment": "positive|negative|neutral",
      "value": "extracted value or summary",
      "source_quote": "exact quote from text",
      "score_impact": "description of how this should affect health score"
    }
  ]
}
```

### Expected Output Example

```json
{
  "signals": [
    {
      "type": "geographic_concentration",
      "sentiment": "negative",
      "value": "Majority of manufacturing concentrated in China and Taiwan",
      "source_quote": "A significant portion of our product manufacturing and component sourcing is concentrated in China and Taiwan, which subjects us to risks associated with geopolitical tensions.",
      "score_impact": "Should reduce geographic spread score. High concentration in two countries with active geopolitical risk."
    },
    {
      "type": "mitigation_strategy",
      "sentiment": "positive",
      "value": "Active diversification into India and Vietnam",
      "source_quote": "We have begun to diversify our manufacturing footprint by establishing new supplier relationships in India and Vietnam.",
      "score_impact": "Partially offsets geographic concentration. Indicates awareness of risk and active mitigation."
    },
    {
      "type": "sole_source",
      "sentiment": "negative",
      "value": "Single source for advanced chip fabrication",
      "source_quote": "Certain of our custom silicon components are fabricated by a single third-party foundry, and there can be no assurance that this foundry will be able to meet our manufacturing requirements.",
      "score_impact": "Strong negative signal for diversification score. Sole-source dependency on a critical component."
    }
  ]
}
```

### Performance Notes

- **Signal extraction recall:** 78% on a 30-filing test set. Most missed signals are mitigation strategies buried in forward-looking statements sections that are linguistically hard to distinguish from generic legal boilerplate.
- **Sentiment accuracy:** 91%. False classifications are mostly neutral signals classified as positive (e.g., "we have multiple suppliers" stated as fact in a section about risk, scored as positive when it's actually neutral context).
- **Complementary to supplier extraction:** This prompt captures broad signals (geographic concentration, disruption history) that the supplier extraction prompt misses because they aren't tied to specific named suppliers.

### Known Limitations

1. **Boilerplate filtering:** SEC filings contain extensive legal boilerplate that mentions supply chain risk generically. The prompt sometimes extracts boilerplate as a signal. Future versions should include examples of boilerplate to ignore.
2. **Forward-looking statement bias:** Companies discuss risk mitigation plans that haven't been executed yet. "We plan to diversify our supplier base" is a stated intention, not a current strength. The prompt doesn't reliably distinguish between current state and future plans.
3. **Quantitative signals:** The prompt extracts qualitative signals well but misses quantitative data (e.g., "our top 3 suppliers represent 72% of our COGS"). A structured data extraction pass (potentially XBRL-based) would capture these better than narrative analysis.
4. **Cross-section signals:** Some signals span multiple sections of a filing (risk factors + MD&A + business description all discussing the same supply chain issue). The prompt processes one section at a time and may extract the same signal multiple times with different framing. Deduplication happens downstream.

---

## Prompt Versioning Policy

- Each prompt has a version number (major.minor)
- Major version change: structural change to output format, or system message rewrite
- Minor version change: wording refinement, threshold adjustment, additional examples
- All versions are stored in this file with the version number in the heading
- The pipeline references prompts by name and version, so old extractions can be traced to the prompt that generated them
- When a prompt version changes, a re-extraction of a sample set (50 filings) is run to measure the impact before batch reprocessing
