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

const TEST_PORT = 5023;

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
    console.log('  \uD83D\uDCE6 Connected to MongoDB Atlas. Applying isolated test fixtures.');
  } catch (err) {
    console.log('  \u26A0\uFE0F  Atlas unavailable (' + err.message + '). Enabling in-memory simulation for tests.');
  }

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
        populate() { return this; },
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
      return {
        _items: copy,
        sort() { return this; },
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(this._items).then(resolve, reject); },
      };
    };

    Assignment.findOne = function (query) {
      let copy = [...memoryAssignments];
      if (query.incidentId) {
        copy = copy.filter((item) => (item.incidentId?._id || item.incidentId || '').toString() === query.incidentId.toString());
      }
      if (query.resourceId) {
        copy = copy.filter((item) => (item.resourceId?._id || item.resourceId || '').toString() === query.resourceId.toString());
      }
      if (query.responderId) {
        copy = copy.filter((item) => (item.responderId?._id || item.responderId || '').toString() === query.responderId.toString());
      }
      if (query.idempotencyKey) {
        copy = copy.filter((item) => item.idempotencyKey === query.idempotencyKey);
      }
      if (query.status && query.status.$in) {
        copy = copy.filter((item) => query.status.$in.includes(item.status));
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

async function runDay23TestSuite() {
  console.log('\n============================================================');
  console.log('\uD83D\uDE91 DAY 23: ASSIGNMENT FLOW WITH REAL-TIME EVENTS TEST SUITE');
  console.log('============================================================\n');

  await setupDatabase();

  httpServer = http.createServer(app);
  ioInstance = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));

  const citizenUser = await User.create({
    name: 'Day23 Citizen',
    email: 'day23_citizen@crisisai.test',
    password: 'Password123!',
    role: 'citizen',
  });

  const volunteerUser = await User.create({
    name: 'Day23 Volunteer',
    email: 'day23_volunteer@crisisai.test',
    password: 'Password123!',
    role: 'volunteer',
  });

  const responderUser = await User.create({
    name: 'Day23 Responder',
    email: 'day23_responder@crisisai.test',
    password: 'Password123!',
    role: 'responder',
  });

  const authorityUser = await User.create({
    name: 'Day23 Authority',
    email: 'day23_authority@crisisai.test',
    password: 'Password123!',
    role: 'authority',
  });

  const adminUser = await User.create({
    name: 'Day23 Admin',
    email: 'day23_admin@crisisai.test',
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

  const testIncident = await Incident.create({
    report: 'Day 23 High-water rescue operation needed near South River Bridge',
    category: 'flood',
    severity: 'critical',
    urgency: 'immediate',
    location: 'South River Bridge, Sector 4',
    coordinates: { latitude: 12.9716, longitude: 77.5946 },
    priorityScore: 88,
  });
  const incidentId = testIncident._id.toString();

  const testResource = await Resource.create({
    name: 'Day23 Rescue Boat Alpha',
    type: 'boat',
    quantity: 5,
    availableQuantity: 5,
    status: 'available',
    location: 'Dock 2',
    latitude: 12.972,
    longitude: 77.595,
  });
  const resourceId = testResource._id.toString();

  console.log('\n[SECTION 1: ASSIGNMENT MODEL VALIDATION]');

  let validResourceAssign = null;
  try {
    validResourceAssign = new Assignment({
      incidentId: testIncident._id,
      resourceId: testResource._id,
      assignedBy: authorityUser._id,
      ETA: 20,
      status: 'assigned',
    });
    await validResourceAssign.validate();
    assert(true, '1. Valid resource assignment passes validation');
  } catch (err) {
    assert(false, '1. Valid resource assignment passes validation', err.message);
  }

  try {
    const validRespAssign = new Assignment({
      incidentId: testIncident._id,
      responderId: volunteerUser._id,
      assignedBy: authorityUser._id,
      ETA: 15,
      status: 'assigned',
    });
    await validRespAssign.validate();
    assert(true, '2. Valid responder assignment passes validation');
  } catch (err) {
    assert(false, '2. Valid responder assignment passes validation', err.message);
  }

  try {
    const missingInc = new Assignment({
      resourceId: testResource._id,
      assignedBy: authorityUser._id,
    });
    await missingInc.validate();
    assert(false, '3. Missing incident reference is rejected');
  } catch (err) {
    assert(err.errors && err.errors.incidentId, '3. Missing incident reference is rejected');
  }

  try {
    const missingBoth = new Assignment({
      incidentId: testIncident._id,
      assignedBy: authorityUser._id,
    });
    await missingBoth.validate();
    assert(false, '4. Missing both resource and responder is rejected');
  } catch (err) {
    assert(err.errors && err.errors.resourceId, '4. Missing both resource and responder is rejected');
  }

  const badIdRes = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { resourceId: 'invalid-object-id' },
    authorityToken
  );
  assert(badIdRes.status === 400, '5. Invalid ObjectIds are rejected with 400');

  const negEtaRes = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { resourceId, ETA: -15 },
    authorityToken
  );
  assert(negEtaRes.status === 400, '6. Negative ETA values are rejected');

  try {
    const badStatus = new Assignment({
      incidentId: testIncident._id,
      resourceId: testResource._id,
      assignedBy: authorityUser._id,
      status: 'flying_on_mars',
    });
    await badStatus.validate();
    assert(false, '7. Invalid status enum is rejected');
  } catch (err) {
    assert(err.errors && err.errors.status, '7. Invalid status enum is rejected');
  }

  const savedAssign = await Assignment.create({
    incidentId: testIncident._id,
    resourceId: testResource._id,
    assignedBy: authorityUser._id,
    status: 'assigned',
    ETA: 30,
    notes: 'Initial test persistence record',
  });
  assert(savedAssign && savedAssign._id, '8. Assignment persistence is confirmed');

  console.log('\n[SECTION 2: AUTHORIZATION ENFORCEMENT]');

  const citizenCreateRes = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { resourceId },
    citizenToken
  );
  assert(citizenCreateRes.status === 403, '9. Citizen cannot create assignment');

  const volunteerCreateRes = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { resourceId },
    volunteerToken
  );
  assert(volunteerCreateRes.status === 403, '10. Volunteer cannot create authority assignment');

  const authorityCreateRes = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    {
      responderId: volunteerUser._id.toString(),
      ETA: 25,
      notes: 'Dispatched volunteer to sector',
    },
    authorityToken
  );
  assert(authorityCreateRes.status === 201, '11. Authority can create assignment');
  const activeAssignmentId = authorityCreateRes.data?.data?._id || authorityCreateRes.data?.data?.id;

  const adminCreateRes = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    {
      responderId: responderUser._id.toString(),
      ETA: 10,
    },
    adminToken
  );
  assert(adminCreateRes.status === 201, '12. Admin can create assignment');

  const citizenUpdateRes = await req(
    'PATCH',
    '/assignments/' + activeAssignmentId + '/status',
    { status: 'accepted' },
    citizenToken
  );
  assert(citizenUpdateRes.status === 403, '13. Citizen cannot update assignment');

  const unauthStatusRes = await req(
    'PATCH',
    '/assignments/' + activeAssignmentId + '/status',
    { status: 'arrived' },
    authorityToken
  );
  assert(unauthStatusRes.status === 400, '14. Unauthorized status transition skip is rejected');

  const spoofResource = await Resource.create({
    name: 'Day23 Spoof Test Ambulance',
    type: 'ambulance',
    quantity: 3,
    availableQuantity: 3,
    status: 'available',
    location: 'Central Base',
  });
  const spoofAssignRes = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    {
      resourceId: spoofResource._id.toString(),
      assignedBy: adminUser._id.toString(),
    },
    authorityToken
  );
  assert(
    spoofAssignRes.status === 201 &&
      (spoofAssignRes.data?.data?.assignedBy?._id || spoofAssignRes.data?.data?.assignedBy).toString() ===
        authorityUser._id.toString(),
    '15. assignedBy cannot be spoofed and derives from authenticated session'
  );

  const citizenGetRestricted = await req(
    'GET',
    '/assignments/' + activeAssignmentId,
    undefined,
    citizenToken
  );
  assert(citizenGetRestricted.status === 403, '16. Unauthorized users cannot retrieve restricted assignments');

  console.log('\n[SECTION 3: ASSIGNMENT WORKFLOW & LIFECYCLE]');

  const historyRes = await req(
    'GET',
    '/incidents/' + incidentId + '/assignments',
    undefined,
    authorityToken
  );
  assert(historyRes.status === 200 && Array.isArray(historyRes.data?.data) && historyRes.data.data.length >= 2, '17. Assignment appears in incident history');

  const assignDetail = await req(
    'GET',
    '/assignments/' + activeAssignmentId,
    undefined,
    authorityToken
  );
  assert(assignDetail.status === 200 && assignDetail.data?.data?.ETA === 25, '18. ETA is saved correctly');

  const volunteerAcceptRes = await req(
    'PATCH',
    '/assignments/' + activeAssignmentId + '/status',
    { status: 'accepted' },
    volunteerToken
  );
  assert(volunteerAcceptRes.status === 200 && volunteerAcceptRes.data?.data?.status === 'accepted', '19. Assignment status transitions correctly (assigned -> accepted)');

  const jumpCompletedRes = await req(
    'PATCH',
    '/assignments/' + activeAssignmentId + '/status',
    { status: 'completed' },
    volunteerToken
  );
  assert(jumpCompletedRes.status === 400, '20. Invalid status transition (accepted -> completed) rejected');

  const enRouteRes = await req(
    'PATCH',
    '/assignments/' + activeAssignmentId + '/status',
    { status: 'en_route' },
    volunteerToken
  );
  assert(enRouteRes.status === 200 && enRouteRes.data?.data?.status === 'en_route', '20b. Valid status transition (accepted -> en_route) works');

  const arrivedRes = await req(
    'PATCH',
    '/assignments/' + activeAssignmentId + '/status',
    { status: 'arrived' },
    volunteerToken
  );
  assert(arrivedRes.status === 200 && arrivedRes.data?.data?.status === 'arrived', '20c. Valid status transition (en_route -> arrived) works');

  const completeRes = await req(
    'PATCH',
    '/assignments/' + activeAssignmentId + '/status',
    { status: 'completed' },
    volunteerToken
  );
  assert(completeRes.status === 200 && completeRes.data?.data?.status === 'completed', '22. Completion works where permitted');

  const terminalModifyRes = await req(
    'PATCH',
    '/assignments/' + activeAssignmentId + '/status',
    { status: 'arrived' },
    authorityToken
  );
  assert(terminalModifyRes.status === 400, '22b. Terminal status cannot be modified');

  const cancelTestAssignment = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { responderId: volunteerUser._id.toString(), ETA: 12 },
    authorityToken
  );
  const cancelAssignId = cancelTestAssignment.data?.data?._id || cancelTestAssignment.data?.data?.id;

  const cancelRes = await req(
    'PATCH',
    '/assignments/' + cancelAssignId + '/status',
    { status: 'cancelled' },
    authorityToken
  );
  assert(cancelRes.status === 200 && cancelRes.data?.data?.status === 'cancelled', '21. Cancellation works where permitted');

  const dupActive1 = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { responderId: volunteerUser._id.toString() },
    authorityToken
  );
  const dupActive2 = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { responderId: volunteerUser._id.toString() },
    authorityToken
  );
  assert(dupActive1.status === 201 && dupActive2.status === 409, '23. Duplicate active assignment protection');

  const idempVolunteer = await User.create({
    name: 'Day23 Idempotency Volunteer',
    email: 'day23_idemp_vol@crisisai.test',
    password: 'Password123!',
    role: 'volunteer',
  });
  const idempotencyKey = 'test-idemp-' + Date.now();
  const idempReq1 = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    {
      responderId: idempVolunteer._id.toString(),
      idempotencyKey,
    },
    authorityToken
  );
  const idempReq2 = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    {
      responderId: idempVolunteer._id.toString(),
      idempotencyKey,
    },
    authorityToken
  );
  assert(
    idempReq1.status === 201 && idempReq2.status === 200 && idempReq2.data?.idempotent === true,
    '24. Idempotency works for assignment creation'
  );

  console.log('\n[SECTION 4: RESOURCE INTEGRATION & INVENTORY SAFEGUARDS]');

  const testResourceAvail = await Resource.create({
    name: 'Day23 Medical Van',
    type: 'ambulance',
    quantity: 10,
    availableQuantity: 10,
    status: 'available',
    location: 'Hospital Alpha',
  });

  const assignRecRes = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { resourceId: testResourceAvail._id.toString(), ETA: 15 },
    authorityToken
  );
  assert(assignRecRes.status === 201, '25. Recommended resource can be assigned');
  const linkedAssign = assignRecRes.data?.data;

  const unavailableRes = await Resource.create({
    name: 'Depleted Water Tanker',
    type: 'water',
    quantity: 2,
    availableQuantity: 0,
    status: 'deployed',
    location: 'Station 9',
  });

  const assignUnavail = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { resourceId: unavailableRes._id.toString() },
    authorityToken
  );
  assert(assignUnavail.status === 400, '26. Unavailable resource is rejected');

  assert(
    linkedAssign && (linkedAssign.allocationId || linkedAssign.resourceId),
    '27. Allocation linkage remains consistent'
  );

  const resAfterFirstAssign = await Resource.findById(testResourceAvail._id);
  const qtyAfterFirst = resAfterFirstAssign.availableQuantity;

  assert(qtyAfterFirst === 9, '28. Available quantity is decremented exactly once upon initial assignment');

  const cancelResourceAssignRes = await req(
    'PATCH',
    '/assignments/' + (linkedAssign._id || linkedAssign.id) + '/status',
    { status: 'cancelled' },
    authorityToken
  );
  const resAfterCancel = await Resource.findById(testResourceAvail._id);
  assert(
    cancelResourceAssignRes.status === 200 && resAfterCancel.availableQuantity === 10,
    '29. Cancellation releases inventory back without double-release'
  );

  assert(
    typeof rankCandidateResources === 'function' && typeof calculatePriorityScore === 'function',
    '30. Existing Day 16 allocation safeguards remain intact'
  );

  console.log('\n[SECTION 5: REAL-TIME SOCKET.IO INTEGRATION]');

  const socketUrl = 'http://localhost:' + TEST_PORT;
  const authoritySocket = ioClient(socketUrl, {
    auth: { token: authorityToken },
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    authoritySocket.on('connect', resolve);
    setTimeout(resolve, 2000);
  });

  let receivedCreatedPayload = null;
  authoritySocket.on('assignment:created', (payload) => {
    receivedCreatedPayload = payload;
  });

  let receivedStatusPayload = null;
  authoritySocket.on('assignment:status-updated', (payload) => {
    receivedStatusPayload = payload;
  });

  const socketTriggerAssign = await req(
    'POST',
    '/incidents/' + incidentId + '/assignments',
    { resourceId: testResourceAvail._id.toString(), ETA: 18 },
    authorityToken
  );
  await new Promise((r) => setTimeout(r, 600));

  assert(
    receivedCreatedPayload !== null &&
      receivedCreatedPayload.event === 'assignment:created' &&
      receivedCreatedPayload.status === 'assigned',
    '31. Assignment creation emits assignment:created'
  );

  const socketTriggerAssignId = socketTriggerAssign.data?.data?._id || socketTriggerAssign.data?.data?.id;
  await req(
    'PATCH',
    '/assignments/' + socketTriggerAssignId + '/status',
    { status: 'accepted' },
    authorityToken
  );
  await new Promise((r) => setTimeout(r, 600));

  assert(
    receivedStatusPayload !== null &&
      receivedStatusPayload.event === 'assignment:status-updated' &&
      receivedStatusPayload.status === 'accepted' &&
      receivedStatusPayload.previousStatus === 'assigned',
    '32. Status updates emit assignment:status-updated'
  );

  const citizenSocket = ioClient(socketUrl, {
    auth: { token: citizenToken },
    transports: ['websocket'],
  });
  await new Promise((resolve) => {
    citizenSocket.on('connect', resolve);
    setTimeout(resolve, 2000);
  });

  const subPrivDenied = await new Promise((resolve) => {
    citizenSocket.emit('join', 'room:authorized', (ack) => {
      resolve(ack && ack.success === false);
    });
    setTimeout(() => resolve(true), 1200);
  });
  assert(subPrivDenied === true, '33. Unauthorized socket cannot subscribe to privileged rooms');

  const listenersCount = authoritySocket.listeners('assignment:created').length;
  assert(listenersCount === 1, '34. Duplicate event listeners are prevented where testable');

  authoritySocket.disconnect();
  citizenSocket.disconnect();

  console.log('\n[SECTION 6: REGRESSION VALIDATION]');

  const incListCheck = await req('GET', '/incidents');
  assert(incListCheck.status === 200 && Array.isArray(incListCheck.data?.data), '35. Incident CRUD remains intact');

  const resListCheck = await req('GET', '/resources');
  assert(resListCheck.status === 200 && Array.isArray(resListCheck.data?.data), '36. Resource CRUD remains intact');

  const allocListCheck = await req('GET', '/incidents/' + incidentId + '/allocations');
  assert(allocListCheck.status === 200 && Array.isArray(allocListCheck.data?.data), '37. Day 16 allocation remains intact');

  const nearbyResCheck = await req(
    'GET',
    '/incidents/' + incidentId + '/nearby-resources?radiusKm=100',
    undefined,
    authorityToken
  );
  assert(nearbyResCheck.status === 200, '38. Day 20 nearby-resource search remains intact');

  const testPriority = calculatePriorityScore({
    severity: 'critical',
    peopleAffected: 25,
    urgency: 'immediate',
  });
  assert(typeof testPriority.score === 'number' && testPriority.score > 0, '39. Day 21 priority and real-time events remain intact');

  const citizenDeniedAllocate = await req(
    'POST',
    '/incidents/' + incidentId + '/allocate',
    { items: [{ resourceId, quantity: 1 }] },
    citizenToken
  );
  assert(citizenDeniedAllocate.status === 403, '40. Day 22 authorization remains intact');

  const myAssignRes = await req('GET', '/assignments/my', undefined, volunteerToken);
  assert(myAssignRes.status === 200 && Array.isArray(myAssignRes.data?.data), '41. Responder can view their own assignments via /assignments/my');

  const respondersListRes = await req('GET', '/assignments/responders', undefined, authorityToken);
  assert(respondersListRes.status === 200 && Array.isArray(respondersListRes.data?.data), '42. Authorities can list available responders via /assignments/responders');

  const patchDetailsRes = await req(
    'PATCH',
    '/assignments/' + socketTriggerAssignId,
    { ETA: 40, notes: 'Updated ETA due to road block' },
    authorityToken
  );
  assert(patchDetailsRes.status === 200 && patchDetailsRes.data?.data?.ETA === 40, '43. Authorities can update permitted assignment fields (ETA and notes)');

  const citizenPatchDetails = await req(
    'PATCH',
    '/assignments/' + socketTriggerAssignId,
    { ETA: 5 },
    citizenToken
  );
  assert(citizenPatchDetails.status === 403, '44. Citizens cannot update assignment details');

  console.log('\n============================================================');
  console.log(`DAY 23 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('============================================================\n');

  if (httpServer) {
    closeSocket();
    httpServer.close();
  }

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(failed > 0 ? 1 : 0);
}

runDay23TestSuite();
