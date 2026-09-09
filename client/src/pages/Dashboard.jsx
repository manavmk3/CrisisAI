import React, { useState } from 'react';
import {
  AlertTriangle,
  Layers,
  MapPin,
  ShieldCheck,
  Activity,
  Cpu,
  Clock,
  Filter,
  Plus,
  Sparkles,
  Truck,
  CheckCircle,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { useRole, ROLES, ROLE_CONFIG } from '../context/RoleContext';
import GlobeStudy from '@/components/ui/globe-study';

export default function Dashboard() {
  const { currentRole, ROLES } = useRole();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mock incidents reflecting Day 10-12 data model
  const mockIncidents = [
    {
      id: 'INC-8041',
      title: 'Flash Flood Trapping Residents in Sector 4',
      type: 'Flood',
      location: 'Riverside Ave, District 9',
      severity: 'CRITICAL',
      priorityScore: 94,
      affected: '~35 people',
      needs: ['Inflatable Boat', 'Medical Triage', 'Clean Water'],
      aiConfidence: '96%',
      status: 'Action Required',
      time: '4 mins ago',
      duplicateOf: null,
    },
    {
      id: 'INC-8039',
      title: 'Structural Collapse at Community Health Center',
      type: 'Structural Collapse',
      location: 'Oak & 5th Crossing',
      severity: 'CRITICAL',
      priorityScore: 91,
      affected: '~12 people',
      needs: ['Heavy Rescue Equipment', 'Ambulance Unit'],
      aiConfidence: '92%',
      status: 'Dispatched',
      time: '18 mins ago',
      duplicateOf: null,
    },
    {
      id: 'INC-8038',
      title: 'Wildfire Approaching Western Residential Perimeter',
      type: 'Fire',
      location: 'Pine Ridge Suburb',
      severity: 'HIGH',
      priorityScore: 82,
      affected: '~250 evacuated',
      needs: ['Evacuation Transport', 'N95 Respirators'],
      aiConfidence: '95%',
      status: 'Open',
      time: '32 mins ago',
      duplicateOf: null,
    },
    {
      id: 'INC-8032',
      title: 'Submerged Vehicle on Highway 12 Overpass',
      type: 'Flood',
      location: 'Hwy 12, KM 14',
      severity: 'MEDIUM',
      priorityScore: 68,
      affected: '2 individuals',
      needs: ['Tow Rig', 'Paramedic Unit'],
      aiConfidence: '88%',
      status: 'Triaged',
      time: '45 mins ago',
      duplicateOf: 'INC-8031 (Merged)',
    },
  ];

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const roleInfo = ROLE_CONFIG[currentRole];

  return (
    <div className="relative min-h-screen">

      {/* ── 3D Rotating Globe Background ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        {/* The iframe needs pointer-events to initialise its canvas */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <GlobeStudy mode="dark" opacity={0.80} />
        </div>
        {/* Vignette overlay keeps dashboard cards legible */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(160deg, rgba(11,15,25,0.60) 0%, rgba(11,15,25,0.25) 50%, rgba(11,15,25,0.65) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ── Dashboard content (above globe) ── */}
      <div className="relative space-y-6 pb-8" style={{ zIndex: 1 }}>

      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Operations Dashboard
            </h1>
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${roleInfo.badgeColor}`}>
              {roleInfo.name} View
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time emergency triage, AI extraction queue, and responder coordination.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-850 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-red-400' : ''}`} />
            <span>Sync Live Feed</span>
          </button>

          <button
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-red-900/30 hover:bg-red-500 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Log Incident</span>
          </button>
        </div>
      </div>

      {/* Role specific notification banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
          <span className="text-slate-300">
            Current role preview: <strong className="text-white">{roleInfo.name}</strong>. Switch role in the top-right navbar to view role-specific navigation and perspectives.
          </span>
        </div>
        <span className="hidden md:inline-block font-mono text-[11px] text-slate-400">
          Vite + React Router Active
        </span>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Critical Incidents</span>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">4</span>
            <span className="text-xs text-red-400 font-semibold">Immediate Action</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Calculated Priority &gt; 85/100</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>AI Extraction Confidence</span>
            <Cpu className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">93.8%</span>
            <span className="text-xs text-emerald-400 font-semibold">+1.2% this week</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Gemini 1.5 Flash structured parse</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Available Resources</span>
            <Truck className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">28</span>
            <span className="text-xs text-slate-400">Units Ready</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Haversine geo-radius &lt; 15 km</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Duplicates Flagged</span>
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">12</span>
            <span className="text-xs text-amber-400 font-semibold">Saved dispatch cycles</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Text + Geo + Time similarity</p>
        </div>
      </div>

      {/* Main Content Grid: Incident Triage Table + Map/Resource Teasers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left 2 Cols: Triage Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="h-4 w-4 text-red-400" />
                  Live Triage & Priority Queue
                </h2>
                <p className="text-xs text-slate-400">
                  Ranked by dynamic multi-factor scoring (Day 10-12 Preview)
                </p>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 text-xs">
                {['ALL', 'CRITICAL', 'HIGH'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${activeFilter === f
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Incidents List */}
            <div className="divide-y divide-slate-800/80 mt-2">
              {mockIncidents
                .filter((inc) => activeFilter === 'ALL' || inc.severity === activeFilter)
                .map((inc) => (
                  <div key={inc.id} className="py-3.5 space-y-2 group hover:bg-slate-800/20 px-2 rounded-lg transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-400 font-semibold">{inc.id}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${inc.severity === 'CRITICAL'
                              ? 'bg-red-950/80 text-red-400 border-red-800/50'
                              : inc.severity === 'HIGH'
                                ? 'bg-amber-950/80 text-amber-400 border-amber-800/50'
                                : 'bg-blue-950/80 text-blue-400 border-blue-800/50'
                            }`}>
                            {inc.severity}
                          </span>
                          <span className="text-[10px] text-slate-400">{inc.time}</span>
                        </div>
                        <h3 className="text-xs font-semibold text-white group-hover:text-red-400 transition">
                          {inc.title}
                        </h3>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-500" />
                            {inc.location}
                          </span>
                          <span>•</span>
                          <span>Affected: <strong className="text-slate-300">{inc.affected}</strong></span>
                        </div>
                      </div>

                      {/* Priority Score Gauge */}
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-bold text-red-400">
                          {inc.priorityScore}<span className="text-[10px] text-slate-500">/100</span>
                        </div>
                        <span className="text-[10px] text-slate-500 block">Priority Score</span>
                      </div>
                    </div>

                    {/* Needs Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {inc.needs.map((need) => (
                        <span key={need} className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                          {need}
                        </span>
                      ))}
                      <span className="ml-auto text-[10px] text-purple-400 font-mono flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5" />
                        AI: {inc.aiConfidence}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Live Map Preview + Quick Allocation Teasers */}
        <div className="space-y-4">

          {/* Map Teaser (Day 18 Foundation) */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                <MapPin className="h-4 w-4 text-emerald-400" />
                Live Crisis Map
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                Leaflet (Day 18)
              </span>
            </div>

            {/* Map Placeholder Graphic */}
            <div className="h-44 rounded-lg border border-slate-800 bg-[#080d1a] relative overflow-hidden flex flex-col items-center justify-center text-center p-4">
              <div className="absolute inset-0 opacity-20 bg-grid-pattern pointer-events-none"></div>

              {/* Simulated Map Markers */}
              <div className="absolute top-8 left-10 h-3 w-3 rounded-full bg-red-500 animate-ping"></div>
              <div className="absolute top-8 left-10 h-3 w-3 rounded-full bg-red-600 shadow-md"></div>

              <div className="absolute bottom-10 right-14 h-3 w-3 rounded-full bg-blue-500 shadow-md"></div>
              <div className="absolute top-16 right-20 h-3 w-3 rounded-full bg-emerald-500 shadow-md"></div>

              <div className="relative z-10 space-y-1">
                <p className="text-xs font-semibold text-slate-200">OpenStreetMap + Leaflet</p>
                <p className="text-[11px] text-slate-400 max-w-xs">
                  Interactive disaster coordinates, shelters, and mobile responder GPS telemetry.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Layers: Incidents, Shelters, Teams</span>
              <span className="text-red-400 font-medium">3 Hotspots</span>
            </div>
          </div>

          {/* AI Decision Support Teaser (Day 7-9 & Day 27) */}
          <div className="rounded-xl border border-purple-900/30 bg-purple-950/10 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span>AI Situation Briefing</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              "Sector 4 flooding has accelerated by 25%. Heavy rescue boat allocation to Riverside Ave is recommended with highest urgency. 2 duplicate reports merged."
            </p>
            <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Model: Gemini 1.5 Flash</span>
              <span className="text-emerald-400">Validation Passed</span>
            </div>
          </div>

        </div>

      </div>

      {/* close content wrapper */}
      </div>

    </div>
  );
}
