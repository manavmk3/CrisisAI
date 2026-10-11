import dns from 'dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';
import Resource from './src/models/Resource.js';
import app from './src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

async function req(method, pathStr, body, token) {
  const url = `http://localhost:${config.port || 8000}/api${pathStr}`;
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

async function runDay18Tests() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🗺️ DAY 18: INTERACTIVE MAP FOUNDATION & REGRESSION SUITE');
  console.log('════════════════════════════════════════════════════════════\n');

  console.log('[SECTION 1] Static File & Leaflet Configuration Inspection');
  
  const clientPkgPath = path.join(rootDir, 'client', 'package.json');
  assert(fs.existsSync(clientPkgPath), 'client/package.json exists');
  const clientPkg = JSON.parse(fs.readFileSync(clientPkgPath, 'utf8'));
  assert(Boolean(clientPkg.dependencies?.leaflet), 'leaflet is installed in client dependencies', clientPkg.dependencies?.leaflet);
  assert(Boolean(clientPkg.dependencies?.['react-leaflet']), 'react-leaflet is installed in client dependencies', clientPkg.dependencies?.['react-leaflet']);

  const incidentMapPath = path.join(rootDir, 'client', 'src', 'components', 'IncidentMap.jsx');
  assert(fs.existsSync(incidentMapPath), 'client/src/components/IncidentMap.jsx exists');
  const incidentMapContent = fs.readFileSync(incidentMapPath, 'utf8');
  assert(incidentMapContent.includes('react-leaflet'), 'IncidentMap imports react-leaflet components');
  assert(incidentMapContent.includes('TileLayer'), 'IncidentMap utilizes TileLayer');
  assert(incidentMapContent.includes('openstreetmap.org'), 'IncidentMap configures OpenStreetMap tile provider');
  assert(incidentMapContent.includes('contributors') && incidentMapContent.includes('OpenStreetMap'), 'IncidentMap preserves required OpenStreetMap attribution');
  assert(incidentMapContent.includes('tileerror'), 'IncidentMap handles tile loading errors gracefully');

  const mainJsxPath = path.join(rootDir, 'client', 'src', 'main.jsx');
  const mainJsxContent = fs.readFileSync(mainJsxPath, 'utf8');
  assert(mainJsxContent.includes('leaflet/dist/leaflet.css'), 'main.jsx imports leaflet.css');

  const indexCssPath = path.join(rootDir, 'client', 'src', 'index.css');
  const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');
  assert(indexCssContent.includes('.leaflet-container'), 'index.css contains leaflet container responsive height rules');

  const coordUtilPath = path.join(rootDir, 'client', 'src', 'utils', 'coordinateValidation.js');
  assert(fs.existsSync(coordUtilPath), 'coordinateValidation.js exists');

  const coordUtils = await import(`file://${coordUtilPath.replace(/\\/g, '/')}`);

  console.log('\n[SECTION 2] Coordinate Validation & Anti-Fabrication Safeguards');
  assert(coordUtils.isValidLatitude(0) === true, 'Latitude 0 (equator) is valid');
  assert(coordUtils.isValidLatitude(90) === true, 'Latitude 90 is valid');
  assert(coordUtils.isValidLatitude(-90) === true, 'Latitude -90 is valid');
  assert(coordUtils.isValidLatitude(90.1) === false, 'Latitude > 90 is rejected');
  assert(coordUtils.isValidLatitude(-90.1) === false, 'Latitude < -90 is rejected');
  assert(coordUtils.isValidLatitude(null) === false, 'Null latitude is rejected');
  assert(coordUtils.isValidLatitude('') === false, 'Empty string latitude is rejected');
  assert(coordUtils.isValidLatitude('not-a-number') === false, 'Non-numeric string latitude is rejected');

  assert(coordUtils.isValidLongitude(0) === true, 'Longitude 0 is valid');
  assert(coordUtils.isValidLongitude(180) === true, 'Longitude 180 is valid');
  assert(coordUtils.isValidLongitude(-180) === true, 'Longitude -180 is valid');
  assert(coordUtils.isValidLongitude(180.01) === false, 'Longitude > 180 is rejected');
  assert(coordUtils.isValidLongitude(-180.01) === false, 'Longitude < -180 is rejected');
  assert(coordUtils.isValidLongitude(null) === false, 'Null longitude is rejected');

  const incWithNoCoords = { summary: 'Fire', coordinates: { latitude: null, longitude: null } };
  const extMissing = coordUtils.extractIncidentCoordinates(incWithNoCoords);
  assert(extMissing.hasCoordinates === false, 'Incident without coordinates returns hasCoordinates=false');
  assert(extMissing.latitude === null && extMissing.longitude === null, 'No coordinates are fabricated or generated');

  const incWithValidCoords = { summary: 'Flood', coordinates: { latitude: 13.0827, longitude: 80.2707 } };
  const extValid = coordUtils.extractIncidentCoordinates(incWithValidCoords);
  assert(extValid.hasCoordinates === true, 'Valid coordinates are recognized');
  assert(extValid.latitude === 13.0827 && extValid.longitude === 80.2707, 'Extracted coordinates match input exactly');

  console.log('\n[SECTION 3] UI Integration Verification');
  const dashboardPath = path.join(rootDir, 'client', 'src', 'pages', 'Dashboard.jsx');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
  assert(dashboardContent.includes('IncidentMap'), 'Dashboard.jsx imports and integrates IncidentMap');
  assert(dashboardContent.includes('Live Crisis Map'), 'Dashboard.jsx contains Live Crisis Map operational view');
  assert(dashboardContent.includes('useSearchParams'), 'Dashboard.jsx supports ?view=map query parameter from sidebar');

  const incidentDetailPath = path.join(rootDir, 'client', 'src', 'pages', 'IncidentDetail.jsx');
  const incidentDetailContent = fs.readFileSync(incidentDetailPath, 'utf8');
  assert(incidentDetailContent.includes('IncidentMap'), 'IncidentDetail.jsx imports and integrates IncidentMap');

  console.log('\n[SECTION 4] Vite Production Bundle Check');
  const distDir = path.join(rootDir, 'client', 'dist');
  assert(fs.existsSync(distDir), 'client/dist directory exists from production build');
  const distFiles = fs.readdirSync(path.join(distDir, 'assets'));
  const jsBundles = distFiles.filter((f) => f.endsWith('.js'));
  const cssBundles = distFiles.filter((f) => f.endsWith('.css'));
  assert(jsBundles.length > 0, 'Production JS bundle generated', jsBundles.join(', '));
  assert(cssBundles.length > 0, 'Production CSS bundle generated', cssBundles.join(', '));

  console.log('\n[SECTION 5] Backend API & Database Regressions');
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

  const resList = await req('GET', '/incidents?sort=priority');
  assert(resList.status === 200, 'GET /api/incidents returns HTTP 200');
  assert(resList.data?.success === true, 'GET /api/incidents returns success=true');

  const resStatus = await req('GET', '/incidents?status=reported');
  assert(resStatus.status === 200, 'GET /api/incidents?status=reported returns HTTP 200');

  const resResources = await req('GET', '/resources');
  assert(resResources.status === 200, 'GET /api/resources returns HTTP 200');

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`🎉 DAY 18 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (serverInstance) serverInstance.close();
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDay18Tests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
