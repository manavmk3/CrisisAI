# CrisisAI — Priority Scoring Engine

## Purpose

Calculates a **0–100 priority score** for an emergency incident using
a weighted multi-factor model.  The score helps triage and rank incidents
so that responders can allocate resources to the most urgent situations first.

**This is decision-support information ONLY.**
Critical dispatching decisions still require human review.

---

## Pure Function Guarantee

`calculatePriorityScore(incident)` is a **pure function**:

- Same input → same output (deterministic).
- No database, HTTP, or Gemini calls.
- No global mutable state.
- The input object is never mutated.
- No side effects.

---

## Factors & Weights

| # | Factor              | Weight | Source Field(s)              |
|---|---------------------|--------|-----------------------------|
| 1 | Severity            | **25** | `severity`                  |
| 2 | Affected Population | **20** | `peopleAffected`            |
| 3 | Vulnerability       | **15** | `vulnerability` *(optional)*|
| 4 | Resource Shortage   | **15** | `resourceShortage` *(optional)*|
| 5 | Time Sensitivity    | **10** | `urgency`                   |
| 6 | AI Confidence       |  **5** | `confidence`                |
| 7 | Location / Context  | **10** | `locationContext` *(optional)*|
|   | **TOTAL**           |**100** |                             |

> **Important:** These weights are **initial heuristics**, not
> scientifically proven emergency-response priorities.  They should be
> tuned later using real evaluation data from field deployments.

---

## Normalization

Every factor is normalized to a **0–1** range before the weight is applied.

### Severity (enum → number)

| Value      | Normalized |
|------------|------------|
| `low`      | 0.25       |
| `medium`   | 0.50       |
| `high`     | 0.75       |
| `critical` | 1.00       |

Unknown / missing → defaults to `medium` (0.50).

### Urgency / Time Sensitivity (enum → number)

| Value       | Normalized |
|-------------|------------|
| `routine`   | 0.25       |
| `soon`      | 0.50       |
| `urgent`    | 0.75       |
| `immediate` | 1.00       |

Unknown / missing → defaults to `soon` (0.50).

### Affected Population (logarithmic, capped)

Uses `log10(count) / log10(100 000)` bounded to [0, 1].

| Count       | ≈ Normalized |
|-------------|--------------|
| 0           | 0.00         |
| 1           | 0.00         |
| 10          | 0.20         |
| 100         | 0.40         |
| 1 000       | 0.60         |
| 10 000      | 0.80         |
| 100 000+    | 1.00         |

- `null` / `undefined` / missing → 0.50 (unknown, neutral).
- Negative values → clamped to 0.00.

### Confidence (0–1)

Used directly. Clamped to [0, 1].

Missing → defaults to 0.50.

### Vulnerability (0–1, optional)

A normalized value from 0 (no vulnerability factors) to 1 (maximum
vulnerability). The scoring engine does **not** infer sensitive personal
characteristics.

Missing → defaults to 0.50 (neutral).

### Resource Shortage (0–1, optional)

A normalized value from 0 (all resources available) to 1 (critical
shortage). Actual resource-availability calculation will be added in
later days; for now the caller can pass a manual override.

Missing → defaults to 0.50 (neutral).

### Location / Context (0–1, optional)

A normalized value representing location-related urgency factors
(e.g., proximity to critical infrastructure, remote area penalty).
No geospatial APIs or database queries are performed.

Missing → defaults to 0.50 (neutral).

---

## Output Format

```json
{
  "score": 87,
  "breakdown": {
    "severity": 25.00,
    "affectedPopulation": 18.00,
    "vulnerability": 12.00,
    "resourceShortage": 13.50,
    "timeSensitivity": 7.50,
    "confidence": 4.25,
    "locationContext": 5.00
  }
}
```

- `score` — integer 0–100.
- `breakdown` — weighted contribution of each factor (rounded to 2 decimal places).
- The breakdown values sum to the final score (within rounding tolerance of ±1).

---

## Edge-Case Behavior

| Situation                        | Behavior                                        |
|----------------------------------|-------------------------------------------------|
| Empty / null / undefined incident| Treated as `{}` — all defaults apply            |
| Missing `severity`               | Defaults to `medium` (0.50)                     |
| Unknown severity string          | Defaults to `medium` (0.50)                     |
| Missing `urgency`                | Defaults to `soon` (0.50)                       |
| Unknown urgency string           | Defaults to `soon` (0.50)                       |
| `peopleAffected` missing / null  | Normalized to 0.50 (unknown)                    |
| `peopleAffected` = 0             | Normalized to 0.00                              |
| Negative `peopleAffected`        | Clamped to 0.00                                 |
| Very large population (≥100 000) | Capped at 1.00                                  |
| `confidence` = 0                 | Normalized to 0.00 → contributes 0 to score     |
| `confidence` = 1                 | Normalized to 1.00 → contributes full weight     |
| Invalid / non-numeric confidence | Defaults to 0.50                                |
| Missing vulnerability            | Defaults to 0.50                                |
| Missing resource shortage        | Defaults to 0.50                                |
| Missing location context         | Defaults to 0.50                                |
| All factors at maximum           | Score = 100                                     |
| All factors at minimum           | Score ≈ 25 (due to defaults on optional fields) |

The function **never** returns a score outside [0, 100] and **never** throws.

---

## Example Calculation

**Input:**

```js
{
  severity: 'critical',      // → 1.00
  peopleAffected: 500,       // → log10(500)/5 ≈ 0.5398
  urgency: 'urgent',         // → 0.75
  confidence: 0.9,           // → 0.90
  vulnerability: 0.7,        // → 0.70
  resourceShortage: 0.8,     // → 0.80
  locationContext: 0.6,      // → 0.60
}
```

**Breakdown:**

| Factor             | Norm   | × Weight | = Contribution |
|--------------------|--------|----------|----------------|
| Severity           | 1.00   | × 25     | 25.00          |
| Affected Population| 0.5398 | × 20     | 10.80          |
| Vulnerability      | 0.70   | × 15     | 10.50          |
| Resource Shortage  | 0.80   | × 15     | 12.00          |
| Time Sensitivity   | 0.75   | × 10     |  7.50          |
| Confidence         | 0.90   | ×  5     |  4.50          |
| Location Context   | 0.60   | × 10     |  6.00          |

**Score** = round(25.00 + 10.80 + 10.50 + 12.00 + 7.50 + 4.50 + 6.00) = **76**

---

## Future Tuning

The weights and normalization curves are designed to be **easily tunable**:

1. **Weight adjustment** — Change `WEIGHTS` in `priorityScore.js`.
   Ensure they still sum to 100.
2. **Normalization curves** — Adjust the severity / urgency maps or the
   population logarithmic cap as deployment data reveals better curves.
3. **Machine-learned weights** — Replace the static weights with values
   learned from labelled priority data collected during real operations.
4. **Factor expansion** — Add new factors (e.g., weather conditions,
   infrastructure damage) by adding a new weight entry and normalization
   function, keeping the pure-function contract.

---

*Created: Day 10 — Priority Scoring Engine*
