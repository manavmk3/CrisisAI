import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Wrench,
  Package,
  Loader2,
  X,
  Database,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const RESOURCE_TYPES = [
  'ambulance',
  'medical_team',
  'fire_rescue',
  'search_rescue',
  'food',
  'drinking_water',
  'shelter',
  'rescue_boat',
  'police',
  'evacuation_team',
];

const RESOURCE_STATUSES = ['available', 'deployed', 'maintenance'];

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
};

const STATUS_CONFIG = {
  available: {
    label: 'Available',
    icon: CheckCircle,
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/60 border-emerald-800/40',
    dot: 'bg-emerald-400',
  },
  deployed: {
    label: 'Deployed',
    icon: Truck,
    color: 'text-blue-400',
    bg: 'bg-blue-950/60 border-blue-800/40',
    dot: 'bg-blue-400 animate-pulse',
  },
  maintenance: {
    label: 'Maintenance',
    icon: Wrench,
    color: 'text-amber-400',
    bg: 'bg-amber-950/60 border-amber-800/40',
    dot: 'bg-amber-400',
  },
};

const CAN_MANAGE = ['authority', 'admin'];

function ResourceCard({ resource }) {
  const sc = STATUS_CONFIG[resource.status] || STATUS_CONFIG.available;
  const StatusIcon = sc.icon;

  const utilPct =
    resource.quantity > 0
      ? Math.round((resource.availableQuantity / resource.quantity) * 100)
      : 0;

  return (
    <div
      className="glass-card rounded-xl border border-slate-800 p-4 flex flex-col gap-3 hover:border-slate-700 transition-colors"
      id={`resource-card-${resource._id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{resource.name}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {TYPE_LABELS[resource.type] || resource.type}
          </p>
        </div>
        <span
          className={`shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
          {sc.label}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>
            Available:{' '}
            <span className="font-semibold text-white">{resource.availableQuantity}</span>
            <span className="mx-1">/</span>
            <span className="text-slate-500">{resource.quantity} total</span>
          </span>
          <span className={utilPct >= 70 ? 'text-emerald-400' : utilPct >= 30 ? 'text-amber-400' : 'text-red-400'}>
            {utilPct}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              utilPct >= 70 ? 'bg-emerald-500' : utilPct >= 30 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${utilPct}%` }}
          />
        </div>
      </div>

      {resource.location && (
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{resource.location}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800 pt-2">
        <span className="font-mono">{resource._id?.slice(-8)}</span>
        <span>
          {new Date(resource.createdAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      </div>
    </div>
  );
}

function CreateResourceForm({ token, onCreated, onClose }) {
  const [form, setForm] = useState({
    name: '',
    type: 'ambulance',
    quantity: '',
    availableQuantity: '',
    status: 'available',
    location: '',
    description: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const qty = parseInt(form.quantity, 10);
    const avail = form.availableQuantity === '' ? qty : parseInt(form.availableQuantity, 10);

    if (!form.name.trim()) return setError('Name is required.');
    if (isNaN(qty) || qty < 0) return setError('Quantity must be a non-negative integer.');
    if (isNaN(avail) || avail < 0) return setError('Available quantity must be a non-negative integer.');
    if (avail > qty) return setError('Available quantity cannot exceed total quantity.');

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/resources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          quantity: qty,
          availableQuantity: avail,
          status: form.status,
          location: form.location.trim(),
          description: form.description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to create resource.');
      } else {
        onCreated(data.data);
        onClose();
      }
    } catch (err) {
      setError('Network error. Please check the server is running.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition';
  const labelCls = 'block text-[11px] font-medium text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-slate-700 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Plus className="h-4 w-4 text-blue-400" />
            Register New Resource
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
            id="close-create-resource-form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800/40 bg-red-950/40 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3" id="create-resource-form">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Resource Name *</label>
              <input
                id="resource-name-input"
                className={inputCls}
                placeholder="e.g. Ambulance Unit Alpha"
                value={form.name}
                onChange={set('name')}
                maxLength={100}
              />
            </div>

            <div>
              <label className={labelCls}>Type *</label>
              <div className="relative">
                <select
                  id="resource-type-select"
                  className={`${inputCls} pr-8 appearance-none`}
                  value={form.type}
                  onChange={set('type')}
                >
                  {RESOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Status</label>
              <div className="relative">
                <select
                  id="resource-status-select"
                  className={`${inputCls} pr-8 appearance-none`}
                  value={form.status}
                  onChange={set('status')}
                >
                  {RESOURCE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_CONFIG[s]?.label || s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Total Quantity *</label>
              <input
                id="resource-quantity-input"
                type="number"
                min={0}
                step={1}
                className={inputCls}
                placeholder="e.g. 5"
                value={form.quantity}
                onChange={set('quantity')}
              />
            </div>

            <div>
              <label className={labelCls}>Available Quantity</label>
              <input
                id="resource-available-quantity-input"
                type="number"
                min={0}
                step={1}
                className={inputCls}
                placeholder="Defaults to total"
                value={form.availableQuantity}
                onChange={set('availableQuantity')}
              />
            </div>

            <div className="col-span-2">
              <label className={labelCls}>Location</label>
              <input
                id="resource-location-input"
                className={inputCls}
                placeholder="e.g. District 4 Base Station"
                value={form.location}
                onChange={set('location')}
                maxLength={300}
              />
            </div>

            <div className="col-span-2">
              <label className={labelCls}>Description (optional)</label>
              <input
                id="resource-description-input"
                className={inputCls}
                placeholder="Brief description"
                value={form.description}
                onChange={set('description')}
                maxLength={500}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition"
              id="cancel-create-resource"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white transition"
              id="submit-create-resource"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {loading ? 'Registering…' : 'Register Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Resources() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated } = useAuth();

  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const canManage = isAuthenticated && CAN_MANAGE.includes(user?.role);

  const fetchResources = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterStatus) params.set('status', filterStatus);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${API_BASE_URL}/resources${qs}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        setResources(data.data);
        setError('');
      } else {
        setError(data.message || 'Failed to load resources.');
      }
    } catch {
      setError('Could not connect to the server. Please check that the backend is running.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    setLoading(true);
    fetchResources();
  }, [fetchResources]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchResources();
  };

  const handleCreated = (newResource) => {
    setResources((prev) => [newResource, ...prev]);
  };

  const totalAvail = resources.reduce((acc, r) => acc + (r.availableQuantity || 0), 0);
  const totalUnits = resources.reduce((acc, r) => acc + (r.quantity || 0), 0);
  const deployedCount = resources.filter((r) => r.status === 'deployed').length;
  const maintenanceCount = resources.filter((r) => r.status === 'maintenance').length;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Truck className="h-6 w-6 text-blue-400" />
            Resource Inventory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Emergency resource registry — MongoDB backed, real-time data.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-resources-btn"
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-850 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>

          {canManage && (
            <button
              id="add-resource-btn"
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-900/30 hover:bg-blue-500 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Resource
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Resources</span>
            <Package className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-white">{resources.length}</div>
          <p className="mt-1 text-[11px] text-slate-400">{totalUnits} total units</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Units</span>
            <CheckCircle className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-400">{totalAvail}</div>
          <p className="mt-1 text-[11px] text-slate-400">Ready for deployment</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Deployed</span>
            <Truck className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-blue-400">{deployedCount}</div>
          <p className="mt-1 text-[11px] text-slate-400">Resources in the field</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Maintenance</span>
            <Wrench className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-400">{maintenanceCount}</div>
          <p className="mt-1 text-[11px] text-slate-400">Resources offline</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Filter:</span>

        <div className="relative">
          <select
            id="filter-type-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900/70 pl-3 pr-8 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 appearance-none transition"
          >
            <option value="">All Types</option>
            {RESOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            id="filter-status-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900/70 pl-3 pr-8 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 appearance-none transition"
          >
            <option value="">All Statuses</option>
            {RESOURCE_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        </div>

        {(filterType || filterStatus) && (
          <button
            id="clear-filters-btn"
            onClick={() => { setFilterType(''); setFilterStatus(''); }}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-600 transition"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {isAuthenticated && !canManage && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          Your role (<strong className="text-white">{user?.role}</strong>) has read-only access to the
          resource inventory. Contact an authority or administrator to register or update resources.
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm">Loading resource inventory…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-white">Failed to load resources</p>
          <p className="text-xs text-slate-400 max-w-sm text-center">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-2 rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 transition"
          >
            Try Again
          </button>
        </div>
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <Database className="h-10 w-10 text-slate-600" />
          <p className="text-sm font-semibold text-white">No resources found</p>
          <p className="text-xs text-slate-400 text-center max-w-xs">
            {filterType || filterStatus
              ? 'No resources match your current filters. Try clearing them.'
              : 'The resource inventory is empty. An authority or administrator can register the first resource.'}
          </p>
          {canManage && !filterType && !filterStatus && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Resource
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {resources.map((r) => (
            <ResourceCard key={r._id} resource={r} />
          ))}
        </div>
      )}

      {showCreateForm && (
        <CreateResourceForm
          token={token}
          onCreated={handleCreated}
          onClose={() => setShowCreateForm(false)}
        />
      )}
    </div>
  );
}
