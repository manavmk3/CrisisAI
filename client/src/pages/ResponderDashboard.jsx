import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  MapPin,
  Truck,
  CheckCircle2,
  XCircle,
  Navigation,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  Check,
  ExternalLink,
  LocateFixed,
  Square,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRole, ROLES } from '../context/RoleContext';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const REALTIME_EVENTS = [
  'assignment:created',
  'assignment:status-updated',
  'assignment:declined',
  'assignment:location-updated',
  'incident:updated',
  'incident:resolved',
];

const SEVERITY_COLORS = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  low: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
};

const STATUS_CONFIG = {
  assigned: {
    label: 'Pending Acceptance',
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    step: 1,
  },
  accepted: {
    label: 'Accepted',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    step: 2,
  },
  en_route: {
    label: 'En Route',
    badge: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
    step: 3,
  },
  arrived: {
    label: 'On Scene',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    step: 4,
  },
  completed: {
    label: 'Completed',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    step: 5,
  },
  cancelled: {
    label: 'Declined / Cancelled',
    badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    step: 0,
  },
};

export default function ResponderDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, token, isAuthenticated } = useAuth();
  const { currentRole } = useRole();

  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'all');
  const [declineModalItem, setDeclineModalItem] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [completeModalItem, setCompleteModalItem] = useState(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [consentLocationItem, setConsentLocationItem] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  const [sharingLocationId, setSharingLocationId] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState(null);
  const watchIdRef = useRef(null);

  const userRole = (user?.role || '').toLowerCase();
  const isAuthorizedRole =
    ['volunteer', 'responder', 'authority', 'admin'].includes(userRole) ||
    currentRole === ROLES.RESPONDER;

  const fetchAssignments = useCallback(
    async (isSilent = false) => {
      if (!token) return;
      if (!isSilent) setIsLoading(true);
      else setIsRefreshing(true);
      setErrorMessage(null);

      try {
        const res = await fetch(`${API_BASE_URL}/assignments/my`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.status === 401) {
          navigate('/login');
          return;
        }

        if (res.status === 403) {
          setErrorMessage('Access denied. This dashboard is reserved for verified field responders.');
          setAssignments([]);
          return;
        }

        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.data)) {
          setAssignments(data.data);
        } else {
          setErrorMessage(data.message || 'Failed to retrieve responder assignments.');
        }
      } catch (err) {
        setErrorMessage(err.message || 'Network connection failed while retrieving assignments.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [token, navigate]
  );

  useEffect(() => {
    if (!isAuthenticated && !token) {
      navigate('/login');
      return;
    }
    fetchAssignments();
  }, [isAuthenticated, token, fetchAssignments, navigate]);

  const handleRealtimeSync = useCallback(() => {
    fetchAssignments(true);
  }, [fetchAssignments]);

  const { isConnected } = useRealtimeSync({
    onSync: handleRealtimeSync,
    events: REALTIME_EVENTS,
    fallbackIntervalMs: 10000,
  });

  const stopLiveLocation = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharingLocationId(null);
    setCurrentCoords(null);
    setLocationStatus('Location sharing stopped.');
  }, []);

  useEffect(() => {
    if (sharingLocationId) {
      const activeAssign = assignments.find(
        (a) => (a._id || a.id) === sharingLocationId
      );
      if (
        !activeAssign ||
        activeAssign.status === 'completed' ||
        activeAssign.status === 'cancelled'
      ) {
        stopLiveLocation();
      }
    }
  }, [assignments, sharingLocationId, stopLiveLocation]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    const nextParams = new URLSearchParams(searchParams);
    if (tabKey === 'all') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', tabKey);
    }
    setSearchParams(nextParams);
  };

  const handleStatusUpdate = async (assignmentId, newStatus, extraBody = {}) => {
    setSubmittingAction(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/assignments/${assignmentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          ...extraBody,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update assignment status.');
      }

      setActionFeedback({
        type: 'success',
        message: data.message || `Assignment status updated to ${newStatus}.`,
      });

      if (newStatus === 'completed' || newStatus === 'cancelled') {
        if (sharingLocationId === assignmentId) {
          stopLiveLocation();
        }
      }

      await fetchAssignments(true);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err.message || 'Operation failed.',
      });
    } finally {
      setSubmittingAction(false);
      setDeclineModalItem(null);
      setDeclineReason('');
      setCompleteModalItem(null);
      setCompletionNotes('');
    }
  };

  const startLiveLocation = (assignment) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('Geolocation API is not supported by your browser.');
      return;
    }

    setLocationStatus('Requesting GPS permission from device...');

    const assignId = assignment._id || assignment.id;

    const onLocationSuccess = async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      setCurrentCoords({ latitude: lat, longitude: lng });
      setLocationStatus(`Live coordinates active (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

      try {
        await fetch(`${API_BASE_URL}/assignments/${assignId}/location`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ latitude: lat, longitude: lng }),
        });
      } catch (postErr) {
        console.warn('Location broadcast failed:', postErr);
      }
    };

    const onLocationError = (error) => {
      let desc = 'Unknown location error.';
      if (error.code === 1) {
        desc = 'Location access denied by user. Live tracking cancelled.';
      } else if (error.code === 2) {
        desc = 'GPS position unavailable.';
      } else if (error.code === 3) {
        desc = 'GPS request timed out.';
      }
      setLocationStatus(desc);
      stopLiveLocation();
    };

    const watchId = navigator.geolocation.watchPosition(onLocationSuccess, onLocationError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 20000,
    });

    watchIdRef.current = watchId;
    setSharingLocationId(assignId);
    setConsentLocationItem(null);
  };

  const counts = {
    total: assignments.length,
    assigned: assignments.filter((a) => a.status === 'assigned').length,
    accepted: assignments.filter((a) => a.status === 'accepted').length,
    en_route: assignments.filter((a) => a.status === 'en_route').length,
    arrived: assignments.filter((a) => a.status === 'arrived').length,
    completed: assignments.filter((a) => a.status === 'completed').length,
    cancelled: assignments.filter((a) => a.status === 'cancelled').length,
  };

  const activeCount = counts.accepted + counts.en_route + counts.arrived;

  const filteredAssignments = assignments.filter((item) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return item.status === 'assigned';
    if (activeTab === 'active') return ['accepted', 'en_route', 'arrived'].includes(item.status);
    if (activeTab === 'completed') return item.status === 'completed';
    if (activeTab === 'cancelled') return item.status === 'cancelled';
    return true;
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0b0f19] px-4 py-16 flex items-center justify-center">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-white">Authentication Required</h2>
          <p className="text-sm text-slate-400">
            Please log in with your verified responder or volunteer credentials to view field tasks.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!isAuthorizedRole && userRole === 'citizen') {
    return (
      <div className="min-h-screen bg-[#0b0f19] px-4 py-16 flex items-center justify-center">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold text-white">Responder Access Restricted</h2>
          <p className="text-sm text-slate-400">
            Your account is currently registered as a <span className="text-amber-400 font-semibold">Citizen</span>. Task management is restricted to registered emergency volunteers, field responders, and authorized dispatchers.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
            >
              Public Dashboard
            </Link>
            <Link
              to="/report"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition"
            >
              Report Emergency
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="border-b border-slate-800/80 pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white shadow-lg shadow-red-900/40">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white font-sans flex items-center gap-2">
                  Responder Task Operations
                  <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 text-xs font-mono font-medium text-blue-400">
                    Day 24
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Field operations dispatch queue for authenticated volunteers and emergency response units.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="text-slate-400">
                {isConnected ? 'Socket.IO Real-time Sync Active' : 'Polling Sync Mode'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => fetchAssignments(false)}
              disabled={isLoading || isRefreshing}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing || isLoading ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div
          className={`flex items-center justify-between rounded-xl p-3.5 text-xs border ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/40 border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-white font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-red-950/40 border border-red-500/40 p-4 text-xs text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-950/10 p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-yellow-400 uppercase tracking-wider">
              New Pending
            </span>
            <Clock className="h-4 w-4 text-yellow-400" />
          </div>
          <div className="text-2xl font-black text-white">{counts.assigned}</div>
          <p className="text-[10px] text-slate-400">Awaiting your response</p>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
              Accepted
            </span>
            <Check className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">{counts.accepted}</div>
          <p className="text-[10px] text-slate-400">Missions confirmed</p>
        </div>

        <div className="rounded-xl border border-purple-500/30 bg-purple-950/10 p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
              En Route
            </span>
            <Navigation className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white">{counts.en_route}</div>
          <p className="text-[10px] text-slate-400">Travelling to target</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              On Scene
            </span>
            <MapPin className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">{counts.arrived}</div>
          <p className="text-[10px] text-slate-400">Active ground presence</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-3.5 space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Completed
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{counts.completed}</div>
          <p className="text-[10px] text-slate-400">Finished mission logs</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'all'
              ? 'bg-red-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          All Tasks ({counts.total})
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('pending')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
            activeTab === 'pending'
              ? 'bg-yellow-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span>New / Pending</span>
          {counts.assigned > 0 && (
            <span className="rounded-full bg-yellow-400 text-black px-1.5 py-0.2 text-[10px] font-bold">
              {counts.assigned}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('active')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
            activeTab === 'active'
              ? 'bg-blue-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span>Active Operations ({activeCount})</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('completed')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'completed'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Completed ({counts.completed})
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('cancelled')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'cancelled'
              ? 'bg-slate-700 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Declined / Cancelled ({counts.cancelled})
        </button>
      </div>

      {sharingLocationId && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-500/40 bg-blue-950/30 p-3.5 text-xs text-blue-200 shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </div>
            <div>
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                Live Location Broadcast Active
              </span>
              <p className="text-[11px] text-blue-300">
                {locationStatus || 'Broadcasting GPS device coordinates to incident command.'}
                {currentCoords && ` (Lat: ${currentCoords.latitude.toFixed(4)}, Lng: ${currentCoords.longitude.toFixed(4)})`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={stopLiveLocation}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/60 transition self-start sm:self-auto"
          >
            <Square className="h-3.5 w-3.5" />
            <span>Stop Location Broadcast</span>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4 py-12 text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-red-500 mx-auto" />
          <p className="text-xs text-slate-400 font-medium">
            Connecting to CrisisAI dispatch database...
          </p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center space-y-3">
          <ShieldCheck className="h-12 w-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Assignments Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {activeTab === 'pending'
              ? 'You do not have any pending assignments awaiting response.'
              : activeTab === 'active'
              ? 'You have no active in-progress missions right now.'
              : activeTab === 'completed'
              ? 'No completed mission history records found.'
              : 'No task records matching this category are currently assigned to your account.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {filteredAssignments.map((assignment) => {
            const assignId = assignment._id || assignment.id;
            const inc = assignment.incidentId || {};
            const statusInfo = STATUS_CONFIG[assignment.status] || STATUS_CONFIG.assigned;
            const isPending = assignment.status === 'assigned';
            const isAccepted = assignment.status === 'accepted';
            const isEnRoute = assignment.status === 'en_route';
            const isArrived = assignment.status === 'arrived';
            const isActiveMission = ['accepted', 'en_route', 'arrived'].includes(assignment.status);
            const isCurrentlySharingThis = sharingLocationId === assignId;

            const hasCoords = Boolean(
              inc.coordinates?.latitude != null && inc.coordinates?.longitude != null
            );

            return (
              <div
                key={assignId}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl hover:border-slate-700/80 transition space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">
                        REF: {assignId.slice(-8).toUpperCase()}
                      </span>
                      {inc.category && (
                        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                          {inc.category}
                        </span>
                      )}
                      {inc.severity && (
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            SEVERITY_COLORS[(inc.severity || '').toLowerCase()] ||
                            SEVERITY_COLORS.medium
                          }`}
                        >
                          {inc.severity} Severity
                        </span>
                      )}
                      {inc.priorityScore !== undefined && (
                        <span className="rounded-full bg-red-950/50 border border-red-500/30 px-2 py-0.5 text-[10px] font-mono text-red-300">
                          Priority {inc.priorityScore}/100
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-white tracking-tight">
                      {inc.summary || inc.report || 'Operational Incident Task'}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusInfo.badge}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                  <div className="space-y-2 rounded-xl bg-slate-950/60 p-3 border border-slate-800/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-red-400" />
                      <span>Location & Target</span>
                    </div>
                    <p className="font-medium text-slate-200">
                      {inc.location || 'Location description not specified'}
                    </p>
                    {hasCoords ? (
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                        <span>
                          GPS: {Number(inc.coordinates.latitude).toFixed(4)},{' '}
                          {Number(inc.coordinates.longitude).toFixed(4)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">No GPS coordinates</span>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl bg-slate-950/60 p-3 border border-slate-800/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-blue-400" />
                      <span>Assigned Logistics</span>
                    </div>
                    {assignment.resourceId ? (
                      <div className="space-y-1">
                        <div className="font-medium text-slate-200">
                          {assignment.resourceId.name || 'Equipment Unit'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Type: {assignment.resourceId.type || 'Standard'}
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400">Personnel / responder unit assignment only</p>
                    )}
                    {assignment.ETA !== null && assignment.ETA !== undefined && (
                      <div className="flex items-center gap-1 text-[11px] text-blue-300 font-medium">
                        <Clock className="h-3 w-3" />
                        <span>Estimated Arrival: {assignment.ETA} mins</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl bg-slate-950/60 p-3 border border-slate-800/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-purple-400" />
                      <span>Dispatch Authority</span>
                    </div>
                    {assignment.assignedBy ? (
                      <div className="space-y-1">
                        <div className="font-medium text-slate-200">
                          {assignment.assignedBy.name || assignment.assignedBy.email}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {assignment.assignedBy.agency || 'Emergency Command Center'}
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400">CrisisAI Automated Dispatch</p>
                    )}
                    <div className="text-[10px] text-slate-400">
                      Assigned: {new Date(assignment.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                {assignment.notes && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-xs text-slate-300">
                    <span className="font-semibold text-slate-400">Mission Notes: </span>
                    <span>{assignment.notes}</span>
                  </div>
                )}

                {assignment.declineReason && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-2.5 text-xs text-rose-300">
                    <span className="font-semibold">Decline Log: </span>
                    <span>{assignment.declineReason}</span>
                  </div>
                )}

                <div className="rounded-xl bg-slate-950/40 p-3 border border-slate-800/60">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Operational Progression
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <div
                      className={`flex-1 text-center py-1 rounded ${
                        ['assigned', 'accepted', 'en_route', 'arrived', 'completed'].includes(
                          assignment.status
                        )
                          ? 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/40'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      1. Pending
                    </div>
                    <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                    <div
                      className={`flex-1 text-center py-1 rounded ${
                        ['accepted', 'en_route', 'arrived', 'completed'].includes(assignment.status)
                          ? 'bg-blue-600/30 text-blue-300 font-bold border border-blue-500/40'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      2. Accepted
                    </div>
                    <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                    <div
                      className={`flex-1 text-center py-1 rounded ${
                        ['en_route', 'arrived', 'completed'].includes(assignment.status)
                          ? 'bg-purple-600/30 text-purple-300 font-bold border border-purple-500/40'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      3. En Route
                    </div>
                    <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                    <div
                      className={`flex-1 text-center py-1 rounded ${
                        ['arrived', 'completed'].includes(assignment.status)
                          ? 'bg-amber-600/30 text-amber-300 font-bold border border-amber-500/40'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      4. On Scene
                    </div>
                    <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                    <div
                      className={`flex-1 text-center py-1 rounded ${
                        assignment.status === 'completed'
                          ? 'bg-emerald-600/30 text-emerald-300 font-bold border border-emerald-500/40'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      5. Completed
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-2">
                    {inc._id && (
                      <Link
                        to={`/incidents/${inc._id || inc.id}`}
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline font-medium"
                      >
                        <span>View Incident Details</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isPending && (
                      <>
                        <button
                          type="button"
                          disabled={submittingAction}
                          onClick={() => handleStatusUpdate(assignId, 'accepted')}
                          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-900/30 hover:bg-emerald-500 active:scale-95 transition disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Accept Assignment</span>
                        </button>
                        <button
                          type="button"
                          disabled={submittingAction}
                          onClick={() => setDeclineModalItem(assignment)}
                          className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900/50 active:scale-95 transition disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Decline</span>
                        </button>
                      </>
                    )}

                    {isAccepted && (
                      <button
                        type="button"
                        disabled={submittingAction}
                        onClick={() => handleStatusUpdate(assignId, 'en_route')}
                        className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-purple-900/30 hover:bg-purple-500 active:scale-95 transition disabled:opacity-50"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        <span>Mark En Route</span>
                      </button>
                    )}

                    {isEnRoute && (
                      <button
                        type="button"
                        disabled={submittingAction}
                        onClick={() => handleStatusUpdate(assignId, 'arrived')}
                        className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-amber-900/30 hover:bg-amber-500 active:scale-95 transition disabled:opacity-50"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        <span>Mark On Scene</span>
                      </button>
                    )}

                    {isArrived && (
                      <button
                        type="button"
                        disabled={submittingAction}
                        onClick={() => setCompleteModalItem(assignment)}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-900/30 hover:bg-emerald-500 active:scale-95 transition disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Complete Mission</span>
                      </button>
                    )}

                    {isActiveMission && (
                      <>
                        {isCurrentlySharingThis ? (
                          <button
                            type="button"
                            onClick={stopLiveLocation}
                            className="flex items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-950/50 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-900/60 transition"
                          >
                            <Square className="h-3.5 w-3.5" />
                            <span>Stop Sharing GPS</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConsentLocationItem(assignment)}
                            className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-950/40 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-900/50 transition"
                          >
                            <LocateFixed className="h-3.5 w-3.5" />
                            <span>Share Live Location</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {declineModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rose-500" />
                <span>Decline Mission Assignment</span>
              </h3>
              <button
                type="button"
                onClick={() => setDeclineModalItem(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to decline this assignment? Incident dispatch will be notified so the resource can be reallocated to another field responder.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase">
                Reason for Declining (Optional):
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g., Unavailable due to active shift, outside service area, mechanical issue..."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeclineModalItem(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={() =>
                  handleStatusUpdate(declineModalItem._id || declineModalItem.id, 'cancelled', {
                    declineReason: declineReason.trim(),
                  })
                }
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition disabled:opacity-50"
              >
                {submittingAction ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {completeModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span>Complete Mission Confirmation</span>
              </h3>
              <button
                type="button"
                onClick={() => setCompleteModalItem(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Confirm that all operational field tasks for this incident have been successfully executed and the mission is resolved.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase">
                Completion Notes / Debrief (Optional):
              </label>
              <textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="e.g., Casualties evacuated safely to medical shelter, sector stabilized..."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCompleteModalItem(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={() =>
                  handleStatusUpdate(completeModalItem._id || completeModalItem.id, 'completed', {
                    notes: completionNotes.trim(),
                  })
                }
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50"
              >
                {submittingAction ? 'Completing...' : 'Mark Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {consentLocationItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <LocateFixed className="h-5 w-5 text-blue-400" />
                <span>Live Location Consent</span>
              </h3>
              <button
                type="button"
                onClick={() => setConsentLocationItem(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              By activating live location sharing, your browser will read device GPS coordinates and send periodic updates to the CrisisAI operations dispatch center for this assignment.
            </p>

            <div className="rounded-xl bg-slate-950/70 p-3 border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 text-blue-300 font-semibold">
                <Shield className="h-3.5 w-3.5" />
                <span>Privacy & Safety Safeguards:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li>Tracking operates ONLY while actively working this mission.</li>
                <li>Location broadcast terminates immediately upon completion or decline.</li>
                <li>GPS data is strictly restricted to authorized dispatchers.</li>
                <li>You can stop sharing at any time with a single click.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConsentLocationItem(null)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => startLiveLocation(consentLocationItem)}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition"
              >
                Authorize & Start Sharing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
