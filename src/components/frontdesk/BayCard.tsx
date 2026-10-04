import { guestLabel, guestDetails } from '../../utils/guestIdentity';
import React, { useState } from 'react';
import { Bay } from '../../types';
import { useSimulation } from '../../context/SimulationContext';
import { formatTimeOnly, formatDateTime } from '../../utils/time';
import { BayReleaseModal } from './BayReleaseModal';
import {
  Zap,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BatteryCharging,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface BayCardProps {
  bay: Bay;
}

export const BayCard: React.FC<BayCardProps> = ({ bay }) => {
  const {
    sessions,
    currentTimeIso,
    confirmVehicleParkedAndPlugged,
    predictions,
  } = useSimulation();
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);

  const currentSession = sessions.find((s) => s.bayId === bay.bayId);
  const isTargetReached = currentSession?.status === 'target_reached';
  const penalty = currentSession?.penalty;
  const overdueMins = penalty?.lateMinutes || 0;
  const isOverdue = overdueMins > 0;
  const nextBooking = sessions
    .filter((s) => s.status === 'waiting_bay')
    .sort((a, b) => Date.parse(a.arrivalTime) - Date.parse(b.arrivalTime))[0];
  // Progress
  const progressPercent = currentSession
    ? Math.min(
        100,
        Math.round(
          (currentSession.deliveredKwh / currentSession.targetKwh) * 100,
        ),
      )
    : 0;

  return (
    <div
      className={`rounded-2xl border p-5 transition-all shadow-sm flex flex-col justify-between ${
        bay.currentStatus === 'vacant'
          ? 'bg-slate-900/60 border-slate-800'
          : isOverdue
            ? 'bg-rose-950/20 border-rose-500/40 ring-1 ring-rose-500/30'
            : isTargetReached
              ? 'bg-amber-950/20 border-amber-500/40'
              : 'bg-slate-900 border-slate-800'
      }`}
    >
      <div>
        {/* Top Header of Bay */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-base">{bay.name}</span>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              Max {bay.maxKw} kW
            </span>
          </div>

          <div>
            {bay.currentStatus === 'vacant' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Vacant
              </span>
            ) : isOverdue ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
                Overdue — awaiting move (+{overdueMins.toFixed(1)}m)
              </span>
            ) : isTargetReached ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {currentSession?.moveReportedAt
                  ? 'Move reported — awaiting confirmation'
                  : 'Charging complete — awaiting move'}
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                {currentSession?.status === 'waiting_plugin'
                  ? 'Reserved · waiting for plug-in'
                  : currentSession?.moveReportedAt
                    ? 'Move reported · verify bay'
                    : currentSession?.status === 'paused'
                      ? 'Paused'
                      : currentSession?.status === 'cancelled'
                        ? 'Stopped · still occupied'
                        : currentSession?.status === 'ended_incomplete'
                          ? 'Deadline reached · still occupied'
                          : 'Charging Active'}
              </span>
            )}
          </div>
        </div>

        {/* Bay Content */}
        {bay.currentStatus === 'vacant' ? (
          <div className="py-8 text-center text-slate-500 text-xs space-y-1">
            <BatteryCharging className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p>Charger ready for next vehicle</p>
            <p className="text-[11px] text-slate-600">Cable safely docked</p>
          </div>
        ) : currentSession ? (
          <div className="py-4 space-y-4">
            {/* Vehicle & Guest Info */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                  Connected Vehicle
                </span>
                <span className="font-mono text-lg font-bold text-white tracking-wide">
                  {guestLabel(currentSession, sessions)}
                </span>
                <span className="text-xs text-slate-400 block">
                  {guestDetails(currentSession)}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                  Live Power
                </span>
                <span className="font-mono text-xl font-extrabold text-emerald-400">
                  {currentSession.allocatedKw > 0
                    ? `${currentSession.allocatedKw.toFixed(1)} kW`
                    : '0.0 kW'}
                </span>
              </div>
            </div>

            {/* Progress meter */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-300">
                  {currentSession.deliveredKwh.toFixed(1)} /{' '}
                  {currentSession.targetKwh.toFixed(1)} kWh
                </span>
                <span className="text-slate-400">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isTargetReached ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 space-y-1">
              <p>
                Charging completion:{' '}
                {currentSession.targetReachedAt
                  ? formatDateTime(currentSession.targetReachedAt)
                  : 'Not completed'}
              </p>
              <p>
                Agreed Move-By:{' '}
                {formatDateTime(currentSession.agreedMoveByTime)}
              </p>
              <p>Current time: {formatDateTime(currentTimeIso)}</p>
              <p>
                {isOverdue
                  ? `Overdue: ${overdueMins.toFixed(1)} min — awaiting move`
                  : 'Not overdue'}
              </p>
              <p>
                Current accumulated penalty: $
                {(penalty?.penaltyAmount || 0).toFixed(2)} NZD
              </p>
              {nextBooking && (
                <div className="border-t border-slate-800 pt-2 mt-2">
                  <p>
                    Next booking in queue: {guestLabel(nextBooking, sessions)}
                  </p>
                  <p>Scheduled: {formatDateTime(nextBooking.arrivalTime)}</p>
                  <p>
                    Waiting — bay still{' '}
                    {bay.currentStatus === 'reserved_entry'
                      ? 'reserved'
                      : 'occupied'}{' '}
                    by {guestLabel(currentSession, sessions)}. Reception must
                    confirm vacancy before admission.
                  </p>
                </div>
              )}
            </div>
            {/* Timings */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block">
                  Target Finish
                </span>
                <span className="font-mono text-emerald-300 font-semibold">
                  {formatTimeOnly(
                    currentSession.targetReachedAt ||
                      predictions[currentSession.requestId]?.expected,
                  )}
                </span>
              </div>

              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-400 block">
                  Agreed Move-By
                </span>
                <span
                  className={`font-mono font-semibold ${
                    isOverdue ? 'text-rose-400 font-bold' : 'text-amber-300'
                  }`}
                >
                  {formatTimeOnly(currentSession.agreedMoveByTime)}
                </span>
              </div>
            </div>

            {/* Turnover Method Indicator */}
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
              <span>Turnover:</span>
              <span className="font-semibold text-slate-200">
                {currentSession.valetTask ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Valet ({currentSession.valetTask.status})
                  </span>
                ) : (
                  'Guest Self-Move'
                )}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Card Actions Footer */}
      {bay.currentStatus !== 'vacant' && (
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap gap-2 items-center justify-end">
          {currentSession?.status === 'waiting_plugin' && (
            <button
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs"
              onClick={() => {
                const result = confirmVehicleParkedAndPlugged(
                  bay.bayId,
                  currentSession.vehicleId,
                );
                if (!result.success) window.alert(result.error);
              }}
            >
              Confirm parked &amp; plugged in
            </button>
          )}
          <button
            onClick={() => setIsReleaseModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition border border-slate-700 hover:text-white"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>Confirm Bay Vacated (EV09)</span>
          </button>
        </div>
      )}

      {/* Modal */}
      <BayReleaseModal
        isOpen={isReleaseModalOpen}
        onClose={() => setIsReleaseModalOpen(false)}
        bay={bay}
      />
    </div>
  );
};
