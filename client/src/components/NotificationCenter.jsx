import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Truck,
  XCircle,
  CheckCircle2,
  ExternalLink,
  Clock,
  RefreshCw,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const ALERT_TYPE_CONFIG = {
  critical_incident: {
    icon: ShieldAlert,
    color: 'text-red-400',
    bg: 'bg-red-950/40 border-red-500/30',
    label: 'Critical Incident',
  },
  incident_verified: {
    icon: ShieldCheck,
    color: 'text-purple-400',
    bg: 'bg-purple-950/40 border-purple-500/30',
    label: 'Verified',
  },
  assignment_created: {
    icon: Truck,
    color: 'text-blue-400',
    bg: 'bg-blue-950/40 border-blue-500/30',
    label: 'Task Assigned',
  },
  assignment_declined: {
    icon: XCircle,
    color: 'text-rose-400',
    bg: 'bg-rose-950/40 border-rose-500/30',
    label: 'Task Declined',
  },
  incident_resolved: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/40 border-emerald-500/30',
    label: 'Resolved',
  },
};

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const { isConnected, subscribe, onReconnect } = useSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const containerRef = useRef(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/unread-count`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.count === 'number') {
          setUnreadCount(data.count);
        }
      }
    } catch (err) {
      console.warn('[NotificationCenter] Failed to fetch unread count:', err);
    }
  }, [token]);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/alerts?limit=30`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setAlerts(data.data);
        }
      } else {
        setErrorMessage('Failed to load notifications.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Network error.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchUnreadCount();
      fetchAlerts();
    } else {
      setAlerts([]);
      setUnreadCount(0);
    }
  }, [isAuthenticated, token, fetchUnreadCount, fetchAlerts]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const handleNewAlert = (payload) => {
      if (!payload) return;

      const newAlertItem = {
        _id: payload.alertId || payload.id,
        id: payload.alertId || payload.id,
        incidentId: payload.incidentId,
        type: payload.type || 'critical_incident',
        message: payload.message || 'Emergency notification received',
        readStatus: Boolean(payload.readStatus),
        createdAt: payload.createdAt || new Date().toISOString(),
      };

      setAlerts((prev) => {
        const exists = prev.some(
          (a) => (a._id || a.id).toString() === (newAlertItem._id || newAlertItem.id).toString()
        );
        if (exists) return prev;
        return [newAlertItem, ...prev];
      });

      setUnreadCount((c) => c + 1);
    };

    const unsubscribe = subscribe('alert:new', handleNewAlert);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isAuthenticated, token, subscribe]);

  useEffect(() => {
    if (!onReconnect) return;
    return onReconnect(() => {
      fetchUnreadCount();
      if (isOpen) {
        fetchAlerts();
      }
    });
  }, [onReconnect, fetchUnreadCount, fetchAlerts, isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchAlerts();
      fetchUnreadCount();
    }
  };

  const handleMarkAsRead = async (alertId, e) => {
    if (e) e.stopPropagation();
    if (!token || !alertId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/alerts/${alertId}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) =>
            (a._id || a.id).toString() === alertId.toString()
              ? { ...a, readStatus: true, readAt: new Date().toISOString() }
              : a
          )
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.warn('[NotificationCenter] Mark read failed:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/alerts/read-all`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => ({ ...a, readStatus: true, readAt: new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.warn('[NotificationCenter] Mark all read failed:', err);
    }
  };

  const handleAlertClick = (alert) => {
    const targetId = alert._id || alert.id;
    if (!alert.readStatus && targetId) {
      handleMarkAsRead(targetId);
    }

    const incidentId = alert.incidentId?._id || alert.incidentId;
    if (incidentId) {
      setIsOpen(false);
      navigate(`/incidents/${incidentId}`);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'unread') return !a.readStatus;
    return true;
  });

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id="notification-bell-btn"
        onClick={handleToggle}
        className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition focus:outline-none"
        title="Emergency Notifications"
        aria-label="Emergency Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white shadow-md shadow-red-950/60 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-700 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-xl z-50 text-slate-200 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider text-white">
                Emergency Alerts
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500/20 border border-red-500/40 px-2 py-0.2 text-[10px] font-bold text-red-400">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-white transition"
                  title="Mark all notifications as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                filter === 'all'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({alerts.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                filter === 'unread'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unread ({unreadCount})
            </button>
            <button
              type="button"
              onClick={fetchAlerts}
              className="ml-auto text-slate-400 hover:text-slate-200 p-1"
              title="Refresh alerts"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {isLoading && alerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <RefreshCw className="h-4 w-4 mx-auto animate-spin mb-1 text-slate-500" />
                Loading alerts...
              </div>
            ) : errorMessage ? (
              <div className="py-6 text-center text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 mx-auto mb-1" />
                {errorMessage}
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                <Bell className="h-5 w-5 mx-auto mb-1 text-slate-600 opacity-60" />
                No {filter === 'unread' ? 'unread ' : ''}emergency alerts.
              </div>
            ) : (
              filteredAlerts.map((alertItem) => {
                const alertId = alertItem._id || alertItem.id;
                const config = ALERT_TYPE_CONFIG[alertItem.type] || ALERT_TYPE_CONFIG.critical_incident;
                const IconComponent = config.icon;
                const isUnread = !alertItem.readStatus;

                return (
                  <div
                    key={alertId}
                    onClick={() => handleAlertClick(alertItem)}
                    className={`group relative rounded-xl border p-2.5 transition cursor-pointer flex gap-2.5 items-start ${
                      isUnread
                        ? 'border-red-500/30 bg-red-950/20 hover:bg-red-900/30'
                        : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${config.bg}`}>
                      <IconComponent className={`h-3.5 w-3.5 ${config.color}`} />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[11px] font-semibold uppercase tracking-wider ${config.color}`}>
                          {config.label}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-400">
                            {formatTime(alertItem.createdAt)}
                          </span>
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                        {alertItem.message}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                        {alertItem.incidentId ? (
                          <span className="flex items-center gap-1 text-red-400 group-hover:underline">
                            <span>View incident</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </span>
                        ) : <span />}

                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(alertId, e)}
                            className="flex items-center gap-1 text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition"
                            title="Mark as read"
                          >
                            <Check className="h-2.5 w-2.5" />
                            <span>Mark read</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

