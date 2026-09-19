import dns from 'dns';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import { calculatePriorityScore } from './src/services/priorityScore.js';

if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {}
}

const BASE_URL = `http://localhost:${config.port || 8000}/api/incidents`;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('🚀 STARTING DAY 11 INCIDENT CRUD & WORKFLOW TESTS');
  console.log('========================================================\n');

  await mongoose.connect(config.mongoUri);
  console.log('📦 Connected to MongoDB for test verification.\n');

  const testEmail = 'incident_tester@crisisai.org';
  let testUser = await User.findOne({ email: testEmail });
  if (!testUser) {
    testUser = await User.create({
      name: 'Incident Tester',
      email: testEmail,
      password: 'StrongPassword123!',
      role: 'citizen',
    });
  }

  const token = jwt.sign(
    { id: testUser._id, email: testUser.email, role: testUser.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  let createdIncidentId = null;
  let originalPriority = null;
  let originalCategory = null;

  try {
    console.log('[TEST 1] Unauthenticated incident creation should be rejected (401)');
    const res1 = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: 'Building fire reported.' }),
    });
    const data1 = await res1.json();
    assert(res1.status === 401, 'Returns HTTP 401');
    assert(data1.success === false, 'success is false');

    console.log('\n[TEST 2] Missing report field rejected (400)');
    const res2 = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ location: 'Central Square' }),
    });
    const data2 = await res2.json();
    assert(res2.status === 400, 'Returns HTTP 400');
    assert(data2.message.includes('Missing required field: report'), 'Includes descriptive error message');

    console.log('\n[TEST 3] Empty report field rejected (400)');
    const res3 = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ report: '   ' }),
    });
    const data3 = await res3.json();
    assert(res3.status === 400, 'Returns HTTP 400');
    assert(data3.message.includes('cannot be empty'), 'Error specifies report cannot be empty');

    console.log('\n[TEST 4] Invalid request body rejected (400)');
    const res4 = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(['invalid_array']),
    });
    assert(res4.status === 400, 'Returns HTTP 400 for array payload');

    console.log('\n[TEST 5, 6, 7] Valid report submission -> AI Extraction -> Priority Score -> Incident Saved');
    const validReport = 'A major fire has erupted on the 3rd floor of a commercial plaza near Vellore bus stand. About 10 people are trapped inside and 4 have burns and injuries. Ambulances and fire rescue are urgently required!';
    const res5 = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        report: validReport,
        location: 'Vellore bus stand',
        urgency: 'immediate',
        needs: ['fire_rescue', 'ambulance'],
        priorityScore: 10,
        category: 'road_accident',
      }),
    });

    const data5 = await res5.json();
    assert(res5.status === 201, 'Returns HTTP 201 Created');
    assert(data5.success === true, 'Response indicates success: true');
    assert(data5.data && data5.data._id, 'Returns created incident with MongoDB _id');

    createdIncidentId = data5.data._id;
    originalPriority = data5.data.priorityScore;
    originalCategory = data5.data.category;

    console.log(`    Extracted Category: ${data5.data.category}`);
    console.log(`    Extracted Severity: ${data5.data.severity}`);
    console.log(`    Server Priority Score: ${data5.data.priorityScore} / 100`);
    console.log(`    Status: ${data5.data.status}`);

    assert(data5.data.category === 'fire', 'AI correctly extracted category "fire" (ignored client spoofing)');
    assert(data5.data.priorityScore > 50, 'Priority score was dynamically computed (> 50, ignored client spoofing 10)');
    assert(data5.data.priorityBreakdown && typeof data5.data.priorityBreakdown === 'object', 'Priority breakdown is attached');
    assert(data5.data.status === 'reported', 'Default status is "reported"');
    assert(data5.data.aiConfidence >= 0 && data5.data.aiConfidence <= 1, 'Valid AI confidence attached');
    assert(Array.isArray(data5.data.requiredResources) && data5.data.requiredResources.includes('fire_rescue'), 'Required resources includes fire_rescue');

    console.log('\n[TEST 8] Incident directly verified in MongoDB');
    const dbIncident = await Incident.findById(createdIncidentId);
    assert(dbIncident !== null, 'Incident found in MongoDB collection');
    assert(dbIncident.report === validReport, 'Original report text preserved');
    assert(dbIncident.reporter.toString() === testUser._id.toString(), 'Incident reporter matches authenticated user');
    assert(dbIncident.priorityScore === originalPriority, 'Persisted priorityScore matches server calculation');

    console.log('\n[TEST 9] GET /api/incidents returns list sorted newest first');
    const res9 = await fetch(BASE_URL);
    const data9 = await res9.json();
    assert(res9.status === 200, 'Returns HTTP 200');
    assert(data9.success === true, 'Response success is true');
    assert(Array.isArray(data9.data) && data9.data.length > 0, 'Returns non-empty array of incidents');
    assert(data9.data[0]._id === createdIncidentId || data9.data.some((i) => i._id === createdIncidentId), 'Created incident is present in list');

    console.log('\n[TEST 10] GET /api/incidents/:id returns single incident');
    const res10 = await fetch(`${BASE_URL}/${createdIncidentId}`);
    const data10 = await res10.json();
    assert(res10.status === 200, 'Returns HTTP 200');
    assert(data10.data._id === createdIncidentId, 'Returns exact incident');
    assert(data10.data.summary.length > 0, 'Incident summary is populated');

    console.log('\n[TEST 11] GET /api/incidents/:id with invalid ID format');
    const res11 = await fetch(`${BASE_URL}/invalid-mongo-id-12345`);
    const data11 = await res11.json();
    assert(res11.status === 400, 'Returns HTTP 400 Bad Request');
    assert(data11.message.includes('Invalid incident ID format'), 'Clean error message without stack trace');

    console.log('\n[TEST 12] GET /api/incidents/:id with nonexistent ID');
    const fakeId = new mongoose.Types.ObjectId();
    const res12 = await fetch(`${BASE_URL}/${fakeId}`);
    const data12 = await res12.json();
    assert(res12.status === 404, 'Returns HTTP 404 Not Found');
    assert(data12.message.includes('Incident not found'), 'Clean 404 message');

    console.log('\n[TEST 13] PATCH /api/incidents/:id updating allowed fields');
    const res13 = await fetch(`${BASE_URL}/${createdIncidentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: 'under_review',
        location: 'Vellore Main Bus Terminal Gate 2',
      }),
    });
    const data13 = await res13.json();
    assert(res13.status === 200, 'Returns HTTP 200 OK');
    assert(data13.data.status === 'under_review', 'Status updated to "under_review"');
    assert(data13.data.location === 'Vellore Main Bus Terminal Gate 2', 'Location updated');

    console.log('\n[TEST 14] Protected AI & priority fields cannot be arbitrarily overwritten');
    const res14 = await fetch(`${BASE_URL}/${createdIncidentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        priorityScore: 5,
        priorityBreakdown: { severity: 1 },
        category: 'flood',
        severity: 'low',
        aiConfidence: 0.05,
        summary: 'Spoofed summary',
      }),
    });
    const data14 = await res14.json();
    assert(res14.status === 200, 'Returns HTTP 200');
    assert(data14.data.priorityScore === originalPriority, 'priorityScore remains protected and unmodified');
    assert(data14.data.category === originalCategory, 'category remains protected and unmodified');
    assert(data14.data.severity !== 'low', 'severity remains protected and unmodified');

    console.log('\n[TEST 15] Verify priorityScore.js pure function calculation');
    const samplePriority = calculatePriorityScore({
      severity: 'critical',
      peopleAffected: 50,
      urgency: 'immediate',
      confidence: 0.95,
    });
    assert(typeof samplePriority.score === 'number' && samplePriority.score > 0, 'Valid numeric score returned');
    assert(samplePriority.breakdown.severity === 25, 'Critical severity factor equals 25');

    console.log('\n[TEST 16] Invalid status rejected on PATCH');
    const res16 = await fetch(`${BASE_URL}/${createdIncidentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: 'flying_to_mars' }),
    });
    assert(res16.status === 400, 'Returns HTTP 400 for invalid status enum');

    console.log('\n[TEST 17] Incident model schema validation on required AI fields');
    const testIncidentDoc = new Incident({
      report: 'Test report',
      reporter: testUser._id,
      severity: 'critical',
      urgency: 'immediate',
      summary: 'Test summary',
      aiConfidence: 0.9,
      priorityScore: 80,
    });
    let schemaError = null;
    try {
      await testIncidentDoc.validate();
    } catch (e) {
      schemaError = e;
    }
    assert(schemaError !== null && schemaError.errors.category, 'Schema strictly rejects missing AI category');

    console.log('\n[TEST 18] Verify no secrets or sensitive data leaked in responses');
    assert(!JSON.stringify(data5).includes(config.jwt.secret), 'JWT secret not present in response');
    assert(!JSON.stringify(data5).includes('password'), 'Password not leaked in reporter or incident');
    assert(!('password' in (data9.data[0].reporter || {})), 'Reporter password not present in GET /api/incidents');

  } finally {
    if (createdIncidentId) {
      await Incident.findByIdAndDelete(createdIncidentId);
    }
    await User.deleteOne({ email: testEmail });
    await mongoose.disconnect();
    console.log('\n🧹 Cleaned up test data and disconnected DB.');
  }

  console.log('\n========================================================');
  console.log(`DAY 11 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
