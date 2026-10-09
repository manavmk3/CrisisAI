export const RESOURCE_TYPE_COMPATIBILITY = Object.freeze({
  ambulance: ['ambulance', 'medical_team'],
  medical_team: ['medical_team', 'ambulance'],
  fire_rescue: ['fire_rescue', 'fire_truck'],
  fire_truck: ['fire_truck', 'fire_rescue'],
  search_rescue: ['search_rescue', 'rescue_boat', 'drone', 'heavy_machinery'],
  rescue_boat: ['rescue_boat', 'search_rescue'],
  drone: ['drone', 'search_rescue'],
  heavy_machinery: ['heavy_machinery', 'search_rescue'],
  food: ['food', 'food_water_supply', 'drinking_water'],
  drinking_water: ['drinking_water', 'food_water_supply', 'food'],
  food_water_supply: ['food_water_supply', 'food', 'drinking_water'],
  shelter: ['shelter', 'shelter_kit'],
  shelter_kit: ['shelter_kit', 'shelter'],
  police: ['police', 'evacuation_team'],
  evacuation_team: ['evacuation_team', 'evacuation_bus', 'police'],
  evacuation_bus: ['evacuation_bus', 'evacuation_team'],
});

export const URGENCY_POINTS = Object.freeze({
  immediate: 15,
  urgent: 11,
  soon: 7,
  routine: 4,
});

export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    lat1 === null ||
    lat1 === undefined ||
    lon1 === null ||
    lon1 === undefined ||
    lat2 === null ||
    lat2 === undefined ||
    lon2 === null ||
    lon2 === undefined
  ) {
    return null;
  }

  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);

  if (
    Number.isNaN(numLat1) ||
    Number.isNaN(numLon1) ||
    Number.isNaN(numLat2) ||
    Number.isNaN(numLon2)
  ) {
    return null;
  }

  const R = 6371;
  const dLat = ((numLat2 - numLat1) * Math.PI) / 180;
  const dLon = ((numLon2 - numLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((numLat1 * Math.PI) / 180) *
      Math.cos((numLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function rankCandidateResources(incident, availableResources) {
  if (!Array.isArray(availableResources)) return [];
  const inc = incident || {};
  const requiredTypes = Array.isArray(inc.requiredResources)
    ? inc.requiredResources.map((t) => String(t).toLowerCase())
    : [];

  const incLat = inc.coordinates?.latitude ?? inc.latitude ?? null;
  const incLon = inc.coordinates?.longitude ?? inc.longitude ?? null;
  const priorityScore = Number(inc.priorityScore) || 50;
  const urgency = (inc.urgency || 'soon').toLowerCase();
  const urgencyScore = URGENCY_POINTS[urgency] || URGENCY_POINTS.soon;
  const priorityPoints = Math.round(((priorityScore / 100) * 25) * 100) / 100;

  const eligible = availableResources.filter(
    (r) =>
      r &&
      r.status === 'available' &&
      typeof r.availableQuantity === 'number' &&
      r.availableQuantity > 0
  );

  const scored = eligible.map((res) => {
    const resType = (res.type || '').toLowerCase();

    let suitability = 0;
    let matchType = 'none';

    if (requiredTypes.length === 0) {
      suitability = 20;
      matchType = 'general';
    } else if (requiredTypes.includes(resType)) {
      suitability = 35;
      matchType = 'exact';
    } else {
      const isCompatible = requiredTypes.some((reqType) => {
        const compatibleList = RESOURCE_TYPE_COMPATIBILITY[reqType] || [];
        return compatibleList.includes(resType);
      });

      if (isCompatible) {
        suitability = 25;
        matchType = 'compatible';
      } else {
        suitability = 5;
        matchType = 'none';
      }
    }

    const resLat = res.latitude ?? null;
    const resLon = res.longitude ?? null;
    const distanceKm = calculateHaversineDistanceKm(incLat, incLon, resLat, resLon);

    let distancePoints = 15;
    if (distanceKm !== null) {
      distancePoints = Math.max(5, Math.min(25, 25 - distanceKm * 0.4));
      distancePoints = Math.round(distancePoints * 100) / 100;
    }

    const totalRaw = suitability + distancePoints + priorityPoints + urgencyScore;
    const finalScore = Math.round(Math.min(100, Math.max(0, totalRaw)));

    const explanationParts = [];
    if (matchType === 'exact') explanationParts.push(`Exact resource type match (${suitability} pts)`);
    else if (matchType === 'compatible') explanationParts.push(`Compatible resource alternative (${suitability} pts)`);
    else if (matchType === 'general') explanationParts.push(`General emergency response inventory (${suitability} pts)`);
    else explanationParts.push(`Secondary resource type (${suitability} pts)`);

    if (distanceKm !== null) {
      explanationParts.push(`Distance ${distanceKm} km (${distancePoints} pts)`);
    } else {
      explanationParts.push(`Standard location score (${distancePoints} pts)`);
    }

    explanationParts.push(`Incident priority weight (${priorityPoints} pts)`);
    explanationParts.push(`Urgency: ${urgency} (${urgencyScore} pts)`);

    return {
      resourceId: res._id?.toString() || res.id,
      resourceName: res.name,
      resourceType: res.type,
      location: res.location || '',
      availableQuantity: res.availableQuantity,
      totalQuantity: res.quantity,
      status: res.status,
      distanceKm,
      score: finalScore,
      matchType,
      breakdown: {
        suitability,
        distance: distancePoints,
        incidentPriority: priorityPoints,
        urgency: urgencyScore,
      },
      explanation: explanationParts.join(', '),
      rawResource: res,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.availableQuantity !== a.availableQuantity) return b.availableQuantity - a.availableQuantity;
    return String(a.resourceId).localeCompare(String(b.resourceId));
  });

  return scored;
}

export default {
  RESOURCE_TYPE_COMPATIBILITY,
  URGENCY_POINTS,
  calculateHaversineDistanceKm,
  rankCandidateResources,
};
