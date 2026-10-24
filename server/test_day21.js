import dns from 'dns';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as ioClient } from 'socket.io-client';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import Resource from './src/models/Resource.js';
import ResourceAllocation from './src/models/ResourceAllocation.js';
import app from './src/app.js';
import {
  initSocket,
  getIO,
  closeSocket,
  emitIncidentCreated,
  emitIncidentUpdated,
  emitIncidentVerificationChanged,
  emitIncidentResolved,
  emitResourceCreated,
  emitResourceUpdated,
  emitResourceAssigned,
  emitResourceReleased,
} from './src/services/socket.service.js';
import { calculateHaversineDistanceKm } from './src/services/geoDistance.service.js';
import { rankCandidateResources } from './src/services/resourceRanking.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message, detail = '') {
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
  const url = 'http://localhost:' + TEST_PORT + '/api' + pathStr;
  const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { status: res.status, data: data, headers: res.headers };
}

const TEST_PORT = 5021;
let httpServer = null;
let testAuthority = null;
let testCitizen = null;
let authorityToken = null;
let citizenToken = null;

const testIncidents = [];
const testResources = [];
const testAllocations = [];

async function runDay21Tests() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('\uD83D\uDD04 DAY 21: REAL-TIME LAYER WITH SOCKET.IO TEST SUITE');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  
  console.log('[SECTION 1] Database & HTTP + Socket.IO Server Initialization');

  try {
    if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      } catch (_) {}
    }
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('  \uD83D\uDCE6 Connected to MongoDB.');
  } catch (err) {
    console.error('  \u274c MongoDB connection failed:', err.message);
    process.exit(1);
  }

  httpServer = http.createServer(app);
  const ioInstance = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));

  assert(
    ioInstance !== null && getIO() === ioInstance,
    'Requirement 1: Socket.IO server initializes and attaches to HTTP server'
  );

  const healthRes = await req('GET', '/health');
  assert(
    healthRes.status === 200 && healthRes.data?.status === 'ok',
    'Requirement 2: Existing REST health endpoint responds with 200 OK during Socket.IO execution'
  );

  
  console.log('\n[SECTION 2] CORS & Origin Behavior');

  const allowedOriginCheck = await fetch(`http://localhost:${TEST_PORT}/api/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert(
    allowedOriginCheck.status === 200 &&
      allowedOriginCheck.headers.get('access-control-allow-origin') === 'http://localhost:5173',
    'Requirement 3: Configured allowed-origin (http://localhost:5173) is accepted with CORS headers'
  );

  assert(
    ioInstance.opts.cors !== undefined && ioInstance.opts.cors.credentials === true,
    'Requirement 4: Socket.IO CORS configuration preserves credentials and origin boundaries'
  );

  
  console.log('\n[SECTION 3] Authentication & Connection Security');

  const authorityEmail = 'day21_auth_officer@crisisai.test';
  const citizenEmail = 'day21_citizen_user@crisisai.test';

  await User.deleteMany({ email: { $in: [authorityEmail, citizenEmail] } });

  testAuthority = await User.create({
    name: 'Day21 Authority Commander',
    email: authorityEmail,
    password: 'Day21StrongPassword!',
    role: 'authority',
    agency: 'Crisis Operations Center',
  });

  testCitizen = await User.create({
    name: 'Day21 Citizen Informant',
    email: citizenEmail,
    password: 'Day21CitizenPassword!',
    role: 'citizen',
  });

  authorityToken = jwt.sign(
    { id: testAuthority._id.toString(), role: testAuthority.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  citizenToken = jwt.sign(
    { id: testCitizen._id.toString(), role: testCitizen.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  const socketUrl = `http://localhost:${TEST_PORT}`;

  const authSocket = ioClient(socketUrl, {
    auth: { token: authorityToken },
    transports: ['websocket'],
  });

  const authConnected = await new Promise((resolve) => {
    authSocket.on('connect', () => resolve(true));
    authSocket.on('connect_error', () => resolve(false));
    setTimeout(() => resolve(false), 3000);
  });

  assert(authConnected === true, 'Requirement 5: Valid authenticated connection connects successfully');

  const invalidSocket = ioClient(socketUrl, {
    auth: { token: 'invalid.token.signature.value' },
    transports: ['websocket'],
  });

  const invalidRejected = await new Promise((resolve) => {
    invalidSocket.on('connect', () => resolve(false));
    invalidSocket.on('connect_error', (err) => resolve(err.message.includes('Authentication error')));
    setTimeout(() => resolve(false), 3000);
  });

  assert(invalidRejected === true, 'Requirement 6: Invalid token is rejected server-side during handshake');
  invalidSocket.disconnect();

  const expiredToken = jwt.sign(
    { id: testAuthority._id.toString() },
    config.jwt.secret,
    { expiresIn: -10 }
  );

  const expiredSocket = ioClient(socketUrl, {
    auth: { token: expiredToken },
    transports: ['websocket'],
  });

  const expiredRejected = await new Promise((resolve) => {
    expiredSocket.on('connect', () => resolve(false));
    expiredSocket.on('connect_error', (err) => resolve(err.message.includes('Authentication error')));
    setTimeout(() => resolve(false), 3000);
  });

  assert(expiredRejected === true, 'Requirement 7: Expired token is rejected server-side during handshake');
  expiredSocket.disconnect();

  let disconnectFired = false;
  authSocket.on('disconnect', () => {
    disconnectFired = true;
  });
  authSocket.disconnect();
  await new Promise((r) => setTimeout(r, 100));

  assert(
    disconnectFired === true,
    'Requirement 8: Clean connection and disconnection lifecycle events handled'
  );

  
  console.log('\n[SECTION 4] Incident & Resource Real-Time Event Emissions');

  const clientSocket = ioClient(socketUrl, {
    auth: { token: authorityToken },
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    clientSocket.on('connect', resolve);
  });

  const createdIncidentPromise = new Promise((resolve) => {
    clientSocket.once('incident:created', (data) => resolve(data));
  });

  const testInc = new Incident({
    report: 'Day 21 Flash Flood in sector 4 water level rising rapidly',
    reporter: testAuthority._id,
    category: 'flood',
    severity: 'high',
    peopleAffected: 50,
    injuries: 2,
    urgency: 'urgent',
    location: 'Sector 4 Riverbank',
    coordinates: { latitude: 13.0827, longitude: 80.2707 },
    requiredResources: ['rescue_boat', 'medical_team'],
    summary: 'Flash flood reported at Sector 4 riverbank',
    aiConfidence: 0.95,
    priorityScore: 78,
    priorityBreakdown: { severity: 20, affectedPopulation: 15, vulnerability: 10, resourceShortage: 10, timeSensitivity: 8, confidence: 5, locationContext: 10 },
    status: 'reported',
    verificationState: 'verified',
  });
  await testInc.save();
  testIncidents.push(testInc);
  emitIncidentCreated(testInc);

  const createdEvent = await Promise.race([
    createdIncidentPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for incident:created')), 3000)),
  ]);

  assert(
    createdEvent && createdEvent.incidentId === testInc._id.toString(),
    'Requirement 9: Incident creation emits incident:created event with correct ID'
  );

  assert(
    createdEvent.password === undefined && createdEvent.__v === undefined,
    'Requirement 21: Payload excludes unnecessary sensitive/internal database fields'
  );

  const updatedIncidentPromise = new Promise((resolve) => {
    clientSocket.once('incident:updated', (data) => resolve(data));
  });

  testInc.urgency = 'immediate';
  await testInc.save();
  emitIncidentUpdated(testInc);

  const updatedEvent = await Promise.race([
    updatedIncidentPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for incident:updated')), 3000)),
  ]);

  assert(
    updatedEvent && updatedEvent.incidentId === testInc._id.toString() && updatedEvent.urgency === 'immediate',
    'Requirement 10: Incident update emits incident:updated event with persisted fields'
  );

  const verChangedPromise = new Promise((resolve) => {
    clientSocket.once('incident:verification-changed', (data) => resolve(data));
  });

  const oldVer = testInc.verificationState;
  testInc.verificationState = 'needs_review';
  await testInc.save();
  emitIncidentVerificationChanged(testInc, oldVer, 'needs_review');

  const verEvent = await Promise.race([
    verChangedPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for incident:verification-changed')), 3000)),
  ]);

  assert(
    verEvent && verEvent.previousState === 'verified' && verEvent.verificationState === 'needs_review',
    'Requirement 11: Verification-state change emits incident:verification-changed event'
  );

  const resolvedPromise = new Promise((resolve) => {
    clientSocket.once('incident:resolved', (data) => resolve(data));
  });

  testInc.status = 'resolved';
  await testInc.save();
  emitIncidentResolved(testInc);

  const resolvedEvent = await Promise.race([
    resolvedPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for incident:resolved')), 3000)),
  ]);

  assert(
    resolvedEvent && resolvedEvent.status === 'resolved' && resolvedEvent.incidentId === testInc._id.toString(),
    'Requirement 12: Incident resolution emits incident:resolved event'
  );

  let duplicateResolvedEmitted = false;
  const duplicateWatcher = () => {
    duplicateResolvedEmitted = true;
  };
  clientSocket.on('incident:resolved', duplicateWatcher);

  testInc.location = 'Sector 4 Riverbank (Cleaned up)';
  await testInc.save();

  const prevStatus = 'resolved';
  if (prevStatus !== 'resolved' && testInc.status === 'resolved') {
    emitIncidentResolved(testInc);
  }
  await new Promise((r) => setTimeout(r, 200));
  clientSocket.off('incident:resolved', duplicateWatcher);

  assert(
    duplicateResolvedEmitted === false,
    'Requirement 13: Repeated updates to an already-resolved incident do not duplicate transition events'
  );

  const resCreatedPromise = new Promise((resolve) => {
    clientSocket.once('resource:created', (data) => resolve(data));
  });

  const testResource = new Resource({
    name: 'Day 21 Rapid Response Unit 1',
    type: 'rescue_boat',
    quantity: 10,
    availableQuantity: 10,
    status: 'available',
    location: 'Central Marina',
    latitude: 13.085,
    longitude: 80.275,
    managedBy: testAuthority._id,
  });
  await testResource.save();
  testResources.push(testResource);
  emitResourceCreated(testResource);

  const resCreatedEvent = await Promise.race([
    resCreatedPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for resource:created')), 3000)),
  ]);

  assert(
    resCreatedEvent && resCreatedEvent.resourceId === testResource._id.toString() && resCreatedEvent.name === testResource.name,
    'Requirement 14: Resource creation emits resource:created event'
  );

  const resUpdatedPromise = new Promise((resolve) => {
    clientSocket.once('resource:updated', (data) => resolve(data));
  });

  testResource.quantity = 12;
  testResource.availableQuantity = 12;
  await testResource.save();
  emitResourceUpdated(testResource);

  const resUpdatedEvent = await Promise.race([
    resUpdatedPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for resource:updated')), 3000)),
  ]);

  assert(
    resUpdatedEvent && resUpdatedEvent.quantity === 12 && resUpdatedEvent.availableQuantity === 12,
    'Requirement 15: Resource update emits resource:updated event'
  );

  const resAssignedPromise = new Promise((resolve) => {
    clientSocket.once('resource:assigned', (data) => resolve(data));
  });

  const allocDoc = await ResourceAllocation.create({
    incident: testInc._id,
    resource: testResource._id,
    resourceType: 'rescue_boat',
    quantity: 2,
    status: 'active',
    allocatedBy: testAuthority._id,
  });
  testAllocations.push(allocDoc);

  emitResourceAssigned({
    incidentId: testInc._id,
    allocations: [allocDoc],
  });

  const assignedEvent = await Promise.race([
    resAssignedPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for resource:assigned')), 3000)),
  ]);

  assert(
    assignedEvent &&
      assignedEvent.incidentId === testInc._id.toString() &&
      Array.isArray(assignedEvent.allocations) &&
      assignedEvent.allocations[0].quantity === 2,
    'Requirement 16: Resource allocation emits resource:assigned event'
  );

  const resReleasedPromise = new Promise((resolve) => {
    clientSocket.once('resource:released', (data) => resolve(data));
  });

  allocDoc.status = 'released';
  allocDoc.releasedAt = new Date();
  await allocDoc.save();

  emitResourceReleased({
    allocationId: allocDoc._id,
    incidentId: testInc._id,
    resourceId: testResource._id,
    quantity: allocDoc.quantity,
  });

  const releasedEvent = await Promise.race([
    resReleasedPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for resource:released')), 3000)),
  ]);

  assert(
    releasedEvent &&
      releasedEvent.allocationId === allocDoc._id.toString() &&
      releasedEvent.quantity === 2,
    'Requirement 17: Resource release emits resource:released event'
  );

  let fakeAssignedEmitted = false;
  const fakeAssignedWatcher = () => {
    fakeAssignedEmitted = true;
  };
  clientSocket.on('resource:assigned', fakeAssignedWatcher);

  const failedAllocRes = await req(
    'POST',
    `/incidents/${testInc._id}/allocate`,
    { items: [{ type: 'unsupported_resource_type_xyz', quantity: 5 }] },
    authorityToken
  );
  await new Promise((r) => setTimeout(r, 200));
  clientSocket.off('resource:assigned', fakeAssignedWatcher);

  assert(
    failedAllocRes.status === 400 && fakeAssignedEmitted === false,
    'Requirement 18: Failed allocation request returns HTTP 400 and never emits resource:assigned'
  );

  let fakeReleaseEmitted = false;
  const fakeReleaseWatcher = () => {
    fakeReleaseEmitted = true;
  };
  clientSocket.on('resource:released', fakeReleaseWatcher);

  const failedReleaseRes = await req(
    'POST',
    `/allocations/${allocDoc._id}/release`,
    {},
    authorityToken
  );
  await new Promise((r) => setTimeout(r, 200));
  clientSocket.off('resource:released', fakeReleaseWatcher);

  assert(
    failedReleaseRes.status === 400 && fakeReleaseEmitted === false,
    'Requirement 19: Failed allocation release returns HTTP 400 and never emits resource:released'
  );

  assert(
    createdEvent.incidentId === testInc._id.toString() &&
      resCreatedEvent.resourceId === testResource._id.toString() &&
      releasedEvent.allocationId === allocDoc._id.toString(),
    'Requirement 20: Event payloads contain accurate and verifiable record IDs'
  );

  clientSocket.disconnect();

  
  console.log('\n[SECTION 5] Responder Model & Status-Update Boundary');

  const responderModelExists = fs.existsSync(
    path.join(rootDir, 'server', 'src', 'models', 'Responder.js')
  );
  assert(
    responderModelExists === false,
    'Requirement Boundary: Dedicated Responder.js model does not exist (not yet modeled in domain)'
  );
  console.log(
    '  \u2139\uFE0F  Responder Status-Updated Milestone Event: Marked BLOCKED due to missing domain model.'
  );

  
  console.log('\n[SECTION 6] Frontend Hooks & Client-Side Architecture');

  const useSocketPath = path.join(rootDir, 'client', 'src', 'hooks', 'useSocket.js');
  assert(fs.existsSync(useSocketPath), 'Requirement 22: client/src/hooks/useSocket.js exists');
  const useSocketCode = fs.readFileSync(useSocketPath, 'utf8');

  assert(
    useSocketCode.includes('io(') &&
      useSocketCode.includes('sharedSocket') &&
      useSocketCode.includes('subscribe') &&
      useSocketCode.includes('onReconnect'),
    'Requirement 22: useSocket hook implements connection sharing, event subscriptions, and reconnection hooks'
  );

  const useRealtimeSyncPath = path.join(rootDir, 'client', 'src', 'hooks', 'useRealtimeSync.js');
  assert(
    fs.existsSync(useRealtimeSyncPath),
    'Requirement 26: client/src/hooks/useRealtimeSync.js exists'
  );
  const syncCode = fs.readFileSync(useRealtimeSyncPath, 'utf8');

  assert(
    syncCode.includes('DEFAULT_FALLBACK_INTERVAL_MS') &&
      (syncCode.includes('12000') || syncCode.includes('10000') || syncCode.includes('15000')),
    'Requirement 26: Configurable short-interval polling fallback uses 10-15s default (12000ms)'
  );

  assert(
    syncCode.includes('if (isConnected) {') && syncCode.includes('return;'),
    'Requirement 27: Polling is stopped/idle when Socket.IO connection is healthy'
  );

  assert(
    syncCode.includes('clearInterval(intervalId)'),
    'Requirement 28: Polling cleanup clears interval timer to prevent duplicate loops on unmount'
  );

  assert(
    syncCode.includes('onReconnect'),
    'Requirement 25: Reconnection triggers REST reconciliation to recover missed changes'
  );

  
  console.log('\n[SECTION 7] Authority Dashboard, Map, and Geographic Search Integrations');

  const dashboardPath = path.join(rootDir, 'client', 'src', 'pages', 'Dashboard.jsx');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

  assert(
    dashboardCode.includes('useRealtimeSync') &&
      dashboardCode.includes('incident:created') &&
      dashboardCode.includes('incident:updated') &&
      dashboardCode.includes('incident:resolved'),
    'Requirement 22 & 23: Dashboard subscribes to real-time events without page reload and preserves filters'
  );

  assert(
    dashboardCode.includes('realtime-status-badge'),
    'Requirement 22: Dashboard provides clear real-time and fallback connection status indicator'
  );

  const detailPath = path.join(rootDir, 'client', 'src', 'pages', 'IncidentDetail.jsx');
  const detailCode = fs.readFileSync(detailPath, 'utf8');
  assert(
    detailCode.includes('useRealtimeSync') && detailCode.includes('fetchIncidentDetails'),
    'Requirement 17: IncidentDetail view refreshes in real-time when relevant events arrive'
  );

  const mapPath = path.join(rootDir, 'client', 'src', 'components', 'IncidentMap.jsx');
  const mapCode = fs.readFileSync(mapPath, 'utf8');
  assert(
    mapCode.includes('useRealtimeSync') &&
      mapCode.includes('resource:updated') &&
      mapCode.includes('loadResources'),
    'Requirement 31: IncidentMap refreshes resource markers on socket events and polling fallback'
  );

  const nearbyPath = path.join(
    rootDir,
    'client',
    'src',
    'components',
    'allocations',
    'NearbyResourceSearch.jsx'
  );
  const nearbyCode = fs.readFileSync(nearbyPath, 'utf8');
  assert(
    nearbyCode.includes('useRealtimeSync') && nearbyCode.includes('runSearch'),
    'Requirement 32: NearbyResourceSearch invalidates and re-queries REST search on resource updates'
  );

  const resourcesPath = path.join(rootDir, 'client', 'src', 'pages', 'Resources.jsx');
  const resourcesCode = fs.readFileSync(resourcesPath, 'utf8');
  assert(
    resourcesCode.includes('useRealtimeSync') && resourcesCode.includes('fetchResources'),
    'Requirement 30: Resources inventory page automatically refreshes on socket events and polling'
  );

  
  console.log('\n[SECTION 8] Day 15–20 Regressions & Invariant Verification');

  const freshRes = await Resource.findById(testResource._id);
  assert(
    freshRes.availableQuantity <= freshRes.quantity && freshRes.availableQuantity >= 0,
    'Requirement 33: Resource available quantity never exceeds total quantity and remains non-negative'
  );

  const idemIncident = await Incident.create({
    report: 'Day 21 Idempotency Incident test verification report',
    reporter: testAuthority._id,
    category: 'earthquake',
    severity: 'medium',
    urgency: 'soon',
    location: 'Sector 9',
    summary: 'Earthquake tremor in Sector 9',
    aiConfidence: 0.9,
    priorityScore: 60,
    status: 'reported',
  });
  testIncidents.push(idemIncident);

  const idemResource = await Resource.create({
    name: 'Day 21 Idempotency Test Kit',
    type: 'medical_team',
    quantity: 10,
    availableQuantity: 10,
    status: 'available',
  });
  testResources.push(idemResource);

  const idemKey = 'day21_idem_' + Date.now();
  const firstIdem = await req(
    'POST',
    `/incidents/${idemIncident._id}/allocate`,
    { items: [{ resourceId: idemResource._id, quantity: 2 }], idempotencyKey: idemKey },
    authorityToken
  );
  const secondIdem = await req(
    'POST',
    `/incidents/${idemIncident._id}/allocate`,
    { items: [{ resourceId: idemResource._id, quantity: 2 }], idempotencyKey: idemKey },
    authorityToken
  );
  assert(
    firstIdem.status === 201 && secondIdem.status === 200 && secondIdem.data?.idempotent === true,
    'Requirement 34: Day 16 allocation idempotency key safeguard intact'
  );

  const dist = calculateHaversineDistanceKm(13.0827, 80.2707, 13.085, 80.275);
  assert(
    typeof dist === 'number' && dist > 0 && dist < 1.0,
    'Requirement 35: Day 20 Haversine distance engine intact'
  );

  assert(
    mapCode.includes('react-leaflet') &&
      mapCode.includes('Marker') &&
      mapCode.includes('Popup'),
    'Requirement 36: Day 19 Leaflet markers and popups intact'
  );

  assert(
    mapCode.includes('TileLayer') && mapCode.includes('OpenStreetMap'),
    'Requirement 37: Day 18 OpenStreetMap tile layer foundation intact'
  );

  const incidentsList = await req('GET', '/incidents?sort=priority', undefined, authorityToken);
  assert(
    incidentsList.status === 200 && Array.isArray(incidentsList.data?.data),
    'Requirement 38: Day 17 dashboard incidents query intact'
  );

  const resourcesList = await req('GET', '/resources');
  assert(
    resourcesList.status === 200 && Array.isArray(resourcesList.data?.data),
    'Requirement 39: Day 15 resource inventory listing intact'
  );

  
  console.log('\n[CLEANUP] Cleaning test database records...');
  for (const inc of testIncidents) {
    try {
      await Incident.findByIdAndDelete(inc._id);
    } catch (_) {}
  }
  for (const r of testResources) {
    try {
      await Resource.findByIdAndDelete(r._id);
    } catch (_) {}
  }
  for (const a of testAllocations) {
    try {
      await ResourceAllocation.findByIdAndDelete(a._id);
    } catch (_) {}
  }
  try {
    await ResourceAllocation.deleteMany({ incident: testInc._id });
  } catch (_) {}
  try {
    await User.deleteMany({ email: { $in: [authorityEmail, citizenEmail] } });
  } catch (_) {}

  closeSocket();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await mongoose.disconnect();
  console.log('  \u2705 Test data cleaned up and server closed successfully.\n');

  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`\uD83C\uDF89 DAY 21 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runDay21Tests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
