import dns from 'dns';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import app from './src/app.js';
import {
  TEXT_DUPLICATE_THRESHOLD,
  ACTIVE_INCIDENT_STATUSES,
  RECENT_INCIDENTS_LIMIT,
  normalizeText,
  tokenize,
  calculateCosineSimilarity,
  logDuplicateCandidate,
  findTextDuplicateCandidates,
} from './src/services/duplicateDetection.service.js';

if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {}
}

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

async function runDay13Tests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🚀 DAY 13: TEXT-SIMILARITY DUPLICATE DETECTION TEST SUITE');
  console.log('════════════════════════════════════════════════════════════\n');

  let serverInstance = null;
  let baseUrl = `http://localhost:${config.port || 8000}/api/incidents`;

  try {
    await fetch(`http://localhost:${config.port || 8000}/api/health`);
  } catch {
    serverInstance = app.listen(config.port || 8000);
    await new Promise((r) => setTimeout(r, 500));
  }

  await mongoose.connect(config.mongoUri);
  console.log('📦 Connected to MongoDB.\n');

  const testEmail = 'day13_dup_tester@crisisai.org';
  let citizen = await User.findOne({ email: testEmail });
  if (!citizen) {
    citizen = await User.create({
      name: 'Day13 Duplicate Tester',
      email: testEmail,
      password: 'Day13SecurePassword!',
      role: 'citizen',
    });
  }

  const token = jwt.sign(
    { id: citizen._id, email: citizen.email, role: citizen.role },
    config.jwt.secret,
    { expiresIn: '2h' }
  );

  const createdIncidentIds = [];

  try {
    console.log('[SECTION 1] Text Normalization & Tokenization Unit Tests');

    const norm1 = normalizeText('FIRE near Vellore BUS STAND!!!');
    assert(norm1 === 'fire near vellore bus stand', 'Normalizes lowercase and punctuation to clean string');

    const normSpaces = normalizeText('  Major   flood   in   Katpadi  \n\t');
    assert(normSpaces === 'major flood in katpadi', 'Collapses multiple whitespace and trims');

    assert(normalizeText(null) === '', 'Handles null text safely');
    assert(normalizeText(undefined) === '', 'Handles undefined text safely');
    assert(normalizeText('') === '', 'Handles empty text safely');
    assert(normalizeText(12345) === '', 'Handles non-string input safely');

    const tokens = tokenize('Severe fire at Vellore, 10 people trapped!');
    assert(tokens.length === 7 && tokens[4] === '10', 'Tokenizes into alphanumeric array preserving digits');

    console.log('\n[SECTION 2] Text Similarity & Candidate Filtering (Unit Scenarios)');

    const report1 = 'There is a major fire near Vellore bus stand. Around ten people may be trapped inside the building.';
    const simIdentical = calculateCosineSimilarity(report1, report1);
    assert(simIdentical === 1.0, `1. Identical reports return 1.0 (got: ${simIdentical})`);

    const reportNearly = 'There is a major fire near Vellore bus stand. Around ten people may be trapped inside the building!';
    const simNearly = calculateCosineSimilarity(report1, reportNearly);
    assert(simNearly >= 0.99, `2. Nearly identical reports (punctuation difference) score >= 0.99 (got: ${simNearly.toFixed(4)})`);

    const reportCase = 'FIRE near Vellore BUS STAND!!!';
    const reportCase2 = 'Fire near Vellore bus stand';
    const simCase = calculateCosineSimilarity(reportCase, reportCase2);
    assert(simCase === 1.0, `2b. Case and punctuation difference matches perfectly at 1.0 (got: ${simCase})`);

    const reportA = 'There is a major fire near Vellore bus stand. Around ten people may be trapped inside the building.';
    const reportB = 'A serious fire has broken out near Vellore bus stand. Approximately 10 people could be trapped in the building.';
    const simAB = calculateCosineSimilarity(reportA, reportB);
    assert(simAB > 0.35 && simAB < 0.75, `3. Same event with different wording recorded (got: ${simAB.toFixed(4)})`);

    const reportC = 'There is severe flooding near Katpadi and residents need drinking water.';
    const simAC = calculateCosineSimilarity(reportA, reportC);
    assert(simAC < 0.30 && simAC < 0.75, `4. Clearly unrelated reports have low similarity < 0.30 (got: ${simAC.toFixed(4)})`);

    const reportD = 'A fire has occurred in a completely different area with different circumstances.';
    const simAD = calculateCosineSimilarity(reportA, reportD);
    assert(simAD < 0.25 && simAD < 0.75, `5. Similar disaster word but different incident has low similarity (got: ${simAD.toFixed(4)})`);

    const simEmptyNew = calculateCosineSimilarity('', reportA);
    assert(simEmptyNew === 0.0, `6. Empty new report returns 0.0 similarity (got: ${simEmptyNew})`);
    const candidatesEmpty = findTextDuplicateCandidates('', [{ _id: '1', report: reportA }]);
    assert(candidatesEmpty.length === 0, '6b. findTextDuplicateCandidates with empty report returns empty array');

    const simEmptyExisting = calculateCosineSimilarity(reportA, '');
    assert(simEmptyExisting === 0.0, `7. Empty existing report returns 0.0 similarity (got: ${simEmptyExisting})`);
    const candidatesEmptyExisting = findTextDuplicateCandidates(reportA, [{ _id: '1', report: '' }]);
    assert(candidatesEmptyExisting.length === 0, '7b. findTextDuplicateCandidates ignores empty existing reports');

    const simNull = calculateCosineSimilarity(null, null);
    assert(simNull === 0.0, `8. Null text returns 0.0 similarity without throwing (got: ${simNull})`);
    const candidatesNull = findTextDuplicateCandidates(null, null);
    assert(Array.isArray(candidatesNull) && candidatesNull.length === 0, '8b. Null inputs return empty array safely');

    const mockIncidents = [
      { _id: 'inc_1', report: reportA },
      { _id: 'inc_2', report: reportNearly },
      { _id: 'inc_3', report: reportC },
      { _id: 'inc_4', report: reportD },
      { _id: 'inc_5', report: 'There is a major fire near Vellore bus stand. Around ten people are trapped inside the building.' },
    ];
    const multiCandidates = findTextDuplicateCandidates(reportA, mockIncidents, { enableLogging: false });
    assert(multiCandidates.length >= 3, `9. Multiple candidate incidents evaluated (found ${multiCandidates.length} meeting threshold 0.75)`);

    let isDescending = true;
    for (let i = 0; i < multiCandidates.length - 1; i++) {
      if (multiCandidates[i].similarity < multiCandidates[i + 1].similarity) {
        isDescending = false;
        break;
      }
    }
    assert(isDescending, '10. Candidate matches are strictly sorted descending by similarity');

    const candidatesAtThreshold = findTextDuplicateCandidates(
      reportA,
      mockIncidents,
      { threshold: 0.75, enableLogging: false }
    );
    const allAboveOrEqual = candidatesAtThreshold.every((c) => c.similarity >= 0.75);
    assert(allAboveOrEqual, '11. Every returned candidate has similarity >= configured threshold (0.75)');

    const belowThreshold = candidatesAtThreshold.find((c) => c.incidentId === 'inc_3' || c.incidentId === 'inc_4');
    assert(belowThreshold === undefined, '12. Below-threshold reports (flooding, different fire) are not included in candidates');

    console.log('\n[SECTION 3] Incident Filtering & Status Logic (Scenarios 13-15)');

    assert(
      ACTIVE_INCIDENT_STATUSES.includes('reported') &&
      ACTIVE_INCIDENT_STATUSES.includes('under_review') &&
      ACTIVE_INCIDENT_STATUSES.includes('assigned'),
      '13. Only active statuses (reported, under_review, assigned) are considered candidate duplicates'
    );

    assert(
      !ACTIVE_INCIDENT_STATUSES.includes('resolved'),
      '14. Resolved incidents are strictly ignored from active duplicate candidate statuses'
    );

    assert(
      !ACTIVE_INCIDENT_STATUSES.includes('cancelled'),
      '15. Cancelled incidents are strictly ignored from active duplicate candidate statuses'
    );

    assert(RECENT_INCIDENTS_LIMIT === 50, '15b. Recent incident window limit is set to 50');

    console.log('\n[SECTION 4] Incident Creation Pipeline & Non-Blocking Invariance (Scenarios 16-20)');

    const seedReportText = 'A severe fire has erupted in a commercial building near Vellore bus stand. About ten people are trapped inside.';
    const seedIncident = await Incident.create({
      report: seedReportText,
      reporter: citizen._id,
      category: 'fire',
      severity: 'critical',
      peopleAffected: 10,
      injuries: 2,
      urgency: 'immediate',
      location: 'Vellore bus stand',
      summary: 'Commercial building fire near Vellore bus stand with 10 people trapped.',
      aiConfidence: 0.95,
      priorityScore: 88,
      priorityBreakdown: { severity: 25, affectedPopulation: 20, urgency: 20 },
      status: 'reported',
    });
    createdIncidentIds.push(seedIncident._id);
    const initialCount = await Incident.countDocuments();

    const duplicateReportText = 'A severe fire has erupted in a commercial building near Vellore bus stand. About ten people are trapped inside!';
    
    const originalLog = console.log;
    let loggedCandidateEvent = null;
    console.log = (msg) => {
      try {
        if (typeof msg === 'string' && msg.includes('DUPLICATE_CANDIDATE')) {
          loggedCandidateEvent = JSON.parse(msg);
        }
      } catch (e) {}
      originalLog(msg);
    };

    const resSubmit = await postWithRetry(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        report: duplicateReportText,
        location: 'Vellore bus stand',
        urgency: 'immediate',
        needs: ['fire_rescue', 'ambulance'],
      }),
    });

    console.log = originalLog;

    const submitBody = await resSubmit.json();

    assert(resSubmit.status === 201, `16. POST /api/incidents returns 201 Created even when duplicate candidate exists (got: ${resSubmit.status})`);
    assert(submitBody.success === true, '16b. Response indicates success: true');
    assert(submitBody.data && submitBody.data._id, '16c. New incident document was successfully created and returned');

    const newIncidentId = submitBody.data._id;
    createdIncidentIds.push(newIncidentId);

    assert(Array.isArray(submitBody.duplicateCandidates), '16d. Response contains duplicateCandidates array');
    const matchedCandidate = (submitBody.duplicateCandidates || []).find((c) => c.incidentId === seedIncident._id.toString());
    assert(matchedCandidate !== undefined, '16e. Candidate match for seed incident found in duplicateCandidates');
    assert(matchedCandidate && matchedCandidate.similarity >= 0.75, `16f. Candidate similarity meets threshold (got: ${matchedCandidate?.similarity})`);

    assert(loggedCandidateEvent !== null, 'Task 8. Structured DUPLICATE_CANDIDATE event was logged to stdout');
    assert(loggedCandidateEvent?.event === 'DUPLICATE_CANDIDATE', 'Task 8b. Event type is DUPLICATE_CANDIDATE');
    assert(loggedCandidateEvent?.incidentId === seedIncident._id.toString(), 'Task 8c. Logged event contains correct candidate incidentId');
    assert(typeof loggedCandidateEvent?.similarity === 'number', 'Task 8d. Logged event contains numeric similarity');
    assert(loggedCandidateEvent?.threshold === 0.75, 'Task 8e. Logged event contains threshold 0.75');
    assert(loggedCandidateEvent?.timestamp !== undefined, 'Task 8f. Logged event contains ISO timestamp');

    assert(newIncidentId.toString() !== seedIncident._id.toString(), '17. Incidents are not merged; two separate distinct incident IDs exist');

    const finalCount = await Incident.countDocuments();
    assert(finalCount === initialCount + 1, `18. No incident deleted; total incident count incremented by 1 (${initialCount} -> ${finalCount})`);
    const originalDocStillExists = await Incident.findById(seedIncident._id);
    assert(originalDocStillExists !== null, '18b. Original seed incident is still intact in MongoDB');

    assert(originalDocStillExists.priorityScore === 88, '19. Existing incident priority score remained unchanged (88)');
    assert(typeof submitBody.data.priorityScore === 'number' && submitBody.data.priorityScore > 0, '19b. New incident has its own independent priority score');

    assert(originalDocStillExists.status === 'reported', '20. Existing incident status remained "reported"');
    assert(submitBody.data.status === 'reported', '20b. New incident initial status is "reported" (no duplicate status set)');

    console.log('\n[SECTION 5] Manual Test Scenarios & Actual Recorded Scores (Tasks 13 & 14)');

    const scoreAB = calculateCosineSimilarity(reportA, reportB);
    const scoreAC = calculateCosineSimilarity(reportA, reportC);
    const scoreAD = calculateCosineSimilarity(reportA, reportD);

    console.log('  📊 Recorded Similarity Scores for Standard Scenarios:');
    console.log(`     - Report A vs Report B (same fire, different wording): ${scoreAB.toFixed(4)}`);
    console.log(`     - Report A vs Report C (fire vs flooding):             ${scoreAC.toFixed(4)}`);
    console.log(`     - Report A vs Report D (fire vs different fire):       ${scoreAD.toFixed(4)}`);

    assert(scoreAB > scoreAC, 'Report A vs B (same fire) has higher similarity than Report A vs C (flood)');
    assert(scoreAB > scoreAD, 'Report A vs B (same fire) has higher similarity than Report A vs D (different fire)');
    assert(scoreAD < 0.75, 'Report D textual similarity alone does not exceed threshold (not declared a candidate)');

    const subReportBelow = 'Fire broke out in market. Two shops affected.';
    const simBelow = calculateCosineSimilarity(reportA, subReportBelow);
    console.log(`     - Report A vs SubReportBelow:                         ${simBelow.toFixed(4)} (< 0.75)`);
    assert(simBelow < 0.75, 'SubReportBelow scores below 0.75');

    const candidatesBelow = findTextDuplicateCandidates(reportA, [{ _id: 'below_1', report: subReportBelow }], { enableLogging: false });
    assert(candidatesBelow.length === 0, 'Threshold verification: score < 0.75 produces NO candidate match');

    const subReportAbove = 'There is a major fire near Vellore bus stand. Around ten people may be trapped inside.';
    const simAbove = calculateCosineSimilarity(reportA, subReportAbove);
    console.log(`     - Report A vs SubReportAbove:                         ${simAbove.toFixed(4)} (>= 0.75)`);
    assert(simAbove >= 0.75, 'SubReportAbove scores at or above 0.75');

    const candidatesAbove = findTextDuplicateCandidates(reportA, [{ _id: 'above_1', report: subReportAbove }], { enableLogging: false });
    assert(candidatesAbove.length === 1, 'Threshold verification: score >= 0.75 produces a candidate match');

    console.log('\n[SECTION 6] Security Verification (Task 16)');

    const responseString = JSON.stringify(submitBody);
    const logString = JSON.stringify(loggedCandidateEvent || {});

    assert(!responseString.includes(config.jwt.secret), 'No JWT secret in API response');
    assert(!responseString.includes('password'), 'No passwords leaked in API response');
    assert(!logString.includes(config.jwt.secret), 'No JWT secret in candidate duplicate log');
    assert(!logString.includes('password'), 'No passwords in candidate duplicate log');
    if (config.ai?.geminiApiKey) {
      assert(!responseString.includes(config.ai.geminiApiKey), 'No GEMINI_API_KEY in API response');
      assert(!logString.includes(config.ai.geminiApiKey), 'No GEMINI_API_KEY in candidate duplicate log');
    }

  } catch (error) {
    console.error('Fatal error during Day 13 test execution:', error);
    failed++;
  } finally {
    for (const id of createdIncidentIds) {
      try {
        await Incident.findByIdAndDelete(id);
      } catch (e) {}
    }
    try {
      await User.deleteOne({ email: testEmail });
    } catch (e) {}

    await mongoose.disconnect();
    if (serverInstance) {
      serverInstance.close();
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log(`🎉 DAY 13 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('════════════════════════════════════════════════════════════\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runDay13Tests();
