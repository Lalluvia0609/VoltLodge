import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatTimeOnly } from '../../utils/time';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Car,
  Key,
  UserCheck,
  MapPin,
  AlertCircle,
  Check,
} from 'lucide-react';

export const ValetTaskManager: React.FC = () => {
  const {
    sessions,
    reviewValetTask,
    completeValetTask,
    staffOnDuty,
    availableStandardStalls,
  } = useSimulation();

  // Find all active valet tasks
  const valetSessions = sessions.filter(
    (s) => s.valetTask && s.valetTask.status !== 'none',
  );

  // Modal / form states for accepting/rejecting
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(
    null,
  );

  // 4-item checklist for acceptance
  const [authChecked, setAuthChecked] = useState(false);
  const [keysChecked, setKeysChecked] = useState(false);
  const [assignedStaff, setAssignedStaff] = useState(staffOnDuty[0]);
  const [targetStall, setTargetStall] = useState('Standard Stall #14');
  const [rejectReason, setRejectReason] = useState(
    'Staff shortage on current shift.',
  );

  const handleOpenAction = (taskId: string, type: 'accept' | 'reject') => {
    setSelectedTaskId(taskId);
    setActionType(type);
  };

  const handleConfirmAction = () => {
    if (!selectedTaskId || !actionType) return;

    if (actionType === 'accept') {
      reviewValetTask(selectedTaskId, true, {
        staffAssigned: assignedStaff,
        destinationBay: targetStall,
        authorizationConfirmed: authChecked,
        keysReceived: keysChecked,
      });
    } else {
      reviewValetTask(selectedTaskId, false, {
        rejectionReason: rejectReason,
      });
    }

    setSelectedTaskId(null);
    setActionType(null);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold text-white">
            Staff Valet Relocation Dispatch
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            {valetSessions.length} total
          </span>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span>Stalls Available:</span>
          <span className="font-mono text-emerald-400 font-bold">
            {availableStandardStalls}
          </span>
        </div>
      </div>

      {valetSessions.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No valet assistance requests currently pending.
        </div>
      ) : (
        <div className="space-y-3">
          {valetSessions.map((s) => {
            const task = s.valetTask!;
            const isTargetReached = s.status === 'target_reached';

            return (
              <div
                key={task.taskId}
                className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-white">
                      {task.vehicleId}
                    </span>
                    <span className="text-slate-400">
                      (Room {s.roomNumber}) ·{' '}
                      {s.bayId ? `Bay ${s.bayId.split('-').at(-1)}` : 'Queued'}
                    </span>
                  </div>

                  <div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        task.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : task.status === 'accepted'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : task.status === 'rejected'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {task.status === 'pending_review' &&
                        'Pending Front Desk Review'}
                      {task.status === 'accepted' && 'Staff Assigned'}
                      {task.status === 'completed' && 'Relocation Completed'}
                      {task.status === 'rejected' && 'Declined'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-300">
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">
                      Keys Location
                    </span>
                    <span className="text-white font-medium truncate block">
                      {task.keysHandoverNote}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">
                      Assigned Staff
                    </span>
                    <span className="text-white font-medium truncate block">
                      {task.staffAssigned || 'Awaiting Assignment'}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">
                      Target Stall
                    </span>
                    <span className="text-white font-medium truncate block">
                      {task.destinationBay || 'Pending'}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-400">
                    Charge state:{' '}
                    <strong className="text-white font-mono">
                      {s.deliveredKwh.toFixed(1)} / {s.targetKwh.toFixed(1)} kWh
                    </strong>{' '}
                    (
                    {isTargetReached
                      ? 'Target Reached, Ready for Move'
                      : 'Still Charging'}
                    )
                  </span>

                  <div className="flex items-center gap-2">
                    {task.status === 'pending_review' && (
                      <>
                        <button
                          onClick={() =>
                            handleOpenAction(task.taskId, 'reject')
                          }
                          className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-medium transition"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() =>
                            handleOpenAction(task.taskId, 'accept')
                          }
                          className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-sm transition"
                        >
                          Review & Accept Task
                        </button>
                      </>
                    )}

                    {task.status === 'accepted' && (
                      <button
                        onClick={() => completeValetTask(task.taskId)}
                        disabled={!isTargetReached}
                        title={
                          isTargetReached
                            ? 'Confirm staff moved the car'
                            : 'Wait until the target is reached'
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Execute Move & Free Charger (EV09)</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review & Accept / Reject Modal with 4-Item Verification */}
      {selectedTaskId && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">
              {actionType === 'accept'
                ? 'Verify 4 Conditions to Accept Valet Task'
                : 'Decline Valet Task'}
            </h3>

            {actionType === 'accept' ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-400">
                  Front desk policy decision table: verify all 4 criteria before
                  dispatching staff.
                </p>

                {/* 1. Authorization */}
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authChecked}
                    onChange={(e) => setAuthChecked(e.target.checked)}
                    className="text-emerald-500 focus:ring-emerald-500 rounded"
                  />
                  <span>1. Guest relocation consent explicitly recorded</span>
                </label>

                {/* 2. Keys */}
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keysChecked}
                    onChange={(e) => setKeysChecked(e.target.checked)}
                    className="text-emerald-500 focus:ring-emerald-500 rounded"
                  />
                  <span>2. Vehicle physical keys in hand at reception</span>
                </label>

                {/* 3. Staff */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    3. Assign On-Duty Staff Member
                  </label>
                  <select
                    value={assignedStaff}
                    onChange={(e) => setAssignedStaff(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {staffOnDuty.map((staff) => (
                      <option key={staff} value={staff}>
                        {staff}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Stall */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    4. Designated Standard Parking Stall
                  </label>
                  <input
                    type="text"
                    value={targetStall}
                    onChange={(e) => setTargetStall(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <label className="block text-slate-300 font-medium">
                  Reason for Declining (Sent to Guest)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setSelectedTaskId(null);
                  setActionType(null);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={
                  actionType === 'accept' &&
                  (!authChecked ||
                    !keysChecked ||
                    !assignedStaff ||
                    !targetStall.trim() ||
                    availableStandardStalls <= 0)
                }
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold shadow-md transition ${
                  actionType === 'accept'
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-rose-500 hover:bg-rose-600 text-white'
                }`}
              >
                {actionType === 'accept'
                  ? 'Confirm Acceptance'
                  : 'Decline Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
