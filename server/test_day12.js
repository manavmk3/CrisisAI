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

async function postWithRetry(url, options, maxRetries = 4, delayMs = 15000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 503 || res.status === 429) {
        console.log(`     ⏳ Received HTTP ${res.status} (Gemini busy/rate limited) — retrying in ${delayMs / 1000}s (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs = Math.min(delayMs * 1.5, 30000);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`     ⏳ Network error (${err.message}) — retrying in ${delayMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return fetch(url, options);
}

async function runEndToEndTests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🚀 DAY 12: END-TO-END VERTICAL SLICE PROOF-OF-CONCEPT TEST');
  console.log('════════════════════════════════════════════════════════════\n');

  await mongoose.connect(config.mongoUri);
  console.log('📦 Connected to MongoDB for database state verification.\n');

  // 1. Prepare authenticated citizen
  const testEmail = 'day12_citizen@crisisai.org';
  let citizen = await User.findOne({ email: testEmail });
  if (!citizen) {
    citizen = await User.create({
      name: 'Day12 Citizen Reporter',
      email: testEmail,
      password: 'SecurePassword2026!',
      role: 'citizen',
    });
  }

  const token = jwt.sign(
    { id: citizen._id, email: citizen.email, role: citizen.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  let incidentId = null;
  let reportText = 'A severe flash flood has submerged residential streets in Vellore near the river bank. About 25 residents including children are trapped on rooftops. We urgently need rescue boats and clean drinking water!';

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated request should be rejected
    // -------------------------------------------------------------
    console.log('[TEST 1] Security: Unauthenticated report submission rejected (401)');
    const resAuth = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: reportText }),
    });
    assert(resAuth.status === 401, 'Unauthenticated POST /api/incidents is rejected with 401');

    // -------------------------------------------------------------
    // Test 2: Authenticated Citizen Submits Report -> Core Pipeline
    // -------------------------------------------------------------
    console.log('\n[TEST 2-9] Pipeline: Citizen Report -> AI Extraction -> Validation -> Priority Engine -> MongoDB');
    const resPost = await postWithRetry(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        report: reportText,
        location: 'Vellore River Bank Road',
        urgency: 'immediate',
        needs: ['rescue_boat', 'drinking_water'],
        // Attempt to spoof protected fields:
        priorityScore: 5,
        category: 'road_accident',
      }),
    });

    const body = await resPost.json();
    assert(resPost.status === 201, 'POST /api/incidents returns HTTP 201 Created');
    assert(body.success === true, 'Response payload has success: true');
    assert(body.data && body.data._id, 'Response contains created incident document');

    const created = body.data;
    if (!created) {
      console.error('Failed to create incident in pipeline test. Response body:', body);
      return;
    }
    incidentId = created._id;

    // AI extraction checks
    assert(created.category === 'flood', `AI extracted category is "flood" (got: "${created.category}", spoofing ignored)`);
    assert(['critical', 'high', 'medium'].includes(created.severity), `AI extracted severity is valid (${created.severity})`);
    assert(['immediate', 'urgent'].includes(created.urgency), `AI extracted urgency is valid (${created.urgency})`);
    assert(created.summary && created.summary.length > 5, 'AI extracted informative summary');
    assert(typeof created.aiConfidence === 'number' && created.aiConfidence >= 0 && created.aiConfidence <= 1, `AI confidence attached (${created.aiConfidence})`);

    // Priority Engine checks
    assert(typeof created.priorityScore === 'number', 'Priority score is numeric');
    assert(created.priorityScore >= 0 && created.priorityScore <= 100, `Priority score is between 0 and 100 (score: ${created.priorityScore}, spoofed 5 ignored)`);
    assert(created.priorityBreakdown && typeof created.priorityBreakdown === 'object', 'Priority breakdown is attached');
    assert(created.priorityBreakdown.severity > 0, 'Priority breakdown includes positive severity weight');

    // Resources extraction
    assert(Array.isArray(created.requiredResources) && created.requiredResources.includes('rescue_boat'), 'Required resources includes rescue_boat');

    // -------------------------------------------------------------
    // Test 10: Verify directly in MongoDB
    // -------------------------------------------------------------
    console.log('\n[TEST 10-12] Database Persistence & Integrity');
    const dbDoc = await Incident.findById(incidentId);
    assert(dbDoc !== null, 'Incident exists and is confirmed in MongoDB');
    assert(dbDoc.report === reportText, 'Original report text is accurately preserved');
    assert(dbDoc.reporter.toString() === citizen._id.toString(), 'Reporter is associated with authenticated user');
    assert(dbDoc.priorityScore === created.priorityScore, 'Persisted priorityScore matches server calculation');
    assert(dbDoc.status === 'reported', 'Default initial status is "reported"');

    // Security: verify secrets are not stored in the incident
    const rawDocJson = JSON.stringify(dbDoc.toJSON());
    assert(!rawDocJson.includes('AIzaSy') && !rawDocJson.includes('AQ.Ab8RN6L'), 'Gemini API key is not stored in incident document');
    assert(!rawDocJson.includes('password'), 'Passwords are not stored or returned with incident');

    // -------------------------------------------------------------
    // Test 13: GET /api/incidents returns real incidents sorted by priority
    // -------------------------------------------------------------
    console.log('\n[TEST 13] Dashboard API: GET /api/incidents with Priority Descending Sorting');
    const resGet = await fetch(`${BASE_URL}?sort=priority`);
    const listBody = await resGet.json();

    assert(resGet.status === 200, 'GET /api/incidents returns HTTP 200');
    assert(listBody.success === true, 'Response success is true');
    assert(Array.isArray(listBody.data) && listBody.data.length > 0, `Returns array of incidents (count: ${listBody.data.length})`);

    // Verify created incident is in the list
    const found = listBody.data.some((inc) => (inc._id || inc.id) === incidentId);
    assert(found, 'Created incident appears in GET /api/incidents response');

    // Verify strict descending priority score sort
    let isSorted = true;
    for (let i = 0; i < listBody.data.length - 1; i++) {
      const current = Number(listBody.data[i].priorityScore) || 0;
      const next = Number(listBody.data[i + 1].priorityScore) || 0;
      if (current < next) {
        isSorted = false;
        console.error(`       Sort violation at index ${i}: score ${current} < score ${next}`);
        break;
      }
    }
    assert(isSorted, 'All incidents in GET /api/incidents are sorted in descending order of priorityScore');

    // -------------------------------------------------------------
    // Test 14: Client cannot arbitrarily overwrite AI fields via PATCH
    // -------------------------------------------------------------
    console.log('\n[TEST 14] Data Protection: Client cannot overwrite AI fields or priorityScore');
    const resPatch = await fetch(`${BASE_URL}/${incidentId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        priorityScore: 1,
        category: 'cyclone',
        severity: 'low',
        status: 'under_review',
      }),
    });
    const patchBody = await resPatch.json();
    assert(resPatch.status === 200, 'PATCH request accepted for allowed fields');
    assert(patchBody.data.status === 'under_review', 'Status updated to under_review');
    assert(patchBody.data.priorityScore === created.priorityScore, 'priorityScore remained protected against spoofing');
    assert(patchBody.data.category === 'flood', 'AI category remained protected against modification');

    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`🎉 DAY 12 TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Fatal error during test execution:', error);
    failed++;
  } finally {
    await mongoose.disconnect();
    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runEndToEndTests();
