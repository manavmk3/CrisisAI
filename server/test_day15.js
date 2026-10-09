import dns from 'dns';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import Resource, { RESOURCE_TYPES, RESOURCE_STATUSES } from './src/models/Resource.js';
import app from './src/app.js';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
    results.push({ name: message, status: 'PASS' });
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
    if (detail) console.error(`         ${detail}`);
    results.push({ name: message, status: 'FAIL', detail });
  }
}

async function req(method, path, body, token) {
  const url = `http://localhost:${config.port || 8000}/api${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function runDay15Tests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🚀 DAY 15: RESOURCE MODEL & INVENTORY MANAGEMENT TEST SUITE');
  console.log('════════════════════════════════════════════════════════════\n');

  let serverInstance = null;
  try {
    await fetch(`http://localhost:${config.port || 8000}/api/health`);
  } catch {
    serverInstance = app.listen(config.port || 8000);
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
      try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch {}
    }
    const connPromise = mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await Promise.race([
      connPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timed out')), 5500)),
    ]);
    console.log('📦 Connected to MongoDB.\n');
  } catch (err) {
    console.error('❌ Could not connect to MongoDB:', err.message);
    console.error('   Ensure MONGO_URI is set in server/.env and the database is reachable.');
    if (serverInstance) serverInstance.close();
    process.exit(1);
  }

  const authorityEmail = 'day15_authority@crisisai.test';
  const citizenEmail   = 'day15_citizen@crisisai.test';
  const adminEmail     = 'day15_admin@crisisai.test';

  let authorityUser = await User.findOne({ email: authorityEmail });
  if (!authorityUser) {
    authorityUser = await User.create({
      name: 'Day15 Authority',
      email: authorityEmail,
      password: 'Day15AuthSecure!',
      role: 'authority',
    });
  }

  let citizenUser = await User.findOne({ email: citizenEmail });
  if (!citizenUser) {
    citizenUser = await User.create({
      name: 'Day15 Citizen',
      email: citizenEmail,
      password: 'Day15CitizenSecure!',
      role: 'citizen',
    });
  }

  let adminUser = await User.findOne({ email: adminEmail });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Day15 Admin',
      email: adminEmail,
      password: 'Day15AdminSecure!',
      role: 'admin',
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

  const adminToken = jwt.sign(
    { id: adminUser._id, email: adminUser.email, role: adminUser.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const createdResourceIds = [];

  try {
    console.log('[SECTION 1] Valid resource creation (Task 1)');

    const { status: s1, data: d1 } = await req('POST', '/resources', {
      name: 'Ambulance Unit Alpha',
      type: 'ambulance',
      quantity: 5,
      availableQuantity: 3,
      status: 'available',
      location: 'District 4 Base',
    }, authorityToken);

    assert(s1 === 201, 'Task 1: Valid resource creation returns HTTP 201',
      `Got ${s1}: ${JSON.stringify(d1)}`);
    assert(d1?.success === true && d1?.data?.name === 'Ambulance Unit Alpha',
      'Task 1: Response has success=true and correct resource name');

    if (d1?.data?._id) createdResourceIds.push(d1.data._id);

    console.log('\n[SECTION 2] Validation failures (Tasks 2–8)');

    const { status: s2 } = await req('POST', '/resources', { type: 'ambulance', quantity: 1 }, authorityToken);
    assert(s2 === 400, 'Task 2: Missing name → 400');

    const { status: s3 } = await req('POST', '/resources', { name: 'X', quantity: 1 }, authorityToken);
    assert(s3 === 400, 'Task 3: Missing type → 400');

    const { status: s4 } = await req('POST', '/resources', { name: 'X', type: 'drone', quantity: 1 }, authorityToken);
    assert(s4 === 400, 'Task 4: Invalid resource type → 400');

    const { status: s5 } = await req('POST', '/resources', { name: 'X', type: 'food', quantity: -1 }, authorityToken);
    assert(s5 === 400, 'Task 5: Negative quantity → 400');

    const { status: s6 } = await req('POST', '/resources', { name: 'X', type: 'food', quantity: 2.5 }, authorityToken);
    assert(s6 === 400, 'Task 6: Fractional quantity → 400');

    const { status: s7 } = await req('POST', '/resources', {
      name: 'X', type: 'food', quantity: 5, availableQuantity: -1,
    }, authorityToken);
    assert(s7 === 400, 'Task 7: Negative availableQuantity → 400');

    const { status: s8 } = await req('POST', '/resources', {
      name: 'X', type: 'food', quantity: 3, availableQuantity: 10,
    }, authorityToken);
    assert(s8 === 400, 'Task 8: availableQuantity > quantity → 400');

    console.log('\n[SECTION 3] Retrieval (Tasks 9–10)');

    const createdId = d1?.data?._id;
    if (createdId) {
      const { status: s9, data: d9 } = await req('GET', `/resources/${createdId}`);
      assert(s9 === 200 && d9?.success === true, 'Task 9: Retrieve resource by ID → 200');
      assert(d9?.data?.name === 'Ambulance Unit Alpha', 'Task 9: Retrieved resource has correct name');
    } else {
      assert(false, 'Task 9: Cannot test retrieval — creation step did not return an ID');
    }

    const { status: s10, data: d10 } = await req('GET', '/resources');
    assert(s10 === 200 && d10?.success === true && Array.isArray(d10?.data),
      'Task 10: Listing resources returns 200 with array');
    assert(typeof d10?.count === 'number', 'Task 10: Response includes count field');

    console.log('\n[SECTION 4] Filtering (Task 11)');

    const { data: dShelter } = await req('POST', '/resources', {
      name: 'Emergency Shelter Bravo',
      type: 'shelter',
      quantity: 2,
      status: 'available',
    }, authorityToken);
    if (dShelter?.data?._id) createdResourceIds.push(dShelter.data._id);

    const { status: s11a, data: d11a } = await req('GET', '/resources?type=shelter');
    assert(s11a === 200 && Array.isArray(d11a?.data), 'Task 11: Filter by type=shelter returns 200');
    const allShelters = d11a?.data?.every((r) => r.type === 'shelter');
    assert(allShelters === true, 'Task 11: All returned resources have type=shelter');

    const { status: s11b, data: d11b } = await req('GET', '/resources?status=available');
    assert(s11b === 200 && Array.isArray(d11b?.data), 'Task 11: Filter by status=available returns 200');

    const { status: s11c } = await req('GET', '/resources?type=invalid_type');
    assert(s11c === 400, 'Task 11: Filter by invalid type returns 400');

    console.log('\n[SECTION 5] ID edge cases (Tasks 12–13)');

    const { status: s12 } = await req('GET', '/resources/not-an-objectid');
    assert(s12 === 400, 'Task 12: Malformed ID → 400');

    const fakeId = new mongoose.Types.ObjectId().toString();
    const { status: s13 } = await req('GET', `/resources/${fakeId}`);
    assert(s13 === 404, 'Task 13: Nonexistent ID → 404');

    console.log('\n[SECTION 6] PATCH — valid partial update (Task 14)');

    if (createdId) {
      const { status: s14, data: d14 } = await req('PATCH', `/resources/${createdId}`, {
        availableQuantity: 4,
        status: 'deployed',
      }, authorityToken);
      assert(s14 === 200 && d14?.success === true, 'Task 14: Valid partial update → 200');
      assert(d14?.data?.availableQuantity === 4 && d14?.data?.status === 'deployed',
        'Task 14: Updated fields reflect changes correctly');
    } else {
      assert(false, 'Task 14: Cannot test update — creation step did not return an ID');
    }

    console.log('\n[SECTION 7] PATCH — invalid status (Task 15)');

    if (createdId) {
      const { status: s15 } = await req('PATCH', `/resources/${createdId}`, {
        status: 'on_fire',
      }, authorityToken);
      assert(s15 === 400, 'Task 15: Invalid status in PATCH → 400');
    } else {
      assert(false, 'Task 15: Cannot test — no resource ID available');
    }

    console.log('\n[SECTION 8] Coordinate validation (Tasks 16–17)');

    const { status: s16 } = await req('POST', '/resources', {
      name: 'Y', type: 'police', quantity: 2, latitude: 95,
    }, authorityToken);
    assert(s16 === 400, 'Task 16: Latitude > 90 → 400');

    const { status: s16b } = await req('POST', '/resources', {
      name: 'Y', type: 'police', quantity: 2, latitude: -95,
    }, authorityToken);
    assert(s16b === 400, 'Task 16: Latitude < -90 → 400');

    const { status: s17 } = await req('POST', '/resources', {
      name: 'Y', type: 'police', quantity: 2, longitude: 185,
    }, authorityToken);
    assert(s17 === 400, 'Task 17: Longitude > 180 → 400');

    const { status: s17b } = await req('POST', '/resources', {
      name: 'Y', type: 'police', quantity: 2, longitude: -185,
    }, authorityToken);
    assert(s17b === 400, 'Task 17: Longitude < -180 → 400');

    console.log('\n[SECTION 9] MongoDB persistence (Task 18)');

    const { data: dPersist } = await req('POST', '/resources', {
      name: 'Persist Check Boat',
      type: 'rescue_boat',
      quantity: 1,
      location: 'Test Dock',
    }, authorityToken);

    if (dPersist?.data?._id) {
      createdResourceIds.push(dPersist.data._id);
      const dbRecord = await Resource.findById(dPersist.data._id);
      assert(dbRecord !== null, 'Task 18: Created resource found directly in MongoDB');
      assert(dbRecord.name === 'Persist Check Boat', 'Task 18: MongoDB record has correct name');
    } else {
      assert(false, 'Task 18: Cannot verify persistence — creation did not return ID');
    }

    console.log('\n[SECTION 10] Authentication & Authorization (Tasks 19–21)');

    const { status: s19 } = await req('POST', '/resources', {
      name: 'Unauthenticated Attempt', type: 'food', quantity: 1,
    });
    assert(s19 === 401, 'Task 19: Unauthenticated POST → 401');

    const { status: s20 } = await req('POST', '/resources', {
      name: 'Citizen Attempt', type: 'food', quantity: 1,
    }, citizenToken);
    assert(s20 === 403, 'Task 20: Citizen POST → 403 (insufficient role)');

    if (createdId) {
      const { status: s21 } = await req('PATCH', `/resources/${createdId}`, {
        _id: new mongoose.Types.ObjectId().toString(),
      }, authorityToken);
      assert(s21 === 400, 'Task 21: Attempt to overwrite _id in PATCH → 400');

      const { status: s21b } = await req('PATCH', `/resources/${createdId}`, {
        createdAt: new Date().toISOString(),
      }, authorityToken);
      assert(s21b === 400, 'Task 21: Attempt to overwrite createdAt in PATCH → 400');
    } else {
      assert(false, 'Task 21: No resource ID to test protected field rejection');
    }

    console.log('\n[SECTION 11] Regression — existing incident CRUD (Task 22)');

    const { status: s22 } = await req('GET', '/incidents');
    assert(s22 === 200, 'Task 22: GET /api/incidents still returns 200 (incident CRUD intact)');

    console.log('\n[SECTION 12] Regression — duplicate detection import (Task 23)');

    const { findMultiSignalDuplicates } = await import('./src/services/duplicateDetection.service.js');
    const dupResult = findMultiSignalDuplicates(
      { report: 'Test incident near river bank', coordinates: null, createdAt: new Date() },
      []
    );
    assert(dupResult?.likelyDuplicate === false, 'Task 23: Duplicate detection service still functional');

    console.log('\n[SECTION 13] Quantity consistency after update (Task 24)');

    if (createdId) {
      const { data: dCurrent } = await req('GET', `/resources/${createdId}`);
      const currentQty = dCurrent?.data?.quantity;

      const { status: s24a } = await req('PATCH', `/resources/${createdId}`, {
        availableQuantity: currentQty + 1,
      }, authorityToken);
      assert(s24a === 400, 'Task 24: availableQuantity > current quantity after update → 400');

      const { status: s24b } = await req('PATCH', `/resources/${createdId}`, {
        quantity: 0,
        availableQuantity: 1,
      }, authorityToken);
      assert(s24b === 400, 'Task 24: quantity=0 with availableQuantity=1 → 400');

      const { status: s24c, data: d24c } = await req('PATCH', `/resources/${createdId}`, {
        quantity: 10,
        availableQuantity: 7,
      }, authorityToken);
      assert(s24c === 200, 'Task 24: Consistent quantity update → 200');
      assert(d24c?.data?.quantity === 10 && d24c?.data?.availableQuantity === 7,
        'Task 24: Updated quantity values persisted correctly');
    } else {
      assert(false, 'Task 24: No resource ID to test quantity consistency');
    }

    console.log('\n[SECTION 14] Security — no sensitive data in responses');

    const { data: dList } = await req('GET', '/resources');
    const listStr = JSON.stringify(dList || {});
    assert(!listStr.includes(config.jwt.secret), 'Security: JWT secret not exposed in resource list response');
    if (config.ai?.geminiApiKey) {
      assert(!listStr.includes(config.ai.geminiApiKey), 'Security: Gemini API key not exposed in resource list response');
    }

  } catch (err) {
    console.error('\nFatal error during Day 15 test execution:', err);
    failed++;
  } finally {
    for (const id of createdResourceIds) {
      try {
        await Resource.findByIdAndDelete(id);
      } catch {}
    }
    try { await User.deleteOne({ email: authorityEmail }); } catch {}
    try { await User.deleteOne({ email: citizenEmail }); } catch {}
    try { await User.deleteOne({ email: adminEmail }); } catch {}

    try { await mongoose.disconnect(); } catch {}
    if (serverInstance) serverInstance.close();

    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`🎉 DAY 15 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('════════════════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runDay15Tests();
