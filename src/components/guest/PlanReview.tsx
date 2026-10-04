import { guestLabel, vehicleTypeLabel } from '../../utils/guestIdentity';
import { getVehicleType } from '../../data/vehicleTypes';
import { useState, useEffect } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import {
  addMinutesToIso,
  formatDateTime,
  formatDurationMinutes,
} from '../../utils/time';
import { TimeField, ErrorMessage, buttonClass } from './GuestFields';
export function PlanReview({
  onBackToEdit,
  onConfirmed,
}: {
  onBackToEdit: () => void;
  onConfirmed: () => void;
}) {
  const {
    activeSession: s,
    sessions,
    confirmPlan,
    predictions,
    getMovePreview,
    extensionLimitMinutes,
  } = useSimulation();
  const [step, setStep] = useState(2);
  const [move, setMove] = useState(s?.agreedMoveByTime || '');
  const [method, setMethod] = useState<'self' | 'valet'>('self');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = s ? getMovePreview(s.requestId, move) : null;
  useEffect(
    () => setAccepted(false),
    [preview?.expectedPercent, preview?.requiresAcceptance],
  );
  if (!s) return null;
  const p = predictions[s.requestId];
  const available = !!s.completionWindowStart && !!s.completionWindowEnd;
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold text-white">
        {guestLabel(s, sessions)}
      </h1>
      <p className="text-sm text-slate-400">
        Your charging plan · {vehicleTypeLabel(s)}
      </p>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <ErrorMessage message={error} />
        <p className="text-sm text-slate-300">
          Step {step} ·{' '}
          {step === 2
            ? 'Review your estimate'
            : step === 3
              ? 'Choose how and when to move'
              : 'Confirm your arrangement'}
        </p>
        <p className="text-sm text-slate-300">
          {s.vehicleType ? getVehicleType(s.vehicleType)?.label : ''} · Current
          battery: {s.initialSocPercent}% · Target battery: {s.targetPercent}%
        </p>
        <p className="text-xs text-slate-400">
          Your vehicle supports up to {s.maxChargeKw} kW AC. Charging losses are
          ignored.
        </p>
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-2">
          <p className="text-sm text-slate-400">Estimated completion window</p>
          <p className="text-lg text-emerald-300">
            {available
              ? `${formatDateTime(s.completionWindowStart)} — ${formatDateTime(s.completionWindowEnd)}`
              : 'Temporarily unavailable'}
          </p>
          <p className="text-xs text-slate-400">
            Earliest: no power competition. Latest: full occupancy with capped
            equal sharing, extended where existing reservations require it.
            Assumes arrivals plug in and cars leave on time; indefinite pauses
            or queue jumping cannot guarantee a latest finish.
          </p>
        </div>
        <p className="text-sm text-slate-300">
          Expected finish:{' '}
          {p?.expected ? formatDateTime(p.expected) : 'Temporarily unavailable'}
        </p>
        <p className="text-xs text-slate-400">
          Arrival: {formatDateTime(s.arrivalTime)}. Wait after arrival:{' '}
          {p?.waitMinutes != null
            ? formatDurationMinutes(p.waitMinutes)
            : 'unknown'}
          . Charging duration:{' '}
          {p?.fastestMinutes != null
            ? formatDurationMinutes(p.fastestMinutes)
            : 'unknown'}
          –
          {p?.fullLoadMinutes != null
            ? formatDurationMinutes(p.fullLoadMinutes)
            : 'unknown'}
          .
        </p>
        {step >= 3 && (
          <>
            <div className="flex gap-4 text-sm text-slate-300">
              {(['self', 'valet'] as const).map((v) => (
                <label key={v}>
                  <input
                    type="radio"
                    checked={method === v}
                    onChange={() => {
                      setMethod(v);
                      setStep(3);
                    }}
                  />{' '}
                  {v === 'self' ? 'I will move my car' : 'Ask staff to help'}
                </label>
              ))}
            </div>
            {method === 'valet' && (
              <p className="text-xs text-slate-400">
                Staff help requires reception to confirm availability and key
                handover. Your bay remains occupied until reception confirms the
                move.
              </p>
            )}
            <TimeField
              label="Move your car by"
              value={move}
              onChange={(v) => {
                setMove(v);
                setAccepted(false);
                setStep(3);
                setError(null);
              }}
              min={s.arrivalTime}
              max={addMinutesToIso(
                s.originalLatestFinishTime || s.plannedLatestFinishTime,
                extensionLimitMinutes,
              )}
            />
            <ErrorMessage
              message={
                preview?.valid ? null : preview?.error || 'Choose a move time.'
              }
            />
            {preview?.requiresAcceptance && preview.valid && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200 space-y-3">
                <p>
                  You may not reach {s.targetPercent}% by {formatDateTime(move)}
                  . Based on the current plan, your battery is estimated to
                  reach about {preview.expectedPercent.toFixed(1)}% (
                  {preview.deficitKwh.toFixed(1)} kWh below your target).
                </p>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />{' '}
                  I accept that my target may not be reached.
                </label>
                <button
                  className="underline"
                  onClick={() => {
                    setAccepted(false);
                    setStep(3);
                  }}
                >
                  Change time
                </button>
              </div>
            )}
            <p className="text-xs text-slate-400">
              Your original latest finish stays fixed after confirmation. A
              later move time does not delay charging. The move limit is the
              original latest finish plus {extensionLimitMinutes} minutes.
            </p>
          </>
        )}
        {step === 4 && (
          <div className="rounded-xl border border-emerald-500/30 p-4 text-sm text-slate-300 space-y-2">
            <p>Arrival: {formatDateTime(s.arrivalTime)}</p>
            <p>
              Expected finish for this arrangement:{' '}
              {formatDateTime(preview?.expectedFinish)}
            </p>
            <p>
              Your move time: {formatDateTime(move)} ·{' '}
              {method === 'self' ? 'You will move' : 'Staff help requested'}
            </p>
            <p>Charging deadline: {formatDateTime(s.chargingDeadline)}</p>
            {preview?.requiresAcceptance && (
              <p>
                Accepted early departure · expected battery{' '}
                {preview.expectedPercent.toFixed(1)}%
              </p>
            )}
          </div>
        )}
        <div className="flex justify-between gap-3">
          <button className="text-sm text-slate-300" onClick={onBackToEdit}>
            Edit request
          </button>
          {step === 2 ? (
            <button
              className={buttonClass}
              disabled={!available}
              onClick={() => setStep(3)}
            >
              Choose move time
            </button>
          ) : step === 3 ? (
            <button
              className={buttonClass}
              disabled={
                !preview?.valid || (preview.requiresAcceptance && !accepted)
              }
              onClick={() => setStep(4)}
            >
              Review arrangement
            </button>
          ) : (
            <button
              className={buttonClass}
              disabled={
                !preview?.valid || (preview.requiresAcceptance && !accepted)
              }
              onClick={() => {
                const result = confirmPlan(s.requestId, move, accepted, method);
                if (result.success) onConfirmed();
                else setError(result.error || 'Unable to confirm.');
              }}
            >
              {preview?.requiresAcceptance
                ? 'Confirm early departure'
                : 'Confirm booking'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
