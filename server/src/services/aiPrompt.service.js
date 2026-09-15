import {
  CATEGORIES,
  SEVERITY_LEVELS,
  URGENCY_LEVELS,
  REQUIRED_RESOURCES,
} from './aiIncidentSchema.js';

/** @param {string} reportText  @returns {string} */
export function buildIncidentAnalysisPrompt(reportText) {
  if (!reportText || typeof reportText !== 'string' || !reportText.trim()) {
    throw new Error('reportText must be a non-empty string.');
  }

  const prompt = `You are CrisisAI, an emergency report analysis system. Your task is to analyze a citizen's natural-language emergency report and extract structured incident information.

IMPORTANT CONSTRAINTS:
- You are a decision-support tool ONLY. Your output is NOT an autonomous emergency decision.
- Human responders and authorized personnel MUST review all critical decisions.
- You must NEVER invent, fabricate, or hallucinate facts not present in the report.
- Extract ONLY information that is explicitly stated or directly implied by the report.
- If information is not available in the report, use null for scalar fields or an empty array [] for arrays.
- NEVER guess exact numbers of victims, injuries, or locations when they are not stated.
- NEVER add explanations, markdown formatting, or any text outside the JSON object.
- Return ONLY a single valid JSON object — no markdown code fences, no commentary.

ANALYSIS INSTRUCTIONS:
1. Identify the disaster category from the report.
2. Estimate severity based ONLY on available evidence in the report.
3. Estimate urgency based ONLY on available evidence in the report.
4. Extract the number of affected people ONLY when explicitly stated or clearly implied.
5. Extract the number of injuries ONLY when explicitly stated.
6. Extract location clues (landmarks, street names, areas) when available in the report.
7. Identify required emergency resources based on the situation described.
8. Generate a concise factual summary of the incident (one sentence).
9. Assign a confidence score (0 to 1) reflecting how confident you are in the extraction, based on the clarity and completeness of the report.

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

  return prompt;
}

export default { buildIncidentAnalysisPrompt };
