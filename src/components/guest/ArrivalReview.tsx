import { useState, useEffect } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatDateTime } from '../../utils/time';
import { Field, ErrorMessage, fieldClass, buttonClass } from './GuestFields';
export function ArrivalReview({ requestId }: { requestId: string }) {
  const { sessions, currentTimeIso, getArrivalPreview, confirmArrival } =
    useSimulation();
  const s = sessions.find((s) => s.requestId === requestId)!;
  const [actual, setActual] = useState(s.initialSocPercent);
  const [target, setTarget] = useState(s.targetPercent);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = getArrivalPreview(requestId, actual, target);
  useEffect(
    () => setAccepted(false),
    [preview?.expectedPercent, preview?.requiresAcceptance],
  );
  const arrived = Date.parse(currentTimeIso) >= Date.parse(s.arrivalTime);
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
      <h2 className="text-white font-semibold">
        Confirm your battery on arrival
      </h2>
      <p className="text-sm text-slate-300">
        Expected arrival: {formatDateTime(s.arrivalTime)}. Booked battery:{' '}
        {s.initialSocPercent}%. Charging starts only after you arrive, confirm
        your actual battery, and reception checks the plug.
      </p>
      {arrived && (
        <>
          <Field label="Actual battery on arrival (%)">
            <input
              className={fieldClass}
              type="number"
              min={0}
              max={100}
              value={actual}
              onChange={(e) => {
                setActual(e.target.value === '' ? NaN : Number(e.target.value));
                setAccepted(false);
              }}
            />
          </Field>
          <Field label="Revised target battery (%)">
            <input
              className={fieldClass}
              type="number"
              min={0}
              max={100}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value === '' ? NaN : Number(e.target.value));
                setAccepted(false);
              }}
            />
          </Field>
          <p className="text-xs text-slate-400">
            Booked target: {s.targetPercent}%. You can choose a lower target
            here, or use “Change target or move time” to review your move time
            before confirming arrival.
          </p>
          <ErrorMessage
            message={
              error ||
              (preview?.valid
                ? null
                : preview?.error || 'Enter your actual battery.')
            }
          />
          {preview?.valid && (
            <p className="text-sm text-slate-300">
              Energy needed: {preview.candidate.targetKwh.toFixed(1)} kWh
              (booked: {s.targetKwh.toFixed(1)} kWh). Charging deadline stays{' '}
              {formatDateTime(s.chargingDeadline)}. Expected finish:{' '}
              {formatDateTime(preview.expectedFinish)}.
            </p>
          )}
          {preview?.valid && preview.requiresAcceptance && (
            <label className="block text-sm text-amber-200">
              <p>
                The changed battery affects your plan: about{' '}
                {preview.expectedPercent.toFixed(1)}% at departure,{' '}
                {preview.deficitKwh.toFixed(1)} kWh below target. Change the
                target or move time, or accept this lower battery.
              </p>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />{' '}
              I accept the revised battery estimate.
            </label>
          )}
          <button
            className={buttonClass}
            disabled={
              !preview?.valid || (preview.requiresAcceptance && !accepted)
            }
            onClick={() => {
              const result = confirmArrival(
                requestId,
                actual,
                accepted,
                target,
              );
              if (!result.success)
                setError(result.error || 'Unable to confirm arrival.');
            }}
          >
            Confirm arrival and revised plan
          </button>
        </>
      )}
    </div>
  );
}
