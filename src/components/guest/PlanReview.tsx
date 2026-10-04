import { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatDateTime, formatDurationMinutes } from '../../utils/time';
import { TimeField, ErrorMessage, buttonClass } from './GuestFields';
export function PlanReview({
  onBackToEdit,
  onConfirmed,
}: {
  onBackToEdit: () => void;
  onConfirmed: () => void;
}) {
  const { activeSession: s, confirmPlan, predictions } = useSimulation();
  const [move, setMove] = useState(s?.agreedMoveByTime || ''),
    [error, setError] = useState<string | null>(null);
  if (!s) return null;
  const p = predictions[s.requestId];
  const available =
    !!p?.fastest &&
    !!p?.fullLoad &&
    p.feasible &&
    Date.parse(p.fullLoad) <= Date.parse(s.useByTime);
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold text-white">Your charging plan</h1>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <ErrorMessage message={error} />
        <p className="text-sm text-slate-300">
          Current battery: {s.initialSocPercent}% · Target battery:{' '}
          {s.targetPercent}%
        </p>
        <p className="text-xs text-slate-400">
          Your vehicle supports up to {s.maxChargeKw} kW AC. Actual charging
          power varies. Charging losses are ignored.
        </p>
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-2">
          <p className="text-sm text-slate-400">Estimated completion window</p>
          <p className="font-mono text-lg text-emerald-300">
            {s.completionWindowStart
              ? formatDateTime(s.completionWindowStart)
              : 'Temporarily unavailable'}{' '}
            —{' '}
            {s.completionWindowEnd
              ? formatDateTime(s.completionWindowEnd)
              : 'Temporarily unavailable'}
          </p>
          <p className="text-xs text-slate-400">
            No competition — full occupancy with capped equal sharing. Other
            bays use known AC limits where available, otherwise the charger
            limit. No queue jumping or indefinite pauses.
          </p>
        </div>
        {p?.waitMinutes !== null && (
          <p className="text-sm text-slate-300">
            Estimated wait: {formatDurationMinutes(p?.waitMinutes || 0)}.
            Charging after you plug in:{' '}
            {p?.fastestMinutes !== null
              ? formatDurationMinutes(Math.ceil(p?.fastestMinutes || 0))
              : 'unavailable'}
            –
            {p?.fullLoadMinutes !== null
              ? formatDurationMinutes(Math.ceil(p?.fullLoadMinutes || 0))
              : 'unavailable'}
            .
          </p>
        )}
        <p className="text-xs text-amber-300">
          Queue timing assumes cars leave by their agreed move time and you plug
          in when invited. Unconfirmed delays cannot have a guaranteed finite
          estimate.
        </p>
        {!available && (
          <ErrorMessage
            message={`We cannot confirm this plan before you need your car. ${p?.deficitKwh ? `${p.deficitKwh.toFixed(1)} kWh may be missing. ` : ''}Choose a lower target or a later time.`}
          />
        )}
        <TimeField
          label="Move your car by"
          value={move}
          onChange={setMove}
          max={s.useByTime}
        />
        <p className="text-xs text-slate-400">
          Your original latest completion time is protected after confirmation.
          A later move time alone does not delay charging.
        </p>
        <div className="flex justify-between gap-3">
          <button className="text-sm text-slate-300" onClick={onBackToEdit}>
            Edit request
          </button>
          <button
            className={buttonClass}
            disabled={!available}
            onClick={() => {
              const result = confirmPlan(s.requestId, move);
              if (result.success) onConfirmed();
              else setError(result.error || 'Unable to confirm.');
            }}
          >
            Confirm plan
          </button>
        </div>
      </div>
    </div>
  );
}
