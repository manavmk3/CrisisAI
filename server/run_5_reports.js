import dns from 'dns';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/config/env.js';
import User from './src/models/User.js';
import Incident from './src/models/Incident.js';

if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {}
}

const BASE_URL = `http://localhost:${config.port || 8000}/api/incidents`;

const REPORTS = [
  {
    name: 'REPORT 1 — FLOOD',
    report: 'Heavy flooding has entered several houses near Vellore. Around 30 people are affected and drinking water and rescue boats are urgently needed.',
    location: 'Vellore Riverside Colony',
    urgency: 'immediate',
    needs: ['rescue_boat', 'drinking_water'],
  },
  {
    name: 'REPORT 2 — FIRE',
    report: 'A major fire has broken out in a building near the bus stand. Around 10 people may be trapped and ambulances and fire rescue teams are urgently needed.',
    location: 'Near Vellore Bus Stand',
    urgency: 'immediate',
    needs: ['fire_rescue', 'ambulance'],
  },
  {
    name: 'REPORT 3 — MEDICAL',
    report: 'An injured person is unconscious after a serious accident. An ambulance and medical team are needed immediately.',
    location: 'Katpadi Main Road',
    urgency: 'immediate',
    needs: ['ambulance', 'medical_team'],
  },
  {
    name: 'REPORT 4 — BUILDING COLLAPSE',
    report: 'A building has collapsed near the market. Several people may be trapped under the debris and search and rescue teams are needed immediately.',
    location: 'Central Market Square',
    urgency: 'immediate',
    needs: ['search_rescue', 'ambulance'],
  },
  {
    name: 'REPORT 5 — ROAD ACCIDENT',
    report: 'A serious road accident has occurred on the highway. Multiple people are injured and ambulances are urgently needed.',
    location: 'Chennai-Bengaluru Highway KM 118',
    urgency: 'immediate',
    needs: ['ambulance', 'police'],
  },
  {
    name: 'REPORT 6 — LANDSLIDE',
    report: 'A landslide has blocked the road near a hillside area. Several families may need evacuation and shelter.',
    location: 'Yelagiri Hill Road Section 4',
    urgency: 'urgent',
    needs: ['evacuation_team', 'shelter'],
  },
];

async function submitWithRetry(payload, token, maxRetries = 3) {
  for (let a = 1; a <= maxRetries; a++) {
    try {
      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 429 || res.status === 503) {
        console.log(`      ⏳ Received HTTP ${res.status} — waiting 12s before retry (attempt ${a}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, 12000));
        continue;
      }

      return res;
    } catch (err) {
      if (a === maxRetries) throw err;
      console.log(`      ⏳ Network issue (${err.message}) — waiting 8s...`);
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  return fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

async function runReports() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('📋 CRISISAI DAY 12: 5+ DISASTER REPORTS PIPELINE VERIFICATION');
  console.log('════════════════════════════════════════════════════════════\n');

  await mongoose.connect(config.mongoUri);

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

  const results = [];

  for (let i = 0; i < REPORTS.length; i++) {
    const item = REPORTS[i];
    console.log(`\n────────────────────────────────────────────────────────────`);
    console.log(`Submitting [${i + 1}/${REPORTS.length}]: ${item.name}`);
    console.log(`Report: "${item.report}"`);
    console.log(`Location: "${item.location}" | Urgency: "${item.urgency}"`);

    const res = await submitWithRetry(
      {
        report: item.report,
        location: item.location,
        urgency: item.urgency,
        needs: item.needs,
      },
      token
    );

    const body = await res.json();

    if (res.status === 201 && body.success && body.data) {
      const inc = body.data;
      console.log(`  ✅ SUCCESS — HTTP 201 Created`);
      console.log(`     MongoDB ID:     ${inc._id}`);
      console.log(`     Category:       ${inc.category}`);
      console.log(`     Severity:       ${inc.severity}`);
      console.log(`     Urgency:        ${inc.urgency}`);
      console.log(`     People:         ${inc.peopleAffected}`);
      console.log(`     Injuries:       ${inc.injuries}`);
      console.log(`     Priority Score: ${inc.priorityScore} / 100`);
      console.log(`     Summary:        ${inc.summary}`);
      console.log(`     AI Confidence:  ${(inc.aiConfidence * 100).toFixed(0)}%`);
      console.log(`     Resources:      [${inc.requiredResources?.join(', ')}]`);
      console.log(`     Status:         ${inc.status}`);

      results.push({
        name: item.name,
        id: inc._id,
        category: inc.category,
        severity: inc.severity,
        urgency: inc.urgency,
        priorityScore: inc.priorityScore,
        status: inc.status,
        resources: inc.requiredResources,
        summary: inc.summary,
      });
    } else {
      console.error(`  ❌ FAILED — HTTP ${res.status}:`, body);
    }

    if (i < REPORTS.length - 1) {
      console.log('     ⏳ Waiting 6s between submissions to respect rate limits...');
      await new Promise((r) => setTimeout(r, 6000));
    }
  }

  // -------------------------------------------------------------
  // Verify GET /api/incidents priority sorted order
  // -------------------------------------------------------------
  console.log('\n\n════════════════════════════════════════════════════════════');
  console.log('📊 VERIFYING DASHBOARD API QUEUE SORTING (GET /api/incidents)');
  console.log('════════════════════════════════════════════════════════════\n');

  const listRes = await fetch(`${BASE_URL}?sort=priority`);
  const listData = await listRes.json();

  console.log(`Total incidents returned: ${listData.data.length}\n`);
  console.log(`RANK | SCORE  | CATEGORY            | SEVERITY | STATUS   | ID                       | SUMMARY`);
  console.log(`─────┼────────┼─────────────────────┼──────────┼──────────┼──────────────────────────┼───────────────────────────────────────`);

  listData.data.forEach((inc, idx) => {
    const rank = String(idx + 1).padStart(4, ' ');
    const score = String(inc.priorityScore).padStart(5, ' ') + '/100';
    const cat = (inc.category || '').padEnd(19, ' ');
    const sev = (inc.severity || '').padEnd(8, ' ');
    const st = (inc.status || '').padEnd(8, ' ');
    const id = (inc._id || inc.id || '').padEnd(24, ' ');
    const sum = (inc.summary || '').slice(0, 39);
    console.log(`${rank} │ ${score} │ ${cat} │ ${sev} │ ${st} │ ${id} │ ${sum}`);
  });

  // Verify descending sort
  let properlySorted = true;
  for (let i = 0; i < listData.data.length - 1; i++) {
    const cur = Number(listData.data[i].priorityScore) || 0;
    const nxt = Number(listData.data[i + 1].priorityScore) || 0;
    if (cur < nxt) {
      properlySorted = false;
      console.error(`❌ Sort violation at #${i + 1} (${cur}) vs #${i + 2} (${nxt})`);
    }
  }

  if (properlySorted) {
    console.log(`\n✅ CONFIRMED: Dashboard API returns incidents strictly sorted by priority score DESCENDING!`);
  } else {
    console.error(`\n❌ ERROR: Incidents are NOT properly sorted!`);
  }

  await mongoose.disconnect();
}

runReports();
