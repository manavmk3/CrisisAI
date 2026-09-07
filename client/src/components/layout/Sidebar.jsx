import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  AlertTriangle, 
  MapPin, 
  Layers, 
  Users, 
  Cpu, 
  Radio, 
  FileText, 
  Shield, 
  Navigation, 
  BarChart3, 
  Truck, 
  PhoneCall, 
  Sliders, 
  X,
  ChevronRight
} from 'lucide-react';
import { useRole, ROLES, ROLE_CONFIG } from '../../context/RoleContext';

export default function Sidebar({ isOpen, onClose }) {
  const { currentRole, setCurrentRole, ROLES } = useRole();
  const location = useLocation();

  // Role-specific navigation items
  const navItemsByRole = {
    [ROLES.CITIZEN]: [
      { label: 'Submit Emergency Report', path: '/report', icon: AlertTriangle, highlight: true },
      { label: 'My Submitted Reports', path: '/dashboard?view=my-reports', icon: FileText },
      { label: 'Nearby Safe Shelters', path: '/dashboard?view=shelters', icon: MapPin },
      { label: 'Emergency Hotlines', path: '/dashboard?view=hotlines', icon: PhoneCall },
    ],
    [ROLES.RESPONDER]: [
      { label: 'Assigned Missions', path: '/dashboard?view=missions', icon: Shield, badge: '3 Active' },
      { label: 'Task Status & En Route', path: '/dashboard?view=status', icon: Navigation },
      { label: 'Responder Fleet Location', path: '/dashboard?view=fleet', icon: MapPin },
      { label: 'Field Radio & Comms', path: '/dashboard?view=comms', icon: Radio },
    ],
    [ROLES.AUTHORITY]: [
      { label: 'Command Overview', path: '/dashboard', icon: Layers },
      { label: 'Priority Incident Triage', path: '/dashboard?view=triage', icon: AlertTriangle, badge: 'Live AI' },
      { label: 'Live Crisis Map', path: '/dashboard?view=map', icon: MapPin },
      { label: 'Resource Allocation', path: '/dashboard?view=resources', icon: Truck },
      { label: 'Incident Verification', path: '/dashboard?view=verify', icon: Shield },
    ],
    [ROLES.ADMIN]: [
      { label: 'Operations Overview', path: '/dashboard', icon: Layers },
      { label: 'User & Agency Directory', path: '/dashboard?view=users', icon: Users },
      { label: 'AI Analytics & Latency', path: '/dashboard?view=ai-metrics', icon: Cpu },
      { label: 'Priority Scoring Engine', path: '/dashboard?view=scoring-config', icon: Sliders },
      { label: 'Audit Trail & Logs', path: '/dashboard?view=logs', icon: BarChart3 },
    ],
  };

  const navItems = navItemsByRole[currentRole] || navItemsByRole[ROLES.AUTHORITY];
  const roleInfo = ROLE_CONFIG[currentRole];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-16 bottom-0 left-0 z-40 w-64 border-r border-slate-800 bg-[#0b0f19] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header / Active Role Banner */}
        <div className="p-4 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="font-semibold uppercase tracking-wider text-[11px]">Role Portal</span>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden text-slate-400 hover:text-white p-1 rounded-md"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-900/80 p-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-xs tracking-tight">
                {roleInfo?.name}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${roleInfo?.badgeColor}`}>
                Active
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 leading-snug">
              {roleInfo?.description}
            </p>
          </div>
        </div>

        {/* Role navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-2 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Navigation Menu
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isCurrent = location.pathname + location.search === item.path;

            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => onClose && onClose()}
                className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition ${
                  item.highlight
                    ? 'bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30'
                    : isCurrent
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`h-4 w-4 shrink-0 ${item.highlight ? 'text-red-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge ? (
                  <span className="shrink-0 rounded-full bg-red-950 px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-800/50">
                    {item.badge}
                  </span>
                ) : (
                  <ChevronRight className="h-3 w-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </Link>
            );
          })}
        </div>

      </aside>
    </>
  );
}
