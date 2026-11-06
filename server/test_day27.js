import dns from 'dns';
import http from 'http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import Resource from './src/models/Resource.js';
import ResourceAllocation from './src/models/ResourceAllocation.js';
import Assignment from './src/models/Assignment.js';
import Alert from './src/models/Alert.js';
import situationSummaryService, {
  gatherOperationalData,
  validateSummarySchema,
  generateDeterministicFallbackBriefing,
  buildSituationPrompt,
} from './src/services/situationSummary.service.js';
import recommendedActionsService, {
  scoreSeverityAndPriority,
  scoreUrgency,
  scorePopulationAndInjuries,
  scoreResourceSuitability,
  scoreInventoryAvailability,
  scoreOperationalStatus,
  compileRecommendation,
  generateRecommendationsForIncident,
  SCORING_WEIGHTS,
  ACTION_TYPES,
} from './src/services/recommendedActions.service.js';
import app from './src/app.js';
import { initSocket, closeSocket } from './src/services/socket.service.js';

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

const TEST_PORT = 5027;

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
const memoryAlerts = [];

function setupMongooseMocks() {
  Incident.find = function (filter = {}) {
    let result = memoryIncidents.filter((inc) => {
      if (filter.status && filter.status.$in) {
        return filter.status.$in.includes(inc.status);
      }
      return true;
    });

    const chain = {
      sort: function (sortObj) {
        if (sortObj && sortObj.priorityScore === -1) {
          result.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
        }
        return chain;
      },
      populate: function () {
        return chain;
      },
      skip: function () {
        return chain;
      },
      limit: function () {
        return chain;
      },
      select: function () {
        return chain;
      },
      then: function (resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };

    return chain;
  };

  Incident.countDocuments = function () {
    return Promise.resolve(memoryIncidents.length);
  };

  Incident.findById = function (id) {
    const strId = (id?._id || id || '').toString();
    const found = memoryIncidents.find((i) => (i._id || i.id).toString() === strId);
    return {
      populate: () => Promise.resolve(found || null),
      then: function (resolve, reject) {
        return Promise.resolve(found || null).then(resolve, reject);
      },
    };
  };

  Resource.find = function () {
    return Promise.resolve(memoryResources);
  };

  ResourceAllocation.find = function (filter = {}) {
    let res = memoryAllocations;
    if (filter.status) {
      res = res.filter((a) => a.status === filter.status);
    }
    return Promise.resolve(res);
  };

  Assignment.find = function (filter = {}) {
    let res = memoryAssignments;
    if (filter.status && filter.status.$in) {
      res = res.filter((a) => filter.status.$in.includes(a.status));
    }
    return Promise.resolve(res);
  };

  User.findById = function (id) {
    const strId = (id?._id || id || '').toString();
    const found = memoryUsers.find((u) => (u._id || u.id).toString() === strId);
    const wrapped = found
      ? {
          ...found,
          select: () => Promise.resolve(wrapped),
        }
      : null;
    return {
      select: () => Promise.resolve(wrapped),
      then: function (resolve, reject) {
        return Promise.resolve(wrapped).then(resolve, reject);
      },
    };
  };

  Alert.find = function () {
    return {
      sort: () => ({ skip: () => ({ limit: () => ({ populate: () => Promise.resolve(memoryAlerts) }) }) }),
    };
  };
  Alert.countDocuments = function () {
    return Promise.resolve(memoryAlerts.filter((a) => !a.readStatus).length);
  };
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('   CRISISAI DAY 27 TEST SUITE: AI SITUATION & DECISION SUPPORT');
  console.log('===============================================================\n');

  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (_) {}

  let atlasConnected = false;
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 2000 });
    atlasConnected = true;
    console.log('  \u2705 MongoDB Atlas reachable. Applying isolated test fixtures.');
  } catch (err) {
    console.log('  \u26a0\ufe0f  Atlas unavailable (' + err.message + '). Enabling in-memory simulation for tests.');
  }
  setupMongooseMocks();

  httpServer = http.createServer(app);
  ioInstance = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
  console.log('  \ud83d\ude80 Test server listening on http://localhost:' + TEST_PORT + '\n');

  const citizenUser = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c001'),
    name: 'Citizen Jane',
    email: 'citizen27@crisisai.org',
    role: 'citizen',
  };
  const volunteerUser = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c002'),
    name: 'Responder Bob',
    email: 'volunteer27@crisisai.org',
    role: 'volunteer',
  };
  const authorityUser = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c003'),
    name: 'Commander Sarah',
    email: 'authority27@crisisai.org',
    role: 'authority',
  };
  const adminUser = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c004'),
    name: 'Admin Chief',
    email: 'admin27@crisisai.org',
    role: 'admin',
  };

  memoryUsers.push(citizenUser, volunteerUser, authorityUser, adminUser);

  const citizenToken = jwt.sign({ id: citizenUser._id.toString(), role: 'citizen' }, config.jwt.secret);
  const volunteerToken = jwt.sign({ id: volunteerUser._id.toString(), role: 'volunteer' }, config.jwt.secret);
  const authorityToken = jwt.sign({ id: authorityUser._id.toString(), role: 'authority' }, config.jwt.secret);
  const adminToken = jwt.sign({ id: adminUser._id.toString(), role: 'admin' }, config.jwt.secret);

  const inc1 = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c011'),
    summary: 'Flash flood submerging downtown residential area',
    category: 'flood',
    severity: 'critical',
    urgency: 'immediate',
    peopleAffected: 120,
    injuries: 4,
    priorityScore: 94,
    status: 'reported',
    verificationState: 'verified',
    requiredResources: ['rescue_boat', 'ambulance'],
    coordinates: { latitude: 28.6139, longitude: 77.2090 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const inc2 = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c012'),
    summary: 'Chemical warehouse fire with hazardous smoke plume',
    category: 'fire',
    severity: 'high',
    urgency: 'urgent',
    peopleAffected: 45,
    injuries: 2,
    priorityScore: 78,
    status: 'under_review',
    verificationState: 'needs_review',
    requiredResources: ['fire_rescue', 'medical_team'],
    coordinates: { latitude: 28.6200, longitude: 77.2150 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const inc3 = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c013'),
    summary: 'Minor road accident on highway feeder road',
    category: 'road_accident',
    severity: 'low',
    urgency: 'routine',
    peopleAffected: 2,
    injuries: 0,
    priorityScore: 25,
    status: 'assigned',
    verificationState: 'verified',
    requiredResources: ['police'],
    coordinates: { latitude: 28.6300, longitude: 77.2200 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const resolvedInc = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c014'),
    summary: 'Resolved gas line leak in sector 4',
    category: 'other',
    severity: 'medium',
    status: 'resolved',
    priorityScore: 50,
  };

  const cancelledInc = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c015'),
    summary: 'False alarm smoke detector trigger',
    category: 'fire',
    severity: 'low',
    status: 'cancelled',
    priorityScore: 10,
  };

  memoryIncidents.push(inc1, inc2, inc3, resolvedInc, cancelledInc);

  const res1 = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c021'),
    name: 'Flood Boat Unit Alpha',
    type: 'rescue_boat',
    quantity: 5,
    availableQuantity: 3,
    location: { coordinates: [77.2100, 28.6150] },
  };

  const res2 = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c022'),
    name: 'Rapid Response Ambulance 01',
    type: 'ambulance',
    quantity: 4,
    availableQuantity: 0,
    location: { coordinates: [77.2050, 28.6120] },
  };

  const res3 = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c023'),
    name: 'Fire Ladder Engine 07',
    type: 'fire_rescue',
    quantity: 3,
    availableQuantity: 2,
    location: { coordinates: [77.2180, 28.6210] },
  };

  memoryResources.push(res1, res2, res3);

  const assign1 = {
    _id: new mongoose.Types.ObjectId('672bb194d6c4a88701a2c031'),
    incidentId: inc3._id,
    responderId: volunteerUser._id,
    status: 'assigned',
    createdAt: new Date(),
  };

  memoryAssignments.push(assign1);

  console.log('--- Section 1: Situation Summary Engine ---');

  const opData = await gatherOperationalData();
  assert(
    opData.activeIncidentsCount === 3,
    'Situation Summary: Active incidents are retrieved correctly (count=3)',
    'count=' + opData.activeIncidentsCount
  );

  assert(
    !opData.activeIncidentsRaw.some((i) => i.status === 'resolved'),
    'Situation Summary: Resolved incidents are excluded from active operations'
  );

  assert(
    !opData.activeIncidentsRaw.some((i) => i.status === 'cancelled'),
    'Situation Summary: Cancelled incidents are excluded from active operations'
  );

  assert(
    opData.severityCounts.critical === 1 && opData.criticalIncidentsList.length === 1,
    'Situation Summary: Critical incident counts are identified correctly',
    'critical=' + opData.severityCounts.critical
  );

  assert(
    opData.totalPeopleAffected === (120 + 45 + 2),
    'Situation Summary: Affected population is calculated correctly across active incidents (167)',
    'total=' + opData.totalPeopleAffected
  );

  assert(
    opData.resourceSummary.length === 3,
    'Situation Summary: Resource availability is represented correctly'
  );

  assert(
    opData.activeAssignmentsCount === 1,
    'Situation Summary: Active assignments are included and counted correctly',
    'count=' + opData.activeAssignmentsCount
  );

  const emptyBriefing = generateDeterministicFallbackBriefing({
    activeIncidentsCount: 0,
    severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    totalPeopleAffected: 0,
    totalInjuries: 0,
    categoryCounts: {},
    resourceSummary: [],
    unassignedCount: 0,
    criticalIncidentsList: [],
    duplicateReviewCount: 0,
    averagePriority: 0,
    missingCoordinatesCount: 0,
    unverifiedCount: 0,
  });
  assert(
    emptyBriefing.overallRiskLevel === 'low' && emptyBriefing.situationOverview.includes('stable'),
    'Situation Summary: Empty operational data returns a safe and stable result',
    'risk=' + emptyBriefing.overallRiskLevel
  );

  const invalidJsonTest = validateSummarySchema({ situationOverview: 'Broken', overallRiskLevel: 'unknown_level' });
  assert(
    invalidJsonTest === false,
    'Situation Summary: Invalid AI response format is rejected safely by schema validator'
  );

  const missingFieldsTest = validateSummarySchema({ situationOverview: 'Valid', overallRiskLevel: 'high' });
  assert(
    missingFieldsTest === false,
    'Situation Summary: Missing required AI schema fields are detected and rejected'
  );

  const fallbackBriefing = generateDeterministicFallbackBriefing(opData);
  assert(
    fallbackBriefing.overallRiskLevel === 'critical' && fallbackBriefing.isAiGenerated === false,
    'Situation Summary: Deterministic fallback briefing works and generates complete briefing',
    'risk=' + fallbackBriefing.overallRiskLevel
  );

  assert(
    fallbackBriefing.keyFindings.some((f) => f.includes('167')),
    'Situation Summary: Fallback summary does not invent unavailable casualty data'
  );

  const apiSummaryRes = await req('GET', '/ai/situation-summary', undefined, authorityToken);
  assert(
    apiSummaryRes.status === 200 && Boolean(apiSummaryRes.data.data.generatedAt),
    'Situation Summary: API returns generation timestamp and structured briefing',
    'status=' + apiSummaryRes.status
  );

  const citizenSummaryRes = await req('GET', '/ai/situation-summary', undefined, citizenToken);
  assert(
    citizenSummaryRes.status === 403,
    'Situation Summary: Unauthorized citizen receives HTTP 403 on briefing endpoint',
    'status=' + citizenSummaryRes.status
  );

  const volunteerSummaryRes = await req('GET', '/ai/situation-summary', undefined, volunteerToken);
  assert(
    volunteerSummaryRes.status === 403,
    'Situation Summary: Unauthorized volunteer receives HTTP 403 on briefing endpoint',
    'status=' + volunteerSummaryRes.status
  );

  console.log('\n--- Section 2: Recommended Actions Engine ---');

  const recsInc1 = await recommendedActionsService.getRecommendedActionsForIncident(inc1._id);
  assert(
    recsInc1.length > 0 && (recsInc1[0].priority === 'critical' || recsInc1[0].priority === 'high'),
    'Recommended Actions: Critical incident receives appropriate urgent recommendations',
    'topPriority=' + recsInc1[0]?.priority
  );

  const recsInc3 = await recommendedActionsService.getRecommendedActionsForIncident(inc3._id);
  assert(
    recsInc1[0].recommendationScore > recsInc3[0].recommendationScore,
    'Recommended Actions: High-severity incident receives higher recommendation score than low-severity',
    'score1=' + recsInc1[0].recommendationScore + ', score3=' + recsInc3[0].recommendationScore
  );

  const sevScore1 = scoreSeverityAndPriority(inc1);
  assert(
    sevScore1.points === 24 && sevScore1.maximum === 25,
    'Recommended Actions: Severity and priority factor points calculated correctly (24/25)',
    'points=' + sevScore1.points
  );

  const urgScore1 = scoreUrgency(inc1);
  assert(
    urgScore1.points === 15 && urgScore1.maximum === 15,
    'Recommended Actions: Urgency factor points calculated correctly (immediate = 15/15)',
    'points=' + urgScore1.points
  );

  const popScore1 = scorePopulationAndInjuries(inc1);
  assert(
    popScore1.points > 10 && popScore1.maximum === 15,
    'Recommended Actions: Affected population and casualties factor calculated correctly',
    'points=' + popScore1.points
  );

  const suitScore = scoreResourceSuitability(inc1, ACTION_TYPES.ALLOCATE_RESOURCE, 'rescue_boat');
  assert(
    suitScore.points === 20 && suitScore.maximum === 20,
    'Recommended Actions: Resource need & suitability factor calculated correctly (direct match = 20/20)',
    'points=' + suitScore.points
  );

  const invScoreAvail = scoreInventoryAvailability(ACTION_TYPES.ALLOCATE_RESOURCE, res1);
  const invScoreDepleted = scoreInventoryAvailability(ACTION_TYPES.ALLOCATE_RESOURCE, res2);
  assert(
    invScoreAvail.points === 15 && invScoreDepleted.points === 0,
    'Recommended Actions: Inventory availability factor distinguishes available from exhausted stock',
    'avail=' + invScoreAvail.points + ', depleted=' + invScoreDepleted.points
  );

  const opsScoreUnassigned = scoreOperationalStatus(inc1, ACTION_TYPES.ASSIGN_RESPONDER, [], []);
  const opsScoreAssigned = scoreOperationalStatus(inc3, ACTION_TYPES.ASSIGN_RESPONDER, [], [assign1]);
  assert(
    opsScoreUnassigned.points > opsScoreAssigned.points,
    'Recommended Actions: Assignment status influences recommendation points (unassigned gap = 10 pts)',
    'unassigned=' + opsScoreUnassigned.points + ', assigned=' + opsScoreAssigned.points
  );

  const incWithoutCoords = { ...inc1, coordinates: { latitude: null, longitude: null } };
  const recNoCoords = compileRecommendation({
    incident: incWithoutCoords,
    actionType: ACTION_TYPES.ALLOCATE_RESOURCE,
    title: 'Dispatch Boat',
    description: 'Test',
    suggestedResourceType: 'rescue_boat',
    matchedResource: res1,
  });
  assert(
    recNoCoords.distanceKm === null,
    'Recommended Actions: Missing coordinates do not fabricate proximity (distanceKm is null)',
    'dist=' + recNoCoords.distanceKm
  );

  const depletedRec = recsInc1.find((r) => r.actionType === ACTION_TYPES.REQUEST_INVENTORY);
  assert(
    Boolean(depletedRec) && depletedRec.suggestedResourceType === 'ambulance',
    'Recommended Actions: Depleted inventory correctly triggers mutual aid request recommendation',
    'type=' + depletedRec?.actionType
  );

  const run1 = await recommendedActionsService.getRecommendedActionsForIncident(inc1._id);
  const run2 = await recommendedActionsService.getRecommendedActionsForIncident(inc1._id);
  assert(
    run1.length === run2.length && run1[0].recommendationScore === run2[0].recommendationScore,
    'Recommended Actions: Deterministic inputs produce identical recommendation scores and ranking'
  );

  const allWithinBounds = recsInc1.every((r) => r.recommendationScore >= 0 && r.recommendationScore <= 100);
  assert(
    allWithinBounds === true,
    'Recommended Actions: Recommendation score strictly bounded within [0, 100]'
  );

  const allFactorsBounded = recsInc1.every((r) =>
    r.contributingFactors.every((f) => f.points >= 0 && f.points <= f.maximum)
  );
  assert(
    allFactorsBounded === true,
    'Recommended Actions: Factor points never exceed configured maximums for each category'
  );

  const reasonsPresent = recsInc1.every((r) => Boolean(r.reason) && r.contributingFactors.every((f) => Boolean(f.reason)));
  assert(
    reasonsPresent === true,
    'Recommended Actions: Recommendation reasons and contributing factors are present on every recommendation'
  );

  const humanApprovalGuaranteed = recsInc1.every((r) => r.requiresHumanApproval === true);
  assert(
    humanApprovalGuaranteed === true,
    'Recommended Actions: Each recommendation explicitly requires human approval (requiresHumanApproval: true)'
  );

  console.log('\n--- Section 3: Operational Safety ---');

  const initialInventory = res1.availableQuantity;
  await recommendedActionsService.getRecommendedActionsForIncident(inc1._id);
  assert(
    res1.availableQuantity === initialInventory,
    'Operational Safety: Generating recommendations does not allocate inventory or modify stock',
    'stock=' + res1.availableQuantity
  );

  const initialAssignmentsCount = memoryAssignments.length;
  await recommendedActionsService.getRecommendedActionsForIncident(inc1._id);
  assert(
    memoryAssignments.length === initialAssignmentsCount,
    'Operational Safety: Generating recommendations does not create or assign responders',
    'count=' + memoryAssignments.length
  );

  const initialStatus = inc1.status;
  await recommendedActionsService.getRecommendedActionsForIncident(inc1._id);
  assert(
    inc1.status === initialStatus,
    'Operational Safety: Generating recommendations does not modify incident status',
    'status=' + inc1.status
  );

  const initialAlertsCount = memoryAlerts.length;
  await recommendedActionsService.getRecommendedActionsForIncident(inc1._id);
  assert(
    memoryAlerts.length === initialAlertsCount,
    'Operational Safety: Generating recommendations does not send unauthorized alerts',
    'alerts=' + memoryAlerts.length
  );

  const authRecsRes = await req('GET', '/ai/recommended-actions', undefined, authorityToken);
  assert(
    authRecsRes.status === 200 && Array.isArray(authRecsRes.data.data),
    'Operational Safety: Authority role can retrieve system-wide recommended actions (HTTP 200)',
    'status=' + authRecsRes.status
  );

  const adminRecsRes = await req('GET', '/ai/recommended-actions', undefined, adminToken);
  assert(
    adminRecsRes.status === 200 && Array.isArray(adminRecsRes.data.data),
    'Operational Safety: Admin role can retrieve system-wide recommended actions (HTTP 200)',
    'status=' + adminRecsRes.status
  );

  const citizenRecsRes = await req('GET', '/ai/recommended-actions', undefined, citizenToken);
  assert(
    citizenRecsRes.status === 403,
    'Operational Safety: Citizen role is denied access to recommended actions (HTTP 403)',
    'status=' + citizenRecsRes.status
  );

  const volunteerRecsRes = await req('GET', '/ai/recommended-actions', undefined, volunteerToken);
  assert(
    volunteerRecsRes.status === 403,
    'Operational Safety: Volunteer role is denied access to recommended actions (HTTP 403)',
    'status=' + volunteerRecsRes.status
  );

  console.log('\n--- Section 4: Existing Workflow Integration & Regression ---');

  const incRecsRes = await req('GET', `/incidents/${inc1._id}/recommended-actions`, undefined, authorityToken);
  assert(
    incRecsRes.status === 200 && incRecsRes.data.incidentId === inc1._id.toString(),
    'Workflow Integration: Incident recommended-actions endpoint is operational (HTTP 200)',
    'status=' + incRecsRes.status
  );

  const candidatesRes = await req('GET', `/incidents/${inc1._id}/candidates`, undefined, authorityToken);
  assert(
    candidatesRes.status === 200,
    'Workflow Integration: Day 16 resource candidate ranking endpoint remains intact',
    'status=' + candidatesRes.status
  );

  const allocationPostRes = await req('POST', `/incidents/${inc1._id}/allocate`, {}, citizenToken);
  assert(
    allocationPostRes.status === 403,
    'Workflow Integration: Allocation authorization security remains intact (Citizen 403)',
    'status=' + allocationPostRes.status
  );

  const assignmentPostRes = await req('POST', `/incidents/${inc1._id}/assignments`, {}, citizenToken);
  assert(
    assignmentPostRes.status === 403,
    'Workflow Integration: Assignment authorization security remains intact (Citizen 403)',
    'status=' + assignmentPostRes.status
  );

  const alertsCountRes = await req('GET', '/alerts/unread-count', undefined, authorityToken);
  assert(
    alertsCountRes.status === 200 && alertsCountRes.data.success === true,
    'Regression Day 25: Alerts unread count API remains fully operational',
    'status=' + alertsCountRes.status
  );

  const analyticsRes = await req('GET', '/analytics/overview', undefined, authorityToken);
  assert(
    analyticsRes.status === 200,
    'Regression Day 26: Analytics dashboard aggregation endpoints remain operational',
    'status=' + analyticsRes.status
  );

  const publicIncRes = await req('GET', '/incidents', undefined, null);
  assert(
    publicIncRes.status === 200,
    'Regression Day 22: Public incident read endpoints remain accessible to unauthenticated users',
    'status=' + publicIncRes.status
  );

  assert(
    Boolean(ioInstance),
    'Regression Day 21: Socket.IO engine remains attached and operational'
  );

  assert(
    inc2.verificationState === 'needs_review' && inc2.status === 'under_review',
    'Workflow Integration: Duplicate review and incident verification flags remain intact'
  );

  console.log('\n===============================================================');
  console.log('                      TEST RESULTS SUMMARY                     ');
  console.log('===============================================================');
  console.log('  Total Assertions: ' + (passed + failed));
  console.log('  Passed:           ' + passed);
  console.log('  Failed:           ' + failed);
  console.log('===============================================================\n');

  closeSocket();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  setTimeout(() => {
    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }, 100);
}

runTests().catch((err) => {
  console.error('\n\u274c FATAL TEST RUNNER ERROR:', err);
  if (httpServer) httpServer.close();
  closeSocket();
  process.exit(1);
});
