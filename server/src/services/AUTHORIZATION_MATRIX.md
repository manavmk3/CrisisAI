# CrisisAI Role-Based Access Control (RBAC) Specification & Authorization Matrix

## 1. Overview and Core RBAC Principles

The CrisisAI backend enforces defense-in-depth Role-Based Access Control (RBAC) across all REST endpoints and Socket.IO real-time channels. Authentication is decoupled from authorization:
1. Authentication validates caller identity via signed JWT bearer tokens and resolves user state from MongoDB (`req.user`).
2. Authorization evaluates verified identity and role against route permission policies via reusable middleware (`server/src/middleware/authorize.js`).
3. Request bodies, query parameters, and custom client headers are never trusted for role assertion.
4. Mass-assignment safeguards prevent modification of sensitive identity, AI extraction, and priority fields.

---

## 2. Platform Roles & Permission Matrix

| Role | Description | Permitted Capabilities | Prohibited Operations |
|---|---|---|---|
| **Citizen** | Standard public emergency reporter | - Self-register and login<br>- View own profile (`GET /api/auth/me`)<br>- Update own name/agency (`PATCH /api/auth/me`)<br>- Submit emergency reports (`POST /api/incidents`)<br>- Execute public AI report analysis (`POST /api/ai/analyze`)<br>- View incidents, details, and allocations (read-only)<br>- Update own reported incident location/urgency | - Self-register as authority/admin<br>- Modify own role or password via profile update<br>- Verify or reject incidents (`verificationState`)<br>- Resolve, dispatch, or close incidents<br>- Modify AI extraction fields or priority score<br>- Create, update, or delete resource inventory<br>- Allocate or release resources<br>- Perform nearby-resource search |
| **Volunteer / Responder** | Field volunteer responder | - Login with assigned credentials<br>- View own profile (`GET /api/auth/me`)<br>- View incident feed, incident details, and active allocations<br>- Submit emergency reports (`POST /api/incidents`)<br>- Update own reported incident details | - Verify or reject incidents<br>- Change verification state or resolve incidents<br>- Mutate incident priority or AI fields<br>- Create, update, or delete resource inventory<br>- Allocate or release resources<br>- Execute administrative operations |
| **Authority** | Emergency response commander / dispatcher | - All Volunteer & Citizen read capabilities<br>- Verify and triage incidents (`verificationState`)<br>- Update incident operational status (`under_review`, `assigned`, `dispatched`, `resolved`, `cancelled`)<br>- Query nearby resources by geographic radius (`GET /api/incidents/:id/nearby-resources`)<br>- View candidate rankings (`GET /api/incidents/:id/candidates`)<br>- Allocate resources to incidents (`POST /api/incidents/:id/allocate`)<br>- Release active allocations (`POST /api/allocations/:id/release`)<br>- Create and update resource inventory (`POST /api/resources`, `PATCH /api/resources/:id`)<br>- Join privileged real-time channels (`room:authorized`) | - Delete inventory records (admin-only)<br>- Escalate self or other user roles<br>- Direct write access to database-computed priority fields |
| **Admin** | System administrator | - All Authority capabilities<br>- Delete resource inventory records (`DELETE /api/resources/:id`)<br>- Complete oversight across incident, allocation, and resource pipelines<br>- System health inspection and metrics monitoring | - Tampering with cryptographically signed tokens<br>- Direct injection of immutable MongoDB fields (`_id`, `createdAt`) |

---

## 3. Comprehensive Endpoint Authorization Audit

| Route | HTTP Method | Auth Required | Allowed Roles | Operation Type | Enforcement Mechanism |
|---|---|---|---|---|---|
| `/` | `GET` | No | Public | Read | Public welcome metadata route |
| `/api/health` | `GET` | No | Public | Read | Health monitoring probe |
| `/api/auth/register` | `POST` | No | Public (Restricted) | Write | Rejects privileged roles (`authority`, `admin`) with HTTP 403; allows `citizen`, `volunteer`, `responder` |
| `/api/auth/login` | `POST` | No | Public | Read / Write | Validates credentials, issues JWT bearer token |
| `/api/auth/me` | `GET` | Yes | All Authenticated | Read | JWT `authenticate` middleware, returns current user |
| `/api/auth/me` | `PATCH` | Yes | All Authenticated | Write | `authenticate`; strictly rejects attempts to modify `role`, `_id`, or `password` |
| `/api/ai/analyze` | `POST` | No | Public / Citizen | Read / Compute | Gemini AI analysis pipeline for intake drafting |
| `/api/incidents` | `POST` | Yes | All Authenticated | Write | `authenticate`; user ID attached as `reporter`; priorityScore and verificationState computed server-side |
| `/api/incidents` | `GET` | No | Public | Read | Query filter support (status, category, severity, verification) |
| `/api/incidents/:id` | `GET` | No | Public | Read | Single incident lookup with reporter and duplicate population |
| `/api/incidents/:id` | `PATCH` | Yes | Authority, Admin (full); Citizen (own non-protected) | Write | `authenticate`; `verificationState` and status transitions (`resolved`, `dispatched`, `closed`) require `authority` or `admin`; protected AI & priority fields immutable; non-authorities restricted to own incidents |
| `/api/incidents/:id/allocate` | `POST` | Yes | `authority`, `admin` | Write | `authenticate` + `authorize('authority', 'admin')`; atomic resource deduction and allocation creation |
| `/api/incidents/:id/allocations` | `GET` | No | Public | Read | Read-only listing of allocations for incident |
| `/api/incidents/:id/candidates` | `GET` | No | Public | Read | Read-only ranked resource recommendations |
| `/api/incidents/:id/nearby-resources` | `GET` | Yes | `authority`, `admin` | Read | `authenticate` + `authorize('authority', 'admin')`; Haversine spatial search |
| `/api/resources` | `GET` | No | Public | Read | Public inventory listing and filtering |
| `/api/resources/:id` | `GET` | No | Public | Read | Single resource lookup |
| `/api/resources` | `POST` | Yes | `authority`, `admin` | Write | `authenticate` + `authorize('authority', 'admin')`; inventory record creation |
| `/api/resources/:id` | `PATCH` | Yes | `authority`, `admin` | Write | `authenticate` + `authorize('authority', 'admin')`; quantity consistency validations |
| `/api/resources/:id` | `DELETE` | Yes | `admin` | Write | `authenticate` + `authorize('admin')`; inventory record deletion |
| `/api/allocations/incident/:id` | `POST` | Yes | `authority`, `admin` | Write | `authenticate` + `authorize('authority', 'admin')` |
| `/api/allocations/incident/:id` | `GET` | Yes | All Authenticated | Read | `authenticate` |
| `/api/allocations/incident/:id/candidates` | `GET` | Yes | All Authenticated | Read | `authenticate` |
| `/api/allocations/incident/:id/nearby-resources` | `GET` | Yes | `authority`, `admin` | Read | `authenticate` + `authorize('authority', 'admin')` |
| `/api/allocations/:allocationId/release` | `POST` | Yes | `authority`, `admin` | Write | `authenticate` + `authorize('authority', 'admin')`; inventory restoration |

---

## 4. Socket.IO Real-Time Authorization Architecture

### 4.1 Handshake Authentication
1. Socket connection requests are intercepted by handshake middleware in `server/src/services/socket.service.js`.
2. Handshake bearer token is extracted from `socket.handshake.auth.token` or `socket.handshake.headers.authorization`.
3. If no token is provided, socket is tagged as `socket.isPublic = true` and joins the `public` room.
4. If a token is provided, `jwt.verify` verifies signature and expiration against `config.jwt.secret`.
5. User document is loaded directly from MongoDB (`User.findById(decoded.id).select('-password')`).
6. `socket.user` identity and role are strictly derived from the verified MongoDB document.
7. Expired tokens are rejected with error `Authentication error: Token expired`.
8. Invalid or forged tokens are rejected with error `Authentication error: Invalid token`.

### 4.2 Room Subscriptions & Authorization
1. Authenticated sockets join `authenticated` and `role:${socket.user.role}`.
2. Only sockets whose verified role is `authority` or `admin` join `room:authorized`.
3. Client-driven `join` and `subscribe` events validate target room against privileged room list (`room:authorized`, `role:authority`, `role:admin`).
4. Unauthorized room subscription requests are rejected with an error callback and subscription is denied.

---

## 5. Privilege Escalation & Mass-Assignment Defenses

1. **Self-Registration Defense**: Direct registration with `role: 'admin'` or `role: 'authority'` yields HTTP 403 Forbidden. Only `citizen`, `volunteer`, and `responder` roles can be self-registered.
2. **Profile Role Immutability**: `PATCH /api/auth/me` explicitly rejects attempts to alter `role`, `_id`, or `password`.
3. **Protected Incident Fields**: `priorityScore`, `priorityBreakdown`, `category`, `severity`, `aiConfidence`, `summary`, and `reporter` cannot be overwritten via `PATCH /api/incidents/:id`.
4. **Verification State Isolation**: Only `authority` and `admin` roles can set `verificationState` (`verified` or `needs_review`). Citizen and volunteer requests yield HTTP 403.
5. **Operational Status Transition Guards**: Transitions to privileged states (`resolved`, `dispatched`, `closed`, `verified`) are restricted to `authority` and `admin`.
6. **Allocation Atomicity**: Resource allocations and releases use atomic MongoDB operations and lock verification; non-management roles are blocked before any database mutation occurs.

---

## 6. Known Security Limitations & Operational Boundaries

1. **Stateless JWT Revocation**: Tokens remain valid until their expiration unless blacklisted via an external cache or short expiration windows.
2. **Public Incident Readability**: In emergency scenarios, basic incident feeds and candidate recommendations are readable without authentication to support public situational awareness and humanitarian coordination.
3. **Single Agency Scope**: Multi-tenant organizational isolation is scoped by agency string; cross-agency authority partitioning relies on user agency assignment.
