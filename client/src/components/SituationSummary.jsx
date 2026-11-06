import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  Package,
  Layers,
  Info,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const RISK_BADGES = {
  critical: {
    label: 'CRITICAL RISK',
    color: 'text-red-400 bg-red-950/60 border-red-500/50',
    pulse: 'bg-red-500',
  },
  high: {
    label: 'HIGH RISK',
    color: 'text-rose-400 bg-rose-950/60 border-rose-500/50',
    pulse: 'bg-rose-500',
  },
  moderate: {
    label: 'MODERATE RISK',
    color: 'text-amber-400 bg-amber-950/60 border-amber-500/50',
    pulse: 'bg-amber-500',
  },
  low: {
    label: 'LOW RISK',
    color: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/50',
    pulse: 'bg-emerald-500',
  },
};

export default function SituationSummary() {
  const { token } = useAuth();
  const { subscribe } = useSocket();

  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [isStale, setIsStale] = useState(false);

  const fetchSummary = useCallback(
    async (forceRefresh = false) => {
      if (!token) return;
      if (forceRefresh) {
        setIsGenerating(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const url = forceRefresh
          ? `${API_BASE_URL}/ai/situation-summary/generate`
          : `${API_BASE_URL}/ai/situation-summary`;

        const method = forceRefresh ? 'POST' : 'GET';
        const res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load operational briefing (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (data.success && data.data) {
          setSummary(data.data);
          setIsStale(false);
        } else {
          throw new Error(data.message || 'Invalid briefing data format');
        }
      } catch (err) {
        setError(err.message || 'Unable to fetch situation summary.');
      } finally {
        setIsLoading(false);
        setIsGenerating(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchSummary(false);
  }, [fetchSummary]);

  useEffect(() => {
    const handleOperationalChange = () => {
      setIsStale(true);
    };

    const unsubIncidentCreated = subscribe('incident:created', handleOperationalChange);
    const unsubIncidentUpdated = subscribe('incident:updated', handleOperationalChange);
    const unsubAssignmentCreated = subscribe('assignment:created', handleOperationalChange);
    const unsubAssignmentUpdated = subscribe('assignment:status-updated', handleOperationalChange);
    const unsubResourceUpdated = subscribe('resource:updated', handleOperationalChange);

    return () => {
      if (typeof unsubIncidentCreated === 'function') unsubIncidentCreated();
      if (typeof unsubIncidentUpdated === 'function') unsubIncidentUpdated();
      if (typeof unsubAssignmentCreated === 'function') unsubAssignmentCreated();
      if (typeof unsubAssignmentUpdated === 'function') unsubAssignmentUpdated();
      if (typeof unsubResourceUpdated === 'function') unsubResourceUpdated();
    };
  }, [subscribe]);

  const riskKey = (summary?.overallRiskLevel || 'moderate').toLowerCase();
  const riskConfig = RISK_BADGES[riskKey] || RISK_BADGES.moderate;

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md relative overflow-hidden transition-all duration-200">
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-md shadow-red-950/50">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                AI Operational Situation Briefing
              </h2>
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${riskConfig.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${riskConfig.pulse} animate-ping`} />
                {riskConfig.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated synthesis across active incidents, resource depletion, and mission queues
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {summary?.generatedAt && (
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400 font-mono bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800">
              <Clock className="h-3 w-3 text-slate-400" />
              <span>Synced {formatTimestamp(summary.generatedAt)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => fetchSummary(true)}
            disabled={isGenerating || isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/40 hover:text-white transition disabled:opacity-50 cursor-pointer shadow-sm"
            title="Request fresh AI situation briefing from current database state"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin text-red-400' : 'text-red-300'}`} />
            <span>{isGenerating ? 'Generating...' : 'Regenerate Briefing'}</span>
          </button>
        </div>
      </div>

      {isStale && (
        <div className="mt-3.5 flex items-center justify-between rounded-xl bg-amber-950/30 border border-amber-500/30 px-3.5 py-2 text-xs text-amber-300 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Operational records have updated since this briefing was compiled.</span>
          </div>
          <button
            type="button"
            onClick={() => fetchSummary(true)}
            className="text-[11px] font-bold text-amber-400 underline hover:text-amber-200 cursor-pointer"
          >
            Update Now
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center space-y-3">
          <RefreshCw className="h-6 w-6 text-red-500 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-medium">
            Aggregating incident posture and generating operational briefing...
          </p>
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchSummary(false)}
            className="text-[11px] font-semibold text-red-400 underline hover:text-white"
          >
            Retry
          </button>
        </div>
      ) : summary ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3.5">
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans font-medium">
              {summary.situationOverview}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Key Operational Findings</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {(summary.keyFindings || []).map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-blue-500 text-[10px] mt-0.5">•</span>
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 uppercase tracking-wider">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Immediate Command Priorities</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {(summary.immediatePriorities || []).map((prio, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-red-500 text-[10px] mt-0.5">•</span>
                    <span>{prio}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                <Package className="h-3 w-3" />
                <span>Resource Inventory Concerns</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-400">
                {(summary.resourceConcerns || []).length > 0 ? (
                  summary.resourceConcerns.map((rc, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-amber-500">•</span>
                      <span>{rc}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400">No critical resource bottlenecks identified.</li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                <Layers className="h-3 w-3" />
                <span>Operational Bottlenecks</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-400">
                {(summary.operationalBottlenecks || []).length > 0 ? (
                  summary.operationalBottlenecks.map((ob, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-purple-500">•</span>
                      <span>{ob}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400">Dispatch pipeline operating within nominal latency.</li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <Info className="h-3 w-3" />
                <span>Data Constraints</span>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-400">
                {(summary.dataLimitations || []).length > 0 ? (
                  summary.dataLimitations.map((dl, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-slate-400">•</span>
                      <span>{dl}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-400">Telemetry inputs verified without missing fields.</li>
                )}
              </ul>
            </div>
          </div>

          {(summary.criticalIncidents || []).length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                  Critical Incidents Requiring Immediate Action ({summary.criticalIncidents.length})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {summary.criticalIncidents.map((ci) => (
                  <Link
                    key={ci.incidentId}
                    to={`/incidents/${ci.incidentId}`}
                    className="flex flex-col justify-between p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-red-500/50 transition group"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800/50">
                          {ci.category || 'Incident'}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-red-400">
                          Score {ci.priorityScore || '—'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white font-medium line-clamp-1 group-hover:text-red-300 transition">
                        {ci.summary}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <span>{ci.urgency || 'urgent'}</span>
                      <span className="flex items-center gap-0.5 text-red-400 group-hover:translate-x-0.5 transition-transform">
                        Details <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-slate-400 font-sans">
            <span>
              Disclaimer: AI-generated operational briefing. Information is advisory and must be verified by authorized personnel before operational decisions.
            </span>
            {summary.isAiGenerated === false && (
              <span className="text-amber-400 font-semibold shrink-0">
                Deterministic Operational Synthesis
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
