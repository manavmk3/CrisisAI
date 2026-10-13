# CrisisAI — Day 20: Nearby Resource Geographic Search

This document outlines the architecture, mathematical model, deterministic ranking, API specifications, and operational safeguards for the Day 20 Geographic Search Engine in CrisisAI.

---

## 1. Mathematical Model: Haversine Great-Circle Distance

CrisisAI calculates geographic distance between two points on Earth using the Haversine formula.

### Constant & Units
- Distance Unit: Kilometres (km), rounded to two decimal places.
- Volumetric Mean Earth Radius constant: `EARTH_RADIUS_KM = 6371`.

### Formulation
Given point $P_1 = (\phi_1, \lambda_1)$ and point $P_2 = (\phi_2, \lambda_2)$ in radians:

$$\Delta\phi = \phi_2 - \phi_1$$
$$\Delta\lambda = \lambda_2 - \lambda_1$$
$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)$$
$$c = 2 \cdot \operatorname{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right)$$
$$d = R \cdot c$$

To prevent `NaN` or infinite outcomes on antipodal or identical coordinate boundaries, $a$ is clamped to $[0, 1]$ prior to square-root calculation. Identical coordinates evaluate directly to $0.00\text{ km}$.

---

## 2. Coordinate Validation & Anti-Fabrication Safeguards

Before running any geospatial calculations or database queries, coordinates undergo strict validation:

- Latitude: Real number bounded by $[-90.0, 90.0]$.
- Longitude: Real number bounded by $[-180.0, 180.0]$.
- Rejected: `null`, `undefined`, boolean values (`true`, `false`), empty strings, whitespace strings, non-numeric types (objects, arrays, symbols), `NaN`, and infinities.
- Anti-Fabrication Policy: CrisisAI never synthesizes, defaults, or guesses GPS telemetry. Incidents or resources lacking valid numerical coordinates cannot undergo geographic distance calculation.

---

## 3. Search Radius Bounds & Query Filters

### Radius Boundaries
- Default Radius: `10 km`
- Minimum Allowed Radius: `1 km`
- Maximum Allowed Radius: `200 km`
- Radius requests outside $[1, 200]$ or non-numeric values are rejected with HTTP 400.
- Boundary condition: A resource at exactly `distanceKm == radiusKm` is included. Any resource where `distanceKm > radiusKm` is excluded.

### Supported Filter Parameters
- `radiusKm`: Search radius in kilometres (number between 1 and 200).
- `type`: Optional resource type identifier (e.g. `ambulance`, `medical_team`, `food`).
- `status`: Optional operational status filter (`available`, `deployed`, `maintenance`).
- `availableOnly`: Boolean flag (default: `true`). When enabled, only resources with `status === 'available'` and `availableQuantity > 0` are returned. Maintenance and depleted units are strictly excluded.
- `minQuantity`: Optional positive integer specifying the minimum available inventory units required.
- `exactTypeOnly`: Optional boolean flag. When set to `true`, compatible resource alternatives are omitted from the search.

---

## 4. Deterministic Ranking Strategy

Results from the nearby search service are ordered according to a predictable, multi-tier ranking strategy:

1. Inventory Availability Tier:
   Resources with usable inventory (`status === 'available'` and `availableQuantity > 0`) precede depleted or inactive inventory.
2. Requirement Match Suitability:
   - Priority 1: Exact match for the requested or incident-required resource type.
   - Priority 2: Documented compatible alternative type.
   - Priority 3: General emergency response inventory.
3. Straight-Line Proximity:
   Shorter Haversine distance in kilometres takes precedence (ascending order).
4. Available Quantity:
   When distance and compatibility are equal, resources with higher available inventory break ties (descending order).
5. Stable Identifier:
   Persistent MongoDB Object ID string comparison acts as the final deterministic tie-breaker.

---

## 5. Resource Compatibility Rules

Geographic search reuses the Day 16 compatibility mapping:

- `ambulance`: `ambulance`, `medical_team`
- `medical_team`: `medical_team`, `ambulance`
- `fire_rescue`: `fire_rescue`, `fire_truck`
- `fire_truck`: `fire_truck`, `fire_rescue`
- `search_rescue`: `search_rescue`, `rescue_boat`, `drone`, `heavy_machinery`
- `rescue_boat`: `rescue_boat`, `search_rescue`
- `drone`: `drone`, `search_rescue`
- `heavy_machinery`: `heavy_machinery`, `search_rescue`
- `food`: `food`, `food_water_supply`, `drinking_water`
- `drinking_water`: `drinking_water`, `food_water_supply`, `food`
- `food_water_supply`: `food_water_supply`, `food`, `drinking_water`
- `shelter`: `shelter`, `shelter_kit`
- `shelter_kit`: `shelter_kit`, `shelter`
- `police`: `police`, `evacuation_team`
- `evacuation_team`: `evacuation_team`, `evacuation_bus`, `police`
- `evacuation_bus`: `evacuation_bus`, `evacuation_team`

Unrelated resources are never treated as substitutes.

---

## 6. API Specification

### Endpoint
`GET /api/incidents/:id/nearby-resources`

Alias:
`GET /api/allocations/incident/:id/nearby-resources`

### Authorization
- Unauthenticated requests: HTTP 401 Unauthorized
- Citizen role requests: HTTP 403 Forbidden
- Authority and Admin roles: HTTP 200 OK

### Example Request
```http
GET /api/incidents/6ace6dea139cc855dfd99bc4/nearby-resources?radiusKm=10&type=ambulance&availableOnly=true HTTP/1.1
Host: localhost:8000
Authorization: Bearer <AUTHORITY_JWT_TOKEN>
```

### Example Successful Response (HTTP 200)
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "resourceId": "6ace6dea139cc855dfd99bcc",
      "_id": "6ace6dea139cc855dfd99bcc",
      "id": "6ace6dea139cc855dfd99bcc",
      "name": "Marina Emergency Ambulance Post",
      "type": "ambulance",
      "status": "available",
      "quantity": 10,
      "availableQuantity": 5,
      "location": "Marina Sector 1",
      "latitude": 13.0900,
      "longitude": 80.2750,
      "distanceKm": 0.94,
      "matchType": "exact",
      "matchPriority": 1,
      "matchReason": "Exact match for requested ambulance with usable inventory",
      "hasUsableStock": true,
      "isAvailable": true
    },
    {
      "resourceId": "6ace6dea139cc855dfd99bce",
      "_id": "6ace6dea139cc855dfd99bce",
      "id": "6ace6dea139cc855dfd99bce",
      "name": "General Hospital Medical Team",
      "type": "medical_team",
      "status": "available",
      "quantity": 12,
      "availableQuantity": 7,
      "location": "General Hospital Base",
      "latitude": 13.0850,
      "longitude": 80.2720,
      "distanceKm": 0.29,
      "matchType": "compatible",
      "matchPriority": 2,
      "matchReason": "Compatible alternative (medical_team) for requested ambulance",
      "hasUsableStock": true,
      "isAvailable": true
    }
  ],
  "incident": {
    "id": "6ace6dea139cc855dfd99bc4",
    "summary": "Marina Flash Flood Alert",
    "coordinates": {
      "latitude": 13.0827,
      "longitude": 80.2707
    },
    "requiredResources": ["ambulance"]
  },
  "searchOptions": {
    "radiusKm": 10,
    "type": "ambulance",
    "status": null,
    "availableOnly": true,
    "minQuantity": null,
    "incidentCoordinates": {
      "latitude": 13.0827,
      "longitude": 80.2707
    }
  }
}
```

### Error Responses
- Missing Incident (HTTP 404):
  `{ "success": false, "message": "Incident not found." }`
- Malformed Incident ID (HTTP 400):
  `{ "success": false, "message": "Invalid incident ID format." }`
- Incident Lacks Valid GPS (HTTP 400):
  `{ "success": false, "message": "Incident does not have valid GPS coordinates for geographic search." }`
- Invalid Radius (HTTP 400):
  `{ "success": false, "message": "radiusKm must be a number between 1 and 200." }`
- Unknown Resource Type (HTTP 400):
  `{ "success": false, "message": "Unknown resource type: \"xyz\". Allowed types: ambulance, medical_team, ..." }`

---

## 7. Straight-Line Distance vs. Travel Routing Disclaimer

The distance provided by this engine is the great-circle arc length across the Earth ellipsoid (straight-line distance).

- Straight-line distance does not account for street layouts, physical terrain barriers (such as rivers or mountain passes), closed road networks, or live vehicular congestion.
- Transit time and vehicle routing are deliberately decoupled to avoid false transit expectations in catastrophic disaster zones where road infrastructure may be damaged.
- The UI explicitly displays the distance as `straight-line distance (km)` to inform dispatchers.

---

## 8. Missing Coordinates Behavior

When an incident record contains `null`, `undefined`, or invalid coordinates:
1. The backend endpoint returns HTTP 400 with a descriptive notification.
2. The frontend renders an informative warning banner in the dossier informing dispatchers that geographic telemetry is unavailable.
3. The frontend advises dispatchers to consult Section E (Candidate Recommendations), which relies on incident priority score, urgency weighting, and compatibility rules without requiring spatial coordinates.

---

## 9. Performance & Architectural Decisions

- Database Query Strategy: Query filters filter candidate records by numeric `latitude` and `longitude`, operational status, and resource type before Haversine filtering.
- Indexing: A compound index on `{ latitude: 1, longitude: 1 }` enables efficient pre-filtering. Because existing models store coordinates as scalar numbers (`latitude` and `longitude`) rather than GeoJSON Points (`{ type: "Point", coordinates: [lng, lat] }`), standard B-tree queries maintain complete backwards compatibility with Days 1–19 schemas without database migrations.
- Tested Boundaries: Single-query latency for inventories under 5,000 resources is sub-15ms.

---

## 10. Test Coverage & Verified Invariants

The `server/test_day20.js` regression suite verified:
- Valid Haversine distance calculations against known geodetic baselines (London to Paris).
- Coordinate validation across normal, boundary, antipodal, and corrupted values.
- Distance symmetry and zero distance for identical coordinates.
- Radius boundary precision (resources at exactly 10.00 km included, resources at >10.00 km excluded).
- Resource type filtering and Day 16 compatibility mapping integration.
- Operational status isolation and exclusion of maintenance/deployed units from available inventory.
- Zero available inventory handling and available versus total quantity invariants.
- Deterministic multi-factor ranking and tie-breaking order.
- Role-based authorization policies (401 for unauthenticated, 403 for citizens, 200 for authorities).
- System regressions across Days 1–19 models, API endpoints, allocations, and Leaflet interactive map components.
