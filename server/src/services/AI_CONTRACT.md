# CrisisAI — AI Extraction Contract

## Purpose

Converts a citizen's natural-language emergency report into structured, validated incident data for decision-support.

**AI output is decision-support information ONLY.**
**Critical decisions require human review by authorized responders.**

---

## Input

| Field | Type | Description |
|-------|------|-------------|
| `reportText` | `string` | Raw natural-language citizen emergency report. |

---

## Output

A single valid JSON object with the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `category` | `string` | Disaster category (see allowed values). |
| `severity` | `string` | Estimated severity level. |
| `peopleAffected` | `integer \| null` | Number of people affected, or `null` if unknown. |
| `injuries` | `integer \| null` | Number of injuries, or `null` if unknown. |
| `urgency` | `string` | Urgency level. |
| `locationClue` | `string \| null` | Location clue extracted from the report, or `null`. |
| `requiredResources` | `string[]` | Array of required resources (may be empty). |
| `summary` | `string` | Concise one-sentence factual summary. |
| `confidence` | `number` | AI confidence in the extraction (0–1). |

---

## Allowed Values

### Category
`flood` · `earthquake` · `fire` · `cyclone` · `building_collapse` · `landslide` · `medical_emergency` · `road_accident` · `other`

### Severity
`low` · `medium` · `high` · `critical`

### Urgency
`routine` · `soon` · `urgent` · `immediate`

### Required Resources
`ambulance` · `medical_team` · `fire_rescue` · `search_rescue` · `food` · `drinking_water` · `shelter` · `rescue_boat` · `police` · `evacuation_team`

---

## Constraints

1. **No hallucination.** The AI must not invent facts absent from the report.
2. **Null for unknowns.** Missing information must be `null` (scalars) or `[]` (arrays), never fabricated.
3. **Decision support only.** AI output aids human decision-making — it does not make autonomous decisions.
4. **Human review required.** All critical dispatching and triage decisions must be reviewed by authorized personnel.
5. **Validation required.** All Gemini output must be validated against the schema before use by any backend algorithm.
6. **Gemini may produce unexpected output.** The model may occasionally return malformed JSON, extra text, or non-conforming values. The system must handle these cases gracefully.
7. **Confidence is not certainty.** The confidence score represents the AI's self-assessed confidence in the extraction quality, not real-world certainty. It must never override human judgment.
8. **Controlled values only.** Category, severity, urgency, and resources must map to the defined controlled vocabulary. Uncontrolled variations (e.g., "very severe", "fire department") are not accepted.

---

## Failure Modes

| Mode | Description | Handling |
|------|-------------|----------|
| Verbose non-JSON | Model returns explanations around the JSON | `safeParseJSON` extracts the JSON object |
| Missing fields | Output lacks required fields | Schema validation rejects with specific errors |
| Invalid values | Values outside controlled vocabulary | Schema validation rejects with specific errors |
| Invalid confidence | Confidence outside 0–1 range | Schema validation rejects |
| Hallucinated data | AI invents unsupported facts | Anti-hallucination prompt instructions + human review |
| Malformed JSON | Completely unparseable response | `safeParseJSON` returns a parse error |
