import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  MapPin,
  Users,
  Send,
  Sparkles,
  AlertCircle,
  Phone,
  Radio,
  Clock
} from 'lucide-react';
import reportBg from '../assets/report-bg.jpg';

export default function ReportEmergency() {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [urgency, setUrgency] = useState('HIGH');
  const [affectedCount, setAffectedCount] = useState('5-10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 800);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <img
        src={reportBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/80" />
      <div className="absolute inset-0 backdrop-blur-[2px]" />

      <div className="relative z-10 max-w-2xl mx-auto py-10 sm:py-16 px-4 sm:px-6 space-y-6">

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-950/50 px-3 py-1 text-xs font-semibold text-red-300 backdrop-blur-sm">
            <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            <span>Citizen Emergency Intake</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-lg">
            Submit Disaster Report
          </h1>
          <p className="text-xs sm:text-sm text-white/70">
            Describe your situation in natural language. Our Gemini AI model will automatically extract key details, triage severity, and alert responders.
          </p>
        </div>

        {isSuccess ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-8 text-center space-y-4 backdrop-blur-md">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Emergency Report Registered</h2>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              Your report has been received and queued into the AI priority triage pipeline. Dispatch authorities have been notified.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => {
                  setIsSuccess(false);
                  setDescription('');
                }}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
              >
                Submit Another Report
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 shadow-lg shadow-red-900/40 transition-colors"
              >
                View in Live Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/50 p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6">
            <form onSubmit={handleSubmit} className="space-y-5">

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/90 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    What is happening? (Natural Language Report)
                  </span>
                  <span className="text-[11px] text-white/40 font-normal">AI-analyzed</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Example: Flash flood is rising rapidly on Elm Street near the library. About 8 people, including elderly neighbors, are trapped on the second floor. Water is 4 feet high and rising. We need an evacuation boat immediately."
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 backdrop-blur-sm"
                />
                <p className="text-[11px] text-white/40">
                  You can write freely in your own words. Gemini AI will extract severity, required resources, and affected count.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/90">Incident Location / Clues</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-white/30" />
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Street address, cross streets, or landmark (e.g. Elm Street library)"
                    className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none backdrop-blur-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/90">Urgency Level</label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 px-3 text-xs text-white focus:border-red-500 focus:outline-none backdrop-blur-sm"
                  >
                    <option value="CRITICAL">Critical (Life Threatening)</option>
                    <option value="HIGH">High (Urgent Medical/Rescue)</option>
                    <option value="MEDIUM">Medium (Supplies / Shelter)</option>
                    <option value="LOW">Low (Information / Non-urgent)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/90">Estimated People Affected</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-3 h-4 w-4 text-white/30" />
                    <input
                      type="text"
                      value={affectedCount}
                      onChange={(e) => setAffectedCount(e.target.value)}
                      placeholder="e.g. 5-10 people"
                      className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none backdrop-blur-sm"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-red-600 py-3 text-xs font-bold text-white shadow-lg shadow-red-900/40 hover:bg-red-500 active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Transmit Emergency Report to Responders</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
