# CrisisAI Day 23: Assignment Workflow & Real-Time Events Documentation

## 1. Assignment Model (`server/src/models/Assignment.js`)

The `Assignment` model defines the dispatch record connecting an emergency incident with physical resources and/or human responders.

### Schema Fields
- `incidentId` (ObjectId, ref: `Incident`, required, indexed): Reference to the target incident.
- `resourceId` (ObjectId, ref: `Resource`, default: null, indexed): Reference to the dispatched physical resource.
- `responderId` (ObjectId, ref: `User`, default: null, indexed): Reference to the assigned responder/volunteer.
- `assignedBy` (ObjectId, ref: `User`, required): The authenticated authority or admin who created the assignment. Protected from client-side spoofing.
- `allocationId` (ObjectId, ref: `ResourceAllocation`, default: null): Links the assignment to the corresponding Day 16 allocation record.
- `status` (String, enum, default: `'assigned'`, indexed): Status of the dispatch mission.
- `ETA` (Number, default: null, min: 0): Estimated arrival time in minutes.
- `notes` (String, default: '', maxlength: 1000): Operational instructions or dispatcher notes.
- `idempotencyKey` (String, default: null, indexed): Client-provided token to prevent duplicate dispatch creation.
- `timestamps`: Automatic `createdAt` and `updatedAt`.

### Validation Rules
1. Every assignment must reference an existing, valid incident.
2. An assignment must specify at least one of `resourceId` or `responderId` (enforced via Mongoose schema validation hook).
3. If `responderId` is provided, the user must exist and hold the `volunteer` or `responder` role.
4. If `resourceId` is provided, the resource must exist and have available inventory (or refer to an active pre-existing allocation).
5. ETA cannot be negative.
6. Compound indexes optimize query performance:
   - `{ incidentId: 1, status: 1 }`
   - `{ responderId: 1, status: 1 }`
   - `{ resourceId: 1, status: 1 }`
   - `{ createdAt: -1 }`

---

## 2. Status Lifecycle & Transition Matrix

The dispatch lifecycle represents the physical progression of units responding to an incident:

```
[assigned] ──────────► [accepted] ──────────► [en_route] ──────────► [arrived] ──────────► [completed]
    │                      │                      │                      │
    ▼                      ▼                      ▼                      ▼
[cancelled]            [cancelled]            [cancelled]            [cancelled]
```

### Transition Vocabulary
- `assigned`: Authority has dispatched the resource/responder to the incident.
- `accepted`: Responder or authority has acknowledged receipt of dispatch order.
- `en_route`: Resource or responder is actively travelling towards the incident coordinates.
- `arrived`: Responder or resource unit is on-scene.
- `completed`: Mission objective fulfilled; operational tasks finalized (terminal state).
- `cancelled`: Mission cancelled by authorized personnel (terminal state).

### Transition Rules
- Valid forward paths:
  - `assigned` -> `accepted` or `cancelled`
  - `accepted` -> `en_route` or `cancelled`
  - `en_route` -> `arrived` or `cancelled`
  - `arrived` -> `completed` or `cancelled`
- Terminal states (`completed`, `cancelled`) cannot be modified further.
- Responders (role: `volunteer` or `responder`) may only transition assignments assigned to their own user ID, and cannot cancel dispatches (must contact authority).

---

## 3. Relationship to ResourceAllocation & Inventory Behavior

CrisisAI Day 16 established an inventory allocation engine with atomic decrements and inventory restoration.

### Single Allocation Guarantee (No Double-Decrement)
- When creating an `Assignment`:
  - If `allocationId` is explicitly provided, the assignment directly links to the existing active `ResourceAllocation` record without decrementing `availableQuantity` again.
  - If no `allocationId` is provided, the service checks whether an active allocation already exists for the incident and resource. If found, it links to it.
  - If no active allocation exists, the assignment service invokes `allocateResources()` from Day 16, atomically decrementing `availableQuantity` and creating a new `ResourceAllocation`, which is then linked to the `Assignment`.
- Under no circumstances is `availableQuantity` decremented twice for the same physical unit.

### Safe Cancellation & Release
- If an assignment is cancelled, its linked `allocationId` is automatically released via `releaseAllocation()` from Day 16.
- The resource's `availableQuantity` is incremented back atomically.
- If the allocation was already released, double-release errors are intercepted cleanly.

---

## 4. API Endpoints & Role Permissions

| Endpoint | Method | Allowed Roles | Description |
|---|---|---|---|
| `/api/incidents/:id/assignments` | POST | `authority`, `admin` | Create a new assignment for an incident |
| `/api/incidents/:id/assignments` | GET | Authenticated | List all assignments for an incident |
| `/api/assignments/:assignmentId` | GET | Authenticated (scoped) | Retrieve assignment details (volunteers limited to their own) |
| `/api/assignments/:assignmentId/status` | PATCH | Authenticated (scoped) | Update status according to transition rules |
| `/api/assignments/:assignmentId` | PATCH | `authority`, `admin` | Update ETA or dispatch notes |
| `/api/assignments/my` | GET | `volunteer`, `responder`, `authority`, `admin` | Retrieve assignments assigned to authenticated responder |
| `/api/assignments/responders` | GET | `authority`, `admin` | List verified volunteers/responders for assignment |

---

## 5. Socket.IO Real-Time Events

### `assignment:created`
Emitted immediately when an assignment record is created:
```json
{
  "event": "assignment:created",
  "assignmentId": "654321098765432109876543",
  "incidentId": "654321098765432109876541",
  "resourceId": "654321098765432109876542",
  "responderId": "654321098765432109876540",
  "status": "assigned",
  "ETA": 25,
  "assignedBy": "654321098765432109876539",
  "allocationId": "654321098765432109876538",
  "notes": "Deploy flood barriers immediately",
  "createdAt": "2026-11-03T00:00:00.000Z",
  "timestamp": "2026-11-03T00:00:00.000Z"
}
```

### `assignment:status-updated`
Emitted when an assignment transitions to a new status:
```json
{
  "event": "assignment:status-updated",
  "assignmentId": "654321098765432109876543",
  "incidentId": "654321098765432109876541",
  "previousStatus": "assigned",
  "status": "accepted",
  "ETA": 25,
  "updatedAt": "2026-11-03T00:05:00.000Z",
  "timestamp": "2026-11-03T00:05:00.000Z"
}
```

---

## 6. Idempotency & Concurrency Safeguards

1. **Idempotency Key**:
   - Clients send a unique `idempotencyKey` when submitting an assignment request.
   - Repeated requests with the identical key return the already created assignment without creating duplicates or double-allocating inventory.
2. **Duplicate Active Assignment Protection**:
   - The service rejects assigning a resource or responder that already has an active assignment (`assigned`, `accepted`, `en_route`, `arrived`) for the same incident with HTTP 409 Conflict.
3. **Atomic Operations**:
   - Resource inventory decrements and increments utilize MongoDB's `$inc` and `$gte` atomic filters to prevent race conditions and negative inventory.

---

## 7. Responder Workflow & Limitations

- CrisisAI reuses the existing verified `User` model with roles `volunteer` and `responder` for human responders.
- No synthetic or fake responder models are introduced.
- GPS telemetry tracking for mobile responders in the field is planned for future milestones; currently, ETA and manual status progressions represent operational movement.
- Citizens cannot create, view privileged dispatch rooms, or alter any assignment records.
