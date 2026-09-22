# CrisisAI Duplicate Detection Service Documentation (Version 2 — Day 14)

## Overview

The Duplicate Detection Service detects when newly submitted citizen reports potentially describe the same real-world disaster event as an existing active incident.

In **Day 14 (Version 2)**, the service upgrades from a single text similarity signal to a **tri-signal spatial-temporal evaluation engine**:
1. **Semantic Text Similarity** (Vector Space Cosine Similarity)
2. **Geographic Proximity** (Haversine Distance)
3. **Temporal Proximity** (Time Window Filtering)

The system combines these signals to determine whether an incoming report is a **likely duplicate** and links it via `possibleDuplicateOf`.

---

## CRITICAL SAFETY PRINCIPLE: HUMAN REVIEW ONLY

> [!IMPORTANT]
> **POSSIBLE DUPLICATE ≠ CONFIRMED DUPLICATE**
>
> Automated duplicate detection is strictly an advisory triage signal for human dispatchers. The system will **NEVER**:
> - Automatically delete incident records
> - Automatically merge or combine incident reports
> - Reject or block emergency report submissions
> - Permanently mark an incident as a duplicate
> - Alter priority scores or AI classifications due to duplicate detection
> - Modify the original existing incident
>
> Every flagged report remains saved in MongoDB, visible in triage queues, and available for human dispatcher verification.

---

## 1. Tri-Signal Architecture & Decision Rule

An incident is evaluated as a `likelyDuplicate` if and only if **all three signals** are satisfied:

$$\text{likelyDuplicate} = (\text{textMatch} == \text{true}) \land (\text{geoMatch} == \text{true}) \land (\text{timeMatch} == \text{true})$$

```
                   Incoming Emergency Report
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     [Signal 1: Text]   [Signal 2: Geo]    [Signal 3: Time]
     Cosine Similarity     Haversine          Time Delta
         ≥ 0.75             ≤ 5 km             ≤ 48 hrs
            │                  │                  │
            └──────────────────┼──────────────────┘
                               ▼
                   All Three Conditions Met?
                    ├── YES ──► likelyDuplicate = true
                    │           Set possibleDuplicateOf reference
                    │           Flag for Human Review
                    └── NO  ──► likelyDuplicate = false
                                Normal Intake
```

### Signal Specifications & Thresholds

| Signal | Metric / Algorithm | Starting Threshold | Configurable Constant |
| :--- | :--- | :--- | :--- |
| **1. Text** | Term Frequency Vector Cosine Similarity | $\ge 0.75$ | `TEXT_DUPLICATE_THRESHOLD = 0.75` |
| **2. Geo** | Great-circle Haversine Distance | $\le 5.0\text{ km}$ | `DUPLICATE_DISTANCE_KM = 5` |
| **3. Time** | Absolute Created Timestamp Delta | $\le 48.0\text{ hours}$ | `DUPLICATE_TIME_WINDOW_HOURS = 48` |

---

## 2. Signal 1: Cosine Text Similarity

Text similarity between the new report description ($Q$) and an existing active incident description ($D$) is computed using **Cosine Similarity over Term Frequency (TF) Vectors**:

$$\text{Cosine Similarity}(Q, D) = \frac{\vec{V}_Q \cdot \vec{V}_D}{\|\vec{V}_Q\| \|\vec{V}_D\|} = \frac{\sum_{w} \text{TF}(w, Q) \times \text{TF}(w, D)}{\sqrt{\sum_w \text{TF}(w, Q)^2} \times \sqrt{\sum_w \text{TF}(w, D)^2}}$$

- Text undergoes lowercasing, punctuation stripping, and whitespace normalization via `normalizeText()`.
- Numeric values are preserved (e.g. "10 people" $\to$ token `"10"`).
- Range is strictly $[0.0, 1.0]$.

---

## 3. Signal 2: Haversine Distance Calculation

Geographic separation between coordinates $(\text{lat}_1, \text{lon}_1)$ and $(\text{lat}_2, \text{lon}_2)$ is computed using the spherical Earth Haversine formula:

$$\Delta\varphi = (\text{lat}_2 - \text{lat}_1) \times \frac{\pi}{180}, \quad \Delta\lambda = (\text{lon}_2 - \text{lon}_1) \times \frac{\pi}{180}$$

$$a = \sin^2\left(\frac{\Delta\varphi}{2}\right) + \cos(\text{lat}_1 \times \frac{\pi}{180}) \times \cos(\text{lat}_2 \times \frac{\pi}{180}) \times \sin^2\left(\frac{\Delta\lambda}{2}\right)$$

$$c = 2 \times \operatorname{atan2}(\sqrt{a}, \sqrt{1 - a})$$

$$d = R \times c \quad (R = 6371\text{ km})$$

### Geographic Threshold Rationale (5 km)
- **Starting Heuristic**: $5\text{ km}$ represents a standard initial urban/suburban disaster perimeter (smoke plumes, local flooding, structure collapses, localized earthquakes).
- **Not Universally Applicable**: Large-scale disasters (e.g., regional earthquakes or cyclones) may affect wider radii, while localized incidents (e.g., a specific apartment fire) may require tighter radii. The threshold is configurable via `options.distanceThreshold`.

---

## 4. Signal 3: Time-Window Filtering (48 Hours)

Candidate duplicate comparison is restricted to recent active incidents:
- Only incidents created within `DUPLICATE_TIME_WINDOW_HOURS = 48` hours are fetched from the database:
  ```javascript
  createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
  ```
- **Rationale**: Disasters evolve rapidly. An incident reported days or weeks later is generally a secondary development, recurring hazard, or independent occurrence rather than a concurrent duplicate intake.
- Incidents older than 48 hours are automatically excluded from the candidate search query to preserve database performance.

---

## 5. Active Incident Status Filtering

Only open/unresolved statuses are evaluated:
```javascript
export const ACTIVE_INCIDENT_STATUSES = ['reported', 'under_review', 'assigned'];
```
- **Excluded Statuses**: `resolved` and `cancelled` incidents are strictly filtered out of the query. Closed incidents should not flag new emergencies as duplicates.

---

## 6. Missing Coordinate & Missing Data Fallback Policy

If coordinate data is not explicitly provided:
1. **Never Hallucinate**: The system will **never** guess or invent coordinates from a text string.
2. **Safe Signal Evaluation**:
   - If either the new incident or the existing candidate lacks valid latitude/longitude:
     - `geoMatch = null`
     - `distanceKm = null`
3. **Safe Decision Rule**:
   - Because `geoMatch` is `null` (not `true`), `likelyDuplicate` evaluates to `false`.
   - The incident is **NOT** automatically declared a duplicate.
4. **Visibility Preserved**: Text candidate matches are still included in `duplicateCandidates` for human inspection.
5. **Non-Blocking Execution**: Internal duplicate detection errors are caught safely and do not block incident creation.

---

## 7. MongoDB Schema Extensions

### Coordinates Subdocument
```javascript
coordinates: {
  latitude: {
    type: Number,
    default: null,
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90'],
  },
  longitude: {
    type: Number,
    default: null,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180'],
  },
}
```
*Backward Compatibility*: The string `location` and `locationClue` fields are preserved completely intact.

### Reference to Possible Duplicate
```javascript
possibleDuplicateOf: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Incident',
  default: null,
  index: true,
}
```
- Stores the ObjectId of the existing incident with the strongest evidence match.
- Value remains `null` for non-duplicates.

---

## 8. Explainable API Response Format

`POST /api/incidents` returns an explainable breakdown of the duplicate decision:

```json
{
  "success": true,
  "data": {
    "_id": "6791b4f91c9d440012345678",
    "report": "Major fire near Vellore bus stand...",
    "status": "reported",
    "priorityScore": 88,
    "possibleDuplicateOf": "6791b2e81c9d440012345000",
    "coordinates": {
      "latitude": 12.9180,
      "longitude": 79.1340
    }
  },
  "likelyDuplicate": true,
  "possibleDuplicateOf": "6791b2e81c9d440012345000",
  "duplicateReason": {
    "textSimilarity": 0.8845,
    "distanceKm": 0.23,
    "timeDifferenceHours": 2.4
  },
  "duplicateCandidates": [
    {
      "incidentId": "6791b2e81c9d440012345000",
      "textSimilarity": 0.8845,
      "distanceKm": 0.23,
      "timeDifferenceHours": 2.4,
      "textMatch": true,
      "geoMatch": true,
      "timeMatch": true,
      "likelyDuplicate": true
    }
  ]
}
```

---

## 9. Structured Event Logging

When a likely duplicate is detected, a structured JSON audit event is emitted to standard output:

```json
{
  "event": "LIKELY_DUPLICATE",
  "newIncidentId": "6791b4f91c9d440012345678",
  "possibleDuplicateOf": "6791b2e81c9d440012345000",
  "textSimilarity": 0.8845,
  "distanceKm": 0.23,
  "timeDifferenceHours": 2.4,
  "thresholds": {
    "text": 0.75,
    "distanceKm": 5,
    "timeHours": 48
  },
  "timestamp": "2026-09-22T14:45:00.000Z"
}
```

### Security Compliance
Logs never contain passwords, JWTs, Gemini API keys, or user credentials.

---

## 10. Frontend Presentation Guidelines

1. **Intake Confirmation**:
   - When `likelyDuplicate: true`, the user interface displays:
     > `"Possible duplicate detected — requires human verification."`
   - Explains that the incident is safely saved and recorded.
   - **Never display**: `"Duplicate confirmed"` or `"Incident rejected"`.

2. **Dashboard Indicator**:
   - Incidents with `possibleDuplicateOf != null` display a subtle neutral badge:
     `"Possible duplicate — review required"`
   - Dispatchers can cross-reference the linked incident without losing data.

---

## 11. Known Limitations & Future Tuning

1. **Paraphrase Variation**: Cosine similarity evaluates term overlap; semantic embeddings (e.g. Gemini text embeddings) can further improve paraphrased matching.
2. **Disaster-Specific Radii**: Floods and wildfires may span $10\text{ km}+$, while building collapses are hyper-local ($< 500\text{ m}$). Future versions may tune `DUPLICATE_DISTANCE_KM` by incident category.
3. **Dispatcher Resolution Workflow**: Day 14 only flags; future days can provide formal dispatcher merge/link workflows with full audit logging.
