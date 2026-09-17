import {
  CATEGORIES,
  SEVERITY_LEVELS,
  URGENCY_LEVELS,
  REQUIRED_RESOURCES,
} from './aiIncidentSchema.js';

export function buildCorrectionPrompt(reportText, validationErrors) {
  const errorSummary = validationErrors
    .map((e) => `- Field "${e.field}": ${e.error}`)
    .join('\n');

  return `The previous response failed schema validation. The following issues were detected:

${errorSummary}

Correct the response using the required CrisisAI schema. Return ONLY valid JSON. Do not add explanations. Do not invent information that is absent from the report.

IMPORTANT CONSTRAINTS:
- You must NEVER invent, fabricate, or hallucinate facts not present in the report.
- Extract ONLY information that is explicitly stated or directly implied by the report.
- If information is not available in the report, use null for scalar fields or an empty array [] for arrays.
- Return ONLY a single valid JSON object — no markdown code fences, no commentary.

ALLOWED VALUES:

category (pick exactly one):
${CATEGORIES.map((c) => `  - "${c}"`).join('\n')}

severity (pick exactly one):
${SEVERITY_LEVELS.map((s) => `  - "${s}"`).join('\n')}

urgency (pick exactly one):
${URGENCY_LEVELS.map((u) => `  - "${u}"`).join('\n')}

requiredResources (pick from this list, use an empty array if none can be determined):
${REQUIRED_RESOURCES.map((r) => `  - "${r}"`).join('\n')}

REQUIRED OUTPUT STRUCTURE (return ONLY this JSON, no other text):

{
  "category": "<one of the allowed categories>",
  "severity": "<one of: low, medium, high, critical>",
  "peopleAffected": <integer or null>,
  "injuries": <integer or null>,
  "urgency": "<one of: routine, soon, urgent, immediate>",
  "locationClue": "<string or null>",
  "requiredResources": ["<resource1>", "<resource2>"],
  "summary": "<concise one-sentence summary>",
  "confidence": <number between 0 and 1>
}

CITIZEN EMERGENCY REPORT:
"""
${reportText.trim()}
"""

Respond with ONLY the JSON object. No additional text.`;
}

export default { buildCorrectionPrompt };
