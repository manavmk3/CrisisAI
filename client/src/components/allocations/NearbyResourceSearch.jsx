import React, { useState, useEffect, useCallback } from 'react';
import {
  Compass,
  MapPin,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Package,
  Truck,
  RotateCcw,
  Loader2,
  ArrowRight,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const RESOURCE_TYPES_LIST = [
  { value: '', label: 'All Resource Types' },
  { value: 'ambulance', label: 'Ambulance' },
  { value: 'medical_team', label: 'Medical Team' },
  { value: 'fire_rescue', label: 'Fire & Rescue' },
  { value: 'search_rescue', label: 'Search & Rescue' },
  { value: 'food', label: 'Food Supply' },
  { value: 'drinking_water', label: 'Drinking Water' },
  { value: 'shelter', label: 'Shelter' },
  { value: 'rescue_boat', label: 'Rescue Boat' },
  { value: 'police', label: 'Police Unit' },
  { value: 'evacuation_team', label: 'Evacuation Team' },
];

const RADIUS_OPTIONS = [5, 10, 25, 50, 100, 200];

export default function NearbyResourceSearch({
  incident,
  onSelectForAllocation,
  onResultsChanged,
}) {
  const { token } = useAuth();
  const { currentRole, ROLES } = useRole();
  const canAllocate = currentRole === ROLES.AUTHORITY || currentRole === ROLES.ADMIN;

  const [radiusKm, setRadiusKm] = useState(10);
  const [selectedType, setSelectedType] = useState('');
  const [availableOnly, setAvailableOnly] = useState(true);

  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [appliedSearch, setAppliedSearch] = useState(null);

  const incidentId = incident?._id || incident?.id;
  const incLat = incident?.coordinates?.latitude ?? incident?.latitude;
  const incLon = incident?.coordinates?.longitude ?? incident?.longitude;

  const hasValidCoords =
    typeof incLat === 'number' &&
    typeof incLon === 'number' &&
    !Number.isNaN(incLat) &&
    !Number.isNaN(incLon) &&
    incLat >= -90 &&
    incLat <= 90 &&
    incLon >= -180 &&
    incLon <= 180;

  const runSearch = useCallback(async () => {
    if (!incidentId || !hasValidCoords) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('radiusKm', String(radiusKm));
      params.set('availableOnly', availableOnly ? 'true' : 'false');
      if (selectedType) {
        params.set('type', selectedType);
      }

      const res = await fetch(
        `${API_BASE_URL}/incidents/${incidentId}/nearby-resources?${params.toString()}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || `Failed to search nearby resources (HTTP ${res.status})`);
      }

      const items = Array.isArray(data.data) ? data.data : [];
      setResults(items);
      setHasSearched(true);
      setAppliedSearch({
        radiusKm,
        type: selectedType,
        availableOnly,
        count: items.length,
      });

      if (onResultsChanged) {
        onResultsChanged(items);
      }
    } catch (err) {
      setError(err.message || 'Error occurred while searching nearby resources.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [incidentId, hasValidCoords, radiusKm, selectedType, availableOnly, token, onResultsChanged]);

  useEffect(() => {
    if (hasValidCoords && !hasSearched) {
      runSearch();
    }
  }, [hasValidCoords, hasSearched, runSearch]);

  if (!hasValidCoords) {
    return (
      <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">
              Geographic Search Unavailable — Missing GPS Coordinates
            </h3>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              This incident does not contain verified GPS telemetry coordinates in MongoDB.
              Per CrisisAI safety policies, coordinates and straight-line distances are never fabricated.
              Please utilize the non-geographic Candidate Recommendations above to review and allocate resources based on urgency and priority.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Nearby Resource Geographic Search (Day 20 Geospatial Engine)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real inventory queried by radius using verified GPS coordinates and exact Haversine distance.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 px-3 py-1 rounded-lg">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            {incLat.toFixed(4)}°, {incLon.toFixed(4)}°
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-850/60 p-4 rounded-xl border border-slate-800">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Search Radius (km)
          </label>
          <div className="flex items-center gap-2">
            <select
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} km radius
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Resource Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            {RESOURCE_TYPES_LIST.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 flex flex-col justify-end">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none py-1.5">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
              className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500 bg-slate-900 h-4 w-4"
            />
            <span>Available inventory only</span>
          </label>
        </div>

        <div className="space-y-1.5 flex flex-col justify-end">
          <button
            type="button"
            onClick={runSearch}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white transition disabled:opacity-50 shadow-md shadow-cyan-950/50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                <span>Search Nearby</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 text-[11px] text-slate-400 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-500 shrink-0" />
          <span>
            Straight-line distance calculated via Haversine great-circle formula. This reflects physical geographic proximity, not road transit time or street routing.
          </span>
        </div>
        {appliedSearch && (
          <span className="font-mono text-[10px] text-slate-400 shrink-0">
            {appliedSearch.count} match{appliedSearch.count !== 1 ? 'es' : ''} within {appliedSearch.radiusKm} km
          </span>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-lg border border-red-900/50 bg-red-950/30 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center space-y-2">
          <Loader2 className="h-7 w-7 text-cyan-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Computing Haversine distances for regional inventory...</p>
        </div>
      ) : results.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-slate-800 bg-slate-850/30 space-y-2">
          <Package className="h-8 w-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-bold text-slate-300">No Resources Found Within Radius</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            No real resources matched the criteria within {radiusKm} km. Try expanding the search radius or disabling the available-only filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {results.map((res) => {
            const isExact = res.matchType === 'exact';
            const isCompatible = res.matchType === 'compatible';
            const isAvailable = res.status === 'available' && res.availableQuantity > 0;

            return (
              <div
                key={res.resourceId}
                className="p-4 rounded-xl border border-slate-800 bg-slate-850/80 hover:border-slate-700 transition space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs">{res.name}</span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                          isExact
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                            : isCompatible
                            ? 'bg-blue-950 text-blue-300 border-blue-800/60'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {isExact
                          ? 'Exact Match'
                          : isCompatible
                          ? 'Compatible Alternative'
                          : 'General Response'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 capitalize mt-0.5">
                      <span>Type: {res.type?.replace('_', ' ')}</span>
                      <span>•</span>
                      <span
                        className={`font-semibold ${
                          res.status === 'available'
                            ? 'text-emerald-400'
                            : res.status === 'deployed'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {res.status}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-black font-mono text-cyan-400 flex items-center justify-end gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{res.distanceKm} km</span>
                    </div>
                    <span className="text-[9px] text-slate-500 uppercase block">
                      Straight-line
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Stock Availability:</span>
                    <strong className="text-white font-mono">
                      <span className={res.availableQuantity > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                        {res.availableQuantity}
                      </span>{' '}
                      / {res.quantity} units
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px]">Location:</span>
                    <span className="text-slate-300 truncate block" title={res.location}>
                      {res.location || 'Depot'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                  <p className="text-[10px] text-slate-400 truncate flex-1" title={res.matchReason}>
                    {res.matchReason}
                  </p>

                  {canAllocate && isAvailable && (
                    <button
                      type="button"
                      onClick={() => onSelectForAllocation && onSelectForAllocation(res)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shrink-0 transition"
                    >
                      <Truck className="h-3 w-3" />
                      <span>Allocate</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
