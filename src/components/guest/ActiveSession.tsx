import { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatDateTime } from '../../utils/time';
import { remainingEnergy } from '../../utils/allocation';
import { ValetModal } from './ValetModal';
import { ExtensionModal } from './ExtensionModal';
import { ModifyModal } from './ModifyModal';
import { buttonClass } from './GuestFields';
export function ActiveSession() {
  const { activeSession: s, predictions, reportVehicleMoved } = useSimulation();
  const [valet, setValet] = useState(false),
    [extension, setExtension] = useState(false),
    [modify, setModify] = useState(false);
  if (!s)
    return (
      <p className="p-8 text-center text-slate-400">
        Choose a vehicle in the simulation area or create a charging plan.
      </p>
    );
  const p = predictions[s.requestId],
    current = Math.min(
      100,
      s.initialSocPercent + (s.deliveredKwh / s.batteryCapacityKwh) * 100,
    ),
    done = remainingEnergy(s) < 1e-7;
  const status = s.bayReleasedAt
    ? 'Car moved'
    : done
      ? 'Target reached'
      : s.moveReportedAt
        ? 'Waiting for reception to confirm'
        : s.status === 'waiting_bay'
          ? 'Waiting for a bay'
          : s.status === 'waiting_plugin'
            ? 'Your bay is reserved'
            : s.status === 'cancelled'
              ? 'Charging stopped'
              : s.status === 'ended_incomplete'
                ? 'Charging deadline reached'
                : s.status === 'paused'
                  ? 'Charging paused'
                  : 'Charging';
  const action = s.bayReleasedAt
    ? 'Your charging session has ended.'
    : s.moveReportedAt
      ? 'Reception will check that your bay is clear.'
      : s.status === 'waiting_plugin'
        ? 'Please park in your reserved bay, plug in, and ask reception to confirm.'
        : s.status === 'waiting_bay'
          ? 'Please wait. We will invite you when a bay is available.'
          : done || s.status === 'cancelled' || s.status === 'ended_incomplete'
            ? `Please move your car by ${formatDateTime(s.agreedMoveByTime)}.`
            : 'You can leave your car charging. We will let you know when your target is reached.';
  const items = [
    ['Current battery', `${current.toFixed(1)}%`],
    ['Target battery', `${s.targetPercent.toFixed(1)}%`],
    [
      'Estimated completion window',
      `${formatDateTime(s.completionWindowStart)} — ${formatDateTime(s.completionWindowEnd)}`,
    ],
    [
      'Expected finish now',
      done
        ? `Target reached · ${formatDateTime(s.targetReachedAt)}`
        : p?.expected
          ? formatDateTime(p.expected)
          : 'Temporarily unavailable',
    ],
    ['Charging deadline', formatDateTime(s.chargingDeadline)],
    ['Move your car by', formatDateTime(s.agreedMoveByTime)],
    ['Need your car by', formatDateTime(s.useByTime)],
  ];
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold text-white">
            {s.vehicleId}
          </h1>
          <p className="text-sm text-emerald-300 mt-2">{status}</p>
        </div>
        {!s.bayReleasedAt && (
          <button
            className="text-sm text-slate-300"
            onClick={() => setModify(true)}
          >
            Change target
          </button>
        )}
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex justify-between gap-4">
          <p className="text-slate-300">
            Added{' '}
            <strong className="font-mono text-white">
              {s.deliveredKwh.toFixed(1)} kWh
            </strong>
            <br />
            Still needed{' '}
            <strong className="font-mono text-white">
              {remainingEnergy(s).toFixed(1)} kWh
            </strong>
          </p>
          <p className="text-right text-emerald-300 font-mono text-2xl">
            {s.allocatedKw.toFixed(1)} kW
          </p>
        </div>
        <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${current}%` }}
          />
        </div>
        <p className="text-xs text-slate-400">
          Your vehicle supports up to {s.maxChargeKw} kW AC. This is a limit,
          not your current charging rate. Charging losses are ignored.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-800 bg-slate-950 p-3"
            >
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-sm text-white mt-1">{value}</p>
            </div>
          ))}
        </div>
        {!done && (
          <p className="text-xs text-slate-400">
            No competition now:{' '}
            {p?.fastest ? formatDateTime(p.fastest) : 'unavailable'}. Full
            occupancy now:{' '}
            {p?.fullLoad ? formatDateTime(p.fullLoad) : 'unavailable'}.
            Estimates use remaining energy and the stated capped-sharing
            assumption.
          </p>
        )}
        {s.status === 'waiting_bay' && (
          <p className="text-sm text-amber-300">
            Estimated wait:{' '}
            {p?.waitMinutes !== null
              ? `${Math.ceil(p?.waitMinutes || 0)} minutes`
              : 'unknown until a bay is confirmed clear'}
            . Charging afterwards:{' '}
            {p?.fastestMinutes !== null
              ? `${Math.ceil(p?.fastestMinutes || 0)}–${Math.ceil(p?.fullLoadMinutes || 0)} minutes`
              : 'temporarily unavailable'}
            .
          </p>
        )}
        {!done && (p?.deficitKwh || 0) > 0.01 && (
          <p role="alert" className="text-sm text-rose-300">
            Current arrangement cannot meet the target: approximately{' '}
            {p.deficitKwh.toFixed(1)} kWh missing. Please contact reception.
          </p>
        )}
      </div>
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
        <p className="text-sm text-emerald-200">{action}</p>
        {s.bayId && !s.moveReportedAt && (
          <div className="flex flex-wrap gap-3">
            <button
              className={buttonClass}
              onClick={() => reportVehicleMoved(s.requestId)}
            >
              I have moved my car
            </button>
            <button
              className="text-sm text-slate-200"
              onClick={() => setValet(true)}
            >
              Ask staff to help
            </button>
          </div>
        )}
        {!s.bayReleasedAt && (
          <button
            className="text-sm text-amber-300"
            onClick={() => setExtension(true)}
          >
            Request a later time
          </button>
        )}
      </div>
      {valet && (
        <ValetModal
          key={s.requestId}
          isOpen
          onClose={() => setValet(false)}
          requestId={s.requestId}
        />
      )}
      {extension && (
        <ExtensionModal
          key={s.requestId}
          isOpen
          onClose={() => setExtension(false)}
          requestId={s.requestId}
        />
      )}
      {modify && (
        <ModifyModal
          key={s.requestId}
          isOpen
          onClose={() => setModify(false)}
          requestId={s.requestId}
        />
      )}
    </div>
  );
}
