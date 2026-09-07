import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, KeyRound, Mail, ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useRole, ROLES } from '../context/RoleContext';

export default function Login() {
  const navigate = useNavigate();
  const { setCurrentRole } = useRole();
  const [email, setEmail] = useState('authority@crisisai.org');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState(ROLES.AUTHORITY);

  const demoAccounts = [
    { role: ROLES.AUTHORITY, label: 'Authority Admin', email: 'authority@crisisai.org', desc: 'Command triage & allocation' },
    { role: ROLES.RESPONDER, label: 'Volunteer Responder', email: 'responder@crisisai.org', desc: 'Field tasks & mobile GPS' },
    { role: ROLES.CITIZEN, label: 'Citizen Reporter', email: 'citizen@crisisai.org', desc: 'Report & nearby shelters' },
    { role: ROLES.ADMIN, label: 'System Admin', email: 'admin@crisisai.org', desc: 'System configuration' },
  ];

  const handleQuickSelect = (demo) => {
    setEmail(demo.email);
    setPassword('CrisisAI@2026');
    setRoleSelection(demo.role);
    setCurrentRole(demo.role);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setCurrentRole(roleSelection);
    setTimeout(() => {
      setLoading(false);
      navigate('/dashboard');
    }, 600);
  };

  return (
    <div className="max-w-md mx-auto py-8 sm:py-12 space-y-6">
      
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400 mb-1">
          <LogIn className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Sign In to CrisisAI
        </h1>
        <p className="text-xs text-slate-400">
          Enter credentials to access the disaster coordination operations dashboard.
        </p>
      </div>

      {/* Login Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Email Address</span>
              <span className="text-[11px] text-slate-500 font-normal">Agency or Personal</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@agency.org"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Password</label>
              <a href="#forgot" className="text-[11px] text-red-400 hover:text-red-300">
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded border-slate-700 bg-slate-900 text-red-600 focus:ring-red-500" />
              <span>Remember this session</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 py-3 text-xs font-bold text-white shadow-lg shadow-red-900/30 hover:bg-red-500 active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
            ) : (
              <>
                <span>Sign In & Authorize</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo Roles Quick Pick */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Quick-Demo Credentials (Day 2 Scaffold):
          </p>
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map((demo) => (
              <button
                key={demo.role}
                type="button"
                onClick={() => handleQuickSelect(demo)}
                className={`text-left p-2 rounded-lg border text-xs transition ${
                  roleSelection === demo.role
                    ? 'border-red-500/50 bg-red-950/30 text-white'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-400'
                }`}
              >
                <div className="font-semibold text-slate-200 text-[11px]">{demo.label}</div>
                <div className="text-[10px] text-slate-500 truncate">{demo.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 pt-2">
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold text-red-400 hover:text-red-300">
            Register here
          </Link>
        </div>
      </div>

    </div>
  );
}
