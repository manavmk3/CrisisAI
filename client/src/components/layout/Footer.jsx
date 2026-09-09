import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="relative z-20 border-t border-slate-800 bg-[#070a11]/95 backdrop-blur-md text-slate-300 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Prototype Emergency Protocol Disclaimer */}
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/50 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-lg shadow-black/40">
          <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-400 shrink-0 border border-amber-500/40">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="text-xs space-y-1.5 flex-1">
            <p className="font-bold text-amber-300 uppercase tracking-wider text-xs flex items-center gap-2">
              Prototype Emergency Protocol Disclaimer
            </p>
            <p className="text-slate-200 leading-relaxed text-xs">
              CrisisAI is a decision-support and prototype coordination platform. It does not autonomously dispatch emergency services or provide medical diagnosis. In a life-threatening crisis, call{' '}
              <span className="font-bold text-white underline decoration-red-500 bg-red-950/60 border border-red-500/40 px-1.5 py-0.5 rounded">
                911
              </span>{' '}
              (US),{' '}
              <span className="font-bold text-white underline decoration-red-500 bg-red-950/60 border border-red-500/40 px-1.5 py-0.5 rounded">
                112
              </span>{' '}
              (EU/India), or your national emergency number immediately.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <p>© 2026 CrisisAI Open Source. Built for humanitarian resilience.</p>
        </div>
      </div>
    </footer>
  );
}

