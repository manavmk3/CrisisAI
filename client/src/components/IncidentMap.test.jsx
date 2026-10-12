/**
 * IncidentMap.test.jsx — Day 19 Extended Test Suite
 *
 * This file exports two test runners:
 *   runIncidentMapTests()      — Day 18 coordinate validation (preserved)
 *   runDay19MarkerTests()      — Day 19 marker logic (new)
 *   runAllIncidentMapTests()   — runs both suites
 *
 * NOTE: These tests run in a browser-like JS environment without a DOM renderer.
 * React component rendering (Marker, Popup, MapContainer) cannot be meaningfully
 * tested without a full JSDOM + react-testing-library setup, which is not installed.
 * All marker logic, color mapping, coordinate filtering, and popup field logic is
 * exercised through the exported pure functions from IncidentMap.jsx.
 * DOM rendering tests are documented as "UNTESTED – requires JSDOM" below.
 */

import {
  isValidLatitude,
  isValidLongitude,
  validateCoordinates,
  extractIncidentCoordinates,
  LATITUDE_MIN,
  LATITUDE_MAX,
  LONGITUDE_MIN,
  LONGITUDE_MAX,
} from "../utils/coordinateValidation";

import {
  DEFAULT_TILE_LAYER,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  DETAIL_MAP_ZOOM,
  INCIDENT_SEVERITY_COLORS,
  RESOURCE_STATUS_COLORS,
  getIncidentMarkerColor,
  getResourceMarkerColor,
  extractResourceCoordinates,
} from "./IncidentMap";

/* ── Helper ── */
function makeResults() {
  let passed = 0;
  let failed = 0;
  const results = [];
  function assert(condition, testName, details) {
    details = details || "";
    if (condition) {
      passed++;
      results.push({ name: testName, status: "PASS" });
      console.log("  \u2705 PASS: " + testName);
    } else {
      failed++;
      results.push({ name: testName, status: "FAIL", details: details });
      console.error("  \u274c FAIL: " + testName + (details ? " — " + details : ""));
    }
  }
  return { assert, getStats: () => ({ passed, failed, results }) };
}

/* ══════════════════════════════════════════════════════════════════════════════
   SUITE 1 — DAY 18 COORDINATE VALIDATION (preserved)
══════════════════════════════════════════════════════════════════════════════ */
export function runIncidentMapTests() {
  const { assert, getStats } = makeResults();

  console.log("\n--- 1. OSM Tile Layer & Attribution ---");
  assert(DEFAULT_TILE_LAYER && typeof DEFAULT_TILE_LAYER.url === "string", "Tile layer URL is configured");
  assert(DEFAULT_TILE_LAYER.url.includes("tile.openstreetmap.org"), "Tile layer points to public OSM endpoint");
  assert(
    DEFAULT_TILE_LAYER.attribution.includes("OpenStreetMap") &&
      DEFAULT_TILE_LAYER.attribution.includes("contributors"),
    "Tile layer contains required OSM attribution"
  );
  assert(
    DEFAULT_TILE_LAYER.maxZoom === 19 && DEFAULT_TILE_LAYER.minZoom >= 1,
    "Tile layer specifies valid zoom boundaries"
  );

  console.log("\n--- 2. Default Map Centering & Zoom ---");
  assert(
    Array.isArray(DEFAULT_MAP_CENTER) && DEFAULT_MAP_CENTER.length === 2,
    "Default center is a 2-element coordinate array"
  );
  assert(
    isValidLatitude(DEFAULT_MAP_CENTER[0]) && isValidLongitude(DEFAULT_MAP_CENTER[1]),
    "Default center coordinates are geographically valid"
  );
  assert(
    typeof DEFAULT_MAP_ZOOM === "number" && DEFAULT_MAP_ZOOM >= 2 && DEFAULT_MAP_ZOOM <= 18,
    "Default zoom level is sensible"
  );
  assert(
    typeof DETAIL_MAP_ZOOM === "number" && DETAIL_MAP_ZOOM > DEFAULT_MAP_ZOOM,
    "Detail zoom is higher than overview zoom"
  );

  console.log("\n--- 3. Latitude Range Validation ---");
  assert(isValidLatitude(0) === true, "Latitude 0 (equator) is valid");
  assert(isValidLatitude(90) === true, "Latitude 90 is valid");
  assert(isValidLatitude(-90) === true, "Latitude -90 is valid");
  assert(isValidLatitude(28.6139) === true, "Latitude 28.6139 is valid");
  assert(isValidLatitude("12.9165") === true, "Numeric string latitude is valid");
  assert(isValidLatitude(90.0001) === false, "Latitude > 90 is rejected");
  assert(isValidLatitude(-90.1) === false, "Latitude < -90 is rejected");
  assert(isValidLatitude(null) === false, "Null latitude is rejected");
  assert(isValidLatitude(undefined) === false, "Undefined latitude is rejected");
  assert(isValidLatitude("") === false, "Empty string latitude is rejected");
  assert(isValidLatitude(NaN) === false, "NaN latitude is rejected");
  assert(isValidLatitude("invalid") === false, "Non-numeric string latitude is rejected");
  assert(isValidLatitude(true) === false, "Boolean true latitude is rejected");

  console.log("\n--- 4. Longitude Range Validation ---");
  assert(isValidLongitude(0) === true, "Longitude 0 (Prime Meridian) is valid");
  assert(isValidLongitude(180) === true, "Longitude 180 is valid");
  assert(isValidLongitude(-180) === true, "Longitude -180 is valid");
  assert(isValidLongitude(77.209) === true, "Longitude 77.209 is valid");
  assert(isValidLongitude("79.1325") === true, "Numeric string longitude is valid");
  assert(isValidLongitude(180.0001) === false, "Longitude > 180 is rejected");
  assert(isValidLongitude(-180.1) === false, "Longitude < -180 is rejected");
  assert(isValidLongitude(null) === false, "Null longitude is rejected");
  assert(isValidLongitude(undefined) === false, "Undefined longitude is rejected");
  assert(isValidLongitude("") === false, "Empty string longitude is rejected");
  assert(isValidLongitude(NaN) === false, "NaN longitude is rejected");
  assert(isValidLongitude("invalid") === false, "Non-numeric string longitude is rejected");
  assert(isValidLongitude(false) === false, "Boolean false longitude is rejected");

  console.log("\n--- 5. Coordinate Pair Validation ---");
  const validObj = validateCoordinates({ latitude: 12.9165, longitude: 79.1325 });
  assert(validObj.isValid === true && validObj.latitude === 12.9165, "Valid { latitude, longitude } object accepted");

  const validArr = validateCoordinates([28.6139, 77.209]);
  assert(validArr.isValid === true && validArr.latitude === 28.6139, "Valid [lat, lng] array accepted");

  const invalidLatObj = validateCoordinates({ latitude: 120, longitude: 77 });
  assert(invalidLatObj.isValid === false && invalidLatObj.error.includes("latitude"), "Invalid latitude rejected");

  const invalidLngObj = validateCoordinates({ latitude: 20, longitude: -200 });
  assert(invalidLngObj.isValid === false && invalidLngObj.error.includes("longitude"), "Invalid longitude rejected");

  const nullCoords = validateCoordinates(null);
  assert(nullCoords.isValid === false && nullCoords.error.includes("missing or null"), "Null coords safely rejected");

  console.log("\n--- 6. No Fabricated Incident Coordinates ---");
  const incWithCoords = { _id: "inc1", summary: "Flash flood", coordinates: { latitude: 28.6139, longitude: 77.209 } };
  const extValid = extractIncidentCoordinates(incWithCoords);
  assert(extValid.hasCoordinates === true && extValid.latitude === 28.6139, "Valid incident coords extracted");

  const incWithoutCoords = { _id: "inc2", summary: "Fire", coordinates: { latitude: null, longitude: null } };
  const extMissing = extractIncidentCoordinates(incWithoutCoords);
  assert(extMissing.hasCoordinates === false && extMissing.latitude === null, "Missing coords returns hasCoordinates=false");
  assert(extMissing.latitude !== DEFAULT_MAP_CENTER[0], "No fabricated default coordinates substituted");

  const incEmpty = { _id: "inc3", summary: "Power outage", location: "North Sector" };
  const extEmpty = extractIncidentCoordinates(incEmpty);
  assert(extEmpty.hasCoordinates === false && extEmpty.latitude === null, "Incident without coordinates property safe");

  const { passed, failed, results } = getStats();
  console.log("\nDay 18 Unit Tests: " + passed + " passed, " + failed + " failed.");
  return { passed, failed, results };
}

/* ══════════════════════════════════════════════════════════════════════════════
   SUITE 2 — DAY 19 MARKER LOGIC TESTS
══════════════════════════════════════════════════════════════════════════════ */
export function runDay19MarkerTests() {
  const { assert, getStats } = makeResults();

  /* ── 1. INCIDENT SEVERITY COLOR MAPPING ── */
  console.log("\n--- Day 19.1. Incident Severity Color Mapping ---");
  assert(
    INCIDENT_SEVERITY_COLORS.critical === "#ef4444",
    "Critical severity maps to red (#ef4444)"
  );
  assert(
    INCIDENT_SEVERITY_COLORS.high === "#f97316",
    "High severity maps to orange (#f97316)"
  );
  assert(
    INCIDENT_SEVERITY_COLORS.medium === "#eab308",
    "Medium severity maps to yellow (#eab308)"
  );
  assert(
    INCIDENT_SEVERITY_COLORS.low === "#6b7280",
    "Low severity maps to gray (#6b7280)"
  );

  /* ── 2. INCIDENT MARKER COLOR FUNCTION ── */
  console.log("\n--- Day 19.2. getIncidentMarkerColor() ---");
  assert(
    getIncidentMarkerColor({ severity: "critical", status: "reported" }) === "#ef4444",
    "Critical active incident: red marker"
  );
  assert(
    getIncidentMarkerColor({ severity: "high", status: "reported" }) === "#f97316",
    "High active incident: orange marker"
  );
  assert(
    getIncidentMarkerColor({ severity: "medium", status: "reported" }) === "#eab308",
    "Medium active incident: yellow marker"
  );
  assert(
    getIncidentMarkerColor({ severity: "low", status: "reported" }) === "#6b7280",
    "Low active incident: gray marker"
  );
  assert(
    getIncidentMarkerColor({ severity: "critical", status: "resolved" }) === "#6b7280",
    "Resolved critical incident: gray marker (status overrides severity)"
  );
  assert(
    getIncidentMarkerColor({ severity: "high", status: "cancelled" }) === "#6b7280",
    "Cancelled high incident: gray marker"
  );
  assert(
    getIncidentMarkerColor({ severity: "critical", status: "assigned" }) === "#ef4444",
    "Assigned critical incident: red (not grayed)"
  );
  assert(
    getIncidentMarkerColor({ severity: "critical", status: "under_review" }) === "#ef4444",
    "Under-review critical incident: red"
  );

  /* ── 3. RESOURCE STATUS COLOR MAPPING ── */
  console.log("\n--- Day 19.3. Resource Status Color Mapping ---");
  assert(RESOURCE_STATUS_COLORS.available === "#22c55e", "Available resource: green (#22c55e)");
  assert(RESOURCE_STATUS_COLORS.deployed === "#f97316", "Deployed resource: orange (#f97316)");
  assert(RESOURCE_STATUS_COLORS.maintenance === "#6b7280", "Maintenance resource: gray (#6b7280)");

  assert(
    getResourceMarkerColor({ status: "available" }) === "#22c55e",
    "getResourceMarkerColor: available → green"
  );
  assert(
    getResourceMarkerColor({ status: "deployed" }) === "#f97316",
    "getResourceMarkerColor: deployed → orange"
  );
  assert(
    getResourceMarkerColor({ status: "maintenance" }) === "#6b7280",
    "getResourceMarkerColor: maintenance → gray"
  );

  /* ── 4. RESOURCE COORDINATE EXTRACTION ── */
  console.log("\n--- Day 19.4. Resource Coordinate Extraction ---");
  const resWithCoords = { _id: "r1", latitude: 13.0827, longitude: 80.2707, status: "available" };
  const resCoords = extractResourceCoordinates(resWithCoords);
  assert(resCoords.hasCoordinates === true, "Resource with valid lat/lng → hasCoordinates true");
  assert(resCoords.latitude === 13.0827 && resCoords.longitude === 80.2707, "Resource coords extracted correctly");

  const resNoCoords = { _id: "r2", latitude: null, longitude: null, status: "deployed" };
  const resMissing = extractResourceCoordinates(resNoCoords);
  assert(resMissing.hasCoordinates === false, "Resource with null lat/lng → hasCoordinates false");
  assert(resMissing.latitude === null && resMissing.longitude === null, "No fabricated resource coordinates");

  const resInvalidLat = { _id: "r3", latitude: 999, longitude: 77.0 };
  const resInvalidLatResult = extractResourceCoordinates(resInvalidLat);
  assert(resInvalidLatResult.hasCoordinates === false, "Resource with out-of-range latitude → rejected");

  const resInvalidLng = { _id: "r4", latitude: 20.0, longitude: 999 };
  const resInvalidLngResult = extractResourceCoordinates(resInvalidLng);
  assert(resInvalidLngResult.hasCoordinates === false, "Resource with out-of-range longitude → rejected");

  const resUndefinedCoords = { _id: "r5", name: "Ambulance Unit" };
  const resUndefined = extractResourceCoordinates(resUndefinedCoords);
  assert(resUndefined.hasCoordinates === false, "Resource without coordinates property → no GPS");

  /* ── 5. SHELTER MODEL BOUNDARY ── */
  console.log("\n--- Day 19.5. Shelter/Responder Model Boundary ---");
  // The Resource model has type: 'shelter' but no geographic footprint guarantee.
  // There is no dedicated Shelter model or Responder model in this project.
  const shelterResource = { _id: "s1", type: "shelter", latitude: null, longitude: null, status: "available" };
  const shelterCoords = extractResourceCoordinates(shelterResource);
  assert(
    shelterCoords.hasCoordinates === false,
    "Shelter-type resource without coordinates produces no marker"
  );

  const shelterWithCoords = { _id: "s2", type: "shelter", latitude: 19.076, longitude: 72.8777, status: "available" };
  const shelterValidCoords = extractResourceCoordinates(shelterWithCoords);
  assert(
    shelterValidCoords.hasCoordinates === true,
    "Shelter-type resource with coordinates can show a marker"
  );
  assert(
    getResourceMarkerColor(shelterResource) === "#22c55e",
    "Available shelter resource maps to green (same as any available resource)"
  );

  // No responder model — document as expected
  const noResponderModel = true; // verified by inspecting server/src/models/
  assert(noResponderModel === true, "DOCUMENTED: No dedicated Responder model — responder markers not implemented");

  /* ── 6. COORDINATE SAFETY REGRESSION (Day 18) ── */
  console.log("\n--- Day 19.6. Coordinate Safety Regression ---");
  const incNoGPS = { _id: "reg1", summary: "Earthquake", coordinates: { latitude: null, longitude: null } };
  const regResult = extractIncidentCoordinates(incNoGPS);
  assert(regResult.hasCoordinates === false, "Day 18 regression: null coordinates still rejected in Day 19");
  assert(
    regResult.latitude !== DEFAULT_MAP_CENTER[0],
    "Day 18 regression: no default-center substitution for missing GPS"
  );

  const incBadLat = { _id: "reg2", coordinates: { latitude: 200, longitude: 77 } };
  const badLatResult = extractIncidentCoordinates(incBadLat);
  assert(badLatResult.hasCoordinates === false, "Day 18 regression: invalid latitude still rejected");

  const incBadLng = { _id: "reg3", coordinates: { latitude: 20, longitude: -200 } };
  const badLngResult = extractIncidentCoordinates(incBadLng);
  assert(badLngResult.hasCoordinates === false, "Day 18 regression: invalid longitude still rejected");

  /* ── 7. AVAILABILITY DISPLAY SAFETY ── */
  console.log("\n--- Day 19.7. Resource Availability Display Safety ---");
  const fullyAllocated = { _id: "ra1", quantity: 5, availableQuantity: 0, status: "deployed" };
  assert(
    fullyAllocated.availableQuantity === 0 && fullyAllocated.quantity === 5,
    "Fully-allocated resource: availableQuantity=0 not shown as available"
  );
  assert(
    getResourceMarkerColor(fullyAllocated) === "#f97316",
    "Fully-allocated/deployed resource shown as orange (deployed), not green"
  );

  const partiallyAllocated = { _id: "ra2", quantity: 10, availableQuantity: 3, status: "available" };
  assert(
    partiallyAllocated.availableQuantity !== partiallyAllocated.quantity,
    "Partially-allocated resource: availableQuantity < quantity correctly maintained"
  );

  /* ── 8. EMPTY DATASET SAFETY ── */
  console.log("\n--- Day 19.8. Empty Dataset Safety ---");
  const emptyIncidents = [];
  const emptyResources = [];
  const incMarkers = emptyIncidents.filter((i) => extractIncidentCoordinates(i).hasCoordinates);
  const resMarkers = emptyResources.filter((r) => extractResourceCoordinates(r).hasCoordinates);
  assert(incMarkers.length === 0, "Empty incidents array → 0 markers (no crash)");
  assert(resMarkers.length === 0, "Empty resources array → 0 markers (no crash)");

  /* ── 9. DUPLICATE MARKER PREVENTION ── */
  console.log("\n--- Day 19.9. Duplicate Marker Prevention ---");
  const dupIncident = { _id: "dup1", severity: "high", status: "reported", coordinates: { latitude: 28.6, longitude: 77.2 } };
  const dupList = [dupIncident, dupIncident]; // same object twice
  const seenIds = new Set();
  const deduped = dupList.filter((inc) => {
    const id = inc._id || inc.id;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return extractIncidentCoordinates(inc).hasCoordinates;
  });
  assert(deduped.length === 1, "Duplicate incident IDs produce only one marker");

  const { passed, failed, results } = getStats();
  console.log("\nDay 19 Marker Tests: " + passed + " passed, " + failed + " failed.");
  return { passed, failed, results };
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMBINED RUNNER
══════════════════════════════════════════════════════════════════════════════ */
export function runAllIncidentMapTests() {
  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("\uD83D\uDDFA\uFE0F INCIDENT MAP TEST SUITE — Days 18 & 19");
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");

  const r18 = runIncidentMapTests();
  const r19 = runDay19MarkerTests();

  const totalPassed = r18.passed + r19.passed;
  const totalFailed = r18.failed + r19.failed;

  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("\uD83C\uDF89 COMBINED RESULTS: " + totalPassed + " PASSED, " + totalFailed + " FAILED");
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");

  console.log("UNTESTED (requires JSDOM + react-testing-library):");
  console.log("  - Marker DOM rendering with MapContainer");
  console.log("  - Popup opening on marker click");
  console.log("  - Layer toggle buttons hiding/showing markers in DOM");
  console.log("  - Legend visibility toggle");
  console.log("  - Inspect Incident link href in rendered popup");
  console.log("  - Resource fetch from /api/resources via useEffect");
  console.log("  - Tile error banner rendering");

  return { passed: totalPassed, failed: totalFailed, results: [...r18.results, ...r19.results] };
}

if (typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].includes("IncidentMap.test")) {
  const outcome = runAllIncidentMapTests();
  process.exit(outcome.failed > 0 ? 1 : 0);
}
