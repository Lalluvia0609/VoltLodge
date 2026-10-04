import { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import {
  Field,
  TimeField,
  ErrorMessage,
  fieldClass,
  buttonClass,
} from './GuestFields';
export function ModifyModal({
  isOpen,
  onClose,
  requestId,
}: {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
}) {
  const { sessions, modifyRequest, cancelRequest } = useSimulation();
  const s = sessions.find((s) => s.requestId === requestId);
  const [target, setTarget] = useState(s?.targetPercent || 80),
    [ac, setAc] = useState(s?.maxChargeKw || 11),
    [useBy, setUseBy] = useState(s?.useByTime || ''),
    [move, setMove] = useState(s?.agreedMoveByTime || ''),
    [error, setError] = useState<string | null>(null);
  if (!isOpen || !s) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <form
        className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const result = modifyRequest(requestId, target, useBy, ac, move);
          if (result.success) onClose();
          else setError(result.error || 'Unable to change this plan.');
        }}
      >
        <h2 className="text-lg font-bold text-white">
          Change your charging plan
        </h2>
        <ErrorMessage message={error} />
        <Field label="Target battery (%)">
          <input
            required
            className={fieldClass}
            type="number"
            min={
              s.initialSocPercent +
              (s.deliveredKwh / s.batteryCapacityKwh) * 100
            }
            max={100}
            step="any"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </Field>
        <Field label="Vehicle maximum AC power (kW)">
          <input
            required
            className={fieldClass}
            type="number"
            min={0.1}
            step="any"
            value={ac}
            onChange={(e) => setAc(Number(e.target.value))}
          />
        </Field>
        <TimeField label="Need your car by" value={useBy} onChange={setUseBy} />
        <TimeField
          label="Move your car by"
          value={move}
          onChange={setMove}
          max={useBy}
        />
        <p className="text-xs text-slate-400">
          Changing your use-by or move time does not extend your charging
          deadline. Use “Request a later time” to explicitly accept delayed
          charging.
        </p>
        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            className="text-sm text-rose-300"
            onClick={() => {
              cancelRequest(requestId);
              onClose();
            }}
          >
            Stop charging
          </button>
          <button
            type="button"
            className="text-sm text-slate-300"
            onClick={onClose}
          >
            Close
          </button>
          <button className={buttonClass}>Save changes</button>
        </div>
      </form>
    </div>
  );
}
