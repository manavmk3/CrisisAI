import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Plus,
  Loader2,
  Sparkles,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const TYPE_LABELS = {
  ambulance: 'Ambulance',
  medical_team: 'Medical Team',
  fire_rescue: 'Fire & Rescue',
  search_rescue: 'Search & Rescue',
  food: 'Food Supply',
  drinking_water: 'Drinking Water',
  shelter: 'Shelter',
  rescue_boat: 'Rescue Boat',
  police: 'Police Unit',
  evacuation_team: 'Evacuation Team',
  fire_truck: 'Fire Truck',
  drone: 'Search Drone',
  heavy_machinery: 'Heavy Machinery',
  food_water_supply: 'Food & Water Pack',
  shelter_kit: 'Shelter Kit',
  evacuation_bus: 'Evacuation Bus',
};

export default function ResourceAllocationModal({
  incident,
  onClose,
  onAllocationChanged,
}) {
  const { token } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [existingAllocations, setExistingAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [releasingId, setReleasingId] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [shortageReports, setShortageReports] = useState([]);
  const [expandedExplanationId, setExpandedExplanationId] = useState(null);
  const [confirmStep, setConfirmStep] = useState(false);
  const [allocQuantities, setAllocQuantities] = useState({});

  const incidentId = incident._id || incident.id;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [candRes, allocRes] = await Promise.all([
        fetch(`${API_BASE_URL}/incidents/${incidentId}/candidates`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch(`${API_BASE_URL}/incidents/${incidentId}/allocations`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      ]);

      if (candRes.ok) {
        const candData = await candRes.json();
        if (candData.success && Array.isArray(candData.data)) {
          setCandidates(candData.data);
          const initialQtys = {};
          candData.data.forEach((c) => {
            initialQtys[c.resourceId] = '';
          });
          setAllocQuantities(initialQtys);
        }
      }

      if (allocRes.ok) {
        const allocData = await allocRes.json();
        if (allocData.success && Array.isArray(allocData.data)) {
          setExistingAllocations(allocData.data);
        }
      }
    } catch (err) {
      setError('Failed to fetch allocation candidates from server.');
    } finally {
      setLoading(false);
    }
  }, [incidentId, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleQtyChange = (resId, val) => {
    setAllocQuantities((prev) => ({
      ...prev,
      [resId]: val,
    }));
  };

  const selectedItems = Object.entries(allocQuantities)
    .filter(([_, qty]) => {
      const num = parseInt(qty, 10);
      return !isNaN(num) && num > 0;
    })
    .map(([resId, qty]) => {
      const cand = candidates.find((c) => c.resourceId === resId);
      return {
        resourceId: resId,
        type: cand?.resourceType,
        name: cand?.resourceName,
        available: cand?.availableQuantity || 0,
        quantity: parseInt(qty, 10),
      };
    });

  const totalSelectedUnits = selectedItems.reduce((acc, i) => acc + i.quantity, 0);

  const localShortages = selectedItems.filter((i) => i.quantity > i.available);

  const handleCommitAllocation = async () => {
    if (selectedItems.length === 0) {
      setError('Please specify a positive quantity for at least one resource.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    setShortageReports([]);

    try {
      const payload = {
        items: selectedItems.map((i) => ({
          resourceId: i.resourceId,
          quantity: i.quantity,
        })),
        idempotencyKey: `client-alloc-${incidentId}-${Date.now()}`,
      };

      const res = await fetch(`${API_BASE_URL}/incidents/${incidentId}/allocate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Allocation failed.');
        if (Array.isArray(data.shortages)) {
          setShortageReports(data.shortages);
        }
      } else {
        setSuccessMsg(data.message || 'Resources allocated successfully!');
        if (Array.isArray(data.shortages) && data.shortages.length > 0) {
          setShortageReports(data.shortages);
        }
        setConfirmStep(false);
        fetchData();
        if (onAllocationChanged) onAllocationChanged();
      }
    } catch (err) {
      setError('Network error occurred during allocation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async (allocationId) => {
    if (!window.confirm('Are you sure you want to release this allocation and return units to inventory?')) {
      return;
    }

    setReleasingId(allocationId);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${API_BASE_URL}/allocations/${allocationId}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to release allocation.');
      } else {
        setSuccessMsg('Allocation released and inventory restored.');
        fetchData();
        if (onAllocationChanged) onAllocationChanged();
      }
    } catch {
      setError('Network error while releasing allocation.');
    } finally {
      setReleasingId(null);
    }
  };

  const priorityScore = incident.priorityScore ?? 50;
  const priorityColor =
    priorityScore >= 80
      ? 'text-red-400 bg-red-950/60 border-red-800/40'
      : priorityScore >= 50
      ? 'text-amber-400 bg-amber-950/60 border-amber-800/40'
      : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl glass-panel rounded-2xl border border-slate-700 p-6 shadow-2xl my-8 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-400" />
              <h2 className="text-base font-bold text-white">
                Resource Allocation Engine
              </h2>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${priorityColor}`}>
                Priority {priorityScore}/100
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 line-clamp-1">
              {incident.summary || incident.report || 'Incident Allocation Control'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            id="close-allocation-modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-[11px] text-slate-400">Category:</span>
              <p className="font-semibold text-white capitalize mt-0.5">{incident.category || 'General'}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400">Urgency:</span>
              <p className="font-semibold text-amber-300 capitalize mt-0.5">{incident.urgency || 'Soon'}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400">People Affected:</span>
              <p className="font-semibold text-white mt-0.5">{incident.peopleAffected ?? 'Unknown'}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400">Location:</span>
              <p className="font-semibold text-white truncate mt-0.5">{incident.location || 'Coordinates only'}</p>
            </div>
            <div className="col-span-2 sm:col-span-4 border-t border-slate-800 pt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400">Required Resources:</span>
              {Array.isArray(incident.requiredResources) && incident.requiredResources.length > 0 ? (
                incident.requiredResources.map((req) => (
                  <span
                    key={req}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-950/70 border border-blue-800/40 text-blue-300"
                  >
                    {TYPE_LABELS[req] || req}
                  </span>
                ))
              ) : (
                <span className="text-slate-500 text-[11px]">None specified</span>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-800/40 bg-red-950/40 px-3.5 py-2.5 text-xs text-red-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Allocation Issue</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Success</p>
                <p>{successMsg}</p>
              </div>
            </div>
          )}

          {shortageReports.length > 0 && (
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/30 p-3 text-xs space-y-1">
              <p className="font-bold text-amber-300 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" />
                Shortage Detected
              </p>
              {shortageReports.map((sh, idx) => (
                <p key={idx} className="text-amber-200/90 text-[11px]">
                  • {sh.requestedType}: requested {sh.requestedQuantity}, allocated {sh.allocatedQuantity || 0} ({sh.shortage} units short). {sh.reason}
                </p>
              ))}
            </div>
          )}

          {existingAllocations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                Active Allocations on this Incident ({existingAllocations.filter(a => a.status === 'active').length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {existingAllocations.map((alloc) => {
                  const isActive = alloc.status === 'active';
                  return (
                    <div
                      key={alloc._id}
                      className={`rounded-xl border p-3 text-xs flex items-center justify-between gap-2 ${
                        isActive
                          ? 'border-blue-900/60 bg-blue-950/20'
                          : 'border-slate-800 bg-slate-900/30 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">
                            {alloc.resource?.name || alloc.resourceType}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              isActive ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {alloc.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Allocated: <strong className="text-white">{alloc.quantity} units</strong> ({TYPE_LABELS[alloc.resourceType] || alloc.resourceType})
                        </p>
                      </div>

                      {isActive && (
                        <button
                          onClick={() => handleRelease(alloc._id)}
                          disabled={releasingId === alloc._id}
                          className="px-2.5 py-1.5 rounded-lg border border-red-800/60 bg-red-950/40 text-[11px] font-semibold text-red-300 hover:bg-red-900/60 transition flex items-center gap-1 disabled:opacity-50"
                        >
                          {releasingId === alloc._id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Release
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                Ranked Candidate Resources (Explainable Matching)
              </h3>
              <span className="text-[10px] text-slate-400">
                Sorted by AI suitability + proximity + priority score
              </span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                <span>Evaluating inventory candidate rankings…</span>
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-8 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-400">
                <Package className="h-6 w-6 mx-auto text-slate-600 mb-1" />
                No available resources currently in inventory.
              </div>
            ) : (
              <div className="space-y-2">
                {candidates.map((cand) => {
                  const qtyValue = allocQuantities[cand.resourceId] || '';
                  const isExpanded = expandedExplanationId === cand.resourceId;
                  const isExact = cand.matchType === 'exact';
                  const isCompatible = cand.matchType === 'compatible';

                  return (
                    <div
                      key={cand.resourceId}
                      className={`rounded-xl border p-3.5 transition ${
                        isExact
                          ? 'border-blue-800/60 bg-slate-900/80'
                          : isCompatible
                          ? 'border-purple-800/40 bg-slate-900/60'
                          : 'border-slate-800 bg-slate-900/40'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">
                              {cand.resourceName}
                            </span>
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-300">
                              {TYPE_LABELS[cand.resourceType] || cand.resourceType}
                            </span>
                            {isExact && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                                Exact Match
                              </span>
                            )}
                            {isCompatible && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-400 border border-purple-800/40">
                                Compatible Alternative
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
                            <span>
                              Available:{' '}
                              <strong className="text-emerald-400">{cand.availableQuantity}</strong>
                              <span className="text-slate-500"> / {cand.totalQuantity} total</span>
                            </span>
                            {cand.distanceKm !== null && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" />
                                {cand.distanceKm} km away
                              </span>
                            )}
                            {cand.location && (
                              <span className="text-slate-500 truncate max-w-[150px]">
                                {cand.location}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Rank Score</span>
                            <span className="text-sm font-extrabold text-blue-400">
                              {cand.score}
                              <span className="text-[10px] font-normal text-slate-500">/100</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max={cand.availableQuantity}
                              step="1"
                              placeholder="Qty"
                              value={qtyValue}
                              onChange={(e) => handleQtyChange(cand.resourceId, e.target.value)}
                              className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-blue-500 transition"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedExplanationId(isExpanded ? null : cand.resourceId)
                            }
                            className="text-slate-400 hover:text-slate-200 p-1 rounded transition"
                            title="View score breakdown"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-slate-300 space-y-1.5 bg-slate-950/40 -mx-3.5 -mb-3.5 p-3 rounded-b-xl">
                          <p className="text-blue-300 font-semibold flex items-center gap-1">
                            <Info className="h-3.5 w-3.5" />
                            Why this candidate?
                          </p>
                          <p className="text-slate-400">{cand.explanation}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                            <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
                              <span className="text-[10px] text-slate-500">Suitability</span>
                              <p className="font-bold text-white">{cand.breakdown?.suitability} pts</p>
                            </div>
                            <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
                              <span className="text-[10px] text-slate-500">Proximity</span>
                              <p className="font-bold text-white">{cand.breakdown?.distance} pts</p>
                            </div>
                            <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
                              <span className="text-[10px] text-slate-500">Incident Priority</span>
                              <p className="font-bold text-white">{cand.breakdown?.incidentPriority} pts</p>
                            </div>
                            <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
                              <span className="text-[10px] text-slate-500">Urgency</span>
                              <p className="font-bold text-white">{cand.breakdown?.urgency} pts</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 shrink-0">
          {confirmStep ? (
            <div className="rounded-xl border border-blue-800/60 bg-blue-950/40 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-bold text-white">
                  Confirm Allocation Commit
                </p>
                <p className="text-slate-300 text-[11px]">
                  You are allocating <strong className="text-blue-400">{totalSelectedUnits} total units</strong> across {selectedItems.length} resources to this incident.
                  {localShortages.length > 0 && (
                    <span className="text-amber-400 block font-semibold mt-0.5">
                      ⚠️ Warning: Some quantities exceed currently available inventory and will trigger shortages.
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmStep(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCommitAllocation}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white disabled:opacity-60 transition shadow-lg shadow-blue-900/40"
                  id="confirm-allocation-btn"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {submitting ? 'Allocating…' : 'Confirm & Allocate'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="text-slate-400">
                {selectedItems.length > 0 ? (
                  <span>
                    Selected: <strong className="text-white">{totalSelectedUnits} units</strong> ({selectedItems.length} resource types)
                  </span>
                ) : (
                  <span>Enter quantities above to prepare allocation</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={selectedItems.length === 0 || loading}
                  onClick={() => setConfirmStep(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold text-white transition shadow-lg shadow-blue-900/30"
                  id="review-allocation-btn"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Review & Allocate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
