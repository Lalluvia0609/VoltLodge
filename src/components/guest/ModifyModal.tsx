import { VehicleTypeSelector } from './VehicleTypeSelector';
import { getVehicleType } from '../../data/vehicleTypes';
import type { VehicleTypeId } from '../../types';
import { addMinutesToIso } from '../../utils/time';
import { useState, useEffect } from 'react';
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
  const {
    sessions,
    modifyRequest,
    cancelRequest,
    getMovePreview,
    extensionLimitMinutes,
  } = useSimulation();
  const s = sessions.find((s) => s.requestId === requestId);
  const [target, setTarget] = useState(s?.targetPercent || 80),
    [vehicleType, setVehicleType] = useState<VehicleTypeId>(
      s?.vehicleType || 'A',
    ),
    [move, setMove] = useState(s?.agreedMoveByTime || ''),
    [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const preview = s
    ? getMovePreview(requestId, move, target, vehicleType)
    : null;
  useEffect(
    () => setAccepted(false),
    [preview?.expectedPercent, preview?.requiresAcceptance],
  );
  if (!isOpen || !s) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <form
        className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const result = modifyRequest(
            requestId,
            target,
            vehicleType,
            move,
            accepted,
          );
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
              (s.deliveredKwh /
                (getVehicleType(vehicleType)?.batteryCapacityKwh ||
                  s.batteryCapacityKwh)) *
                100
            }
            max={100}
            step="any"
            value={target}
            onChange={(e) => {
              setTarget(Number(e.target.value));
              setAccepted(false);
            }}
          />
        </Field>
        <VehicleTypeSelector
          value={vehicleType}
          onChange={(value) => {
            setVehicleType(value);
            setAccepted(false);
          }}
        />
        <TimeField
          label="Move your car by"
          value={move}
          onChange={(v) => {
            setMove(v);
            setAccepted(false);
          }}
          max={addMinutesToIso(
            s.originalLatestFinishTime || s.plannedLatestFinishTime,
            extensionLimitMinutes,
          )}
        />
        <p className="text-xs text-slate-400">
          Changing your move time does not extend your charging deadline. Use
          “Request a later time” to explicitly accept delayed charging.
        </p>
        <ErrorMessage
          message={
            preview?.valid
              ? null
              : preview?.error || 'Unable to calculate this arrangement.'
          }
        />
        {preview?.valid && preview.requiresAcceptance && (
          <div className="text-sm text-amber-200 space-y-2">
            <p>
              You may not reach {target}%. Estimated battery at your move time:{' '}
              {preview.expectedPercent.toFixed(1)}% ·{' '}
              {preview.deficitKwh.toFixed(1)} kWh below target.
            </p>
            <label>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />{' '}
              I accept a lower battery at departure.
            </label>
          </div>
        )}
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
          <button
            className={buttonClass}
            disabled={
              !preview?.valid || (preview.requiresAcceptance && !accepted)
            }
          >
            {preview?.requiresAcceptance
              ? 'Confirm early departure'
              : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
