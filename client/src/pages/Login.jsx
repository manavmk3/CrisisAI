import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Mail, ArrowRight, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { useRole, ROLES } from '../context/RoleContext';
import authBg from '../assets/auth-bg.jpg';

export default function Login() {
  const navigate = useNavigate();
  const { setCurrentRole } = useRole();
  const [email, setEmail] = useState('authority@crisisai.org');
  const [password, setPassword] = useState('CrisisAI@2026');
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
    <div className="relative min-h-[calc(100vh-140px)] flex items-center justify-center py-8 px-4 sm:px-6 overflow-hidden rounded-3xl border border-slate-800/60 shadow-2xl">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img
          src={authBg}
          alt="Crisis background"
          className="w-full h-full object-cover object-center brightness-90 contrast-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060a15] via-[#060a15]/50 to-[#060a15]/60" />
        <div className="absolute inset-0 bg-blue-950/20 mix-blend-color-dodge" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/25 rounded-full blur-[140px]" />
      </div>

      <div className="relative w-full max-w-md z-10 my-4">
        <div className="relative rounded-3xl border border-blue-400/25 bg-[#090e1a]/80 p-7 sm:p-9 shadow-[0_0_60px_-10px_rgba(37,99,235,0.4)] backdrop-blur-xl transition-all duration-300">
          
          <div className="space-y-1.5 mb-7">
            <span className="text-[11px] font-semibold tracking-wider text-blue-400 uppercase">
              Login your account
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">
              Welcome Back!
            </h1>
            <p className="text-xs text-slate-300 font-light">
              Enter your email and password to access CrisisAI.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-200">
                Email address
              </label>
              <div className="group relative rounded-2xl border border-slate-700/80 bg-slate-950/70 transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:shadow-[0_0_20px_-3px_rgba(59,130,246,0.4)]">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@crisisai.org"
                  className="w-full bg-transparent py-3 pl-11 pr-4 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none"
                />
              </div>
            </div>

            <div className="space-y-2 relative">
              <div className="relative">
                <div className="absolute -inset-1 rounded-2xl bg-blue-600/25 blur-lg opacity-80 pointer-events-none" />
                
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-200">
                    Password
                  </label>
                </div>
                
                <div className="group relative rounded-2xl border border-slate-700/80 bg-slate-950/75 transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:shadow-[0_0_25px_-3px_rgba(59,130,246,0.5)]">
                  <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-transparent py-3 pl-11 pr-4 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Remember me</span>
                </label>
                <a href="#forgot" className="text-xs text-blue-400 hover:text-blue-300 font-medium transition underline-offset-4 hover:underline">
                  Forgot Password?
                </a>
              </div>
            </div>

            <div className="relative pt-2">
              <div className="absolute -inset-1 rounded-2xl bg-blue-600/30 blur-xl opacity-70 pointer-events-none" />
              <button
                type="submit"
                disabled={loading}
                className="relative w-full rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 py-3.5 text-xs sm:text-sm font-semibold text-white shadow-[0_0_25px_-5px_rgba(59,130,246,0.5)] hover:from-blue-500 hover:via-indigo-500 hover:to-blue-400 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                {loading ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="pt-6 mt-6 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Quick Demo Accounts
              </span>
              <span className="text-[10px] text-blue-400/90 flex items-center gap-1 font-medium">
                <Sparkles className="h-3 w-3" /> 1-Click Role Switch
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((demo) => {
                const active = roleSelection === demo.role;
                return (
                  <button
                    key={demo.role}
                    type="button"
                    onClick={() => handleQuickSelect(demo)}
                    className={`text-left p-2.5 rounded-xl border text-xs transition-all duration-200 cursor-pointer ${
                      active
                        ? 'border-blue-400 bg-blue-950/60 text-white shadow-[0_0_15px_-3px_rgba(59,130,246,0.4)]'
                        : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-[11px] truncate flex items-center gap-1">
                      {active && <CheckCircle2 className="h-3 w-3 text-blue-400 inline shrink-0" />}
                      <span>{demo.label}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">{demo.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-center text-xs text-slate-400 pt-5 mt-2 border-t border-slate-800/60">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-blue-400 hover:text-blue-300 transition">
              Create account
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
