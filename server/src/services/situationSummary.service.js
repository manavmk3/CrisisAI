import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/env.js';
import Incident from '../models/Incident.js';
import Resource from '../models/Resource.js';
import ResourceAllocation from '../models/ResourceAllocation.js';
import Assignment from '../models/Assignment.js';

let cachedSummary = null;
let lastDataFingerprint = null;

const RISK_LEVELS = ['low', 'moderate', 'high', 'critical'];
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];

export class SituationSummaryError extends Error {
  constructor(message, statusCode = 500, code = 'SUMMARY_ERROR') {
    super(message);
    this.name = 'SituationSummaryError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function computeFingerprint(incidents, resources, allocations, assignments) {
  const incParts = incidents.map((i) => `${i._id}_${i.status}_${i.priorityScore}_${i.updatedAt?.getTime() || 0}`).join('|');
  const resParts = resources.map((r) => `${r._id}_${r.availableQuantity}`).join('|');
  const allocParts = allocations.map((a) => `${a._id}_${a.status}`).join('|');
  const assignParts = assignments.map((s) => `${s._id}_${s.status}`).join('|');
  return `${incidents.length}:${incParts}#${resources.length}:${resParts}#${allocParts}#${assignParts}`;
}

export function validateSummarySchema(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  if (typeof data.situationOverview !== 'string' || data.situationOverview.trim().length === 0) {
    return false;
  }

  if (!RISK_LEVELS.includes(String(data.overallRiskLevel).toLowerCase())) {
    return false;
  }

  if (!Array.isArray(data.keyFindings) || !Array.isArray(data.criticalIncidents)) {
    return false;
  }

  if (!Array.isArray(data.resourceConcerns) || !Array.isArray(data.operationalBottlenecks)) {
    return false;
  }

  if (!Array.isArray(data.immediatePriorities) || !Array.isArray(data.dataLimitations)) {
    return false;
  }

  return true;
}

export function generateDeterministicFallbackBriefing(operationalData) {
  const {
    activeIncidentsCount,
    severityCounts,
    totalPeopleAffected,
    totalInjuries,
    categoryCounts,
    resourceSummary,
    unassignedCount,
    criticalIncidentsList,
    duplicateReviewCount,
  } = operationalData;

  let riskLevel = 'low';
  if (severityCounts.critical > 0 || totalInjuries > 5 || operationalData.averagePriority >= 75) {
    riskLevel = 'critical';
  } else if (severityCounts.high > 0 || totalPeopleAffected >= 100 || operationalData.averagePriority >= 50) {
    riskLevel = 'high';
  } else if (activeIncidentsCount > 0) {
    riskLevel = 'moderate';
  }

  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, count]) => count > 0)
    .map(([cat, count]) => `${cat} (${count})`)
    .slice(0, 3);

  const findings = [];
  if (activeIncidentsCount === 0) {
    findings.push('No active incidents requiring emergency response at this time.');
  } else {
    findings.push(`Currently monitoring ${activeIncidentsCount} active operational incident(s).`);
    if (severityCounts.critical > 0) {
      findings.push(`${severityCounts.critical} critical incident(s) require priority emergency dispatch.`);
    }
    if (topCategories.length > 0) {
      findings.push(`Primary active hazard categories: ${topCategories.join(', ')}.`);
    }
    if (totalPeopleAffected > 0) {
      findings.push(`An estimated ${totalPeopleAffected} individual(s) are impacted across active zones.`);
    }
  }

  const resourceConcerns = [];
  const exhausted = resourceSummary.filter((r) => r.availableQuantity === 0);
  if (exhausted.length > 0) {
    resourceConcerns.push(`Depleted inventory for: ${exhausted.map((r) => r.type).join(', ')}. Mutual aid may be required.`);
  }
  const lowStock = resourceSummary.filter((r) => r.availableQuantity > 0 && r.availableQuantity <= 2);
  if (lowStock.length > 0) {
    resourceConcerns.push(`Low available quantity for: ${lowStock.map((r) => `${r.type} (${r.availableQuantity} left)`).join(', ')}.`);
  }
  if (resourceConcerns.length === 0 && activeIncidentsCount > 0) {
    resourceConcerns.push('Sufficient local resource inventory across registered categories.');
  }

  const bottlenecks = [];
  if (unassignedCount > 0) {
    bottlenecks.push(`${unassignedCount} active incident(s) currently have no assigned field responder.`);
  }
  if (duplicateReviewCount > 0) {
    bottlenecks.push(`${duplicateReviewCount} incident report(s) flagged for duplicate or verification triage.`);
  }

  const priorities = [];
  if (criticalIncidentsList.length > 0) {
    priorities.push(`Immediate dispatch for critical incident: ${criticalIncidentsList[0].summary || criticalIncidentsList[0].category}`);
  }
  if (unassignedCount > 0) {
    priorities.push(`Assign available volunteer and agency units to unassigned operational queues.`);
  }
  if (priorities.length === 0) {
    priorities.push('Maintain active jurisdiction situational awareness and resource readiness.');
  }

  const limitations = [];
  if (operationalData.missingCoordinatesCount > 0) {
    limitations.push(`${operationalData.missingCoordinatesCount} incident(s) lack verified GPS coordinates.`);
  }
  if (operationalData.unverifiedCount > 0) {
    limitations.push(`${operationalData.unverifiedCount} report(s) await on-scene field verification.`);
  }

  const situationOverview = activeIncidentsCount === 0
    ? 'All operational sectors are currently stable with no unresolved crisis incidents.'
    : `Emergency operations center is actively coordinating responses across ${activeIncidentsCount} active incident(s). Current aggregate posture is classified as ${riskLevel.toUpperCase()} risk with ${severityCounts.critical} critical and ${severityCounts.high} high-severity case(s).`;

  return {
    situationOverview,
    overallRiskLevel: riskLevel,
    keyFindings: findings,
    criticalIncidents: criticalIncidentsList.slice(0, 5).map((inc) => ({
      incidentId: inc._id ? inc._id.toString() : inc.id,
      summary: inc.summary || inc.category,
      category: inc.category,
      severity: inc.severity,
      priorityScore: inc.priorityScore,
      urgency: inc.urgency,
      location: inc.location || 'Location unverified',
    })),
    resourceConcerns,
    operationalBottlenecks: bottlenecks,
    immediatePriorities: priorities,
    dataLimitations: limitations,
    generatedAt: new Date().toISOString(),
    isAiGenerated: false,
    fallbackUsed: true,
  };
}

export async function gatherOperationalData() {
  const activeIncidents = await Incident.find({
    status: { $in: ['reported', 'under_review', 'assigned'] },
  }).sort({ priorityScore: -1 });

  const resources = await Resource.find({});
  const activeAllocations = await ResourceAllocation.find({ status: 'active' });
  const activeAssignments = await Assignment.find({
    status: { $in: ['assigned', 'accepted', 'en_route', 'arrived'] },
  });

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const categoryCounts = {};
  let totalPeopleAffected = 0;
  let totalInjuries = 0;
  let missingCoordinatesCount = 0;
  let unverifiedCount = 0;
  let duplicateReviewCount = 0;
  let prioritySum = 0;

  const assignedIncidentIds = new Set(
    activeAssignments.map((a) => (a.incidentId?._id || a.incidentId).toString())
  );

  for (const inc of activeIncidents) {
    const sev = (inc.severity || '').toLowerCase();
    if (severityCounts[sev] !== undefined) {
      severityCounts[sev]++;
    }

    const cat = inc.category || 'other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    if (inc.peopleAffected && !isNaN(inc.peopleAffected) && inc.peopleAffected > 0) {
      totalPeopleAffected += Number(inc.peopleAffected);
    }
    if (inc.injuries && !isNaN(inc.injuries) && inc.injuries > 0) {
      totalInjuries += Number(inc.injuries);
    }

    if (!inc.coordinates?.latitude || !inc.coordinates?.longitude) {
      missingCoordinatesCount++;
    }

    if (inc.verificationState === 'needs_review' || inc.status === 'under_review') {
      unverifiedCount++;
    }

    if (inc.possibleDuplicateOf) {
      duplicateReviewCount++;
    }

    prioritySum += Number(inc.priorityScore) || 0;
  }

  const unassignedIncidents = activeIncidents.filter(
    (inc) => !assignedIncidentIds.has(inc._id.toString())
  );

  const resourceTypeMap = {};
  for (const r of resources) {
    if (!resourceTypeMap[r.type]) {
      resourceTypeMap[r.type] = {
        type: r.type,
        totalQuantity: 0,
        availableQuantity: 0,
      };
    }
    resourceTypeMap[r.type].totalQuantity += Number(r.quantity) || 0;
    resourceTypeMap[r.type].availableQuantity += Number(r.availableQuantity) || 0;
  }

  const resourceSummary = Object.values(resourceTypeMap);

  const criticalIncidentsList = activeIncidents.filter(
    (i) => (i.severity || '').toLowerCase() === 'critical' || Number(i.priorityScore) >= 80
  );

  const averagePriority = activeIncidents.length > 0 ? Math.round(prioritySum / activeIncidents.length) : 0;

  const fingerprint = computeFingerprint(activeIncidents, resources, activeAllocations, activeAssignments);

  return {
    activeIncidentsCount: activeIncidents.length,
    activeIncidentsRaw: activeIncidents,
    severityCounts,
    categoryCounts,
    totalPeopleAffected,
    totalInjuries,
    missingCoordinatesCount,
    unverifiedCount,
    duplicateReviewCount,
    averagePriority,
    unassignedCount: unassignedIncidents.length,
    criticalIncidentsList,
    resourceSummary,
    activeAllocationsCount: activeAllocations.length,
    activeAssignmentsCount: activeAssignments.length,
    fingerprint,
    timestamp: new Date().toISOString(),
  };
}

export function buildSituationPrompt(opData) {
  const compactPayload = {
    activeIncidentsCount: opData.activeIncidentsCount,
    severityDistribution: opData.severityCounts,
    topCategories: opData.categoryCounts,
    totalPeopleAffectedEstimate: opData.totalPeopleAffected,
    totalInjuriesReported: opData.totalInjuries,
    unassignedIncidentsCount: opData.unassignedCount,
    unverifiedReportsCount: opData.unverifiedCount,
    flaggedDuplicatesCount: opData.duplicateReviewCount,
    missingCoordinatesCount: opData.missingCoordinatesCount,
    inventoryStatus: opData.resourceSummary.map((r) => ({
      type: r.type,
      total: r.totalQuantity,
      available: r.availableQuantity,
    })),
    topCriticalIncidents: opData.criticalIncidentsList.slice(0, 5).map((i) => ({
      id: i._id.toString(),
      category: i.category,
      severity: i.severity,
      urgency: i.urgency,
      priorityScore: i.priorityScore,
      summary: i.summary || i.category,
      requiredResources: i.requiredResources || [],
    })),
  };

  return `You are the AI Operations Analyst for CrisisAI emergency management.
Analyze the following operational data and generate an actionable situation briefing in strictly valid JSON format.

OPERATIONAL SITUATION DATA:
${JSON.stringify(compactPayload, null, 2)}

INSTRUCTIONS:
1. Do NOT invent casualties, nonexistent resources, or imaginary locations.
2. Ground all insights strictly in the provided data.
3. Classify overallRiskLevel as one of: "low", "moderate", "high", "critical".
4. If activeIncidentsCount is 0, acknowledge the stable state and state low risk.
5. Return ONLY a single raw JSON object matching this exact schema:
{
  "situationOverview": "2-3 concise sentences summarizing active operations posture and primary threats.",
  "overallRiskLevel": "critical" | "high" | "moderate" | "low",
  "keyFindings": ["3 to 5 clear operational bullet points"],
  "criticalIncidents": [
    {
      "incidentId": "id string from input",
      "summary": "short summary",
      "category": "category",
      "severity": "severity",
      "priorityScore": number,
      "urgency": "urgency",
      "location": "location"
    }
  ],
  "resourceConcerns": ["specific resource shortages or depletion warnings based on inventory"],
  "operationalBottlenecks": ["e.g. unassigned incidents, pending field verifications"],
  "immediatePriorities": ["top 3 priority actions for emergency commanders"],
  "dataLimitations": ["data gaps like missing coordinates or unverified reports"]
}`;
}

export async function callGeminiForSummary(promptText) {
  const apiKey = config.ai?.geminiApiKey;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    throw new SituationSummaryError('Gemini API key is not configured.', 503, 'AI_NOT_CONFIGURED');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          responseMimeType: 'application/json',
        },
      });
      const result = await model.generateContent(promptText);
      const text = result.response.text();
      return text;
    } catch (err) {
      lastError = err;
      const msg = err.message || '';
      if (
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('503') ||
        msg.includes('RATE_LIMIT') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('high demand')
      ) {
        continue;
      }
      break;
    }
  }

  throw new SituationSummaryError(lastError?.message || 'Gemini generation failure', 502, 'GEMINI_ERROR');
}

export function parseAndCleanJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (innerErr) {
        return null;
      }
    }
    return null;
  }
}

export async function getSituationSummary({ forceRefresh = false } = {}) {
  const opData = await gatherOperationalData();

  if (!forceRefresh && cachedSummary && lastDataFingerprint === opData.fingerprint) {
    return {
      ...cachedSummary,
      cached: true,
      dataFingerprint: opData.fingerprint,
    };
  }

  let finalSummary = null;

  try {
    const prompt = buildSituationPrompt(opData);
    const rawAiText = await callGeminiForSummary(prompt);
    let parsed = parseAndCleanJson(rawAiText);

    if (parsed && validateSummarySchema(parsed)) {
      finalSummary = {
        ...parsed,
        generatedAt: new Date().toISOString(),
        sourceDataTimestamp: opData.timestamp,
        isAiGenerated: true,
        cached: false,
      };
    } else {
      const correctionPrompt = `${prompt}\n\nATTENTION: Your previous response was invalid. Please return strictly valid JSON conforming exactly to the specified schema without Markdown fences.`;
      const retryText = await callGeminiForSummary(correctionPrompt);
      const retryParsed = parseAndCleanJson(retryText);

      if (retryParsed && validateSummarySchema(retryParsed)) {
        finalSummary = {
          ...retryParsed,
          generatedAt: new Date().toISOString(),
          sourceDataTimestamp: opData.timestamp,
          isAiGenerated: true,
          cached: false,
        };
      }
    }
  } catch (aiErr) {
    finalSummary = null;
  }

  if (!finalSummary) {
    const fallback = generateDeterministicFallbackBriefing(opData);
    finalSummary = {
      ...fallback,
      sourceDataTimestamp: opData.timestamp,
      cached: false,
    };
  }

  cachedSummary = finalSummary;
  lastDataFingerprint = opData.fingerprint;

  return {
    ...finalSummary,
    dataFingerprint: opData.fingerprint,
  };
}

export function invalidateSituationSummaryCache() {
  cachedSummary = null;
  lastDataFingerprint = null;
}

export default {
  getSituationSummary,
  gatherOperationalData,
  buildSituationPrompt,
  validateSummarySchema,
  generateDeterministicFallbackBriefing,
  invalidateSituationSummaryCache,
  SituationSummaryError,
};

