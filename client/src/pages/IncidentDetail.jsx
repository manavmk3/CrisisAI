import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  MapPin,
  Truck,
  RotateCcw,
  Layers,
  Activity,
  FileText,
  CheckCircle2,
  ExternalLink,
  Calendar,
  Crosshair,
  Package,
} from 'lucide-react';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import ResourceAllocationModal from '../components/allocations/ResourceAllocationModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const FACTOR_LABELS = {
  severity: { name: 'Severity Level', max: 25, desc: 'Critical, High, Medium, or Low impact rating' },
  affectedPopulation: { name: 'Affected Population', max: 20, desc: 'Number of citizens endangered or displaced' },
  vulnerability: { name: 'Community Vulnerability', max: 15, desc: 'Structural & demographic vulnerability' },
  resourceShortage: { name: 'Resource Shortage', max: 15, desc: 'Scarcity of local medical and rescue teams' },
  timeSensitivity: { name: 'Time Sensitivity (Urgency)', max: 10, desc: 'Rate of hazard progression' },
  confidence: { name: 'AI Model Confidence', max: 5, desc: 'Certainty of extraction schema' },
  locationContext: { name: 'Geographic Context', max: 10, desc: 'Urban density and critical infrastructure risk' },
};

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentRole, ROLES } = useRole();
  const { token } = useAuth();

  const [incident, setIncident] = useState(null);
  const [referringDuplicates, setReferringDuplicates] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [releasingAllocationId, setReleasingAllocationId] = useState(null);
  const [releaseFeedback, setReleaseFeedback] = useState(null);

  const canAllocate = currentRole === ROLES.AUTHORITY || currentRole === ROLES.ADMIN;

  const fetchIncidentDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const incRes = await fetch(`${API_BASE_URL}/incidents/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (incRes.status === 400) {
        throw new Error('Invalid incident ID format.');
      }
      if (incRes.status === 404) {
        throw new Error('Incident not found. The record may have been removed or does not exist.');
      }
      if (!incRes.ok) {
        throw new Error(`Failed to fetch incident details (HTTP ${incRes.status})`);
      }

      const incData = await incRes.json();
      if (!incData.success || !incData.data) {
        throw new Error('Invalid data returned by server.');
      }

      setIncident(incData.data);
      if (Array.isArray(incData.referringDuplicates)) {
        setReferringDuplicates(incData.referringDuplicates);
      }

      try {
        const candRes = await fetch(`${API_BASE_URL}/incidents/${id}/candidates`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (candRes.ok) {
          const candData = await candRes.json();
          if (candData.success && Array.isArray(candData.data)) {
            setCandidates(candData.data);
          }
        }
      } catch (candErr) {
        console.warn('Could not load candidates:', candErr.message);
      }

      try {
        const allocRes = await fetch(`${API_BASE_URL}/incidents/${id}/allocations`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (allocRes.ok) {
          const allocData = await allocRes.json();
          if (allocData.success && Array.isArray(allocData.data)) {
            setAllocations(allocData.data);
          }
        }
      } catch (allocErr) {
        console.warn('Could not load allocations:', allocErr.message);
      }
    } catch (err) {
      console.error('[IncidentDetail] Error:', err);
      setError(err.message || 'Error loading incident details.');
    } finally {
      setIsLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchIncidentDetails();
  }, [fetchIncidentDetails]);

  const handleReleaseAllocation = async (allocationId) => {
    if (!canAllocate) return;
    setReleasingAllocationId(allocationId);
    setReleaseFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/allocations/${allocationId}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ notes: 'Released via Authority Incident Command View' }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setReleaseFeedback({ type: 'success', message: 'Resource released and returned to available inventory.' });
        fetchIncidentDetails();
      } else {
        throw new Error(data.message || 'Failed to release allocation.');
      }
    } catch (err) {
      setReleaseFeedback({ type: 'error', message: err.message });
    } finally {
      setReleasingAllocationId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-4">
        <Activity className="h-10 w-10 text-red-500 animate-spin mx-auto" />
        <h2 className="text-base font-bold text-white">Loading Incident Dossier...</h2>
        <p className="text-xs text-slate-400">Retrieving report details, AI extractions, and candidate rankings.</p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="py-16 max-w-lg mx-auto text-center space-y-4">
        <div className="p-4 rounded-full bg-red-950/60 border border-red-800/60 w-16 h-16 mx-auto flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Unable to View Incident</h2>
        <p className="text-xs text-slate-300 bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono">
          {error}
        </p>
        <div className="pt-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition border border-slate-700 shadow"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Authority Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  const shortId = (incident._id || incident.id || '').slice(-6).toUpperCase();
  const sev = (incident.severity || 'medium').toLowerCase();
  const urgency = (incident.urgency || 'soon').toLowerCase();
  const status = (incident.status || 'reported').toLowerCase();
  const isDuplicate = Boolean(incident.possibleDuplicateOf);
  const isUnderReview = status === 'under_review';
  const verificationState = incident.verificationState || (isUnderReview || isDuplicate ? 'needs_review' : 'verified');

  const breakdown = incident.priorityBreakdown || {};

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-855 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </button>

          <span className="text-slate-600">/</span>
          <span className="font-mono text-xs text-slate-400 font-bold">INC-{shortId}</span>
        </div>

        <div className="flex items-center gap-2">
          {canAllocate && (
            <button
              onClick={() => setIsAllocationModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-900/30 transition"
            >
              <Truck className="h-4 w-4" />
              <span>Allocate Resources</span>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 backdrop-blur-md space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-300 bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700">
                INC-{shortId}
              </span>

              <span
                className={`text-xs font-black px-2.5 py-0.5 rounded-md border ${
                  sev === 'critical'
                    ? 'bg-red-950 text-red-400 border-red-800/80 shadow-md shadow-red-950'
                    : sev === 'high'
                    ? 'bg-amber-950 text-amber-400 border-amber-800/80'
                    : sev === 'medium'
                    ? 'bg-blue-950 text-blue-400 border-blue-800/80'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {sev.toUpperCase()} SEVERITY
              </span>

              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 capitalize">
                {incident.category?.replace('_', ' ')}
              </span>

              <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/50 uppercase">
                Urgency: {urgency}
              </span>

              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 capitalize">
                Status: {status.replace('_', ' ')}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {incident.summary || `${incident.category} Emergency`}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                {incident.location || incident.locationClue || 'Location not specified'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                Reported {new Date(incident.createdAt).toLocaleString()}
              </span>
              {incident.reporter && (
                <>
                  <span>•</span>
                  <span>
                    Reporter: <strong className="text-slate-300">{incident.reporter.name}</strong>{' '}
                    ({incident.reporter.role})
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="lg:text-right shrink-0 p-4 rounded-xl border border-red-900/40 bg-red-950/20 flex flex-row lg:flex-col items-center lg:items-end justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-1 lg:justify-end">
                <span className="text-3xl font-black font-mono text-red-400">
                  {incident.priorityScore}
                </span>
                <span className="text-xs text-slate-400 font-mono">/100</span>
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Priority Score
              </span>
            </div>
            <span className="text-[10px] font-mono text-red-300 bg-red-950/80 px-2 py-0.5 rounded border border-red-800/50">
              Ranked Default #1
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <FileText className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Section A: Citizen-Submitted Report
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                Original Citizen Narrative:
              </span>
              <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 leading-relaxed font-sans text-xs whitespace-pre-wrap">
                "{incident.report}"
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-850/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Submitted Location
                </span>
                <p className="text-xs text-slate-200 font-medium">{incident.location || 'None specified'}</p>
              </div>

              <div className="p-3 rounded-lg border border-slate-800 bg-slate-850/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Location Clue (AI Extracted)
                </span>
                <p className="text-xs text-slate-200 font-medium">{incident.locationClue || 'None detected'}</p>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-850/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-slate-400" />
                <span className="text-xs text-slate-300 font-medium">GPS Telemetry Coordinates</span>
              </div>
              {incident.coordinates &&
              incident.coordinates.latitude !== null &&
              incident.coordinates.longitude !== null ? (
                <span className="font-mono text-xs text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  {incident.coordinates.latitude.toFixed(4)}, {incident.coordinates.longitude.toFixed(4)}
                </span>
              ) : (
                <span className="font-mono text-xs text-slate-400">No coordinates provided</span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                Section B: AI Extraction & Verification State
              </h2>
            </div>

            {verificationState === 'needs_review' ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-amber-400" />
                Requires Review
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                Normal Processing
              </span>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <div
              className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                verificationState === 'needs_review'
                  ? 'border-amber-900/50 bg-amber-950/20 text-amber-200'
                  : 'border-emerald-900/50 bg-emerald-950/20 text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {verificationState === 'needs_review' ? (
                  <>
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                    <span>Dispatcher Manual Review Triggered</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Joi Schema Validation Passed</span>
                  </>
                )}
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">
                {isDuplicate
                  ? 'Flagged as potential multi-signal duplicate. Requires human dispatcher review to avoid double-dispatching resources.'
                  : isUnderReview
                  ? 'Incident marked as under review by dispatcher team.'
                  : 'AI output passed automated 9-field Joi schema validation without fallback retry failures.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-850/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  People Affected
                </span>
                <p className="text-sm font-bold text-white">
                  {incident.peopleAffected !== null && incident.peopleAffected !== undefined
                    ? `${incident.peopleAffected} citizens`
                    : 'Not specified'}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-800 bg-slate-850/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Reported Injuries
                </span>
                <p className="text-sm font-bold text-red-400">
                  {incident.injuries !== null && incident.injuries !== undefined
                    ? `${incident.injuries} casualties`
                    : 'None specified'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-800 bg-slate-850/60 flex items-center justify-between">
              <span className="text-slate-300 font-medium">Model Certainty:</span>
              <span className="font-mono text-purple-300 font-bold">
                {incident.aiConfidence !== undefined
                  ? `${(incident.aiConfidence * 100).toFixed(1)}% confidence`
                  : 'N/A'}
              </span>
            </div>

            <p className="text-[10px] text-slate-500 italic">
              Note: AI confidence reflects Gemini model extraction certainty. It is advisory and does not replace field verification.
            </p>

            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1.5">
                AI Assessed Resource Needs:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {incident.requiredResources && incident.requiredResources.length > 0 ? (
                  incident.requiredResources.map((res) => (
                    <span
                      key={res}
                      className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 capitalize"
                    >
                      {res.replace('_', ' ')}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 italic">No specific resource requirements tagged.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Section C: Priority Score Breakdown (Day 10 Multi-Factor Scoring)
            </h2>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Overall Score: <strong className="text-red-400 text-sm">{incident.priorityScore}</strong> / 100
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {Object.entries(FACTOR_LABELS).map(([key, factor]) => {
            const points = breakdown[key] !== undefined ? Number(breakdown[key]) : 0;
            const percentage = Math.round((points / factor.max) * 100);

            return (
              <div key={key} className="p-3.5 rounded-xl border border-slate-800 bg-slate-850/50 space-y-2">
                <div className="flex items-center justify-between text-slate-300 font-semibold">
                  <span>{factor.name}</span>
                  <span className="font-mono text-red-400">
                    {points} <span className="text-slate-500 font-normal">/ {factor.max}</span>
                  </span>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-red-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                <p className="text-[10px] text-slate-400 leading-snug">{factor.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <Layers className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Section D: Multi-Signal Duplicate Detection Status
          </h2>
        </div>

        {isDuplicate || referringDuplicates.length > 0 ? (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl border border-amber-900/60 bg-amber-950/20 text-amber-200 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold text-xs text-white">Advisory Duplicate Match Detected</h4>
                <p className="text-[11px] leading-relaxed">
                  This report has been flagged as a potential duplicate. Per CrisisAI safeguards, reports are NEVER
                  automatically merged, rejected, or cancelled. Both incidents remain distinct records in MongoDB for
                  human dispatcher review.
                </p>
              </div>
            </div>

            {incident.possibleDuplicateOf && (
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-850/80 space-y-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Referenced Primary Incident:
                </span>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h5 className="font-semibold text-white text-xs">
                      {incident.possibleDuplicateOf.summary || 'Referenced Primary Incident'}
                    </h5>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                      <span className="capitalize">{incident.possibleDuplicateOf.category}</span>
                      <span>•</span>
                      <span className="uppercase text-red-400 font-bold">
                        {incident.possibleDuplicateOf.severity}
                      </span>
                      <span>•</span>
                      <span>Status: {incident.possibleDuplicateOf.status}</span>
                    </div>
                  </div>

                  <Link
                    to={`/incidents/${incident.possibleDuplicateOf._id || incident.possibleDuplicateOf.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition"
                  >
                    <span>Inspect Target</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}

            {referringDuplicates.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Other Reports Flagged as Duplicates of this Incident ({referringDuplicates.length}):
                </span>
                <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-850/50">
                  {referringDuplicates.map((dup) => (
                    <div key={dup._id} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-200 text-xs">{dup.summary}</p>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {(dup._id || '').slice(-6).toUpperCase()} • Severity: {dup.severity} • {new Date(dup.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <Link
                        to={`/incidents/${dup._id}`}
                        className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                      >
                        View &rarr;
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-850/30 text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>No multi-signal duplicate candidates detected within 48-hour & 5km window.</span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                Section E: Ranked Resource Recommendations (Day 16 Allocation Engine)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Ranked dynamically by suitability match, haversine distance (no fabricated distances), priority weight, and urgency points.
            </p>
          </div>

          <span className="text-xs font-mono text-slate-400">
            {candidates.length} Available Candidate{candidates.length !== 1 ? 's' : ''}
          </span>
        </div>

        {candidates.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-slate-800 bg-slate-850/40 space-y-2">
            <Package className="h-8 w-8 text-slate-500 mx-auto" />
            <h4 className="text-sm font-bold text-slate-300">No Suitable Inventory Available</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No available resources match this incident's requirements. Please register new inventory or release existing allocations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {candidates.map((cand) => {
              const matchType = cand.matchType || 'general';
              const isExact = matchType === 'exact';
              const isCompatible = matchType === 'compatible';

              return (
                <div
                  key={cand.resourceId}
                  className="p-4 rounded-xl border border-slate-800 bg-slate-850/80 hover:border-slate-700 transition space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-xs">{cand.resourceName}</span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                            isExact
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                              : isCompatible
                              ? 'bg-blue-950 text-blue-300 border-blue-800/60'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {isExact
                            ? 'Exact Match'
                            : isCompatible
                            ? 'Compatible Alternative'
                            : 'General Emergency'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 capitalize mt-0.5">
                        Type: {cand.resourceType?.replace('_', ' ')} • Status: {cand.status}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-black font-mono text-blue-400">
                        {cand.score} <span className="text-[10px] text-slate-500 font-normal">/100</span>
                      </div>
                      <span className="text-[9px] font-semibold text-slate-500 uppercase block">
                        Rank Score
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Available Units:</span>
                      <strong className="text-white font-mono">
                        {cand.availableQuantity} / {cand.totalQuantity}
                      </strong>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px]">Distance Proximity:</span>
                      {cand.distanceKm !== null && cand.distanceKm !== undefined ? (
                        <strong className="text-emerald-400 font-mono">{cand.distanceKm} km</strong>
                      ) : (
                        <span className="text-slate-400 italic">No GPS coordinates</span>
                      )}
                    </div>
                  </div>

                  {cand.explanation && (
                    <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                      Explainability: {cand.explanation}
                    </p>
                  )}

                  {canAllocate && (
                    <button
                      onClick={() => setIsAllocationModalOpen(true)}
                      className="w-full py-1.5 px-3 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-xs font-bold text-white transition shadow"
                    >
                      Allocate This Resource
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Section F: Currently Allocated Units ({allocations.length})
            </h2>
          </div>
        </div>

        {releaseFeedback && (
          <div
            className={`p-3 rounded-lg text-xs font-medium ${
              releaseFeedback.type === 'success'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                : 'bg-red-950/60 text-red-300 border border-red-800/60'
            }`}
          >
            {releaseFeedback.message}
          </div>
        )}

        {allocations.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No resources are currently allocated to this incident.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-850/60 overflow-hidden">
            {allocations.map((alloc) => (
              <div
                key={alloc._id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{alloc.resource?.name || 'Resource Unit'}</span>
                    <span className="font-mono text-[10px] text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                      Qty: {alloc.quantity}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                        alloc.status === 'active'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {alloc.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1">
                    Allocated on {new Date(alloc.createdAt).toLocaleString()} by{' '}
                    <strong className="text-slate-300">{alloc.allocatedBy?.name || 'Authority'}</strong>
                  </p>
                </div>

                {canAllocate && alloc.status === 'active' && (
                  <button
                    onClick={() => handleReleaseAllocation(alloc._id)}
                    disabled={releasingAllocationId === alloc._id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-800/50 bg-red-950/40 text-red-300 hover:bg-red-900/60 text-xs font-semibold transition disabled:opacity-50"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${releasingAllocationId === alloc._id ? 'animate-spin' : ''}`} />
                    <span>{releasingAllocationId === alloc._id ? 'Releasing...' : 'Release Allocation'}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAllocationModalOpen && (
        <ResourceAllocationModal
          incident={incident}
          onClose={() => setIsAllocationModalOpen(false)}
          onAllocationChanged={fetchIncidentDetails}
        />
      )}
    </div>
  );
}
