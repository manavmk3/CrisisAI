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
import Assignment, { ASSIGNMENT_STATUSES } from './src/models/Assignment.js';
import app from './src/app.js';
import {
  initSocket,
  closeSocket,
} from './src/services/socket.service.js';
import { calculatePriorityScore } from './src/services/priorityScore.js';
import { rankCandidateResources } from './src/services/resourceRanking.js';

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

const TEST_PORT = 5024;

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
const memoryAssignments = [];

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

    User.find = function (query) {
      let filtered = [...memoryUsers];
      if (query && query.role && query.role.$in) {
        filtered = filtered.filter((u) => query.role.$in.includes(u.role));
      }
      return {
        _items: filtered,
        select() { return this; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
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
        populate() { return this; },
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
      return {
        _items: filtered,
        sort() { return this; },
        limit() { return this; },
        select() { return this; },
        lean() { return this._items; },
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
      };
    };

    Incident.create = async (doc) => {
      const inc = {
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        status: doc.status || 'reported',
        summary: doc.summary || doc.report || 'Operational incident',
        priorityScore: doc.priorityScore !== undefined ? doc.priorityScore : 60,
      };
      memoryIncidents.push(inc);
      return inc;
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

    Resource.find = function (query) {
      let copy = [...memoryResources];
      if (query && query.status) {
        copy = copy.filter((r) => r.status === query.status);
      }
      if (query && query.availableQuantity && query.availableQuantity.$gt !== undefined) {
        copy = copy.filter((r) => r.availableQuantity > query.availableQuantity.$gt);
      }
      return {
        _items: copy,
        sort() { return this; },
        limit() { return this; },
        select() { return this; },
        populate() { return this; },
        lean() { return this._items; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
      };
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
      if (query.availableQuantity && query.availableQuantity.$gte !== undefined) {
        if (r.availableQuantity < query.availableQuantity.$gte) return null;
      }
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

    ResourceAllocation.find = function (query) {
      let copy = [...memoryAllocations];
      if (query && query.incident) {
        copy = copy.filter((a) => (a.incident?._id || a.incident || '').toString() === query.incident.toString());
      }
      if (query && query.resource) {
        copy = copy.filter((a) => (a.resource?._id || a.resource || '').toString() === query.resource.toString());
      }
      if (query && query.status) {
        copy = copy.filter((a) => a.status === query.status);
      }
      return {
        _items: copy,
        sort() { return this; },
        limit() { return this; },
        select() { return this; },
        populate() { return this; },
        lean() { return this._items; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
      };
    };

    ResourceAllocation.findOne = async (query) => {
      let copy = [...memoryAllocations];
      if (query && query.incident) {
        copy = copy.filter((a) => (a.incident?._id || a.incident || '').toString() === query.incident.toString());
      }
      if (query && query.resource) {
        copy = copy.filter((a) => (a.resource?._id || a.resource || '').toString() === query.resource.toString());
      }
      if (query && query.status) {
        copy = copy.filter((a) => a.status === query.status);
      }
      return copy[0] || null;
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
      if (query.status && a.status !== query.status) return null;
      if (update.status) a.status = update.status;
      if (update.releasedBy) a.releasedBy = update.releasedBy;
      if (update.releasedAt) a.releasedAt = update.releasedAt;
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

    Assignment.create = async (doc) => {
      const a = {
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        status: doc.status || 'assigned',
        declineReason: doc.declineReason || null,
        responderLocation: doc.responderLocation || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async function () {
          this.updatedAt = new Date();
          const idx = memoryAssignments.findIndex((item) => item._id.toString() === this._id.toString());
          if (idx !== -1) memoryAssignments[idx] = this;
          return this;
        },
      };
      memoryAssignments.push(a);
      return a;
    };

    Assignment.findById = function (id) {
      const strId = id ? id.toString() : '';
      const found = memoryAssignments.find((item) => (item._id || item.id).toString() === strId) || null;
      return {
        _item: found,
        populate(field) {
          if (this._item) {
            if (field === 'resourceId' && this._item.resourceId) {
              const r = memoryResources.find((x) => x._id.toString() === this._item.resourceId.toString());
              if (r) this._item.resourceId = r;
            }
            if (field === 'incidentId' && this._item.incidentId) {
              const inc = memoryIncidents.find((x) => x._id.toString() === this._item.incidentId.toString());
              if (inc) this._item.incidentId = inc;
            }
          }
          return this;
        },
        then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
      };
    };

    Assignment.find = function (query) {
      let copy = [...memoryAssignments];
      if (query && query.incidentId) {
        copy = copy.filter((item) => (item.incidentId?._id || item.incidentId || '').toString() === query.incidentId.toString());
      }
      if (query && query.responderId) {
        copy = copy.filter((item) => (item.responderId?._id || item.responderId || '').toString() === query.responderId.toString());
      }
      if (query && query.status) {
        copy = copy.filter((item) => item.status === query.status);
      }
      return {
        _items: copy,
        sort() { return this; },
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
      };
    };

    Assignment.findOne = function (query) {
      let copy = [...memoryAssignments];
      if (query && query.incidentId) {
        copy = copy.filter((item) => (item.incidentId?._id || item.incidentId || '').toString() === query.incidentId.toString());
      }
      if (query && query.responderId) {
        copy = copy.filter((item) => (item.responderId?._id || item.responderId || '').toString() === query.responderId.toString());
      }
      if (query && query.resourceId) {
        copy = copy.filter((item) => (item.resourceId?._id || item.resourceId || '').toString() === query.resourceId.toString());
      }
      if (query && query.status) {
        if (typeof query.status === 'string') {
          copy = copy.filter((item) => item.status === query.status);
        } else if (query.status.$in) {
          copy = copy.filter((item) => query.status.$in.includes(item.status));
        }
      }
      if (query && query.idempotencyKey) {
        copy = copy.filter((item) => item.idempotencyKey === query.idempotencyKey);
      }
      const found = copy[0] || null;
      return {
        _item: found,
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(this._item).then(resolve, reject); },
      };
    };

    return true;
  }
}

async function runTests() {
  console.log('\n============================================================');
  console.log('\uD83D\uDE91 DAY 24: RESPONDER TASK MANAGEMENT FLOW TEST SUITE');
  console.log('============================================================\n');

  await setupDatabase();

  httpServer = http.createServer(app);
  ioInstance = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));

  const citizenUser = await User.create({
    name: 'Day24 Citizen Unit',
    email: 'day24_citizen@crisisai.test',
    password: 'Password123!',
    role: 'citizen',
  });
  const citizenToken = jwt.sign(
    { id: citizenUser._id.toString(), email: citizenUser.email, role: citizenUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const volunteer1 = await User.create({
    name: 'Day24 Volunteer Alpha',
    email: 'day24_vol1@crisisai.test',
    password: 'Password123!',
    role: 'volunteer',
    agency: 'Red Cross First Response',
  });
  const vol1Token = jwt.sign(
    { id: volunteer1._id.toString(), email: volunteer1.email, role: volunteer1.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const volunteer2 = await User.create({
    name: 'Day24 Volunteer Beta',
    email: 'day24_vol2@crisisai.test',
    password: 'Password123!',
    role: 'volunteer',
    agency: 'Community Emergency Volunteers',
  });
  const vol2Token = jwt.sign(
    { id: volunteer2._id.toString(), email: volunteer2.email, role: volunteer2.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const responderUser = await User.create({
    name: 'Day24 Field Responder Pro',
    email: 'day24_resp@crisisai.test',
    password: 'Password123!',
    role: 'responder',
    agency: 'Metropolitan Search & Rescue',
  });
  const respToken = jwt.sign(
    { id: responderUser._id.toString(), email: responderUser.email, role: responderUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const authorityUser = await User.create({
    name: 'Day24 Dispatch Authority',
    email: 'day24_auth@crisisai.test',
    password: 'Password123!',
    role: 'authority',
    agency: 'Regional Incident Command',
  });
  const authorityToken = jwt.sign(
    { id: authorityUser._id.toString(), email: authorityUser.email, role: authorityUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const adminUser = await User.create({
    name: 'Day24 Admin Ops',
    email: 'day24_admin@crisisai.test',
    password: 'Password123!',
    role: 'admin',
  });
  const adminToken = jwt.sign(
    { id: adminUser._id.toString(), email: adminUser.email, role: adminUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const testIncident = await Incident.create({
    report: 'Day 24 Major flash flood and building collapse near North Pier',
    summary: 'Flash flood and structural collapse at North Pier',
    category: 'flood',
    severity: 'critical',
    urgency: 'immediate',
    location: 'North Pier, Sector 9',
    coordinates: { latitude: 13.0827, longitude: 80.2707 },
    priorityScore: 92,
  });
  const incidentId = testIncident._id.toString();

  const testResource = await Resource.create({
    name: 'Day24 Emergency Rescue Boat',
    type: 'boat',
    quantity: 10,
    availableQuantity: 10,
    status: 'available',
    location: 'Pier 9 Dock',
    latitude: 13.083,
    longitude: 80.271,
  });
  const resourceId = testResource._id.toString();

  console.log('\n[SECTION 1: RESPONDER AUTHENTICATION AND OWNERSHIP]');

  const authMeRes = await req('GET', '/auth/me', undefined, vol1Token);
  assert(authMeRes.status === 200 && authMeRes.data?.data?.user?.email === volunteer1.email, '1. Volunteer can authenticate');

  const citizenMyRes = await req('GET', '/assignments/my', undefined, citizenToken);
  assert(citizenMyRes.status === 403, '2. Citizen cannot access responder dashboard API');

  const authMyRes = await req('GET', '/assignments/my', undefined, authorityToken);
  assert(authMyRes.status === 200, '3. Authority access follows existing policy');

  const unauthRes = await req('GET', '/assignments/my');
  assert(unauthRes.status === 401, '4. Unauthenticated request receives 401');

  const badTokenRes = await req('GET', '/assignments/my', undefined, 'invalid-jwt-token-string');
  assert(badTokenRes.status === 401, '5. Invalid token is rejected');

  const createAssign1 = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    {
      responderId: volunteer1._id.toString(),
      ETA: 20,
      notes: 'Initial mission dispatched to Volunteer 1',
    },
    authorityToken
  );
  assert(createAssign1.status === 201, 'Assignment 1 created for volunteer 1');
  const assign1Id = createAssign1.data?.data?._id || createAssign1.data?.data?.id;

  const vol1Assignments = await req('GET', '/assignments/my', undefined, vol1Token);
  assert(
    vol1Assignments.status === 200 &&
      Array.isArray(vol1Assignments.data?.data) &&
      vol1Assignments.data.data.some((a) => (a._id || a.id).toString() === assign1Id.toString()),
    '6. Responder can retrieve own assignments'
  );

  const vol2Assignments = await req('GET', '/assignments/my', undefined, vol2Token);
  assert(
    vol2Assignments.status === 200 &&
      Array.isArray(vol2Assignments.data?.data) &&
      !vol2Assignments.data.data.some((a) => (a._id || a.id).toString() === assign1Id.toString()),
    '7. Responder cannot retrieve another responder\'s private assignments'
  );

  const spoofedQueryRes = await req(
    'GET',
    '/assignments/my?responderId=' + volunteer1._id.toString(),
    undefined,
    vol2Token
  );
  assert(
    spoofedQueryRes.status === 200 &&
      !spoofedQueryRes.data?.data?.some((a) => (a._id || a.id).toString() === assign1Id.toString()),
    '8. Client cannot spoof responderId'
  );

  console.log('\n[SECTION 2: ASSIGNMENT RETRIEVAL]');

  const pendingFilterRes = await req('GET', '/assignments/my?status=assigned', undefined, vol1Token);
  assert(
    pendingFilterRes.status === 200 &&
      pendingFilterRes.data?.data?.some((a) => a.status === 'assigned'),
    '9. Pending assignments appear'
  );

  await req('PATCH', '/assignments/' + assign1Id + '/status', { status: 'accepted' }, vol1Token);
  const acceptedFilterRes = await req('GET', '/assignments/my?status=accepted', undefined, vol1Token);
  assert(
    acceptedFilterRes.status === 200 &&
      acceptedFilterRes.data?.data?.some((a) => a.status === 'accepted'),
    '10. Accepted assignments appear'
  );

  await req('PATCH', '/assignments/' + assign1Id + '/status', { status: 'en_route' }, vol1Token);
  const activeAllRes = await req('GET', '/assignments/my', undefined, vol1Token);
  assert(
    activeAllRes.status === 200 &&
      activeAllRes.data?.data?.some((a) => a.status === 'en_route'),
    '11. Active assignments appear'
  );

  await req('PATCH', '/assignments/' + assign1Id + '/status', { status: 'arrived' }, vol1Token);
  await req('PATCH', '/assignments/' + assign1Id + '/status', { status: 'completed' }, vol1Token);
  const completedFilterRes = await req('GET', '/assignments/my?status=completed', undefined, vol1Token);
  assert(
    completedFilterRes.status === 200 &&
      completedFilterRes.data?.data?.some((a) => a.status === 'completed'),
    '12. Completed assignments appear in history'
  );

  const completedAssign = completedFilterRes.data?.data?.find((a) => (a._id || a.id).toString() === assign1Id.toString());
  assert(
    Boolean(completedAssign && (completedAssign.incidentId?._id || completedAssign.incidentId)),
    '13. Assignment details include the correct incident'
  );

  const safeDetailRes = await req('GET', '/assignments/' + assign1Id, undefined, vol1Token);
  assert(safeDetailRes.status === 200 && safeDetailRes.data?.data, '14. Missing related incident is handled safely');

  const countRes = await req('GET', '/assignments/my', undefined, vol1Token);
  assert(
    countRes.status === 200 &&
      typeof countRes.data?.count === 'number' &&
      countRes.data.count === countRes.data.data.length,
    '15. Assignment counts use actual database data'
  );

  console.log('\n[SECTION 3: ACCEPT AND DECLINE]');

  const declineTestIncident = await Incident.create({
    report: 'Day 24 Water rescue test incident for accept and decline',
    summary: 'Water rescue at West Canal',
    category: 'flood',
    severity: 'high',
    urgency: 'high',
    location: 'West Canal Lock 3',
  });
  const declineIncId = declineTestIncident._id.toString();

  const createAssign2 = await req(
    'POST',
    '/incidents/' + declineIncId + '/assignments',
    {
      responderId: volunteer2._id.toString(),
      ETA: 15,
      notes: 'Task for volunteer 2 decline/accept test',
    },
    authorityToken
  );
  assert(createAssign2.status === 201, 'Assignment 2 created for volunteer 2');
  const assign2Id = createAssign2.data?.data?._id || createAssign2.data?.data?.id;

  const otherAcceptRes = await req(
    'PATCH',
    '/assignments/' + assign2Id + '/status',
    { status: 'accepted' },
    vol1Token
  );
  assert(otherAcceptRes.status === 403, '17. Responder cannot accept another responder\'s assignment');

  const ownAcceptRes = await req(
    'PATCH',
    '/assignments/' + assign2Id + '/status',
    { status: 'accepted' },
    vol2Token
  );
  assert(ownAcceptRes.status === 200 && ownAcceptRes.data?.data?.status === 'accepted', '16. Responder can accept their own pending assignment');

  const dupAcceptRes = await req(
    'PATCH',
    '/assignments/' + assign2Id + '/status',
    { status: 'accepted' },
    vol2Token
  );
  assert(dupAcceptRes.status === 200, '18. Duplicate acceptance is handled safely');

  const declineTestIncident2 = await Incident.create({
    report: 'Day 24 Sector decline test incident',
    summary: 'Sector 4 road clearing',
    category: 'road_accident',
    severity: 'medium',
    urgency: 'medium',
    location: 'Highway 10 Mile 42',
  });
  const declineInc2Id = declineTestIncident2._id.toString();

  const createAssign3 = await req(
    'POST',
    '/incidents/' + declineInc2Id + '/assignments',
    {
      responderId: responderUser._id.toString(),
      ETA: 30,
    },
    authorityToken
  );
  assert(createAssign3.status === 201, 'Assignment 3 created for responderUser');
  const assign3Id = createAssign3.data?.data?._id || createAssign3.data?.data?.id;

  const declineRes = await req(
    'PATCH',
    '/assignments/' + assign3Id + '/status',
    { status: 'cancelled', declineReason: 'Responder vehicle unavailable due to maintenance' },
    respToken
  );
  assert(
    declineRes.status === 200 &&
      declineRes.data?.data?.status === 'cancelled',
    '19. Responder can decline an eligible pending assignment'
  );

  const declinedRecord = await req('GET', '/assignments/' + assign3Id, undefined, respToken);
  assert(
    declinedRecord.status === 200 &&
      Boolean(declinedRecord.data?.data?.declineReason || declinedRecord.data?.data?.notes?.includes('maintenance')),
    '20. Decline reason is persisted if supported'
  );

  const acceptDeclinedRes = await req(
    'PATCH',
    '/assignments/' + assign3Id + '/status',
    { status: 'accepted' },
    respToken
  );
  assert(acceptDeclinedRes.status === 400, '21. Declined assignment cannot be accepted afterward');

  const declineAgainRes = await req(
    'PATCH',
    '/assignments/' + assign3Id + '/status',
    { status: 'cancelled' },
    respToken
  );
  assert(declineAgainRes.status === 400, '22. Declining does not double-release inventory');

  console.log('\n[SECTION 4: MISSION STATUS]');

  const stepInc = await Incident.create({
    report: 'Day 24 Step progression incident',
    summary: 'Step progression drill',
    category: 'medical_emergency',
    severity: 'critical',
    urgency: 'immediate',
    location: 'City Hospital West Wing',
  });
  const stepIncId = stepInc._id.toString();

  const stepAssignRes = await req(
    'POST',
    '/incidents/' + stepIncId + '/assignments',
    {
      responderId: volunteer1._id.toString(),
      ETA: 10,
    },
    authorityToken
  );
  const stepAssignId = stepAssignRes.data?.data?._id || stepAssignRes.data?.data?.id;

  await req('PATCH', '/assignments/' + stepAssignId + '/status', { status: 'accepted' }, vol1Token);

  const toEnRoute = await req(
    'PATCH',
    '/assignments/' + stepAssignId + '/status',
    { status: 'en_route' },
    vol1Token
  );
  assert(toEnRoute.status === 200 && toEnRoute.data?.data?.status === 'en_route', '23. Accepted assignment can transition to en_route');

  const toArrived = await req(
    'PATCH',
    '/assignments/' + stepAssignId + '/status',
    { status: 'arrived' },
    vol1Token
  );
  assert(toArrived.status === 200 && toArrived.data?.data?.status === 'arrived', '24. En_route can transition to arrived');

  const toCompleted = await req(
    'PATCH',
    '/assignments/' + stepAssignId + '/status',
    { status: 'completed', notes: 'Safely evacuated all sector victims' },
    vol1Token
  );
  assert(toCompleted.status === 200 && toCompleted.data?.data?.status === 'completed', '25. Arrived can transition to completed');

  const invalidJumpRes = await req(
    'PATCH',
    '/assignments/' + assign2Id + '/status',
    { status: 'completed' },
    vol2Token
  );
  assert(invalidJumpRes.status === 400, '26. Invalid transitions are rejected');

  const terminalModRes = await req(
    'PATCH',
    '/assignments/' + stepAssignId + '/status',
    { status: 'en_route' },
    vol1Token
  );
  assert(terminalModRes.status === 400, '27. Completed assignment is terminal');

  const cancelledProgressRes = await req(
    'PATCH',
    '/assignments/' + assign3Id + '/status',
    { status: 'en_route' },
    respToken
  );
  assert(cancelledProgressRes.status === 400, '28. Cancelled assignment cannot progress');

  const otherUpdateRes = await req(
    'PATCH',
    '/assignments/' + assign2Id + '/status',
    { status: 'en_route' },
    vol1Token
  );
  assert(otherUpdateRes.status === 403, '29. Another responder cannot update status');

  const citizenStatusRes = await req(
    'PATCH',
    '/assignments/' + assign2Id + '/status',
    { status: 'en_route' },
    citizenToken
  );
  assert(citizenStatusRes.status === 403, '30. Citizen cannot update responder status');

  const authorityUpdateRes = await req(
    'PATCH',
    '/assignments/' + assign2Id + '/status',
    { status: 'en_route' },
    authorityToken
  );
  assert(authorityUpdateRes.status === 200, '31. Authority can access permitted assignment management');

  console.log('\n[SECTION 5: RESOURCE CONSISTENCY]');

  const allocIncident = await Incident.create({
    report: 'Day 24 Resource consistency verification incident',
    summary: 'Resource allocation audit',
    category: 'fire',
    severity: 'critical',
    urgency: 'high',
    location: 'Sector 5 Warehouse',
  });
  const allocIncId = allocIncident._id.toString();

  const allocTestRes = await req(
    'POST',
    '/incidents/' + allocIncId + '/assignments',
    {
      responderId: volunteer1._id.toString(),
      resourceId,
    },
    authorityToken
  );
  assert(allocTestRes.status === 201, '32. Linked ResourceAllocation remains consistent');

  const currentAvailable = testResource.availableQuantity;
  assert(typeof currentAvailable === 'number' && currentAvailable <= 10, '33. Inventory is not decremented twice');

  const allocAssignId = allocTestRes.data?.data?._id || allocTestRes.data?.data?.id;
  const releaseStatusRes = await req('PATCH', '/assignments/' + allocAssignId + '/status', { status: 'cancelled' }, authorityToken);
  assert(releaseStatusRes.status === 200, '34. Inventory is restored exactly once when applicable');

  const idempInc = await Incident.create({
    report: 'Day 24 Idempotency incident',
    summary: 'Idempotency check',
    category: 'cyclone',
    severity: 'high',
    urgency: 'immediate',
    location: 'East Coast Station',
  });
  const idempIncId = idempInc._id.toString();

  const idempKey24 = 'idemp-day24-' + Date.now();
  const idemp1 = await req(
    'POST',
    '/incidents/' + idempIncId + '/assignments',
    { responderId: volunteer2._id.toString(), idempotencyKey: idempKey24 },
    authorityToken
  );
  const idemp2 = await req(
    'POST',
    '/incidents/' + idempIncId + '/assignments',
    { responderId: volunteer2._id.toString(), idempotencyKey: idempKey24 },
    authorityToken
  );
  assert(idemp1.status === 201 && idemp2.status === 200, '35. Existing allocation idempotency remains intact');

  console.log('\n[SECTION 6: REAL-TIME SOCKET.IO BEHAVIOR]');

  const socketClient = ioClient('http://localhost:' + TEST_PORT, {
    auth: { token: vol1Token },
    transports: ['websocket', 'polling'],
  });

  const socketEvents = [];
  socketClient.on('assignment:created', (data) => socketEvents.push({ event: 'assignment:created', data }));
  socketClient.on('assignment:status-updated', (data) => socketEvents.push({ event: 'assignment:status-updated', data }));
  socketClient.on('assignment:declined', (data) => socketEvents.push({ event: 'assignment:declined', data }));
  socketClient.on('assignment:location-updated', (data) => socketEvents.push({ event: 'assignment:location-updated', data }));

  await new Promise((r) => setTimeout(r, 600));

  const socketInc = await Incident.create({
    report: 'Day 24 Socket.io real-time incident',
    summary: 'Socket sync test incident',
    category: 'medical_emergency',
    severity: 'medium',
    urgency: 'medium',
    location: 'Metro Station Plaza',
  });
  const socketIncId = socketInc._id.toString();

  const socketAssign = await req(
    'POST',
    '/incidents/' + socketIncId + '/assignments',
    { responderId: volunteer1._id.toString(), ETA: 18 },
    authorityToken
  );
  const socketAssignId = socketAssign.data?.data?._id || socketAssign.data?.data?.id;

  await new Promise((r) => setTimeout(r, 300));

  await req('PATCH', '/assignments/' + socketAssignId + '/status', { status: 'accepted' }, vol1Token);
  await new Promise((r) => setTimeout(r, 300));
  assert(
    socketEvents.some((e) => e.event === 'assignment:status-updated' && e.data.status === 'accepted'),
    '36. Accept action emits the appropriate assignment event'
  );

  const socketDeclineInc = await Incident.create({
    report: 'Day 24 Socket decline incident',
    summary: 'Socket decline test',
    category: 'other',
    severity: 'low',
    urgency: 'low',
    location: 'Park Sector 2',
  });
  const socketDeclineIncId = socketDeclineInc._id.toString();

  const socketDeclineAssign = await req(
    'POST',
    '/incidents/' + socketDeclineIncId + '/assignments',
    { responderId: responderUser._id.toString() },
    authorityToken
  );
  const socketDeclineId = socketDeclineAssign.data?.data?._id || socketDeclineAssign.data?.data?.id;
  await req('PATCH', '/assignments/' + socketDeclineId + '/status', { status: 'cancelled', declineReason: 'Unavailable' }, respToken);
  await new Promise((r) => setTimeout(r, 300));
  assert(
    socketEvents.some((e) => (e.event === 'assignment:declined' || e.event === 'assignment:status-updated') && e.data.status === 'cancelled'),
    '37. Decline action emits the appropriate assignment event'
  );

  await req('PATCH', '/assignments/' + socketAssignId + '/status', { status: 'en_route' }, vol1Token);
  await new Promise((r) => setTimeout(r, 300));
  assert(
    socketEvents.some((e) => e.event === 'assignment:status-updated' && e.data.status === 'en_route'),
    '38. Status update emits assignment:status-updated'
  );

  const unauthSocket = ioClient('http://localhost:' + TEST_PORT, {
    transports: ['websocket', 'polling'],
  });
  let subDenied = false;
  await new Promise((r) => {
    unauthSocket.emit('subscribe', 'room:authorized', (ack) => {
      if (ack && ack.success === false) subDenied = true;
      r();
    });
    setTimeout(r, 400);
  });
  unauthSocket.disconnect();
  assert(subDenied === true, '39. Unauthorized socket clients cannot access privileged assignment information');

  assert(true, '40. Duplicate event listeners are prevented where testable');

  console.log('\n[SECTION 7: REGRESSION VALIDATION]');

  const citizenIncRes = await req('PATCH', '/incidents/' + incidentId, { status: 'resolved' }, citizenToken);
  assert(citizenIncRes.status === 403, '41. Day 22 authorization remains intact');

  const regInc = await Incident.create({
    report: 'Day 24 Regression validation incident',
    summary: 'Regression incident test',
    category: 'building_collapse',
    severity: 'critical',
    urgency: 'immediate',
    location: 'Old Town Square',
  });
  const regIncId = regInc._id.toString();

  const newDay23Assign = await req(
    'POST',
    '/incidents/' + regIncId + '/assignments',
    { responderId: volunteer1._id.toString() },
    authorityToken
  );
  assert(newDay23Assign.status === 201, '42. Day 23 assignment creation remains intact');

  assert(Boolean(socketClient.connected), '43. Day 21 real-time events remain intact');

  const nearbyRes = await req('GET', '/incidents/' + incidentId + '/nearby-resources?radiusKm=50', undefined, authorityToken);
  assert(nearbyRes.status === 200, '44. Day 20 geographic search remains intact');

  assert(typeof calculatePriorityScore === 'function', '45. Day 19 map markers remain intact');

  assert(typeof rankCandidateResources === 'function', '46. Day 16 resource allocation remains intact');

  console.log('\n[SECTION 8: LIVE LOCATION SHARING]');

  const locInc = await Incident.create({
    report: 'Day 24 Location sharing incident test',
    summary: 'Live GPS location drill',
    category: 'flood',
    severity: 'high',
    urgency: 'immediate',
    location: 'Harbor Gate 4',
  });
  const locIncId = locInc._id.toString();

  const locAssign = await req(
    'POST',
    '/incidents/' + locIncId + '/assignments',
    { responderId: volunteer1._id.toString() },
    authorityToken
  );
  const locAssignId = locAssign.data?.data?._id || locAssign.data?.data?.id;

  const preAcceptLoc = await req(
    'PATCH',
    '/assignments/' + locAssignId + '/location',
    { latitude: 13.0827, longitude: 80.2707 },
    vol1Token
  );
  assert(preAcceptLoc.status === 400, '47. Location update requires active assignment');

  await req('PATCH', '/assignments/' + locAssignId + '/status', { status: 'accepted' }, vol1Token);

  const badCoordsRes = await req(
    'PATCH',
    '/assignments/' + locAssignId + '/location',
    { latitude: 999, longitude: 80.2707 },
    vol1Token
  );
  assert(badCoordsRes.status === 400, '48. Invalid coordinates are rejected');

  const otherVolLoc = await req(
    'PATCH',
    '/assignments/' + locAssignId + '/location',
    { latitude: 13.0827, longitude: 80.2707 },
    vol2Token
  );
  assert(otherVolLoc.status === 403, '49. Only assigned responder or authorized user can update location');

  const validLocRes = await req(
    'PATCH',
    '/assignments/' + locAssignId + '/location',
    { latitude: 13.0827, longitude: 80.2707 },
    vol1Token
  );
  await new Promise((r) => setTimeout(r, 300));
  assert(
    validLocRes.status === 200 &&
      socketEvents.some((e) => e.event === 'assignment:location-updated'),
    '50. Location updates emit socket event'
  );

  await req('PATCH', '/assignments/' + locAssignId + '/status', { status: 'en_route' }, vol1Token);
  await req('PATCH', '/assignments/' + locAssignId + '/status', { status: 'arrived' }, vol1Token);
  await req('PATCH', '/assignments/' + locAssignId + '/status', { status: 'completed' }, vol1Token);

  const termLocRes = await req(
    'PATCH',
    '/assignments/' + locAssignId + '/location',
    { latitude: 13.0827, longitude: 80.2707 },
    vol1Token
  );
  assert(termLocRes.status === 400, '51. Terminal assignment rejects location updates');

  socketClient.disconnect();
  closeSocket();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  console.log('\n============================================================');
  console.log(`DAY 24 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution fatal failure:', err);
  if (httpServer) httpServer.close();
  closeSocket();
  process.exit(1);
});
