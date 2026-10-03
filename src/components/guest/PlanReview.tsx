import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatDateTime, addMinutesToIso, getMinutesDiff } from '../../utils/time';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  ArrowLeft,
  ShieldAlert,
  Car,
} from 'lucide-react';

interface PlanReviewProps {
  onBackToEdit: () => void;
  onConfirmed: () => void;
}

export const PlanReview: React.FC<PlanReviewProps> = ({ onBackToEdit, onConfirmed }) => {
  const { activeSession, confirmPlan, bays, currentTimeIso } = useSimulation();

  if (!activeSession) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-slate-400">
        No pending plan to review.
      </div>
    );
  }

  const vacantBay = bays.find((b) => b.currentStatus === 'vacant');
  const isBayWaiting = !vacantBay;

  // Allowed move window: up to 60 minutes after planned latest finish time
  const maxAllowedMoveTime = addMinutesToIso(activeSession.plannedLatestFinishTime, 60);

  // Guest selected move-by time
  const [selectedMoveTime, setSelectedMoveTime] = useState<string>(
    activeSession.agreedMoveByTime || activeSession.plannedLatestFinishTime
  );
  const [acceptedDeficit, setAcceptedDeficit] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const hasDeficit = !activeSession.isFeasibleOnTime && activeSession.projectedDeficitKwh > 0.1;

  const handleConfirm = () => {
    setIsSubmitting(true);
    confirmPlan(activeSession.requestId, selectedMoveTime, acceptedDeficit);
    onConfirmed();
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-2">
          <span>EV02 – Review & Confirm Charging Plan</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Review Charging & Turnover Schedule
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Review the projected schedule for vehicle <span className="font-mono text-emerald-300 font-bold">{activeSession.vehicleId}</span>. Once confirmed, your power allocation will be locked into the system.
        </p>
      </div>

      {/* Feasibility Alert Box */}
      {hasDeficit ? (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Power & Time Feasibility Warning</span>
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Based on current bay occupancy and your departure time ({formatDateTime(activeSession.useByTime)}), we estimate the system can deliver approximately{' '}
            <strong className="font-mono">
              {(activeSession.targetKwh - activeSession.projectedDeficitKwh).toFixed(1)} kWh
            </strong>
            , leaving an estimated shortfall of{' '}
            <strong className="font-mono text-amber-400">
              {activeSession.projectedDeficitKwh.toFixed(1)} kWh
            </strong>
            .
          </p>
          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-amber-100">
              <input
                type="checkbox"
                checked={acceptedDeficit}
                onChange={(e) => setAcceptedDeficit(e.target.checked)}
                className="rounded border-amber-500 text-emerald-500 focus:ring-emerald-500"
              />
              <span>
                I accept the partial charge of ~{(activeSession.targetKwh - activeSession.projectedDeficitKwh).toFixed(1)} kWh and wish to proceed.
              </span>
            </label>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold block text-sm">Feasibility Verified: 100% On-Time Completion</span>
            Your target of <span className="font-mono font-bold">{activeSession.targetKwh} kWh</span> is estimated to complete comfortably before your scheduled departure at {formatDateTime(activeSession.useByTime)}.
          </div>
        </div>
      )}

      {/* Plan Details Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 mb-6">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Schedule Breakdown
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Target Energy</span>
            </div>
            <div className="text-lg font-bold font-mono text-white">
              {activeSession.targetKwh.toFixed(1)} kWh
            </div>
            <div className="text-[11px] text-slate-400">
              Battery target: {activeSession.targetPercent}%
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Estimated Start</span>
            </div>
            <div className="text-lg font-bold font-mono text-white">
              {formatDateTime(activeSession.estimatedStartTime)}
            </div>
            <div className="text-[11px] text-slate-400">
              {isBayWaiting ? 'Estimated (Waiting for Bay in Queue)' : 'Immediate Entry'}
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Estimated Completion</span>
            </div>
            <div className="text-lg font-bold font-mono text-emerald-300">
              {formatDateTime(activeSession.estimatedFinishTime)}
            </div>
            <div className="text-[11px] text-slate-400">Nominal 7.0 kW rate</div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Planned Latest Finish</span>
            </div>
            <div className="text-lg font-bold font-mono text-amber-300">
              {formatDateTime(activeSession.plannedLatestFinishTime)}
            </div>
            <div className="text-[11px] text-slate-400">Includes power sharing buffer</div>
          </div>
        </div>

        {/* Move-by Window Selector */}
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-300">
                Agreed Bay Vacate / Move-By Time
              </label>
              <span className="text-[11px] text-slate-400">
                Rule: Up to 60 mins after completion
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Allowed window: between {formatDateTime(activeSession.plannedLatestFinishTime)} and {formatDateTime(maxAllowedMoveTime)}.
            </p>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="font-mono text-sm text-emerald-300 font-semibold">
              {formatDateTime(selectedMoveTime)}
            </span>
            <input
              type="datetime-local"
              value={selectedMoveTime.slice(0, 16)}
              min={activeSession.plannedLatestFinishTime.slice(0, 16)}
              max={maxAllowedMoveTime.slice(0, 16)}
              onChange={(e) => setSelectedMoveTime(new Date(e.target.value).toISOString())}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        </div>

        {/* Turnover policy note */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300">Turnover Policy Summary:</div>
          <div>• Chargers cut to 0 kW once target is reached, releasing power to others.</div>
          <div>• Vehicles must be relocated to regular stalls before the agreed deadline.</div>
          <div>• If you are asleep, dining, or away, you may request front desk valet assistance anytime.</div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBackToEdit}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Modify Request</span>
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || (hasDeficit && !acceptedDeficit)}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-semibold text-sm shadow-lg transition ${
            hasDeficit && !acceptedDeficit
              ? 'bg-slate-700 cursor-not-allowed opacity-60'
              : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25 active:scale-95'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Confirm & Enter Schedule</span>
        </button>
      </div>
    </div>
  );
};
