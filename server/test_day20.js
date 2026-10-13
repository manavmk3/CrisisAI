import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import Resource from './src/models/Resource.js';
import app from './src/app.js';
import {
  EARTH_RADIUS_KM,
  isValidCoordinate,
  calculateHaversineDistanceKm,
  calculateBoundingBox,
} from './src/services/geoDistance.service.js';
import {
  findNearbyResources,
  NearbyResourceServiceError,
  extractIncidentCoordinates,
} from './src/services/nearbyResource.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message, detail) {
  detail = detail || '';
  if (condition) {
    passed++;
    console.log('  \u2705 PASS: ' + message);
    results.push({ name: message, status: 'PASS' });
  } else {
    failed++;
    console.error('  \u274c FAIL: ' + message + (detail ? ' \u2014 ' + detail : ''));
    results.push({ name: message, status: 'FAIL', detail: detail });
  }
}

async function req(method, pathStr, body, token) {
  const url = 'http://localhost:' + (config.port || 8000) + '/api' + pathStr;
  const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { status: res.status, data: data };
}

async function runDay20Tests() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('\uD83C\uDF0D DAY 20: NEARBY RESOURCE GEOGRAPHIC SEARCH TEST SUITE');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  console.log('[SECTION 1] Haversine Distance Calculation & Validation Tests');

  const distLondonParis = calculateHaversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
  assert(
    typeof distLondonParis === 'number' && distLondonParis > 340 && distLondonParis < 345,
    'Requirement 1: Valid Haversine distance between London and Paris (~343.5 km)',
    'got: ' + distLondonParis
  );

  const distIdentical = calculateHaversineDistanceKm(13.0827, 80.2707, 13.0827, 80.2707);
  assert(
    distIdentical === 0,
    'Requirement 2: Identical coordinates evaluate to exactly 0 km distance',
    'got: ' + distIdentical
  );

  const distAtoB = calculateHaversineDistanceKm(13.0827, 80.2707, 12.9716, 77.5946);
  const distBtoA = calculateHaversineDistanceKm(12.9716, 77.5946, 13.0827, 80.2707);
  assert(
    distAtoB === distBtoA && typeof distAtoB === 'number' && distAtoB > 0,
    'Requirement 3: Haversine distance symmetry (A to B equals B to A)',
    'distAtoB: ' + distAtoB + ', distBtoA: ' + distBtoA
  );

  assert(
    isValidCoordinate(90.1, 0) === false &&
      isValidCoordinate(-90.1, 0) === false &&
      calculateHaversineDistanceKm(91, 0, 10, 10) === null,
    'Requirement 4: Invalid latitude values (>90 or <-90) are safely rejected'
  );

  assert(
    isValidCoordinate(0, 180.1) === false &&
      isValidCoordinate(0, -180.1) === false &&
      calculateHaversineDistanceKm(0, 181, 10, 10) === null,
    'Requirement 5: Invalid longitude values (>180 or <-180) are safely rejected'
  );

  assert(
    isValidCoordinate(null, 80) === false &&
      isValidCoordinate(13, undefined) === false &&
      calculateHaversineDistanceKm(null, 80, 13, 80) === null &&
      calculateHaversineDistanceKm(13, 80, 13, undefined) === null,
    'Requirement 6: Missing coordinates (null or undefined) are rejected'
  );

  assert(
    isValidCoordinate('not-a-num', 80) === false &&
      isValidCoordinate(true, 80) === false &&
      isValidCoordinate(13, false) === false &&
      isValidCoordinate('', 80) === false &&
      isValidCoordinate('   ', 80) === false &&
      isValidCoordinate(NaN, 80) === false &&
      isValidCoordinate({}, 80) === false &&
      calculateHaversineDistanceKm('abc', 80, 13, 80) === null,
    'Requirement 7: Non-numeric, boolean, empty, and NaN coordinates are rejected'
  );

  assert(
    isValidCoordinate(90, 180) === true &&
      isValidCoordinate(-90, -180) === true &&
      isValidCoordinate(0, 0) === true,
    'Requirement 4 & 5 Boundary: Boundary coordinate poles and anti-meridian are safely accepted'
  );

  const antipodalDist = calculateHaversineDistanceKm(90, 0, -90, 0);
  assert(
    typeof antipodalDist === 'number' &&
      !Number.isNaN(antipodalDist) &&
      antipodalDist > 20000 &&
      antipodalDist < 20050,
    'Requirement 1 & Boundary: Antipodal points distance is finite and non-NaN (~20015 km)'
  );

  console.log('\n[SECTION 2] Backend Database Connection & Test Data Setup');

  let serverInstance = null;
  try {
    await fetch('http://localhost:' + (config.port || 8000) + '/api/health');
  } catch (_) {
    serverInstance = app.listen(config.port || 8000);
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      } catch (_) {}
    }
    const connPromise = mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await Promise.race([
      connPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out')), 5500)),
    ]);
    console.log('  \uD83D\uDCE6 Connected to MongoDB.\n');
  } catch (err) {
    console.error('  \u274c Could not connect to MongoDB:', err.message);
    if (serverInstance) serverInstance.close();
    process.exit(1);
  }

  const authorityEmail = 'day20_authority@crisisai.test';
  const citizenEmail = 'day20_citizen@crisisai.test';

  let authorityUser = await User.findOne({ email: authorityEmail });
  if (!authorityUser) {
    authorityUser = await User.create({
      name: 'Day20 Authority Officer',
      email: authorityEmail,
      password: 'Day20AuthPassword!',
      role: 'authority',
    });
  }

  let citizenUser = await User.findOne({ email: citizenEmail });
  if (!citizenUser) {
    citizenUser = await User.create({
      name: 'Day20 Citizen User',
      email: citizenEmail,
      password: 'Day20CitizenPassword!',
      role: 'citizen',
    });
  }

  const authorityToken = jwt.sign(
    { id: authorityUser._id, email: authorityUser.email, role: authorityUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const citizenToken = jwt.sign(
    { id: citizenUser._id, email: citizenUser.email, role: citizenUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const testIncidents = [];
  const testResources = [];

  const centerLat = 13.0827;
  const centerLon = 80.2707;

  const validIncident = await Incident.create({
    report: 'Day 20 Test Emergency: Flash flood requiring ambulance evacuation teams.',
    reporter: authorityUser._id,
    category: 'flood',
    severity: 'critical',
    urgency: 'immediate',
    location: 'Central Marina Hub',
    coordinates: { latitude: centerLat, longitude: centerLon },
    requiredResources: ['ambulance'],
    summary: 'Day 20 Geographic Search Test Incident with Verified GPS',
    aiConfidence: 0.95,
    priorityScore: 88,
    status: 'reported',
  });
  testIncidents.push(validIncident);

  const noCoordsIncident = await Incident.create({
    report: 'Day 20 Test Incident lacking coordinates.',
    reporter: authorityUser._id,
    category: 'fire',
    severity: 'high',
    urgency: 'urgent',
    location: 'Unknown remote sector',
    coordinates: { latitude: null, longitude: null },
    requiredResources: ['fire_rescue'],
    summary: 'Day 20 Incident Without Telemetry Coordinates',
    aiConfidence: 0.85,
    priorityScore: 72,
    status: 'reported',
  });
  testIncidents.push(noCoordsIncident);

  const resCloseAmbulance = await Resource.create({
    name: 'Day20 Rapid Ambulance Alpha',
    type: 'ambulance',
    quantity: 10,
    availableQuantity: 5,
    status: 'available',
    location: 'Marina Sector 1',
    latitude: 13.0900,
    longitude: 80.2750,
  });
  testResources.push(resCloseAmbulance);

  const latDelta10km = (10 / EARTH_RADIUS_KM) * (180 / Math.PI);
  const boundaryLat = centerLat + latDelta10km;
  const resBoundaryAmbulance = await Resource.create({
    name: 'Day20 Boundary Ambulance Bravo',
    type: 'ambulance',
    quantity: 6,
    availableQuantity: 4,
    status: 'available',
    location: 'Perimeter Checkpoint 10km',
    latitude: boundaryLat,
    longitude: centerLon,
  });
  testResources.push(resBoundaryAmbulance);

  const resFarAmbulance = await Resource.create({
    name: 'Day20 Distant Ambulance Charlie',
    type: 'ambulance',
    quantity: 8,
    availableQuantity: 8,
    status: 'available',
    location: 'Outlying Sector 35km',
    latitude: centerLat + 0.35,
    longitude: centerLon + 0.25,
  });
  testResources.push(resFarAmbulance);

  const resMedicalTeamCompat = await Resource.create({
    name: 'Day20 Medical Response Team Delta',
    type: 'medical_team',
    quantity: 12,
    availableQuantity: 7,
    status: 'available',
    location: 'General Hospital Base',
    latitude: 13.0850,
    longitude: 80.2720,
  });
  testResources.push(resMedicalTeamCompat);

  const resFoodSupply = await Resource.create({
    name: 'Day20 Emergency Food Pack Echo',
    type: 'food',
    quantity: 100,
    availableQuantity: 80,
    status: 'available',
    location: 'Central Relief Warehouse',
    latitude: 13.0840,
    longitude: 80.2710,
  });
  testResources.push(resFoodSupply);

  const resZeroQuantity = await Resource.create({
    name: 'Day20 Depleted Ambulance Foxtrot',
    type: 'ambulance',
    quantity: 5,
    availableQuantity: 0,
    status: 'available',
    location: 'Marina Reserve Post',
    latitude: 13.0830,
    longitude: 80.2709,
  });
  testResources.push(resZeroQuantity);

  const resMaintenance = await Resource.create({
    name: 'Day20 Maintenance Ambulance Golf',
    type: 'ambulance',
    quantity: 4,
    availableQuantity: 4,
    status: 'maintenance',
    location: 'Vehicle Repair Workshop',
    latitude: 13.0835,
    longitude: 80.2712,
  });
  testResources.push(resMaintenance);

  const resDeployed = await Resource.create({
    name: 'Day20 Deployed Ambulance Hotel',
    type: 'ambulance',
    quantity: 3,
    availableQuantity: 0,
    status: 'deployed',
    location: 'Active Mission Field',
    latitude: 13.0838,
    longitude: 80.2715,
  });
  testResources.push(resDeployed);

  const resTieBreakerHighQty = await Resource.create({
    name: 'Day20 High Stock Ambulance India',
    type: 'ambulance',
    quantity: 20,
    availableQuantity: 15,
    status: 'available',
    location: 'Station 2 Colocated',
    latitude: 13.0900,
    longitude: 80.2750,
  });
  testResources.push(resTieBreakerHighQty);

  console.log('\n[SECTION 3] Service-Level Geographic Search Tests');

  const boundaryDistExact = calculateHaversineDistanceKm(
    centerLat,
    centerLon,
    boundaryLat,
    centerLon
  );
  assert(
    Math.abs(boundaryDistExact - 10) < 0.05,
    'Requirement 9: Boundary resource accurately placed at search radius limit (~10.00 km)',
    'got: ' + boundaryDistExact
  );

  const serviceRes10 = await findNearbyResources({
    incident: validIncident,
    radiusKm: 10,
    availableOnly: true,
  });

  const foundIds10 = serviceRes10.resources.map((r) => r.resourceId);
  assert(
    foundIds10.includes(resCloseAmbulance._id.toString()),
    'Requirement 8: Resource at 1.0 km included within 10 km radius'
  );
  assert(
    foundIds10.includes(resBoundaryAmbulance._id.toString()),
    'Requirement 9: Resource at 10.0 km radius boundary included in results'
  );
  assert(
    !foundIds10.includes(resFarAmbulance._id.toString()),
    'Requirement 10: Distant resource at >35 km strictly excluded from 10 km radius'
  );

  const serviceResTypeFiltered = await findNearbyResources({
    incident: validIncident,
    radiusKm: 20,
    type: 'ambulance',
    availableOnly: true,
  });
  const typeFilteredIds = serviceResTypeFiltered.resources.map((r) => r.resourceId);
  assert(
    typeFilteredIds.includes(resCloseAmbulance._id.toString()) &&
      !typeFilteredIds.includes(resFoodSupply._id.toString()),
    'Requirement 11: Resource type filter restricts results to requested type and its compatible alternatives'
  );

  const serviceResAvailableOnly = await findNearbyResources({
    incident: validIncident,
    radiusKm: 10,
    availableOnly: true,
  });
  const availableOnlyIds = serviceResAvailableOnly.resources.map((r) => r.resourceId);
  assert(
    !availableOnlyIds.includes(resZeroQuantity._id.toString()),
    'Requirement 14: Zero available quantity resource excluded when availableOnly=true'
  );
  assert(
    !availableOnlyIds.includes(resMaintenance._id.toString()),
    'Requirement 15: Maintenance resource excluded from available inventory'
  );
  assert(
    !availableOnlyIds.includes(resDeployed._id.toString()),
    'Requirement 13: Deployed resource with zero available units excluded from available-only results'
  );

  const serviceResAllStatuses = await findNearbyResources({
    incident: validIncident,
    radiusKm: 10,
    availableOnly: false,
    status: 'maintenance',
  });
  const maintIds = serviceResAllStatuses.resources.map((r) => r.resourceId);
  assert(
    maintIds.includes(resMaintenance._id.toString()) &&
      !maintIds.includes(resCloseAmbulance._id.toString()),
    'Requirement 12: Status filter correctly isolates requested operational status'
  );

  for (const item of serviceRes10.resources) {
    assert(
      item.availableQuantity <= item.quantity,
      'Requirement 16: availableQuantity (' +
        item.availableQuantity +
        ') never exceeds total quantity (' +
        item.quantity +
        ')'
    );
  }

  const closeAmbulanceResult = serviceRes10.resources.find(
    (r) => r.resourceId === resCloseAmbulance._id.toString()
  );
  const boundaryAmbulanceResult = serviceRes10.resources.find(
    (r) => r.resourceId === resBoundaryAmbulance._id.toString()
  );
  assert(
    serviceRes10.resources.indexOf(closeAmbulanceResult) <
      serviceRes10.resources.indexOf(boundaryAmbulanceResult),
    'Requirement 17: Closer available resource ranked ahead of more distant resource'
  );

  const serviceResColocated = await findNearbyResources({
    incident: validIncident,
    radiusKm: 5,
    type: 'ambulance',
    availableOnly: true,
  });
  const colocatedAlphaIdx = serviceResColocated.resources.findIndex(
    (r) => r.resourceId === resCloseAmbulance._id.toString()
  );
  const colocatedIndiaIdx = serviceResColocated.resources.findIndex(
    (r) => r.resourceId === resTieBreakerHighQty._id.toString()
  );
  assert(
    colocatedIndiaIdx !== -1 &&
      colocatedAlphaIdx !== -1 &&
      colocatedIndiaIdx < colocatedAlphaIdx,
    'Requirement 18: Deterministic tie-breaking prefers greater available quantity (15 units ahead of 5 units)'
  );

  const medTeamMatch = serviceRes10.resources.find(
    (r) => r.resourceId === resMedicalTeamCompat._id.toString()
  );
  assert(
    medTeamMatch && medTeamMatch.matchType === 'compatible',
    'Requirement 19: Day 16 compatibility mapping identifies medical_team as compatible for ambulance'
  );

  try {
    await findNearbyResources({
      incident: validIncident,
      radiusKm: 10,
      type: 'alien_spacecraft',
    });
    assert(false, 'Requirement 20: Unknown resource type should throw error');
  } catch (err) {
    assert(
      err instanceof NearbyResourceServiceError && err.statusCode === 400,
      'Requirement 20: Unknown resource type rejected with HTTP 400'
    );
  }

  try {
    await findNearbyResources({
      incident: noCoordsIncident,
      radiusKm: 10,
    });
    assert(false, 'Requirement 23: Incident lacking coordinates should throw error');
  } catch (err) {
    assert(
      err instanceof NearbyResourceServiceError && err.statusCode === 400,
      'Requirement 23: Incident lacking valid coordinates rejected with HTTP 400'
    );
  }

  try {
    await findNearbyResources({
      incident: validIncident,
      radiusKm: 0,
    });
    assert(false, 'Requirement 24: Non-positive radius should throw error');
  } catch (err) {
    assert(
      err instanceof NearbyResourceServiceError && err.statusCode === 400,
      'Requirement 24: Invalid radius (0 km) rejected with HTTP 400'
    );
  }

  try {
    await findNearbyResources({
      incident: validIncident,
      radiusKm: 500,
    });
    assert(false, 'Requirement 24: Radius exceeding 200 km should throw error');
  } catch (err) {
    assert(
      err instanceof NearbyResourceServiceError && err.statusCode === 400,
      'Requirement 24: Radius > 200 km rejected with HTTP 400'
    );
  }

  try {
    await findNearbyResources({
      incident: validIncident,
      availableOnly: 'maybe',
    });
    assert(false, 'Requirement 25: Malformed boolean string should throw error');
  } catch (err) {
    assert(
      err instanceof NearbyResourceServiceError && err.statusCode === 400,
      'Requirement 25: Malformed boolean parameter rejected with HTTP 400'
    );
  }

  const emptySearch = await findNearbyResources({
    incident: validIncident,
    radiusKm: 1,
    type: 'rescue_boat',
  });
  assert(
    emptySearch.count === 0 && Array.isArray(emptySearch.resources) && emptySearch.resources.length === 0,
    'Requirement 26: Empty search result set returns clean empty array without error'
  );

  console.log('\n[SECTION 4] HTTP API Endpoint Tests (/api/incidents/:id/nearby-resources)');

  const httpAuthSuccess = await req(
    'GET',
    `/incidents/${validIncident._id}/nearby-resources?radiusKm=10`,
    undefined,
    authorityToken
  );
  assert(
    httpAuthSuccess.status === 200 && httpAuthSuccess.data?.success === true,
    'Requirement 27: Authenticated GET /api/incidents/:id/nearby-resources returns HTTP 200 and real records'
  );
  assert(
    Array.isArray(httpAuthSuccess.data?.data) && httpAuthSuccess.data.count > 0,
    'Requirement 27: API returns real persisted MongoDB records with calculated distances'
  );

  const unauthRes = await req(
    'GET',
    `/incidents/${validIncident._id}/nearby-resources?radiusKm=10`
  );
  assert(
    unauthRes.status === 401,
    'Requirement 28: Unauthenticated access returns HTTP 401 Unauthorized'
  );

  const citizenRes = await req(
    'GET',
    `/incidents/${validIncident._id}/nearby-resources?radiusKm=10`,
    undefined,
    citizenToken
  );
  assert(
    citizenRes.status === 403,
    'Requirement 28: Citizen role access returns HTTP 403 Forbidden'
  );

  const missingIncidentId = new mongoose.Types.ObjectId();
  const missingIncRes = await req(
    'GET',
    `/incidents/${missingIncidentId}/nearby-resources`,
    undefined,
    authorityToken
  );
  assert(
    missingIncRes.status === 404,
    'Requirement 21: Non-existent incident ID returns HTTP 404 Not Found'
  );

  const malformedIncRes = await req(
    'GET',
    '/incidents/not-a-valid-object-id/nearby-resources',
    undefined,
    authorityToken
  );
  assert(
    malformedIncRes.status === 400,
    'Requirement 22: Malformed incident ID returns HTTP 400 Bad Request'
  );

  const noCoordsIncRes = await req(
    'GET',
    `/incidents/${noCoordsIncident._id}/nearby-resources`,
    undefined,
    authorityToken
  );
  assert(
    noCoordsIncRes.status === 400 &&
      noCoordsIncRes.data?.message?.includes('valid GPS coordinates'),
    'Requirement 23: Incident lacking coordinates returns HTTP 400 with helpful explanation'
  );

  const invalidRadiusRes = await req(
    'GET',
    `/incidents/${validIncident._id}/nearby-resources?radiusKm=-10`,
    undefined,
    authorityToken
  );
  assert(
    invalidRadiusRes.status === 400,
    'Requirement 24: HTTP endpoint validates radius limits and rejects negative radius with 400'
  );

  const invalidTypeRes = await req(
    'GET',
    `/incidents/${validIncident._id}/nearby-resources?type=unsupported_type_xyz`,
    undefined,
    authorityToken
  );
  assert(
    invalidTypeRes.status === 400,
    'Requirement 25: HTTP endpoint rejects unsupported type query parameter with 400'
  );

  const allocRouteSuccess = await req(
    'GET',
    `/allocations/incident/${validIncident._id}/nearby-resources?radiusKm=10`,
    undefined,
    authorityToken
  );
  assert(
    allocRouteSuccess.status === 200 && allocRouteSuccess.data?.success === true,
    'Endpoint Symmetry: GET /api/allocations/incident/:id/nearby-resources also functional'
  );

  console.log('\n[SECTION 5] System Regressions (Days 1–19 Functional Invariants)');

  const incList = await req('GET', '/incidents?sort=priority');
  assert(
    incList.status === 200 && incList.data?.success === true,
    'Requirement 29: Incident CRUD & listing regression preserved'
  );

  const resList = await req('GET', '/resources');
  assert(
    resList.status === 200 && resList.data?.success === true,
    'Requirement 30: Day 15 resource inventory listing regression preserved'
  );

  const candRes = await req(
    'GET',
    `/incidents/${validIncident._id}/candidates`,
    undefined,
    authorityToken
  );
  assert(
    candRes.status === 200 && candRes.data?.success === true,
    'Requirement 31: Day 16 candidate ranking engine preserved without formula alteration'
  );

  const allocList = await req(
    'GET',
    `/incidents/${validIncident._id}/allocations`,
    undefined,
    authorityToken
  );
  assert(
    allocList.status === 200 && allocList.data?.success === true,
    'Requirement 31: Day 16 incident allocations listing regression preserved'
  );

  const incidentMapPath = path.join(rootDir, 'client', 'src', 'components', 'IncidentMap.jsx');
  assert(fs.existsSync(incidentMapPath), 'Requirement 32: IncidentMap.jsx component exists');
  const mapContent = fs.readFileSync(incidentMapPath, 'utf8');
  assert(
    mapContent.includes('react-leaflet') &&
      mapContent.includes('Marker') &&
      mapContent.includes('Popup') &&
      mapContent.includes('OpenStreetMap'),
    'Requirement 32: Day 18/19 Leaflet OSM map configuration and markers intact'
  );

  const nearbyComponentPath = path.join(
    rootDir,
    'client',
    'src',
    'components',
    'allocations',
    'NearbyResourceSearch.jsx'
  );
  assert(
    fs.existsSync(nearbyComponentPath),
    'Requirement 32: NearbyResourceSearch.jsx frontend component exists'
  );

  console.log('\n[CLEANUP] Removing test-created database documents');
  for (const inc of testIncidents) {
    try {
      await Incident.findByIdAndDelete(inc._id);
    } catch (_) {}
  }
  for (const res of testResources) {
    try {
      await Resource.findByIdAndDelete(res._id);
    } catch (_) {}
  }
  try {
    await User.deleteMany({ email: { $in: [authorityEmail, citizenEmail] } });
  } catch (_) {}
  console.log('  \u2705 Test data cleaned up successfully.\n');

  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('\uD83C\uDF89 DAY 20 TEST RESULTS: ' + passed + ' PASSED, ' + failed + ' FAILED');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  if (serverInstance) serverInstance.close();
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runDay20Tests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
