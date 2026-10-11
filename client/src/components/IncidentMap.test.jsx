import {
  isValidLatitude,
  isValidLongitude,
  validateCoordinates,
  extractIncidentCoordinates,
  LATITUDE_MIN,
  LATITUDE_MAX,
  LONGITUDE_MIN,
  LONGITUDE_MAX,
} from '../utils/coordinateValidation';

import {
  DEFAULT_TILE_LAYER,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  DETAIL_MAP_ZOOM,
} from './IncidentMap';

export function runIncidentMapTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      passed++;
      results.push({ name: testName, status: 'PASS' });
      console.log(`  ✅ PASS: ${testName}`);
    } else {
      failed++;
      results.push({ name: testName, status: 'FAIL', details });
      console.error(`  ❌ FAIL: ${testName} - ${details}`);
    }
  }

  console.log('\n--- 1. OSM Tile Layer & Attribution Configuration ---');
  assert(
    DEFAULT_TILE_LAYER && typeof DEFAULT_TILE_LAYER.url === 'string',
    'Tile layer URL is configured'
  );
  assert(
    DEFAULT_TILE_LAYER.url.includes('tile.openstreetmap.org'),
    'Tile layer points to public OpenStreetMap endpoint'
  );
  assert(
    DEFAULT_TILE_LAYER.attribution.includes('OpenStreetMap') &&
    DEFAULT_TILE_LAYER.attribution.includes('contributors'),
    'Tile layer contains required OpenStreetMap attribution'
  );
  assert(
    DEFAULT_TILE_LAYER.maxZoom === 19 && DEFAULT_TILE_LAYER.minZoom >= 1,
    'Tile layer specifies valid zoom boundaries (min >= 1, max = 19)'
  );

  console.log('\n--- 2. Default Map Centering & Zoom ---');
  assert(
    Array.isArray(DEFAULT_MAP_CENTER) && DEFAULT_MAP_CENTER.length === 2,
    'Default center is a 2-element coordinate array [lat, lng]'
  );
  assert(
    isValidLatitude(DEFAULT_MAP_CENTER[0]) && isValidLongitude(DEFAULT_MAP_CENTER[1]),
    'Default center coordinates are valid numbers within geographic boundaries'
  );
  assert(
    typeof DEFAULT_MAP_ZOOM === 'number' && DEFAULT_MAP_ZOOM >= 2 && DEFAULT_MAP_ZOOM <= 18,
    'Default overview zoom level is sensible'
  );
  assert(
    typeof DETAIL_MAP_ZOOM === 'number' && DETAIL_MAP_ZOOM > DEFAULT_MAP_ZOOM,
    'Incident detail zoom level is higher than overview zoom level'
  );

  console.log('\n--- 3. Latitude Range Validation (-90 to 90) ---');
  assert(isValidLatitude(0) === true, 'Latitude 0 is valid (Equator)');
  assert(isValidLatitude(90) === true, 'Latitude 90 is valid (North Pole)');
  assert(isValidLatitude(-90) === true, 'Latitude -90 is valid (South Pole)');
  assert(isValidLatitude(28.6139) === true, 'Latitude 28.6139 is valid');
  assert(isValidLatitude('12.9165') === true, 'Numeric string latitude is parsed and valid');

  assert(isValidLatitude(90.0001) === false, 'Latitude > 90 is rejected');
  assert(isValidLatitude(-90.1) === false, 'Latitude < -90 is rejected');
  assert(isValidLatitude(null) === false, 'Null latitude is rejected');
  assert(isValidLatitude(undefined) === false, 'Undefined latitude is rejected');
  assert(isValidLatitude('') === false, 'Empty string latitude is rejected');
  assert(isValidLatitude(NaN) === false, 'NaN latitude is rejected');
  assert(isValidLatitude('invalid') === false, 'Non-numeric string latitude is rejected');
  assert(isValidLatitude(true) === false, 'Boolean true latitude is rejected');

  console.log('\n--- 4. Longitude Range Validation (-180 to 180) ---');
  assert(isValidLongitude(0) === true, 'Longitude 0 is valid (Prime Meridian)');
  assert(isValidLongitude(180) === true, 'Longitude 180 is valid (Antimeridian)');
  assert(isValidLongitude(-180) === true, 'Longitude -180 is valid');
  assert(isValidLongitude(77.2090) === true, 'Longitude 77.2090 is valid');
  assert(isValidLongitude('79.1325') === true, 'Numeric string longitude is parsed and valid');

  assert(isValidLongitude(180.0001) === false, 'Longitude > 180 is rejected');
  assert(isValidLongitude(-180.1) === false, 'Longitude < -180 is rejected');
  assert(isValidLongitude(null) === false, 'Null longitude is rejected');
  assert(isValidLongitude(undefined) === false, 'Undefined longitude is rejected');
  assert(isValidLongitude('') === false, 'Empty string longitude is rejected');
  assert(isValidLongitude(NaN) === false, 'NaN longitude is rejected');
  assert(isValidLongitude('invalid') === false, 'Non-numeric string longitude is rejected');
  assert(isValidLongitude(false) === false, 'Boolean false longitude is rejected');

  console.log('\n--- 5. Coordinate Pair Validation ({ latitude, longitude } / [lat, lng]) ---');
  const validObj = validateCoordinates({ latitude: 12.9165, longitude: 79.1325 });
  assert(
    validObj.isValid === true && validObj.latitude === 12.9165 && validObj.longitude === 79.1325,
    'Valid { latitude, longitude } object accepted'
  );

  const validArr = validateCoordinates([28.6139, 77.2090]);
  assert(
    validArr.isValid === true && validArr.latitude === 28.6139 && validArr.longitude === 77.2090,
    'Valid [lat, lng] array accepted'
  );

  const validShortObj = validateCoordinates({ lat: 28.6139, lng: 77.2090 });
  assert(
    validShortObj.isValid === true && validShortObj.latitude === 28.6139,
    'Valid { lat, lng } object accepted'
  );

  const invalidLatObj = validateCoordinates({ latitude: 120, longitude: 77 });
  assert(
    invalidLatObj.isValid === false && invalidLatObj.error.includes('latitude'),
    'Object with invalid latitude (120) is rejected with clear error'
  );

  const invalidLngObj = validateCoordinates({ latitude: 20, longitude: -200 });
  assert(
    invalidLngObj.isValid === false && invalidLngObj.error.includes('longitude'),
    'Object with invalid longitude (-200) is rejected with clear error'
  );

  const nullCoords = validateCoordinates(null);
  assert(
    nullCoords.isValid === false && nullCoords.error.includes('missing or null'),
    'Null coordinates safely rejected without exception'
  );

  console.log('\n--- 6. No Fabricated Incident Coordinates ---');
  const incidentWithCoords = {
    _id: 'inc1',
    summary: 'Flash flood at bridge',
    coordinates: { latitude: 28.6139, longitude: 77.2090 },
  };
  const extractedValid = extractIncidentCoordinates(incidentWithCoords);
  assert(
    extractedValid.hasCoordinates === true &&
    extractedValid.latitude === 28.6139 &&
    extractedValid.longitude === 77.2090,
    'Extracts telemetry when valid coordinates exist on incident'
  );

  const incidentWithoutCoords = {
    _id: 'inc2',
    summary: 'Building fire downtown',
    location: '123 Market Street',
    coordinates: { latitude: null, longitude: null },
  };
  const extractedMissing = extractIncidentCoordinates(incidentWithoutCoords);
  assert(
    extractedMissing.hasCoordinates === false &&
    extractedMissing.latitude === null &&
    extractedMissing.longitude === null,
    'Missing coordinates return hasCoordinates=false and null lat/lng'
  );
  assert(
    extractedMissing.latitude !== DEFAULT_MAP_CENTER[0],
    'Does NOT fabricate or substitute coordinates for missing location'
  );

  const incidentEmptyObject = {
    _id: 'inc3',
    summary: 'Power outage',
    location: 'North Sector',
  };
  const extractedEmpty = extractIncidentCoordinates(incidentEmptyObject);
  assert(
    extractedEmpty.hasCoordinates === false &&
    extractedEmpty.latitude === null &&
    extractedEmpty.longitude === null,
    'Incident without coordinates property safely returns hasCoordinates=false'
  );

  console.log(`\nIncidentMap Unit Tests Completed: ${passed} passed, ${failed} failed.`);
  return { passed, failed, results };
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('IncidentMap.test')) {
  const outcome = runIncidentMapTests();
  process.exit(outcome.failed > 0 ? 1 : 0);
}
