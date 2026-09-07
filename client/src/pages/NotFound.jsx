import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="py-16 text-center space-y-4 max-w-md mx-auto">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h1 className="text-3xl font-extrabold text-white">404 - Area Not Found</h1>
      <p className="text-xs text-slate-400 leading-relaxed">
        The disaster coordination sector or resource coordinate you are attempting to reach does not exist or has been relocated.
      </p>
      <div className="pt-2">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return to Command HQ</span>
        </Link>
      </div>
    </div>
  );
}
