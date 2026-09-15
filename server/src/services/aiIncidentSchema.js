export const CATEGORIES = [
  'flood',
  'earthquake',
  'fire',
  'cyclone',
  'building_collapse',
  'landslide',
  'medical_emergency',
  'road_accident',
  'other',
];

export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];

export const URGENCY_LEVELS = ['routine', 'soon', 'urgent', 'immediate'];

export const REQUIRED_RESOURCES = [
  'ambulance',
  'medical_team',
  'fire_rescue',
  'search_rescue',
  'food',
  'drinking_water',
  'shelter',
  'rescue_boat',
  'police',
  'evacuation_team',
];



export const AI_OUTPUT_SCHEMA = {
  category: { type: 'enum', values: CATEGORIES, required: true },
  severity: { type: 'enum', values: SEVERITY_LEVELS, required: true },
  peopleAffected: { type: 'integer_or_null', min: 0, required: true },
  injuries: { type: 'integer_or_null', min: 0, required: true },
  urgency: { type: 'enum', values: URGENCY_LEVELS, required: true },
  locationClue: { type: 'string_or_null', required: true },
  requiredResources: { type: 'resource_array', values: REQUIRED_RESOURCES, required: true },
  summary: { type: 'non_empty_string', required: true },
  confidence: { type: 'float_range', min: 0, max: 1, required: true },
};

/** @param {object} output  @returns {{ valid: boolean, errors: string[], sanitized: object|null }} */
export function validateAIOutput(output) {
  const errors = [];

  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return { valid: false, errors: ['Output is not a valid JSON object.'], sanitized: null };
  }

  const sanitized = {};


  if (!output.hasOwnProperty('category') || output.category === undefined) {
    errors.push('Missing required field: category');
  } else if (!CATEGORIES.includes(output.category)) {
    errors.push(
      `Invalid category: "${output.category}". Allowed: ${CATEGORIES.join(', ')}`
    );
  } else {
    sanitized.category = output.category;
  }


  if (!output.hasOwnProperty('severity') || output.severity === undefined) {
    errors.push('Missing required field: severity');
  } else if (!SEVERITY_LEVELS.includes(output.severity)) {
    errors.push(
      `Invalid severity: "${output.severity}". Allowed: ${SEVERITY_LEVELS.join(', ')}`
    );
  } else {
    sanitized.severity = output.severity;
  }


  if (!output.hasOwnProperty('urgency') || output.urgency === undefined) {
    errors.push('Missing required field: urgency');
  } else if (!URGENCY_LEVELS.includes(output.urgency)) {
    errors.push(
      `Invalid urgency: "${output.urgency}". Allowed: ${URGENCY_LEVELS.join(', ')}`
    );
  } else {
    sanitized.urgency = output.urgency;
  }


  if (!output.hasOwnProperty('peopleAffected')) {
    errors.push('Missing required field: peopleAffected');
  } else if (output.peopleAffected === null) {
    sanitized.peopleAffected = null;
  } else if (
    typeof output.peopleAffected !== 'number' ||
    !Number.isInteger(output.peopleAffected) ||
    output.peopleAffected < 0
  ) {
    errors.push(
      `Invalid peopleAffected: "${output.peopleAffected}". Must be a non-negative integer or null.`
    );
  } else {
    sanitized.peopleAffected = output.peopleAffected;
  }


  if (!output.hasOwnProperty('injuries')) {
    errors.push('Missing required field: injuries');
  } else if (output.injuries === null) {
    sanitized.injuries = null;
  } else if (
    typeof output.injuries !== 'number' ||
    !Number.isInteger(output.injuries) ||
    output.injuries < 0
  ) {
    errors.push(
      `Invalid injuries: "${output.injuries}". Must be a non-negative integer or null.`
    );
  } else {
    sanitized.injuries = output.injuries;
  }


  if (!output.hasOwnProperty('locationClue')) {
    errors.push('Missing required field: locationClue');
  } else if (output.locationClue === null) {
    sanitized.locationClue = null;
  } else if (typeof output.locationClue !== 'string') {
    errors.push(`Invalid locationClue: must be a string or null.`);
  } else {
    sanitized.locationClue = output.locationClue;
  }


  if (!output.hasOwnProperty('requiredResources')) {
    errors.push('Missing required field: requiredResources');
  } else if (!Array.isArray(output.requiredResources)) {
    errors.push('requiredResources must be an array.');
  } else {
    const invalidResources = output.requiredResources.filter(
      (r) => !REQUIRED_RESOURCES.includes(r)
    );
    if (invalidResources.length > 0) {
      errors.push(
        `Invalid resources: ${invalidResources.join(', ')}. Allowed: ${REQUIRED_RESOURCES.join(', ')}`
      );
    } else {
      sanitized.requiredResources = output.requiredResources;
    }
  }


  if (!output.hasOwnProperty('summary') || output.summary === undefined) {
    errors.push('Missing required field: summary');
  } else if (typeof output.summary !== 'string' || output.summary.trim().length === 0) {
    errors.push('summary must be a non-empty string.');
  } else {
    sanitized.summary = output.summary;
  }


  if (!output.hasOwnProperty('confidence') || output.confidence === undefined) {
    errors.push('Missing required field: confidence');
  } else if (
    typeof output.confidence !== 'number' ||
    output.confidence < 0 ||
    output.confidence > 1
  ) {
    errors.push(
      `Invalid confidence: "${output.confidence}". Must be a number between 0 and 1.`
    );
  } else {
    sanitized.confidence = output.confidence;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? sanitized : null,
  };
}

/** @param {string} rawResponse  @returns {{ parsed: object|null, error: string|null }} */
export function safeParseJSON(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return { parsed: null, error: 'Response is empty or not a string.' };
  }

  let text = rawResponse.trim();


  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    text = codeFenceMatch[1].trim();
  }


  if (!text.startsWith('{')) {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      text = text.substring(jsonStart, jsonEnd + 1);
    }
  }

  try {
    const parsed = JSON.parse(text);
    return { parsed, error: null };
  } catch (err) {
    return { parsed: null, error: `JSON parse error: ${err.message}` };
  }
}

export default {
  CATEGORIES,
  SEVERITY_LEVELS,
  URGENCY_LEVELS,
  REQUIRED_RESOURCES,
  AI_OUTPUT_SCHEMA,
  validateAIOutput,
  safeParseJSON,
};
