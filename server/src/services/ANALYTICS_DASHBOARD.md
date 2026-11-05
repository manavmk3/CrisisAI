# CrisisAI Analytics Dashboard Documentation

## 1. Overview & Architecture

The Day 26 Analytics service provides real-time, aggregated operational intelligence for emergency management authorities and platform administrators. Built on native MongoDB aggregation pipelines, the service delivers operational metrics directly from MongoDB collections (`incidents`, `assignments`, and `resourceallocations`).

All analytics endpoints are protected by role-based access control (RBAC), strictly restricted to `authority` and `admin` roles. Citizens, volunteers, and unauthenticated callers are rejected with standard HTTP 401/403 responses.

---

## 2. Operational Metric Definitions

### Active Incidents Count
- **Definition**: The total number of open incidents currently under active handling by emergency dispatchers and field personnel.
- **Included Statuses**: `reported`, `under_review`, `assigned`
- **Excluded Statuses**: `resolved`, `cancelled`
- **Rationale**: `reported` indicates freshly submitted incidents; `under_review` denotes incidents being triaged or verified by authorities; `assigned` represents incidents with field units deployed.

### Unresolved Cases Count
- **Definition**: The cumulative backlog of incidents that have not reached an end-state resolution.
- **Included Statuses**: Any status not in `['resolved', 'cancelled']`.
- **Excluded Statuses**: `resolved`, `cancelled`
- **Distinction from Active Incidents**: While both focus on ongoing cases in the current workflow state machine, unresolved cases represent the total open case backlog for audit and SLA tracking.

### Incident Severity Distribution
- **Definition**: Incident counts categorized across the 4 canonical severity levels: `critical`, `high`, `medium`, and `low`.
- **Zero-Fill Guarantee**: If a severity level has zero incidents matching the current filter, it returns an explicit `count: 0` (and `0%`) rather than omitting the key.
- **Percentages**: Automatically computed as `Math.round((count / total) * 100)`.

### Total Affected Population
- **Definition**: The aggregated number of people directly affected across incidents.
- **Calculation Pipeline**: Matches incidents where `peopleAffected` is numeric and greater than 0, then executes `$group: { _id: null, total: { $sum: '$peopleAffected' } }`.
- **Fallback**: Returns `0` if no matching incidents exist or if field values are absent.

### Resource Demand vs Deployment
- **Definition**: Comparative tracking of resource requirements requested by incident response plans versus actual resource quantities deployed in the field.
- **Demand Calculation**: Extracted from `Incident.requiredResources` (array of enum strings: `personnel`, `medical`, `vehicles`, `supplies`, `equipment`). Each incident listing a resource represents 1 active demand unit.
- **Deployment Calculation**: Sum of `quantity` from `ResourceAllocation` records with status `active`. Allocations with status `released` or `cancelled` are excluded.
- **Unmet Demand**: Computed per resource type as `Math.max(0, demand - deployed)`.

### Average Response Time
- **Definition**: The average duration in minutes from initial assignment creation (`createdAt`) to responder acceptance (`acceptedAt`).
- **Milestone Field**: `Assignment.acceptedAt` (Date). When an assignment transitions to `accepted` in `updateAssignmentStatus`, `acceptedAt` is recorded.
- **Calculation**: Aggregates `(acceptedAt - createdAt) / (1000 * 60)`.
- **Filtering**: Filters for `acceptedAt != null`, `createdAt != null`, and `acceptedAt >= createdAt`. Unaccepted, declined, or pending assignments are excluded.
- **Missing Data Handling**: If no accepted assignments match the criteria, returns `avgMinutes: null`, `recordsCount: 0`, `minMinutes: null`, `maxMinutes: null`.
- **Units**: Minutes.

---

## 3. Date Filtering Specification

All analytics endpoints accept optional query parameters:
- `startDate`: ISO 8601 string or valid date string (e.g. `2026-11-01T00:00:00.000Z`)
- `endDate`: ISO 8601 string or valid date string (e.g. `2026-11-05T23:59:59.999Z`)

### Validation Rules
- If provided, dates must pass `!isNaN(new Date(value).getTime())`.
- If `startDate > endDate`, the controller returns HTTP 400 Bad Request: `startDate cannot be after endDate`.
- Valid filters translate into MongoDB `$match` stages: `{ createdAt: { $gte: start, $lte: end } }`.
- When omitted, queries aggregate across all records.

---

## 4. API Endpoints Reference

All endpoints require `Authorization: Bearer <token>` with `role: 'authority'` or `role: 'admin'`.

| Endpoint | Method | Query Parameters | Description |
|---|---|---|---|
| `/api/analytics/overview` | GET | `startDate`, `endDate` | Returns summary metrics: active incidents, unresolved cases, total affected population, and average response time. |
| `/api/analytics/severity` | GET | `startDate`, `endDate` | Returns incident counts and percentages grouped by `critical`, `high`, `medium`, and `low`. |
| `/api/analytics/resources` | GET | `startDate`, `endDate` | Returns resource demand, deployed quantities, and unmet demand per resource category. |
| `/api/analytics/response-times` | GET | `startDate`, `endDate` | Returns average, minimum, maximum response time in minutes and audited record count. |
| `/api/analytics/categories` | GET | `startDate`, `endDate` | Returns incident counts across categories (`fire`, `flood`, `medical`, etc.). |
| `/api/analytics/dashboard` | GET | `startDate`, `endDate` | Consolidated response returning all metrics in a single network round-trip. |

---

## 5. Security & RBAC Enforcement

- **Middleware**: `authenticate` followed by `authorize('authority', 'admin')`.
- **Citizen / Volunteer Attempt**: Returns HTTP 403 Forbidden (`Access denied. Required roles: authority, admin`).
- **Unauthenticated Attempt**: Returns HTTP 401 Unauthorized (`Authentication required`).

---

## 6. Data Model Limitations & Field Evolution

1. **Response Time Milestone**: Prior to Day 26, `Assignment` tracked `createdAt` and `updatedAt`, but lacked a dedicated `acceptedAt` timestamp. Day 26 added `acceptedAt: { type: Date, default: null }` to `Assignment.js`. Historic assignments created before Day 26 without `acceptedAt` are excluded from response time aggregations to prevent inaccurate calculations.
2. **Resource Demand Quantities**: `Incident.requiredResources` stores an array of resource type enums without per-incident quantity requirements. Demand is therefore quantified as the count of active incidents requiring each resource category.
3. **Multi-Jurisdiction Filtering**: Current models aggregate globally across the system; department or geographic radius scoping can be integrated when GIS boundaries are formalized.

