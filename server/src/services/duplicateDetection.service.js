export const TEXT_DUPLICATE_THRESHOLD = 0.75;
export const DUPLICATE_DISTANCE_KM = 5;
export const DUPLICATE_TIME_WINDOW_HOURS = 48;
export const ACTIVE_INCIDENT_STATUSES = ['reported', 'under_review', 'assigned'];
export const RECENT_INCIDENTS_LIMIT = 50;
export const EARTH_RADIUS_KM = 6371;

export function normalizeText(text) {
  if (text === null || text === undefined || typeof text !== 'string') {
    return '';
  }

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }
  return normalized.split(' ').filter(Boolean);
}

export function calculateCosineSimilarity(text1, text2) {
  const norm1 = normalizeText(text1);
  const norm2 = normalizeText(text2);

  if (!norm1 || !norm2) {
    return 0.0;
  }

  if (norm1 === norm2) {
    return 1.0;
  }

  const tokens1 = tokenize(norm1);
  const tokens2 = tokenize(norm2);

  if (tokens1.length === 0 || tokens2.length === 0) {
    return 0.0;
  }

  const tf1 = Object.create(null);
  const tf2 = Object.create(null);

  for (const token of tokens1) {
    tf1[token] = (tf1[token] || 0) + 1;
  }
  for (const token of tokens2) {
    tf2[token] = (tf2[token] || 0) + 1;
  }

  let dotProduct = 0;
  let sumSq1 = 0;
  let sumSq2 = 0;

  for (const token in tf1) {
    const count1 = tf1[token];
    sumSq1 += count1 * count1;
    if (tf2[token]) {
      dotProduct += count1 * tf2[token];
    }
  }

  for (const token in tf2) {
    const count2 = tf2[token];
    sumSq2 += count2 * count2;
  }

  const magnitude = Math.sqrt(sumSq1) * Math.sqrt(sumSq2);
  if (magnitude === 0) {
    return 0.0;
  }

  const similarity = dotProduct / magnitude;
  return Math.min(Math.max(similarity, 0.0), 1.0);
}

export function isValidCoordinate(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lon < -180 || lon > 180) return false;
  return true;
}

export function extractCoordinates(obj) {
  if (!obj || typeof obj !== 'object') return null;
  let lat = null;
  let lon = null;

  if (obj.coordinates && typeof obj.coordinates === 'object') {
    lat = obj.coordinates.latitude;
    lon = obj.coordinates.longitude;
  } else if (obj.location && typeof obj.location === 'object' && obj.location.coordinates) {
    lat = obj.location.coordinates.latitude;
    lon = obj.location.coordinates.longitude;
  } else if (obj.latitude !== undefined && obj.longitude !== undefined) {
    lat = obj.latitude;
    lon = obj.longitude;
  }

  const nLat = typeof lat === 'string' && lat.trim() !== '' ? Number(lat) : lat;
  const nLon = typeof lon === 'string' && lon.trim() !== '' ? Number(lon) : lon;

  if (isValidCoordinate(nLat, nLon)) {
    return { latitude: nLat, longitude: nLon };
  }
  return null;
}

export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const nLat1 = typeof lat1 === 'string' && lat1.trim() !== '' ? Number(lat1) : lat1;
  const nLon1 = typeof lon1 === 'string' && lon1.trim() !== '' ? Number(lon1) : lon1;
  const nLat2 = typeof lat2 === 'string' && lat2.trim() !== '' ? Number(lat2) : lat2;
  const nLon2 = typeof lon2 === 'string' && lon2.trim() !== '' ? Number(lon2) : lon2;

  if (!isValidCoordinate(nLat1, nLon1) || !isValidCoordinate(nLat2, nLon2)) {
    return null;
  }

  if (nLat1 === nLat2 && nLon1 === nLon2) {
    return 0.0;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(nLat2 - nLat1);
  const dLon = toRad(nLon2 - nLon1);
  const phi1 = toRad(nLat1);
  const phi2 = toRad(nLat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const distance = EARTH_RADIUS_KM * c;

  return Number(distance.toFixed(4));
}

export function calculateTimeDifferenceHours(time1, time2) {
  if (!time1 || !time2) return null;
  const d1 = new Date(time1);
  const d2 = new Date(time2);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Number((diffMs / (1000 * 60 * 60)).toFixed(4));
}

export function logDuplicateCandidate({ incidentId, similarity, threshold }) {
  const logEvent = {
    event: 'DUPLICATE_CANDIDATE',
    incidentId: String(incidentId),
    similarity: Number(similarity.toFixed(4)),
    threshold: Number(threshold.toFixed(2)),
    timestamp: new Date().toISOString(),
  };

  console.log(JSON.stringify(logEvent));
}

export function logLikelyDuplicate({
  newIncidentId,
  possibleDuplicateOf,
  textSimilarity,
  distanceKm,
  timeDifferenceHours,
  thresholds = {},
}) {
  const logEvent = {
    event: 'LIKELY_DUPLICATE',
    newIncidentId: newIncidentId ? String(newIncidentId) : null,
    possibleDuplicateOf: String(possibleDuplicateOf),
    textSimilarity: Number(textSimilarity.toFixed(4)),
    distanceKm: distanceKm !== null ? Number(distanceKm.toFixed(4)) : null,
    timeDifferenceHours: timeDifferenceHours !== null ? Number(timeDifferenceHours.toFixed(4)) : null,
    thresholds: {
      text: thresholds.text ?? TEXT_DUPLICATE_THRESHOLD,
      distanceKm: thresholds.distanceKm ?? DUPLICATE_DISTANCE_KM,
      timeHours: thresholds.timeHours ?? DUPLICATE_TIME_WINDOW_HOURS,
    },
    timestamp: new Date().toISOString(),
  };

  console.log(JSON.stringify(logEvent));
}

export function evaluateDuplicateSignals(newIncident, existingIncident, options = {}) {
  const textThreshold = typeof options.textThreshold === 'number' ? options.textThreshold : TEXT_DUPLICATE_THRESHOLD;
  const distanceThreshold = typeof options.distanceThreshold === 'number' ? options.distanceThreshold : DUPLICATE_DISTANCE_KM;
  const timeThreshold = typeof options.timeThreshold === 'number' ? options.timeThreshold : DUPLICATE_TIME_WINDOW_HOURS;

  const newReport = newIncident.report || newIncident.description || '';
  const existingReport = existingIncident.report || existingIncident.description || existingIncident.summary || '';

  const textSimilarity = Number(calculateCosineSimilarity(newReport, existingReport).toFixed(4));
  const textMatch = textSimilarity >= textThreshold;

  const newCoords = extractCoordinates(newIncident);
  const existingCoords = extractCoordinates(existingIncident);

  let distanceKm = null;
  let geoMatch = null;

  if (newCoords && existingCoords) {
    distanceKm = calculateHaversineDistance(
      newCoords.latitude,
      newCoords.longitude,
      existingCoords.latitude,
      existingCoords.longitude
    );
    if (distanceKm !== null) {
      geoMatch = distanceKm <= distanceThreshold;
    }
  }

  const newTime = newIncident.createdAt || new Date();
  const existingTime = existingIncident.createdAt;
  let timeDifferenceHours = null;
  let timeMatch = false;

  if (existingTime) {
    timeDifferenceHours = calculateTimeDifferenceHours(newTime, existingTime);
    if (timeDifferenceHours !== null) {
      timeMatch = timeDifferenceHours <= timeThreshold;
    }
  } else {
    timeMatch = false;
  }

  const likelyDuplicate = textMatch === true && geoMatch === true && timeMatch === true;
  const incidentId = String(existingIncident._id || existingIncident.id || '');

  return {
    incidentId,
    textSimilarity,
    similarity: textSimilarity,
    distanceKm,
    timeDifferenceHours,
    textMatch,
    geoMatch,
    timeMatch,
    likelyDuplicate,
    matchedReport: existingReport,
    candidate: likelyDuplicate || textMatch,
  };
}

export function findMultiSignalDuplicates(newIncident, incidents, options = {}) {
  if (!newIncident || !Array.isArray(incidents) || incidents.length === 0) {
    return {
      likelyDuplicate: false,
      possibleDuplicateOf: null,
      duplicateReason: null,
      candidates: [],
    };
  }

  const candidates = [];

  for (const existing of incidents) {
    if (!existing || typeof existing !== 'object') continue;
    const evaluated = evaluateDuplicateSignals(newIncident, existing, options);
    candidates.push(evaluated);

    if (evaluated.textMatch && options.enableLogging !== false) {
      logDuplicateCandidate({
        incidentId: evaluated.incidentId,
        similarity: evaluated.textSimilarity,
        threshold: options.textThreshold ?? TEXT_DUPLICATE_THRESHOLD,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.likelyDuplicate !== b.likelyDuplicate) {
      return a.likelyDuplicate ? -1 : 1;
    }
    if (b.textSimilarity !== a.textSimilarity) {
      return b.textSimilarity - a.textSimilarity;
    }
    const distA = a.distanceKm !== null ? a.distanceKm : Infinity;
    const distB = b.distanceKm !== null ? b.distanceKm : Infinity;
    return distA - distB;
  });

  const bestMatch = candidates.find((c) => c.likelyDuplicate) || null;

  if (bestMatch && options.enableLogging !== false) {
    logLikelyDuplicate({
      newIncidentId: newIncident._id || newIncident.id,
      possibleDuplicateOf: bestMatch.incidentId,
      textSimilarity: bestMatch.textSimilarity,
      distanceKm: bestMatch.distanceKm,
      timeDifferenceHours: bestMatch.timeDifferenceHours,
      thresholds: {
        text: options.textThreshold ?? TEXT_DUPLICATE_THRESHOLD,
        distanceKm: options.distanceThreshold ?? DUPLICATE_DISTANCE_KM,
        timeHours: options.timeThreshold ?? DUPLICATE_TIME_WINDOW_HOURS,
      },
    });
  }

  return {
    likelyDuplicate: !!bestMatch,
    possibleDuplicateOf: bestMatch ? bestMatch.incidentId : null,
    duplicateReason: bestMatch
      ? {
          textSimilarity: bestMatch.textSimilarity,
          distanceKm: bestMatch.distanceKm,
          timeDifferenceHours: bestMatch.timeDifferenceHours,
        }
      : null,
    candidates,
  };
}

export function findTextDuplicateCandidates(reportText, incidents, options = {}) {
  const threshold = typeof options.threshold === 'number' ? options.threshold : TEXT_DUPLICATE_THRESHOLD;
  const enableLogging = options.enableLogging !== false;

  if (!reportText || typeof reportText !== 'string' || !Array.isArray(incidents) || incidents.length === 0) {
    return [];
  }

  const candidates = [];

  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    if (!inc || typeof inc !== 'object') continue;

    const matchedReport = inc.report || inc.description || inc.summary || '';
    if (!matchedReport || typeof matchedReport !== 'string') continue;

    const incidentId = inc._id || inc.id || `candidate_${i}`;
    const similarity = calculateCosineSimilarity(reportText, matchedReport);

    if (similarity >= threshold) {
      candidates.push({
        incidentId: String(incidentId),
        similarity: Number(similarity.toFixed(4)),
        matchedReport,
        candidate: true,
      });
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);

  if (enableLogging) {
    for (const candidate of candidates) {
      logDuplicateCandidate({
        incidentId: candidate.incidentId,
        similarity: candidate.similarity,
        threshold,
      });
    }
  }

  return candidates;
}

export default {
  TEXT_DUPLICATE_THRESHOLD,
  DUPLICATE_DISTANCE_KM,
  DUPLICATE_TIME_WINDOW_HOURS,
  ACTIVE_INCIDENT_STATUSES,
  RECENT_INCIDENTS_LIMIT,
  EARTH_RADIUS_KM,
  normalizeText,
  tokenize,
  calculateCosineSimilarity,
  isValidCoordinate,
  extractCoordinates,
  calculateHaversineDistance,
  calculateTimeDifferenceHours,
  evaluateDuplicateSignals,
  findMultiSignalDuplicates,
  findTextDuplicateCandidates,
  logDuplicateCandidate,
  logLikelyDuplicate,
};
