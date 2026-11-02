import React, { useState, useEffect } from 'react';
import {
  X,
  Truck,
  UserCheck,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Shield,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function AssignmentModal({
  incident,
  isOpen,
  onClose,
  onAssignmentCreated,
  initialResource = null,
}) {
  const { token } = useAuth();

  const [candidates, setCandidates] = useState([]);
  const [responders, setResponders] = useState([]);
  const [selectedResourceId, setSelectedResourceId] = useState(
    initialResource?._id || initialResource?.resourceId || ''
  );
  const [selectedResponderId, setSelectedResponderId] = useState('');
  const [eta, setEta] = useState('20');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [step, setStep] = useState('configure');
  const [idempotencyKey, setIdempotencyKey] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setIdempotencyKey(`assign-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    setStep('configure');
    setErrorMessage(null);
    setSuccessMessage(null);

    if (initialResource) {
      setSelectedResourceId(initialResource._id || initialResource.resourceId || '');
    }

    const loadData = async () => {
      setIsLoadingData(true);
      try {
        if (incident?._id) {
          const candRes = await fetch(`${API_BASE_URL}/incidents/${incident._id}/candidates`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (candRes.ok) {
            const candJson = await candRes.json();
            if (candJson.success && Array.isArray(candJson.data)) {
              setCandidates(candJson.data);
            }
          }
        }

        const respRes = await fetch(`${API_BASE_URL}/assignments/responders`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (respRes.ok) {
          const respJson = await respRes.json();
          if (respJson.success && Array.isArray(respJson.data)) {
            setResponders(respJson.data);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch assignment candidates or responders:', err.message);
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [isOpen, incident, initialResource, token]);

  if (!isOpen) return null;

  const handleProceedToReview = (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedResourceId && !selectedResponderId) {
      setErrorMessage('Please select at least a resource or a responder for this assignment.');
      return;
    }

    const parsedEta = Number(eta);
    if (isNaN(parsedEta) || parsedEta < 0) {
      setErrorMessage('ETA must be a valid non-negative number of minutes.');
      return;
    }

    setStep('review');
  };

  const handleConfirmAssignment = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        incidentId: incident._id,
        resourceId: selectedResourceId || null,
        responderId: selectedResponderId || null,
        ETA: eta ? Number(eta) : null,
        notes: notes.trim(),
        idempotencyKey,
      };

      const res = await fetch(`${API_BASE_URL}/incidents/${incident._id}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create assignment.');
      }

      setSuccessMessage('Assignment deployed and persisted successfully.');
      setStep('success');

      if (typeof onAssignmentCreated === 'function') {
        onAssignmentCreated(data.data);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected error occurred during assignment.');
      setStep('configure');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCandidateObj = candidates.find(
    (c) => (c._id || c.resourceId) === selectedResourceId
  );
  const selectedResponderObj = responders.find(
    (r) => (r._id || r.id) === selectedResponderId
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/95 text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-950 text-blue-400 border border-blue-800/60">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Assign Mission Deployment
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Incident INC-{(incident?._id || '').slice(-6).toUpperCase()} • {incident?.category}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3.5 rounded-xl border border-red-900/80 bg-red-950/50 text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl border border-emerald-900/80 bg-emerald-950/50 text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {step === 'configure' && (
            <form onSubmit={handleProceedToReview} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-blue-400" />
                  <span>Select Recommended Resource</span>
                </label>
                {isLoadingData ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 p-3 rounded-lg border border-slate-800 bg-slate-950">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    <span>Loading candidate resources...</span>
                  </div>
                ) : (
                  <select
                    value={selectedResourceId}
                    onChange={(e) => setSelectedResourceId(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-sans"
                  >
                    <option value="">-- No resource selected (Optional if responder chosen) --</option>
                    {candidates.map((cand) => (
                      <option
                        key={cand._id || cand.resourceId}
                        value={cand._id || cand.resourceId}
                      >
                        {cand.resourceName || cand.name} ({cand.resourceType || cand.type}) — Score: {cand.score || 'N/A'} — Avail: {cand.availableQuantity}
                        {cand.distanceKm !== null && cand.distanceKm !== undefined ? ` • ${cand.distanceKm} km` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {selectedCandidateObj && (
                  <div className="mt-2 p-2.5 rounded-lg border border-slate-800 bg-slate-950/60 text-[11px] text-slate-300 flex items-center justify-between">
                    <span>
                      Match: <strong className="text-white capitalize">{selectedCandidateObj.matchType || 'candidate'}</strong>
                    </span>
                    <span>
                      Avail: <strong className="text-emerald-400 font-mono">{selectedCandidateObj.availableQuantity} units</strong>
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-2">
                  <UserCheck className="h-3.5 w-3.5 text-purple-400" />
                  <span>Select Responder / Volunteer (Optional)</span>
                </label>
                <select
                  value={selectedResponderId}
                  onChange={(e) => setSelectedResponderId(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 font-sans"
                >
                  <option value="">-- No responder assigned --</option>
                  {responders.map((resp) => (
                    <option key={resp._id || resp.id} value={resp._id || resp.id}>
                      {resp.name} ({resp.role}) {resp.email ? `• ${resp.email}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    <span>Estimated Arrival (ETA in Minutes)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={eta}
                    onChange={(e) => setEta(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    <span>Dispatch Notes</span>
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Bring flood barrier equipment"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-slate-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg shadow-blue-900/40 transition"
                >
                  <span>Review Assignment</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-900/60 bg-blue-950/30 space-y-3 text-xs">
                <div className="flex items-center gap-2 font-bold text-white border-b border-blue-900/50 pb-2">
                  <Layers className="h-4 w-4 text-blue-400" />
                  <span>Deployment Confirmation Summary</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Incident:</span>
                    <span className="font-semibold text-white">
                      INC-{(incident?._id || '').slice(-6).toUpperCase()} ({incident?.category})
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Assigned Resource:</span>
                    <span className="font-semibold text-blue-400">
                      {selectedCandidateObj ? (selectedCandidateObj.resourceName || selectedCandidateObj.name) : selectedResourceId || 'None'}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Assigned Responder:</span>
                    <span className="font-semibold text-purple-400">
                      {selectedResponderObj ? `${selectedResponderObj.name} (${selectedResponderObj.role})` : selectedResponderId || 'None'}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">ETA:</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {eta ? `${eta} minutes` : 'Immediate'}
                    </span>
                  </div>

                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Notes:</span>
                    <span className="text-slate-300 italic">{notes || 'No dispatch notes'}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setStep('configure')}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAssignment}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-900/40 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Deploying Assignment...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Confirm & Deploy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
              <h4 className="text-base font-bold text-white">Assignment Dispatched!</h4>
              <p className="text-xs text-slate-400">
                The assignment record was saved and broadcasted to all authorized responders via Socket.IO.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
