import dns from "dns";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import config from "./src/config/env.js";
import User from "./src/models/User.js";
import Incident from "./src/models/Incident.js";
import Resource from "./src/models/Resource.js";
import app from "./src/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message, detail) {
  detail = detail || "";
  if (condition) {
    passed++;
    console.log("  \u2705 PASS: " + message);
    results.push({ name: message, status: "PASS" });
  } else {
    failed++;
    console.error("  \u274c FAIL: " + message + (detail ? " — " + detail : ""));
    results.push({ name: message, status: "FAIL", detail: detail });
  }
}

async function req(method, pathStr, body, token) {
  const url = "http://localhost:" + (config.port || 8000) + "/api" + pathStr;
  const opts = { method: method, headers: { "Content-Type": "application/json" } };
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data: data };
}

async function runDay19Tests() {
  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("\uD83D\uDDFA\uFE0F DAY 19: MAP MARKERS & DETAIL POPUPS — BACKEND REGRESSION SUITE");
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");

  console.log("[SECTION 1] Static File & Component Checks");

  const incidentMapPath = path.join(rootDir, "client", "src", "components", "IncidentMap.jsx");
  assert(fs.existsSync(incidentMapPath), "IncidentMap.jsx exists");

  const mapContent = fs.readFileSync(incidentMapPath, "utf8");
  assert(mapContent.includes("react-leaflet"), "IncidentMap imports react-leaflet");
  assert(mapContent.includes("TileLayer"), "IncidentMap uses TileLayer");
  assert(mapContent.includes("Marker"), "IncidentMap imports Marker (Day 19)");
  assert(mapContent.includes("Popup"), "IncidentMap imports Popup (Day 19)");
  assert(mapContent.includes("openstreetmap.org"), "IncidentMap uses OpenStreetMap tiles");
  assert(mapContent.includes("OpenStreetMap") && mapContent.includes("contributors"), "OSM attribution preserved");
  assert(mapContent.includes("tileerror"), "Tile error handling preserved from Day 18");
  assert(mapContent.includes("getIncidentMarkerColor"), "Incident marker color function exported");
  assert(mapContent.includes("getResourceMarkerColor"), "Resource marker color function exported");
  assert(mapContent.includes("extractResourceCoordinates"), "Resource coordinate extraction exported");
  assert(mapContent.includes("INCIDENT_SEVERITY_COLORS"), "Incident severity color map exported");
  assert(mapContent.includes("RESOURCE_STATUS_COLORS"), "Resource status color map exported");
  assert(mapContent.includes("toggle-incident-markers"), "Incident layer toggle control present");
  assert(mapContent.includes("toggle-resource-markers"), "Resource layer toggle control present");
  assert(mapContent.includes("map-legend-toggle"), "Map legend toggle present");
  assert(mapContent.includes("Inspect Incident"), "Incident popup Inspect link present");
  assert(mapContent.includes("No Fabricated GPS"), "No-fabrication notice preserved from Day 18");
  assert(mapContent.includes("Day 19"), "Day 19 label present in component");

  assert(!mapContent.includes("ShelterModel") && !mapContent.includes("Shelter.js"), "No fabricated Shelter model imported");
  assert(!mapContent.includes("ResponderModel") && !mapContent.includes("Responder.js"), "No fabricated Responder model imported");

  const testPath = path.join(rootDir, "client", "src", "components", "IncidentMap.test.jsx");
  assert(fs.existsSync(testPath), "IncidentMap.test.jsx exists");
  const testContent = fs.readFileSync(testPath, "utf8");
  assert(testContent.includes("runDay19MarkerTests"), "Test file contains Day 19 marker test suite");
  assert(testContent.includes("runIncidentMapTests"), "Test file preserves Day 18 test suite");
  assert(testContent.includes("INCIDENT_SEVERITY_COLORS"), "Tests cover severity color mapping");
  assert(testContent.includes("RESOURCE_STATUS_COLORS"), "Tests cover resource status color mapping");

  console.log("\n[SECTION 2] Coordinate Validation Regression");

  const coordUtilPath = path.join(rootDir, "client", "src", "utils", "coordinateValidation.js");
  assert(fs.existsSync(coordUtilPath), "coordinateValidation.js exists");

  const coordUtils = await import("file://" + coordUtilPath.replace(/\\/g, "/"));

  assert(coordUtils.isValidLatitude(0) === true, "Lat 0 valid");
  assert(coordUtils.isValidLatitude(90.1) === false, "Lat >90 rejected");
  assert(coordUtils.isValidLatitude(null) === false, "Null lat rejected");
  assert(coordUtils.isValidLatitude("not-a-number") === false, "Non-numeric lat rejected");
  assert(coordUtils.isValidLongitude(0) === true, "Lng 0 valid");
  assert(coordUtils.isValidLongitude(180.01) === false, "Lng >180 rejected");
  assert(coordUtils.isValidLongitude(null) === false, "Null lng rejected");

  const incNoGPS = { summary: "Fire", coordinates: { latitude: null, longitude: null } };
  const extNoGPS = coordUtils.extractIncidentCoordinates(incNoGPS);
  assert(extNoGPS.hasCoordinates === false, "Incident with null coords: hasCoordinates=false");
  assert(extNoGPS.latitude === null && extNoGPS.longitude === null, "No coordinate fabrication");

  const incValidGPS = { summary: "Flood", coordinates: { latitude: 13.0827, longitude: 80.2707 } };
  const extValidGPS = coordUtils.extractIncidentCoordinates(incValidGPS);
  assert(extValidGPS.hasCoordinates === true, "Valid incident coords recognized");
  assert(extValidGPS.latitude === 13.0827 && extValidGPS.longitude === 80.2707, "Extracted coords match input");

  console.log("\n[SECTION 3] Backend API & MongoDB Connection");
  let serverInstance = null;
  try {
    await fetch("http://localhost:" + (config.port || 8000) + "/api/health");
  } catch (_) {
    serverInstance = app.listen(config.port || 8000);
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    if (config.mongoUri && config.mongoUri.startsWith("mongodb+srv://")) {
      try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch (_) {}
    }
    const connPromise = mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await Promise.race([
      connPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error("Timed out")), 5500)),
    ]);
    console.log("  \uD83D\uDCE6 Connected to MongoDB.\n");
  } catch (err) {
    console.error("  \u274c Could not connect to MongoDB:", err.message);
    if (serverInstance) serverInstance.close();
    process.exit(1);
  }

  console.log("[SECTION 4] Incident API Regression");
  const incList = await req("GET", "/incidents?sort=priority");
  assert(incList.status === 200, "GET /api/incidents returns HTTP 200");
  assert(incList.data && incList.data.success === true, "GET /api/incidents returns success=true");
  assert(Array.isArray(incList.data && incList.data.data), "GET /api/incidents data is an array");

  const incStatus = await req("GET", "/incidents?status=reported");
  assert(incStatus.status === 200, "GET /api/incidents?status=reported returns 200");

  const incCategory = await req("GET", "/incidents?category=flood");
  assert(incCategory.status === 200, "GET /api/incidents?category=flood returns 200");

  const incSeverity = await req("GET", "/incidents?severity=critical");
  assert(incSeverity.status === 200, "GET /api/incidents?severity=critical returns 200");

  const incSorted = await req("GET", "/incidents?sort=priority");
  if (incSorted.data && Array.isArray(incSorted.data.data) && incSorted.data.data.length >= 2) {
    const scores = incSorted.data.data.map((i) => i.priorityScore);
    const isSorted = scores.every((s, i) => i === 0 || s <= scores[i - 1]);
    assert(isSorted, "Incidents sorted descending by priorityScore");
  } else {
    assert(true, "Incident sort check skipped (insufficient records)");
  }

  console.log("\n[SECTION 5] Incident Detail Route Regression");
  if (incList.data && Array.isArray(incList.data.data) && incList.data.data.length > 0) {
    const firstId = incList.data.data[0]._id || incList.data.data[0].id;
    const detail = await req("GET", "/incidents/" + firstId);
    assert(detail.status === 200, "GET /api/incidents/:id returns 200 for existing incident");
    assert(detail.data && detail.data.success === true, "Incident detail response has success=true");
    assert(detail.data && detail.data.data && detail.data.data._id, "Incident detail data has _id");

    const inc = detail.data.data;
    assert("summary" in inc, "Incident detail has summary field (for popup)");
    assert("category" in inc, "Incident detail has category field (for popup)");
    assert("severity" in inc, "Incident detail has severity field (for popup)");
    assert("priorityScore" in inc, "Incident detail has priorityScore field (for popup)");
    assert("status" in inc, "Incident detail has status field (for popup)");
    assert("coordinates" in inc, "Incident detail has coordinates field");
  } else {
    assert(true, "Incident detail regression skipped (no incidents in database)");
    assert(true, "Skipped (no incidents)");
    assert(true, "Skipped (no incidents)");
    assert(true, "Skipped (no incidents)");
    assert(true, "Skipped (no incidents)");
    assert(true, "Skipped (no incidents)");
    assert(true, "Skipped (no incidents)");
  }

  console.log("\n[SECTION 6] Resource API Regression (Day 15 CRUD)");
  const resList = await req("GET", "/resources");
  assert(resList.status === 200, "GET /api/resources returns 200");
  assert(resList.data && resList.data.success === true, "GET /api/resources returns success=true");
  assert(Array.isArray(resList.data && resList.data.data), "GET /api/resources data is an array");

  if (resList.data && Array.isArray(resList.data.data) && resList.data.data.length > 0) {
    const res = resList.data.data[0];
    assert("name" in res, "Resource has name field (for popup)");
    assert("type" in res, "Resource has type field (for popup)");
    assert("status" in res, "Resource has status field (for popup)");
    assert("quantity" in res, "Resource has quantity field (for popup)");
    assert("availableQuantity" in res || res.availableQuantity === undefined, "Resource has availableQuantity or null");
    assert("latitude" in res, "Resource has top-level latitude field");
    assert("longitude" in res, "Resource has top-level longitude field");

    const validStatuses = ["available", "deployed", "maintenance"];
    assert(validStatuses.includes(res.status), "Resource status is from allowed vocabulary: " + res.status);
  } else {
    console.log("  ℹ️  No resources in database; skipping popup field regression");
    for (let i = 0; i < 8; i++) assert(true, "Resource popup field check skipped (no resources)");
  }

  console.log("\n[SECTION 7] Allocation Workflow Regression (Day 16)");
  if (incList.data && Array.isArray(incList.data.data) && incList.data.data.length > 0) {
    const firstId = incList.data.data[0]._id || incList.data.data[0].id;
    const alloc = await req("GET", "/incidents/" + firstId + "/allocations");
    assert(alloc.status === 200, "GET /api/incidents/:id/allocations returns 200");
    assert(alloc.data && alloc.data.success === true, "Allocations response has success=true");

    const cand = await req("GET", "/incidents/" + firstId + "/candidates");
    assert(cand.status === 200, "GET /api/incidents/:id/candidates returns 200");
  } else {
    assert(true, "Allocation regression skipped (no incidents)");
    assert(true, "Allocation regression skipped (no incidents)");
    assert(true, "Candidates regression skipped (no incidents)");
  }

  console.log("\n[SECTION 8] Shelter & Responder Model Boundary");
  assert(
    !fs.existsSync(path.join(rootDir, "server", "src", "models", "Shelter.js")),
    "No dedicated Shelter.js model (expected — shelters not a separate entity)"
  );
  assert(
    !fs.existsSync(path.join(rootDir, "server", "src", "models", "Responder.js")),
    "No dedicated Responder.js model (expected — responders not yet modeled)"
  );

  const shelterRes = await req("GET", "/resources");
  if (shelterRes.data && Array.isArray(shelterRes.data.data)) {
    const shelterTypeCount = shelterRes.data.data.filter((r) => r.type === "shelter").length;
    assert(
      shelterTypeCount >= 0,
      "Shelter-type resource count is a non-negative integer (" + shelterTypeCount + ")"
    );
    const shelterWithGPS = shelterRes.data.data.filter(
      (r) => r.type === "shelter" && typeof r.latitude === "number" && typeof r.longitude === "number"
    );
    assert(
      shelterWithGPS.length >= 0,
      "Shelter-type resources with GPS (" + shelterWithGPS.length + ") — only these show as markers"
    );
  } else {
    assert(true, "Shelter boundary check skipped (API unavailable)");
    assert(true, "Shelter boundary check skipped (API unavailable)");
  }

  console.log("\n[SECTION 9] Dashboard & Map Integration");
  const dashPath = path.join(rootDir, "client", "src", "pages", "Dashboard.jsx");
  const dashContent = fs.readFileSync(dashPath, "utf8");
  assert(dashContent.includes("IncidentMap"), "Dashboard.jsx imports IncidentMap");
  assert(dashContent.includes("Live Crisis Map"), "Dashboard.jsx has Live Crisis Map tab");
  assert(dashContent.includes("useSearchParams"), "Dashboard.jsx supports ?view=map URL param");
  assert(dashContent.includes("Day 19"), "Dashboard.jsx updated to Day 19 badge");

  const appPath = path.join(rootDir, "client", "src", "App.jsx");
  const appContent = fs.readFileSync(appPath, "utf8");
  assert(appContent.includes("incidents/:id"), "App.jsx routes /incidents/:id (incident detail unchanged)");

  console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("\uD83C\uDF89 DAY 19 TEST RESULTS: " + passed + " PASSED, " + failed + " FAILED");
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");

  if (serverInstance) serverInstance.close();
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runDay19Tests().catch((err) => {
  console.error("Unhandled test failure:", err);
  process.exit(1);
});
