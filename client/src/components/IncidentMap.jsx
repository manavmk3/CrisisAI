import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info,
  Layers,
  Compass,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  validateCoordinates,
  extractIncidentCoordinates,
} from "../utils/coordinateValidation";

export const DEFAULT_TILE_LAYER = {
  name: "OpenStreetMap Standard",
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19,
  minZoom: 2,
  subdomains: ["a", "b", "c"],
};

export const DEFAULT_MAP_CENTER = [20.5937, 78.9629];
export const DEFAULT_MAP_ZOOM = 5;
export const DETAIL_MAP_ZOOM = 13;

export const INCIDENT_SEVERITY_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

export const RESOURCE_STATUS_COLORS = {
  available: "#22c55e",
  deployed: "#f97316",
  maintenance: "#6b7280",
};

export function getIncidentMarkerColor(incident) {
  const status = (incident.status || "").toLowerCase();
  if (status === "resolved" || status === "cancelled") return "#6b7280";
  const sev = (incident.severity || "").toLowerCase();
  return INCIDENT_SEVERITY_COLORS[sev] || "#eab308";
}

export function getResourceMarkerColor(resource) {
  const status = (resource.status || "").toLowerCase();
  return RESOURCE_STATUS_COLORS[status] || "#22c55e";
}

export function extractResourceCoordinates(resource) {
  if (!resource) return { hasCoordinates: false, latitude: null, longitude: null };
  const validation = validateCoordinates({
    latitude: resource.latitude,
    longitude: resource.longitude,
  });
  if (validation.isValid) {
    return {
      hasCoordinates: true,
      latitude: validation.latitude,
      longitude: validation.longitude,
    };
  }
  return { hasCoordinates: false, latitude: null, longitude: null, error: validation.error };
}

function createMarkerIcon(color, shape, size) {
  size = size || 20;
  shape = shape || "circle";
  const r = (size + 4) / 2;
  const inner =
    shape === "square"
      ? '<rect x="6" y="6" width="' + (size - 8) + '" height="' + (size - 8) + '" rx="2" fill="white" opacity="0.9"/>'
      : '<circle cx="' + r + '" cy="' + r + '" r="' + (r - 6) + '" fill="white" opacity="0.9"/>';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + (size + 4) + '" height="' + (size + 4) + '" viewBox="0 0 ' + (size + 4) + " " + (size + 4) + '">' +
    '<circle cx="' + r + '" cy="' + r + '" r="' + (r - 1) + '" fill="' + color + '" stroke="white" stroke-width="2" opacity="0.95"/>' +
    inner +
    "</svg>";
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [size + 4, size + 4],
    iconAnchor: [r, r],
    popupAnchor: [0, -(size / 2)],
  });
}

function IncidentPopup({ incident }) {
  const id = incident._id || incident.id || "";
  const sev = (incident.severity || "").toLowerCase();
  const status = (incident.status || "reported").replace(/_/g, " ");
  const urgency = (incident.urgency || "").toLowerCase();
  const verState = incident.verificationState || "";
  const createdAt = incident.createdAt
    ? new Date(incident.createdAt).toLocaleString([], {
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;
  const sevColor =
    sev === "critical"
      ? "#ef4444"
      : sev === "high"
      ? "#f97316"
      : sev === "medium"
      ? "#eab308"
      : "#6b7280";

  return (
    <div style={{ fontFamily: "inherit", minWidth: 220, maxWidth: 280, fontSize: 12, color: "#f1f5f9" }}>
      <div style={{ background: "#0f172a", borderRadius: "8px 8px 0 0", padding: "8px 10px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: sevColor, flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: sevColor }}>
            {sev || "unknown"} severity
          </span>
        </div>
        <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 12, color: "#f8fafc", lineHeight: 1.4 }}>
          {incident.summary || "(No summary)"}
        </p>
      </div>
      <div style={{ background: "#1e293b", borderRadius: "0 0 8px 8px", padding: "8px 10px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <tbody>
            {incident.category && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3, whiteSpace: "nowrap" }}>Category</td>
                <td style={{ color: "#e2e8f0", paddingBottom: 3, textTransform: "capitalize" }}>
                  {incident.category.replace(/_/g, " ")}
                </td>
              </tr>
            )}
            {urgency && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Urgency</td>
                <td style={{ color: "#e2e8f0", paddingBottom: 3, textTransform: "capitalize" }}>{urgency}</td>
              </tr>
            )}
            {incident.priorityScore !== undefined && incident.priorityScore !== null && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Priority</td>
                <td style={{ color: "#fbbf24", fontWeight: 700, paddingBottom: 3 }}>
                  {incident.priorityScore} / 100
                </td>
              </tr>
            )}
            <tr>
              <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Status</td>
              <td style={{ color: "#e2e8f0", paddingBottom: 3, textTransform: "capitalize" }}>{status}</td>
            </tr>
            {verState && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Verification</td>
                <td
                  style={{
                    color: verState === "needs_review" ? "#fb923c" : "#34d399",
                    paddingBottom: 3,
                    textTransform: "capitalize",
                  }}
                >
                  {verState.replace(/_/g, " ")}
                </td>
              </tr>
            )}
            {(incident.location || incident.locationClue) && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Location</td>
                <td style={{ color: "#e2e8f0", paddingBottom: 3 }}>
                  {incident.location || incident.locationClue}
                </td>
              </tr>
            )}
            {createdAt && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Reported</td>
                <td style={{ color: "#e2e8f0", paddingBottom: 3 }}>{createdAt}</td>
              </tr>
            )}
          </tbody>
        </table>
        {id && (
          <a
            href={"/incidents/" + id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 8,
              padding: "4px 10px",
              borderRadius: 6,
              background: "#dc2626",
              color: "white",
              fontWeight: 700,
              fontSize: 11,
              textDecoration: "none",
            }}
          >
            Inspect Incident ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ResourcePopup({ resource }) {
  const statusColor =
    resource.status === "available"
      ? "#22c55e"
      : resource.status === "deployed"
      ? "#f97316"
      : "#6b7280";
  const TYPE_LABELS = {
    ambulance: "Ambulance",
    medical_team: "Medical Team",
    fire_rescue: "Fire & Rescue",
    search_rescue: "Search & Rescue",
    food: "Food Supply",
    drinking_water: "Drinking Water",
    shelter: "Shelter",
    rescue_boat: "Rescue Boat",
    police: "Police Unit",
    evacuation_team: "Evacuation Team",
  };
  return (
    <div style={{ fontFamily: "inherit", minWidth: 200, maxWidth: 260, fontSize: 12, color: "#f1f5f9" }}>
      <div style={{ background: "#0f172a", borderRadius: "8px 8px 0 0", padding: "8px 10px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: statusColor, flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: statusColor }}>
            {resource.status || "unknown"}
          </span>
        </div>
        <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 12, color: "#f8fafc", lineHeight: 1.4 }}>
          {resource.name || "(Unnamed Resource)"}
        </p>
      </div>
      <div style={{ background: "#1e293b", borderRadius: "0 0 8px 8px", padding: "8px 10px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <tbody>
            {resource.type && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Type</td>
                <td style={{ color: "#e2e8f0", paddingBottom: 3 }}>
                  {TYPE_LABELS[resource.type] || resource.type}
                </td>
              </tr>
            )}
            {resource.quantity !== undefined && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Inventory</td>
                <td style={{ color: "#e2e8f0", paddingBottom: 3, fontWeight: 600 }}>
                  <span style={{ color: "#34d399" }}>
                    {resource.availableQuantity !== undefined ? resource.availableQuantity : resource.quantity}
                  </span>
                  <span style={{ color: "#64748b" }}> / {resource.quantity} available</span>
                </td>
              </tr>
            )}
            {resource.location && (
              <tr>
                <td style={{ color: "#94a3b8", paddingRight: 8, paddingBottom: 3 }}>Location</td>
                <td style={{ color: "#e2e8f0", paddingBottom: 3 }}>{resource.location}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarkersLayer({ incidents, resources, showIncidents, showResources }) {
  const incidentMarkers =
    showIncidents && Array.isArray(incidents)
      ? incidents.filter((inc) => extractIncidentCoordinates(inc).hasCoordinates)
      : [];
  const resourceMarkers =
    showResources && Array.isArray(resources)
      ? resources.filter((res) => extractResourceCoordinates(res).hasCoordinates)
      : [];

  const seenInc = new Set();
  const seenRes = new Set();

  return (
    <>
      {incidentMarkers.map((inc) => {
        const id = inc._id || inc.id;
        if (!id || seenInc.has(id)) return null;
        seenInc.add(id);
        const coords = extractIncidentCoordinates(inc);
        const color = getIncidentMarkerColor(inc);
        const icon = createMarkerIcon(color, "circle", 20);
        return (
          <Marker key={"inc-" + id} position={[coords.latitude, coords.longitude]} icon={icon}>
            <Popup maxWidth={300} minWidth={220}>
              <IncidentPopup incident={inc} />
            </Popup>
          </Marker>
        );
      })}
      {resourceMarkers.map((res) => {
        const id = res._id || res.id;
        if (!id || seenRes.has(id)) return null;
        seenRes.add(id);
        const coords = extractResourceCoordinates(res);
        const color = getResourceMarkerColor(res);
        const icon = createMarkerIcon(color, "square", 18);
        return (
          <Marker key={"res-" + id} position={[coords.latitude, coords.longitude]} icon={icon}>
            <Popup maxWidth={280} minWidth={200}>
              <ResourcePopup resource={res} />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

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
      map.setView(center, zoom != null ? zoom : map.getZoom(), { animate: false });
      map.invalidateSize();
    } catch (err) {
      console.warn("[IncidentMap] Failed to set map view:", err);
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

function MapLegend({ showIncidents, showResources }) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="absolute bottom-2 right-2 z-[1000] bg-slate-900/90 backdrop-blur-sm border border-slate-700/80 rounded-xl shadow-lg"
      style={{ minWidth: 148 }}
    >
      <button
        type="button"
        id="map-legend-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold text-slate-300 hover:text-white transition w-full"
        aria-label="Toggle legend"
      >
        <Layers className="h-3 w-3 text-slate-400" />
        <span>Legend</span>
        <span className="ml-auto">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-1.5 border-t border-slate-800">
          {showIncidents && (
            <>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider pt-1.5">Incidents ●</p>
              {[
                { color: "#ef4444", label: "Critical" },
                { color: "#f97316", label: "High" },
                { color: "#eab308", label: "Medium" },
                { color: "#6b7280", label: "Low / Resolved" },
              ].map(function (item) {
                return (
                  <div key={item.label} className="flex items-center gap-2">
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: item.color,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <span className="text-[10px] text-slate-300">{item.label}</span>
                  </div>
                );
              })}
            </>
          )}
          {showResources && (
            <>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider pt-1">Resources ■</p>
              {[
                { color: "#22c55e", label: "Available" },
                { color: "#f97316", label: "Deployed" },
                { color: "#6b7280", label: "Maintenance" },
              ].map(function (item) {
                return (
                  <div key={item.label} className="flex items-center gap-2">
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: item.color,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <span className="text-[10px] text-slate-300">{item.label}</span>
                  </div>
                );
              })}
            </>
          )}
          {!showIncidents && !showResources && (
            <p className="text-[10px] text-slate-500 italic pt-1">All layers hidden</p>
          )}
        </div>
      )}
    </div>
  );
}

const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : "http://localhost:8000/api";

export default function IncidentMap({
  incident = null,
  incidents = null,
  center = null,
  zoom = null,
  height = "420px",
  minHeight = "320px",
  title = "CrisisAI Interactive Geospatial Map",
  subtitle = "OpenStreetMap Leaflet Engine — Day 19 Markers",
  tileConfig = DEFAULT_TILE_LAYER,
  className = "",
  showTelemetryHeader = true,
  resources: resourcesProp = null,
}) {
  const [tileError, setTileError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showResources, setShowResources] = useState(true);
  const [resources, setResources] = useState(resourcesProp || []);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (resourcesProp !== null) {
      setResources(resourcesProp);
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(API_BASE + "/resources")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data.success && Array.isArray(data.data)) {
          setResources(data.data);
        } else {
          setResources([]);
        }
      })
      .catch(function (err) {
        console.warn("[IncidentMap] Could not load resources:", err.message);
        setResources([]);
      });
  }, [resourcesProp]);

  let activeCenter = DEFAULT_MAP_CENTER;
  let activeZoom = zoom || DEFAULT_MAP_ZOOM;
  let coordinateNotice = null;
  let telemetryCoords = null;

  if (incident) {
    const extracted = extractIncidentCoordinates(incident);
    if (extracted.hasCoordinates) {
      activeCenter = [extracted.latitude, extracted.longitude];
      activeZoom = zoom || DETAIL_MAP_ZOOM;
      telemetryCoords = { lat: extracted.latitude, lng: extracted.longitude };
    } else {
      coordinateNotice =
        "No valid GPS telemetry coordinates found for this incident. Displaying default regional overview.";
    }
  } else if (center) {
    const val = validateCoordinates(center);
    if (val.isValid) {
      activeCenter = [val.latitude, val.longitude];
      activeZoom = zoom || DEFAULT_MAP_ZOOM;
      telemetryCoords = { lat: val.latitude, lng: val.longitude };
    } else {
      coordinateNotice =
        "Specified center coordinates are invalid (" + val.error + "). Reverting to default regional overview.";
    }
  } else if (Array.isArray(incidents)) {
    const withCoords = incidents.filter((inc) => extractIncidentCoordinates(inc).hasCoordinates);
    if (withCoords.length === 0) {
      coordinateNotice =
        "No incidents in the current dataset contain valid GPS coordinates. Displaying default regional overview.";
    }
  }

  const incidentList = Array.isArray(incidents) ? incidents : incident ? [incident] : [];
  const incidentsWithCoords = incidentList.filter((i) => extractIncidentCoordinates(i).hasCoordinates);
  const incidentsWithoutCoords = incidentList.length - incidentsWithCoords.length;
  const resourcesWithCoords = resources.filter((r) => extractResourceCoordinates(r).hasCoordinates);
  const resourcesWithoutCoords = resources.length - resourcesWithCoords.length;

  return (
    <div
      className={"rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl backdrop-blur-md flex flex-col " + className}
      style={{ width: "100%" }}
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
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">{title}</h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Day 19 Markers
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {telemetryCoords ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-800/50">
                <MapPin className="h-3 w-3 text-emerald-400" />
                <span>
                  Center: {telemetryCoords.lat.toFixed(4)}, {telemetryCoords.lng.toFixed(4)}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-400 border border-slate-700">
                <MapPin className="h-3 w-3 text-slate-500" />
                <span>Default View Center</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium px-2 py-1 rounded border border-slate-800">
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
          <span className="text-[10px] text-amber-400/80 font-mono shrink-0">No Fabricated GPS</span>
        </div>
      )}

      {tileError && (
        <div className="px-4 py-2 bg-red-950/60 border-b border-red-900/50 flex items-center justify-between gap-3 text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span>
              Notice: Some OpenStreetMap tiles failed to load. Active internet access is required; offline tile caching
              is not supported.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setTileError(false);
              setRetryKey((prev) => prev + 1);
            }}
            className="px-2 py-0.5 rounded bg-red-900/80 hover:bg-red-800 text-[11px] font-semibold text-white transition shrink-0"
          >
            Retry Tiles
          </button>
        </div>
      )}

      <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Layers:</span>
        <button
          type="button"
          id="toggle-incident-markers"
          onClick={() => setShowIncidents((v) => !v)}
          aria-pressed={showIncidents}
          className={
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition " +
            (showIncidents
              ? "bg-red-950/60 text-red-300 border-red-800/50 hover:bg-red-950/80"
              : "bg-slate-800/60 text-slate-500 border-slate-700/50 hover:bg-slate-800")
          }
        >
          {showIncidents ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          <span>
            Incidents ({incidentsWithCoords.length} on map
            {incidentsWithoutCoords > 0 ? ", " + incidentsWithoutCoords + " no GPS" : ""})
          </span>
        </button>
        <button
          type="button"
          id="toggle-resource-markers"
          onClick={() => setShowResources((v) => !v)}
          aria-pressed={showResources}
          className={
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition " +
            (showResources
              ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/50 hover:bg-emerald-950/80"
              : "bg-slate-800/60 text-slate-500 border-slate-700/50 hover:bg-slate-800")
          }
        >
          {showResources ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          <span>
            Resources ({resourcesWithCoords.length} on map
            {resourcesWithoutCoords > 0 ? ", " + resourcesWithoutCoords + " no GPS" : ""})
          </span>
        </button>
        <span className="text-[10px] text-slate-600 italic hidden sm:inline">
          Shelter / Responder layers: no dedicated model in current schema
        </span>
      </div>

      <div className="relative w-full" style={{ height: height, minHeight: minHeight }}>
        <MapContainer
          key={"leaflet-map-" + retryKey + "-" + activeCenter[0] + "-" + activeCenter[1]}
          center={activeCenter}
          zoom={activeZoom}
          scrollWheelZoom={true}
          style={{ height: height, minHeight: minHeight, width: "100%" }}
        >
          <TileLayer
            attribution={tileConfig.attribution}
            url={tileConfig.url}
            maxZoom={tileConfig.maxZoom}
            minZoom={tileConfig.minZoom}
            subdomains={tileConfig.subdomains || ["a", "b", "c"]}
            eventHandlers={{ tileerror: function () { setTileError(true); } }}
          />
          <MapViewportController center={activeCenter} zoom={activeZoom} />
          <MapControlBar initialCenter={activeCenter} initialZoom={activeZoom} />
          <MarkersLayer
            incidents={incidentList}
            resources={resources}
            showIncidents={showIncidents}
            showResources={showResources}
          />
        </MapContainer>
        <MapLegend showIncidents={showIncidents} showResources={showResources} />
        <div className="absolute bottom-2 left-2 z-[1000] bg-slate-900/85 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] text-slate-400 pointer-events-none">
          Day 19 Map Markers • Incidents ● &amp; Resources ■ • No Fabricated GPS
        </div>
      </div>
    </div>
  );
}
