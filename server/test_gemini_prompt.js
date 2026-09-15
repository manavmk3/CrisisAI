import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildIncidentAnalysisPrompt } from './src/services/aiPrompt.service.js';
import {
  validateAIOutput,
  safeParseJSON,
  CATEGORIES,
  SEVERITY_LEVELS,
  URGENCY_LEVELS,
  REQUIRED_RESOURCES,
} from './src/services/aiIncidentSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
  console.error('❌ GEMINI_API_KEY is not set in server/.env');
  console.error('   Please set a valid Gemini API key and try again.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

const TEST_REPORTS = [
  {
    id: 1,
    name: 'Flood',
    text: 'There is severe flooding near the river. Around 30 people are trapped in houses and need rescue boats and drinking water.',
  },
  {
    id: 2,
    name: 'Fire',
    text: 'A fire has started in a residential building. Smoke is everywhere and around 10 people are trapped.',
  },
  {
    id: 3,
    name: 'Medical',
    text: 'An elderly person collapsed at the railway station and appears unconscious. An ambulance is needed.',
  },
  {
    id: 4,
    name: 'Building Collapse',
    text: 'After the earthquake, a building has collapsed. Five people are injured and several people may be trapped.',
  },
  {
    id: 5,
    name: 'Cyclone',
    text: 'A strong cyclone has damaged several houses in the coastal area. Many families need shelter and drinking water.',
  },
  {
    id: 6,
    name: 'Road Accident',
    text: 'A bus and car have collided on the highway. Several people are injured and an ambulance is needed.',
  },
  {
    id: 7,
    name: 'Landslide',
    text: 'A landslide has blocked the mountain road and several vehicles are stuck. Rescue teams are needed.',
  },
  {
    id: 8,
    name: 'Incomplete Report',
    text: 'There is a disaster near the market. Please send help.',
  },
];

function runFailureModeTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  FAILURE MODE TESTS (Schema Validation)');
  console.log('══════════════════════════════════════════════\n');

  const failureModeResults = [];


  {
    const name = 'Verbose non-JSON output';
    const raw = `Here is the analysis:\n\n{"category":"fire","severity":"high","peopleAffected":10,"injuries":null,"urgency":"urgent","locationClue":null,"requiredResources":["fire_rescue"],"summary":"Residential fire with people trapped.","confidence":0.85}`;
    const { parsed, error } = safeParseJSON(raw);
    if (parsed && !error) {
      const { valid } = validateAIOutput(parsed);
      failureModeResults.push({ name, pass: valid, detail: valid ? 'JSON extracted and validated despite leading text' : 'Extracted JSON failed validation' });
    } else {
      failureModeResults.push({ name, pass: false, detail: `Parse failed: ${error}` });
    }
  }


  {
    const name = 'Missing fields (severity, confidence, category)';
    const raw = JSON.stringify({
      peopleAffected: 5,
      injuries: 2,
      urgency: 'urgent',
      locationClue: 'near bridge',
      requiredResources: ['ambulance'],
      summary: 'Incident near bridge.',
    });
    const { parsed } = safeParseJSON(raw);
    const { valid, errors } = validateAIOutput(parsed);
    const expectedMissing = ['category', 'severity', 'confidence'];
    const detectedAll = expectedMissing.every((f) =>
      errors.some((e) => e.toLowerCase().includes(f))
    );
    failureModeResults.push({
      name,
      pass: !valid && detectedAll,
      detail: !valid ? `Correctly rejected — ${errors.length} errors: ${errors.join('; ')}` : 'WRONGLY accepted',
    });
  }


  {
    const name = 'Invalid severity value ("extreme")';
    const raw = JSON.stringify({
      category: 'fire',
      severity: 'extreme',
      peopleAffected: 5,
      injuries: 0,
      urgency: 'urgent',
      locationClue: null,
      requiredResources: ['fire_rescue'],
      summary: 'Fire incident.',
      confidence: 0.8,
    });
    const { parsed } = safeParseJSON(raw);
    const { valid, errors } = validateAIOutput(parsed);
    failureModeResults.push({
      name,
      pass: !valid && errors.some((e) => e.includes('severity')),
      detail: !valid ? `Correctly rejected: ${errors.join('; ')}` : 'WRONGLY accepted',
    });
  }


  {
    const name = 'Invalid confidence (1.5)';
    const raw = JSON.stringify({
      category: 'flood',
      severity: 'high',
      peopleAffected: 20,
      injuries: 3,
      urgency: 'immediate',
      locationClue: 'river area',
      requiredResources: ['rescue_boat'],
      summary: 'Flood near river.',
      confidence: 1.5,
    });
    const { parsed } = safeParseJSON(raw);
    const { valid, errors } = validateAIOutput(parsed);
    failureModeResults.push({
      name,
      pass: !valid && errors.some((e) => e.includes('confidence')),
      detail: !valid ? `Correctly rejected: ${errors.join('; ')}` : 'WRONGLY accepted',
    });
  }


  {
    const name = 'Malformed JSON';
    const raw = '{ category: fire, severity: high, }}}';
    const { parsed, error } = safeParseJSON(raw);
    failureModeResults.push({
      name,
      pass: parsed === null && error !== null,
      detail: parsed === null ? `Correctly detected parse error: ${error}` : 'WRONGLY parsed malformed JSON',
    });
  }


  {
    const name = 'Invalid resource ("fire_department")';
    const raw = JSON.stringify({
      category: 'fire',
      severity: 'high',
      peopleAffected: 5,
      injuries: 1,
      urgency: 'urgent',
      locationClue: null,
      requiredResources: ['fire_department'],
      summary: 'Fire.',
      confidence: 0.7,
    });
    const { parsed } = safeParseJSON(raw);
    const { valid, errors } = validateAIOutput(parsed);
    failureModeResults.push({
      name,
      pass: !valid && errors.some((e) => e.includes('fire_department')),
      detail: !valid ? `Correctly rejected: ${errors.join('; ')}` : 'WRONGLY accepted',
    });
  }


  for (const r of failureModeResults) {
    const status = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} — ${r.name}`);
    console.log(`         ${r.detail}\n`);
  }

  const fmPassed = failureModeResults.filter((r) => r.pass).length;
  const fmTotal = failureModeResults.length;
  console.log(`  Failure Mode Results: ${fmPassed}/${fmTotal} passed\n`);

  return { passed: fmPassed, total: fmTotal, results: failureModeResults };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithRetry(prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      const isRetryable =
        err.message?.includes('429') ||
        err.message?.includes('503') ||
        err.message?.includes('quota') ||
        err.message?.includes('high demand');

      if (isRetryable && attempt < retries) {
        const waitTime = attempt * 15000;
        console.log(`       ⏳ Rate limited — retrying in ${waitTime / 1000}s (attempt ${attempt}/${retries})...`);
        await delay(waitTime);
        continue;
      }
      throw err;
    }
  }
}

async function testReport(report) {
  const prompt = buildIncidentAnalysisPrompt(report.text);

  try {
    const rawText = await callGeminiWithRetry(prompt);


    const { parsed, error: parseError } = safeParseJSON(rawText);
    if (parseError || !parsed) {
      return {
        id: report.id,
        name: report.name,
        pass: false,
        errors: [`Parse failure: ${parseError}`],
        raw: rawText,
        parsed: null,
      };
    }


    const { valid, errors, sanitized } = validateAIOutput(parsed);

    if (report.id === 8 && valid) {
      const warnings = [];
      if (parsed.peopleAffected !== null && parsed.peopleAffected > 0) {
        warnings.push(`Potential hallucination: peopleAffected=${parsed.peopleAffected} (report does not specify)`);
      }
      if (parsed.injuries !== null && parsed.injuries > 0) {
        warnings.push(`Potential hallucination: injuries=${parsed.injuries} (report does not specify)`);
      }
      if (warnings.length > 0) {
        return {
          id: report.id,
          name: report.name,
          pass: true,
          warnings,
          errors: [],
          parsed,
        };
      }
    }

    return {
      id: report.id,
      name: report.name,
      pass: valid,
      errors,
      parsed: valid ? sanitized : parsed,
      raw: rawText,
    };
  } catch (err) {
    return {
      id: report.id,
      name: report.name,
      pass: false,
      errors: [`Gemini API error: ${err.message}`],
      parsed: null,
    };
  }
}

const INTER_REQUEST_DELAY_MS = 13000;


async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  CrisisAI — Day 7: AI Extraction Prompt Test');
  console.log('══════════════════════════════════════════════');
  console.log(`  Model: gemini-3.6-flash`);
  console.log(`  Test reports: ${TEST_REPORTS.length}`);
  console.log(`  API Key: ${'*'.repeat(8)} (hidden)\n`);


  const failureModes = runFailureModeTests();


  console.log('══════════════════════════════════════════════');
  console.log('  GEMINI API EXTRACTION TESTS');
  console.log('══════════════════════════════════════════════\n');

  const results = [];

  for (let i = 0; i < TEST_REPORTS.length; i++) {
    const report = TEST_REPORTS[i];

    if (i > 0) {
      await delay(INTER_REQUEST_DELAY_MS);
    }

    console.log(`  Testing ${report.id}/${TEST_REPORTS.length}: ${report.name}...`);
    const result = await testReport(report);
    results.push(result);

    if (result.pass) {
      console.log(`    ✅ PASS`);
      if (result.parsed) {
        console.log(`       Category: ${result.parsed.category} | Severity: ${result.parsed.severity} | Urgency: ${result.parsed.urgency}`);
        console.log(`       People: ${result.parsed.peopleAffected ?? 'null'} | Injuries: ${result.parsed.injuries ?? 'null'} | Confidence: ${result.parsed.confidence}`);
        console.log(`       Resources: [${(result.parsed.requiredResources || []).join(', ')}]`);
        console.log(`       Summary: ${result.parsed.summary}`);
      }
      if (result.warnings) {
        for (const w of result.warnings) {
          console.log(`       ⚠️  ${w}`);
        }
      }
    } else {
      console.log(`    ❌ FAIL`);
      for (const err of result.errors) {
        console.log(`       Error: ${err}`);
      }
    }
    console.log();
  }


  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log('══════════════════════════════════════════════');
  console.log('  AI EXTRACTION TEST RESULTS');
  console.log('──────────────────────────────────────────────');
  for (const r of results) {
    console.log(`  Test ${r.id} - ${r.name}: ${r.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log('──────────────────────────────────────────────');
  console.log(`  Total:  ${results.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('──────────────────────────────────────────────');
  console.log(`  Failure Mode Tests: ${failureModes.passed}/${failureModes.total} passed`);
  console.log('══════════════════════════════════════════════\n');

  if (failed > 0 || failureModes.passed < failureModes.total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
