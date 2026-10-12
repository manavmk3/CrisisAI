# CrisisAI — Day 19: Map Markers and Detail Popups

## 1. Overview

Day 19 extends the Leaflet/OpenStreetMap map foundation built in Day 18 by adding real, interactive markers for **incidents** and **resources**.

Markers are color-coded by severity/status, display informative click-popup panels, and are controlled by layer-toggle buttons. All coordinate safety measures from Day 18 are preserved.

---

## 2. Supported Marker Categories

| Category | Source Model | Status |
|---|---|---|
| **Incidents** | `Incident.js` | ✅ Implemented |
| **Resources** | `Resource.js` | ✅ Implemented |
| **Shelters** | No dedicated model — `Resource` has type `shelter` | ⚠️ Partial (see §5) |
| **Responders** | No `Responder` model exists in this project | ❌ Not implemented (see §6) |

---

## 3. Marker Color and Icon Legend

### 3a. Incidents — Circle (●) Markers

Color is determined by `incident.severity`, with status overrides:

| Color | Hex | Condition |
|---|---|---|
| 🔴 Red | `#ef4444` | `severity: critical` AND status is NOT resolved/cancelled |
| 🟠 Orange | `#f97316` | `severity: high` AND status is NOT resolved/cancelled |
| 🟡 Yellow | `#eab308` | `severity: medium` AND status is NOT resolved/cancelled |
| ⚫ Gray | `#6b7280` | `severity: low` OR `status: resolved` OR `status: cancelled` |

**Icon shape**: Circle with white inner dot. Distinct from resource markers.

**Priority score** is displayed in the popup but does NOT affect marker color. Color is derived purely from `severity` and `status`, which are stored fields in `Incident.js`.

### 3b. Resources — Square (■) Markers

Color is determined by `resource.status` (actual vocabulary: `available | deployed | maintenance`):

| Color | Hex | Status |
|---|---|---|
| 🟢 Green | `#22c55e` | `available` |
| 🟠 Orange | `#f97316` | `deployed` |
| ⚫ Gray | `#6b7280` | `maintenance` |

**Icon shape**: Circle outline with rounded-square inner marker. Visually distinct from incident circles.

---

## 4. Popup Fields

### 4a. Incident Popup

| Field | Source | Shown when |
|---|---|---|
| Summary | `incident.summary` | Always |
| Severity | `incident.severity` | Always |
| Category | `incident.category` | When present |
| Urgency | `incident.urgency` | When present |
| Priority Score | `incident.priorityScore` | When non-null |
| Status | `incident.status` | Always |
| Verification state | `incident.verificationState` | When present |
| Location | `incident.location` or `incident.locationClue` | When either present |
| Reported time | `incident.createdAt` | When present |
| **Inspect Incident** link | → `/incidents/:id` | When `_id` is available |

The popup does **not** change any incident fields. It is read-only.

### 4b. Resource Popup

| Field | Source | Shown when |
|---|---|---|
| Name | `resource.name` | Always |
| Status badge | `resource.status` | Always |
| Type | `resource.type` | When present (human-readable label) |
| Inventory | `resource.availableQuantity / resource.quantity` | When `quantity` present |
| Location | `resource.location` | When present |

`availableQuantity` is shown as the **available** count. The total is shown for context. Resources with `availableQuantity: 0` are not shown as available.

---

## 5. Data Sources and API Endpoints

| Data | Endpoint | Auth required |
|---|---|---|
| Incidents | `GET /api/incidents?sort=priority` | No (public read) |
| Resources | `GET /api/resources` | No (public read) |

**Incidents** are passed via the `incidents` prop from `Dashboard.jsx` (which already fetches them).

**Resources** are fetched once by `IncidentMap.jsx` internally on mount, using a `useRef` guard to prevent duplicate fetches. Callers may also pass a `resources` prop to avoid the internal fetch (e.g., when the Resources page is already loaded).

---

## 6. Coordinate Validation

Resources use **top-level** `latitude` and `longitude` fields (not a nested `coordinates` object):
```js
// Resource.js schema
latitude: { type: Number, default: null }
longitude: { type: Number, default: null }
```

Incidents use a **nested** `coordinates` object:
```js
// Incident.js schema
coordinates: {
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null }
}
```

Both use the Day 18 `validateCoordinates()` utility:
- Latitude must be in `[-90, 90]`
- Longitude must be in `[-180, 180]`
- `null`, `undefined`, `NaN`, booleans, and out-of-range values are all rejected

---

## 7. Behavior When Coordinates Are Missing

- An entity with missing/invalid coordinates is **never** shown as a map marker.
- A "no GPS" count is displayed in the layer toggle button: e.g., `Incidents (3 on map, 2 no GPS)`.
- The `coordinateNotice` banner is shown when the entire displayed dataset has no valid GPS (Day 18 behavior preserved).
- Missing coordinates are **never** replaced with a default location.
- Textual addresses (`location`, `locationClue`) are **never** geocoded automatically.

---

## 8. Shelter Support

- There is **no dedicated `Shelter` model** in `server/src/models/`.
- The `Resource` model includes `type: 'shelter'` as one of its valid types.
- A shelter-type resource shows a marker **only if it has valid `latitude`/`longitude` stored**.
- The marker color follows the same `available/deployed/maintenance` scheme as all other resources.
- The popup shows the resource name, type label ("Shelter"), status, inventory, and location.
- No shelter-specific capacity or occupancy fields exist in the current schema.

**Architecture is extensible**: A future `Shelter` model with dedicated fields (capacity, operationalStatus, etc.) can be added and a new marker layer toggle can be created without breaking the current resource layer.

---

## 9. Responder Support

- There is **no `Responder` model** in `server/src/models/`.
- Users (`User.js`) have roles (`citizen`, `authority`, `admin`) but no stored GPS coordinates.
- Responder markers are **not implemented**.
- This is documented in the layer toggle bar: `"Shelter / Responder layers: no dedicated model in current schema"`.
- Adding responders requires a future model with GPS fields and an API endpoint.

---

## 10. Layer Toggles

| Control | Button ID | Hides/Shows |
|---|---|---|
| Incident markers | `toggle-incident-markers` | All incident markers |
| Resource markers | `toggle-resource-markers` | All resource markers |
| Legend | `map-legend-toggle` | Color legend panel |

When all layers are hidden, the map remains functional (pan/zoom, tiles) with an empty canvas.

---

## 11. Tests Executed

### 11a. Frontend Unit Tests (`IncidentMap.test.jsx`)

Run by importing `runAllIncidentMapTests()` in a browser console or Node-compatible environment.

**Day 18 suite (`runIncidentMapTests`)** — 35 assertions preserved:
- Tile layer configuration, OSM attribution, zoom boundaries
- Latitude/longitude range validation
- Coordinate pair validation (`{ latitude, longitude }`, `[lat, lng]`, `{ lat, lng }`)
- `extractIncidentCoordinates` with valid and missing coordinates
- No-fabrication regression

**Day 19 suite (`runDay19MarkerTests`)** — 32 new assertions:
- `INCIDENT_SEVERITY_COLORS` mapping (critical/high/medium/low → correct hex)
- `getIncidentMarkerColor()` for all severity levels and resolved/cancelled status
- `RESOURCE_STATUS_COLORS` mapping
- `getResourceMarkerColor()` for all statuses
- `extractResourceCoordinates()` with valid, null, out-of-range, and missing coordinates
- Shelter-type resource boundary (no dedicated model)
- Responder model boundary (documented)
- Day 18 safety regressions (null coords, bad lat, bad lng)
- Resource availability display safety (deployed ≠ available)
- Empty dataset safety (0 markers, no crash)
- Duplicate ID deduplication

**UNTESTED** (require JSDOM + react-testing-library, not installed):
- Marker DOM rendering inside `MapContainer`
- Popup opening on marker click
- Layer toggle button changing visible markers in DOM
- `fetch()` call to `/api/resources` in `useEffect`
- Tile error banner rendering
- Legend collapse/expand

### 11b. Backend Regression Suite (`server/test_day19.js`)

Run with: `node --experimental-vm-modules server/test_day19.js`

Covers:
- Static file checks (IncidentMap.jsx, test file presence, Day 19 exports)
- Coordinate validation library regression
- `GET /api/incidents` (HTTP 200, success, data array, priority sort)
- `GET /api/incidents?status=reported|category=flood|severity=critical` (Day 17 filter regression)
- `GET /api/incidents/:id` (incident detail, popup fields present)
- `GET /api/resources` (HTTP 200, field check for popup)
- `GET /api/incidents/:id/allocations` (Day 16 allocation regression)
- `GET /api/incidents/:id/candidates` (Day 16 candidate regression)
- Shelter/Responder model boundary assertions
- Dashboard.jsx integration (IncidentMap import, Day 19 badge)
- `App.jsx` route regression (`/incidents/:id`)

---

## 12. Manual Verification Steps

1. **Start backend**: `cd server && node server.js`
2. **Start frontend**: `cd client && npm run dev`
3. **Open** `http://localhost:5173/dashboard`
4. Click **"Live Crisis Map"** tab → map opens
5. Verify incident markers appear for incidents with GPS coordinates:
   - Critical incidents = red circles
   - High incidents = orange circles
   - Medium incidents = yellow circles
   - Resolved/cancelled/low = gray circles
6. Click an incident marker → popup shows summary, category, priority, verification, "Inspect Incident ↗" link
7. Click "Inspect Incident ↗" → navigates to `/incidents/:id`
8. Verify resource markers appear (green/orange/gray squares) for resources with GPS
9. Click a resource marker → popup shows name, type, available/total, location
10. Toggle **"Incidents"** button → incident markers disappear; toggle again → markers reappear
11. Toggle **"Resources"** button → resource markers disappear; toggle again → markers reappear
12. Click **"Legend ▲"** → legend collapses; click again → legend expands
13. Verify the layer toggle counts match: `Incidents (N on map, M no GPS)`
14. Open `http://localhost:5173/incidents/:id` for an incident with GPS → map is centered on the incident
15. Open an incident without GPS → map shows amber "No valid GPS telemetry" notice, no fabricated pin
16. Run `node server/test_day19.js` → all assertions pass

---

## 13. Known Limitations

- **No shelter or responder markers** — no dedicated models exist.
- **No DOM-level tests** — JSDOM and react-testing-library are not installed.
- **No offline tiles** — OSM tiles require internet connectivity.
- **No geocoding** — textual addresses do not produce map pins.
- **No route drawing or clustering** — deferred to later roadmap days.
- **No live updates** — markers reflect the state at component mount; manual refresh required.

---

## 14. Files Created / Modified

| File | Action |
|---|---|
| `client/src/components/IncidentMap.jsx` | **Modified** — added Marker, Popup, layer toggles, legend, resource fetch |
| `client/src/components/IncidentMap.test.jsx` | **Modified** — added 32 new Day 19 assertions, preserved all Day 18 tests |
| `client/src/pages/Dashboard.jsx` | **Modified** — updated Day 18→19 badges and info panel text |
| `server/test_day19.js` | **Created** — backend regression suite |
| `MAP_MARKERS.md` | **Created** — this documentation file |

---

## 15. Suggested Commit Message

```
Day 19: map markers and detail popups

- Add incident markers (circle icons) color-coded by severity:
  critical=red, high=orange, medium=yellow, low/resolved/cancelled=gray
- Add resource markers (square icons) color-coded by status:
  available=green, deployed=orange, maintenance=gray
- Popup panels for incidents: summary, category, severity, urgency,
  priority score, status, verification, location, timestamp,
  "Inspect Incident" link to /incidents/:id
- Popup panels for resources: name, type, available/total quantity,
  location, status
- Layer toggle controls for incident and resource marker visibility
- Map legend with collapsible color key
- Resource data fetched from GET /api/resources once on mount
- "No GPS" counts displayed in layer toggles
- Shelter markers: not implemented (no dedicated model — documented)
- Responder markers: not implemented (no model — documented)
- All Day 18 coordinate safety, tile error handling, and map lifecycle
  behavior preserved unchanged
- Extended IncidentMap.test.jsx: +32 Day 19 assertions (67 total)
- New server/test_day19.js: static, coordinate, API, and model regression
- New MAP_MARKERS.md: complete documentation
```
