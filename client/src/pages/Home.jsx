import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldAlert, 
  Activity, 
  Cpu, 
  MapPin, 
  Users, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  Radio, 
  Layers, 
  Clock, 
  Building2,
  ChevronRight
} from 'lucide-react';
import { useRole, ROLES, ROLE_CONFIG } from '../context/RoleContext';

export default function Home() {
  const { currentRole, setCurrentRole } = useRole();


  const quickStats = [
    { label: 'Active Incidents', value: '38', change: '+4 in last hr', icon: Activity, color: 'text-red-400' },
    { label: 'AI Extraction Latency', value: '1.4s', change: 'Gemini 1.5 Flash', icon: Cpu, color: 'text-amber-400' },
    { label: 'Responders En Route', value: '124', change: '89% availability', icon: Users, color: 'text-blue-400' },
    { label: 'Open Shelters & Hubs', value: '16', change: 'Capacity: 4,800', icon: Building2, color: 'text-emerald-400' },
  ];

  const rolePortals = [
    {
      role: ROLES.CITIZEN,
      title: 'Citizen Portal',
      desc: 'Quickly broadcast emergency alerts, request food/medical support, and discover verified safe shelters nearby.',
      link: '/report',
      actionText: 'Submit Emergency Report',
      features: ['One-touch emergency beacon', 'Offline emergency checklist', 'Family status check'],
    },
    {
      role: ROLES.RESPONDER,
      title: 'Responder Dispatch',
      desc: 'Access assigned field operations, update team arrival status, and transmit real-time telemetry from disaster zones.',
      link: '/dashboard',
      actionText: 'Open Missions Feed',
      features: ['Turn-by-turn routing clues', 'Resource demand checklist', 'Direct radio comms'],
    },
    {
      role: ROLES.AUTHORITY,
      title: 'Incident Command',
      desc: 'Verify incoming reports, evaluate explainable priority scores, and dynamically dispatch heavy rescue teams and supplies.',
      link: '/dashboard',
      actionText: 'Launch Command Hub',
      features: ['Dynamic priority triage (0-100)', 'Leaflet live disaster map', 'Smart resource ranking'],
    },
    {
      role: ROLES.ADMIN,
      title: 'Agency Administration',
      desc: 'Govern emergency responder organizations, inspect LLM extraction accuracy, and fine-tune priority scoring weights.',
      link: '/dashboard',
      actionText: 'System Configuration',
      features: ['Audit trails & compliance', 'AI validation monitoring', 'Cross-agency provisioning'],
    },
  ];

  return (
    <div className="space-y-12 pb-12">
      
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 via-slate-900/50 to-[#0b0f19] p-6 sm:p-10 lg:p-12 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-950/40 px-3.5 py-1 text-xs font-semibold text-red-300">
            <Radio className="h-3.5 w-3.5 animate-pulse text-red-400" />
            <span>CrisisAI Core • Rapid Response Engine</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            AI-Powered Disaster Response & <span className="bg-gradient-to-r from-red-500 via-rose-400 to-amber-400 bg-clip-text text-transparent">Resource Coordination</span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            CrisisAI converts unstructured natural-language distress calls into structured incidents, calculates explainable priority scores, eliminates duplicates, and matches field responders with verified needs in seconds.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              to="/report"
              className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-red-900/40 hover:bg-red-500 active:scale-95 transition"
            >
              <ShieldAlert className="h-4 w-4" />
              Report an Emergency
            </Link>

            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <span>Explore Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <span className="text-xs text-slate-400 pl-2">
              Viewing as: <strong className="text-red-400 capitalize">{currentRole}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* Real-time Ticker / Operational Highlights */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="glass-card rounded-xl p-4 border border-slate-800 hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{stat.label}</span>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-white">{stat.value}</span>
                <span className="text-[11px] font-medium text-slate-400">{stat.change}</span>
              </div>
            </div>
          );
        })}
      </section>


      {/* Role Portals Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-400" />
              Role-Based Portals & Dashboards
            </h2>
            <p className="text-xs text-slate-400">
              Tailored interfaces built for citizens in distress, field volunteers, and command authorities.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rolePortals.map((portal) => {
            const isCurrent = currentRole === portal.role;
            return (
              <div
                key={portal.role}
                className={`rounded-2xl border p-5 sm:p-6 transition flex flex-col justify-between ${
                  isCurrent
                    ? 'border-red-500/40 bg-slate-900/90 shadow-xl shadow-red-950/20'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      {portal.title}
                      {isCurrent && (
                        <span className="text-[10px] font-semibold bg-red-950 border border-red-800/40 text-red-400 px-2 py-0.5 rounded-full">
                          Currently Active
                        </span>
                      )}
                    </h3>
                    <button
                      onClick={() => setCurrentRole(portal.role)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                        isCurrent 
                          ? 'border-red-500/40 text-red-300 bg-red-950/40' 
                          : 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {isCurrent ? 'Selected' : 'Simulate Role'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {portal.desc}
                  </p>

                  <ul className="space-y-1.5 pt-1">
                    {portal.features.map((feat) => (
                      <li key={feat} className="text-xs text-slate-400 flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-5 mt-4 border-t border-slate-800/60">
                  <Link
                    to={portal.link}
                    onClick={() => setCurrentRole(portal.role)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 transition"
                  >
                    <span>{portal.actionText}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>


    </div>
  );
}
