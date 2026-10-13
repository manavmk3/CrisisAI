export const EARTH_RADIUS_KM = 6371;

export function isValidCoordinate(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return false;
  }
  if (typeof lat === 'boolean' || typeof lon === 'boolean') {
    return false;
  }
  if (typeof lat !== 'number' && typeof lat !== 'string') {
    return false;
  }
  if (typeof lon !== 'number' && typeof lon !== 'string') {
    return false;
  }
  if (typeof lat === 'string' && lat.trim() === '') {
    return false;
  }
  if (typeof lon === 'string' && lon.trim() === '') {
    return false;
  }
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) {
    return false;
  }
  if (nLat < -90 || nLat > 90) {
    return false;
  }
  if (nLon < -180 || nLon > 180) {
    return false;
  }
  return true;
}

export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return null;
  }

  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (nLat1 === nLat2 && nLon1 === nLon2) {
    return 0;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(nLat2 - nLat1);
  const dLon = toRad(nLon2 - nLon1);
  const phi1 = toRad(nLat1);
  const phi2 = toRad(nLat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(Math.max(0, 1 - clampedA)));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100;
}

export function calculateBoundingBox(lat, lon, radiusKm) {
  if (!isValidCoordinate(lat, lon)) {
    return null;
  }
  const rad = Number(radiusKm);
  if (!Number.isFinite(rad) || rad <= 0) {
    return null;
  }

  const nLat = Number(lat);
  const nLon = Number(lon);

  const latDelta = (rad / EARTH_RADIUS_KM) * (180 / Math.PI);
  const minLat = Math.max(-90, nLat - latDelta);
  const maxLat = Math.min(90, nLat + latDelta);

  const cosLat = Math.cos((nLat * Math.PI) / 180);
  let lonDelta = 180;
  if (Math.abs(cosLat) > 0.000001) {
    lonDelta = (rad / (EARTH_RADIUS_KM * Math.abs(cosLat))) * (180 / Math.PI);
  }

  if (lonDelta >= 180) {
    return { minLat, maxLat, minLon: -180, maxLon: 180 };
  }

  let minLon = nLon - lonDelta;
  let maxLon = nLon + lonDelta;

  if (minLon < -180) minLon += 360;
  if (maxLon > 180) maxLon -= 360;

  return { minLat, maxLat, minLon, maxLon };
}

export default {
  EARTH_RADIUS_KM,
  isValidCoordinate,
  calculateHaversineDistanceKm,
  calculateBoundingBox,
};
