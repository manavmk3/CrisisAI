import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Building, ShieldCheck, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useRole, ROLES, ROLE_CONFIG } from '../context/RoleContext';
import authBg from '../assets/auth-bg.jpg';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!formData.email.trim()) {
      setError('Please enter a valid email address.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          role: formData.role,
          agency: formData.organization.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || (data.error && data.error.message) || 'Registration failed. Please try again.');
      }

      setCurrentRole(formData.role);
      setSuccess(`Account registered successfully for ${data.data?.user?.name || formData.name}! You can now sign in.`);
      
      setFormData((prev) => ({
        ...prev,
        password: '',
        confirmPassword: '',
      }));
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError('Unable to connect to CrisisAI server. Please ensure the backend is running at http://localhost:8000.');
      } else {
        setError(err.message || 'An unexpected error occurred during registration.');
      }
    } finally {
      setLoading(false);
    }
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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] bg-blue-600/25 rounded-full blur-[140px]" />
      </div>

      <div className="relative w-full max-w-lg z-10 my-4">
        <div className="relative rounded-3xl border border-blue-400/25 bg-[#090e1a]/80 p-7 sm:p-9 shadow-[0_0_60px_-10px_rgba(37,99,235,0.4)] backdrop-blur-xl transition-all duration-300">
          
          <div className="space-y-1.5 mb-6">
            <span className="text-[11px] font-semibold tracking-wider text-blue-400 uppercase">
              Create your account
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">
              Join CrisisAI
            </h1>
            <p className="text-xs text-slate-300 font-light">
              Join the emergency network to report, respond, or coordinate actions.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-2xl border border-red-500/40 bg-red-950/60 p-3.5 text-xs text-red-300 flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {success && (
            <div className="mb-5 rounded-2xl border border-emerald-500/40 bg-emerald-950/60 p-4 text-xs text-emerald-300 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed font-medium">{success}</div>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-950/40 hover:from-emerald-500 hover:to-teal-500 transition cursor-pointer"
                >
                  <span>Proceed to Sign In</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Full Name</label>
              <div className="group relative rounded-2xl border border-slate-700/80 bg-slate-950/70 transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:shadow-[0_0_20px_-3px_rgba(59,130,246,0.35)]">
                <User className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="text"
                  required
                  disabled={loading}
                  placeholder="Dr. Alex Rivera"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-transparent py-3 pl-11 pr-4 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Email Address</label>
              <div className="group relative rounded-2xl border border-slate-700/80 bg-slate-950/70 transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:shadow-[0_0_20px_-3px_rgba(59,130,246,0.35)]">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="email"
                  required
                  disabled={loading}
                  placeholder="alex.rivera@disaster-agency.gov"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-transparent py-3 pl-11 pr-4 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Role on Platform</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(ROLES).map((r) => {
                  const info = ROLE_CONFIG[r];
                  const selected = formData.role === r;
                  return (
                    <button
                      type="button"
                      key={r}
                      disabled={loading}
                      onClick={() => setFormData({ ...formData, role: r })}
                      className={`text-left p-2.5 rounded-xl border text-xs transition-all duration-200 cursor-pointer disabled:opacity-60 ${
                        selected
                          ? 'border-blue-400 bg-blue-950/60 text-white shadow-[0_0_15px_-3px_rgba(59,130,246,0.4)]'
                          : 'border-slate-800/80 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-semibold text-[11px] truncate">{info.name}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{r}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Organization / Agency (Optional)</label>
              <div className="group relative rounded-2xl border border-slate-700/80 bg-slate-950/70 transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30">
                <Building className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="text"
                  disabled={loading}
                  placeholder="Red Cross, County Fire Dept, etc."
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  className="w-full bg-transparent py-3 pl-11 pr-4 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 relative">
                <label className="text-xs font-medium text-slate-200">Password</label>
                <div className="group relative rounded-2xl border border-slate-700/80 bg-slate-950/75 transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30">
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                  <input
                    type="password"
                    required
                    disabled={loading}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-transparent py-3 pl-11 pr-4 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="space-y-1.5 relative">
                <label className="text-xs font-medium text-slate-200">Confirm Password</label>
                <div className="group relative rounded-2xl border border-slate-700/80 bg-slate-950/75 transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30">
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
                  <input
                    type="password"
                    required
                    disabled={loading}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full bg-transparent py-3 pl-11 pr-4 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none disabled:opacity-60"
                  />
                </div>
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
                    <ShieldCheck className="h-4 w-4" />
                    <span>Create Account</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="text-center text-xs text-slate-400 pt-5 mt-4 border-t border-slate-800/60">
            Already have an authorized account?{' '}
            <Link to="/login" className="font-semibold text-blue-400 hover:text-blue-300 transition">
              Sign in
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
