import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-800/80 bg-[#070a11] text-slate-400 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="rounded-lg bg-amber-900/30 p-2 text-amber-400 shrink-0 border border-amber-700/30">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="text-xs space-y-1">
            <p className="font-semibold text-amber-200 uppercase tracking-wide text-[11px]">
              Prototype Emergency Protocol Disclaimer
            </p>
            <p className="text-slate-300 leading-relaxed">
              CrisisAI is a decision-support and prototype coordination platform. It does not autonomously dispatch emergency services or provide medical diagnosis. In a life-threatening crisis, call <span className="font-bold text-white underline decoration-red-500">911</span> (US), <span className="font-bold text-white underline decoration-red-500">112</span> (EU/India), or your national emergency number immediately.
            </p>
          </div>
        </div>


        <div className="pt-4 border-t border-slate-900/60 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
          <p>© 2026 CrisisAI Open Source. Built for humanitarian resilience.</p>
        </div>

      </div>
    </footer>
  );
}
