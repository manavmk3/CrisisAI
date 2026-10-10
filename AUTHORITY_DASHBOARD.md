# CrisisAI — Day 17: Authority Dashboard Documentation (MILESTONE)

## 1. Overview & Objective

The **Authority Dashboard** is the dedicated command-and-control operations center for emergency dispatchers, authority leads, and administrators in the CrisisAI platform. It unifies:

1. Real-time incident retrieval ordered by calculated priority by default.
2. Four combinable, server-validated filters (Status, Category, Severity, Verification State).
3. A dedicated incident dossier inspection view (`/incidents/:id`).
4. Full AI extraction transparency and validation state provenance.
5. Persisted multi-factor priority score breakdowns (Day 10).
6. Multi-signal duplicate detection indicators and referring report links (Days 13–14).
7. Ranked candidate recommendations powered by the Day 16 allocation engine.
8. Interactive resource allocation and release workflows with role guards.

---

## 2. Dashboard Functionality & Architecture

The dashboard is accessible via `/dashboard` and consumes live data from the backend API:

- **Data Sourcing**: Fetches real MongoDB incident records via `GET /api/incidents?sort=priority`. Hardcoded metric counters and mock incidents have been removed.
- **Default Priority Ordering**: Incidents are sorted descending by `priorityScore: -1`. Ties are broken by `createdAt: -1` (newest first).
- **Summary Metric Cards**: Live aggregation of total active incidents, critical severity cases, review-flagged incidents, and average priority score.
- **UI States**:
  - **Loading**: Animated spinner and synchronizing status.
  - **API Error**: Descriptive error messaging with a "Retry Connection" action.
  - **Empty Database**: Friendly empty state prompting operators to log incidents.
  - **Empty Filtered Results**: Notification that no records match the active filters, with a "Reset All Filters" action.
  - **Pagination**: 8 incidents per page with page indicators and previous/next controls.

---

## 3. Four Combinable Filters

All four filters operate combinably without clearing one another:

| Filter | Underlying Schema Field | Allowed Values | Logic & Handling |
|---|---|---|---|
| **Status** | `Incident.status` | `reported`, `under_review`, `assigned`, `resolved`, `cancelled` | Exact match against persisted incident status. |
| **Category** | `Incident.category` | `flood`, `earthquake`, `fire`, `cyclone`, `building_collapse`, `landslide`, `medical_emergency`, `road_accident`, `other` | Controlled vocabulary validated against Day 8 AI schema. |
| **Severity** | `Incident.severity` | `critical`, `high`, `medium`, `low` | Case-insensitive severity matching. |
| **Verification State** | `Incident.verificationState`, `Incident.status`, `Incident.possibleDuplicateOf` | `verified`, `requires_review` / `needs_review` | `requires_review`: matches records with `verificationState: 'needs_review'`, `status: 'under_review'`, or `possibleDuplicateOf != null`. `verified`: matches routine processing where schema validation passed without duplicate flags. |

### Server-Side Validation:
Invalid or unrecognized filter values return **HTTP 400 Bad Request** with clear error descriptions (e.g., `Invalid status filter: "invalid"`), preventing accidental data corruption or silent failures.

---

## 4. Incident Detail Dossier Route (`/incidents/:id`)

When an operator selects "Inspect" from the triage list, they navigate to the dedicated route `/incidents/:id`:

### A. Report Details
- **Citizen Narrative**: Original raw report text submitted by the citizen (`incident.report`).
- **Location Clues**: Submitted location string, AI-detected location clue, and GPS telemetry coordinates.
- **Reporter Provenance**: Reporter name, email, and role.
- **Timestamps**: Creation and last updated timestamps.

### B. AI Extraction & Verification State
- Displays 9-field extraction: summary, category, severity, urgency, people affected, injuries, required resources, and model confidence.
- **Verification Provenance**:
  - **Verified / Normal Processing**: Passed Joi schema validation.
  - **Manual Review Required**: Triggered when under review or flagged by duplicate detection.
  - **Advisory Notice**: Clearly informs operators that AI confidence scores reflect model certainty, not independent physical verification.

### C. Priority Score Breakdown (Day 10)
Displays the persisted 7-factor breakdown against the official weight ceilings:
1. **Severity Level**: Max 25 pts
2. **Affected Population**: Max 20 pts (log-normalized up to 100,000 cap)
3. **Community Vulnerability**: Max 15 pts
4. **Resource Shortage**: Max 15 pts
5. **Time Sensitivity / Urgency**: Max 10 pts
6. **AI Confidence Factor**: Max 5 pts
7. **Geographic Risk Context**: Max 10 pts

### D. Multi-Signal Duplicate Information (Days 13–14)
- If flagged as a duplicate (`possibleDuplicateOf != null`):
  - Displays referenced primary incident summary, category, severity, status, and direct link.
  - Clarifies that reports are **never** automatically merged, deleted, or cancelled.
- If other incidents flag the current report as a duplicate, a referring reports list is shown.

---

## 5. Ranked Resource Recommendations & Allocation Workflow

The detail view queries `GET /api/incidents/:id/candidates`, running the Day 16 ranking algorithm:

1. **Filtering**: Eligible resources must have `status: 'available'` and `availableQuantity > 0`.
2. **Scoring Components (0–100 pts)**:
   - **Suitability Match (0–35 pts)**: Exact match (35 pts), Compatible alternative (25 pts), General supply (20 pts), Secondary (5 pts).
   - **Haversine Proximity (5–25 pts)**: Calculated dynamically if both coordinates exist. Missing coordinates default to neutral 15 pts without fabricating distances.
   - **Incident Priority Weight (0–25 pts)**: Scaled by incident priority score.
   - **Urgency Points (4–15 pts)**: Immediate (15 pts), Urgent (11 pts), Soon (7 pts), Routine (4 pts).
3. **Advisory Allocation**:
   - Recommendations are advisory. Automated allocation is forbidden.
   - Authorized operators (`authority`, `admin`) click "Allocate" to open the Day 16 `ResourceAllocationModal.jsx`.
   - The modal enforces confirmation, atomicity, inventory invariants, idempotency keys, and partial shortage reporting.
4. **Allocation Release**:
   - Section F lists active allocations on the incident.
   - Authority and Admin operators can release allocations (`POST /api/allocations/:id/release`), atomically restoring available inventory.

---

## 6. Security, Authorization & API Endpoints

- **Public Endpoints**:
  - `GET /api/incidents`: Publicly queryable triage list with sort and filter query params.
  - `GET /api/incidents/:id`: Incident detail dossier.
  - `GET /api/incidents/:id/candidates`: Ranked advisory resource recommendations.
  - `GET /api/incidents/:id/allocations`: Incident allocation list.
- **Protected Endpoints (Authority / Admin Required)**:
  - `POST /api/incidents/:id/allocate`: Atomic multi-resource allocation.
  - `POST /api/allocations/:id/release`: Atomic allocation release and inventory restoration.
  - `PATCH /api/incidents/:id`: Incident field and status updates.
- **Role Isolation**: Citizen and responder roles cannot allocate resources, release inventory, or mutate protected incident fields.

---

## 7. Test Results & Verification

### Day 17 Test Suite (`server/test_day17.js`):
Covers all 32 required scenarios with **86 assertions**:
- **Result**: `86 PASSED, 0 FAILED`
- Scenarios verified:
  1. Incident list loads from API
  2. Default priority ordering
  3. Priority tie-breaking (newer createdAt first)
  4. Status filter (`reported`, `under_review`, etc.)
  5. Category filter (`fire`, `flood`, etc.)
  6. Severity filter (`critical`, `high`, etc.)
  7. Verification-state filter (`verified`, `requires_review`)
  8. Multiple filters combined
  9. Clear filters restoration
  10. Priority ordering preserved under filtering
  11. Unknown filter values rejected with HTTP 400
  12. Empty incident list handling
  13. Empty filtered results handling
  14. Incident detail retrieval
  15. Malformed incident ID rejection (HTTP 400)
  16. Nonexistent incident ID rejection (HTTP 404)
  17. AI extraction fields correctness
  18. Manual-review state correctness
  19. Overall priority score correctness
  20. Priority breakdown factor alignment
  21. Duplicate indicator display without auto-merging
  22. Candidate recommendation loading
  23. Candidate ranking score ordering
  24. Missing coordinates handled without fabricated distance
  25. Missing/unmet inventory handling
  26. Allocation endpoint invocation
  27. Allocation role guards (401 unauthenticated, 403 citizen)
  28. Resource availability decrement
  29. Incident status update regression
  30. Duplicate-detection regression
  31. Resource inventory CRUD regression
  32. Day 16 allocation release and idempotency regression

### Regression Test Suites:
- `test_day16.js`: 47 PASSED, 0 FAILED
- `test_day15.js`: 40 PASSED, 0 FAILED
- `test_priorityScore.js`: 39 PASSED, 0 FAILED
- `test_day9.js`: 23 PASSED, 0 FAILED
- Frontend Production Build (`cd client && npm run build`): Completed in 1.63s with 0 errors.
