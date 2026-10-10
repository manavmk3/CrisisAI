import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Layers,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Cpu,
  Clock,
  Filter,
  Plus,
  Truck,
  ArrowUpRight,
  RefreshCw,
  Database,
  X,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { useRole, ROLE_CONFIG } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import GlobeStudy from '@/components/ui/globe-study';
import ResourceAllocationModal from '../components/allocations/ResourceAllocationModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'reported', label: 'Reported' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'flood', label: 'Flood' },
  { value: 'earthquake', label: 'Earthquake' },
  { value: 'fire', label: 'Fire' },
  { value: 'cyclone', label: 'Cyclone' },
  { value: 'building_collapse', label: 'Building Collapse' },
  { value: 'landslide', label: 'Landslide' },
  { value: 'medical_emergency', label: 'Medical Emergency' },
  { value: 'road_accident', label: 'Road Accident' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_OPTIONS = [
  { value: 'ALL', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const VERIFICATION_OPTIONS = [
  { value: 'ALL', label: 'All Verification States' },
  { value: 'verified', label: 'AI Verified (Normal)' },
  { value: 'requires_review', label: 'Requires Manual Review' },
];

const ITEMS_PER_PAGE = 8;

export default function Dashboard() {
  const navigate = useNavigate();
  const { currentRole, ROLES } = useRole();
  const { token } = useAuth();

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [verificationFilter, setVerificationFilter] = useState('ALL');

  const [incidents, setIncidents] = useState([]);
  const [allIncidentsStats, setAllIncidentsStats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIncidentForAllocation, setSelectedIncidentForAllocation] = useState(null);

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    severityFilter !== 'ALL' ||
    verificationFilter !== 'ALL';

  const clearAllFilters = () => {
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setSeverityFilter('ALL');
    setVerificationFilter('ALL');
    setCurrentPage(1);
  };

  const fetchIncidents = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setApiError(null);

    try {
      const params = new URLSearchParams();
      params.append('sort', 'priority');

      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (categoryFilter !== 'ALL') params.append('category', categoryFilter);
      if (severityFilter !== 'ALL') params.append('severity', severityFilter);
      if (verificationFilter !== 'ALL') params.append('verification', verificationFilter);

      const [filteredRes, allRes] = await Promise.all([
        fetch(`${API_BASE_URL}/incidents?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch(`${API_BASE_URL}/incidents?sort=priority`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      ]);

      if (!filteredRes.ok) {
        throw new Error(`Failed to load triage queue (HTTP ${filteredRes.status})`);
      }

      const filteredData = await filteredRes.json();
      if (filteredData.success && Array.isArray(filteredData.data)) {
        setIncidents(filteredData.data);
      } else {
        setIncidents([]);
      }

      if (allRes.ok) {
        const allData = await allRes.json();
        if (allData.success && Array.isArray(allData.data)) {
          setAllIncidentsStats(allData.data);
        }
      }
    } catch (err) {
      console.error('[Dashboard] Error fetching incidents:', err);
      setApiError(err.message || 'Unable to connect to CrisisAI operations backend.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, categoryFilter, severityFilter, verificationFilter, token]);

  useEffect(() => {
    fetchIncidents();
    setCurrentPage(1);
  }, [fetchIncidents]);

  const handleRefresh = () => {
    fetchIncidents(true);
  };

  const totalIncidentsCount = allIncidentsStats.length;
  const criticalCount = allIncidentsStats.filter(
    (i) => (i.severity || '').toLowerCase() === 'critical'
  ).length;
  const requiresReviewCount = allIncidentsStats.filter((i) => {
    const isUnderReview = i.status === 'under_review';
    const isFlaggedDup = Boolean(i.possibleDuplicateOf);
    const isNeedsReview = i.verificationState === 'needs_review';
    return isUnderReview || isFlaggedDup || isNeedsReview;
  }).length;
  const avgPriorityScore =
    totalIncidentsCount > 0
      ? Math.round(
          allIncidentsStats.reduce((sum, i) => sum + (Number(i.priorityScore) || 0), 0) /
            totalIncidentsCount
        )
      : 0;

  const totalPages = Math.ceil(incidents.length / ITEMS_PER_PAGE) || 1;
  const paginatedIncidents = incidents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const roleInfo = ROLE_CONFIG[currentRole];
  const canAllocate = currentRole === ROLES.AUTHORITY || currentRole === ROLES.ADMIN;

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <GlobeStudy mode="dark" opacity={0.75} />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(160deg, rgba(11,15,25,0.70) 0%, rgba(11,15,25,0.40) 50%, rgba(11,15,25,0.75) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div className="relative space-y-6 pb-12" style={{ zIndex: 1 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <Layers className="h-6 w-6 text-red-500" />
                Authority Command Center
              </h1>
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${roleInfo.badgeColor}`}>
                {roleInfo.name} Portal
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Live disaster triage queue, AI validation pipeline, multi-signal duplicate triage, and allocation recommendations.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition disabled:opacity-50 shadow-sm"
              title="Sync latest live incidents from backend"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-red-400' : 'text-slate-400'}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Feed'}</span>
            </button>

            <button
              onClick={() => navigate('/report')}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-red-900/30 hover:bg-red-500 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Log Incident</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-4 border border-slate-800 bg-slate-900/70 backdrop-blur-md">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Total Active Incidents</span>
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{totalIncidentsCount}</span>
              <span className="text-xs text-slate-400 font-semibold">In Database</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Real-time MongoDB record synchrony</p>
          </div>

          <div className="glass-card rounded-xl p-4 border border-slate-800 bg-slate-900/70 backdrop-blur-md">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Critical Emergencies</span>
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{criticalCount}</span>
              <span className="text-xs text-red-400 font-semibold">Immediate Action</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Severity: Critical priority response</p>
          </div>

          <div className="glass-card rounded-xl p-4 border border-slate-800 bg-slate-900/70 backdrop-blur-md">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Requires Manual Review</span>
              <ShieldAlert className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{requiresReviewCount}</span>
              <span className="text-xs text-amber-400 font-semibold">Human Dispatch</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Duplicates & triage review flags</p>
          </div>

          <div className="glass-card rounded-xl p-4 border border-slate-800 bg-slate-900/70 backdrop-blur-md">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Average Priority Score</span>
              <Cpu className="h-4 w-4 text-purple-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">{avgPriorityScore}</span>
              <span className="text-xs text-slate-400 font-semibold">/ 100</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Multi-factor priority calculation</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-md space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Filter Command Center
              </h2>
              {hasActiveFilters && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800/50">
                  Filters Active
                </span>
              )}
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-semibold transition"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Incident Status
              </label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-slate-200 focus:border-red-500 focus:outline-none transition"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Disaster Category
              </label>
              <select
                id="filter-category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-slate-200 focus:border-red-500 focus:outline-none transition"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Severity Level
              </label>
              <select
                id="filter-severity"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-slate-200 focus:border-red-500 focus:outline-none transition"
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Verification State
              </label>
              <select
                id="filter-verification"
                value={verificationFilter}
                onChange={(e) => setVerificationFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-850 px-3 py-2 text-xs text-slate-200 focus:border-red-500 focus:outline-none transition"
              >
                {VERIFICATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 backdrop-blur-md p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-red-500" />
                Live Incident Triage & Allocation Queue
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ordered by calculated priority score (highest first). Tied priorities sorted by newest first.
              </p>
            </div>

            <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Showing {paginatedIncidents.length} of {incidents.length} matching incident
                {incidents.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {isLoading && (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="h-8 w-8 text-red-500 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-200">
                Synchronizing live incident command queue...
              </p>
              <p className="text-xs text-slate-400">
                Fetching records, priority factors, and verification flags from MongoDB.
              </p>
            </div>
          )}

          {!isLoading && apiError && (
            <div className="py-12 px-4 text-center rounded-xl border border-red-900/50 bg-red-950/20 my-4 space-y-3">
              <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">Connection Error</h3>
              <p className="text-xs text-red-300 max-w-md mx-auto">{apiError}</p>
              <button
                onClick={() => fetchIncidents()}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition shadow"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          )}

          {!isLoading && !apiError && totalIncidentsCount === 0 && (
            <div className="py-16 text-center space-y-3">
              <Database className="h-8 w-8 text-slate-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-300">No Incidents Recorded</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No emergency reports have been submitted yet. New reports logged by citizens will appear here in real time.
              </p>
              <button
                onClick={() => navigate('/report')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition shadow"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Log New Incident</span>
              </button>
            </div>
          )}

          {!isLoading && !apiError && totalIncidentsCount > 0 && incidents.length === 0 && (
            <div className="py-16 text-center space-y-3">
              <Filter className="h-8 w-8 text-slate-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-300">No Matching Incidents</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No incidents match your currently applied combination of filters.
              </p>
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition border border-slate-700"
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear Active Filters</span>
              </button>
            </div>
          )}

          {!isLoading && !apiError && paginatedIncidents.length > 0 && (
            <div className="divide-y divide-slate-800/80 mt-2">
              {paginatedIncidents.map((inc) => {
                const incId = inc._id || inc.id;
                const shortId = (incId || '').slice(-6).toUpperCase();
                const sev = (inc.severity || 'medium').toLowerCase();
                const urgency = (inc.urgency || 'soon').toLowerCase();
                const status = (inc.status || 'reported').toLowerCase();
                const isUnderReview = status === 'under_review';
                const isDuplicate = Boolean(inc.possibleDuplicateOf);
                const verificationState = inc.verificationState || (isUnderReview || isDuplicate ? 'needs_review' : 'verified');

                return (
                  <div
                    key={incId}
                    className="py-4 space-y-2 group hover:bg-slate-800/30 px-3 rounded-xl transition border border-transparent hover:border-slate-800"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400 font-bold bg-slate-850 px-2 py-0.5 rounded border border-slate-700">
                            INC-{shortId}
                          </span>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              sev === 'critical'
                                ? 'bg-red-950/80 text-red-400 border-red-800/60 shadow-sm shadow-red-950'
                                : sev === 'high'
                                ? 'bg-amber-950/80 text-amber-400 border-amber-800/60'
                                : sev === 'medium'
                                ? 'bg-blue-950/80 text-blue-400 border-blue-800/60'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {sev.toUpperCase()}
                          </span>

                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 capitalize">
                            {inc.category?.replace('_', ' ')}
                          </span>

                          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 uppercase">
                            Urgency: {urgency}
                          </span>

                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded border capitalize ${
                              status === 'resolved'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40'
                                : status === 'assigned'
                                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/40'
                                : status === 'under_review'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800/40'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {status.replace('_', ' ')}
                          </span>

                          {verificationState === 'needs_review' ? (
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800/50 flex items-center gap-1">
                              <ShieldAlert className="h-3 w-3 text-amber-400" />
                              Manual Review Required
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3 text-emerald-400" />
                              AI Verified
                            </span>
                          )}

                          {isDuplicate && (
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-800/60 flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="h-2.5 w-2.5 text-red-400" />
                              Duplicate Flagged
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm font-semibold text-white group-hover:text-red-400 transition cursor-pointer"
                            onClick={() => navigate(`/incidents/${incId}`)}>
                          {inc.summary || `${inc.category} emergency incident`}
                        </h3>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-500" />
                            {inc.location || inc.locationClue || 'Location not specified'}
                          </span>
                          <span>•</span>
                          <span>
                            Affected:{' '}
                            <strong className="text-slate-300">
                              {inc.peopleAffected !== null && inc.peopleAffected !== undefined
                                ? `${inc.peopleAffected} citizens`
                                : 'Unspecified'}
                            </strong>
                          </span>
                          {inc.injuries !== null && inc.injuries !== undefined && (
                            <>
                              <span>•</span>
                              <span>
                                Injuries:{' '}
                                <strong className="text-red-300">{inc.injuries}</strong>
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock className="h-3 w-3 text-slate-500" />
                            {inc.createdAt
                              ? new Date(inc.createdAt).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Recent'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center lg:flex-col lg:items-end justify-between lg:justify-center gap-3 shrink-0 pt-2 lg:pt-0 border-t border-slate-800/60 lg:border-t-0">
                        <div className="text-left lg:text-right">
                          <div className="flex items-baseline gap-1 lg:justify-end">
                            <span className="text-lg font-mono font-black text-red-400">
                              {inc.priorityScore ?? 0}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">/100</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            Priority Score
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/incidents/${incId}`)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-200 transition shadow-sm hover:text-white"
                          >
                            <span>Inspect</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>

                          {canAllocate && (
                            <button
                              onClick={() => setSelectedIncidentForAllocation(inc)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-900/30 transition"
                            >
                              <Truck className="h-3.5 w-3.5" />
                              <span>Allocate</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {Array.isArray(inc.requiredResources) && inc.requiredResources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-slate-400 font-semibold mr-1">
                          Required Resources:
                        </span>
                        {inc.requiredResources.map((res) => (
                          <span
                            key={res}
                            className="rounded-md bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 text-[10px] text-slate-300"
                          >
                            {res.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && !apiError && totalPages > 1 && (
            <div className="flex items-center justify-between pt-5 mt-4 border-t border-slate-800 text-xs">
              <span className="text-slate-400">
                Page <strong className="text-white">{currentPage}</strong> of{' '}
                <strong className="text-white">{totalPages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition font-medium"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </button>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition font-medium"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedIncidentForAllocation && (
        <ResourceAllocationModal
          incident={selectedIncidentForAllocation}
          onClose={() => setSelectedIncidentForAllocation(null)}
          onAllocationChanged={() => fetchIncidents(true)}
        />
      )}
    </div>
  );
}
