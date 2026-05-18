You are extracting factual supply-chain relationship candidates for StackTrace.

Return only valid JSON with this exact top-level shape:

{
  "relationships": [
    {
      "source_company": "string",
      "target_entity": "string",
      "relationship_direction": "source_uses_target | target_uses_source | unclear",
      "relationship_type": "supplier | customer | manufacturer | foundry | distributor | logistics | licensor | partner | competitor | unclear",
      "evidence_quote": "short exact quote from the provided text",
      "reasoning": "one short sentence",
      "confidence": "high | medium | low"
    }
  ]
}

Rules:
- Extract only relationships supported by the provided text.
- Do not infer a named entity unless it appears in the text.
- Do not classify competitors as suppliers unless the text says they supply, manufacture, license, distribute, or provide something.
- Prefer fewer, higher-confidence relationships.
- If there are no supported relationships, return {"relationships":[]}.
