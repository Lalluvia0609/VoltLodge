import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { addMinutesToIso, formatDateTime } from '../../utils/time';
import { Clock, AlertTriangle, X, Check } from 'lucide-react';

interface ExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
}

export const ExtensionModal: React.FC<ExtensionModalProps> = ({ isOpen, onClose, requestId }) => {
  const { requestExtension, sessions } = useSimulation();
  const session = sessions.find((s) => s.requestId === requestId);

  const initialExt = session ? addMinutesToIso(session.agreedMoveByTime, 30) : '';
  const [requestedDeadline, setRequestedDeadline] = useState(initialExt);
  const [reason, setReason] = useState('Dinner running longer than expected.');

  if (!isOpen || !session) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestExtension(session.requestId, requestedDeadline, reason);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Request Bay Stay Extension</h3>
              <p className="text-xs text-slate-400">EV12 – Apply for Extra Parking Grace Period</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
            <div>
              Current Move Deadline:{' '}
              <strong className="text-emerald-400 font-mono">
                {formatDateTime(session.agreedMoveByTime)}
              </strong>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Extension requests must be reviewed by Front Desk against queue conflicts.
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              New Requested Vacate Time
            </label>
            <div className="flex items-center gap-2 mb-2">
              {[15, 30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setRequestedDeadline(addMinutesToIso(session.agreedMoveByTime, mins))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-mono"
                >
                  +{mins}m
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={requestedDeadline.slice(0, 16)}
              onChange={(e) => setRequestedDeadline(new Date(e.target.value).toISOString())}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Reason for Extension
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. In late meeting, delayed return"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              If other arriving guests are waiting in queue, extensions may be declined. Consider requesting our complimentary Valet Relocation instead.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-xs font-semibold text-slate-950 shadow-md shadow-amber-500/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Submit Extension Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
