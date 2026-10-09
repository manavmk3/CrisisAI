# Resource Inventory Management — Day 15

## Overview

This document describes the emergency resource inventory system introduced in Day 15 of the CrisisAI platform. This layer is intentionally limited to **CRUD inventory management only**. Automatic resource allocation and incident-resource matching are Day 16+ concerns.

---

## Resource Schema

| Field               | Type        | Required | Default       | Notes                                                        |
|---------------------|-------------|----------|---------------|--------------------------------------------------------------|
| `name`              | String      | Yes      | —             | 2–100 characters, trimmed                                    |
| `type`              | String enum | Yes      | —             | Must be one of the supported resource types (see below)      |
| `description`       | String      | No       | `""`          | Up to 500 characters                                         |
| `quantity`          | Integer     | Yes      | —             | Non-negative; represents total units in inventory            |
| `availableQuantity` | Integer     | No       | = `quantity`  | Non-negative; cannot exceed `quantity`                       |
| `status`            | String enum | No       | `available`   | One of `available`, `deployed`, `maintenance`                |
| `location`          | String      | No       | `""`          | Human-readable location, up to 300 characters                |
| `latitude`          | Number      | No       | `null`        | Must be −90 to 90 if provided; never fabricated              |
| `longitude`         | Number      | No       | `null`        | Must be −180 to 180 if provided; never fabricated            |
| `managedBy`         | ObjectId    | No       | (set by API)  | Reference to the User who created or manages this resource   |
| `createdAt`         | Date        | Auto     | —             | Mongoose timestamp                                           |
| `updatedAt`         | Date        | Auto     | —             | Mongoose timestamp                                           |

---

## Supported Resource Types

These identifiers are identical to the REQUIRED_RESOURCES vocabulary used in the Incident AI schema:

- ambulance
- medical_team
- fire_rescue
- search_rescue
- food
- drinking_water
- shelter
- rescue_boat
- police
- evacuation_team

---

## Operational Statuses

| Status        | Meaning                                              |
|---------------|------------------------------------------------------|
| available     | Resource is ready to be deployed (default)           |
| deployed      | Resource is currently in active use in the field     |
| maintenance   | Resource is offline for repair or servicing          |

---

## Quantity Rules

- quantity = total units in inventory (e.g., 5 ambulances owned by the agency).
- availableQuantity = units currently not deployed or under maintenance.
- availableQuantity must always be <= quantity.
- Both fields must be non-negative integers; fractional values are rejected.
- When availableQuantity is omitted on creation, it defaults to quantity.
- Partial updates validate the combined document state (existing values merged with incoming changes).
- Day 15 does NOT automatically decrement inventory when incidents are created.

---

## API Endpoints

Base path: /api/resources

### POST /api/resources
Create a new resource.
Auth: Required (JWT Bearer token). Role: authority or admin.

### GET /api/resources
List all resources, newest first.
Auth: Not required (public).
Query params: type, status (optional filters).

### GET /api/resources/:id
Retrieve a single resource by MongoDB ObjectId.
Auth: Not required (public).

### PATCH /api/resources/:id
Partial update. Protected fields (_id, createdAt, updatedAt, etc.) are rejected.
Auth: Required (JWT Bearer token). Role: authority or admin.

### DELETE /api/resources/:id
Hard delete.
Auth: Required (JWT Bearer token). Role: admin only.

---

## Authentication and Authorization

| Operation           | Authentication | Role Required          |
|---------------------|----------------|------------------------|
| GET (list/single)   | No             | None — public read     |
| POST                | Yes (JWT)      | authority or admin     |
| PATCH               | Yes (JWT)      | authority or admin     |
| DELETE              | Yes (JWT)      | admin only             |

---

## Validation Rules

- Missing required field (name, type, quantity) → 400
- Invalid resource type → 400
- Negative quantity → 400
- Fractional quantity → 400
- availableQuantity > quantity → 400
- Invalid status value → 400
- Latitude outside -90 to 90 → 400
- Longitude outside -180 to 180 → 400
- Protected field in PATCH body → 400
- Malformed MongoDB ObjectId → 400
- No JWT token on write endpoint → 401
- Valid JWT but insufficient role → 403

---

## How to Test the API

Run automated tests: cd server && node test_day15.js

Manual test (create):
curl -X POST http://localhost:8000/api/resources \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":"Rescue Boat Delta","type":"rescue_boat","quantity":3}'

---

## Known Limitations

1. No automatic allocation: Quantities are only modified by explicit PATCH requests.
2. Coordinates are flat fields (not GeoJSON). Day 16/18 may add geo-index.
3. Single managedBy field: Only one user per resource.
4. No soft-delete: DELETE permanently removes the record.
5. Delete restricted to admin only. Authority users should use status: maintenance instead.
