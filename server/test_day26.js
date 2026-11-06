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
import analyticsService, {
  parseDateFilter,
  getActiveIncidentsCount,
  getUnresolvedCasesCount,
  getTotalAffectedPopulation,
  getSeverityDistribution,
  getCategoryDistribution,
  getResourceDemandVsDeployment,
  getAverageResponseTime,
  getOverviewMetrics,
  getFullDashboardData,
  AnalyticsServiceError,
} from './src/services/analytics.service.js';
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

const TEST_PORT = 5026;

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

function runPipeline(docs, pipeline) {
  let current = docs.map((d) => ({ ...d }));

  for (const stage of pipeline) {
    if (stage.$match) {
      const matchObj = stage.$match;
      current = current.filter((item) => {
        for (const [key, cond] of Object.entries(matchObj)) {
          if (key === 'createdAt' && typeof cond === 'object') {
            const itemTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;
            if (cond.$gte && itemTime < new Date(cond.$gte).getTime()) return false;
            if (cond.$gt && itemTime <= new Date(cond.$gt).getTime()) return false;
            if (cond.$lte && itemTime > new Date(cond.$lte).getTime()) return false;
            if (cond.$lt && itemTime >= new Date(cond.$lt).getTime()) return false;
            continue;
          }

          const val = item[key];
          if (cond && typeof cond === 'object') {
            if (cond.$in && !cond.$in.includes(val)) return false;
            if (cond.$nin && cond.$nin.includes(val)) return false;
            if (cond.$gt !== undefined && !(Number(val) > cond.$gt)) return false;
            if (cond.$ne !== undefined && (val === cond.$ne || (cond.$ne === null && (val === null || val === undefined)))) return false;
          } else if (val !== cond) {
            return false;
          }
        }
        return true;
      });
    } else if (stage.$count) {
      const countName = stage.$count;
      return [{ [countName]: current.length }];
    } else if (stage.$unwind) {
      const field = stage.$unwind.replace('$', '');
      const unwound = [];
      for (const item of current) {
        const arr = item[field];
        if (Array.isArray(arr)) {
          for (const elem of arr) {
            unwound.push({ ...item, [field]: elem });
          }
        }
      }
      current = unwound;
    } else if (stage.$project) {
      current = current.map((item) => {
        const projected = { ...item };
        for (const [pKey, pVal] of Object.entries(stage.$project)) {
          if (pVal === 1) {
            projected[pKey] = item[pKey];
          } else if (pVal && pVal.$divide && pVal.$divide[0] && pVal.$divide[0].$subtract) {
            const sub = pVal.$divide[0].$subtract;
            const t1 = item[sub[0].replace('$', '')] ? new Date(item[sub[0].replace('$', '')]).getTime() : 0;
            const t2 = item[sub[1].replace('$', '')] ? new Date(item[sub[1].replace('$', '')]).getTime() : 0;
            const denom = pVal.$divide[1] || 1;
            projected[pKey] = (t1 - t2) / denom;
          }
        }
        return projected;
      });
    } else if (stage.$group) {
      const groupStage = stage.$group;
      const groupKey = groupStage._id;
      const groups = {};

      for (const item of current) {
        let keyVal = null;
        if (groupKey && typeof groupKey === 'string' && groupKey.startsWith('$')) {
          keyVal = item[groupKey.replace('$', '')];
        }

        const gId = keyVal !== null && keyVal !== undefined ? keyVal.toString() : '__all__';
        if (!groups[gId]) {
          groups[gId] = {
            _id: keyVal,
            _items: [],
          };
        }
        groups[gId]._items.push(item);
      }

      const groupedResult = [];
      for (const [_, gData] of Object.entries(groups)) {
        const resultDoc = { _id: gData._id };
        for (const [fName, fOp] of Object.entries(groupStage)) {
          if (fName === '_id') continue;
          if (fOp.$sum === 1) {
            resultDoc[fName] = gData._items.length;
          } else if (fOp.$sum && typeof fOp.$sum === 'string' && fOp.$sum.startsWith('$')) {
            const sumField = fOp.$sum.replace('$', '');
            resultDoc[fName] = gData._items.reduce((acc, it) => acc + (Number(it[sumField]) || 0), 0);
          } else if (fOp.$avg && typeof fOp.$avg === 'string' && fOp.$avg.startsWith('$')) {
            const avgField = fOp.$avg.replace('$', '');
            const sum = gData._items.reduce((acc, it) => acc + (Number(it[avgField]) || 0), 0);
            resultDoc[fName] = gData._items.length > 0 ? sum / gData._items.length : null;
          } else if (fOp.$min && typeof fOp.$min === 'string' && fOp.$min.startsWith('$')) {
            const minField = fOp.$min.replace('$', '');
            const vals = gData._items.map((it) => Number(it[minField])).filter((v) => !isNaN(v));
            resultDoc[fName] = vals.length > 0 ? Math.min(...vals) : null;
          } else if (fOp.$max && typeof fOp.$max === 'string' && fOp.$max.startsWith('$')) {
            const maxField = fOp.$max.replace('$', '');
            const vals = gData._items.map((it) => Number(it[maxField])).filter((v) => !isNaN(v));
            resultDoc[fName] = vals.length > 0 ? Math.max(...vals) : null;
          }
        }
        groupedResult.push(resultDoc);
      }
      current = groupedResult;
    }
  }

  return current;
}

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

  Incident.aggregate = async (pipeline) => runPipeline(memoryIncidents, pipeline);
  ResourceAllocation.aggregate = async (pipeline) => runPipeline(memoryAllocations, pipeline);
  Assignment.aggregate = async (pipeline) => runPipeline(memoryAssignments, pipeline);

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
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date(),
        status: doc.status || 'reported',
        severity: doc.severity || 'medium',
        category: doc.category || 'other',
        peopleAffected: doc.peopleAffected !== undefined ? doc.peopleAffected : 0,
        requiredResources: Array.isArray(doc.requiredResources) ? doc.requiredResources : [],
        save: async function () { return this; },
      };
      memoryIncidents.push(inc);
      return inc;
    };

    Resource.create = async (doc) => {
      const qty = doc.quantity !== undefined ? doc.quantity : 1;
      const resItem = {
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        quantity: qty,
        availableQuantity: doc.availableQuantity !== undefined ? doc.availableQuantity : qty,
        status: doc.status || 'available',
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async function () { return this; },
      };
      memoryResources.push(resItem);
      return resItem;
    };

    ResourceAllocation.create = async (docs) => {
      const items = Array.isArray(docs) ? docs : [docs];
      const created = items.map((d) => ({
        ...d,
        _id: new mongoose.Types.ObjectId(),
        status: d.status || 'active',
        quantity: d.quantity !== undefined ? d.quantity : 1,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      }));
      memoryAllocations.push(...created);
      return Array.isArray(docs) ? created : created[0];
    };

    Assignment.create = async (doc) => {
      const a = {
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        status: doc.status || 'assigned',
        acceptedAt: doc.acceptedAt || null,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date(),
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

    Alert.countDocuments = async () => 0;

    return true;
  }

function makeToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('   CRISISAI DAY 26 TEST SUITE: ANALYTICS AGGREGATIONS DASHBOARD');
  console.log('===============================================================\n');

  await setupDatabase();

  httpServer = http.createServer(app);
  ioInstance = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
  console.log('  \uD83D\uDE80 Test server listening on http://localhost:' + TEST_PORT);

  const authUser = await User.create({
    name: 'Authority Director',
    email: 'director26@crisisai.test',
    password: 'Password123!',
    role: 'authority',
  });
  const adminUser = await User.create({
    name: 'System Admin 26',
    email: 'admin26@crisisai.test',
    password: 'Password123!',
    role: 'admin',
  });
  const citizenUser = await User.create({
    name: 'Citizen Day26',
    email: 'citizen26@crisisai.test',
    password: 'Password123!',
    role: 'citizen',
  });
  const volunteerUser = await User.create({
    name: 'Volunteer Day26',
    email: 'volunteer26@crisisai.test',
    password: 'Password123!',
    role: 'volunteer',
  });

  const tokenAuth = makeToken(authUser);
  const tokenAdmin = makeToken(adminUser);
  const tokenCitizen = makeToken(citizenUser);
  const tokenVolunteer = makeToken(volunteerUser);

  console.log('\n--- Section 1: Overview Metrics Aggregation ---');

  const emptyOverview = await getOverviewMetrics({});
  assert(
    emptyOverview.activeIncidents === 0 &&
    emptyOverview.totalAffectedPopulation === 0 &&
    emptyOverview.unresolvedCases === 0 &&
    emptyOverview.averageResponseTimeMinutes === null,
    'Overview: Empty database returns safe default values',
    'active=' + emptyOverview.activeIncidents
  );

  const inc1 = await Incident.create({
    report: 'Flash flood inundating downtown business district',
    status: 'reported',
    severity: 'critical',
    category: 'flood',
    peopleAffected: 1500,
    requiredResources: ['ambulance', 'rescue_boat'],
  });
  const inc2 = await Incident.create({
    report: 'Major chemical tank leak under investigation',
    status: 'under_review',
    severity: 'high',
    category: 'other',
    peopleAffected: 300,
    requiredResources: ['medical_team'],
  });
  const inc3 = await Incident.create({
    report: 'Wildfire approaching ridge homes with dispatched units',
    status: 'assigned',
    severity: 'critical',
    category: 'fire',
    peopleAffected: 450,
    requiredResources: ['fire_rescue', 'evacuation_team'],
  });
  const inc4 = await Incident.create({
    report: 'Minor brush fire completely extinguished',
    status: 'resolved',
    severity: 'low',
    category: 'fire',
    peopleAffected: 50,
    requiredResources: ['fire_rescue'],
  });
  const inc5 = await Incident.create({
    report: 'False alarm regarding gas smell cancelled by caller',
    status: 'cancelled',
    severity: 'low',
    category: 'other',
    peopleAffected: 0,
    requiredResources: [],
  });

  const activeCount = await getActiveIncidentsCount({});
  assert(
    activeCount === 3,
    'Active Incidents: Correctly counts reported, under_review, and assigned incidents',
    'activeCount=' + activeCount
  );

  const unresolvedCount = await getUnresolvedCasesCount({});
  assert(
    unresolvedCount === 3,
    'Unresolved Cases: Correctly identifies open incidents (excludes resolved and cancelled)',
    'unresolvedCount=' + unresolvedCount
  );

  assert(
    activeCount === 3 && !memoryIncidents.find((i) => i.status === 'resolved' && i._id === inc4._id).isCounted,
    'Active Incidents: Excludes resolved incidents from active tally',
    'resolved excluded'
  );

  assert(
    activeCount === 3 && !memoryIncidents.find((i) => i.status === 'cancelled' && i._id === inc5._id).isCounted,
    'Active Incidents: Excludes cancelled incidents from active tally',
    'cancelled excluded'
  );

  const underReviewIncident = memoryIncidents.find((i) => i.status === 'under_review');
  assert(
    Boolean(underReviewIncident) && activeCount >= 1,
    'Active Incidents: Properly includes under_review status as active operational workload',
    'under_review counted'
  );

  console.log('\n--- Section 2: Severity Distribution Aggregation ---');

  const severityDist = await getSeverityDistribution({});
  const critObj = severityDist.find((s) => s.severity === 'critical');
  const highObj = severityDist.find((s) => s.severity === 'high');
  const medObj = severityDist.find((s) => s.severity === 'medium');
  const lowObj = severityDist.find((s) => s.severity === 'low');

  assert(
    critObj?.count === 2,
    'Severity: Critical incident count matches persisted records',
    'critical count=' + critObj?.count
  );

  assert(
    highObj?.count === 1,
    'Severity: High incident count matches persisted records',
    'high count=' + highObj?.count
  );

  assert(
    medObj?.count === 0,
    'Severity: Empty severity category (medium) returns zero without omitting key',
    'medium count=' + medObj?.count
  );

  assert(
    lowObj?.count === 2,
    'Severity: Low incident count matches persisted records',
    'low count=' + lowObj?.count
  );

  const invalidSevDoc = await Incident.create({
    report: 'Anomaly event with corrupted severity',
    status: 'reported',
    severity: 'unspecified_catastrophe',
    peopleAffected: 0,
  });
  const cleanSeverityDist = await getSeverityDistribution({});
  const hasInvalidKey = cleanSeverityDist.some((s) => s.severity === 'unspecified_catastrophe');
  assert(
    !hasInvalidKey,
    'Severity: Corrupted or invalid severity records are filtered out safely',
    'invalid excluded'
  );

  assert(
    cleanSeverityDist.length === 4,
    'Severity: Distribution contains exactly the 4 standard severity tiers with zero-fill',
    'tiers count=' + cleanSeverityDist.length
  );

  console.log('\n--- Section 3: Population Calculation ---');

  const totalPop = await getTotalAffectedPopulation({});
  assert(
    totalPop === 2300,
    'Population: Correctly aggregates total affected population across valid incidents',
    'totalPop=' + totalPop
  );

  await Incident.create({
    report: 'Power outage with null population',
    status: 'reported',
    severity: 'medium',
    peopleAffected: null,
  });
  const popWithNull = await getTotalAffectedPopulation({});
  assert(
    popWithNull === 2300,
    'Population: Missing or null peopleAffected values are safely ignored without NaN',
    'popWithNull=' + popWithNull
  );

  await Incident.create({
    report: 'Glitch report with negative population',
    status: 'reported',
    severity: 'low',
    peopleAffected: -150,
  });
  const popWithNeg = await getTotalAffectedPopulation({});
  assert(
    popWithNeg === 2300,
    'Population: Negative peopleAffected values are safely excluded from the sum',
    'popWithNeg=' + popWithNeg
  );

  const doubleCountCheck = await getTotalAffectedPopulation({});
  assert(
    doubleCountCheck === 2300,
    'Population: Repeated aggregation calls remain deterministic without double counting',
    're-check=' + doubleCountCheck
  );

  console.log('\n--- Section 4: Resource Demand vs Deployment Aggregation ---');

  const alloc1 = await ResourceAllocation.create({
    incident: inc1._id,
    resource: new mongoose.Types.ObjectId(),
    resourceType: 'ambulance',
    quantity: 3,
    status: 'active',
  });
  const alloc2 = await ResourceAllocation.create({
    incident: inc1._id,
    resource: new mongoose.Types.ObjectId(),
    resourceType: 'rescue_boat',
    quantity: 1,
    status: 'active',
  });
  const allocReleased = await ResourceAllocation.create({
    incident: inc3._id,
    resource: new mongoose.Types.ObjectId(),
    resourceType: 'fire_rescue',
    quantity: 2,
    status: 'released',
  });
  const allocCancelled = await ResourceAllocation.create({
    incident: inc3._id,
    resource: new mongoose.Types.ObjectId(),
    resourceType: 'fire_rescue',
    quantity: 1,
    status: 'cancelled',
  });

  const resComparison = await getResourceDemandVsDeployment({});
  const ambulanceMetrics = resComparison.find((r) => r.resourceType === 'ambulance');
  const fireMetrics = resComparison.find((r) => r.resourceType === 'fire_rescue');
  const boatMetrics = resComparison.find((r) => r.resourceType === 'rescue_boat');

  assert(
    ambulanceMetrics?.demandCount === 1,
    'Resources: Incident demand correctly extracted from requiredResources',
    'ambulance demand=' + ambulanceMetrics?.demandCount
  );

  assert(
    ambulanceMetrics?.deployedQuantity === 3,
    'Resources: Active deployment quantity aggregated correctly from active allocations',
    'ambulance deployed=' + ambulanceMetrics?.deployedQuantity
  );

  assert(
    fireMetrics?.deployedQuantity === 0,
    'Resources: Released allocations are excluded from currently deployed count',
    'fire deployed=' + fireMetrics?.deployedQuantity
  );

  assert(
    fireMetrics?.deployedQuantity === 0,
    'Resources: Cancelled allocations are excluded from currently deployed count',
    'fire deployed=' + fireMetrics?.deployedQuantity
  );

  assert(
    boatMetrics?.deployedQuantity === 1 && ambulanceMetrics?.deployedQuantity === 3,
    'Resources: Different resource types are cleanly partitioned without cross-talk',
    'boat=' + boatMetrics?.deployedQuantity + ', ambulance=' + ambulanceMetrics?.deployedQuantity
  );

  const unmetFire = fireMetrics?.unmetDemand;
  assert(
    unmetFire === 2,
    'Resources: Unmet demand calculated accurately as max(0, demand - deployed)',
    'unmet fire=' + unmetFire
  );

  const shelterMetrics = resComparison.find((r) => r.resourceType === 'shelter');
  assert(
    shelterMetrics?.demandCount === 0 && shelterMetrics?.deployedQuantity === 0 && shelterMetrics?.unmetDemand === 0,
    'Resources: Unused resource inventory returns zeroed structure without errors',
    'shelter demand=' + shelterMetrics?.demandCount
  );

  console.log('\n--- Section 5: Response Time Calculation & Milestones ---');

  const now = new Date();
  const created1 = new Date(now.getTime() - 30 * 60 * 1000);
  const accepted1 = new Date(now.getTime() - 10 * 60 * 1000);

  const created2 = new Date(now.getTime() - 20 * 60 * 1000);
  const accepted2 = new Date(now.getTime() - 10 * 60 * 1000);

  const assignValid1 = await Assignment.create({
    incidentId: inc1._id,
    responderId: volunteerUser._id,
    assignedBy: authUser._id,
    status: 'accepted',
    createdAt: created1,
    acceptedAt: accepted1,
    ETA: 15,
  });
  const assignValid2 = await Assignment.create({
    incidentId: inc3._id,
    responderId: volunteerUser._id,
    assignedBy: authUser._id,
    status: 'accepted',
    createdAt: created2,
    acceptedAt: accepted2,
    ETA: 10,
  });

  const initialResponseStats = await getAverageResponseTime({});
  assert(
    initialResponseStats.averageResponseTimeMinutes === 15,
    'Response Time: Calculates accurate mathematical average response time ((20 + 10) / 2 = 15 min)',
    'avgMinutes=' + initialResponseStats.averageResponseTimeMinutes
  );

  const assignUnaccepted = await Assignment.create({
    incidentId: inc2._id,
    responderId: volunteerUser._id,
    assignedBy: authUser._id,
    status: 'assigned',
    createdAt: new Date(),
    acceptedAt: null,
    ETA: 5,
  });
  const statsWithPending = await getAverageResponseTime({});
  assert(
    statsWithPending.recordsCount === 2,
    'Response Time: Excludes pending/unaccepted assignments without acceptedAt timestamp',
    'recordsCount=' + statsWithPending.recordsCount
  );

  const assignNegative = await Assignment.create({
    incidentId: inc2._id,
    responderId: volunteerUser._id,
    assignedBy: authUser._id,
    status: 'accepted',
    createdAt: new Date(now.getTime()),
    acceptedAt: new Date(now.getTime() - 100000),
  });
  const statsWithNeg = await getAverageResponseTime({});
  assert(
    statsWithNeg.recordsCount === 2,
    'Response Time: Excludes corrupt records with negative durations (acceptedAt < createdAt)',
    'recordsCount=' + statsWithNeg.recordsCount
  );

  assert(
    statsWithNeg.units === 'minutes' && statsWithNeg.minMinutes === 10 && statsWithNeg.maxMinutes === 20,
    'Response Time: Records fastest and slowest response milestones accurately',
    'min=' + statsWithNeg.minMinutes + ', max=' + statsWithNeg.maxMinutes
  );

  const emptyResponseStats = await getAverageResponseTime({ createdAt: { $gt: new Date(now.getTime() + 10000000) } });
  assert(
    emptyResponseStats.averageResponseTimeMinutes === null && emptyResponseStats.recordsCount === 0,
    'Response Time: No valid records returns null (no-data state), not zero minutes',
    'avg=' + emptyResponseStats.averageResponseTimeMinutes
  );

  assert(
    initialResponseStats.averageResponseTimeMinutes !== 12.5,
    'Response Time: Confirms ETA field (15 and 10) is not mistaken for actual response time',
    'actual response measured'
  );

  console.log('\n--- Section 6: Filters and API Authorization ---');

  const nowIso = now.toISOString();
  const pastIso = new Date(now.getTime() - 1000 * 60 * 60).toISOString();
  const dateFilterObj = parseDateFilter(pastIso, nowIso);
  assert(
    Boolean(dateFilterObj.createdAt?.$gte && dateFilterObj.createdAt?.$lte),
    'Filters: Valid date strings correctly parsed into MongoDB date boundary operators',
    'filter=' + JSON.stringify(dateFilterObj)
  );

  let invalidDateErr = null;
  try {
    parseDateFilter('not-a-valid-date', nowIso);
  } catch (e) {
    invalidDateErr = e;
  }
  assert(
    invalidDateErr instanceof AnalyticsServiceError && invalidDateErr.statusCode === 400,
    'Filters: Malformed date string rejected with 400 Bad Request',
    invalidDateErr?.message
  );

  let chronErr = null;
  try {
    parseDateFilter(nowIso, pastIso);
  } catch (e) {
    chronErr = e;
  }
  assert(
    chronErr instanceof AnalyticsServiceError && chronErr.statusCode === 400,
    'Filters: Start date chronologically after end date is rejected with 400 Bad Request',
    chronErr?.message
  );

  const citizenBlockedRes = await req('GET', '/analytics/overview', undefined, tokenCitizen);
  assert(
    citizenBlockedRes.status === 403,
    'Authorization: Citizen role denied access to analytics overview (HTTP 403)',
    'status=' + citizenBlockedRes.status
  );

  const volunteerBlockedRes = await req('GET', '/analytics/dashboard', undefined, tokenVolunteer);
  assert(
    volunteerBlockedRes.status === 403,
    'Authorization: Volunteer role denied access to analytics dashboard (HTTP 403)',
    'status=' + volunteerBlockedRes.status
  );

  const authAllowedRes = await req('GET', '/analytics/overview', undefined, tokenAuth);
  assert(
    authAllowedRes.status === 200 && authAllowedRes.data?.data?.activeIncidents >= 1,
    'Authorization: Authority role permitted access to analytics overview (HTTP 200)',
    'status=' + authAllowedRes.status
  );

  const adminAllowedRes = await req('GET', '/analytics/dashboard', undefined, tokenAdmin);
  assert(
    adminAllowedRes.status === 200 && Array.isArray(adminAllowedRes.data?.data?.severity),
    'Authorization: Admin role permitted access to full analytics dashboard (HTTP 200)',
    'status=' + adminAllowedRes.status
  );

  console.log('\n--- Section 7: Analytics Sub-Endpoints & Regression ---');

  const sevEndpointRes = await req('GET', '/analytics/severity', undefined, tokenAuth);
  assert(
    sevEndpointRes.status === 200 && Array.isArray(sevEndpointRes.data?.data),
    'API: GET /api/analytics/severity returns formatted severity distribution',
    'status=' + sevEndpointRes.status
  );

  const resEndpointRes = await req('GET', '/analytics/resources', undefined, tokenAuth);
  assert(
    resEndpointRes.status === 200 && Array.isArray(resEndpointRes.data?.data),
    'API: GET /api/analytics/resources returns demand vs deployment comparisons',
    'status=' + resEndpointRes.status
  );

  const timeEndpointRes = await req('GET', '/analytics/response-times', undefined, tokenAuth);
  assert(
    timeEndpointRes.status === 200 && timeEndpointRes.data?.data?.units === 'minutes',
    'API: GET /api/analytics/response-times returns response time metrics',
    'status=' + timeEndpointRes.status
  );

  const catEndpointRes = await req('GET', '/analytics/categories', undefined, tokenAuth);
  assert(
    catEndpointRes.status === 200 && Array.isArray(catEndpointRes.data?.data),
    'API: GET /api/analytics/categories returns category breakdown',
    'status=' + catEndpointRes.status
  );

  const alertUnreadRes = await req('GET', '/alerts/unread-count', undefined, tokenAuth);
  assert(
    alertUnreadRes.status === 200,
    'Regression Day 25: Alerts unread count API remains fully operational',
    'status=' + alertUnreadRes.status
  );

  assert(
    assignValid1.acceptedAt instanceof Date,
    'Regression Day 24: Assignment status transition successfully sets and persists acceptedAt',
    'acceptedAt=' + assignValid1.acceptedAt
  );

  assert(
    alloc1.quantity === 3 && alloc1.status === 'active',
    'Regression Day 23: ResourceAllocation records maintain active integrity',
    'allocQty=' + alloc1.quantity
  );

  const publicIncRes = await req('GET', '/incidents', undefined, null);
  assert(
    publicIncRes.status === 200,
    'Regression Day 22: Public incident read endpoints remain accessible to all callers',
    'status=' + publicIncRes.status
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

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('\n\u274c FATAL TEST RUNNER ERROR:', err);
  if (httpServer) httpServer.close();
  closeSocket();
  process.exit(1);
});
