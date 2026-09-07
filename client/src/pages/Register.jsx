import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Building, ArrowRight, ShieldCheck } from 'lucide-react';
import { useRole, ROLES, ROLE_CONFIG } from '../context/RoleContext';

export default function Register() {
  const navigate = useNavigate();
  const { setCurrentRole } = useRole();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: ROLES.CITIZEN,
    organization: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setCurrentRole(formData.role);
    setTimeout(() => {
      setLoading(false);
      navigate('/dashboard');
    }, 600);
  };

  return (
    <div className="max-w-lg mx-auto py-8 sm:py-12 space-y-6">
      
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400 mb-1">
          <UserPlus className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Create an Account
        </h1>
        <p className="text-xs text-slate-400">
          Join the CrisisAI network to report, respond, or coordinate emergency actions.
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                required
                placeholder="Dr. Alex Rivera"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                placeholder="alex.rivera@disaster-agency.gov"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Role selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Role on Platform</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(ROLES).map((r) => {
                const info = ROLE_CONFIG[r];
                const selected = formData.role === r;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setFormData({ ...formData, role: r })}
                    className={`text-left p-2.5 rounded-xl border text-xs transition ${
                      selected
                        ? 'border-red-500 bg-red-950/30 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold">{info.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{r}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Organization or Jurisdiction (Optional)</label>
            <div className="relative">
              <Building className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="e.g. Red Cross, County Fire Dept, or Independent"
                value={formData.organization}
                onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 py-3 text-xs font-bold text-white shadow-lg shadow-red-900/30 hover:bg-red-500 active:scale-[0.98] transition flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400 pt-2">
          Already have an authorized account?{' '}
          <Link to="/login" className="font-semibold text-red-400 hover:text-red-300">
            Sign in
          </Link>
        </div>
      </div>

    </div>
  );
}
