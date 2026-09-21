# Day 13: Text-Similarity Duplicate Detection Service

## Overview

The Duplicate Detection Service provides text-based similarity matching to detect when newly submitted citizen reports potentially describe the same real-world disaster event as an existing active incident.

In Day 13 (Version 1), this service operates **strictly as a detection and logging mechanism**. It flags candidate matches without merging incidents, deleting records, altering incident statuses, modifying priority scores, or blocking submission.

---

## 1. Similarity Method: Vector Space Cosine Similarity

Text similarity between a new report description ($Q$) and an existing incident description ($D$) is computed using **Cosine Similarity over Term Frequency (TF) Vectors**:

$$\text{Cosine Similarity}(Q, D) = \frac{\vec{V}_Q \cdot \vec{V}_D}{\|\vec{V}_Q\| \|\vec{V}_D\|} = \frac{\sum_{w} \text{TF}(w, Q) \times \text{TF}(w, D)}{\sqrt{\sum_w \text{TF}(w, Q)^2} \times \sqrt{\sum_w \text{TF}(w, D)^2}}$$

### Why this approach?
- **Normalized Range [0.0, 1.0]**: Cosine similarity on non-negative frequency vectors produces a strictly bounded metric:
  - `0.0`: Completely disjoint vocabularies (zero overlapping words).
  - `1.0`: Identical or normalization-equivalent text.
- **Independence from Document Length**: Cosine normalization scales out length bias, preventing lengthy reports from artificially skewing scores.
- **Zero Heavy Dependencies**: Pure JavaScript implementation without native C++ compilation or fragile external binary packages.
- **Deterministic & Modular**: Functions are stateless pure functions that can be tested in isolation.

---

## 2. Text Normalization Pipeline

Before vector computation, all text undergoes sequential normalization via `normalizeText()`:

1. **Null/Type Safety**: If the input is `null`, `undefined`, or not a string, it safely returns an empty string `""`.
2. **Lowercasing**: Converts all characters to lowercase (`text.toLowerCase()`) so that case differences (`FIRE` vs `fire`) do not affect comparison.
3. **Punctuation Stripping**: Replaces all non-alphanumeric, non-whitespace characters (`/[^\w\s]/g`) with spaces. This preserves alphanumeric tokens (e.g. `10`, `bus`, `stand`) while eliminating exclamation marks, commas, periods, etc.
4. **Whitespace Normalization**: Collapses repeated spaces, tabs, and newlines into single spaces (`/\s+/g` $\to$ `' '`).
5. **Trimming**: Strips leading and trailing whitespace.

### Example:
- Input 1: `"FIRE near Vellore BUS STAND!!!"`
- Input 2: `"Fire near Vellore bus stand"`
- Both normalize to: `"fire near vellore bus stand"` $\to$ **Similarity = 1.0000**.

---

## 3. Candidate Incident Filtering Logic

To optimize performance and eliminate false positives against closed cases, the service only compares incoming reports against **Recent Open Incidents**:

- **Active Statuses Filter**:
  ```javascript
  status: { $in: ['reported', 'under_review', 'assigned'] }
  ```
  Only unresolved incidents are considered candidate duplicates.
- **Closed Statuses Excluded**:
  `resolved` and `cancelled` incidents are strictly ignored, as past resolved events should not be flagged as duplicates of new emergencies.
- **Recency Window**:
  Capped at the most recent **50 open incidents** (`limit(50)` sorted by `createdAt: -1`). Historical backlogs are not repeatedly queried.
- **Day 13 Scope Notice**:
  Geographic radius, coordinates (latitude/longitude), Haversine calculations, and time-decay windows are **NOT** utilized in Day 13 and are reserved for Day 14.

---

## 4. Similarity Threshold

The starting threshold is set to:
```javascript
export const TEXT_DUPLICATE_THRESHOLD = 0.75;
```

### Rationale:
- **Heuristic Baseline**: `0.75` provides high precision for identical or near-identical text while requiring substantial lexical overlap before alerting dispatchers.
- **Configurable**: Callers can pass a custom threshold in the options parameter:
  ```javascript
  findTextDuplicateCandidates(reportText, incidents, { threshold: 0.80 });
  ```
- **Not Universally Perfect**: Pure text similarity is sensitive to rephrasing and synonyms. `0.75` is an empirical starting heuristic that will be augmented with spatial-temporal signals in Day 14.

---

## 5. Candidate Matches & Structured Logging

When candidates meet or exceed the configured threshold, they are sorted descending by similarity score and formatted as:

```json
[
  {
    "incidentId": "65e2b4f91c9d440012345678",
    "similarity": 0.8742,
    "matchedReport": "There is a severe fire near Vellore bus stand...",
    "candidate": true
  }
]
```

### Structured Log Event
Each detected candidate duplicate emits a structured JSON log entry via standard output:

```json
{
  "event": "DUPLICATE_CANDIDATE",
  "incidentId": "65e2b4f91c9d440012345678",
  "similarity": 0.8742,
  "threshold": 0.75,
  "timestamp": "2026-09-21T16:47:00.123Z"
}
```

### Security & Privacy:
The logger strictly suppresses:
- Passwords and hashes
- Authentication JWTs
- Gemini API Keys
- Unnecessary user PII

---

## 6. Why Duplicates Are NOT Automatically Acted Upon (Day 13)

Automatic merging, deduplication, or rejection is deliberately prohibited at this stage:

1. **Risk of Dropping Critical Calls**: Two citizens reporting fires 5 miles apart using similar generic language ("A fire broke out in a building") must not be merged without geographic confirmation.
2. **Loss of Independent Evidence**: Multiple citizen reports for a single disaster provide corroborating evidence, victim count updates, and changing conditions.
3. **Safety First**: Dispatch operators must retain decision authority. Automated suppression of genuine emergencies carries severe life-safety risks.
4. **Multi-Factor Fusion Needed**: Reliable duplicate decisions require fusing **Text Similarity + Geographic Proximity (Haversine) + Time Proximity (Time Window)**, scheduled for Day 14+.

---

## 7. Known Limitations of Pure Text Similarity

- **Synonym & Paraphrasing Gap**: "10 people trapped" vs "ten victims caught inside" uses completely different tokens despite conveying identical meaning.
- **Identical Description, Different Locations**: "Car accident on the highway" can occur simultaneously in two different cities; text alone cannot distinguish them.
- **Different Incidents, Shared Disaster Vocabulary**: Disaster reports frequently share terms like "water", "food", "help", "emergency", "injured", which can elevate baseline similarity between unrelated events.

---

## 8. Threshold Tuning & Next Steps (Day 14)

1. **Empirical Calibration**: Monitor `DUPLICATE_CANDIDATE` structured logs in staging to adjust the threshold based on false positive vs false negative rates.
2. **Day 14 Spatial-Temporal Integration**:
   - Calculate Haversine distance between report coordinates.
   - Enforce a geographic radius (e.g., within 2–5 km).
   - Enforce a time window (e.g., reported within the last 2–4 hours).
   - Compute a composite duplicate score combining text similarity, distance, and time delta.
