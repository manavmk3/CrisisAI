import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  Flame,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  RefreshCw,
  Truck,
  Shield,
  Layers,
  Activity,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#10b981',
};

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#10b981'];

export default function AnalyticsDashboard() {
  const { token, user } = useAuth();
  const [filterMode, setFilterMode] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);

  const [dashboardData, setDashboardData] = useState({
    overview: {
      activeIncidents: 0,
      totalAffectedPopulation: 0,
      unresolvedCases: 0,
      averageResponseTimeMinutes: null,
      responseRecordsCount: 0,
      units: 'minutes',
    },
    severity: [],
    resources: [],
    categories: [],
    responseTime: {
      averageResponseTimeMinutes: null,
      recordsCount: 0,
      units: 'minutes',
    },
  });

  const calculateDateRange = useCallback(() => {
    const now = new Date();
    if (filterMode === '7d') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: past.toISOString(), endDate: now.toISOString() };
    }
    if (filterMode === '30d') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: past.toISOString(), endDate: now.toISOString() };
    }
    if (filterMode === '90d') {
      const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { startDate: past.toISOString(), endDate: now.toISOString() };
    }
    if (filterMode === 'custom') {
      return {
        startDate: customStart ? new Date(customStart).toISOString() : '',
        endDate: customEnd ? new Date(customEnd).toISOString() : '',
      };
    }
    return { startDate: '', endDate: '' };
  }, [filterMode, customStart, customEnd]);

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { startDate, endDate } = calculateDateRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API_BASE_URL}/analytics/dashboard${qs}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Server responded with ${res.status}`);
      }

      const body = await res.json();
      if (body.success && body.data) {
        setDashboardData(body.data);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load analytics.');
    } finally {
      setIsLoading(false);
    }
  }, [token, calculateDateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const { overview, severity, resources, categories, responseTime } = dashboardData;

  const totalSeverityCount = severity.reduce((acc, curr) => acc + (curr.count || 0), 0);

  const activeResources = resources.filter(
    (r) => r.demandCount > 0 || r.deployedQuantity > 0 || r.unmetDemand > 0
  );

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Operations & Crisis Analytics
              </h1>
              <p className="text-xs text-slate-400">
                Live MongoDB aggregation metrics across incidents, resources, response times, and population impact
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/90 p-1 text-xs">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                filterMode === 'all'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('7d')}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                filterMode === '7d'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('30d')}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                filterMode === '30d'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('90d')}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                filterMode === '90d'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              90 Days
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('custom')}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                filterMode === 'custom'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Custom
            </button>
          </div>

          <button
            type="button"
            onClick={fetchAnalytics}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
            title="Refresh metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {filterMode === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Start Date:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">End Date:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={fetchAnalytics}
            className="rounded-lg bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500 transition"
          >
            Apply Range
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={fetchAnalytics}
            className="underline hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Incidents
            </span>
            <div className="h-8 w-8 rounded-lg bg-red-950/50 border border-red-500/30 flex items-center justify-center text-red-400">
              <Flame className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {isLoading ? '...' : (overview.activeIncidents ?? 0)}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Requiring operational triage or dispatch
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Affected Population
            </span>
            <div className="h-8 w-8 rounded-lg bg-amber-950/50 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {isLoading ? '...' : Number(overview.totalAffectedPopulation || 0).toLocaleString()}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Total estimated citizens impacted
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Avg Response Time
            </span>
            <div className="h-8 w-8 rounded-lg bg-blue-950/50 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {isLoading
                ? '...'
                : overview.averageResponseTimeMinutes !== null
                ? `${overview.averageResponseTimeMinutes} min`
                : 'No data'}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {overview.responseRecordsCount > 0
                ? `Calculated from ${overview.responseRecordsCount} accepted missions`
                : 'No accepted response milestones yet'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Unresolved Cases
            </span>
            <div className="h-8 w-8 rounded-lg bg-purple-950/50 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {isLoading ? '...' : (overview.unresolvedCases ?? 0)}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Pending, in triage, or actively dispatched
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Incident Severity Distribution
                </h2>
                <p className="text-[11px] text-slate-400">
                  Categorized risk levels across reported crises
                </p>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                Total: {totalSeverityCount}
              </span>
            </div>

            <div className="h-64 w-full mt-4 flex items-center justify-center">
              {totalSeverityCount === 0 ? (
                <div className="text-center text-slate-500 text-xs">
                  <Shield className="h-8 w-8 mx-auto mb-1 opacity-40" />
                  No incidents recorded in this timeframe
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severity}
                      dataKey="count"
                      nameKey="severity"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                    >
                      {severity.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SEVERITY_COLORS[entry.severity] || PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(val) => <span className="capitalize text-slate-300 text-xs">{val}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-800/80 mt-2">
            {severity.map((s) => (
              <div key={s.severity} className="text-center">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  {s.severity}
                </span>
                <span
                  className="text-base font-bold"
                  style={{ color: SEVERITY_COLORS[s.severity] || '#fff' }}
                >
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg backdrop-blur-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Crisis Category Breakdown
                </h2>
                <p className="text-[11px] text-slate-400">
                  Distribution of incident types across reporting areas
                </p>
              </div>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>

            <div className="h-64 w-full mt-4">
              {categories.filter((c) => c.count > 0).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                  <Layers className="h-8 w-8 mb-1 opacity-40" />
                  No crisis category data recorded
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categories.filter((c) => c.count > 0)}
                    margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="category"
                      stroke="#64748b"
                      fontSize={10}
                      tickLine={false}
                      angle={-25}
                      textAnchor="end"
                    />
                    <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Incidents" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 text-center pt-2 border-t border-slate-800/60">
            Real-time incident taxonomy based on structured AI extraction
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/80 pb-3 gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Resource Demand vs. Actual Deployment
            </h2>
            <p className="text-[11px] text-slate-400">
              Incident requirements (incidents requesting) versus active resource allocation units
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Demand (Incidents)
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Deployed Units
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Unmet
            </span>
          </div>
        </div>

        <div className="h-80 w-full mt-4">
          {activeResources.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
              <Truck className="h-8 w-8 mb-1 opacity-40" />
              No active resource demand or allocations recorded
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeResources}
                margin={{ top: 15, right: 15, left: -10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="resourceType"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="demandCount" fill="#f59e0b" name="Incident Demand" radius={[3, 3, 0, 0]} />
                <Bar dataKey="deployedQuantity" fill="#10b981" name="Deployed Units" radius={[3, 3, 0, 0]} />
                <Bar dataKey="unmetDemand" fill="#ef4444" name="Unmet Demand" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
          <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/80">
            <span className="font-semibold text-slate-300 block mb-0.5">Demand Definition</span>
            Count of distinct incidents whose AI analysis identified the resource type as an active operational need.
          </div>
          <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/80">
            <span className="font-semibold text-slate-300 block mb-0.5">Deployment Definition</span>
            Total inventory units allocated with active status. Released and cancelled allocations are excluded.
          </div>
          <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800/80">
            <span className="font-semibold text-slate-300 block mb-0.5">Unmet Differential</span>
            Calculated as max(0, Incident Demand - Deployed Units), highlighting shortfalls in emergency response capacity.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Response Time & Operational Milestones
            </h2>
            <p className="text-[11px] text-slate-400">
              Time elapsed from assignment creation to responder acceptance
            </p>
          </div>
          <Clock className="h-4 w-4 text-blue-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">
              Average Response
            </span>
            <div className="text-2xl font-bold text-blue-400 mt-1">
              {responseTime.averageResponseTimeMinutes !== null
                ? `${responseTime.averageResponseTimeMinutes} min`
                : 'No Data'}
            </div>
            <span className="text-[10px] text-slate-500">
              From dispatch to acceptance
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">
              Fastest Response
            </span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {responseTime.minMinutes !== undefined && responseTime.minMinutes !== null
                ? `${responseTime.minMinutes} min`
                : '—'}
            </div>
            <span className="text-[10px] text-slate-500">
              Minimum recorded duration
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">
              Slowest Response
            </span>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {responseTime.maxMinutes !== undefined && responseTime.maxMinutes !== null
                ? `${responseTime.maxMinutes} min`
                : '—'}
            </div>
            <span className="text-[10px] text-slate-500">
              Maximum recorded duration
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">
              Audited Missions
            </span>
            <div className="text-2xl font-bold text-slate-200 mt-1">
              {responseTime.recordsCount || 0}
            </div>
            <span className="text-[10px] text-slate-500">
              Assignments with valid acceptedAt
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 text-xs text-slate-400">
          Response times are audited strictly using persisted database milestones (<code className="text-slate-300">acceptedAt - createdAt</code>). Negative durations, estimated ETAs, and unaccepted tasks are excluded from the mathematical average to maintain integrity.
        </div>
      </div>
    </div>
  );
}

