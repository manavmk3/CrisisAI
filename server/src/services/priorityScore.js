export const WEIGHTS = Object.freeze({
  severity: 25,
  affectedPopulation: 20,
  vulnerability: 15,
  resourceShortage: 15,
  timeSensitivity: 10,
  confidence: 5,
  locationContext: 10,
});

const SEVERITY_MAP = Object.freeze({
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
});

const URGENCY_MAP = Object.freeze({
  routine: 0.25,
  soon: 0.5,
  urgent: 0.75,
  immediate: 1.0,
});

const DEFAULTS = Object.freeze({
  severity: 'medium',
  urgency: 'soon',
  peopleAffected: null,
  confidence: 0.5,
  vulnerability: 0.5,
  resourceShortage: 0.5,
  locationContext: 0.5,
});

const POPULATION_CAP = 100_000;

function normalizePopulation(count) {
  if (count === null || count === undefined) return 0.5;
  if (typeof count !== 'number' || Number.isNaN(count)) return 0.5;
  if (count <= 0) return 0.0;
  if (count >= POPULATION_CAP) return 1.0;
  return Math.log10(count) / Math.log10(POPULATION_CAP);
}

function clamp01(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value !== 'number' || Number.isNaN(value)) return defaultValue;
  return Math.min(1, Math.max(0, value));
}

function normalizeEnum(value, map, defaultNorm) {
  if (value === null || value === undefined || typeof value !== 'string') {
    return defaultNorm;
  }
  const norm = map[value.toLowerCase()];
  return norm !== undefined ? norm : defaultNorm;
}

export function calculatePriorityScore(incident) {
  const inc = (incident && typeof incident === 'object' && !Array.isArray(incident))
    ? incident
    : {};

  const severityNorm = normalizeEnum(inc.severity, SEVERITY_MAP, SEVERITY_MAP[DEFAULTS.severity]);
  const populationNorm = normalizePopulation(inc.peopleAffected);
  const vulnerabilityNorm = clamp01(inc.vulnerability, DEFAULTS.vulnerability);
  const resourceNorm = clamp01(inc.resourceShortage, DEFAULTS.resourceShortage);
  const timeSensitivityNorm = normalizeEnum(inc.urgency, URGENCY_MAP, URGENCY_MAP[DEFAULTS.urgency]);
  const confidenceNorm = clamp01(inc.confidence, DEFAULTS.confidence);
  const locationNorm = clamp01(inc.locationContext, DEFAULTS.locationContext);

  const breakdown = {
    severity: round2(severityNorm * WEIGHTS.severity),
    affectedPopulation: round2(populationNorm * WEIGHTS.affectedPopulation),
    vulnerability: round2(vulnerabilityNorm * WEIGHTS.vulnerability),
    resourceShortage: round2(resourceNorm * WEIGHTS.resourceShortage),
    timeSensitivity: round2(timeSensitivityNorm * WEIGHTS.timeSensitivity),
    confidence: round2(confidenceNorm * WEIGHTS.confidence),
    locationContext: round2(locationNorm * WEIGHTS.locationContext),
  };

  const rawScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  return { score, breakdown };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export { normalizePopulation, clamp01, normalizeEnum, DEFAULTS, POPULATION_CAP };

export default calculatePriorityScore;
