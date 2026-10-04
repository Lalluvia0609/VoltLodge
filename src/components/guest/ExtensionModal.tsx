import { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { addMinutesToIso, formatDateTime } from '../../utils/time';
import { TimeField, ErrorMessage, buttonClass } from './GuestFields';
export function ExtensionModal({
  isOpen,
  onClose,
  requestId,
}: {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
}) {
  const { sessions, requestExtension, extensionLimitMinutes } = useSimulation();
  const s = sessions.find((s) => s.requestId === requestId);
  const [newTime, setNewTime] = useState(
      s ? addMinutesToIso(s.agreedMoveByTime, 15) : '',
    ),
    [delay, setDelay] = useState(false),
    [error, setError] = useState<string | null>(null);
  if (!isOpen || !s) return null;
  const latest = addMinutesToIso(
    s.originalLatestFinishTime || s.plannedLatestFinishTime,
    extensionLimitMinutes,
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <form
        className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const result = requestExtension(
            requestId,
            newTime,
            'Guest explicitly confirmed a later time.',
            delay,
          );
          if (result.success) onClose();
          else setError(result.error || 'Unable to extend.');
        }}
      >
        <h2 className="text-lg font-bold text-white">Request a later time</h2>
        <ErrorMessage message={error} />
        <p className="text-sm text-slate-300">
          Original latest finish: {formatDateTime(s.originalLatestFinishTime)}
          <br />
          Latest allowed time: {formatDateTime(latest)}
        </p>
        <p className="text-xs text-slate-400">
          The {extensionLimitMinutes}-minute limit always starts from your
          original plan, including repeated requests.
        </p>
        <TimeField
          label="New move time"
          value={newTime}
          onChange={setNewTime}
          min={s.agreedMoveByTime}
          max={latest}
        />
        <label className="flex items-start gap-3 text-sm text-amber-200">
          <input
            type="checkbox"
            checked={delay}
            onChange={(e) => setDelay(e.target.checked)}
          />
          <span>
            I also agree to finish charging later. Power may be reduced, but my
            target must be reached by the new agreed time.
          </span>
        </label>
        <p className="text-xs text-slate-400">
          Without this agreement, only your move time changes. Your charging
          deadline stays the same. We check every confirmed plan before applying
          a change.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="text-sm text-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className={buttonClass}>Confirm later time</button>
        </div>
      </form>
    </div>
  );
}
