import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldAlert, 
  Activity, 
  Cpu, 
  Users, 
  ArrowRight, 
  CheckCircle2, 
  Radio, 
  Layers, 
  Building2,
  ChevronRight
} from 'lucide-react';
import { useRole, ROLES, ROLE_CONFIG } from '../context/RoleContext';
import ResponsiveHeroBanner from '../components/ui/responsive-hero-banner';
import Footer from '../components/layout/Footer';

export default function Home() {
  const { currentRole, setCurrentRole } = useRole();

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
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      <ResponsiveHeroBanner />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-400" />
              Role-Based Portals & Dashboards
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Tailored interfaces built for citizens in distress, field volunteers, and command authorities.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

      <Footer />
    </div>
  );
}
