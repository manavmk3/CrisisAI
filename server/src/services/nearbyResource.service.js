import Resource, { RESOURCE_TYPES, RESOURCE_STATUSES } from '../models/Resource.js';
import { RESOURCE_TYPE_COMPATIBILITY } from './resourceRanking.js';
import {
  isValidCoordinate,
  calculateHaversineDistanceKm,
} from './geoDistance.service.js';

export class NearbyResourceServiceError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'NearbyResourceServiceError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const MIN_SEARCH_RADIUS_KM = 1;
export const MAX_SEARCH_RADIUS_KM = 200;
export const DEFAULT_SEARCH_RADIUS_KM = 10;

export function extractIncidentCoordinates(incidentOrLocation) {
  if (!incidentOrLocation || typeof incidentOrLocation !== 'object') {
    return null;
  }

  let lat = null;
  let lon = null;

  if (incidentOrLocation.coordinates && typeof incidentOrLocation.coordinates === 'object') {
    lat = incidentOrLocation.coordinates.latitude;
    lon = incidentOrLocation.coordinates.longitude;
  } else if (incidentOrLocation.latitude !== undefined && incidentOrLocation.longitude !== undefined) {
    lat = incidentOrLocation.latitude;
    lon = incidentOrLocation.longitude;
  }

  if (isValidCoordinate(lat, lon)) {
    return {
      latitude: Number(lat),
      longitude: Number(lon),
    };
  }

  return null;
}

export async function findNearbyResources({
  incident,
  radiusKm = DEFAULT_SEARCH_RADIUS_KM,
  type = null,
  status = null,
  availableOnly = true,
  minQuantity = null,
  exactTypeOnly = false,
}) {
  const incCoords = extractIncidentCoordinates(incident);
  if (!incCoords) {
    throw new NearbyResourceServiceError(
      'Incident does not have valid GPS coordinates for geographic search.',
      400
    );
  }

  if (radiusKm === undefined || radiusKm === null || radiusKm === '') {
    radiusKm = DEFAULT_SEARCH_RADIUS_KM;
  }

  const numRadius = Number(radiusKm);
  if (!Number.isFinite(numRadius) || numRadius < MIN_SEARCH_RADIUS_KM || numRadius > MAX_SEARCH_RADIUS_KM) {
    throw new NearbyResourceServiceError(
      `radiusKm must be a number between ${MIN_SEARCH_RADIUS_KM} and ${MAX_SEARCH_RADIUS_KM}.`,
      400
    );
  }

  let isAvailableOnly = true;
  if (typeof availableOnly === 'boolean') {
    isAvailableOnly = availableOnly;
  } else if (typeof availableOnly === 'string') {
    const lower = availableOnly.trim().toLowerCase();
    if (lower === 'true' || lower === '1') {
      isAvailableOnly = true;
    } else if (lower === 'false' || lower === '0') {
      isAvailableOnly = false;
    } else {
      throw new NearbyResourceServiceError(
        'Invalid availableOnly parameter. Must be boolean (true/false).',
        400
      );
    }
  }

  const knownTypes = new Set([
    ...RESOURCE_TYPES,
    ...Object.keys(RESOURCE_TYPE_COMPATIBILITY),
  ]);

  let requestedType = null;
  if (type !== undefined && type !== null && type !== '' && type !== 'all') {
    if (typeof type !== 'string') {
      throw new NearbyResourceServiceError('Resource type filter must be a string.', 400);
    }
    const normType = type.trim().toLowerCase();
    if (!knownTypes.has(normType)) {
      throw new NearbyResourceServiceError(
        `Unknown resource type: "${type}". Allowed types: ${RESOURCE_TYPES.join(', ')}`,
        400
      );
    }
    requestedType = normType;
  }

  let requestedStatus = null;
  if (status !== undefined && status !== null && status !== '' && status !== 'all') {
    if (typeof status !== 'string') {
      throw new NearbyResourceServiceError('Status filter must be a string.', 400);
    }
    const normStatus = status.trim().toLowerCase();
    if (!RESOURCE_STATUSES.includes(normStatus)) {
      throw new NearbyResourceServiceError(
        `Invalid status filter: "${status}". Allowed: ${RESOURCE_STATUSES.join(', ')}`,
        400
      );
    }
    requestedStatus = normStatus;
  }

  let parsedMinQty = null;
  if (minQuantity !== undefined && minQuantity !== null && minQuantity !== '') {
    const q = Number(minQuantity);
    if (!Number.isInteger(q) || q < 0) {
      throw new NearbyResourceServiceError('minQuantity must be a non-negative integer.', 400);
    }
    parsedMinQty = q;
  }

  const query = {
    latitude: { $ne: null, $type: 'number' },
    longitude: { $ne: null, $type: 'number' },
  };

  if (isAvailableOnly) {
    query.status = 'available';
    if (parsedMinQty !== null && parsedMinQty > 0) {
      query.availableQuantity = { $gte: parsedMinQty };
    } else {
      query.availableQuantity = { $gt: 0 };
    }
  } else {
    if (requestedStatus) {
      query.status = requestedStatus;
    }
    if (parsedMinQty !== null) {
      query.availableQuantity = { $gte: parsedMinQty };
    }
  }

  if (requestedType) {
    if (exactTypeOnly) {
      query.type = requestedType;
    } else {
      const allowedTypes = [
        requestedType,
        ...(RESOURCE_TYPE_COMPATIBILITY[requestedType] || []),
      ];
      query.type = { $in: allowedTypes };
    }
  }

  const rawResources = await Resource.find(query).lean();

  const incidentRequired = Array.isArray(incident.requiredResources)
    ? incident.requiredResources.map((t) => String(t).toLowerCase())
    : [];

  const evaluated = [];

  for (const res of rawResources) {
    if (!isValidCoordinate(res.latitude, res.longitude)) {
      continue;
    }

    const distanceKm = calculateHaversineDistanceKm(
      incCoords.latitude,
      incCoords.longitude,
      res.latitude,
      res.longitude
    );

    if (distanceKm === null) {
      continue;
    }

    if (distanceKm > numRadius) {
      continue;
    }

    const resType = (res.type || '').toLowerCase();
    const hasUsableStock =
      res.status === 'available' &&
      typeof res.availableQuantity === 'number' &&
      res.availableQuantity > 0;

    let matchType = 'general';
    let matchPriority = 3;
    let matchReason = '';

    if (requestedType) {
      if (resType === requestedType) {
        matchType = 'exact';
        matchPriority = 1;
        matchReason = hasUsableStock
          ? `Exact match for requested ${resType} with usable inventory`
          : `Exact match for requested ${resType} (no usable inventory)`;
      } else if (
        (RESOURCE_TYPE_COMPATIBILITY[requestedType] || []).includes(resType)
      ) {
        matchType = 'compatible';
        matchPriority = 2;
        matchReason = hasUsableStock
          ? `Compatible alternative (${resType}) for requested ${requestedType}`
          : `Compatible alternative (${resType}) for requested ${requestedType} (no usable inventory)`;
      } else {
        matchType = 'secondary';
        matchPriority = 4;
        matchReason = `Secondary resource type within search radius`;
      }
    } else if (incidentRequired.length > 0) {
      if (incidentRequired.includes(resType)) {
        matchType = 'exact';
        matchPriority = 1;
        matchReason = hasUsableStock
          ? `Exact match for incident required resource: ${resType}`
          : `Exact match for incident requirement (no usable inventory)`;
      } else {
        const isCompat = incidentRequired.some((req) =>
          (RESOURCE_TYPE_COMPATIBILITY[req] || []).includes(resType)
        );
        if (isCompat) {
          matchType = 'compatible';
          matchPriority = 2;
          matchReason = hasUsableStock
            ? `Compatible alternative (${resType}) for incident requirement`
            : `Compatible alternative (${resType}) (no usable inventory)`;
        } else {
          matchType = 'general';
          matchPriority = 3;
          matchReason = hasUsableStock
            ? `General emergency response resource within search radius`
            : `General resource within search radius (no usable inventory)`;
        }
      }
    } else {
      matchType = 'general';
      matchPriority = 1;
      matchReason = hasUsableStock
        ? `Available emergency inventory within search radius`
        : `Emergency resource within search radius (status: ${res.status})`;
    }

    evaluated.push({
      resourceId: res._id ? res._id.toString() : String(res.id),
      _id: res._id,
      id: res._id ? res._id.toString() : String(res.id),
      name: res.name,
      type: res.type,
      status: res.status,
      quantity: res.quantity,
      availableQuantity: res.availableQuantity !== undefined ? res.availableQuantity : res.quantity,
      location: res.location || '',
      latitude: res.latitude,
      longitude: res.longitude,
      distanceKm,
      matchType,
      matchPriority,
      matchReason,
      hasUsableStock,
      isAvailable: res.status === 'available' && (res.availableQuantity || 0) > 0,
      createdAt: res.createdAt,
      updatedAt: res.updatedAt,
    });
  }

  evaluated.sort((a, b) => {
    if (a.hasUsableStock !== b.hasUsableStock) {
      return a.hasUsableStock ? -1 : 1;
    }
    if (a.matchPriority !== b.matchPriority) {
      return a.matchPriority - b.matchPriority;
    }
    if (a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    if (b.availableQuantity !== a.availableQuantity) {
      return b.availableQuantity - a.availableQuantity;
    }
    return String(a.resourceId).localeCompare(String(b.resourceId));
  });

  return {
    resources: evaluated,
    count: evaluated.length,
    searchOptions: {
      radiusKm: numRadius,
      type: requestedType,
      status: requestedStatus,
      availableOnly: isAvailableOnly,
      minQuantity: parsedMinQty,
      incidentCoordinates: incCoords,
    },
  };
}

export default {
  findNearbyResources,
  extractIncidentCoordinates,
  NearbyResourceServiceError,
  MIN_SEARCH_RADIUS_KM,
  MAX_SEARCH_RADIUS_KM,
  DEFAULT_SEARCH_RADIUS_KM,
};
