export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

export function isValidLatitude(lat) {
  if (lat === null || lat === undefined || lat === '' || typeof lat === 'boolean') {
    return false;
  }
  const num = typeof lat === 'number' ? lat : Number(lat);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return false;
  }
  return num >= LATITUDE_MIN && num <= LATITUDE_MAX;
}

export function isValidLongitude(lng) {
  if (lng === null || lng === undefined || lng === '' || typeof lng === 'boolean') {
    return false;
  }
  const num = typeof lng === 'number' ? lng : Number(lng);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return false;
  }
  return num >= LONGITUDE_MIN && num <= LONGITUDE_MAX;
}

export function validateCoordinates(coords) {
  if (!coords) {
    return { isValid: false, latitude: null, longitude: null, error: 'Coordinates object is missing or null' };
  }

  let latVal;
  let lngVal;

  if (Array.isArray(coords)) {
    if (coords.length < 2) {
      return { isValid: false, latitude: null, longitude: null, error: 'Coordinate array must have at least 2 elements [lat, lng]' };
    }
    [latVal, lngVal] = coords;
  } else if (typeof coords === 'object') {
    latVal = coords.latitude !== undefined ? coords.latitude : coords.lat;
    lngVal = coords.longitude !== undefined ? coords.longitude : coords.lng;
  } else {
    return { isValid: false, latitude: null, longitude: null, error: 'Coordinates must be an object or array' };
  }

  const validLat = isValidLatitude(latVal);
  const validLng = isValidLongitude(lngVal);

  if (!validLat && !validLng) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      error: `Invalid latitude (${latVal}) and longitude (${lngVal})`,
    };
  }

  if (!validLat) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      error: `Invalid latitude (${latVal}). Must be a number between -90 and 90`,
    };
  }

  if (!validLng) {
    return {
      isValid: false,
      latitude: null,
      longitude: null,
      error: `Invalid longitude (${lngVal}). Must be a number between -180 and 180`,
    };
  }

  const numLat = typeof latVal === 'number' ? latVal : Number(latVal);
  const numLng = typeof lngVal === 'number' ? lngVal : Number(lngVal);

  return {
    isValid: true,
    latitude: numLat,
    longitude: numLng,
    error: null,
  };
}

export function extractIncidentCoordinates(incident) {
  if (!incident) {
    return { hasCoordinates: false, latitude: null, longitude: null, error: 'No incident provided' };
  }

  const candidateCoords = incident.coordinates || {
    latitude: incident.latitude,
    longitude: incident.longitude,
  };

  const validation = validateCoordinates(candidateCoords);
  if (validation.isValid) {
    return {
      hasCoordinates: true,
      latitude: validation.latitude,
      longitude: validation.longitude,
      error: null,
    };
  }

  return {
    hasCoordinates: false,
    latitude: null,
    longitude: null,
    error: validation.error,
  };
}
