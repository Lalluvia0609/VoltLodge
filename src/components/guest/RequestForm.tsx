import { VehicleTypeSelector } from './VehicleTypeSelector';
import type { VehicleTypeId } from '../../types';
import { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { addMinutesToIso, formatDateTime } from '../../utils/time';
import {
  Field,
  TimeField,
  ErrorMessage,
  fieldClass,
  buttonClass,
} from './GuestFields';

export function RequestForm({
  onPlanCreated,
  registrationMode = 'register_now',
}: {
  onPlanCreated: (id: string) => void;
  registrationMode?: 'book_ahead' | 'register_now';
}) {
  const { currentTimeIso, submitRequest, activeSession } = useSimulation();
  const draft =
    activeSession?.status === 'pending_confirmation' ? activeSession : null;
  const [vehicleType, setVehicleType] = useState<VehicleTypeId>(
    draft?.vehicleType || 'A',
  );
  const [guestName, setGuestName] = useState(draft?.guestName || ''),
    [roomNumber, setRoomNumber] = useState(draft?.roomNumber || '');
  const [current, setCurrent] = useState(draft?.initialSocPercent ?? 40),
    [target, setTarget] = useState(draft?.targetPercent ?? 80);
  const [arrival, setArrival] = useState(
    draft?.arrivalTime || addMinutesToIso(currentTimeIso, 60),
  );
  const [error, setError] = useState<string | null>(null);
  const number = (
    label: string,
    value: number,
    set: (v: number) => void,
    min: number,
    max?: number,
  ) => (
    <Field label={label}>
      <input
        aria-label={label}
        required
        className={fieldClass}
        type="number"
        step="any"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) =>
          set(e.target.value === '' ? NaN : Number(e.target.value))
        }
      />
    </Field>
  );
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold text-white">
        {registrationMode === 'book_ahead' ? 'Book ahead' : 'Register now'}
      </h1>
      <p className="text-sm text-slate-400">
        Step 1 · Tell us your battery target. Choose your move time after seeing
        the estimate.
      </p>
      <form
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const result = submitRequest({
            vehicleType,
            guestName,
            roomNumber,
            inputMode: 'percentage',
            registrationMode,
            arrivalTime:
              registrationMode === 'book_ahead' ? arrival : currentTimeIso,
            currentPercent: current,
            targetPercent: target,
            requestedMoveTime: '',
            moveMethod: 'self',
          });
          if (result.success && result.requestId)
            onPlanCreated(result.requestId);
          else setError(result.error || 'Unable to create a plan.');
        }}
      >
        <ErrorMessage message={error} />
        {registrationMode === 'book_ahead' ? (
          <>
            <TimeField
              label="Expected arrival"
              value={arrival}
              onChange={setArrival}
              min={currentTimeIso}
            />
            <p className="text-xs text-slate-400">
              Current battery below means your expected battery on arrival.
              Confirm the actual level when you arrive.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-300">
            Arrival: {formatDateTime(currentTimeIso)} · current simulation time
          </p>
        )}
        <VehicleTypeSelector value={vehicleType} onChange={setVehicleType} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Your name">
            <input
              className={fieldClass}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </Field>
          <Field label="Room">
            <input
              className={fieldClass}
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
            />
          </Field>
          {number('Current battery (%)', current, setCurrent, 0, 99.99)}
          {number('Target battery (%)', target, setTarget, 0, 100)}
        </div>
        <p className="text-xs text-slate-400">
          Simulation values, not verified vehicle specifications. AC charging
          only. This estimate ignores charging losses.
        </p>
        <button className={buttonClass}>Show completion estimate</button>
      </form>
    </div>
  );
}
