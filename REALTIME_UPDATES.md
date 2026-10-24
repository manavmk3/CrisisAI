# CrisisAI — Real-Time Layer with Socket.IO (Day 21 Milestone)

## Overview

Day 21 implements a unified real-time synchronization layer for CrisisAI utilizing **Socket.IO** on both the Express/Node.js backend and React 19/Vite frontend. The architecture adheres strictly to an **event notification model**, where Socket.IO events notify clients of state changes while MongoDB and Express REST endpoints remain the authoritative sources of truth. A short-interval polling fallback (12 seconds) ensures uninterrupted synchronization during network drops or socket disconnections.

---

## 1. Dependencies

- **Server (`server/package.json`)**:
  - `socket.io` (`^4.8.1`): WebSocket and HTTP long-polling transport engine for Node.js.
  - `socket.io-client` (`^4.8.1` devDependency): Client library used by test suites (`test_day21.js`).
- **Client (`client/package.json`)**:
  - `socket.io-client` (`^4.8.1`): Shared client connection hook and subscription utility for React.

---

## 2. Architecture & Socket.IO Initialization

### Server Attachment
The Socket.IO server is attached directly to the core HTTP server in `server/server.js`:
```javascript
import http from 'http';
import app from './src/app.js';
import { initSocket, closeSocket } from './src/services/socket.service.js';

const server = http.createServer(app);
initSocket(server);
server.listen(PORT, ...);
```

### Module Isolation (`server/src/services/socket.service.js`)
To prevent circular dependencies between Express controllers and the HTTP server, all Socket.IO operations are encapsulated in `socket.service.js`:
- `initSocket(httpServer, customOptions)`: Mounts Socket.IO, applies authentication middleware, and establishes role rooms.
- `getIO()`: Retrieves the current active instance or `null`.
- `closeSocket()`: Gracefully closes all socket listeners during server shutdown.
- Typed emitter helpers (`emitIncidentCreated`, `emitIncidentUpdated`, `emitIncidentVerificationChanged`, `emitIncidentResolved`, `emitResourceCreated`, `emitResourceUpdated`, `emitResourceAssigned`, `emitResourceReleased`).

If Socket.IO is uninitialized (e.g., during headless unit tests), emitter functions safely no-op without throwing errors.

### Client Connection Utility (`client/src/hooks/useSocket.js`)
- URL discovery priority:
  1. `import.meta.env.VITE_SOCKET_URL`
  2. `import.meta.env.VITE_API_URL` (with `/api` stripped)
  3. `window.location.origin`
  4. Fallback: `http://localhost:5000`
- Singleton pattern: A single shared socket instance is reused across all mounted React components to avoid connection churn.
- Configured connection limits:
  - `reconnection: true`
  - `reconnectionAttempts: 5`
  - `reconnectionDelay: 1000`
  - `reconnectionDelayMax: 5000`
  - `timeout: 10000`

---

## 3. Authentication & Authorization

### Handshake Authentication
When connecting, clients pass their JWT token via `socket.handshake.auth.token` or the standard `Authorization: Bearer <token>` header:
```javascript
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || extractBearer(socket.handshake.headers);
  if (!token) {
    socket.user = null;
    socket.isPublic = true;
    return next(); // Allows unauthenticated public connection with restricted access
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return next(new Error('Authentication error: User not found'));

    socket.user = { _id: user._id.toString(), role: user.role, email: user.email };
    return next();
  } catch (err) {
    return next(new Error('Authentication error: ' + (err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token')));
  }
});
```

### Server-Derived Role Rooms
Roles are strictly determined by the verified server-side user record, never by client-provided values:
- Authenticated sockets join `authenticated` and `role:${user.role}`.
- Authority and admin users join `room:authorized`.
- Public/unauthenticated sockets join `public`.

---

## 4. Real-Time Event Contract

All events emit minimal, structured JSON payloads containing identifiers, status flags, timestamps, and coordinates. Sensitive fields (passwords, JWTs, personal email addresses) are strictly excluded.

### Official Incident Events

| Event Name | Emission Condition | Key Payload Fields | Authorized Audience |
| :--- | :--- | :--- | :--- |
| `incident:created` | Emitted after `Incident.save()` succeeds in `createIncident` | `incidentId`, `category`, `severity`, `urgency`, `status`, `verificationState`, `priorityScore`, `coordinates`, `timestamp` | All clients (public & auth) |
| `incident:updated` | Emitted after persisted changes in `updateIncident` | `incidentId`, `category`, `severity`, `urgency`, `status`, `verificationState`, `priorityScore`, `coordinates`, `updatedAt`, `timestamp` | All clients (public & auth) |
| `incident:verification-changed` | Emitted ONLY when `previousVerificationState !== newVerificationState` | `incidentId`, `previousState`, `verificationState`, `updatedAt`, `timestamp` | All clients (public & auth) |
| `incident:resolved` | Emitted ONLY when transitioning from non-resolved to `resolved` status | `incidentId`, `status: 'resolved'`, `updatedAt`, `timestamp` | All clients (public & auth) |

*Note: Repeated updates to an incident that was already in `'resolved'` status do NOT trigger duplicate `incident:resolved` transition events.*

### Official Resource Events

| Event Name | Emission Condition | Key Payload Fields | Authorized Audience |
| :--- | :--- | :--- | :--- |
| `resource:created` | Emitted after `Resource.save()` succeeds in `createResource` | `resourceId`, `name`, `type`, `quantity`, `availableQuantity`, `status`, `latitude`, `longitude`, `timestamp` | All clients (public & auth) |
| `resource:updated` | Emitted after persisted changes in `updateResource` or after inventory modification | `resourceId`, `name`, `type`, `quantity`, `availableQuantity`, `status`, `latitude`, `longitude`, `updatedAt`, `timestamp` | All clients (public & auth) |
| `resource:assigned` | Emitted ONLY after `allocateResources` succeeds and persists | `incidentId`, `allocations: [{ allocationId, resourceId, resourceType, quantity, status }]`, `timestamp` | Authority & Admin |
| `resource:released` | Emitted ONLY after `releaseAllocation` succeeds and restores inventory | `allocationId`, `incidentId`, `resourceId`, `quantity`, `timestamp` | Authority & Admin |

*Note: Failed allocations (shortages, invalid IDs, rejected roles) and failed releases (duplicate release, invalid IDs) never emit success events.*

### Responder Feature Availability: BLOCKED
- **Status**: **BLOCKED**
- **Reason**: The CrisisAI codebase does not have a dedicated `Responder.js` domain model or responder status-update workflow. Responders are currently only represented as a role string in `User.js`. Per the milestone specification, no fake responder models or dummy records were fabricated. The real-time architecture remains extensible for future responder tracking.

---

## 5. Short-Interval Polling Fallback (`useRealtimeSync.js`)

The application implements a configurable dual-mode synchronization mechanism via `client/src/hooks/useRealtimeSync.js`:

1. **Configurable Default Interval**: Default is **12,000 ms (12 seconds)**, within the official 10–15s window.
2. **Healthy Socket State**:
   - Polling interval is stopped / idle.
   - Sockets handle real-time notifications with zero polling network traffic.
3. **Disconnected / Unhealthy Socket State**:
   - Activates short-interval polling (`setInterval` at 12s).
   - Overlap protection: `isSyncingRef` ensures prior requests complete before subsequent polls execute.
   - Clean unmounting: Clears timers and removes listeners on component unmount to prevent memory leaks or duplicate polling loops.
4. **Reconnection Reconciliation**:
   - When the socket reconnects (`onReconnect`), the hook immediately triggers a REST fetch to reconcile any state missed during the outage.

---

## 6. Frontend Integrations

### 1. Authority Dashboard (`client/src/pages/Dashboard.jsx`)
- Subscribes to: `incident:created`, `incident:updated`, `incident:verification-changed`, `incident:resolved`, `resource:assigned`, `resource:released`.
- On arrival: Calls `fetchIncidents(true)` to silently reconcile the priority dispatch queue and telemetry statistics.
- Filter Preservation: Active filter state (`statusFilter`, `categoryFilter`, `severityFilter`, `verificationFilter`) and sort orders are preserved.
- Status Indicator: Displays a real-time badge (`#realtime-status-badge`) indicating either `Socket.IO Live` (emerald) or `Fallback Polling (12s)` (amber).

### 2. Incident Detail View (`client/src/pages/IncidentDetail.jsx`)
- Subscribes to: `incident:updated`, `incident:verification-changed`, `incident:resolved`, `resource:assigned`, `resource:released`.
- Filters events to match the active `id`.
- Reconciles AI triage metadata, priority breakdown scores, candidate recommendations, and active resource allocations.

### 3. Geospatial Map (`client/src/components/IncidentMap.jsx`)
- Subscribes to: `resource:created`, `resource:updated`, `resource:assigned`, `resource:released`.
- Automatically refetches `/api/resources` on changes. Markers update their availability color (green = available, orange = deployed, gray = maintenance) and popup quantities.
- Incidents passed as props from Dashboard/Detail update in real time without Leaflet map re-initialization.

### 4. Nearby Resource Search (`client/src/components/allocations/NearbyResourceSearch.jsx`)
- Subscribes to: `resource:created`, `resource:updated`, `resource:assigned`, `resource:released`.
- If a search was executed, automatically triggers `runSearch()` via the authoritative REST endpoint `/api/incidents/:id/nearby-resources`.
- Preserves search radius, resource type, and availability filters while recalculating Haversine distances authoritatively.

### 5. Resource Inventory (`client/src/pages/Resources.jsx`)
- Subscribes to: `resource:created`, `resource:updated`, `resource:assigned`, `resource:released`.
- Refetches authoritative MongoDB inventory table upon allocation, release, or manual update.

---

## 7. CORS Configuration

Socket.IO CORS mirrors the Express API configuration:
- In development: Allows dynamic localhost origins (`http://localhost:5173`, `http://127.0.0.1:5173`).
- In production: Strictly restricts connections to `config.clientUrl`. Unrestricted origins (`*`) are disallowed.
- Credentials (`credentials: true`) are enabled for secure cookie/token headers.

---

## 8. Multi-Instance Limitations

The current Socket.IO implementation uses the default in-memory adapter:
- Single-server deployments broadcast events to all connected clients seamlessly.
- In multi-instance or clustered environments (e.g., Kubernetes horizontal scaling), an external shared pub/sub adapter (such as `@socket.io/redis-adapter`) must be configured to propagate events across independent server processes.

---

## 9. Verification & Automated Test Suite

A dedicated end-to-end test suite was created in `server/test_day21.js`.

### Test Execution
```bash
node server/test_day21.js
```

### Test Coverage Summary (42 Assertions)
- **Initialization & Health**: Socket.IO server initialization, REST health endpoint availability.
- **CORS & Origins**: Allowed-origin headers, disallowed origin safeguards.
- **Authentication**: Valid JWT connection, invalid token rejection, expired token rejection, clean disconnection.
- **Incident Events**: `incident:created`, `incident:updated`, `incident:verification-changed`, `incident:resolved`, repeated resolution deduplication.
- **Resource Events**: `resource:created`, `resource:updated`, `resource:assigned`, `resource:released`, failed allocation rejection, failed release rejection.
- **Payload Safety**: Record ID validation, absence of sensitive database or user fields.
- **Responder Boundary**: Explicit assertion confirming no fabricated responder model exists.
- **Frontend Architecture**: Static and behavioral verification of `useSocket.js`, `useRealtimeSync.js`, 12s polling interval, timer cleanup, reconnection reconciliation.
- **UI Integrations**: Dashboard real-time subscriptions, detail view refreshes, map marker updates, nearby search invalidation, resource inventory sync.
- **Days 15–20 Regressions**: Day 20 Haversine distance, Day 19 markers, Day 18 tile foundation, Day 17 priority queue, Day 16 idempotency and inventory atomicity, Day 15 resource CRUD.

All 42 tests passed with 0 failures.
