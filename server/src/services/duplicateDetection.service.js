export const TEXT_DUPLICATE_THRESHOLD = 0.75;
export const ACTIVE_INCIDENT_STATUSES = ['reported', 'under_review', 'assigned'];
export const RECENT_INCIDENTS_LIMIT = 50;

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
  ACTIVE_INCIDENT_STATUSES,
  RECENT_INCIDENTS_LIMIT,
  normalizeText,
  tokenize,
  calculateCosineSimilarity,
  logDuplicateCandidate,
  findTextDuplicateCandidates,
};
