import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info,
  Layers,
  Compass,
} from 'lucide-react';
import {
  validateCoordinates,
  extractIncidentCoordinates,
} from '../utils/coordinateValidation';

export const DEFAULT_TILE_LAYER = {
  name: 'OpenStreetMap Standard',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19,
  minZoom: 2,
  subdomains: ['a', 'b', 'c'],
};

export const DEFAULT_MAP_CENTER = [20.5937, 78.9629];
export const DEFAULT_MAP_ZOOM = 5;
export const DETAIL_MAP_ZOOM = 13;

function MapViewportController({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 80);
    const t2 = setTimeout(() => map.invalidateSize(), 250);
    const t3 = setTimeout(() => map.invalidateSize(), 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !center) return;
    try {
      map.setView(center, zoom ?? map.getZoom(), { animate: false });
      map.invalidateSize();
    } catch (err) {
      console.warn('[IncidentMap] Failed to set map view:', err);
    }
  }, [map, center, zoom]);

  return null;
}

function MapControlBar({ onResetView, initialCenter, initialZoom }) {
  const map = useMap();

  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80 shadow-lg backdrop-blur-md">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <div className="h-px bg-slate-800 my-0.5" />
      <button
        type="button"
        onClick={() => {
          map.setView(initialCenter, initialZoom, { animate: true });
          if (onResetView) onResetView();
        }}
        className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
        title="Reset Map View"
        aria-label="Reset Map View"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function IncidentMap({
  incident = null,
  incidents = null,
  center = null,
  zoom = null,
  height = '420px',
  minHeight = '320px',
  title = 'CrisisAI Interactive Geospatial Map',
  subtitle = 'OpenStreetMap Leaflet Engine Foundation',
  tileConfig = DEFAULT_TILE_LAYER,
  className = '',
  showTelemetryHeader = true,
}) {
  const [tileError, setTileError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  let activeCenter = DEFAULT_MAP_CENTER;
  let activeZoom = zoom || DEFAULT_MAP_ZOOM;
  let hasValidCoordinates = false;
  let coordinateNotice = null;
  let telemetryCoords = null;

  if (incident) {
    const extracted = extractIncidentCoordinates(incident);
    if (extracted.hasCoordinates) {
      activeCenter = [extracted.latitude, extracted.longitude];
      activeZoom = zoom || DETAIL_MAP_ZOOM;
      hasValidCoordinates = true;
      telemetryCoords = { lat: extracted.latitude, lng: extracted.longitude };
    } else {
      coordinateNotice = 'No valid GPS telemetry coordinates found for this incident. Displaying default regional overview.';
    }
  } else if (center) {
    const val = validateCoordinates(center);
    if (val.isValid) {
      activeCenter = [val.latitude, val.longitude];
      activeZoom = zoom || DEFAULT_MAP_ZOOM;
      hasValidCoordinates = true;
      telemetryCoords = { lat: val.latitude, lng: val.longitude };
    } else {
      coordinateNotice = `Specified center coordinates are invalid (${val.error}). Reverting to default regional overview.`;
    }
  } else if (Array.isArray(incidents)) {
    const withCoords = incidents.filter((inc) => extractIncidentCoordinates(inc).hasCoordinates);
    if (withCoords.length === 0) {
      coordinateNotice = 'No incidents in the current dataset contain valid GPS coordinates. Displaying default regional overview.';
    } else {
      hasValidCoordinates = true;
    }
  }

  const handleTileError = () => {
    setTileError(true);
  };

  const handleRetryTiles = () => {
    setTileError(false);
    setRetryKey((prev) => prev + 1);
  };

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl backdrop-blur-md flex flex-col ${className}`}
      style={{ width: '100%' }}
      role="region"
      aria-label={title}
    >
      {showTelemetryHeader && (
        <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-red-950/80 border border-red-800/60 text-red-400">
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  {title}
                </h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Day 18 Foundation
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {telemetryCoords ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-800/50">
                <MapPin className="h-3 w-3 text-emerald-400" />
                <span>Center: {telemetryCoords.lat.toFixed(4)}, {telemetryCoords.lng.toFixed(4)}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-400 border border-slate-700">
                <MapPin className="h-3 w-3 text-slate-500" />
                <span>Default View Center</span>
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium px-2 py-1 rounded bg-slate-850 border border-slate-800">
              <Layers className="h-3 w-3 text-slate-400" />
              <span>OSM Public Tiles</span>
            </span>
          </div>
        </div>
      )}

      {coordinateNotice && (
        <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-900/40 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>{coordinateNotice}</span>
          </div>
          <span className="text-[10px] text-amber-400/80 font-mono shrink-0">
            No Fabricated GPS
          </span>
        </div>
      )}

      {tileError && (
        <div className="px-4 py-2 bg-red-950/60 border-b border-red-900/50 flex items-center justify-between gap-3 text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span>Notice: Some OpenStreetMap tiles failed to load. Active internet access is required; offline tile caching is not supported.</span>
          </div>
          <button
            type="button"
            onClick={handleRetryTiles}
            className="px-2 py-0.5 rounded bg-red-900/80 hover:bg-red-800 text-[11px] font-semibold text-white transition shrink-0"
          >
            Retry Tiles
          </button>
        </div>
      )}

      <div
        className="relative w-full"
        style={{ height, minHeight }}
      >
        <MapContainer
          key={`leaflet-map-${retryKey}-${activeCenter[0]}-${activeCenter[1]}`}
          center={activeCenter}
          zoom={activeZoom}
          scrollWheelZoom={true}
          style={{ height, minHeight, width: '100%' }}
        >
          <TileLayer
            attribution={tileConfig.attribution}
            url={tileConfig.url}
            maxZoom={tileConfig.maxZoom}
            minZoom={tileConfig.minZoom}
            subdomains={tileConfig.subdomains || ['a', 'b', 'c']}
            eventHandlers={{
              tileerror: handleTileError,
            }}
          />

          <MapViewportController center={activeCenter} zoom={activeZoom} />
          <MapControlBar
            initialCenter={activeCenter}
            initialZoom={activeZoom}
          />
        </MapContainer>

        <div className="absolute bottom-2 left-2 z-[1000] bg-slate-900/85 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] text-slate-400 pointer-events-none">
          Day 18 Map Foundation • Pan & Zoom Enabled • Markers in Day 19
        </div>
      </div>
    </div>
  );
}
