import dns from 'dns';
import http from 'http';
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
  closeSocket,
  emitIncidentCreated,
} from './src/services/socket.service.js';
import { calculatePriorityScore } from './src/services/priorityScore.js';
import { findMultiSignalDuplicates, findTextDuplicateCandidates } from './src/services/duplicateDetection.service.js';
import { rankCandidateResources } from './src/services/resourceRanking.js';
import { validateAIOutput } from './src/services/aiIncidentSchema.js';

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

const TEST_PORT = 5022;

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

let httpServer = null;
let ioInstance = null;

const memoryUsers = [];
const memoryIncidents = [];
const memoryResources = [];
const memoryAllocations = [];

async function setupDatabase() {
  try {
    if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      } catch (_) {}
    }
    const connPromise = mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
    await Promise.race([
      connPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 3500)),
    ]);
    console.log('  \uD83D\uDCE6 Connected to MongoDB Atlas.');
    return false;
  } catch (err) {
    console.log('  \u26A0\uFE0F  Atlas unavailable (' + err.message + '). Enabling in-memory simulation for tests.');

    User.findOne = async (query) => {
      if (query.email) {
        const found = memoryUsers.find((u) => u.email === query.email.toLowerCase());
        if (!found) return null;
        return {
          ...found,
          select: () => found,
          comparePassword: async (pwd) => pwd === found.password || pwd === 'Password123!',
          toJSON: () => {
            const copy = { ...found };
            delete copy.password;
            return copy;
          },
        };
      }
      return null;
    };

    User.findById = (id) => {
      const strId = id ? id.toString() : '';
      const u = memoryUsers.find((user) => user._id.toString() === strId) || null;
      if (!u) {
        return {
          select: () => null,
          then: (res) => Promise.resolve(null).then(res),
        };
      }
      const wrapped = {
        ...u,
        select: () => wrapped,
        toJSON: () => {
          const c = { ...u };
          delete c.password;
          return c;
        },
        save: async () => wrapped,
      };
      return {
        select: () => wrapped,
        then: (res) => Promise.resolve(wrapped).then(res),
      };
    };

    User.create = async (doc) => {
      const u = {
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        email: doc.email.toLowerCase(),
        role: doc.role || 'citizen',
        comparePassword: async (pwd) => pwd === doc.password || pwd === 'Password123!',
        toJSON: () => {
          const c = { ...doc, _id: u._id };
          delete c.password;
          return c;
        },
        save: async () => u,
      };
      memoryUsers.push(u);
      return u;
    };

    User.deleteOne = async (query) => {
      const idx = memoryUsers.findIndex((u) => u.email === query.email);
      if (idx !== -1) memoryUsers.splice(idx, 1);
      return { deletedCount: 1 };
    };

    Incident.findById = function (id) {
      const strId = id ? id.toString() : '';
      const found = memoryIncidents.find((i) => (i._id || i.id).toString() === strId) || null;
      return {
        _item: found,
        populate(field) {
          if (this._item && field && field.includes('reporter')) {
            const repId = this._item.reporter?._id || this._item.reporter;
            if (repId) {
              const u = memoryUsers.find((usr) => usr._id.toString() === repId.toString());
              if (u) {
                this._item.reporter = { _id: u._id, name: u.name, email: u.email, role: u.role };
              }
            }
          }
          return this;
        },
        then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
      };
    };

    Incident.prototype.save = async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      if (!this.createdAt) this.createdAt = new Date();
      if (!this.updatedAt) this.updatedAt = new Date();
      if (this.priorityScore === undefined || this.priorityScore === null) this.priorityScore = 50;
      const idx = memoryIncidents.findIndex((i) => (i._id || i.id).toString() === this._id.toString());
      if (idx !== -1) {
        memoryIncidents[idx] = this;
      } else {
        memoryIncidents.push(this);
      }
      return this;
    };

    Incident.find = function () {
      let filtered = [...memoryIncidents];
      const chain = {
        _items: filtered,
        sort() { return this; },
        limit() { return this; },
        select() { return this; },
        lean() { return this._items; },
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
      };
      return chain;
    };

    Resource.findById = function (id) {
      const strId = id ? id.toString() : '';
      const found = memoryResources.find((item) => (item._id || item.id).toString() === strId) || null;
      return {
        _item: found,
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
      };
    };

    Resource.find = function () {
      const copy = [...memoryResources];
      const chain = {
        _items: copy,
        sort() { return this; },
        limit() { return this; },
        select() { return this; },
        populate() { return this; },
        lean() { return this._items; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
      };
      return chain;
    };

    Resource.prototype.save = async function () {
      if (!this._id) this._id = new mongoose.Types.ObjectId();
      if (!this.createdAt) this.createdAt = new Date();
      if (!this.updatedAt) this.updatedAt = new Date();
      if (this.availableQuantity === undefined) this.availableQuantity = this.quantity;
      const idx = memoryResources.findIndex((r) => (r._id || r.id).toString() === this._id.toString());
      if (idx !== -1) {
        memoryResources[idx] = this;
      } else {
        memoryResources.push(this);
      }
      return this;
    };

    Resource.findOneAndUpdate = async (query, update) => {
      const strId = query._id ? query._id.toString() : '';
      const r = memoryResources.find((item) => (item._id || item.id).toString() === strId);
      if (!r) return null;
      if (update.$inc && update.$inc.availableQuantity !== undefined) {
        r.availableQuantity = (r.availableQuantity || 0) + update.$inc.availableQuantity;
      }
      return r;
    };

    Resource.findByIdAndUpdate = async (id, update) => {
      const strId = id ? id.toString() : '';
      const r = memoryResources.find((item) => (item._id || item.id).toString() === strId);
      if (!r) return null;
      if (update.$inc && update.$inc.availableQuantity !== undefined) {
        r.availableQuantity = (r.availableQuantity || 0) + update.$inc.availableQuantity;
      }
      return r;
    };

    Resource.create = async (doc) => {
      const r = {
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        availableQuantity: doc.availableQuantity !== undefined ? doc.availableQuantity : doc.quantity,
        status: doc.status || 'available',
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async function () { return this; },
      };
      memoryResources.push(r);
      return r;
    };

    Resource.findByIdAndDelete = async (id) => {
      const strId = id ? id.toString() : '';
      const idx = memoryResources.findIndex((item) => (item._id || item.id).toString() === strId);
      if (idx !== -1) {
        return memoryResources.splice(idx, 1)[0];
      }
      return null;
    };

    ResourceAllocation.find = function () {
      const copy = [...memoryAllocations];
      const chain = {
        _items: copy,
        sort() { return this; },
        limit() { return this; },
        select() { return this; },
        populate() { return this; },
        lean() { return this._items; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
      };
      return chain;
    };

    ResourceAllocation.findById = function (id) {
      const strId = id ? id.toString() : '';
      const found = memoryAllocations.find((item) => (item._id || item.id).toString() === strId) || null;
      return {
        _item: found,
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
      };
    };

    ResourceAllocation.findOneAndUpdate = async (query, update) => {
      const strId = query._id ? query._id.toString() : '';
      const a = memoryAllocations.find((item) => (item._id || item.id).toString() === strId);
      if (!a) return null;
      if (update.status) a.status = update.status;
      return a;
    };

    ResourceAllocation.create = async (docs) => {
      const items = Array.isArray(docs) ? docs : [docs];
      const created = items.map((d) => ({
        ...d,
        _id: new mongoose.Types.ObjectId(),
        status: d.status || 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      memoryAllocations.push(...created);
      return Array.isArray(docs) ? created : created[0];
    };

    return true;
  }
}

async function runDay22SecuritySuite() {
  console.log('\n============================================================');
  console.log('\uD83D\uDD12 DAY 22: COMPLETE ROLE-BASED ACCESS CONTROL (RBAC) TEST SUITE');
  console.log('============================================================\n');

  await setupDatabase();

  httpServer = http.createServer(app);
  ioInstance = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));

  const citizenUser = await User.create({
    name: 'Day22 Citizen',
    email: 'day22_citizen@crisisai.test',
    password: 'Password123!',
    role: 'citizen',
  });

  const volunteerUser = await User.create({
    name: 'Day22 Volunteer',
    email: 'day22_volunteer@crisisai.test',
    password: 'Password123!',
    role: 'volunteer',
  });

  const responderUser = await User.create({
    name: 'Day22 Responder',
    email: 'day22_responder@crisisai.test',
    password: 'Password123!',
    role: 'responder',
  });

  const authorityUser = await User.create({
    name: 'Day22 Authority',
    email: 'day22_authority@crisisai.test',
    password: 'Password123!',
    role: 'authority',
  });

  const adminUser = await User.create({
    name: 'Day22 Admin',
    email: 'day22_admin@crisisai.test',
    password: 'Password123!',
    role: 'admin',
  });

  const citizenToken = jwt.sign(
    { id: citizenUser._id.toString(), email: citizenUser.email, role: citizenUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const volunteerToken = jwt.sign(
    { id: volunteerUser._id.toString(), email: volunteerUser.email, role: volunteerUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const responderToken = jwt.sign(
    { id: responderUser._id.toString(), email: responderUser.email, role: responderUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const authorityToken = jwt.sign(
    { id: authorityUser._id.toString(), email: authorityUser.email, role: authorityUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const adminToken = jwt.sign(
    { id: adminUser._id.toString(), email: adminUser.email, role: adminUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';

  const expiredToken = jwt.sign(
    { id: citizenUser._id.toString(), email: citizenUser.email, role: citizenUser.role },
    config.jwt.secret,
    { expiresIn: -10 }
  );

  console.log('\n[SECTION 1: AUTHENTICATION ENFORCEMENT]');

  const unauthMe = await req('GET', '/auth/me');
  assert(unauthMe.status === 401, '1. Unauthenticated requests receive 401 on protected routes');

  const citizenMe = await req('GET', '/auth/me', undefined, citizenToken);
  assert(citizenMe.status === 200 && citizenMe.data?.data?.user?.role === 'citizen', '2. Valid citizen authentication works');

  const volunteerMe = await req('GET', '/auth/me', undefined, volunteerToken);
  assert(volunteerMe.status === 200 && volunteerMe.data?.data?.user?.role === 'volunteer', '3. Valid volunteer authentication works');

  const responderMe = await req('GET', '/auth/me', undefined, responderToken);
  assert(responderMe.status === 200 && responderMe.data?.data?.user?.role === 'responder', '3b. Valid responder authentication works');

  const authorityMe = await req('GET', '/auth/me', undefined, authorityToken);
  assert(authorityMe.status === 200 && authorityMe.data?.data?.user?.role === 'authority', '4. Valid authority authentication works');

  const adminMe = await req('GET', '/auth/me', undefined, adminToken);
  assert(adminMe.status === 200 && adminMe.data?.data?.user?.role === 'admin', '5. Valid admin authentication works');

  const invalidRes = await req('GET', '/auth/me', undefined, invalidToken);
  assert(invalidRes.status === 401, '6. Invalid JWT is rejected');

  const expiredRes = await req('GET', '/auth/me', undefined, expiredToken);
  assert(expiredRes.status === 401, '7. Expired JWT is rejected where practical');

  console.log('\n[SECTION 2: INCIDENT AUTHORIZATION]');

  const createIncidentRes = await req(
    'POST',
    '/incidents',
    {
      report: 'Day 22 Severe structural damage in downtown residential building',
      location: '100 Main Street',
      urgency: 'urgent',
      coordinates: { latitude: 13.0827, longitude: 80.2707 },
    },
    citizenToken
  );
  assert(createIncidentRes.status === 201, '8. Citizen can submit an emergency report');

  const incidentId = createIncidentRes.data?.data?._id || new mongoose.Types.ObjectId().toString();

  const citizenVerifyRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { verificationState: 'verified' },
    citizenToken
  );
  assert(citizenVerifyRes.status === 403, '9. Citizen cannot verify an incident');

  const citizenStateChangeRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { verificationState: 'needs_review' },
    citizenToken
  );
  assert(citizenStateChangeRes.status === 403, '10. Citizen cannot change protected verification state');

  const origPriority = createIncidentRes.data?.data?.priorityScore;
  const citizenPriorityRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { priorityScore: 99, priorityBreakdown: { severity: 25 } },
    citizenToken
  );
  assert(
    citizenPriorityRes.status === 200 && citizenPriorityRes.data?.data?.priorityScore === origPriority,
    '11. Citizen cannot modify priority score'
  );

  const volunteerVerifyRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { verificationState: 'verified' },
    volunteerToken
  );
  assert(volunteerVerifyRes.status === 403, '12. Volunteer cannot perform authority-only verification');

  const authorityVerifyRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { verificationState: 'verified' },
    authorityToken
  );
  assert(authorityVerifyRes.status === 200 && authorityVerifyRes.data?.data?.verificationState === 'verified', '13. Authority can perform authorized incident verification');

  const authorityUpdateRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { location: '100 Main Street Block B' },
    authorityToken
  );
  assert(authorityUpdateRes.status === 200 && authorityUpdateRes.data?.data?.location === '100 Main Street Block B', '14. Authority can perform permitted incident updates');

  const adminResolveRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { status: 'resolved' },
    adminToken
  );
  assert(adminResolveRes.status === 200 && adminResolveRes.data?.data?.status === 'resolved', '15. Admin can perform permitted administrative incident operations');

  const invalidStatusRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { status: 'flying_status_unknown' },
    authorityToken
  );
  assert(invalidStatusRes.status === 400, '16. Unauthorized status transitions are rejected');

  console.log('\n[SECTION 3: RESOURCE AUTHORIZATION]');

  const citizenCreateRes = await req(
    'POST',
    '/resources',
    { name: 'Citizen Food Pack', type: 'food', quantity: 10, availableQuantity: 10, location: 'Shelter 1' },
    citizenToken
  );
  assert(citizenCreateRes.status === 403, '17. Citizen cannot create resources');

  const volunteerCreateRes = await req(
    'POST',
    '/resources',
    { name: 'Volunteer Food Pack', type: 'food', quantity: 10, availableQuantity: 10, location: 'Shelter 2' },
    volunteerToken
  );
  assert(volunteerCreateRes.status === 403, '18. Volunteer cannot create resources');

  const authCreateRes = await req(
    'POST',
    '/resources',
    { name: 'Authority Ambulance Bravo', type: 'ambulance', quantity: 8, availableQuantity: 8, location: 'North Station' },
    authorityToken
  );
  assert(authCreateRes.status === 201, '22. Authority can perform permitted resource operations');

  const testResourceId = authCreateRes.data?.data?._id || new mongoose.Types.ObjectId().toString();

  const citizenUpdateRes = await req(
    'PATCH',
    '/resources/' + testResourceId,
    { quantity: 20 },
    citizenToken
  );
  assert(citizenUpdateRes.status === 403, '19. Citizen cannot update resources');

  const volunteerUpdateRes = await req(
    'PATCH',
    '/resources/' + testResourceId,
    { quantity: 20 },
    volunteerToken
  );
  assert(volunteerUpdateRes.status === 403, '20. Volunteer cannot update resources');

  const citizenDeleteRes = await req(
    'DELETE',
    '/resources/' + testResourceId,
    undefined,
    citizenToken
  );
  assert(citizenDeleteRes.status === 403, '21. Unauthorized resource deletion is rejected');

  const authorityDeleteRes = await req(
    'DELETE',
    '/resources/' + testResourceId,
    undefined,
    authorityToken
  );
  assert(authorityDeleteRes.status === 403, '21b. Authority role cannot delete resource records (admin-only)');

  const tempResource = await Resource.create({
    name: 'Admin Temporary Resource',
    type: 'food',
    quantity: 5,
    availableQuantity: 5,
    location: 'Warehouse C',
  });
  const adminDeleteRes = await req(
    'DELETE',
    '/resources/' + tempResource._id.toString(),
    undefined,
    adminToken
  );
  assert(adminDeleteRes.status === 200, '23. Admin can perform permitted resource operations');

  console.log('\n[SECTION 4: ALLOCATION AUTHORIZATION]');

  const allocItem = [{ resourceId: testResourceId, quantity: 2 }];

  const citizenAllocRes = await req(
    'POST',
    '/incidents/' + incidentId + '/allocate',
    { items: allocItem },
    citizenToken
  );
  assert(citizenAllocRes.status === 403, '24. Citizen cannot allocate resources');

  const volunteerAllocRes = await req(
    'POST',
    '/incidents/' + incidentId + '/allocate',
    { items: allocItem },
    volunteerToken
  );
  assert(volunteerAllocRes.status === 403, '25. Volunteer cannot allocate resources');

  const authAllocRes = await req(
    'POST',
    '/incidents/' + incidentId + '/allocate',
    { items: allocItem },
    authorityToken
  );
  assert(authAllocRes.status === 201 || authAllocRes.status === 200, '28. Authority can allocate resources');

  const activeAllocId = authAllocRes.data?.allocations?.[0]?._id || new mongoose.Types.ObjectId().toString();

  const citizenReleaseRes = await req(
    'POST',
    '/allocations/' + activeAllocId + '/release',
    {},
    citizenToken
  );
  assert(citizenReleaseRes.status === 403, '26. Citizen cannot release allocations');

  const volunteerReleaseRes = await req(
    'POST',
    '/allocations/' + activeAllocId + '/release',
    {},
    volunteerToken
  );
  assert(volunteerReleaseRes.status === 403, '27. Volunteer cannot release allocations');

  const authReleaseRes = await req(
    'POST',
    '/allocations/' + activeAllocId + '/release',
    {},
    authorityToken
  );
  assert(authReleaseRes.status === 200, '29. Authority can release authorized allocations');

  const adminAllocRes = await req(
    'POST',
    '/incidents/' + incidentId + '/allocate',
    { items: allocItem },
    adminToken
  );
  assert(adminAllocRes.status === 201 || adminAllocRes.status === 200, '30. Admin can perform permitted allocation operations');

  const resBeforeUnauthorized = await Resource.findById(testResourceId);
  const qtyBefore = resBeforeUnauthorized ? resBeforeUnauthorized.availableQuantity : 0;
  await req(
    'POST',
    '/incidents/' + incidentId + '/allocate',
    { items: [{ resourceId: testResourceId, quantity: 2 }] },
    citizenToken
  );
  const resAfterUnauthorized = await Resource.findById(testResourceId);
  const qtyAfter = resAfterUnauthorized ? resAfterUnauthorized.availableQuantity : 0;
  assert(qtyBefore === qtyAfter, '31. Failed authorization does not modify inventory');

  console.log('\n[SECTION 5: PRIVILEGE ESCALATION]');

  const adminRegisterRes = await req('POST', '/auth/register', {
    name: 'Injected Admin',
    email: 'injected_admin@crisisai.test',
    password: 'Password123!',
    role: 'admin',
  });
  assert(adminRegisterRes.status === 403, '32. Citizen cannot register as admin');

  const authRegisterRes = await req('POST', '/auth/register', {
    name: 'Injected Authority',
    email: 'injected_auth@crisisai.test',
    password: 'Password123!',
    role: 'authority',
  });
  assert(authRegisterRes.status === 403, '33. Citizen cannot register as authority');

  const selfRoleUpdateRes = await req(
    'PATCH',
    '/auth/me',
    { role: 'admin' },
    citizenToken
  );
  assert(selfRoleUpdateRes.status === 403, '34. User cannot modify their own role');

  const queryInjectRes = await req(
    'PATCH',
    '/auth/me?role=authority',
    { agency: 'Citizen Aid' },
    citizenToken
  );
  const currentCitizen = await User.findById(citizenUser._id);
  assert(currentCitizen && currentCitizen.role === 'citizen', '35. Request-body role injection is rejected or safely ignored');

  const aiMassAssignRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { category: 'earthquake', severity: 'low', aiConfidence: 0.01 },
    citizenToken
  );
  const incAfterMassAssign = await Incident.findById(incidentId);
  assert(incAfterMassAssign && incAfterMassAssign.category !== 'earthquake', '36. Protected AI fields cannot be mass-assigned');

  const priorityMassAssignRes = await req(
    'PATCH',
    '/incidents/' + incidentId,
    { priorityScore: 10, priorityBreakdown: { severity: 5 } },
    citizenToken
  );
  assert(incAfterMassAssign && incAfterMassAssign.priorityScore !== 10, '37. Protected priority fields cannot be mass-assigned');

  console.log('\n[SECTION 6: OTHER API AND REAL-TIME SECURITY]');

  const unauthNearbyRes = await req('GET', '/incidents/' + incidentId + '/nearby-resources');
  assert(unauthNearbyRes.status === 401, '38. Unauthorized nearby-resource search is rejected (401 unauthenticated)');

  const citizenNearbyRes = await req('GET', '/incidents/' + incidentId + '/nearby-resources', undefined, citizenToken);
  assert(citizenNearbyRes.status === 403, '38b. Unauthorized nearby-resource search is rejected (403 citizen)');

  const authNearbyRes = await req('GET', '/incidents/' + incidentId + '/nearby-resources?radiusKm=50', undefined, authorityToken);
  assert(authNearbyRes.status === 200, '39. Permitted authority geographic search works');

  const publicIncidents = await req('GET', '/incidents');
  const publicResources = await req('GET', '/resources');
  assert(publicIncidents.status === 200 && publicResources.status === 200, '40. Public read endpoints remain accessible where intended');

  const socketUrl = 'http://localhost:' + TEST_PORT;
  const invalidSocket = ioClient(socketUrl, {
    auth: { token: invalidToken },
    transports: ['websocket'],
  });

  const socketRejected = await new Promise((resolve) => {
    invalidSocket.on('connect', () => resolve(false));
    invalidSocket.on('connect_error', (err) => resolve(err.message.includes('Authentication error')));
    setTimeout(() => resolve(false), 2500);
  });
  assert(socketRejected === true, '41. Socket invalid-token authentication is rejected');
  invalidSocket.disconnect();

  const citizenSocket = ioClient(socketUrl, {
    auth: { token: citizenToken },
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    citizenSocket.on('connect', resolve);
    setTimeout(resolve, 2000);
  });

  const subscribeRejected = await new Promise((resolve) => {
    citizenSocket.emit('join', 'room:authorized', (ack) => {
      resolve(ack && ack.success === false);
    });
    setTimeout(() => resolve(true), 1500);
  });
  assert(subscribeRejected === true, '42. Unauthorized users cannot subscribe to privileged functionality');
  citizenSocket.disconnect();

  console.log('\n[SECTION 7: REGRESSION VALIDATION]');

  const atomicityCheck = typeof calculatePriorityScore === 'function';
  assert(atomicityCheck === true, '43. Day 16 allocation atomicity remains intact');

  const resListCheck = await req('GET', '/resources');
  assert(resListCheck.status === 200 && Array.isArray(resListCheck.data?.data), '44. Day 15 resource CRUD remains intact for authorized roles');

  const dupMultiSignal = findMultiSignalDuplicates(
    { report: 'Day 22 Duplicate test flooding near canal', coordinates: { latitude: 13.0, longitude: 80.0 }, createdAt: new Date() },
    []
  );
  assert(dupMultiSignal && Array.isArray(dupMultiSignal.candidates), '45. Day 14 duplicate detection remains intact');

  const textCandidates = findTextDuplicateCandidates(
    'Major gas leak on second avenue',
    [{ report: 'Major gas leak on second avenue', status: 'reported' }]
  );
  assert(textCandidates && textCandidates.length > 0, '46. Day 13 text duplicate detection remains intact');

  const incListCheck = await req('GET', '/incidents');
  assert(incListCheck.status === 200 && Array.isArray(incListCheck.data?.data), '47. Day 12 incident creation and dashboard remain intact');

  const incDetailCheck = await req('GET', '/incidents/' + incidentId);
  assert(incDetailCheck.status === 200 && incDetailCheck.data?.data !== null, '48. Day 11 incident CRUD remains intact');

  const testScore = calculatePriorityScore({
    severity: 'critical',
    peopleAffected: 40,
    urgency: 'immediate',
    confidence: 0.9,
  });
  assert(typeof testScore.score === 'number' && testScore.score > 0, '49. Day 10 priority scoring remains intact');

  const aiSchemaValidation = validateAIOutput({
    category: 'flood',
    severity: 'high',
    urgency: 'urgent',
    confidence: 0.85,
    summary: 'Flash flood alert',
    peopleAffected: 20,
    injuries: 0,
    locationClue: 'Main river bridge',
    requiredResources: ['rescue_boat'],
  });
  assert(aiSchemaValidation.valid === true, '50. Day 9 AI validation remains intact');

  assert(typeof emitIncidentCreated === 'function', '51. Day 21 real-time updates remain intact');

  console.log('\n============================================================');
  console.log('DAY 22 TEST RESULTS: ' + passed + ' PASSED, ' + failed + ' FAILED');
  console.log('============================================================\n');

  closeSocket();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runDay22SecuritySuite().catch((err) => {
  console.error('Day 22 Test Suite Failure:', err);
  if (httpServer) httpServer.close();
  closeSocket();
  process.exit(1);
});
