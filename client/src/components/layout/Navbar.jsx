import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Flame, 
  ShieldAlert, 
  Activity, 
  Menu, 
  X, 
  LogIn, 
  UserPlus, 
  ChevronDown, 
  Radio, 
  LayoutDashboard 
} from 'lucide-react';
import { useRole, ROLES, ROLE_CONFIG } from '../../context/RoleContext';

export default function Navbar({ onToggleSidebar, isSidebarOpen }) {
  const { currentRole, setCurrentRole } = useRole();
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Left: Brand and Sidebar Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden focus:outline-none"
            title="Toggle sidebar navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-lg shadow-red-900/30 group-hover:scale-105 transition-transform duration-200">
              <Flame className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white font-sans">
                  Crisis<span className="text-red-500">AI</span>
                </span>
              </div>
              <p className="text-[10px] font-medium tracking-wide text-slate-400 uppercase hidden sm:block">
                Emergency Response Ops
              </p>
            </div>
          </Link>
        </div>


        {/* Right: Role Switcher & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Quick Role Preview Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowRoleDropdown(!showRoleDropdown)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition"
              title="Switch role view"
            >
              <span className="text-slate-400 hidden sm:inline">Role:</span>
              <span className="capitalize font-semibold text-red-400">
                {ROLE_CONFIG[currentRole]?.name.split(' ')[0]}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {showRoleDropdown && (
              <div 
                className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl z-50"
                onClick={() => setShowRoleDropdown(false)}
              >
                <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Select Role View
                </div>
                {Object.values(ROLES).map((roleKey) => {
                  const info = ROLE_CONFIG[roleKey];
                  const isSelected = currentRole === roleKey;
                  return (
                    <button
                      key={roleKey}
                      onClick={() => setCurrentRole(roleKey)}
                      className={`w-full text-left rounded-lg p-2 text-xs transition flex flex-col gap-0.5 ${
                        isSelected 
                          ? 'bg-red-950/40 border border-red-500/30 text-white' 
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>{info.name}</span>
                        {isSelected && <span className="text-[10px] text-red-400">● Active</span>}
                      </div>
                      <span className="text-[10px] text-slate-400 line-clamp-1">{info.description}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Report Emergency Button */}
          <Link
            to="/report"
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-red-900/40 hover:bg-red-500 active:scale-95 transition"
          >
            <ShieldAlert className="h-4 w-4" />
            <span className="hidden xs:inline">Report Crisis</span>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-1 text-xs">
            <Link
              to="/"
              className={`px-2.5 py-1.5 rounded-lg font-medium transition ${
                isActive('/') ? 'text-white bg-slate-800' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Home
            </Link>
            <Link
              to="/dashboard"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition ${
                isActive('/dashboard') ? 'text-white bg-slate-800' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </nav>

          {/* Auth Buttons */}
          <div className="hidden sm:flex items-center gap-1.5 border-l border-slate-800 pl-2">
            <Link
              to="/login"
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
            >
              <LogIn className="h-3.5 w-3.5" />
              Login
            </Link>
            <Link
              to="/register"
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register
            </Link>
          </div>

          {/* Mobile hamburger menu button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-800 bg-slate-950/95 px-4 py-3 space-y-2 backdrop-blur-lg">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Home
          </Link>
          <Link
            to="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Dashboard
          </Link>
          <Link
            to="/login"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Login
          </Link>
          <Link
            to="/register"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Register
          </Link>
        </div>
      )}
    </header>
  );
}
