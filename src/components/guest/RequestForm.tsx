import { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { addMinutesToIso } from '../../utils/time';
import {
  Field,
  TimeField,
  ErrorMessage,
  fieldClass,
  buttonClass,
} from './GuestFields';

// Fictional AC presets for this simulation, not verified production models.
const models = [
  { name: 'Simulation A', capacity: 60, ac: 11 },
  { name: 'Simulation B', capacity: 60, ac: 11 },
  { name: 'Simulation C', capacity: 64, ac: 9 },
  { name: 'Simulation D', capacity: 75, ac: 12 },
];
export function RequestForm({
  onPlanCreated,
}: {
  onPlanCreated: (id: string) => void;
}) {
  const { currentTimeIso, submitRequest, activeSession } = useSimulation();
  const draft =
    activeSession?.status === 'pending_confirmation' ? activeSession : null;
  const [vehicleId, setVehicleId] = useState(
    draft?.vehicleId || 'EV-' + Math.floor(100 + Math.random() * 900),
  );
  const [guestName, setGuestName] = useState(draft?.guestName || ''),
    [roomNumber, setRoomNumber] = useState(draft?.roomNumber || '');
  const [capacity, setCapacity] = useState(draft?.batteryCapacityKwh ?? 60),
    [ac, setAc] = useState(draft?.maxChargeKw ?? 11);
  const [current, setCurrent] = useState(draft?.initialSocPercent ?? 40),
    [target, setTarget] = useState(draft?.targetPercent ?? 80);
  const [useBy, setUseBy] = useState(
    draft?.useByTime || addMinutesToIso(currentTimeIso, 480),
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
      <h1 className="text-2xl font-bold text-white">Plan your charge</h1>
      <p className="text-sm text-slate-400">
        Choose your battery target and when you need your car.
      </p>
      <form
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const result = submitRequest({
            vehicleId,
            guestName,
            roomNumber,
            inputMode: 'percentage',
            batteryCapacityKwh: capacity,
            currentPercent: current,
            targetPercent: target,
            maxChargeKw: ac,
            useByTime: useBy,
            requestedMoveTime: '',
            moveMethod: 'self',
          });
          if (result.success && result.requestId)
            onPlanCreated(result.requestId);
          else setError(result.error || 'Unable to create a plan.');
        }}
      >
        <ErrorMessage message={error} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Vehicle registration">
            <input
              className={fieldClass}
              required
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            />
          </Field>
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
          <Field label="Simulation vehicle preset">
            <select
              className={fieldClass}
              defaultValue=""
              onChange={(e) => {
                const model = models[Number(e.target.value)];
                if (model) {
                  setCapacity(model.capacity);
                  setAc(model.ac);
                }
              }}
            >
              <option value="" disabled>
                Choose, or enter manually
              </option>
              {models.map((m, i) => (
                <option key={m.name} value={i}>
                  {m.name} · {m.capacity} kWh · {m.ac} kW AC
                </option>
              ))}
            </select>
          </Field>
          {number('Current battery (%)', current, setCurrent, 0, 99.99)}
          {number('Target battery (%)', target, setTarget, 0, 100)}
          {number('Usable battery capacity (kWh)', capacity, setCapacity, 0.1)}
          {number('Vehicle maximum AC power (kW)', ac, setAc, 0.1)}
        </div>
        <p className="text-xs text-slate-400">
          Simulation values, not verified vehicle specifications. AC charging
          only. This estimate ignores charging losses.
        </p>
        <TimeField
          label="Need your car by"
          value={useBy}
          onChange={setUseBy}
          min={currentTimeIso}
        />
        <button className={buttonClass}>Review charging plan</button>
      </form>
    </div>
  );
}
