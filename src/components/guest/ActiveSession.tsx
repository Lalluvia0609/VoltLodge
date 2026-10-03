import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatDateTime, formatTimeOnly, getMinutesDiff, getRelativeTimeLabel } from '../../utils/time';
import { ValetModal } from './ValetModal';
import { ExtensionModal } from './ExtensionModal';
import { ModifyModal } from './ModifyModal';
import {
  Zap,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Sliders,
  DollarSign,
  Car,
  Bell,
  Check,
} from 'lucide-react';

export const ActiveSession: React.FC = () => {
  const {
    activeSession,
    currentTimeIso,
    bays,
    confirmBayReleased,
    idleGracePeriodMins,
    idleFeePerMin,
  } = useSimulation();

  const [isValetModalOpen, setIsValetModalOpen] = useState(false);
  const [isExtModalOpen, setIsExtModalOpen] = useState(false);
  const [isModModalOpen, setIsModModalOpen] = useState(false);

  if (!activeSession) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-slate-400">
        No active vehicle selected. Register a new vehicle or pick one from the top selector.
      </div>
    );
  }

  const s = activeSession;
  const progressPercent = Math.min(100, Math.round((s.deliveredKwh / s.targetKwh) * 100));
  const remainingKwh = Math.max(0, Math.round((s.targetKwh - s.deliveredKwh) * 10) / 10);
  const bay = bays.find((b) => b.bayId === s.bayId);

  // Time calculations
  const isOverdue = currentTimeIso > s.agreedMoveByTime;
  const overdueMins = isOverdue ? getMinutesDiff(s.agreedMoveByTime, currentTimeIso) : 0;
  const simulatedIdleFee =
    s.status === 'target_reached' && overdueMins > idleGracePeriodMins
      ? (overdueMins - idleGracePeriodMins) * idleFeePerMin
      : 0;

  // Status badge styling & copy
  let statusBadge = {
    text: 'Active Charging',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: <Zap className="w-4 h-4 fill-current text-emerald-400" />,
  };

  if (s.status === 'waiting_bay') {
    statusBadge = {
      text: 'In Waiting Queue',
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      icon: <Hourglass className="w-4 h-4 text-blue-400" />,
    };
  } else if (s.status === 'paused') {
    statusBadge = {
      text: 'Power Paused (Grid Peak Shaving)',
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: <Clock className="w-4 h-4 text-amber-400" />,
    };
  } else if (s.status === 'target_reached') {
    statusBadge = {
      text: isOverdue ? 'Target Reached (Overdue Bay Occupancy)' : 'Target Reached (Vacate Pending)',
      color: isOverdue
        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        : 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      icon: isOverdue ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-teal-400" />,
    };
  } else if (s.status === 'ended_incomplete') {
    statusBadge = {
      text: 'Ended Incomplete (Departure Reached)',
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      icon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
    };
  } else if (s.status === 'cancelled') {
    statusBadge = {
      text: 'Session Cancelled',
      color: 'bg-slate-700 text-slate-300 border-slate-600',
      icon: <Car className="w-4 h-4 text-slate-400" />,
    };
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* Vehicle Top Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-2xl font-bold tracking-tight text-white">
              {s.vehicleId}
            </span>
            <span className="text-xs text-slate-400">
              ({s.guestName} · Room {s.roomNumber})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusBadge.color}`}>
              {statusBadge.icon}
              <span>{statusBadge.text}</span>
            </div>
            {bay && (
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                {bay.name}
              </span>
            )}
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Modify</span>
          </button>
        </div>
      </div>

      {/* Proactive Alerts Banner (EV06) */}
      {s.status === 'target_reached' && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-all ${
            isOverdue
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          }`}
        >
          <Bell className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-sm">
              {isOverdue
                ? `Attention: Agreed Move-By Time Passed (+${overdueMins} mins)`
                : `Target Reached! Charger Power Released`}
            </div>
            <p className="leading-relaxed">
              {isOverdue
                ? `Vehicle has occupied the bay past the agreed deadline (${formatTimeOnly(s.agreedMoveByTime)}). Other guests may be waiting. Please relocate vehicle or confirm valet assistance immediately.`
                : `Your target of ${s.targetKwh} kWh is satisfied. Power is cut to 0 kW to save energy and protect the site budget. Please relocate vehicle before ${formatTimeOnly(s.agreedMoveByTime)}.`}
            </p>
            {s.valetTask?.status !== 'accepted' && (
              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={() => setIsValetModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs transition"
                >
                  Request Hotel Valet Assistance
                </button>
                {bay && (
                  <button
                    onClick={() => confirmBayReleased(bay.bayId, 'Guest self-reported vehicle moved.')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition"
                  >
                    I Have Moved My Vehicle
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress & Live Power Meter Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Energy Delivered
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-extrabold font-mono text-white">
                {s.deliveredKwh.toFixed(1)}
              </span>
              <span className="text-sm font-mono text-slate-400">
                / {s.targetKwh.toFixed(1)} kWh ({progressPercent}%)
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Live Allocation Rate
            </span>
            <div className="text-2xl font-extrabold font-mono text-emerald-400 mt-1">
              {s.allocatedKw > 0 ? `${s.allocatedKw.toFixed(1)} kW` : '0.0 kW'}
            </div>
            <span className="text-[11px] text-slate-400">
              {s.allocatedKw > 0 ? `Max hardware cap: ${s.maxChargeKw} kW` : 'Power paused or target hit'}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                s.status === 'target_reached'
                  ? 'bg-teal-400'
                  : s.status === 'paused'
                  ? 'bg-amber-400'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>Started: {s.initialSocPercent}%</span>
            <span>
              {s.status === 'target_reached'
                ? 'Target Complete'
                : `Remaining: ~${remainingKwh.toFixed(1)} kWh`}
            </span>
            <span>Target: {s.targetPercent}%</span>
          </div>
        </div>

        {/* Timeline Schedule Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Arrival</span>
            </div>
            <div className="text-xs font-mono font-bold text-white">
              {formatTimeOnly(s.arrivalTime)}
            </div>
            <div className="text-[10px] text-slate-500">
              {s.pluggedInAt ? 'Plugged in' : 'Queued'}
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>Est. Finish</span>
            </div>
            <div className="text-xs font-mono font-bold text-emerald-300">
              {formatTimeOnly(s.estimatedFinishTime)}
            </div>
            <div className="text-[10px] text-slate-500">
              {getRelativeTimeLabel(s.estimatedFinishTime, currentTimeIso).label}
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Agreed Move-By</span>
            </div>
            <div className="text-xs font-mono font-bold text-amber-300">
              {formatTimeOnly(s.agreedMoveByTime)}
            </div>
            <div className="text-[10px] text-slate-500">
              {getRelativeTimeLabel(s.agreedMoveByTime, currentTimeIso).label}
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
              <Car className="w-3 h-3 text-blue-400" />
              <span>Departure</span>
            </div>
            <div className="text-xs font-mono font-bold text-blue-300">
              {formatTimeOnly(s.useByTime)}
            </div>
            <div className="text-[10px] text-slate-500">Guest flight/drive</div>
          </div>
        </div>
      </div>

      {/* Valet Relocation Status Card (EV07 & EV08) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Turnover Assistance (Valet Relocation)</h3>
          </div>

          {s.valetTask ? (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                s.valetTask.status === 'completed'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : s.valetTask.status === 'accepted'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : s.valetTask.status === 'rejected'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              {s.valetTask.status === 'pending_review' && 'Pending Front Desk Check'}
              {s.valetTask.status === 'accepted' && 'Staff Assigned'}
              {s.valetTask.status === 'completed' && 'Relocated Successfully'}
              {s.valetTask.status === 'rejected' && 'Declined by Front Desk'}
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-medium">Self-Move Selected</span>
          )}
        </div>

        {s.valetTask ? (
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span>Keys Note:</span>
              <span className="text-white font-medium">{s.valetTask.keysHandoverNote}</span>
            </div>
            {s.valetTask.staffAssigned && (
              <div className="flex items-center justify-between text-slate-300">
                <span>Assigned Staff:</span>
                <span className="text-emerald-300 font-medium">{s.valetTask.staffAssigned}</span>
              </div>
            )}
            {s.valetTask.destinationBay && (
              <div className="flex items-center justify-between text-slate-300">
                <span>Destination Parking Stall:</span>
                <span className="text-white font-medium">{s.valetTask.destinationBay}</span>
              </div>
            )}
            {s.valetTask.rejectionReason && (
              <div className="text-rose-400">
                Reason: {s.valetTask.rejectionReason}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-400 max-w-md">
              Going to sleep or away from the hotel? Request our complimentary valet move so you don't have to wake up or interrupt your evening.
            </p>
            <button
              onClick={() => setIsValetModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs transition shadow-md shadow-emerald-500/20 shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Request Valet Move</span>
            </button>
          </div>
        )}
      </div>

      {/* Extension Request Card (EV12) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Need Extra Bay Time?</h3>
          </div>
          <button
            onClick={() => setIsExtModalOpen(true)}
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 hover:underline"
          >
            Apply for Extension (EV12)
          </button>
        </div>

        {s.extensionRequest ? (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Requested Extension Until:</span>
              <span className="font-mono text-white font-semibold">
                {formatTimeOnly(s.extensionRequest.requestedDeadline)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Status:</span>
              <span
                className={`font-semibold uppercase tracking-wider text-[11px] ${
                  s.extensionRequest.status === 'approved'
                    ? 'text-emerald-400'
                    : s.extensionRequest.status === 'rejected'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {s.extensionRequest.status}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            If you encounter delays, submit an extension request. Front desk evaluates against queue congestion so your car won't be flagged as uncommunicative.
          </p>
        )}
      </div>

      {/* Simulated Idle Occupancy Fee Card (EV14) */}
      {s.status === 'target_reached' && overdueMins > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Simulated Occupancy Fee Tracker</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
              EV14 Prototype Demo
            </span>
          </div>

          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
            <div className="flex justify-between text-slate-300">
              <span>Agreed Move Deadline:</span>
              <span className="font-mono text-white">{formatTimeOnly(s.agreedMoveByTime)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Total Overdue Time:</span>
              <span className="font-mono text-rose-400 font-bold">+{overdueMins} mins</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Complimentary Grace Period:</span>
              <span className="font-mono text-slate-400">{idleGracePeriodMins} mins</span>
            </div>
            <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800">
              <span>Simulated Idle Tariff (${idleFeePerMin.toFixed(2)}/min):</span>
              <span className="font-mono text-amber-400 font-extrabold text-sm">
                ${simulatedIdleFee.toFixed(2)} NZD (Simulated)
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            * Note: This is an educational demonstration of idle fee policy transparency. No actual credit card billing occurs.
          </p>
        </div>
      )}

      {/* Modals */}
      <ValetModal
        isOpen={isValetModalOpen}
        onClose={() => setIsValetModalOpen(false)}
        requestId={s.requestId}
      />
      <ExtensionModal
        isOpen={isExtModalOpen}
        onClose={() => setIsExtModalOpen(false)}
        requestId={s.requestId}
      />
      <ModifyModal
        isOpen={isModModalOpen}
        onClose={() => setIsModModalOpen(false)}
        requestId={s.requestId}
      />
    </div>
  );
};
