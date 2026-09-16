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
  Clock,
  Activity,
  Zap,
  ChevronRight,
  RotateCcw,
  Brain,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import reportBg from '../assets/report-bg.jpg';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const SEVERITY_COLORS = {
  low: 'border-green-500/40 bg-green-950/50 text-green-300',
  medium: 'border-yellow-500/40 bg-yellow-950/50 text-yellow-300',
  high: 'border-orange-500/40 bg-orange-950/50 text-orange-300',
  critical: 'border-red-500/40 bg-red-950/50 text-red-300',
};

const URGENCY_COLORS = {
  routine: 'border-slate-400/40 bg-slate-950/50 text-slate-300',
  soon: 'border-blue-500/40 bg-blue-950/50 text-blue-300',
  urgent: 'border-orange-500/40 bg-orange-950/50 text-orange-300',
  immediate: 'border-red-500/40 bg-red-950/50 text-red-300',
};

const CATEGORY_LABELS = {
  flood: '🌊 Flood',
  earthquake: '🏚️ Earthquake',
  fire: '🔥 Fire',
  cyclone: '🌀 Cyclone',
  building_collapse: '🏗️ Building Collapse',
  landslide: '⛰️ Landslide',
  medical_emergency: '🚑 Medical Emergency',
  road_accident: '🚗 Road Accident',
  other: '⚠️ Other',
};

const RESOURCE_LABELS = {
  ambulance: '🚑 Ambulance',
  medical_team: '👨‍⚕️ Medical Team',
  fire_rescue: '🚒 Fire Rescue',
  search_rescue: '🔍 Search & Rescue',
  food: '🍞 Food',
  drinking_water: '💧 Drinking Water',
  shelter: '🏕️ Shelter',
  rescue_boat: '🚤 Rescue Boat',
  police: '🚔 Police',
  evacuation_team: '🚶 Evacuation Team',
};

export default function ReportEmergency() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [urgency, setUrgency] = useState('HIGH');
  const [affectedCount, setAffectedCount] = useState('5-10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setAiResult(null);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/ai/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ report: description }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to analyze report. Please try again.');
      }

      setAiResult(data.data);
      setIsSuccess(true);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIsSuccess(false);
    setAiResult(null);
    setDescription('');
    setLocation('');
    setError('');
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

        {isSuccess && aiResult ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-purple-500/30 bg-black/50 p-6 sm:p-8 space-y-5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-purple-600/20 border border-purple-500/40 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">AI Analysis Complete</h2>
                  <p className="text-[11px] text-white/50">Gemini structured extraction</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-white/90 leading-relaxed">
                  {aiResult.summary}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-950/50 px-3 py-1 text-xs font-semibold text-purple-300">
                  {CATEGORY_LABELS[aiResult.category] || aiResult.category}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${SEVERITY_COLORS[aiResult.severity] || 'border-white/20 bg-white/5 text-white/70'}`}>
                  <Activity className="h-3 w-3" />
                  Severity: {aiResult.severity}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${URGENCY_COLORS[aiResult.urgency] || 'border-white/20 bg-white/5 text-white/70'}`}>
                  <Zap className="h-3 w-3" />
                  Urgency: {aiResult.urgency}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">People Affected</p>
                  <p className="text-sm font-bold text-white">
                    {aiResult.peopleAffected !== null ? aiResult.peopleAffected : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Injuries</p>
                  <p className="text-sm font-bold text-white">
                    {aiResult.injuries !== null ? aiResult.injuries : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">AI Confidence</p>
                  <p className="text-sm font-bold text-white">
                    {(aiResult.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              {aiResult.locationClue && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Location Clue</p>
                    <p className="text-xs text-white/90 mt-0.5">{aiResult.locationClue}</p>
                  </div>
                </div>
              )}

              {aiResult.requiredResources && aiResult.requiredResources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Required Resources</p>
                  <div className="flex flex-wrap gap-2">
                    {aiResult.requiredResources.map((resource) => (
                      <span
                        key={resource}
                        className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80"
                      >
                        {RESOURCE_LABELS[resource] || resource}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={handleReset}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 backdrop-blur-sm transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
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

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 flex items-start gap-2.5 backdrop-blur-sm">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-300">Analysis Failed</p>
                    <p className="text-[11px] text-red-200/70 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

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
                className="w-full rounded-xl bg-red-600 py-3 text-xs font-bold text-white shadow-lg shadow-red-900/40 hover:bg-red-500 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing with Gemini AI…</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Transmit Emergency Report to Responders</span>
                  </>
                )}
              </button>
            </form>

            {isSubmitting && (
              <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-4 space-y-3 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-purple-300">
                  <Brain className="h-4 w-4 animate-pulse" />
                  <span className="text-xs font-semibold">Gemini AI is analyzing your report…</span>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-white/5 animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-white/5 animate-pulse" />
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
