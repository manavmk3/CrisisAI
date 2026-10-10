import dns from 'dns';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import Resource from './src/models/Resource.js';
import ResourceAllocation from './src/models/ResourceAllocation.js';
import app from './src/app.js';
import { calculatePriorityScore, WEIGHTS } from './src/services/priorityScore.js';
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

async function runDay17Tests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🚀 DAY 17: AUTHORITY DASHBOARD & MILESTONE TEST SUITE');
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

  const authorityEmail = 'day17_authority@crisisai.test';
  const citizenEmail = 'day17_citizen@crisisai.test';
  const adminEmail = 'day17_admin@crisisai.test';

  let authorityUser = await User.findOne({ email: authorityEmail });
  if (!authorityUser) {
    authorityUser = await User.create({
      name: 'Day17 Authority Officer',
      email: authorityEmail,
      password: 'Day17AuthSecure!',
      role: 'authority',
    });
  }

  let citizenUser = await User.findOne({ email: citizenEmail });
  if (!citizenUser) {
    citizenUser = await User.create({
      name: 'Day17 Citizen Reporter',
      email: citizenEmail,
      password: 'Day17CitizenSecure!',
      role: 'citizen',
    });
  }

  let adminUser = await User.findOne({ email: adminEmail });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Day17 Admin Operator',
      email: adminEmail,
      password: 'Day17AdminSecure!',
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

  await Incident.deleteMany({ summary: { $regex: /^\[DAY17\]/ } });
  await Resource.deleteMany({ name: { $regex: /^\[DAY17\]/ } });

  console.log('[SETUP] Seeding Controlled Test Incidents and Resources...');

  const baseTime = Date.now();

  const inc1 = await Incident.create({
    report: '[DAY17] Massive flash flood submerging Main Street bridge with trapped vehicles.',
    reporter: citizenUser._id,
    category: 'flood',
    severity: 'critical',
    urgency: 'immediate',
    peopleAffected: 45,
    injuries: 8,
    location: '100 Main St, Riverdale',
    locationClue: 'Near the historic river bridge',
    coordinates: { latitude: 28.6139, longitude: 77.2090 },
    requiredResources: ['rescue_boat', 'medical_team', 'drinking_water'],
    summary: '[DAY17] Critical flood event trapping 45 citizens at bridge crossing.',
    aiConfidence: 0.94,
    priorityScore: 95,
    priorityBreakdown: {
      severity: 25,
      affectedPopulation: 18,
      vulnerability: 14,
      resourceShortage: 13,
      timeSensitivity: 10,
      confidence: 5,
      locationContext: 10,
    },
    status: 'reported',
    verificationState: 'verified',
    createdAt: new Date(baseTime - 10000),
  });

  const inc2 = await Incident.create({
    report: '[DAY17] Industrial chemical fire raging inside warehouse block B.',
    reporter: citizenUser._id,
    category: 'fire',
    severity: 'high',
    urgency: 'urgent',
    peopleAffected: 20,
    injuries: 3,
    location: 'Warehouse District B, Pier 4',
    locationClue: 'Adjacent to petroleum storage tanks',
    coordinates: { latitude: 28.6200, longitude: 77.2150 },
    requiredResources: ['fire_rescue', 'ambulance'],
    summary: '[DAY17] High severity chemical fire threatening adjacent storage tanks.',
    aiConfidence: 0.88,
    priorityScore: 85,
    priorityBreakdown: {
      severity: 18.75,
      affectedPopulation: 14,
      vulnerability: 15,
      resourceShortage: 15,
      timeSensitivity: 7.5,
      confidence: 4.5,
      locationContext: 10,
    },
    status: 'under_review',
    verificationState: 'needs_review',
    createdAt: new Date(baseTime - 8000),
  });

  const inc3 = await Incident.create({
    report: '[DAY17] Multi-story commercial building collapse with trapped workers.',
    reporter: citizenUser._id,
    category: 'building_collapse',
    severity: 'critical',
    urgency: 'immediate',
    peopleAffected: 15,
    injuries: 6,
    location: 'Commercial Center Block 9',
    locationClue: 'Near the shopping center',
    coordinates: { latitude: 28.6300, longitude: 77.2200 },
    requiredResources: ['search_rescue', 'ambulance', 'shelter'],
    summary: '[DAY17] Commercial building collapse with active structural instability.',
    aiConfidence: 0.91,
    priorityScore: 85,
    priorityBreakdown: {
      severity: 25,
      affectedPopulation: 12,
      vulnerability: 15,
      resourceShortage: 15,
      timeSensitivity: 10,
      confidence: 4.5,
      locationContext: 3.5,
    },
    status: 'reported',
    verificationState: 'verified',
    createdAt: new Date(baseTime - 2000),
  });

  const inc4 = await Incident.create({
    report: '[DAY17] Mass heat exhaustion during public marathon event.',
    reporter: citizenUser._id,
    category: 'medical_emergency',
    severity: 'medium',
    urgency: 'soon',
    peopleAffected: 30,
    injuries: 12,
    location: 'City Sports Arena',
    locationClue: 'Mile marker 14 on stadium ring',
    coordinates: { latitude: 28.6400, longitude: 77.2300 },
    requiredResources: ['medical_team', 'drinking_water'],
    summary: '[DAY17] Heat casualties requiring triage at stadium.',
    aiConfidence: 0.96,
    priorityScore: 65,
    priorityBreakdown: {
      severity: 12.5,
      affectedPopulation: 15,
      vulnerability: 10,
      resourceShortage: 10,
      timeSensitivity: 5,
      confidence: 5,
      locationContext: 7.5,
    },
    status: 'assigned',
    verificationState: 'verified',
    createdAt: new Date(baseTime - 15000),
  });

  const inc5 = await Incident.create({
    report: '[DAY17] Minor fender bender blocking right lane on secondary highway.',
    reporter: citizenUser._id,
    category: 'road_accident',
    severity: 'low',
    urgency: 'routine',
    peopleAffected: 2,
    injuries: 0,
    location: 'Highway 4 Ring Road',
    locationClue: 'Near exit 12',
    coordinates: { latitude: 28.6500, longitude: 77.2400 },
    requiredResources: ['police'],
    summary: '[DAY17] Low impact road obstruction cleared by local patrol.',
    aiConfidence: 0.82,
    priorityScore: 35,
    priorityBreakdown: {
      severity: 6.25,
      affectedPopulation: 5,
      vulnerability: 5,
      resourceShortage: 5,
      timeSensitivity: 2.5,
      confidence: 4,
      locationContext: 7.25,
    },
    status: 'resolved',
    verificationState: 'verified',
    createdAt: new Date(baseTime - 20000),
  });

  const inc6 = await Incident.create({
    report: '[DAY17] Flash flood on Main Street bridge with several stranded cars.',
    reporter: citizenUser._id,
    category: 'flood',
    severity: 'critical',
    urgency: 'immediate',
    peopleAffected: 40,
    injuries: 5,
    location: 'Main Street river bridge area',
    coordinates: { latitude: 28.6140, longitude: 77.2092 },
    requiredResources: ['rescue_boat'],
    summary: '[DAY17] Duplicate report of flash flood at bridge.',
    aiConfidence: 0.90,
    priorityScore: 92,
    priorityBreakdown: {
      severity: 25,
      affectedPopulation: 17,
      vulnerability: 14,
      resourceShortage: 13,
      timeSensitivity: 10,
      confidence: 4.5,
      locationContext: 8.5,
    },
    status: 'reported',
    verificationState: 'needs_review',
    possibleDuplicateOf: inc1._id,
    createdAt: new Date(baseTime - 1000),
  });

  const resExact = await Resource.create({
    name: '[DAY17] Rapid Response Rescue Boat Unit Alpha',
    type: 'rescue_boat',
    status: 'available',
    quantity: 6,
    availableQuantity: 6,
    location: 'Harbor Station 1',
    latitude: 28.6150,
    longitude: 77.2100,
  });

  const resComp = await Resource.create({
    name: '[DAY17] Disaster Search & Rescue Team 4',
    type: 'search_rescue',
    status: 'available',
    quantity: 10,
    availableQuantity: 10,
    location: 'Emergency Depot Central',
    latitude: 28.6250,
    longitude: 77.2150,
  });

  const resNoCoords = await Resource.create({
    name: '[DAY17] Clean Drinking Water Supply Batch',
    type: 'drinking_water',
    status: 'available',
    quantity: 100,
    availableQuantity: 100,
    location: 'Central Regional Relief Depot',
    latitude: null,
    longitude: null,
  });

  console.log('Seeded 6 test incidents and 3 test resources.\n');

  console.log('[SCENARIO 1] Dashboard Incident List Loads from API');
  const resList = await req('GET', '/incidents');
  assert(resList.status === 200, 'Scenario 1: GET /api/incidents returns HTTP 200');
  assert(resList.data && resList.data.success === true, 'Scenario 1: Response indicates success=true');
  assert(Array.isArray(resList.data.data) && resList.data.data.length >= 6, 'Scenario 1: Incidents array is returned with all seeded items');

  const day17Incidents = resList.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));

  console.log('\n[SCENARIO 2] Default Priority Ordering');
  assert(day17Incidents[0].priorityScore >= day17Incidents[1].priorityScore, 'Scenario 2: First incident has highest priority score (descending)');
  assert(day17Incidents[0]._id.toString() === inc1._id.toString(), 'Scenario 2: Inc 1 (score 95) is ranked first in default priority ordering');

  console.log('\n[SCENARIO 3] Priority Tie-Breaking');
  const inc3Index = day17Incidents.findIndex((i) => i._id.toString() === inc3._id.toString());
  const inc2Index = day17Incidents.findIndex((i) => i._id.toString() === inc2._id.toString());
  assert(inc3Index !== -1 && inc2Index !== -1, 'Scenario 3: Both tie incidents are present');
  assert(inc3Index < inc2Index, 'Scenario 3: Inc 3 (newer createdAt) breaks tie ahead of Inc 2');

  console.log('\n[SCENARIO 4] Status Filter');
  const resStatusFilter = await req('GET', '/incidents?status=under_review');
  assert(resStatusFilter.status === 200, 'Scenario 4: Filter by status=under_review returns HTTP 200');
  const filteredStatus = resStatusFilter.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredStatus.length === 1 && filteredStatus[0].status === 'under_review', 'Scenario 4: Returns only incidents with status under_review');

  console.log('\n[SCENARIO 5] Category Filter');
  const resCatFilter = await req('GET', '/incidents?category=fire');
  assert(resCatFilter.status === 200, 'Scenario 5: Filter by category=fire returns HTTP 200');
  const filteredCat = resCatFilter.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredCat.length === 1 && filteredCat[0].category === 'fire', 'Scenario 5: Returns only fire category incidents');

  console.log('\n[SCENARIO 6] Severity Filter');
  const resSevFilter = await req('GET', '/incidents?severity=critical');
  assert(resSevFilter.status === 200, 'Scenario 6: Filter by severity=critical returns HTTP 200');
  const filteredSev = resSevFilter.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredSev.length === 3, 'Scenario 6: Exactly 3 critical incidents returned');
  assert(filteredSev.every((i) => i.severity === 'critical'), 'Scenario 6: All returned incidents have severity=critical');

  console.log('\n[SCENARIO 7] Verification-State Filter');
  const resVerFilter = await req('GET', '/incidents?verification=requires_review');
  assert(resVerFilter.status === 200, 'Scenario 7: Filter by verification=requires_review returns HTTP 200');
  const filteredVer = resVerFilter.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredVer.length === 2, 'Scenario 7: Returns exactly the 2 review-flagged incidents');
  const verIds = filteredVer.map((i) => i._id.toString());
  assert(verIds.includes(inc2._id.toString()) && verIds.includes(inc6._id.toString()), 'Scenario 7: Correct review-flagged incidents identified');

  const resVerVerified = await req('GET', '/incidents?verification=verified');
  assert(resVerVerified.status === 200, 'Scenario 7: Filter by verification=verified returns HTTP 200');
  const filteredVerified = resVerVerified.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredVerified.length === 4, 'Scenario 7: Returns 4 verified routine triage incidents');

  console.log('\n[SCENARIO 8] Multiple Filters Combined');
  const resMulti = await req('GET', '/incidents?category=flood&severity=critical&status=reported');
  assert(resMulti.status === 200, 'Scenario 8: Combined filters return HTTP 200');
  const filteredMulti = resMulti.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredMulti.length === 2, 'Scenario 8: Returns 2 incidents matching category=flood AND severity=critical AND status=reported');

  console.log('\n[SCENARIO 9] Clear Filters');
  const resClear = await req('GET', '/incidents?sort=priority');
  assert(resClear.status === 200, 'Scenario 9: Unfiltered GET returns HTTP 200');
  const filteredClear = resClear.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredClear.length === 6, 'Scenario 9: All 6 incidents restored when filters are cleared');

  console.log('\n[SCENARIO 10] Filtered Results Preserve Priority Ordering');
  const resPreserve = await req('GET', '/incidents?severity=critical');
  const filteredPreserve = resPreserve.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredPreserve[0].priorityScore >= filteredPreserve[1].priorityScore, 'Scenario 10: First critical incident score >= second');
  assert(filteredPreserve[1].priorityScore >= filteredPreserve[2].priorityScore, 'Scenario 10: Second critical incident score >= third');
  assert(filteredPreserve[0]._id.toString() === inc1._id.toString(), 'Scenario 10: Inc 1 remains highest priority in filtered subset');

  console.log('\n[SCENARIO 11] Unknown Filter Value Handling');
  const resBadStatus = await req('GET', '/incidents?status=nonexistent_status');
  assert(resBadStatus.status === 400, 'Scenario 11: Unknown status returns HTTP 400');
  assert(resBadStatus.data.message.includes('Invalid status filter'), 'Scenario 11: Descriptive error for unknown status filter');

  const resBadCat = await req('GET', '/incidents?category=alien_invasion');
  assert(resBadCat.status === 400, 'Scenario 11: Unknown category returns HTTP 400');

  const resBadSev = await req('GET', '/incidents?severity=apocalyptic');
  assert(resBadSev.status === 400, 'Scenario 11: Unknown severity returns HTTP 400');

  const resBadVer = await req('GET', '/incidents?verification=unknown_state');
  assert(resBadVer.status === 400, 'Scenario 11: Unknown verification state returns HTTP 400');

  console.log('\n[SCENARIO 12 & 13] Empty Filtered Results');
  const resNoMatch = await req('GET', '/incidents?category=cyclone&status=resolved');
  assert(resNoMatch.status === 200, 'Scenario 13: Non-matching filter returns HTTP 200');
  const filteredNoMatch = resNoMatch.data.data.filter((i) => i.summary?.startsWith('[DAY17]'));
  assert(filteredNoMatch.length === 0, 'Scenario 13: Filtered results array is empty');

  console.log('\n[SCENARIO 14] Incident Detail Retrieval');
  const resDetail = await req('GET', `/incidents/${inc1._id}`);
  assert(resDetail.status === 200, 'Scenario 14: GET /api/incidents/:id returns HTTP 200');
  assert(resDetail.data.data.id === inc1._id.toString(), 'Scenario 14: Retrieved incident matches requested ID');

  console.log('\n[SCENARIO 15 & 16] Error Handling for Incident ID');
  const resMalformed = await req('GET', '/incidents/not-a-valid-object-id');
  assert(resMalformed.status === 400, 'Scenario 15: Malformed ID returns HTTP 400');

  const nonexistentId = new mongoose.Types.ObjectId();
  const resNonexistent = await req('GET', `/incidents/${nonexistentId}`);
  assert(resNonexistent.status === 404, 'Scenario 16: Nonexistent ID returns HTTP 404');

  console.log('\n[SCENARIO 17] AI Extraction Fields Correctness');
  const incDetail = resDetail.data.data;
  assert(incDetail.summary === inc1.summary, 'Scenario 17: Summary preserved exactly');
  assert(incDetail.category === 'flood', 'Scenario 17: Category matches AI extraction');
  assert(incDetail.severity === 'critical', 'Scenario 17: Severity matches AI extraction');
  assert(incDetail.urgency === 'immediate', 'Scenario 17: Urgency matches AI extraction');
  assert(incDetail.peopleAffected === 45, 'Scenario 17: People affected matches AI extraction');
  assert(incDetail.injuries === 8, 'Scenario 17: Injuries count matches AI extraction');
  assert(Array.isArray(incDetail.requiredResources) && incDetail.requiredResources.includes('rescue_boat'), 'Scenario 17: Required resources list matches');

  console.log('\n[SCENARIO 18] Manual-Review State Correctness');
  const resDetailReview = await req('GET', `/incidents/${inc2._id}`);
  assert(resDetailReview.status === 200, 'Scenario 18: Inc 2 detail fetched');
  assert(resDetailReview.data.data.status === 'under_review', 'Scenario 18: Inc 2 status is under_review');
  assert(resDetailReview.data.data.verificationState === 'needs_review', 'Scenario 18: Inc 2 verificationState is needs_review');

  console.log('\n[SCENARIO 19] Priority Score Displayed Correctly');
  assert(incDetail.priorityScore === 95, 'Scenario 19: Overall priority score matches persisted 95');

  console.log('\n[SCENARIO 20] Priority Breakdown Uses Accurate Data');
  assert(incDetail.priorityBreakdown !== null, 'Scenario 20: Priority breakdown object exists');
  assert(incDetail.priorityBreakdown.severity === 25, 'Scenario 20: Breakdown severity factor matches 25');
  assert(incDetail.priorityBreakdown.affectedPopulation === 18, 'Scenario 20: Breakdown population factor matches 18');
  assert(WEIGHTS.severity === 25 && WEIGHTS.affectedPopulation === 20, 'Scenario 20: Priority weights constant invariant matches Day 10 spec');

  console.log('\n[SCENARIO 21] Duplicate Indicator Without Auto-Merging');
  const resDupDetail = await req('GET', `/incidents/${inc6._id}`);
  assert(resDupDetail.status === 200, 'Scenario 21: Duplicate incident detail retrieved');
  assert(resDupDetail.data.data.possibleDuplicateOf !== null, 'Scenario 21: possibleDuplicateOf references candidate incident');
  assert(resDupDetail.data.data.possibleDuplicateOf._id.toString() === inc1._id.toString(), 'Scenario 21: References Inc 1 correctly');
  assert(resDupDetail.data.data.status === 'reported', 'Scenario 21: Duplicate incident status NOT auto-merged or auto-cancelled');

  assert(Array.isArray(resDetail.data.referringDuplicates), 'Scenario 21: Referring duplicates array returned for parent incident');
  assert(resDetail.data.referringDuplicates.some((d) => d._id.toString() === inc6._id.toString()), 'Scenario 21: Inc 1 shows Inc 6 as referring duplicate');

  console.log('\n[SCENARIO 22] Candidate Recommendations Loaded for Incident');
  const resCand = await req('GET', `/incidents/${inc1._id}/candidates`);
  assert(resCand.status === 200, 'Scenario 22: GET /api/incidents/:id/candidates returns HTTP 200');
  assert(Array.isArray(resCand.data.data) && resCand.data.data.length >= 3, 'Scenario 22: Ranked candidate resources returned');

  console.log('\n[SCENARIO 23] Candidate Ranking Order Preserved');
  const candList = resCand.data.data.filter((c) => c.resourceName?.startsWith('[DAY17]'));
  assert(candList.length >= 3, 'Scenario 23: All 3 seeded candidate resources returned');
  assert(candList[0].score >= candList[1].score, 'Scenario 23: Ranked descending by recommendation score');
  assert(candList[0].resourceType === 'rescue_boat', 'Scenario 23: Exact match rescue_boat is top recommended candidate');
  assert(candList[0].matchType === 'exact', 'Scenario 23: Top candidate matchType is exact');

  console.log('\n[SCENARIO 24] Missing Coordinates Handling');
  const noCoordCand = candList.find((c) => c.resourceType === 'drinking_water');
  assert(noCoordCand !== undefined, 'Scenario 24: Candidate with missing coordinates located');
  assert(noCoordCand.distanceKm === null, 'Scenario 24: distanceKm is explicitly null when coordinates missing (no fabricated distance)');
  assert(noCoordCand.explanation.includes('Standard location score'), 'Scenario 24: Explanation clarifies standard scoring used rather than proximity');

  console.log('\n[SCENARIO 25] Missing Inventory Handling');
  const incUnmet = await Incident.create({
    report: '[DAY17] Specialized submarine search required in deep reservoir.',
    reporter: citizenUser._id,
    category: 'other',
    severity: 'medium',
    urgency: 'routine',
    location: 'Deep Water Reservoir',
    requiredResources: ['police'],
    summary: '[DAY17] Deep reservoir search.',
    aiConfidence: 0.90,
    priorityScore: 50,
    priorityBreakdown: { severity: 12.5, affectedPopulation: 10, vulnerability: 7.5, resourceShortage: 7.5, timeSensitivity: 5, confidence: 2.5, locationContext: 5 },
    status: 'reported',
  });
  const resUnmetCand = await req('GET', `/incidents/${incUnmet._id}/candidates`);
  assert(resUnmetCand.status === 200, 'Scenario 25: Incident with unusual requirements returns 200');
  await Incident.deleteOne({ _id: incUnmet._id });

  console.log('\n[SCENARIO 26] Allocation Endpoint Functional');
  const allocPayload = {
    items: [{ resourceId: resExact._id.toString(), quantity: 2 }],
    notes: 'Day 17 Authority Command Center deployment',
  };
  const resAlloc = await req('POST', `/incidents/${inc1._id}/allocate`, allocPayload, authorityToken);
  assert(resAlloc.status === 201, 'Scenario 26: Allocation endpoint returns HTTP 201');
  assert(resAlloc.data.success === true, 'Scenario 26: Allocation successfully confirmed');

  console.log('\n[SCENARIO 27] Role Protection on Allocation');
  const resNoAuth = await req('POST', `/incidents/${inc1._id}/allocate`, allocPayload);
  assert(resNoAuth.status === 401, 'Scenario 27: Unauthenticated request rejected with HTTP 401');

  const resCitizenForbidden = await req('POST', `/incidents/${inc1._id}/allocate`, allocPayload, citizenToken);
  assert(resCitizenForbidden.status === 403, 'Scenario 27: Citizen role rejected with HTTP 403');

  console.log('\n[SCENARIO 28] Resource Availability Updates After Allocation');
  const resExactUpdated = await Resource.findById(resExact._id);
  assert(resExactUpdated.availableQuantity === 4, 'Scenario 28: availableQuantity decreased from 6 to 4');
  assert(resExactUpdated.quantity === 6, 'Scenario 28: total quantity unchanged at 6');

  console.log('\n[SCENARIO 29] Incident CRUD Regression');
  const resPatch = await req('PATCH', `/incidents/${inc4._id}`, { status: 'resolved' }, authorityToken);
  assert(resPatch.status === 200, 'Scenario 29: Incident status update returns HTTP 200');
  assert(resPatch.data.data.status === 'resolved', 'Scenario 29: Status changed to resolved');

  console.log('\n[SCENARIO 30] Duplicate-Detection Regression');
  const dupCheck = findMultiSignalDuplicates(
    {
      report: '[DAY17] Massive flash flood submerging Main Street bridge with trapped vehicles.',
      coordinates: { latitude: 28.6139, longitude: 77.2090 },
      createdAt: new Date(),
    },
    [inc1]
  );
  assert(dupCheck.likelyDuplicate === true, 'Scenario 30: Multi-signal duplicate detection correctly identifies duplicate');
  assert(dupCheck.candidates.length >= 1, 'Scenario 30: Candidates list generated');

  console.log('\n[SCENARIO 31] Resource CRUD Regression');
  const resListResources = await req('GET', '/resources');
  assert(resListResources.status === 200, 'Scenario 31: GET /api/resources returns 200');
  assert(Array.isArray(resListResources.data.data), 'Scenario 31: Resource inventory list accessible');

  console.log('\n[SCENARIO 32] Day 16 Allocation Release & Idempotency Regression');
  const allocRecord = await ResourceAllocation.findOne({ incident: inc1._id, resource: resExact._id, status: 'active' });
  assert(allocRecord !== null, 'Scenario 32: Active allocation record located');

  const resRelease = await req('POST', `/allocations/${allocRecord._id}/release`, { notes: 'Released by Day 17 test' }, authorityToken);
  assert(resRelease.status === 200, 'Scenario 32: Allocation release returns HTTP 200');
  const resExactAfterRelease = await Resource.findById(resExact._id);
  assert(resExactAfterRelease.availableQuantity === 6, 'Scenario 32: Inventory fully restored to 6 after release');

  const idemKey = 'day17-test-idempotency-' + Date.now();
  const resIdem1 = await req('POST', `/incidents/${inc1._id}/allocate`, {
    items: [{ resourceId: resExact._id.toString(), quantity: 1 }],
    idempotencyKey: idemKey,
  }, authorityToken);
  assert(resIdem1.status === 201, 'Scenario 32: First call with idempotency key returns 201');

  const resIdem2 = await req('POST', `/incidents/${inc1._id}/allocate`, {
    items: [{ resourceId: resExact._id.toString(), quantity: 1 }],
    idempotencyKey: idemKey,
  }, authorityToken);
  assert(resIdem2.status === 200, 'Scenario 32: Repeated call returns 200');
  assert(resIdem2.data.idempotent === true, 'Scenario 32: Idempotent flag set on duplicate call');

  const idemAlloc = await ResourceAllocation.findOne({ incident: inc1._id, idempotencyKey: idemKey });
  if (idemAlloc) {
    await req('POST', `/allocations/${idemAlloc._id}/release`, {}, authorityToken);
  }

  console.log('\n[CLEANUP] Cleaning test data...');
  await Incident.deleteMany({ summary: { $regex: /^\[DAY17\]/ } });
  await Resource.deleteMany({ name: { $regex: /^\[DAY17\]/ } });
  await ResourceAllocation.deleteMany({ incident: { $in: [inc1._id, inc2._id, inc3._id, inc4._id, inc5._id, inc6._id] } });

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`🎉 DAY 17 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (serverInstance) serverInstance.close();
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDay17Tests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
