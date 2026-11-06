# CrisisAI Decision Support Architecture — Day 27
## AI Situation Summary & Explainable Recommended Actions Engine

---

## 1. Executive Overview

Day 27 implements an advanced dual-tier operational decision-support system for CrisisAI:
1. **AI Situation Briefing Engine**: Synthesizes cross-cutting incident posture, casualty projections, resource depletion, and unassigned queues into an executive operational briefing using Google Gemini, backed by an autonomous deterministic fallback engine.
2. **Explainable Recommended Actions Engine**: Computes deterministic, ranked next-action recommendations for individual incidents and active operations queues, exposing the exact contributing factor weights (100-point formula) and plain-language reasoning behind every recommendation.

All operational recommendations are strictly **advisory** and enforce `requiresHumanApproval: true`. No database record, inventory count, or assignment status is modified without explicit authorized authority/admin approval.

---

## 2. Situation Summary Architecture

### Data Ingestion & Sanitization Pipeline
The situation summary gathers live records from 4 primary collections:
- `incidents`: Filtered for active statuses (`reported`, `under_review`, `assigned`).
- `resources`: Computes total vs available depot quantities across 10 controlled resource types.
- `resourceallocations`: Active commitments (`status: 'active'`).
- `assignments`: Active field missions (`assigned`, `accepted`, `en_route`, `arrived`).

### Privacy & Sanitization Boundary
Before sending data to the AI model, all sensitive and private details are stripped:
- User passwords, hashes, and JWT tokens are never fetched or transmitted.
- Citizen names, contact information, and private addresses are excluded.
- Exact GPS coordinates of field responders are never exposed to LLMs.
- Only aggregated metrics, severity breakdowns, and high-level incident summaries are provided.

### AI Model & Fallback Behavior
- **Provider**: Google Gemini (`gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, `gemini-3.5-flash`).
- **Structured Schema**: `responseMimeType: 'application/json'` with explicit JSON schema definition.
- **Validation**: Every response is sanitized and validated against `validateSummarySchema`.
- **Self-Correction & Retry**: If the model output fails schema validation, a focused correction prompt is issued once.
- **Deterministic Autonomous Fallback**: If Gemini is offline, rate-limited, unconfigured, or fails retry, `generateDeterministicFallbackBriefing` generates a complete, structured operational briefing directly from persisted database statistics. The system never crashes or halts.

### Output Schema
```json
{
  "situationOverview": "2-3 concise sentences summarizing active operations posture and primary threats.",
  "overallRiskLevel": "critical | high | moderate | low",
  "keyFindings": ["string", "..."],
  "criticalIncidents": [
    {
      "incidentId": "ObjectId string",
      "summary": "string",
      "category": "string",
      "severity": "string",
      "priorityScore": 95,
      "urgency": "string",
      "location": "string"
    }
  ],
  "resourceConcerns": ["string", "..."],
  "operationalBottlenecks": ["string", "..."],
  "immediatePriorities": ["string", "..."],
  "dataLimitations": ["string", "..."],
  "generatedAt": "ISO Date",
  "sourceDataTimestamp": "ISO Date",
  "isAiGenerated": true,
  "cached": false
}
```

---

## 3. Explainable Recommended Actions Engine

The action recommendation engine is **deterministic and transparent**. Gemini is not used to rank actions; mathematical and operational logic evaluates real MongoDB data to produce consistent, auditable rankings.

### Action Types
- `allocate_resource`: Dispatch matching resource from local depot inventory.
- `request_inventory`: Request regional mutual aid when local supply is exhausted.
- `assign_responder`: Assign available responder units to unassigned operational queues.
- `verify_incident`: Dispatch scout or contact authority to verify unconfirmed or under-review incidents.
- `review_duplicate`: Reconcile cross-report similarity flagged by duplicate detection.
- `escalate_authority`: Multi-agency command escalation for critical incidents.
- `monitor_arrival`: Track field unit transit milestone ETA.

### Configurable Scoring Formula (100 Points Total)

| Decision Factor | Max Points | Evaluation Logic |
|---|---:|---|
| **Incident Severity & Priority** | 25 | Critical = 15 pts, High = 10 pts, Medium = 6 pts, Low = 3 pts. Priority score scaled to 10 pts `(priorityScore / 100) * 10`. |
| **Time Sensitivity & Urgency** | 15 | Immediate = 15 pts, Urgent = 11 pts, Soon = 7 pts, Routine = 3 pts. |
| **Affected Population & Casualties** | 15 | Reported injuries scaled up to 8 pts (`min(8, injuries * 2)`). Population affected scaled up to 7 pts (`min(7, log10(pop + 1) * 2.5)`). |
| **Resource Need & Suitability** | 20 | Direct match in `requiredResources` = 20 pts. Compatible resource match = 14 pts. Specialized protocol action = 10-19 pts. |
| **Inventory Availability** | 15 | Available local stock (`availableQuantity > 0`) = 15 pts. Mutual aid needed (stock = 0) = 15 pts for mutual aid request. |
| **Operational & Assignment Status** | 10 | Unassigned mission = 10 pts. Needs review flag = 10 pts. Pending duplicate correlation = 10 pts. Unit en route = 8 pts. |
| **Total** | **100** | Clamped to `[0, 100]` with deterministic ordering. |

### Factor Explainability & Reasoning
Every recommendation item includes `contributingFactors`:
```json
{
  "actionId": "rec_672bc1_allocate_resource_ambulance",
  "incidentId": "672bc194d...",
  "actionType": "allocate_resource",
  "title": "Dispatch Emergency Ambulance",
  "description": "Allocate City Ambulance 01 (ambulance) to address direct incident requirements.",
  "priority": "critical",
  "recommendationScore": 92,
  "contributingFactors": [
    {
      "factor": "severity_priority",
      "points": 24,
      "maximum": 25,
      "reason": "Critical life-safety severity rating with verified priority score of 90/100."
    },
    {
      "factor": "urgency",
      "points": 15,
      "maximum": 15,
      "reason": "Immediate time sensitivity requiring sub-hour intervention."
    },
    {
      "factor": "affected_population",
      "points": 13,
      "maximum": 15,
      "reason": "4 confirmed casualties or injuries reported; 50 individuals endangered or displaced."
    },
    {
      "factor": "resource_suitability",
      "points": 20,
      "maximum": 20,
      "reason": "Directly fulfills primary required resource (ambulance) identified by AI triage."
    },
    {
      "factor": "inventory_availability",
      "points": 15,
      "maximum": 15,
      "reason": "Ready local inventory available (3 unit(s) in active depot)."
    },
    {
      "factor": "operational_status",
      "points": 10,
      "maximum": 10,
      "reason": "High-priority gap: Mission has zero assigned field responders."
    }
  ],
  "suggestedResourceType": "ambulance",
  "availableQuantity": 3,
  "distanceKm": 4.12,
  "requiresHumanApproval": true,
  "generatedAt": "2026-11-06T..."
}
```

---

## 4. Distinction Between System Tiers

| Capability | Scope | Generation Method | Side Effects |
|---|---|---|---|
| **Day 27 AI Situation Briefing** | Jurisdiction-wide operational overview | LLM synthesis (Gemini) with deterministic fallback | Read-only summary |
| **Day 27 Recommended Actions** | Ranked next steps across all active incidents or per incident | Deterministic 100-point formula with factor explainability | Read-only recommendations; requires human approval |
| **Day 16 Candidate Ranking** | Specific resource depot candidate ranking for a single incident | Haversine distance, resource compatibility & readiness score | Read-only candidate list |
| **Day 16 / Day 23 Execution** | Real-world resource commitment and responder dispatch | Authority-approved transaction modifying inventory and status | Decrements inventory, creates allocations and assignments |

---

## 5. API Reference & Role-Based Access Control

All decision-support endpoints are secured by authentication and role authorization:
- `authority`: Full access.
- `admin`: Full access.
- `citizen`: HTTP 403 Forbidden.
- `volunteer` / `responder`: HTTP 403 Forbidden.

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/api/ai/situation-summary` | GET | authority, admin | Retrieves latest situation briefing (from cache if data unchanged). |
| `/api/ai/situation-summary/generate` | POST | authority, admin | Forces re-generation of briefing from current database state. |
| `/api/incidents/:id/recommended-actions` | GET | authority, admin | Returns ranked next actions for a single incident. |
| `/api/ai/recommended-actions` | GET | authority, admin | Returns ranked next actions across all active incidents. Supports `limit`, `actionType`, `severity`, `minScore`. |

---

## 6. Real-Time Sync & Data Freshness Strategy

1. **Fingerprint Invalidation**: The situation summary service maintains a SHA/structural fingerprint of active incident IDs, status values, priority scores, and resource inventory counts. If the underlying data has not changed, the cached briefing is served instantly.
2. **Socket.IO Event Subscriptions**: The client subscribes to:
   - `incident:created`, `incident:updated`
   - `assignment:created`, `assignment:status-updated`
   - `resource:updated`
   When an event arrives, an alert banner indicates that data has updated, allowing commanders to trigger an update on demand.
3. **Deterministic Actions Auto-Refresh**: Recommended action rankings are re-queried directly from persisted database state without incurring LLM API costs.

---

## 7. Known Limitations & Safe Operation

1. **Advisory Nature**: Recommended actions never trigger automated real-world operations. An authority user must click "Allocate" or "Assign" to invoke the standard Day 16 / Day 23 workflows.
2. **Missing Coordinates**: When incident or resource coordinates are missing or invalid, `distanceKm` is set to `null`. The engine never fabricates proximity.
3. **Depleted Inventory**: When depot stock is 0, the system automatically pivots from dispatch recommendation to a mutual aid requisition.

