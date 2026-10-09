import dns from 'dns';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import Resource from './src/models/Resource.js';
import ResourceAllocation from './src/models/ResourceAllocation.js';
import app from './src/app.js';
import { calculatePriorityScore } from './src/services/priorityScore.js';
import { findMultiSignalDuplicates } from './src/services/duplicateDetection.service.js';
import { rankCandidateResources } from './src/services/resourceRanking.js';

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
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function runDay16Tests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🚀 DAY 16: RESOURCE ALLOCATION ENGINE TEST SUITE');
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
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      } catch {}
    }
    const connPromise = mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await Promise.race([
      connPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timed out')), 5500)),
    ]);
    console.log('📦 Connected to MongoDB.\n');
  } catch (err) {
    console.error('❌ Could not connect to MongoDB:', err.message);
    if (serverInstance) serverInstance.close();
    process.exit(1);
  }

  const authorityEmail = 'day16_authority@crisisai.test';
  const citizenEmail = 'day16_citizen@crisisai.test';
  const adminEmail = 'day16_admin@crisisai.test';

  let authorityUser = await User.findOne({ email: authorityEmail });
  if (!authorityUser) {
    authorityUser = await User.create({
      name: 'Day16 Authority',
      email: authorityEmail,
      password: 'Day16AuthSecure!',
      role: 'authority',
    });
  }

  let citizenUser = await User.findOne({ email: citizenEmail });
  if (!citizenUser) {
    citizenUser = await User.create({
      name: 'Day16 Citizen',
      email: citizenEmail,
      password: 'Day16CitizenSecure!',
      role: 'citizen',
    });
  }

  let adminUser = await User.findOne({ email: adminEmail });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Day16 Admin',
      email: adminEmail,
      password: 'Day16AdminSecure!',
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

  const createdIncidentIds = [];
  const createdResourceIds = [];
  const createdAllocationIds = [];

  try {
    const testIncident = await Incident.create({
      report: 'Major urban flooding near river bank with several stranded residents',
      reporter: authorityUser._id,
      category: 'flood',
      severity: 'high',
      urgency: 'immediate',
      peopleAffected: 45,
      injuries: 4,
      location: 'Riverside Sector 7',
      coordinates: { latitude: 19.076, longitude: 72.8777 },
      requiredResources: ['rescue_boat', 'medical_team', 'food'],
      summary: 'High-urgency flood rescue situation',
      aiConfidence: 0.95,
      priorityScore: 88,
      status: 'reported',
    });
    createdIncidentIds.push(testIncident._id);

    const ambulanceRes = await Resource.create({
      name: 'Ambulance Unit D16-1',
      type: 'ambulance',
      quantity: 10,
      availableQuantity: 10,
      status: 'available',
      location: 'City General Hospital',
      latitude: 19.078,
      longitude: 72.879,
    });
    createdResourceIds.push(ambulanceRes._id);

    const boatRes = await Resource.create({
      name: 'Rescue Boat Unit D16-1',
      type: 'rescue_boat',
      quantity: 5,
      availableQuantity: 5,
      status: 'available',
      location: 'Riverside Depot',
      latitude: 19.0765,
      longitude: 72.878,
    });
    createdResourceIds.push(boatRes._id);

    const foodRes = await Resource.create({
      name: 'Emergency Food Pack D16-1',
      type: 'food',
      quantity: 100,
      availableQuantity: 100,
      status: 'available',
      location: 'Central Relief Store',
      latitude: 19.08,
      longitude: 72.88,
    });
    createdResourceIds.push(foodRes._id);

    const maintRes = await Resource.create({
      name: 'Maint Boat Unit D16',
      type: 'rescue_boat',
      quantity: 2,
      availableQuantity: 2,
      status: 'maintenance',
      location: 'Workshop',
    });
    createdResourceIds.push(maintRes._id);

    console.log('[SECTION 1] Valid Allocation (Task 1)');
    const { status: s1, data: d1 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: boatRes._id.toString(), quantity: 2 }],
      },
      authorityToken
    );
    assert(s1 === 201, 'Task 1: Valid allocation returns HTTP 201', `Got ${s1}`);
    assert(d1?.success === true, 'Task 1: Response has success=true');
    assert(d1?.allocations?.length === 1, 'Task 1: One allocation record returned');
    if (d1?.allocations?.[0]?._id) createdAllocationIds.push(d1.allocations[0]._id);

    console.log('\n[SECTION 2] Allocation of Multiple Resource Types (Task 2)');
    const { status: s2, data: d2 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [
          { resourceId: boatRes._id.toString(), quantity: 1 },
          { resourceId: foodRes._id.toString(), quantity: 15 },
        ],
      },
      authorityToken
    );
    assert(s2 === 201, 'Task 2: Multiple resource types allocation returns HTTP 201');
    assert(d2?.allocations?.length === 2, 'Task 2: Multiple allocation records created');
    d2?.allocations?.forEach((a) => {
      if (a?._id) createdAllocationIds.push(a._id);
    });

    console.log('\n[SECTION 3] Exact Inventory Match by Type (Task 3)');
    const { status: s3, data: d3 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ type: 'food', quantity: 5 }],
      },
      authorityToken
    );
    assert(s3 === 201, 'Task 3: Exact match by type returns 201');
    assert(d3?.allocations?.[0]?.resourceType === 'food', 'Task 3: Allocated resource has exact type');
    if (d3?.allocations?.[0]?._id) createdAllocationIds.push(d3.allocations[0]._id);

    console.log('\n[SECTION 4] Documented Compatibility Mapping (Task 4)');
    const { status: s4, data: d4 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ type: 'medical_team', quantity: 2 }],
      },
      authorityToken
    );
    assert(s4 === 201, 'Task 4: Compatible alternative matches and returns 201');
    assert(
      d4?.allocations?.[0]?.requestedType === 'medical_team',
      'Task 4: Requested type preserved in allocation record'
    );
    if (d4?.allocations?.[0]?._id) createdAllocationIds.push(d4.allocations[0]._id);

    console.log('\n[SECTION 5] Unknown Resource Type (Task 5)');
    const { status: s5 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ type: 'spaceship_cruiser', quantity: 1 }],
      },
      authorityToken
    );
    assert(s5 === 400, 'Task 5: Unknown resource type returns HTTP 400');

    console.log('\n[SECTION 6] Missing Incident (Task 6)');
    const nonExistentIncId = new mongoose.Types.ObjectId().toString();
    const { status: s6 } = await req(
      'POST',
      `/incidents/${nonExistentIncId}/allocate`,
      {
        items: [{ resourceId: boatRes._id.toString(), quantity: 1 }],
      },
      authorityToken
    );
    assert(s6 === 404, 'Task 6: Non-existent incident ID returns 404');

    console.log('\n[SECTION 7] Missing Resource Inventory (Task 7)');
    const nonExistentResId = new mongoose.Types.ObjectId().toString();
    const { status: s7 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: nonExistentResId, quantity: 1 }],
      },
      authorityToken
    );
    assert(s7 === 404, 'Task 7: Missing resource ID returns 404');

    console.log('\n[SECTION 8] Invalid Incident ID (Task 8)');
    const { status: s8 } = await req(
      'POST',
      '/incidents/not-a-valid-id/allocate',
      {
        items: [{ resourceId: boatRes._id.toString(), quantity: 1 }],
      },
      authorityToken
    );
    assert(s8 === 400, 'Task 8: Malformed incident ID returns 400');

    console.log('\n[SECTION 9] Invalid Resource ID (Task 9)');
    const { status: s9 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: 'invalid-res-id', quantity: 1 }],
      },
      authorityToken
    );
    assert(s9 === 400, 'Task 9: Malformed resource ID in item returns 400');

    console.log('\n[SECTION 10] Zero Quantity (Task 10)');
    const { status: s10 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: boatRes._id.toString(), quantity: 0 }],
      },
      authorityToken
    );
    assert(s10 === 400, 'Task 10: Zero quantity returns 400');

    console.log('\n[SECTION 11] Negative Quantity (Task 11)');
    const { status: s11 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: boatRes._id.toString(), quantity: -5 }],
      },
      authorityToken
    );
    assert(s11 === 400, 'Task 11: Negative quantity returns 400');

    console.log('\n[SECTION 12] Fractional Quantity (Task 12)');
    const { status: s12 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: boatRes._id.toString(), quantity: 2.5 }],
      },
      authorityToken
    );
    assert(s12 === 400, 'Task 12: Fractional quantity returns 400');

    console.log('\n[SECTION 13 & 14] Quantity Greater than Available Inventory & Shortage Report (Tasks 13–14)');
    const { status: s13, data: d13 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: boatRes._id.toString(), quantity: 9999 }],
      },
      authorityToken
    );
    assert(
      s13 === 200 || s13 === 201 || s13 === 400,
      'Task 13: Over-request handled gracefully without crashing'
    );
    assert(d13?.shortages?.length > 0, 'Task 14: Shortage report generated with remaining unmet quantity');

    console.log('\n[SECTION 15] Ineligible Resource Status (Task 15)');
    const { data: d15 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: maintRes._id.toString(), quantity: 1 }],
      },
      authorityToken
    );
    assert(
      d15?.shortages?.some((s) => s.reason?.includes('maintenance')),
      'Task 15: Ineligible resource in maintenance status is rejected from allocation'
    );

    console.log('\n[SECTION 16 & 17] Available Quantity Decreases Correctly & Total Quantity Invariant (Tasks 16–17)');
    const freshBoat = await Resource.findById(boatRes._id);
    assert(
      freshBoat.availableQuantity < freshBoat.quantity,
      'Task 16: availableQuantity decreased after allocations'
    );
    assert(freshBoat.quantity === 5, 'Task 17: Total quantity invariant maintained');

    console.log('\n[SECTION 18] Allocation Records Persist in MongoDB (Task 18)');
    const firstAllocId = createdAllocationIds[0];
    const dbAlloc = await ResourceAllocation.findById(firstAllocId);
    assert(dbAlloc !== null, 'Task 18: ResourceAllocation found directly in MongoDB');
    assert(dbAlloc.status === 'active', 'Task 18: Allocation status is active');

    console.log('\n[SECTION 19] Allocation Listing (Task 19)');
    const { status: s19, data: d19 } = await req('GET', `/incidents/${testIncident._id}/allocations`);
    assert(s19 === 200, 'Task 19: GET /api/incidents/:id/allocations returns 200');
    assert(Array.isArray(d19?.data) && d19?.data?.length > 0, 'Task 19: Returned array of active allocations');

    console.log('\n[SECTION 20] Release Restores Available Quantity (Task 20)');
    const allocToRelease = d19.data[0];
    const resBeforeRelease = await Resource.findById(allocToRelease.resource._id || allocToRelease.resource);
    const availBefore = resBeforeRelease.availableQuantity;

    const { status: s20, data: d20 } = await req(
      'POST',
      `/allocations/${allocToRelease._id}/release`,
      {},
      authorityToken
    );
    assert(s20 === 200 && d20?.success === true, 'Task 20: POST /api/allocations/:id/release returns 200');
    const resAfterRelease = await Resource.findById(allocToRelease.resource._id || allocToRelease.resource);
    assert(
      resAfterRelease.availableQuantity === availBefore + allocToRelease.quantity,
      'Task 20: Available quantity exactly restored by allocation quantity'
    );

    console.log('\n[SECTION 21] Double Release Prevention (Task 21)');
    const { status: s21 } = await req(
      'POST',
      `/allocations/${allocToRelease._id}/release`,
      {},
      authorityToken
    );
    assert(s21 === 400, 'Task 21: Releasing already-released allocation returns 400');
    const resAfterDoubleRelease = await Resource.findById(allocToRelease.resource._id || allocToRelease.resource);
    assert(
      resAfterDoubleRelease.availableQuantity === resAfterRelease.availableQuantity,
      'Task 21: Second release attempt does NOT double-increment inventory'
    );

    console.log('\n[SECTION 22] Idempotency Key Guard (Task 22)');
    const idempKey = 'idemp-test-d16-' + Date.now();
    const { status: s22a, data: d22a } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: foodRes._id.toString(), quantity: 3 }],
        idempotencyKey: idempKey,
      },
      authorityToken
    );
    assert(s22a === 201, 'Task 22: First idempotent call returns 201');
    const foodAvailAfterFirst = (await Resource.findById(foodRes._id)).availableQuantity;

    const { status: s22b, data: d22b } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [{ resourceId: foodRes._id.toString(), quantity: 3 }],
        idempotencyKey: idempKey,
      },
      authorityToken
    );
    assert(s22b === 200, 'Task 22: Repeated idempotent call returns 200');
    assert(d22b?.idempotent === true, 'Task 22: Idempotent flag set');
    const foodAvailAfterSecond = (await Resource.findById(foodRes._id)).availableQuantity;
    assert(
      foodAvailAfterFirst === foodAvailAfterSecond,
      'Task 22: Repeated call did NOT allocate inventory twice'
    );
    if (d22a?.allocations?.[0]?._id) createdAllocationIds.push(d22a.allocations[0]._id);

    console.log('\n[SECTION 23 & 24] Authentication & Role Authorization (Tasks 23–24)');
    const { status: s23 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      { items: [{ resourceId: boatRes._id.toString(), quantity: 1 }] }
    );
    assert(s23 === 401, 'Task 23: Unauthenticated allocate request returns 401');

    const { status: s24 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      { items: [{ resourceId: boatRes._id.toString(), quantity: 1 }] },
      citizenToken
    );
    assert(s24 === 403, 'Task 24: Citizen role returns 403 Forbidden');

    console.log('\n[SECTION 25] Concurrent Allocation Invariant (Task 25)');
    const scarceRes = await Resource.create({
      name: 'Scarce Generator Unit',
      type: 'food',
      quantity: 2,
      availableQuantity: 2,
      status: 'available',
    });
    createdResourceIds.push(scarceRes._id);

    const concurrentResults = await Promise.all([
      req('POST', `/incidents/${testIncident._id}/allocate`, { items: [{ resourceId: scarceRes._id.toString(), quantity: 2 }] }, authorityToken),
      req('POST', `/incidents/${testIncident._id}/allocate`, { items: [{ resourceId: scarceRes._id.toString(), quantity: 2 }] }, authorityToken),
      req('POST', `/incidents/${testIncident._id}/allocate`, { items: [{ resourceId: scarceRes._id.toString(), quantity: 2 }] }, authorityToken),
    ]);

    const scarceAfter = await Resource.findById(scarceRes._id);
    assert(scarceAfter.availableQuantity >= 0, 'Task 25: availableQuantity never drops below 0 during concurrency');
    const successfulConcurrent = concurrentResults.filter((r) => r.status === 201);
    assert(successfulConcurrent.length === 1, 'Task 25: Exactly one concurrent request succeeds for scarce units');

    console.log('\n[SECTION 26] Rollback on Partial Multi-Resource Failure (Task 26)');
    const resA = await Resource.create({ name: 'Res A', type: 'food', quantity: 10, availableQuantity: 10, status: 'available' });
    const resB = await Resource.create({ name: 'Res B', type: 'shelter', quantity: 0, availableQuantity: 0, status: 'available' });
    createdResourceIds.push(resA._id, resB._id);

    const { data: d26 } = await req(
      'POST',
      `/incidents/${testIncident._id}/allocate`,
      {
        items: [
          { resourceId: resA._id.toString(), quantity: 5 },
          { resourceId: resB._id.toString(), quantity: 5 },
        ],
      },
      authorityToken
    );
    assert(d26?.shortages?.length > 0, 'Task 26: Shortage reported for unavailable secondary resource');

    console.log('\n[SECTION 27] Incident Priority Score Remains Unchanged (Task 27)');
    const incidentAfter = await Incident.findById(testIncident._id);
    assert(
      incidentAfter.priorityScore === 88,
      'Task 27: Incident priorityScore is 88 (unchanged after allocations)'
    );

    console.log('\n[SECTION 28] Regression — Incident CRUD & Scoring (Task 28)');
    const { status: s28 } = await req('GET', '/incidents');
    assert(s28 === 200, 'Task 28: Incident listing endpoint functional');
    const priorityCalc = calculatePriorityScore({ severity: 'critical', peopleAffected: 100 });
    assert(priorityCalc.score > 0, 'Task 28: Priority scoring engine functional');

    console.log('\n[SECTION 29] Regression — Duplicate Detection (Task 29)');
    const dupCheck = findMultiSignalDuplicates(
      { report: 'Flood report in sector 7', coordinates: { latitude: 19.076, longitude: 72.8777 }, createdAt: new Date() },
      []
    );
    assert(dupCheck !== null, 'Task 29: Duplicate detection service functional');

    console.log('\n[SECTION 30] Regression — Day 15 Resource CRUD (Task 30)');
    const { status: s30, data: d30 } = await req('GET', '/resources');
    assert(s30 === 200 && Array.isArray(d30?.data), 'Task 30: Resource listing returns 200 with inventory');

    console.log('\n[SECTION 31] Candidate Ranking & Explainability (Task 31)');
    const candidates = rankCandidateResources(testIncident, [ambulanceRes, boatRes, foodRes]);
    assert(candidates.length === 3, 'Task 31: Ranking returns all candidate resources');
    assert(candidates[0].score >= candidates[1].score, 'Task 31: Candidates sorted descending by score');
    assert(typeof candidates[0].explanation === 'string' && candidates[0].explanation.length > 0, 'Task 31: Explainability string present in ranking');

  } catch (err) {
    console.error('\nFatal error during Day 16 test execution:', err);
    failed++;
  } finally {
    for (const aId of createdAllocationIds) {
      try {
        await ResourceAllocation.findByIdAndDelete(aId);
      } catch {}
    }
    for (const rId of createdResourceIds) {
      try {
        await Resource.findByIdAndDelete(rId);
      } catch {}
    }
    for (const incId of createdIncidentIds) {
      try {
        await Incident.findByIdAndDelete(incId);
      } catch {}
    }
    try {
      await User.deleteOne({ email: authorityEmail });
    } catch {}
    try {
      await User.deleteOne({ email: citizenEmail });
    } catch {}
    try {
      await User.deleteOne({ email: adminEmail });
    } catch {}

    try {
      await mongoose.disconnect();
    } catch {}
    if (serverInstance) serverInstance.close();

    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`🎉 DAY 16 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('════════════════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runDay16Tests();
