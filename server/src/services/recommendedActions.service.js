import mongoose from 'mongoose';
import Incident from '../models/Incident.js';
import Resource from '../models/Resource.js';
import ResourceAllocation from '../models/ResourceAllocation.js';
import Assignment from '../models/Assignment.js';
import { RESOURCE_TYPE_COMPATIBILITY, calculateHaversineDistanceKm } from './resourceRanking.js';

export const SCORING_WEIGHTS = Object.freeze({
  severityAndPriority: 25,
  urgency: 15,
  populationAndInjuries: 15,
  resourceSuitability: 20,
  inventoryAvailability: 15,
  operationalStatus: 10,
});

export const ACTION_TYPES = Object.freeze({
  ALLOCATE_RESOURCE: 'allocate_resource',
  REQUEST_INVENTORY: 'request_inventory',
  ASSIGN_RESPONDER: 'assign_responder',
  VERIFY_INCIDENT: 'verify_incident',
  REVIEW_DUPLICATE: 'review_duplicate',
  ESCALATE_AUTHORITY: 'escalate_authority',
  MONITOR_ARRIVAL: 'monitor_arrival',
});

const RESOURCE_TITLES = {
  ambulance: 'Dispatch Emergency Ambulance',
  medical_team: 'Deploy Advanced Medical Team',
  fire_rescue: 'Mobilize Fire & Heavy Rescue Squad',
  search_rescue: 'Deploy Search & Rescue Operatives',
  food: 'Distribute Emergency Food Supplies',
  drinking_water: 'Deliver Potable Drinking Water',
  shelter: 'Erect Emergency Shelter Facilities',
  rescue_boat: 'Deploy Flood Rescue Boats',
  police: 'Coordinate Law Enforcement & Perimeter',
  evacuation_team: 'Deploy Mass Evacuation Unit',
};

export function scoreSeverityAndPriority(incident) {
  const sev = (incident.severity || 'low').toLowerCase();
  let baseSev = 3;
  let sevLabel = 'Low severity incident';

  if (sev === 'critical') {
    baseSev = 15;
    sevLabel = 'Critical life-safety severity rating';
  } else if (sev === 'high') {
    baseSev = 10;
    sevLabel = 'High hazard severity rating';
  } else if (sev === 'medium') {
    baseSev = 6;
    sevLabel = 'Moderate severity rating';
  }

  const pScore = Number(incident.priorityScore);
  const validPScore = !isNaN(pScore) ? Math.min(100, Math.max(0, pScore)) : 50;
  const pPoints = Math.round((validPScore / 100) * 10);

  const totalPoints = Math.min(SCORING_WEIGHTS.severityAndPriority, baseSev + pPoints);
  return {
    factor: 'severity_priority',
    points: totalPoints,
    maximum: SCORING_WEIGHTS.severityAndPriority,
    reason: `${sevLabel} with verified priority score of ${validPScore}/100.`,
  };
}

export function scoreUrgency(incident) {
  const urg = (incident.urgency || 'routine').toLowerCase();
  let pts = 3;
  let reason = 'Routine urgency rating with standard response window';

  if (urg === 'immediate') {
    pts = 15;
    reason = 'Immediate time sensitivity requiring sub-hour intervention';
  } else if (urg === 'urgent') {
    pts = 11;
    reason = 'Urgent time sensitivity with rapid escalation potential';
  } else if (urg === 'soon') {
    pts = 7;
    reason = 'Soon time sensitivity with developing hazard parameters';
  }

  return {
    factor: 'urgency',
    points: pts,
    maximum: SCORING_WEIGHTS.urgency,
    reason,
  };
}

export function scorePopulationAndInjuries(incident) {
  let pts = 0;
  const reasons = [];

  const injuries = Number(incident.injuries);
  if (!isNaN(injuries) && injuries > 0) {
    const injPts = Math.min(8, injuries * 2);
    pts += injPts;
    reasons.push(`${injuries} confirmed casualties or injuries reported`);
  }

  const peopleAffected = Number(incident.peopleAffected);
  if (!isNaN(peopleAffected) && peopleAffected > 0) {
    const popPts = Math.min(7, Math.max(1, Math.round(Math.log10(peopleAffected + 1) * 2.5)));
    pts += popPts;
    reasons.push(`${peopleAffected} individuals endangered or displaced`);
  }

  if (reasons.length === 0) {
    reasons.push('No reported casualties or high population density impacts');
  }

  return {
    factor: 'affected_population',
    points: Math.min(SCORING_WEIGHTS.populationAndInjuries, pts),
    maximum: SCORING_WEIGHTS.populationAndInjuries,
    reason: reasons.join('; ') + '.',
  };
}

export function scoreResourceSuitability(incident, actionType, resourceType) {
  let pts = 0;
  let reason = 'General supportive operational recommendation';

  const reqResources = Array.isArray(incident.requiredResources) ? incident.requiredResources : [];

  if (actionType === ACTION_TYPES.ALLOCATE_RESOURCE || actionType === ACTION_TYPES.REQUEST_INVENTORY) {
    if (reqResources.includes(resourceType)) {
      pts = 20;
      reason = `Directly fulfills primary required resource (${resourceType}) identified by AI triage`;
    } else {
      const isCompat = reqResources.some((req) => {
        const compatList = RESOURCE_TYPE_COMPATIBILITY[req] || [];
        return compatList.includes(resourceType);
      });
      if (isCompat) {
        pts = 14;
        reason = `Fulfills compatible resource capability (${resourceType}) for requested emergency needs`;
      } else {
        pts = 8;
        reason = `Provides supplementary asset capability (${resourceType})`;
      }
    }
  } else if (actionType === ACTION_TYPES.VERIFY_INCIDENT) {
    pts = 16;
    reason = 'Field verification is essential to establish verified ground-truth triage';
  } else if (actionType === ACTION_TYPES.REVIEW_DUPLICATE) {
    pts = 18;
    reason = 'Duplicate reconciliation prevents operational fragmentation and resource waste';
  } else if (actionType === ACTION_TYPES.ESCALATE_AUTHORITY) {
    pts = 19;
    reason = 'Critical severity threshold demands immediate command-level coordination';
  } else if (actionType === ACTION_TYPES.ASSIGN_RESPONDER) {
    pts = 17;
    reason = 'Human mission assignment is the decisive bottleneck for field execution';
  } else if (actionType === ACTION_TYPES.MONITOR_ARRIVAL) {
    pts = 10;
    reason = 'Tracking transit milestone ETA ensures responder accountability';
  }

  return {
    factor: 'resource_suitability',
    points: Math.min(SCORING_WEIGHTS.resourceSuitability, pts),
    maximum: SCORING_WEIGHTS.resourceSuitability,
    reason,
  };
}

export function scoreInventoryAvailability(actionType, matchedResource) {
  let pts = 0;
  let reason = 'Non-inventory procedural action';

  if (actionType === ACTION_TYPES.ALLOCATE_RESOURCE) {
    if (matchedResource && matchedResource.availableQuantity > 0) {
      pts = 15;
      reason = `Ready local inventory available (${matchedResource.availableQuantity} unit(s) in active depot)`;
    } else {
      pts = 0;
      reason = 'No local units currently available in depot';
    }
  } else if (actionType === ACTION_TYPES.REQUEST_INVENTORY) {
    pts = 15;
    reason = 'Local inventory is completely exhausted; regional mutual aid request is urgent';
  } else {
    pts = 10;
    reason = 'Operation relies on personnel or protocol rather than material depot stock';
  }

  return {
    factor: 'inventory_availability',
    points: Math.min(SCORING_WEIGHTS.inventoryAvailability, pts),
    maximum: SCORING_WEIGHTS.inventoryAvailability,
    reason,
  };
}

export function scoreOperationalStatus(incident, actionType, activeAllocations, activeAssignments) {
  let pts = 5;
  let reason = 'Incident queue in normal triage processing';

  const hasAssignment = activeAssignments.some(
    (a) => (a.incidentId?._id || a.incidentId).toString() === (incident._id || incident.id).toString()
  );

  if (actionType === ACTION_TYPES.ASSIGN_RESPONDER) {
    if (!hasAssignment) {
      pts = 10;
      reason = 'High-priority gap: Mission has zero assigned field responders';
    } else {
      pts = 5;
      reason = 'Mission already has active personnel assigned';
    }
  } else if (actionType === ACTION_TYPES.VERIFY_INCIDENT) {
    if (incident.verificationState === 'needs_review' || incident.status === 'under_review') {
      pts = 10;
      reason = 'Pending manual review queue flag actively gates formal verification';
    } else {
      pts = 4;
      reason = 'Incident already marked verified';
    }
  } else if (actionType === ACTION_TYPES.REVIEW_DUPLICATE) {
    if (incident.possibleDuplicateOf) {
      pts = 10;
      reason = 'System identified cross-report similarity requiring de-duplication decision';
    } else {
      pts = 3;
      reason = 'No automated duplicate correlation flagged';
    }
  } else if (actionType === ACTION_TYPES.ALLOCATE_RESOURCE) {
    const hasAlloc = activeAllocations.some(
      (al) => (al.incident?._id || al.incident).toString() === (incident._id || incident.id).toString()
    );
    if (!hasAlloc) {
      pts = 9;
      reason = 'Incident has no active resource commitments in place';
    } else {
      pts = 6;
      reason = 'Incident currently holds active resource allocations';
    }
  } else if (actionType === ACTION_TYPES.MONITOR_ARRIVAL) {
    pts = 8;
    reason = 'Field unit currently navigating toward target coordinates';
  } else if (actionType === ACTION_TYPES.ESCALATE_AUTHORITY) {
    pts = 10;
    reason = 'Incident status requires immediate executive visibility';
  }

  return {
    factor: 'operational_status',
    points: Math.min(SCORING_WEIGHTS.operationalStatus, pts),
    maximum: SCORING_WEIGHTS.operationalStatus,
    reason,
  };
}

export function compileRecommendation({
  incident,
  actionType,
  title,
  description,
  suggestedResourceType = null,
  matchedResource = null,
  activeAllocations = [],
  activeAssignments = [],
}) {
  const fSeverity = scoreSeverityAndPriority(incident);
  const fUrgency = scoreUrgency(incident);
  const fPop = scorePopulationAndInjuries(incident);
  const fSuitability = scoreResourceSuitability(incident, actionType, suggestedResourceType);
  const fInventory = scoreInventoryAvailability(actionType, matchedResource);
  const fOps = scoreOperationalStatus(incident, actionType, activeAllocations, activeAssignments);

  const contributingFactors = [fSeverity, fUrgency, fPop, fSuitability, fInventory, fOps];

  const rawScore = contributingFactors.reduce((sum, f) => sum + f.points, 0);
  const recommendationScore = Math.min(100, Math.max(0, rawScore));

  let priority = 'low';
  if (recommendationScore >= 80) {
    priority = 'critical';
  } else if (recommendationScore >= 60) {
    priority = 'high';
  } else if (recommendationScore >= 40) {
    priority = 'medium';
  }

  let distanceKm = null;
  if (
    matchedResource?.location?.coordinates &&
    incident.coordinates?.latitude &&
    incident.coordinates?.longitude
  ) {
    const rCoords = matchedResource.location.coordinates;
    const rLat = Array.isArray(rCoords) ? rCoords[1] : rCoords.latitude;
    const rLon = Array.isArray(rCoords) ? rCoords[0] : rCoords.longitude;
    distanceKm = calculateHaversineDistanceKm(
      incident.coordinates.latitude,
      incident.coordinates.longitude,
      rLat,
      rLon
    );
  }

  const incIdStr = (incident._id || incident.id).toString();
  const actionId = `rec_${incIdStr}_${actionType}${suggestedResourceType ? `_${suggestedResourceType}` : ''}`;

  return {
    actionId,
    incidentId: incIdStr,
    incidentSummary: incident.summary || incident.category || 'Incident report',
    incidentSeverity: incident.severity || 'low',
    incidentCategory: incident.category || 'other',
    actionType,
    title,
    description,
    priority,
    recommendationScore,
    contributingFactors,
    suggestedResourceType,
    availableQuantity: matchedResource ? matchedResource.availableQuantity : null,
    distanceKm,
    reason: `${title} - Grounded in ${contributingFactors[0].reason} and ${contributingFactors[3].reason}.`,
    requiresHumanApproval: true,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateRecommendationsForIncident(incident, allResources, activeAllocations, activeAssignments) {
  if (!incident) return [];

  const incIdStr = (incident._id || incident.id).toString();

  const incAllocations = activeAllocations.filter(
    (a) => (a.incident?._id || a.incident).toString() === incIdStr
  );
  const incAssignments = activeAssignments.filter(
    (s) => (s.incidentId?._id || s.incidentId).toString() === incIdStr
  );

  const recommendations = [];

  const reqResources = Array.isArray(incident.requiredResources) ? incident.requiredResources : [];

  for (const rType of reqResources) {
    const matchingAlloc = incAllocations.find((a) => a.resourceType === rType || a.requestedType === rType);

    if (!matchingAlloc) {
      const availableCandidates = allResources.filter(
        (r) => r.type === rType && r.availableQuantity > 0
      );
      availableCandidates.sort((a, b) => b.availableQuantity - a.availableQuantity);

      if (availableCandidates.length > 0) {
        const bestCandidate = availableCandidates[0];
        recommendations.push(
          compileRecommendation({
            incident,
            actionType: ACTION_TYPES.ALLOCATE_RESOURCE,
            title: RESOURCE_TITLES[rType] || `Allocate ${rType.replace('_', ' ')}`,
            description: `Allocate ${bestCandidate.name} (${rType.replace('_', ' ')}) to address direct incident requirements.`,
            suggestedResourceType: rType,
            matchedResource: bestCandidate,
            activeAllocations,
            activeAssignments,
          })
        );
      } else {
        recommendations.push(
          compileRecommendation({
            incident,
            actionType: ACTION_TYPES.REQUEST_INVENTORY,
            title: `Request Mutual Aid: ${rType.replace('_', ' ')}`,
            description: `Local ${rType.replace('_', ' ')} supply is exhausted. Escalate a regional mutual aid requisition.`,
            suggestedResourceType: rType,
            matchedResource: { availableQuantity: 0 },
            activeAllocations,
            activeAssignments,
          })
        );
      }
    }
  }

  if (incAssignments.length === 0) {
    recommendations.push(
      compileRecommendation({
        incident,
        actionType: ACTION_TYPES.ASSIGN_RESPONDER,
        title: 'Assign Field Responder Unit',
        description: 'Triage queue indicates no personnel currently assigned. Dispatch active responder unit to scene.',
        suggestedResourceType: null,
        matchedResource: null,
        activeAllocations,
        activeAssignments,
      })
    );
  }

  if (incident.verificationState === 'needs_review' || incident.status === 'under_review') {
    recommendations.push(
      compileRecommendation({
        incident,
        actionType: ACTION_TYPES.VERIFY_INCIDENT,
        title: 'Conduct Field Incident Verification',
        description: 'Incident report is flagged for manual review or under review. Dispatch scout or contact authority to confirm hazard parameters.',
        suggestedResourceType: null,
        matchedResource: null,
        activeAllocations,
        activeAssignments,
      })
    );
  }

  if (incident.possibleDuplicateOf) {
    recommendations.push(
      compileRecommendation({
        incident,
        actionType: ACTION_TYPES.REVIEW_DUPLICATE,
        title: 'Reconcile Suspected Duplicate Crisis Report',
        description: 'AI model correlated high proximity and textual similarity to existing incident. Review and link records to prevent disjoint dispatch.',
        suggestedResourceType: null,
        matchedResource: null,
        activeAllocations,
        activeAssignments,
      })
    );
  }

  if ((incident.severity || '').toLowerCase() === 'critical' || Number(incident.priorityScore) >= 80) {
    recommendations.push(
      compileRecommendation({
        incident,
        actionType: ACTION_TYPES.ESCALATE_AUTHORITY,
        title: 'Escalate to Incident Commander',
        description: 'High priority crisis threshold reached. Trigger multi-agency emergency operations command briefing.',
        suggestedResourceType: null,
        matchedResource: null,
        activeAllocations,
        activeAssignments,
      })
    );
  }

  const enRouteAssignment = incAssignments.find((a) => a.status === 'en_route' || a.status === 'assigned');
  if (enRouteAssignment) {
    recommendations.push(
      compileRecommendation({
        incident,
        actionType: ACTION_TYPES.MONITOR_ARRIVAL,
        title: 'Track Field Unit ETA to Scene',
        description: `Responder mission in progress (${enRouteAssignment.status}). Monitor GPS and transit telemetry until confirmed on scene.`,
        suggestedResourceType: null,
        matchedResource: null,
        activeAllocations,
        activeAssignments,
      })
    );
  }

  recommendations.sort((a, b) => b.recommendationScore - a.recommendationScore);
  return recommendations;
}

export async function getRecommendedActionsForIncident(incidentId) {
  if (!incidentId || !mongoose.Types.ObjectId.isValid(incidentId)) {
    throw new Error('Invalid incident ID format.');
  }

  const incident = await Incident.findById(incidentId);
  if (!incident) {
    throw new Error('Incident not found.');
  }

  const allResources = await Resource.find({});
  const activeAllocations = await ResourceAllocation.find({ status: 'active' });
  const activeAssignments = await Assignment.find({
    status: { $in: ['assigned', 'accepted', 'en_route', 'arrived'] },
  });

  return generateRecommendationsForIncident(incident, allResources, activeAllocations, activeAssignments);
}

export async function getRecommendedActionsAcrossActiveIncidents({
  limit = 20,
  actionType = null,
  severity = null,
  minScore = null,
} = {}) {
  const activeIncidents = await Incident.find({
    status: { $in: ['reported', 'under_review', 'assigned'] },
  }).sort({ priorityScore: -1 });

  const allResources = await Resource.find({});
  const activeAllocations = await ResourceAllocation.find({ status: 'active' });
  const activeAssignments = await Assignment.find({
    status: { $in: ['assigned', 'accepted', 'en_route', 'arrived'] },
  });

  let allRecs = [];

  for (const inc of activeIncidents) {
    const incRecs = await generateRecommendationsForIncident(
      inc,
      allResources,
      activeAllocations,
      activeAssignments
    );
    allRecs.push(...incRecs);
  }

  if (actionType) {
    allRecs = allRecs.filter((r) => r.actionType === actionType);
  }

  if (severity) {
    allRecs = allRecs.filter((r) => r.incidentSeverity.toLowerCase() === severity.toLowerCase());
  }

  if (minScore !== null && !isNaN(Number(minScore))) {
    const scoreThreshold = Number(minScore);
    allRecs = allRecs.filter((r) => r.recommendationScore >= scoreThreshold);
  }

  allRecs.sort((a, b) => b.recommendationScore - a.recommendationScore);

  const parsedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return allRecs.slice(0, parsedLimit);
}

export default {
  getRecommendedActionsForIncident,
  getRecommendedActionsAcrossActiveIncidents,
  generateRecommendationsForIncident,
  compileRecommendation,
  scoreSeverityAndPriority,
  scoreUrgency,
  scorePopulationAndInjuries,
  scoreResourceSuitability,
  scoreInventoryAvailability,
  scoreOperationalStatus,
  SCORING_WEIGHTS,
  ACTION_TYPES,
};

