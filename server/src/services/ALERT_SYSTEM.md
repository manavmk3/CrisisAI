# CrisisAI — Day 25: Emergency Alert & In-App Notification System

## 1. Overview
The Emergency Alert System provides persistent, audited, and real-time alerts for high-priority crisis events across CrisisAI. The system automatically detects critical incident thresholds during report submission and updates, identifies authorized operational recipients (authorities, administrators, and assigned responders), and delivers instant notifications through private Socket.IO rooms while persisting state in MongoDB as the single source of truth.

---

## 2. Alert Schema & Model Design

The persistent Mongoose model is defined at `server/src/models/Alert.js`:

```javascript
{
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'critical_incident',
      'incident_verified',
      'assignment_created',
      'assignment_declined',
      'incident_resolved'
    ],
    index: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 1000
  },
  readStatus: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Database Compound Indexes
- `{ recipient: 1, readStatus: 1, createdAt: -1 }`: Fast index scan for unread badges and user dashboard feeds.
- `{ recipient: 1, incidentId: 1, type: 1 }`: Duplicate detection and idempotency verification.
- `{ createdAt: -1 }`: Global audit sorting.

---

## 3. Supported Alert Types
| Type | Context | Default Target Audience |
|---|---|---|
| `critical_incident` | PriorityScore >= 80 or Severity: critical | Authorities, Admins, Assigned Responders |
| `incident_verified` | Incident verified by supervisory authority | Assigned Responders, Incident Reporter |
| `assignment_created`| New mission assigned to responder | Target Responder |
| `assignment_declined`| Responder declined emergency mission | Dispatch Authorities, Admins |
| `incident_resolved`| Mission completed and incident marked resolved | Operational staff & Assigned Responders |

---

## 4. Critical Incident Trigger Condition

The critical trigger is defined and evaluated via `isCriticalIncident(incident)` in `server/src/services/alert.service.js`:

```javascript
export const CRITICAL_PRIORITY_THRESHOLD = 80;

export function isCriticalIncident(incident) {
  if (!incident || typeof incident !== 'object') return false;
  const severity = typeof incident.severity === 'string' ? incident.severity.toLowerCase() : '';
  const isCriticalSeverity = severity === 'critical';
  const score = Number(incident.priorityScore);
  const isHighPriority = !isNaN(score) && score >= CRITICAL_PRIORITY_THRESHOLD;
  return isCriticalSeverity || isHighPriority;
}
```

### Execution Lifecycle
1. Citizen submits incident report (`POST /api/incidents`).
2. AI extracts signals and calculates `priorityScore` (0-100) using Day 10 weighted multi-signal heuristics.
3. Incident document is persisted in MongoDB.
4. `createCriticalIncidentAlerts(incident)` is triggered non-blockingly (`.catch(...)`), ensuring notification issues never abort incident submission.
5. If an existing incident is updated via `PATCH /api/incidents/:id` to `critical` severity or priorityScore >= 80, alerts are created for any recipient who has not yet received an alert for that incident.

---

## 5. Recipient Resolution Policy

Recipient resolution is managed strictly by `resolveRecipientsForIncident(incident)`:

1. **Authority Staff (`authority` role)**: All active emergency coordinators and dispatchers with authority roles are notified of critical crises in their system.
2. **Administrators (`admin` role)**: System administrators with operational oversight permissions receive critical alerts.
3. **Assigned Responders (`volunteer` / `responder` roles)**: Responders with active assignments (`assigned`, `accepted`, `en_route`, `arrived`) linked to the incident are included.
4. **Citizens (`citizen` role)**: Non-operational citizens are excluded from operational dispatch alerts to protect emergency privacy and prevent public panic.
5. **Deduplication**: Candidate IDs are deduplicated so a user holding multiple roles (e.g., an authority who is also assigned to an incident) receives exactly one notification.

---

## 6. REST API Endpoints

All endpoints require JWT authentication (`Authorization: Bearer <token>`). Tenant boundaries ensure users access only their own alerts.

### `GET /api/alerts`
- Returns paginated alerts belonging to the authenticated user.
- Query parameters:
  - `readStatus=true|false`
  - `type=critical_incident|...`
  - `limit=1..100` (default: 50)
  - `page=1..` (default: 1)
- Response: `{ success: true, count: N, data: [...] }`

### `GET /api/alerts/unread-count`
- Returns total unread notifications for the user.
- Response: `{ success: true, count: N }`

### `GET /api/alerts/:alertId`
- Retrieves a specific alert owned by the caller.
- Enforces ownership: returns `403 Forbidden` if another user attempts access.
- Validates ObjectID format: returns `400 Bad Request` if invalid.
- Missing record returns `404 Not Found`.

### `PATCH /api/alerts/:alertId/read`
- Marks the specified alert as read (`readStatus: true`, `readAt: <timestamp>`).
- Enforces ownership (403 if modifying another user's alert).
- Idempotent: repeated calls succeed with `200 OK` without altering original `readAt`.

### `PATCH /api/alerts/read-all`
- Bulk updates all unread alerts of the authenticated user to read state.
- Response: `{ success: true, modifiedCount: N, readAt: <timestamp> }`

---

## 7. Real-Time Socket.IO Integration

### Private User Rooms
The Socket.IO server authenticates handshake JWTs and assigns every socket to private rooms:
- `user:<userId>`: Individual notifications.
- `role:<role>`: Role-level broadcasts.
- `authenticated`: Global authenticated users.

### Socket Event: `alert:new`
Emitted by `emitNewAlert(alert)` targeted specifically to `user:<recipientId>`:
```json
{
  "event": "alert:new",
  "alertId": "6aec2330e16e2ab035064d27",
  "id": "6aec2330e16e2ab035064d27",
  "recipient": "6aec2330e16e2ab035064d1c",
  "incidentId": "6aec2330e16e2ab035064d1f",
  "type": "critical_incident",
  "message": "CRITICAL ALERT: Severe wildfire spreading across residential blocks...",
  "readStatus": false,
  "createdAt": "2026-11-05T06:33:04.120Z",
  "timestamp": "2026-11-05T06:33:04.125Z"
}
```

### Frontend Behavior
1. `NotificationCenter.jsx` subscribes to `alert:new` using the centralized `useSocket` hook.
2. New alert is prepended to local state and unread badge count increments instantaneously.
3. On network reconnection, `onReconnect` executes a REST refresh to reconcile any alerts delivered while offline.

---

## 8. Duplicate Prevention & Reliability Safeguards

1. **Database Check Before Insert**: `createCriticalIncidentAlerts` inspects `{ recipient, incidentId, type: 'critical_incident' }` prior to creating an alert record.
2. **Non-Blocking Delivery**: Catch blocks around alert generation prevent errors from failing HTTP incident responses.
3. **Database Precedence**: Alerts are written and indexed in MongoDB before emitting Socket.IO payloads.
4. **Idempotent Mark-As-Read**: If `alert.readStatus === true`, the update resolves immediately without modifying `readAt`.
5. **No Blind Broadcasts**: Alerts are never emitted to public rooms (`public` or socket broadcast).

---

## 9. Security & Role Policy
- Citizen accounts never receive internal dispatcher notifications.
- Frontend role switches in the UI toggle display views only; all data is strictly verified and scoped by the backend JWT session.
- Users cannot manipulate recipient IDs via request parameters or body attributes.
- Sensitive credentials, passwords, and citizen personal data are omitted from alert payloads.

---

## 10. Known Limitations & Future Roadmap
- **SMS / Push Gateway**: Outside current scope; web socket and in-app bell are active.
- **Geographic Filtering for Responders**: Active responders are selected by active assignment; future iterations may filter unassigned nearby volunteers by geospatial radius.

