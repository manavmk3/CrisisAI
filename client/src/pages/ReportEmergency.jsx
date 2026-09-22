import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  MapPin,
  Users,
  Send,
  Sparkles,
  AlertCircle,
  Activity,
  Zap,
  RotateCcw,
  Brain,
  Loader2,
  CheckCircle2,
  Gauge,
  Layers,
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

const AVAILABLE_RESOURCES = [
  { id: 'ambulance', label: '🚑 Ambulance' },
  { id: 'medical_team', label: '👨‍⚕️ Medical Team' },
  { id: 'fire_rescue', label: '🚒 Fire Rescue' },
  { id: 'search_rescue', label: '🔍 Search & Rescue' },
  { id: 'rescue_boat', label: '🚤 Rescue Boat' },
  { id: 'food', label: '🍞 Food Supplies' },
  { id: 'drinking_water', label: '💧 Clean Water' },
  { id: 'shelter', label: '🏕️ Emergency Shelter' },
  { id: 'police', label: '🚔 Police' },
  { id: 'evacuation_team', label: '🚶 Evacuation Team' },
];

export default function ReportEmergency() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [urgency, setUrgency] = useState('immediate');
  const [selectedNeeds, setSelectedNeeds] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [incident, setIncident] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [error, setError] = useState('');

  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [likelyDuplicate, setLikelyDuplicate] = useState(false);
  const [duplicateReason, setDuplicateReason] = useState(null);
  const [geoLocating, setGeoLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState('');

  const toggleResource = (id) => {
    setSelectedNeeds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGeoMessage('Geolocation is not supported by your browser.');
      return;
    }
    setGeoLocating(true);
    setGeoMessage('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGeoLocating(false);
        setGeoMessage('GPS coordinates acquired.');
      },
      (err) => {
        setGeoLocating(false);
        setGeoMessage(`Location permission denied or unavailable: ${err.message}`);
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIncident(null);
    setAiStatus(null);
    setLikelyDuplicate(false);
    setDuplicateReason(null);

    if (!token) {
      setError('You must be logged in to submit an emergency incident report.');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a description of the emergency.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        report: description.trim(),
        location: location.trim(),
        urgency: urgency.toLowerCase(),
        needs: selectedNeeds,
      };

      if (latitude.trim() !== '' && longitude.trim() !== '') {
        const latNum = parseFloat(latitude);
        const lonNum = parseFloat(longitude);
        if (!isNaN(latNum) && !isNaN(lonNum)) {
          payload.coordinates = { latitude: latNum, longitude: lonNum };
        }
      }

      const response = await fetch(`${API_BASE_URL}/incidents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 200 && data.status === 'needs_manual_review') {
        setAiStatus('needs_manual_review');
        setIsSuccess(true);
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit emergency report. Please try again.');
      }

      setAiStatus('analyzed');
      setIncident(data.data);
      setLikelyDuplicate(data.likelyDuplicate || false);
      setDuplicateReason(data.duplicateReason || null);
      setIsSuccess(true);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIsSuccess(false);
    setIncident(null);
    setAiStatus(null);
    setDescription('');
    setLocation('');
    setLatitude('');
    setLongitude('');
    setLikelyDuplicate(false);
    setDuplicateReason(null);
    setGeoMessage('');
    setUrgency('immediate');
    setSelectedNeeds([]);
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
            Describe the situation in natural language. Our validated AI pipeline extracts critical telemetry, evaluates urgency, calculates priority score, and records the incident for immediate response.
          </p>
        </div>

        {isSuccess && aiStatus === 'needs_manual_review' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-yellow-500/30 bg-black/50 p-6 sm:p-8 space-y-5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-yellow-600/20 border border-yellow-500/40 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Manual Review Required</h2>
                  <p className="text-[11px] text-white/50">Quality threshold safeguard triggered</p>
                </div>
              </div>
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-950/30 p-4">
                <p className="text-xs text-yellow-200/90 leading-relaxed font-medium">
                  AI analysis requires manual review. Please verify the emergency details.
                </p>
              </div>
              <p className="text-[11px] text-white/60">
                To guarantee safety, ambiguous or unstructured reports are queued for human dispatch validation before autonomous processing.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <button
                onClick={handleReset}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 backdrop-blur-sm transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Submit Another Report
              </button>
            </div>
          </div>
        ) : isSuccess && incident ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-green-500/30 bg-black/60 p-6 sm:p-8 space-y-5 backdrop-blur-md shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-600/20 border border-green-500/40 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-wide">INCIDENT REPORTED</h2>
                    <p className="text-[11px] text-white/50">Incident ID: {incident._id || incident.id}</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-bold text-emerald-300">
                  {incident.status ? incident.status.toUpperCase() : 'REPORTED'}
                </span>
              </div>

              {likelyDuplicate && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3.5 space-y-1.5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>Possible duplicate detected — requires human verification.</span>
                  </div>
                  {duplicateReason && (
                    <p className="text-[11px] text-amber-200/80 leading-relaxed pl-6">
                      Similarity: {(duplicateReason.textSimilarity * 100).toFixed(1)}% | Distance: {duplicateReason.distanceKm !== null ? `${duplicateReason.distanceKm} km` : 'N/A'} | Time difference: {duplicateReason.timeDifferenceHours !== null ? `${duplicateReason.timeDifferenceHours}h` : 'N/A'}
                    </p>
                  )}
                  <p className="text-[10px] text-amber-300/60 pl-6">
                    Incident preserved and recorded. Flagged for human dispatcher review without automatic modification or merging.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-white/90 leading-relaxed">
                  {incident.summary}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-950/50 px-3 py-1 text-xs font-semibold text-purple-300">
                  {CATEGORY_LABELS[incident.category] || `Category: ${incident.category}`}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${SEVERITY_COLORS[incident.severity] || 'border-white/20 bg-white/5 text-white/70'}`}>
                  <Activity className="h-3 w-3" />
                  Severity: {incident.severity?.toUpperCase()}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${URGENCY_COLORS[incident.urgency] || 'border-white/20 bg-white/5 text-white/70'}`}>
                  <Zap className="h-3 w-3" />
                  Urgency: {incident.urgency?.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 space-y-1">
                  <div className="flex items-center gap-1 text-red-400">
                    <Gauge className="h-3.5 w-3.5" />
                    <p className="text-[10px] font-bold uppercase tracking-wider">Priority Score</p>
                  </div>
                  <p className="text-lg font-black text-white">
                    {incident.priorityScore} <span className="text-xs text-white/50 font-normal">/ 100</span>
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">People Affected</p>
                  <p className="text-base font-bold text-white">
                    {incident.peopleAffected !== null ? incident.peopleAffected : '—'}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Injuries</p>
                  <p className="text-base font-bold text-white">
                    {incident.injuries !== null ? incident.injuries : '—'}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">AI Confidence</p>
                  <p className="text-base font-bold text-white">
                    {incident.aiConfidence !== undefined ? `${(incident.aiConfidence * 100).toFixed(0)}%` : '—'}
                  </p>
                </div>
              </div>

              {(incident.location || incident.locationClue) && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Location</p>
                    <p className="text-xs text-white/90 mt-0.5">
                      {incident.location || incident.locationClue}
                    </p>
                  </div>
                </div>
              )}

              {incident.requiredResources && incident.requiredResources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Required Resources</p>
                  <div className="flex flex-wrap gap-2">
                    {incident.requiredResources.map((resource) => (
                      <span
                        key={resource}
                        className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80"
                      >
                        {AVAILABLE_RESOURCES.find((r) => r.id === resource)?.label || resource}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-[11px] text-white/60 italic">
                  "AI-generated assessment. Critical information should be verified by responders."
                </p>
              </div>
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
                    <p className="text-xs font-semibold text-red-300">Submission Error</p>
                    <p className="text-[11px] text-red-200/70 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/90 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    What is happening? (Free-text Emergency Description)
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
                  Write in plain language. The Gemini AI engine will extract incident category, severity, trapped/affected count, and required emergency gear before database storage.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/90">Location / Landmark</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-white/30" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Street address, cross streets, or landmark (e.g. Vellore bus stand)"
                    className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-3 text-xs text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none backdrop-blur-sm"
                  />
                </div>
              </div>

              {/* Optional Coordinates Section */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-blue-400" />
                    Coordinates (Optional / GPS / Test)
                  </label>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={geoLocating}
                    className="text-[11px] font-medium text-blue-400 hover:text-blue-300 underline disabled:opacity-50"
                  >
                    {geoLocating ? 'Detecting GPS...' : 'Use Current GPS'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="e.g. 12.9165"
                      className="w-full rounded-lg border border-white/10 bg-black/40 py-1.5 px-2.5 text-xs text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none backdrop-blur-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="e.g. 79.1325"
                      className="w-full rounded-lg border border-white/10 bg-black/40 py-1.5 px-2.5 text-xs text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none backdrop-blur-sm"
                    />
                  </div>
                </div>
                {geoMessage && (
                  <p className="text-[10px] text-blue-300/80">{geoMessage}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/90">Urgency Level</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 px-3 text-xs text-white focus:border-red-500 focus:outline-none backdrop-blur-sm"
                >
                  <option value="immediate" className="bg-slate-900 text-white">Immediate (Threat to Life or Major Disaster)</option>
                  <option value="urgent" className="bg-slate-900 text-white">Urgent (Rapid response required)</option>
                  <option value="soon" className="bg-slate-900 text-white">Soon (Impending hazard or relief needs)</option>
                  <option value="routine" className="bg-slate-900 text-white">Routine (Non-critical support / Info)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/90 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    Resource Needs (Optional manual tags)
                  </span>
                  <span className="text-[11px] text-white/40 font-normal">Select all that apply</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_RESOURCES.map((r) => {
                    const isSelected = selectedNeeds.includes(r.id);
                    return (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => toggleResource(r.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition border ${
                          isSelected
                            ? 'border-red-500 bg-red-600/30 text-white shadow-sm'
                            : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
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
                    <span>Analyzing & Transmitting Emergency Report…</span>
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
                  <span className="text-xs font-semibold">Gemini AI analyzing report & scoring priority…</span>
                </div>
                <div className="space-y-2">
                  <div className="h-2.5 w-3/4 rounded bg-white/10 animate-pulse" />
                  <div className="h-2.5 w-1/2 rounded bg-white/10 animate-pulse" />
                  <div className="h-2.5 w-2/3 rounded bg-white/10 animate-pulse" />
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
