# CrisisAI — Day 18: Interactive Map Integration Documentation

## 1. Overview & Objectives

In **Day 18**, we integrated Leaflet and OpenStreetMap (OSM) into the React frontend, establishing a reusable, responsive geospatial foundation for the CrisisAI operational command platform.

This foundation strictly satisfies the Day 18 scope:
- OpenStreetMap-backed Leaflet map rendering.
- Interactive pan and zoom controls.
- Sensible initial regional centering and zoom.
- Explicit container height and responsiveness to prevent CSS collapse.
- Strict geographic coordinate validation (-90 to 90 lat, -180 to 180 lng).
- Zero hallucination or fabrication of coordinates for missing locations.
- Graceful tile loading error messaging.
- Integration into the Authority Command Dashboard and the Incident Detail dossier view.
- Zero breaking changes to Day 1–17 functionality (triage queue, 4-way filtering, duplicate indicators, resource rankings, and allocations).

---

## 2. Dependencies Installed

Compatible with the project's React 19.x environment:

```json
{
  "dependencies": {
    "leaflet": "^1.9.4",
    "react-leaflet": "^5.0.0"
  }
}
```

- **Leaflet (`^1.9.4`)**: Lightweight open-source mapping engine.
- **React-Leaflet (`^5.0.0`)**: React 19 component wrappers providing `<MapContainer>` and `<TileLayer>`.

### Stylesheet Integration:
- `leaflet/dist/leaflet.css` imported in entry point [client/src/main.jsx](file:///c:/Users/HP/Downloads/CrisisAI/client/src/main.jsx) and [client/src/components/IncidentMap.jsx](file:///c:/Users/HP/Downloads/CrisisAI/client/src/components/IncidentMap.jsx).
- Custom dark-theme styling added in [client/src/index.css](file:///c:/Users/HP/Downloads/CrisisAI/client/src/index.css) ensuring `.leaflet-container` renders with background `#0b0f19` and unobtrusive high-contrast attribution controls.

---

## 3. Component Architecture & File Locations

### 1. Reusable Map Component:
- **Location**: [client/src/components/IncidentMap.jsx](file:///c:/Users/HP/Downloads/CrisisAI/client/src/components/IncidentMap.jsx)
- **Props**:
  - `incident` (optional object): Focuses on an individual incident's validated coordinates at zoom level 13 (`DETAIL_MAP_ZOOM`).
  - `incidents` (optional array): Accepts an incident collection and displays dataset telemetry.
  - `center` (optional `[lat, lng]` or `{ latitude, longitude }`): Custom map center.
  - `zoom` (optional number): Configurable zoom level (defaults to 5 for overview, 13 for incident detail).
  - `height` (string, default: `'420px'`): Explicit height preventing layout collapse.
  - `minHeight` (string, default: `'320px'`): Fallback minimum container height.
  - `tileConfig` (object): Configurable tile layer settings (defaults to `DEFAULT_TILE_LAYER`).
  - `title` / `subtitle`: Descriptive header titles for accessibility and operational clarity.

### 2. Coordinate Validation Utilities:
- **Location**: [client/src/utils/coordinateValidation.js](file:///c:/Users/HP/Downloads/CrisisAI/client/src/utils/coordinateValidation.js)
- **Functions**:
  - `isValidLatitude(lat)`: Validates range `[-90, 90]`. Rejects null, undefined, empty string, NaN, booleans, and non-numeric values.
  - `isValidLongitude(lng)`: Validates range `[-180, 180]`. Rejects out-of-range, null, NaN, and non-numeric values.
  - `validateCoordinates(coords)`: Safely accepts objects (`{ latitude, longitude }`, `{ lat, lng }`) and arrays (`[lat, lng]`).
  - `extractIncidentCoordinates(incident)`: Extracts coordinates from incident records.

---

## 4. OpenStreetMap Tile Configuration & Attribution

Compliant with the OpenStreetMap Tile Usage Policy:

```javascript
export const DEFAULT_TILE_LAYER = {
  name: 'OpenStreetMap Standard',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19,
  minZoom: 2,
  subdomains: ['a', 'b', 'c'],
};
```

### Tile Error Handling:
- Leaflet `TileLayer` registers `tileerror` event handlers.
- When network drops or tile requests fail, a clear non-blocking alert banner informs operators:
  > *"Notice: Some OpenStreetMap tiles failed to load. Active internet access is required; offline tile caching is not supported."*
- Includes a "Retry Tiles" button that safely refreshes map layers via key invalidation.

---

## 5. Expected Coordinate Format & Missing-Coordinate Behavior

### Expected Schema:
Stored in MongoDB per `Incident.js`:
```javascript
coordinates: {
  latitude: { type: Number, default: null, min: -90, max: 90 },
  longitude: { type: Number, default: null, min: -180, max: 180 }
}
```

### Strict Safeguards:
1. **No Fake Coordinates**: Under no circumstances are missing coordinates replaced with dummy locations or the user's browser location.
2. **No Text Geocoding Hallucinations**: Plain-text descriptions (`location` or `locationClue`) are not automatically turned into GPS coordinates without verified geolocation.
3. **Missing Telemetry Banner**: When viewing an incident without GPS telemetry, the map renders at the default regional center `[20.5937, 78.9629]` and clearly informs the operator:
   > *"No valid GPS telemetry coordinates found for this incident. Displaying default regional overview (No Fabricated GPS)."*

---

## 6. UI Integration

### A. Authority Command Dashboard (`/dashboard`):
- Accessible directly or via the sidebar navigation (`/dashboard?view=map`).
- Header includes seamless tab switching between:
  - **Priority Triage Queue**: Full Day 17 queue with 4 combinable filters, priority sorting, pagination, and allocation actions.
  - **Live Crisis Map**: Full-height interactive Leaflet map foundation with pan/zoom controls.

### B. Incident Detail Dossier (`/incidents/:id`):
- Embedded directly in **Section A: Citizen-Submitted Report**.
- Displays an interactive map centered on the incident's GPS telemetry (if available) or the default regional view with missing-coordinate notice.

---

## 7. Testing Performed

1. **Static Validation & Linting**:
   - `npm run lint` (`oxlint`): Clean run with 0 errors across 26 project files.
2. **Frontend Production Build**:
   - `npm run build` (`vite build`): Succeeded in 1.21s, generating minified CSS and JS bundles including Leaflet styles and components.
3. **Automated Unit & Map Specification Tests**:
   - [client/src/components/IncidentMap.test.jsx](file:///c:/Users/HP/Downloads/CrisisAI/client/src/components/IncidentMap.test.jsx)
   - [server/test_day18.js](file:///c:/Users/HP/Downloads/CrisisAI/server/test_day18.js): **41 PASSED, 0 FAILED**.
4. **Day 17 Milestone System Regression**:
   - [server/test_day17.js](file:///c:/Users/HP/Downloads/CrisisAI/server/test_day17.js): **86 PASSED, 0 FAILED**.
   - Verified that status, category, severity, and verification filters, duplicate detection, candidate ranking, and allocation endpoints remain 100% operational.

---

## 8. Known Limitations (Day 18 Scope Boundaries)

- **No Markers Yet**: Per Day 18 specifications, incident pins, custom severity marker icons, and popups are deferred to **Day 19**.
- **No Offline Tile Caching**: OpenStreetMap tiles require active internet connectivity. Offline tile scraping or prefetching is deliberately omitted in compliance with OSM usage policy.
- **No Text Address Geocoding**: Plain-text location descriptions without GPS coordinates do not generate map pins.

---

## 9. How Day 19 Can Add Incident Markers

Day 19 can build upon `IncidentMap.jsx` by:
1. Importing Leaflet marker components:
   ```jsx
   import { Marker, Popup } from 'react-leaflet';
   import L from 'leaflet';
   ```
2. Creating custom colored SVG/DivIcon markers based on `incident.severity` (e.g. Critical = Red, High = Amber, Medium = Blue).
3. Mapping over `incidents` list:
   ```jsx
   {incidents
     .filter((inc) => extractIncidentCoordinates(inc).hasCoordinates)
     .map((inc) => {
       const coords = [inc.coordinates.latitude, inc.coordinates.longitude];
       return (
         <Marker key={inc._id || inc.id} position={coords} icon={createSeverityIcon(inc.severity)}>
           <Popup>
             <IncidentPopupContent incident={inc} />
           </Popup>
         </Marker>
       );
     })}
   ```
4. Adding optional marker clustering (e.g. `leaflet.markercluster`).
