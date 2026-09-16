const BASE_URL = 'http://localhost:8000';
const ENDPOINT = `${BASE_URL}/api/ai/analyze`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUIRED_FIELDS = [
  'category',
  'severity',
  'peopleAffected',
  'injuries',
  'urgency',
  'locationClue',
  'requiredResources',
  'summary',
  'confidence',
];

const VALID_CATEGORIES = [
  'flood', 'earthquake', 'fire', 'cyclone',
  'building_collapse', 'landslide', 'medical_emergency',
  'road_accident', 'other',
];
const VALID_SEVERITY = ['low', 'medium', 'high', 'critical'];
const VALID_URGENCY = ['routine', 'soon', 'urgent', 'immediate'];
const VALID_RESOURCES = [
  'ambulance', 'medical_team', 'fire_rescue', 'search_rescue',
  'food', 'drinking_water', 'shelter', 'rescue_boat',
  'police', 'evacuation_team',
];

function validateExtraction(data) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      errors.push(`Missing field: ${field}`);
    }
  }

  if (data.category && !VALID_CATEGORIES.includes(data.category)) {
    errors.push(`Invalid category: "${data.category}"`);
  }
  if (data.severity && !VALID_SEVERITY.includes(data.severity)) {
    errors.push(`Invalid severity: "${data.severity}"`);
  }
  if (data.urgency && !VALID_URGENCY.includes(data.urgency)) {
    errors.push(`Invalid urgency: "${data.urgency}"`);
  }

  if ('peopleAffected' in data && data.peopleAffected !== null) {
    if (typeof data.peopleAffected !== 'number' || data.peopleAffected < 0) {
      errors.push(`Invalid peopleAffected: ${data.peopleAffected}`);
    }
  }

  if ('injuries' in data && data.injuries !== null) {
    if (typeof data.injuries !== 'number' || data.injuries < 0) {
      errors.push(`Invalid injuries: ${data.injuries}`);
    }
  }

  if ('confidence' in data) {
    if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
      errors.push(`Invalid confidence: ${data.confidence}`);
    }
  }

  if ('requiredResources' in data) {
    if (!Array.isArray(data.requiredResources)) {
      errors.push('requiredResources is not an array');
    } else {
      const invalid = data.requiredResources.filter((r) => !VALID_RESOURCES.includes(r));
      if (invalid.length > 0) {
        errors.push(`Invalid resources: ${invalid.join(', ')}`);
      }
    }
  }

  if ('summary' in data) {
    if (typeof data.summary !== 'string' || data.summary.trim().length === 0) {
      errors.push('summary is empty or not a string');
    }
  }

  return errors;
}

const DISASTER_TESTS = [
  {
    id: 1,
    name: 'Flood',
    report: 'There is severe flooding near Vellore bus stand. Around 30 people are stranded and need rescue boats immediately.',
    expectedCategory: 'flood',
    checkPeopleAffected: 30,
  },
  {
    id: 2,
    name: 'Fire',
    report: 'A large fire has broken out in a building near the market. Several people may be trapped and fire rescue is urgently required.',
    expectedCategory: 'fire',
  },
  {
    id: 3,
    name: 'Medical Emergency',
    report: 'An unconscious person needs an ambulance immediately near Katpadi railway station.',
    expectedCategory: 'medical_emergency',
  },
  {
    id: 4,
    name: 'Building Collapse',
    report: 'A building has collapsed and several people may be trapped underneath the debris. Search and rescue teams and ambulances are required.',
    expectedCategory: 'building_collapse',
  },
  {
    id: 5,
    name: 'Incomplete Report',
    report: 'Something bad happened near the road.',
    checkNoHallucination: true,
  },
];

const ERROR_TESTS = [
  {
    id: 'E1',
    name: 'Empty report string',
    body: { report: '' },
    expectedStatus: 400,
  },
  {
    id: 'E2',
    name: 'Missing report field',
    body: {},
    expectedStatus: 400,
  },
  {
    id: 'E3',
    name: 'Report is a number (invalid type)',
    body: { report: 12345 },
    expectedStatus: 400,
  },
  {
    id: 'E4',
    name: 'Report is null',
    body: { report: null },
    expectedStatus: 400,
  },
  {
    id: 'E5',
    name: 'Report is an array (invalid type)',
    body: { report: ['flood', 'fire'] },
    expectedStatus: 400,
  },
  {
    id: 'E6',
    name: 'Report is whitespace only',
    body: { report: '   \n\t  ' },
    expectedStatus: 400,
  },
  {
    id: 'E7',
    name: 'Invalid content type (plain text)',
    body: 'This is plain text, not JSON',
    contentType: 'text/plain',
    expectedStatus: [400, 415, 422, 500],
  },
];

async function makeRequest(body, contentType = 'application/json') {
  const headers = {};
  let bodyStr;

  if (contentType === 'application/json') {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(body);
  } else {
    headers['Content-Type'] = contentType;
    bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: bodyStr,
  });

  const data = await response.json();
  return { status: response.status, data };
}

async function runDisasterTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  DISASTER REPORT TESTS (via /api/ai/analyze)');
  console.log('══════════════════════════════════════════════\n');

  const results = [];
  const INTER_REQUEST_DELAY = 13000;

  for (let i = 0; i < DISASTER_TESTS.length; i++) {
    const test = DISASTER_TESTS[i];

    if (i > 0) {
      console.log(`     ⏳ Waiting ${INTER_REQUEST_DELAY / 1000}s before next request...\n`);
      await delay(INTER_REQUEST_DELAY);
    }

    console.log(`  Test ${test.id}/${DISASTER_TESTS.length}: ${test.name}`);
    console.log(`  Report: "${test.report.substring(0, 80)}..."`);

    try {
      const { status, data: responseData } = await makeRequest({ report: test.report });
      const errors = [];

      if (status !== 200) {
        errors.push(`Expected HTTP 200, got ${status}`);
      }

      if (!responseData.success) {
        errors.push(`success=false: ${responseData.error || 'unknown error'}`);
      }

      if (responseData.success && responseData.data) {
        const extraction = responseData.data;
        const validationErrors = validateExtraction(extraction);
        errors.push(...validationErrors);

        if (test.expectedCategory && extraction.category !== test.expectedCategory) {
          errors.push(`Expected category "${test.expectedCategory}", got "${extraction.category}"`);
        }

        if (test.checkPeopleAffected !== undefined && extraction.peopleAffected !== test.checkPeopleAffected) {
          console.log(`    ⚠️  Expected peopleAffected=${test.checkPeopleAffected}, got ${extraction.peopleAffected}`);
        }

        if (test.checkNoHallucination && extraction) {
          if (extraction.peopleAffected !== null && extraction.peopleAffected > 0) {
            console.log(`    ⚠️  Potential hallucination: peopleAffected=${extraction.peopleAffected} (not in report)`);
          }
          if (extraction.injuries !== null && extraction.injuries > 0) {
            console.log(`    ⚠️  Potential hallucination: injuries=${extraction.injuries} (not in report)`);
          }
        }

        if (errors.length === 0) {
          console.log(`    ✅ PASS`);
          console.log(`       Category: ${extraction.category} | Severity: ${extraction.severity} | Urgency: ${extraction.urgency}`);
          console.log(`       People: ${extraction.peopleAffected ?? 'null'} | Injuries: ${extraction.injuries ?? 'null'} | Confidence: ${extraction.confidence}`);
          console.log(`       Resources: [${(extraction.requiredResources || []).join(', ')}]`);
          console.log(`       Summary: ${extraction.summary}`);
        }
      }

      if (errors.length > 0) {
        console.log(`    ❌ FAIL`);
        errors.forEach((e) => console.log(`       Error: ${e}`));
      }

      results.push({ id: test.id, name: test.name, pass: errors.length === 0, errors });
    } catch (err) {
      console.log(`    ❌ FAIL — Network/request error: ${err.message}`);
      results.push({ id: test.id, name: test.name, pass: false, errors: [err.message] });
    }

    console.log();
  }

  return results;
}

async function runErrorTests() {
  console.log('══════════════════════════════════════════════');
  console.log('  ERROR HANDLING TESTS');
  console.log('══════════════════════════════════════════════\n');

  const results = [];

  for (const test of ERROR_TESTS) {
    console.log(`  Test ${test.id}: ${test.name}`);

    try {
      const { status, data } = await makeRequest(test.body, test.contentType || 'application/json');
      const errors = [];

      const expectedStatuses = Array.isArray(test.expectedStatus) ? test.expectedStatus : [test.expectedStatus];
      if (!expectedStatuses.includes(status)) {
        errors.push(`Expected HTTP ${expectedStatuses.join('|')}, got ${status}`);
      }

      if (data.success !== false) {
        errors.push(`Expected success=false, got ${data.success}`);
      }

      const hasError = data.error || (data.error && data.error.message);
      if (!hasError) {
        errors.push('Missing error message in response');
      }

      const responseStr = JSON.stringify(data);
      if (responseStr.includes('GEMINI_API_KEY') || responseStr.includes('AIza')) {
        errors.push('Response contains API key — SECURITY ISSUE');
      }
      if (responseStr.includes('at ') && responseStr.includes('.js:')) {
        errors.push('Response may contain stack trace');
      }

      if (errors.length === 0) {
        console.log(`    ✅ PASS — HTTP ${status}: "${data.error}"`);
      } else {
        console.log(`    ❌ FAIL`);
        errors.forEach((e) => console.log(`       Error: ${e}`));
      }

      results.push({ id: test.id, name: test.name, pass: errors.length === 0, errors });
    } catch (err) {
      console.log(`    ❌ FAIL — Network/request error: ${err.message}`);
      results.push({ id: test.id, name: test.name, pass: false, errors: [err.message] });
    }

    console.log();
  }

  return results;
}

async function checkServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  CrisisAI — Day 8: /api/ai/analyze Tests');
  console.log('══════════════════════════════════════════════');
  console.log(`  Endpoint: ${ENDPOINT}`);
  console.log(`  Time: ${new Date().toISOString()}\n`);

  const serverUp = await checkServerRunning();
  if (!serverUp) {
    console.error('  ❌ Server is not running at ' + BASE_URL);
    console.error('  Please start the server with: cd server && npm run dev');
    process.exit(1);
  }
  console.log('  ✅ Server is running\n');

  const errorResults = await runErrorTests();

  const disasterResults = await runDisasterTests();

  console.log('══════════════════════════════════════════════');
  console.log('  DAY 8 TEST RESULTS');
  console.log('──────────────────────────────────────────────');

  console.log('\n  Error Handling Tests:');
  for (const r of errorResults) {
    console.log(`    ${r.pass ? '✅' : '❌'} ${r.id} — ${r.name}`);
  }

  console.log('\n  Disaster Report Tests:');
  for (const r of disasterResults) {
    console.log(`    ${r.pass ? '✅' : '❌'} ${r.id} — ${r.name}`);
  }

  const totalPassed = [...errorResults, ...disasterResults].filter((r) => r.pass).length;
  const totalTests = errorResults.length + disasterResults.length;

  console.log('\n──────────────────────────────────────────────');
  console.log(`  Error Tests:    ${errorResults.filter((r) => r.pass).length}/${errorResults.length} passed`);
  console.log(`  Disaster Tests: ${disasterResults.filter((r) => r.pass).length}/${disasterResults.length} passed`);
  console.log(`  Total:          ${totalPassed}/${totalTests} passed`);
  console.log('══════════════════════════════════════════════\n');

  if (totalPassed < totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
