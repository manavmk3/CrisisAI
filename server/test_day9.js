import {
  validateWithJoi,
  formatValidationErrors,
} from './src/services/aiOutputValidator.js';
import { safeParseJSON } from './src/services/aiIncidentSchema.js';
import { buildCorrectionPrompt } from './src/services/aiCorrectionPrompt.js';
import { logValidationFailure, logManualReviewFallback } from './src/services/aiValidationLogger.js';

function makeValidOutput(overrides = {}) {
  return {
    category: 'fire',
    severity: 'high',
    peopleAffected: 5,
    injuries: 2,
    urgency: 'urgent',
    locationClue: 'Near the market',
    requiredResources: ['fire_rescue', 'ambulance'],
    summary: 'A fire broke out near the market area.',
    confidence: 0.85,
    ...overrides,
  };
}

let passCount = 0;
let failCount = 0;
const results = [];

function assert(testId, name, condition, detail = '') {
  const pass = !!condition;
  if (pass) {
    passCount++;
    console.log(`  ✅ PASS — Test ${testId}: ${name}`);
  } else {
    failCount++;
    console.log(`  ❌ FAIL — Test ${testId}: ${name}`);
    if (detail) console.log(`         ${detail}`);
  }
  results.push({ id: testId, name, pass });
}



function runValidationTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SECTION A: JOI VALIDATION TESTS (Offline)');
  console.log('══════════════════════════════════════════════\n');


  {
    const data = makeValidOutput();
    const { valid, errors, sanitized } = validateWithJoi(data);
    assert(1, 'Valid AI output passes validation', valid && sanitized !== null,
      !valid ? `Errors: ${errors.map(e => e.error).join('; ')}` : '');
  }


  {
    const data = makeValidOutput();
    delete data.category;
    const { valid, errors } = validateWithJoi(data);
    assert(2, 'Missing category is rejected',
      !valid && errors.some(e => e.field === 'category'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput();
    delete data.severity;
    const { valid, errors } = validateWithJoi(data);
    assert(3, 'Missing severity is rejected',
      !valid && errors.some(e => e.field === 'severity'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput();
    delete data.urgency;
    const { valid, errors } = validateWithJoi(data);
    assert(4, 'Missing urgency is rejected',
      !valid && errors.some(e => e.field === 'urgency'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ category: 'tornado' });
    const { valid, errors } = validateWithJoi(data);
    assert(5, 'Invalid category "tornado" is rejected',
      !valid && errors.some(e => e.field === 'category'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ severity: 'extreme' });
    const { valid, errors } = validateWithJoi(data);
    assert(6, 'Invalid severity "extreme" is rejected',
      !valid && errors.some(e => e.field === 'severity'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ urgency: 'asap' });
    const { valid, errors } = validateWithJoi(data);
    assert(7, 'Invalid urgency "asap" is rejected',
      !valid && errors.some(e => e.field === 'urgency'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ requiredResources: ['fire_department'] });
    const { valid, errors } = validateWithJoi(data);
    assert(8, 'Invalid resource "fire_department" is rejected',
      !valid && errors.some(e => e.field.includes('requiredResources')),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ peopleAffected: -3 });
    const { valid, errors } = validateWithJoi(data);
    assert(9, 'Negative peopleAffected is rejected',
      !valid && errors.some(e => e.field === 'peopleAffected'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ injuries: -1 });
    const { valid, errors } = validateWithJoi(data);
    assert(10, 'Negative injuries is rejected',
      !valid && errors.some(e => e.field === 'injuries'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ confidence: 1.5 });
    const { valid, errors } = validateWithJoi(data);
    assert(11, 'Confidence > 1 is rejected',
      !valid && errors.some(e => e.field === 'confidence'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ confidence: -0.5 });
    const { valid, errors } = validateWithJoi(data);
    assert(12, 'Confidence < 0 is rejected',
      !valid && errors.some(e => e.field === 'confidence'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ confidence: 'high' });
    const { valid, errors } = validateWithJoi(data);
    assert(13, 'Non-numeric confidence is rejected',
      !valid && errors.some(e => e.field === 'confidence'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const data = makeValidOutput({ summary: '' });
    const { valid, errors } = validateWithJoi(data);
    assert(14, 'Empty summary is rejected',
      !valid && errors.some(e => e.field === 'summary'),
      valid ? 'Should have been rejected' : `Errors: ${errors.map(e => e.error).join('; ')}`);
  }


  {
    const raw = '{ category: fire, severity: high, }}}';
    const { parsed, error } = safeParseJSON(raw);
    assert(15, 'Malformed JSON is detected',
      parsed === null && error !== null,
      parsed !== null ? 'Should have failed parsing' : `Parse error: ${error}`);
  }


  {
    const { parsed: p1, error: e1 } = safeParseJSON('');
    const { parsed: p2, error: e2 } = safeParseJSON(null);
    const { parsed: p3, error: e3 } = safeParseJSON(undefined);
    assert(16, 'Empty AI response is detected',
      p1 === null && p2 === null && p3 === null && e1 !== null && e2 !== null && e3 !== null,
      'One of the empty inputs was not rejected');
  }


  {
    const data = makeValidOutput({
      extraField: 'should be removed',
      internalScore: 99,
      _debug: true,
    });
    const { valid, sanitized } = validateWithJoi(data);
    const hasNoExtra = sanitized && !('extraField' in sanitized) && !('internalScore' in sanitized) && !('_debug' in sanitized);
    assert(17, 'Unexpected fields are stripped by validation',
      valid && hasNoExtra,
      !valid ? 'Validation failed unexpectedly' : (!hasNoExtra ? 'Extra fields were not stripped' : ''));
  }


  {
    const data = makeValidOutput({
      peopleAffected: null,
      injuries: null,
      locationClue: null,
      requiredResources: [],
    });
    const { valid, sanitized } = validateWithJoi(data);
    const nullsPreserved = sanitized &&
      sanitized.peopleAffected === null &&
      sanitized.injuries === null &&
      sanitized.locationClue === null &&
      Array.isArray(sanitized.requiredResources) &&
      sanitized.requiredResources.length === 0;
    assert(18, 'Missing optional information (nulls/empty arrays preserved)',
      valid && nullsPreserved,
      !valid ? 'Validation failed' : (!nullsPreserved ? 'Null/empty values not preserved' : ''));
  }
}

function simulateAnalyzeFlow(responses) {
  let callIndex = 0;

  function mockCallGemini() {
    if (callIndex >= responses.length) {
      return { rawText: null, error: 'No more mock responses' };
    }
    const response = responses[callIndex++];
    if (response.error) {
      return { rawText: null, error: response.error };
    }
    return { rawText: response.rawText, error: null };
  }

  function mockParseAndValidate(rawText) {
    if (!rawText) {
      return { valid: false, sanitized: null, errors: [], parseError: 'Empty response' };
    }
    const { parsed, error: parseError } = safeParseJSON(rawText);
    if (parseError || !parsed) {
      return { valid: false, sanitized: null, errors: [], parseError: parseError || 'Empty response' };
    }
    const { valid, errors, sanitized } = validateWithJoi(parsed);
    return { valid, sanitized, errors, parseError: null };
  }


  const call1 = mockCallGemini();
  if (call1.error) {
    return { status: 'needs_manual_review', data: null, message: 'AI analysis could not be validated. Manual review is required.' };
  }

  const attempt1 = mockParseAndValidate(call1.rawText);
  if (attempt1.valid) {
    return { status: 'analyzed', data: attempt1.sanitized };
  }


  logValidationFailure({
    attempt: 1,
    errors: attempt1.errors,
    parseError: attempt1.parseError,
  });


  const call2 = mockCallGemini();
  if (call2.error) {
    logManualReviewFallback(2);
    return { status: 'needs_manual_review', data: null, message: 'AI analysis could not be validated. Manual review is required.' };
  }

  const attempt2 = mockParseAndValidate(call2.rawText);
  if (attempt2.valid) {
    return { status: 'analyzed', data: attempt2.sanitized };
  }

  logValidationFailure({
    attempt: 2,
    errors: attempt2.errors,
    parseError: attempt2.parseError,
  });
  logManualReviewFallback(2);

  return { status: 'needs_manual_review', data: null, message: 'AI analysis could not be validated. Manual review is required.' };
}

function runFlowTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SECTION B: RETRY/FALLBACK FLOW TESTS (Mock)');
  console.log('══════════════════════════════════════════════\n');

  const validJSON = JSON.stringify(makeValidOutput());
  const invalidJSON = JSON.stringify(makeValidOutput({ category: 'tornado', confidence: 5.0 }));
  const malformedText = '{ not valid json at all }}}';


  {
    const result = simulateAnalyzeFlow([
      { rawText: invalidJSON },
      { rawText: validJSON },
    ]);
    assert(19, 'First invalid → retry valid → returns analyzed',
      result.status === 'analyzed' && result.data !== null,
      `Got status=${result.status}`);
  }


  {
    const result = simulateAnalyzeFlow([
      { rawText: invalidJSON },
      { rawText: invalidJSON },
    ]);
    assert(20, 'First invalid → retry invalid → needs_manual_review',
      result.status === 'needs_manual_review' && result.data === null,
      `Got status=${result.status}`);
  }

  {
    const result = simulateAnalyzeFlow([
      { rawText: validJSON },
    ]);
    assert(21, 'Valid first response → returns analyzed (no retry)',
      result.status === 'analyzed' && result.data !== null,
      `Got status=${result.status}`);
  }


  {
    const result = simulateAnalyzeFlow([
      { rawText: malformedText },
      { rawText: validJSON },
    ]);
    assert(22, 'Malformed first → retry valid → returns analyzed',
      result.status === 'analyzed' && result.data !== null,
      `Got status=${result.status}`);
  }


  {
    const result = simulateAnalyzeFlow([
      { rawText: malformedText },
      { rawText: malformedText },
    ]);
    assert(23, 'Malformed first + malformed retry → needs_manual_review',
      result.status === 'needs_manual_review' && result.data === null,
      `Got status=${result.status}`);
  }
}



function runSupplementalTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SECTION C: SUPPLEMENTAL TESTS');
  console.log('══════════════════════════════════════════════\n');


  {
    const errors = [
      { field: 'category', error: 'Invalid category: "tornado"' },
      { field: 'confidence', error: 'Must be between 0 and 1' },
    ];
    const prompt = buildCorrectionPrompt('A building collapsed near the station.', errors);
    const hasErrors = prompt.includes('tornado') && prompt.includes('confidence');
    const hasSchema = prompt.includes('category') && prompt.includes('severity');
    const hasAntiHallucination = prompt.includes('NEVER invent');
    console.log(`  ${hasErrors && hasSchema && hasAntiHallucination ? '✅' : '❌'} Correction prompt includes errors, schema, and anti-hallucination instructions`);
  }


  {
    let threw = false;
    try {
      logValidationFailure({
        attempt: 1,
        errors: [{ field: 'category', type: 'any.only', error: 'Invalid category' }],
      });
      logValidationFailure({
        attempt: 1,
        parseError: 'JSON parse error',
      });
      logManualReviewFallback(2);
    } catch (e) {
      threw = true;
    }
    console.log(`  ${!threw ? '✅' : '❌'} Validation logger runs without throwing`);
  }


  {
    const data = makeValidOutput({
      summary: '  Fire near market.  ',
      locationClue: '  Main Street  ',
    });
    const { valid, sanitized } = validateWithJoi(data);
    const trimmed = sanitized && sanitized.summary === 'Fire near market.' && sanitized.locationClue === 'Main Street';
    console.log(`  ${valid && trimmed ? '✅' : '❌'} String fields are trimmed by Joi validation`);
  }


  {
    const mockJoiError = {
      details: [
        { path: ['category'], type: 'any.only', message: 'Invalid category' },
        { path: ['confidence'], type: 'number.max', message: 'Must be <= 1' },
      ],
    };
    const formatted = formatValidationErrors(mockJoiError);
    const correct = formatted.length === 2 && formatted[0].field === 'category' && formatted[1].field === 'confidence';
    console.log(`  ${correct ? '✅' : '❌'} formatValidationErrors produces structured output`);
  }


  {
    const formatted = formatValidationErrors(null);
    console.log(`  ${formatted.length === 0 ? '✅' : '❌'} formatValidationErrors handles null input`);
  }
}



function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  CrisisAI — Day 9: Schema Validation &');
  console.log('  Fallback Handling Tests');
  console.log('══════════════════════════════════════════════');
  console.log(`  Time: ${new Date().toISOString()}\n`);

  runValidationTests();
  runFlowTests();
  runSupplementalTests();

  console.log('\n══════════════════════════════════════════════');
  console.log('  DAY 9 TEST RESULTS');
  console.log('──────────────────────────────────────────────');

  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} Test ${r.id} — ${r.name}`);
  }

  console.log('──────────────────────────────────────────────');
  console.log(`  Total:  ${results.length}`);
  console.log(`  Passed: ${passCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log('══════════════════════════════════════════════\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main();
