import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Truck,
  UserCheck,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  ExternalLink,
  Package,
  Navigation,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const PRIORITY_BADGES = {
  critical: 'bg-red-950/60 text-red-400 border-red-500/40',
  high: 'bg-rose-950/60 text-rose-400 border-rose-500/40',
  medium: 'bg-amber-950/60 text-amber-400 border-amber-500/40',
  low: 'bg-slate-800 text-slate-300 border-slate-700',
};

const FILTER_PILLS = [
  { id: 'ALL', label: 'All Recommendations' },
  { id: 'allocate_resource', label: 'Asset Allocation' },
  { id: 'assign_responder', label: 'Unit Assignment' },
  { id: 'request_inventory', label: 'Mutual Aid Requests' },
  { id: 'verify_incident', label: 'Verification & Triage' },
];

export default function RecommendedActions({
  incidentId = null,
  onOpenAllocation = null,
  onOpenAssignment = null,
}) {
  const { token } = useAuth();

  const [actions, setActions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [expandedActionIds, setExpandedActionIds] = useState(new Set());

  const fetchActions = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);

    try {
      const url = incidentId
        ? `${API_BASE_URL}/incidents/${incidentId}/recommended-actions`
        : `${API_BASE_URL}/ai/recommended-actions?limit=25`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load recommended actions (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setActions(data.data);
      } else {
        throw new Error(data.message || 'Invalid recommendations response format');
      }
    } catch (err) {
      setError(err.message || 'Unable to retrieve recommended actions.');
    } finally {
      setIsLoading(false);
    }
  }, [token, incidentId]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const toggleExpand = (actionId) => {
    setExpandedActionIds((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  const filteredActions = actions.filter((act) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'verify_incident') {
      return act.actionType === 'verify_incident' || act.actionType === 'review_duplicate';
    }
    return act.actionType === activeFilter;
  });

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-red-400 bg-red-950/60 border-red-500/40';
    if (score >= 60) return 'text-rose-400 bg-rose-950/60 border-rose-500/40';
    if (score >= 40) return 'text-amber-400 bg-amber-950/60 border-amber-500/40';
    return 'text-slate-300 bg-slate-800 border-slate-700';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
              Explainable Recommended Next Actions
              {actions.length > 0 && (
                <span className="text-[11px] font-mono px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {actions.length} Ranked
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">
              Deterministic priority ranking grounded in hazard severity, population risk, inventory availability, and operational posture
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchActions}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50 cursor-pointer"
            title="Refresh action rankings"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {!incidentId && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setActiveFilter(pill.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                activeFilter === pill.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/40'
                  : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center space-y-2">
          <RefreshCw className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Computing explainable next action rankings...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchActions}
            className="text-[11px] font-semibold text-red-400 underline hover:text-white"
          >
            Retry
          </button>
        </div>
      ) : filteredActions.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-8 text-center space-y-2">
          <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">No Pending Urgent Actions</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            All active incident priorities are currently allocated or within standard operational handling.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredActions.map((action, index) => {
            const isExpanded = expandedActionIds.has(action.actionId);
            const priorityClass = PRIORITY_BADGES[action.priority] || PRIORITY_BADGES.low;
            const scoreClass = getScoreColor(action.recommendationScore);

            return (
              <div
                key={action.actionId}
                className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 transition-all duration-200 hover:border-slate-700 shadow-md space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-950 px-2.5 py-1.5 border border-slate-800 shrink-0 text-center min-w-[54px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Rank</span>
                      <span className="text-base font-black text-white font-mono">#{index + 1}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${priorityClass} uppercase tracking-wider`}>
                          {action.priority} Priority
                        </span>

                        <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-full border ${scoreClass}`}>
                          Score {action.recommendationScore}/100
                        </span>

                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800 uppercase">
                          {action.incidentCategory}
                        </span>

                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950/40 text-purple-300 border border-purple-500/30">
                          Requires Human Approval
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                        {action.title}
                      </h4>

                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        {action.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {action.actionType === 'allocate_resource' && onOpenAllocation && (
                      <button
                        type="button"
                        onClick={() => onOpenAllocation(action.incidentId)}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-blue-900/30 hover:bg-blue-500 transition cursor-pointer"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        <span>Allocate</span>
                      </button>
                    )}

                    {action.actionType === 'assign_responder' && onOpenAssignment && (
                      <button
                        type="button"
                        onClick={() => onOpenAssignment(action.incidentId)}
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-red-900/30 hover:bg-red-500 transition cursor-pointer"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>Assign</span>
                      </button>
                    )}

                    <Link
                      to={`/incidents/${action.incidentId}`}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                    >
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  {action.suggestedResourceType && (
                    <div className="flex items-center gap-1">
                      <Package className="h-3.5 w-3.5 text-blue-400" />
                      <span>
                        Resource: <span className="text-slate-200 font-semibold">{action.suggestedResourceType}</span>
                      </span>
                    </div>
                  )}

                  {action.availableQuantity !== null && action.availableQuantity !== undefined && (
                    <div className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${action.availableQuantity > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span>
                        Depot Inventory: <span className={`font-semibold ${action.availableQuantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {action.availableQuantity > 0 ? `${action.availableQuantity} available` : 'Depleted'}
                        </span>
                      </span>
                    </div>
                  )}

                  {action.distanceKm !== null && action.distanceKm !== undefined && (
                    <div className="flex items-center gap-1">
                      <Navigation className="h-3.5 w-3.5 text-purple-400" />
                      <span>
                        Distance: <span className="text-slate-200 font-semibold">{action.distanceKm} km</span>
                      </span>
                    </div>
                  )}

                  <div className="ml-auto">
                    <button
                      type="button"
                      onClick={() => toggleExpand(action.actionId)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide Factor Breakdown' : 'Why this recommendation?'}</span>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-3 mt-2 animate-in fade-in-50 duration-200">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                        <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
                        <span>Contributing Decision Factors ({action.recommendationScore} Total Points)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Deterministic 100-pt formula
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {(action.contributingFactors || []).map((factor, fIdx) => {
                        const pct = Math.round((factor.points / factor.maximum) * 100) || 0;
                        return (
                          <div key={fIdx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-300 capitalize">
                                {factor.factor.replace('_', ' ')}
                              </span>
                              <span className="font-mono text-slate-200 font-bold">
                                {factor.points} / {factor.maximum} pts ({pct}%)
                              </span>
                            </div>

                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  pct >= 75 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                              />
                            </div>

                            <p className="text-[11px] text-slate-400 italic">
                              {factor.reason}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
