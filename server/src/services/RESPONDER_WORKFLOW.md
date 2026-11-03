# CrisisAI — Day 24: Responder / Volunteer Task Management Flow

## Overview

Day 24 implements a dedicated responder and volunteer task management interface for CrisisAI. Authenticated field responders can access a specialized operations dashboard to review incoming assignments, accept or decline dispatches, transition mission statuses along the tactical lifecycle, broadcast real-time GPS locations, and synchronize state with command dispatch via Socket.IO.

---

## 1. Responder Role Mapping & Access Control

CrisisAI preserves the Day 22 Role-Based Access Control (RBAC) architecture:

- **Verified Roles**:
  - `volunteer`: Community volunteer emergency personnel.
  - `responder`: Certified tactical and emergency field responder.
  - `authority`: Dispatch officer, incident command staff.
  - `admin`: Operations system administrator.
  - `citizen`: General public reporting emergency incidents.
- **Role Parity in Authorization**:
  - The authorization middleware (`server/src/middleware/authorize.js`) enforces equivalence between `volunteer` and `responder` roles for field dispatch operations.
  - Citizens attempting to access `/api/assignments/my` or `/responder/dashboard` receive an immediate HTTP 403 Forbidden rejection.
  - The frontend dynamically mounts the **Responder Ops** portal when an authenticated user has `volunteer`, `responder`, `authority`, or `admin` credentials.

---

## 2. Frontend Routing & Responder Dashboard

- **Protected Route**: `/responder/dashboard` (also accessible via `/responder`)
- **Component**: `client/src/pages/ResponderDashboard.jsx`
- **Dashboard Telemetry & Summary Cards**:
  - **New Pending**: Missions in `assigned` status awaiting responder response.
  - **Accepted**: Missions confirmed by the responder (`accepted`).
  - **En Route**: Responders in transit to the incident scene (`en_route`).
  - **On Scene**: Active on-site presence (`arrived`).
  - **Completed**: Successfully concluded operational missions (`completed`).
  - **Declined / Cancelled**: Reallocated or declined assignments (`cancelled`).
- **Interactive Tabs**:
  - `All Tasks`: Full dispatch task queue.
  - `New / Pending`: Unaccepted incoming calls.
  - `Active Operations`: Grouping accepted, en route, and on scene tasks.
  - `Completed`: Mission history archive.
  - `Declined / Cancelled`: Historical declined assignments.
- **Mission Card Information**:
  - Incident Summary and full incident report description.
  - Category, Severity level, Urgency rating, and AI Priority Score.
  - Ground location description and verified latitude/longitude coordinates.
  - Assigned equipment/resource details (name, type, allocation link).
  - Estimated Time of Arrival (ETA).
  - Assigned authority / dispatch officer name and agency.
  - Interactive 5-step operational progression tracker.

---

## 3. Assignment Retrieval Endpoint

- **Endpoint**: `GET /api/assignments/my`
- **Authentication**: Bearer JWT token required.
- **Authorization**: Roles `volunteer`, `responder`, `authority`, `admin`.
- **Identity Derivation**:
  - Responder identity is derived strictly from the verified JWT token (`req.user._id`).
  - Query parameters (such as `?responderId=...`) or body values supplied by the client are strictly ignored to prevent privilege escalation or spoofing.
- **Safe Population**:
  - `incidentId` populates `summary`, `report`, `location`, `category`, `status`, `severity`, `urgency`, `coordinates`, `priorityScore`.
  - Missing or deleted incidents are handled gracefully without runtime exceptions.
  - Sensitive internal user passwords and cryptographic secrets are excluded.

---

## 4. Accept & Decline Actions

- **Status Transition Endpoint**: `PATCH /api/assignments/:assignmentId/status`

### Accept Workflow
- Permitted when assignment status is `assigned`.
- Responder identity must match the assigned `responderId`.
- Status transitions from `assigned` to `accepted`.
- Duplicate acceptance is handled idempotently, safely returning HTTP 200 without throwing errors.
- Emits real-time Socket.IO event `assignment:status-updated`.

### Decline Workflow
- Permitted when assignment status is `assigned`.
- Responders provide an optional or mandatory decline reason via modal input.
- Status transitions from `assigned` to `cancelled`.
- Persists:
  - `declineReason`: Specific text explanation for dispatch.
  - `declinedBy`: ObjectId of the declining responder.
  - `declinedAt`: Timestamp of the decline action.
- Emits Socket.IO events `assignment:status-updated` and `assignment:declined`.
- **Inventory Safety**: If the assignment is linked to a `ResourceAllocation`, declining invokes `releaseAllocation` from `resourceAllocation.service.js`, restoring resource availability exactly once.

---

## 5. Mission Status Progression

Responders transition their accepted missions through four operational phases:

$$\text{Pending (assigned)} \xrightarrow{\text{Accept}} \text{Accepted} \xrightarrow{\text{En Route}} \text{En Route} \xrightarrow{\text{On Scene}} \text{On Scene (arrived)} \xrightarrow{\text{Complete}} \text{Completed}$$

- **Allowed Responder Next Steps**:
  - `assigned` $\rightarrow$ `accepted` or `cancelled` (decline)
  - `accepted` $\rightarrow$ `en_route`
  - `en_route` $\rightarrow$ `arrived`
  - `arrived` $\rightarrow$ `completed`
- **Validation Rules**:
  - Transition skips (e.g. `assigned` $\rightarrow$ `arrived`, `accepted` $\rightarrow$ `completed`) are rejected with HTTP 400.
  - Completed and cancelled assignments are terminal and cannot be modified.
  - Only the assigned responder or an authorized dispatcher (`authority`, `admin`) can update the status.
  - Responders cannot cancel missions once actively accepted or en route; they must contact dispatch.

---

## 6. Live Location Sharing (Optional Milestone Implementation)

The Day 24 optional live location sharing capability is implemented with explicit consent and privacy safeguards:

### Endpoints
- `PATCH /api/assignments/:assignmentId/location`
- `POST /api/assignments/:assignmentId/location`

### Security and Consent
- Requires explicit user interaction through the "Share Live Location" button and confirmation modal.
- Location tracking operates strictly during active missions (`accepted`, `en_route`, `arrived`).
- Requests for assignments in `assigned`, `completed`, or `cancelled` statuses are rejected with HTTP 400.
- When an assignment transitions to `completed` or `cancelled`, device tracking automatically clears.
- Coordinates are strictly validated:
  - Latitude: $-90 \leq \text{lat} \leq 90$
  - Longitude: $-180 \leq \text{lng} \leq 180$
  - Non-numeric or fabricated coordinates are rejected.
- Emits real-time event `assignment:location-updated`.

---

## 7. Real-Time Socket.IO Synchronization

CrisisAI leverages the shared Day 21 Socket.IO server:

- **Events Emitted**:
  - `assignment:created`: Notifies responder of incoming task.
  - `assignment:status-updated`: Broadcasts state changes to responder dashboard and authority triage views.
  - `assignment:declined`: Alerts dispatch of declined assignments for review.
  - `assignment:location-updated`: Broadcasts active responder GPS updates.
- **Security**:
  - Sockets join private user rooms (`user:<userId>`) and role rooms (`role:<role>`).
  - Unauthorized clients cannot subscribe to privileged command rooms (`room:authorized`).
  - Polling fallback operates automatically at 10-second intervals when WebSockets are disconnected.

---

## 8. Resource Consistency Safeguards

- When an assignment links an active `ResourceAllocation`:
  - Declining or cancelling calls `releaseAllocation()` atomically.
  - Idempotency checks prevent double-releasing inventory.
  - Inventory `availableQuantity` is incremented exactly once upon cancellation.
  - Declined resources are never reassigned automatically; dispatchers retain complete operational oversight.

---

## 9. Verification & Test Suite

The test suite in `server/test_day24.js` executes 54 automated assertions covering:

1. Volunteer authentication and session verification.
2. Citizen rejection from responder task APIs (403).
3. Authority and admin access validation.
4. Unauthenticated request rejection (401).
5. Malformed or invalid JWT rejection (401).
6. Responder retrieval of personal assignments.
7. Responder isolation from other responders' private assignments.
8. Immunity against `responderId` parameter spoofing.
9. Filtering by pending status (`assigned`).
10. Filtering by accepted status (`accepted`).
11. Filtering by active status (`en_route`, `arrived`).
12. Filtering by completed history (`completed`).
13. Incident relationship population and integrity.
14. Resilient handling of missing related records.
15. Dynamic assignment counts matching database reality.
16. Acceptance of pending assignment by assigned responder.
17. Rejection when a responder attempts to accept another responder's assignment (403).
18. Safe idempotent handling of duplicate acceptance.
19. Successful decline of pending assignments.
20. Persistence of decline reason and actor audit fields.
21. Rejection of accept attempts on declined assignments (400).
22. Inventory preservation and single-release verification on decline.
23. Transition from `accepted` to `en_route`.
24. Transition from `en_route` to `arrived`.
25. Transition from `arrived` to `completed`.
26. Rejection of invalid status progression jumps (400).
27. Rejection of modifications to completed terminal assignments (400).
28. Rejection of progression on cancelled assignments (400).
29. Rejection when another responder attempts status changes (403).
30. Rejection of citizen status modifications (403).
31. Authority override and assignment management.
32. Resource allocation consistency.
33. Prevention of duplicate decrementing.
34. Single-restoration of available quantity on cancellation.
35. Assignment creation idempotency key enforcement.
36. Socket event emission on accept (`assignment:status-updated`).
37. Socket event emission on decline (`assignment:declined`).
38. Socket event emission on status progression.
39. Protection of privileged socket rooms from unauthorized subscribers.
40. Prevention of duplicate event listeners.
41. Day 22 authorization regression validation.
42. Day 23 assignment creation regression validation.
43. Day 21 real-time Socket.IO regression validation.
44. Day 20 geographic search regression validation.
45. Day 19 map markers regression validation.
46. Day 16 resource allocation regression validation.
47. Location update requirement for active assignment status.
48. Strict rejection of out-of-bounds geographic coordinates.
49. Ownership enforcement on responder location sharing.
50. Socket emission of `assignment:location-updated`.
51. Immediate rejection of location updates on terminal assignments.

---

## 10. Manual Testing Instructions

1. Start backend server:
   ```bash
   cd server
   node server.js
   ```
2. Start frontend dev server:
   ```bash
   cd client
   npm run dev
   ```
3. Open browser at `http://localhost:5173/login`.
4. Log in as a volunteer (`volunteer@crisisai.com` / `Password123!` or any registered volunteer/responder account).
5. Navigate to `http://localhost:5173/responder/dashboard` or click **Responder Ops** in the navigation bar.
6. Observe summary cards displaying live counts for Pending, Accepted, En Route, On Scene, and Completed missions.
7. Click **Accept Assignment** on a pending task; observe immediate UI progression to Accepted and Socket.IO broadcast.
8. Click **Mark En Route**; observe progression to En Route.
9. Click **Mark On Scene**; observe progression to On Scene.
10. Click **Share Live Location**; approve browser GPS permission and verify coordinates update in real time.
11. Click **Complete Mission**; enter optional debrief notes and confirm. Observe location sharing automatically ceases and the task moves to the Completed tab.
