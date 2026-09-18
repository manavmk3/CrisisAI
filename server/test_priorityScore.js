import {
  calculatePriorityScore,
  WEIGHTS,
  DEFAULTS,
  POPULATION_CAP,
  normalizePopulation,
  clamp01,
  normalizeEnum,
} from './src/services/priorityScore.js';

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

function scoreInRange(result) {
  return typeof result.score === 'number' && result.score >= 0 && result.score <= 100;
}

function breakdownSumsToScore(result) {
  const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0);
  return Math.abs(Math.round(sum) - result.score) <= 1;
}

function makeCriticalIncident(overrides = {}) {
  return {
    severity: 'critical',
    peopleAffected: 5000,
    urgency: 'immediate',
    confidence: 0.95,
    vulnerability: 0.9,
    resourceShortage: 0.9,
    locationContext: 0.8,
    ...overrides,
  };
}

function runCoreScoringTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SECTION A: CORE SCORING TESTS');
  console.log('══════════════════════════════════════════════\n');

  {
    const incident = makeCriticalIncident();
    const result = calculatePriorityScore(incident);
    assert(1, 'Critical incident → high score (≥80)',
      result.score >= 80 && scoreInRange(result),
      `Got score=${result.score}`);
  }

  {
    const incident = {
      severity: 'high',
      peopleAffected: 200,
      urgency: 'urgent',
      confidence: 0.8,
    };
    const result = calculatePriorityScore(incident);
    assert(2, 'High-severity incident → moderate-high score (≥50)',
      result.score >= 50 && scoreInRange(result),
      `Got score=${result.score}`);
  }

  {
    const incident = {
      severity: 'medium',
      peopleAffected: 20,
      urgency: 'soon',
      confidence: 0.6,
    };
    const result = calculatePriorityScore(incident);
    assert(3, 'Medium incident → moderate score',
      result.score >= 30 && result.score <= 70 && scoreInRange(result),
      `Got score=${result.score}`);
  }

  {
    const incident = {
      severity: 'low',
      peopleAffected: 2,
      urgency: 'routine',
      confidence: 0.5,
      vulnerability: 0.1,
      resourceShortage: 0.1,
      locationContext: 0.2,
    };
    const result = calculatePriorityScore(incident);
    assert(4, 'Low incident → low score (≤40)',
      result.score <= 40 && scoreInRange(result),
      `Got score=${result.score}`);
  }

  {
    const inc1 = { severity: 'medium', peopleAffected: 10, urgency: 'soon', confidence: 0.7 };
    const inc2 = { severity: 'medium', peopleAffected: 50000, urgency: 'soon', confidence: 0.7 };
    const r1 = calculatePriorityScore(inc1);
    const r2 = calculatePriorityScore(inc2);
    assert(5, 'Higher population → higher score',
      r2.score > r1.score,
      `pop=10 score=${r1.score}, pop=50000 score=${r2.score}`);
  }

  {
    const incident = { severity: 'medium', peopleAffected: 0, urgency: 'soon', confidence: 0.7 };
    const result = calculatePriorityScore(incident);
    assert(6, 'peopleAffected=0 → affectedPopulation breakdown is 0',
      result.breakdown.affectedPopulation === 0 && scoreInRange(result),
      `Got affectedPopulation=${result.breakdown.affectedPopulation}`);
  }

  {
    const incident = { severity: 'medium', urgency: 'soon', confidence: 0.7 };
    const result = calculatePriorityScore(incident);
    assert(7, 'Missing peopleAffected → default 0.5 applied',
      result.breakdown.affectedPopulation === 10 && scoreInRange(result),
      `Got affectedPopulation=${result.breakdown.affectedPopulation}`);
  }
}

function runEdgeCaseTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SECTION B: EDGE CASE TESTS');
  console.log('══════════════════════════════════════════════\n');

  {
    const incident = { severity: 'critical', peopleAffected: 1000, urgency: 'immediate', confidence: 0.1 };
    const result = calculatePriorityScore(incident);
    assert(8, 'Critical + low confidence → still high (severity dominates)',
      result.score >= 50 && scoreInRange(result),
      `Got score=${result.score}, confidence contribution=${result.breakdown.confidence}`);
  }

  {
    const incident = { severity: 'high', peopleAffected: 10000, urgency: 'urgent', confidence: 0.8, resourceShortage: 1.0 };
    const result = calculatePriorityScore(incident);
    assert(9, 'High pop + max resource shortage → very high score',
      result.score >= 70 && scoreInRange(result),
      `Got score=${result.score}`);
  }

  {
    const inc1 = { severity: 'medium', peopleAffected: 50, urgency: 'routine', confidence: 0.7 };
    const inc2 = { severity: 'medium', peopleAffected: 50, urgency: 'immediate', confidence: 0.7 };
    const r1 = calculatePriorityScore(inc1);
    const r2 = calculatePriorityScore(inc2);
    assert(10, 'Immediate urgency → higher than routine urgency',
      r2.score > r1.score && r2.breakdown.timeSensitivity > r1.breakdown.timeSensitivity,
      `routine=${r1.score}, immediate=${r2.score}`);
  }

  {
    const incident = { severity: 'low', peopleAffected: 5, urgency: 'routine', confidence: 0.5 };
    const result = calculatePriorityScore(incident);
    assert(11, 'Routine urgency → timeSensitivity is 2.5 (0.25 × 10)',
      result.breakdown.timeSensitivity === 2.5,
      `Got timeSensitivity=${result.breakdown.timeSensitivity}`);
  }

  {
    const incident = { severity: 'high', peopleAffected: 100, urgency: 'urgent', confidence: 0.8 };
    const result = calculatePriorityScore(incident);
    assert(12, 'Missing optional factors → defaults applied (each = weight × 0.5)',
      result.breakdown.vulnerability === 7.5 &&
      result.breakdown.resourceShortage === 7.5 &&
      result.breakdown.locationContext === 5,
      `vulnerability=${result.breakdown.vulnerability}, resourceShortage=${result.breakdown.resourceShortage}, locationContext=${result.breakdown.locationContext}`);
  }

  {
    const incident = { severity: 'high', peopleAffected: 10_000_000, urgency: 'urgent', confidence: 0.8 };
    const result = calculatePriorityScore(incident);
    assert(13, 'Very large population (10M) → capped at 1.0 (affectedPopulation = 20)',
      result.breakdown.affectedPopulation === 20 && scoreInRange(result),
      `Got affectedPopulation=${result.breakdown.affectedPopulation}`);
  }

  {
    const result = calculatePriorityScore('not an object');
    assert(14, 'String input → does not throw, uses defaults',
      scoreInRange(result) && result.breakdown !== undefined,
      `Got score=${result.score}`);
  }

  {
    const result = calculatePriorityScore({});
    assert(15, 'Empty object → all defaults, valid score',
      scoreInRange(result) && breakdownSumsToScore(result),
      `Got score=${result.score}`);
  }

  {
    const result = calculatePriorityScore(null);
    assert(16, 'Null incident → does not throw, uses defaults',
      scoreInRange(result) && breakdownSumsToScore(result),
      `Got score=${result.score}`);
  }

  {
    const result = calculatePriorityScore(undefined);
    assert(17, 'Undefined incident → does not throw, uses defaults',
      scoreInRange(result) && breakdownSumsToScore(result),
      `Got score=${result.score}`);
  }

  {
    const incident = { severity: 'medium', peopleAffected: -50, urgency: 'soon', confidence: 0.6 };
    const result = calculatePriorityScore(incident);
    assert(18, 'Negative population → clamped to 0',
      result.breakdown.affectedPopulation === 0 && scoreInRange(result),
      `Got affectedPopulation=${result.breakdown.affectedPopulation}`);
  }

  {
    const incident = { severity: 'medium', confidence: -0.5 };
    const result = calculatePriorityScore(incident);
    assert(19, 'Negative confidence → clamped to 0',
      result.breakdown.confidence === 0 && scoreInRange(result),
      `Got confidence=${result.breakdown.confidence}`);
  }

  {
    const incident = { severity: 'medium', confidence: 1.5 };
    const result = calculatePriorityScore(incident);
    assert(20, 'Confidence > 1 → clamped to 1 (confidence = 5)',
      result.breakdown.confidence === 5 && scoreInRange(result),
      `Got confidence=${result.breakdown.confidence}`);
  }

  {
    const incident = { severity: 'extreme', peopleAffected: 10, urgency: 'urgent', confidence: 0.7 };
    const result = calculatePriorityScore(incident);
    assert(21, 'Unknown severity "extreme" → falls back to medium default',
      result.breakdown.severity === 12.5 && scoreInRange(result),
      `Got severity=${result.breakdown.severity}`);
  }

  {
    const incident = { severity: 'high', urgency: 'asap', confidence: 0.7 };
    const result = calculatePriorityScore(incident);
    assert(22, 'Unknown urgency "asap" → falls back to soon default',
      result.breakdown.timeSensitivity === 5,
      `Got timeSensitivity=${result.breakdown.timeSensitivity}`);
  }

  {
    const incident = { severity: 'critical', confidence: 0 };
    const result = calculatePriorityScore(incident);
    assert(23, 'confidence=0 → confidence contribution is 0',
      result.breakdown.confidence === 0 && scoreInRange(result),
      `Got confidence=${result.breakdown.confidence}`);
  }

  {
    const incident = { severity: 'critical', confidence: 1 };
    const result = calculatePriorityScore(incident);
    assert(24, 'confidence=1 → confidence contribution is 5 (full weight)',
      result.breakdown.confidence === 5 && scoreInRange(result),
      `Got confidence=${result.breakdown.confidence}`);
  }

  {
    const incident = {
      severity: 'high',
      peopleAffected: null,
      urgency: 'urgent',
      confidence: null,
      vulnerability: undefined,
      resourceShortage: null,
      locationContext: undefined,
    };
    const result = calculatePriorityScore(incident);
    assert(25, 'Null/undefined optional values → defaults applied, no crash',
      scoreInRange(result) && breakdownSumsToScore(result),
      `Got score=${result.score}`);
  }
}

function runPurityTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SECTION C: PURITY & IMMUTABILITY TESTS');
  console.log('══════════════════════════════════════════════\n');

  {
    const incident = makeCriticalIncident();
    const r1 = calculatePriorityScore(incident);
    const r2 = calculatePriorityScore(incident);
    const sameScore = r1.score === r2.score;
    const sameBreakdown = JSON.stringify(r1.breakdown) === JSON.stringify(r2.breakdown);
    assert(26, 'Deterministic: two calls with same input → identical output',
      sameScore && sameBreakdown,
      `r1.score=${r1.score}, r2.score=${r2.score}`);
  }

  {
    const incident = makeCriticalIncident();
    const before = JSON.stringify(incident);
    calculatePriorityScore(incident);
    const after = JSON.stringify(incident);
    assert(27, 'Input immutability: incident object unchanged after call',
      before === after,
      `Before: ${before}\nAfter:  ${after}`);
  }

  {
    const r1 = calculatePriorityScore({ severity: 'low', urgency: 'routine', confidence: 0.2 });
    const r2 = calculatePriorityScore({ severity: 'critical', urgency: 'immediate', confidence: 0.95 });
    assert(28, 'Different inputs → different scores',
      r1.score !== r2.score,
      `low=${r1.score}, critical=${r2.score}`);
  }
}

function runStructuralTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SECTION D: STRUCTURAL & INTEGRITY TESTS');
  console.log('══════════════════════════════════════════════\n');

  {
    const testCases = [
      {},
      null,
      undefined,
      { severity: 'critical', peopleAffected: 999999, urgency: 'immediate', confidence: 1, vulnerability: 1, resourceShortage: 1, locationContext: 1 },
      { severity: 'low', peopleAffected: 0, urgency: 'routine', confidence: 0, vulnerability: 0, resourceShortage: 0, locationContext: 0 },
      { severity: 'low', peopleAffected: -100 },
      { confidence: 5 },
      'garbage',
      42,
      [],
    ];
    const allInRange = testCases.every(tc => {
      const r = calculatePriorityScore(tc);
      return r.score >= 0 && r.score <= 100;
    });
    assert(29, 'Score always in [0, 100] across 10 diverse inputs',
      allInRange,
      'At least one score was outside [0, 100]');
  }

  {
    const testCases = [
      makeCriticalIncident(),
      { severity: 'low', peopleAffected: 5, urgency: 'routine', confidence: 0.3 },
      { severity: 'medium' },
      {},
    ];
    const allSum = testCases.every(tc => breakdownSumsToScore(calculatePriorityScore(tc)));
    assert(30, 'Breakdown sums to score (±1 rounding) for 4 test cases',
      allSum,
      'At least one breakdown did not sum to score');
  }

  {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert(31, 'WEIGHTS sum to 100',
      sum === 100,
      `Got sum=${sum}`);
  }

  {
    const result = calculatePriorityScore(makeCriticalIncident());
    const keys = Object.keys(result.breakdown);
    const expected = ['severity', 'affectedPopulation', 'vulnerability', 'resourceShortage', 'timeSensitivity', 'confidence', 'locationContext'];
    const hasAll = expected.every(k => keys.includes(k));
    assert(32, 'Breakdown contains exactly 7 expected factors',
      keys.length === 7 && hasAll,
      `Got keys: ${keys.join(', ')}`);
  }

  {
    const incident = {
      severity: 'critical',
      peopleAffected: POPULATION_CAP,
      urgency: 'immediate',
      confidence: 1,
      vulnerability: 1,
      resourceShortage: 1,
      locationContext: 1,
    };
    const result = calculatePriorityScore(incident);
    assert(33, 'All factors maxed → score = 100',
      result.score === 100,
      `Got score=${result.score}`);
  }

  {
    const incident = {
      severity: 'low',
      peopleAffected: 0,
      urgency: 'routine',
      confidence: 0,
      vulnerability: 0,
      resourceShortage: 0,
      locationContext: 0,
    };
    const result = calculatePriorityScore(incident);
    assert(34, 'All factors minimized → low score (≤15)',
      result.score <= 15 && result.score >= 0,
      `Got score=${result.score}`);
  }

  {
    const result = calculatePriorityScore([1, 2, 3]);
    assert(35, 'Array input → treated as empty object, valid score',
      scoreInRange(result) && breakdownSumsToScore(result),
      `Got score=${result.score}`);
  }

  {
    const result = calculatePriorityScore(42);
    assert(36, 'Number input → treated as empty object, valid score',
      scoreInRange(result) && breakdownSumsToScore(result),
      `Got score=${result.score}`);
  }
}

function runNormalizationTests() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SECTION E: NORMALIZATION HELPER TESTS');
  console.log('══════════════════════════════════════════════\n');

  {
    const n0 = normalizePopulation(0);
    const n1 = normalizePopulation(1);
    const nCap = normalizePopulation(POPULATION_CAP);
    const nOver = normalizePopulation(POPULATION_CAP * 10);
    const nNull = normalizePopulation(null);
    const nUndef = normalizePopulation(undefined);
    assert(37, 'normalizePopulation boundaries',
      n0 === 0 && n1 === 0 && nCap === 1 && nOver === 1 && nNull === 0.5 && nUndef === 0.5,
      `0→${n0}, 1→${n1}, cap→${nCap}, over→${nOver}, null→${nNull}, undef→${nUndef}`);
  }

  {
    const c0 = clamp01(0, 0.5);
    const c1 = clamp01(1, 0.5);
    const cNeg = clamp01(-5, 0.5);
    const cOver = clamp01(10, 0.5);
    const cNull = clamp01(null, 0.3);
    const cStr = clamp01('abc', 0.4);
    assert(38, 'clamp01 handles boundaries and invalid values',
      c0 === 0 && c1 === 1 && cNeg === 0 && cOver === 1 && cNull === 0.3 && cStr === 0.4,
      `0→${c0}, 1→${c1}, -5→${cNeg}, 10→${cOver}, null→${cNull}, str→${cStr}`);
  }

  {
    const map = { a: 0.2, b: 0.8 };
    const a = normalizeEnum('a', map, 0.5);
    const b = normalizeEnum('b', map, 0.5);
    const missing = normalizeEnum('c', map, 0.5);
    const nNull = normalizeEnum(null, map, 0.5);
    const nNum = normalizeEnum(42, map, 0.5);
    assert(39, 'normalizeEnum maps known keys and defaults unknown',
      a === 0.2 && b === 0.8 && missing === 0.5 && nNull === 0.5 && nNum === 0.5,
      `a→${a}, b→${b}, c→${missing}, null→${nNull}, 42→${nNum}`);
  }
}

function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  CrisisAI — Day 10: Priority Scoring Engine');
  console.log('  Unit Tests');
  console.log('══════════════════════════════════════════════');
  console.log(`  Time: ${new Date().toISOString()}\n`);

  runCoreScoringTests();
  runEdgeCaseTests();
  runPurityTests();
  runStructuralTests();
  runNormalizationTests();

  console.log('\n══════════════════════════════════════════════');
  console.log('  DAY 10 TEST RESULTS');
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
