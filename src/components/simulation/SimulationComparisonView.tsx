import { guestLabel, vehicleTypeLabel } from '../../utils/guestIdentity';
import { completeScenarioVehicles } from '../../utils/archive';
import { useMemo, useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { DEFAULT_POLICIES } from '../../data/presets';
import {
  DEFAULT_ASSUMPTIONS,
  runSimulationPolicy,
} from '../../utils/allocation';
import { addMinutesToIso, formatDateTime } from '../../utils/time';
import { fieldClass, Field } from '../guest/GuestFields';
export function SimulationComparisonView() {
  const {
    allPresets,
    activePresetId,
    loadPreset,
    sessions,
    historyRecords,
    bays,
    sitePowerBudgetKw,
    chargerMaxKw,
    currentTimeIso,
  } = useSimulation();
  const preset =
    allPresets.find((p) => p.id === activePresetId) || allPresets[0];
  const [source, setSource] = useState<'preset' | 'current' | 'complete'>(
    'preset',
  );
  const [power, setPower] = useState(preset.sitePowerBudgetKw),
    [count, setCount] = useState(preset.bayCount),
    [charger, setCharger] = useState(chargerMaxKw);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS),
    [detail, setDetail] = useState('policy_d');
  const completeCars = useMemo(
    () => completeScenarioVehicles(sessions, historyRecords),
    [sessions, historyRecords],
  );
  const cars =
    source === 'preset'
      ? preset.sessions
      : source === 'complete'
        ? completeCars
        : sessions;
  const start =
    source === 'preset'
      ? new Date(preset.simulationStartIso).toISOString()
      : source === 'complete'
        ? new Date(
            Math.min(
              Date.parse(currentTimeIso),
              ...cars
                .map((s) => Date.parse(s.arrivalTime))
                .filter(Number.isFinite),
            ),
          ).toISOString()
        : currentTimeIso;
  const end =
    source === 'preset'
      ? preset.simulationEndIso
      : addMinutesToIso(
          new Date(
            Math.max(
              Date.parse(start),
              ...cars
                .flatMap((s) =>
                  [s.agreedMoveByTime, s.chargingDeadline, s.arrivalTime].map(
                    (v) => Date.parse(v || ''),
                  ),
                )
                .filter(Number.isFinite),
            ),
          ).toISOString(),
          60,
        );
  const results = useMemo(
    () =>
      DEFAULT_POLICIES.map((p) =>
        runSimulationPolicy(
          p,
          cars,
          count,
          charger,
          power,
          start,
          end,
          5,
          assumptions,
        ),
      ),
    [cars, count, charger, power, start, end, assumptions],
  );
  const selected = results.find((r) => r.policyId === detail) || results[0];
  const number = (
    label: string,
    value: number,
    change: (v: number) => void,
    min = 0,
  ) => (
    <Field label={label}>
      <input
        aria-label={label}
        className={fieldClass}
        type="number"
        min={min}
        step="any"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min) change(v);
        }}
      />
    </Field>
  );
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-bold text-white">
          Compare charging arrangements
        </h1>
        <p className="text-sm text-slate-400">
          Equal sharing and adaptive sharing, each with and without move
          management. Every policy uses the same vehicles, AC limits, site power
          and bays.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Data source">
            <select
              aria-label="Data source"
              className={fieldClass}
              value={source}
              onChange={(e) => {
                const value = e.target.value as
                  'preset' | 'current' | 'complete';
                setSource(value);
                setPower(
                  value !== 'preset'
                    ? sitePowerBudgetKw
                    : preset.sitePowerBudgetKw,
                );
                setCount(value !== 'preset' ? bays.length : preset.bayCount);
                setCharger(
                  value !== 'preset' ? chargerMaxKw : preset.chargerMaxKw,
                );
              }}
            >
              <option value="preset">Preset scenario</option>
              <option value="current">Current vehicles</option>
              <option value="complete">
                Complete scenario (current + History)
              </option>
            </select>
          </Field>
          <Field label="Preset scenario">
            <select
              className={fieldClass}
              value={activePresetId}
              disabled={source !== 'preset'}
              onChange={(e) => {
                loadPreset(e.target.value);
                const p = allPresets.find((p) => p.id === e.target.value)!;
                setPower(p.sitePowerBudgetKw);
                setCount(p.bayCount);
                setCharger(p.chargerMaxKw);
              }}
            >
              {allPresets.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {number('Site power (kW)', power, setPower)}
          {number('Charger AC limit (kW)', charger, setCharger, 0.1)}
          {number(
            'Charging bays',
            count,
            (v) => setCount(Math.max(1, Math.floor(v))),
            1,
          )}
        </div>
        <p className="text-xs text-emerald-300">
          Source:{' '}
          {source === 'preset'
            ? 'preset scenario'
            : source === 'complete'
              ? `complete scenario: ${historyRecords.length} archived + ${sessions.filter((s) => s.status !== 'pending_confirmation').length} current vehicles, replayed from arrival`
              : 'current vehicles, current delivered energy and confirmed deadlines'}{' '}
          · {formatDateTime(start)} — {formatDateTime(end)}
        </p>
        <p className="text-xs text-slate-400">
          Drafts are excluded. Complete scenario includes archived vehicles and
          replays their final guest inputs; recorded actual outcomes remain in
          History. Current vehicles includes only active plans. Guest stops
          remain recorded as accepted early departures. Current vehicle edits
          update this comparison. Existing delivered energy is retained. The
          benchmark assumes immediate plug-in after invitation; the live demo
          requires reception confirmation.
        </p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-white">Simulation assumptions</h2>
        <p className="text-xs text-amber-300">
          Move delays are assumptions, not observed behaviour or guaranteed
          benefits. Without management, a car leaves at its agreed move time or
          after 90 minutes of idle occupancy. Without a response, it remains
          until its agreed move time. Staff execute one move at a time.
        </p>
        <div className="grid sm:grid-cols-4 gap-4">
          {number(
            'Guest response delay (minutes)',
            assumptions.selfMoveMinutes,
            (v) => setAssumptions((a) => ({ ...a, selfMoveMinutes: v })),
          )}
          {number(
            'Staff move time (minutes)',
            assumptions.valetMoveMinutes,
            (v) => setAssumptions((a) => ({ ...a, valetMoveMinutes: v })),
          )}
          {number('Available staff', assumptions.staffCount, (v) =>
            setAssumptions((a) => ({ ...a, staffCount: Math.floor(v) })),
          )}
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={assumptions.response}
              onChange={(e) =>
                setAssumptions((a) => ({ ...a, response: e.target.checked }))
              }
            />
            Guests respond to reminders
          </label>
        </div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {results.map((r, i) => (
          <button
            key={r.policyId}
            onClick={() => setDetail(r.policyId)}
            className={`text-left bg-slate-900 rounded-2xl border p-5 space-y-3 ${detail === r.policyId ? 'border-emerald-500' : 'border-slate-800'}`}
          >
            <h2 className="font-semibold text-white">
              {DEFAULT_POLICIES[i].shortName}
            </h2>
            <p className="text-xs text-slate-400">
              {DEFAULT_POLICIES[i].allocationAlgorithm === 'equal_sharing'
                ? 'Capped equal sharing'
                : 'Deadline-based adaptive sharing'}
            </p>
            <p className="text-2xl font-mono text-emerald-300">
              {r.targetSuccessRatePercent.toFixed(1)}% target reached
            </p>
            <p className="text-sm text-slate-300">
              {r.totalDeficitKwh.toFixed(1)} kWh missing
              <br />
              {r.commitmentSuccessRatePercent.toFixed(1)}% promises fulfilled
              <br />
              {r.guestEarlyDepartureCount} accepted early departures ·{' '}
              {r.guestEarlyDepartureDeficitKwh.toFixed(1)} kWh short
            </p>
          </button>
        ))}
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="text-slate-400">
            <tr>
              {[
                'Policy',
                'Power rule',
                'Original target reached',
                'Promises fulfilled',
                'Accepted early departures',
                'Early departure gap kWh',
                'Missing kWh',
                'Avg queue min',
                'Idle bay min',
                'Staff moves',
                'Power breaches',
              ].map((h) => (
                <th className="p-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.policyId} className="border-t border-slate-800">
                <td className="p-3 text-white">
                  {DEFAULT_POLICIES[i].shortName}
                </td>
                <td className="p-3">
                  {DEFAULT_POLICIES[i].allocationAlgorithm === 'equal_sharing'
                    ? 'Equal sharing'
                    : 'Adaptive sharing'}
                </td>
                <td className="p-3">
                  {r.targetSuccessRatePercent.toFixed(1)}%
                </td>
                <td className="p-3">
                  {r.commitmentSuccessRatePercent.toFixed(1)}%
                </td>
                <td className="p-3">{r.guestEarlyDepartureCount}</td>
                <td className="p-3">
                  {r.guestEarlyDepartureDeficitKwh.toFixed(2)}
                </td>
                <td className="p-3">{r.totalDeficitKwh.toFixed(2)}</td>
                <td className="p-3">{r.averageQueueWaitMinutes.toFixed(1)}</td>
                <td className="p-3">
                  {r.totalPostChargeIdleMinutes.toFixed(1)}
                </td>
                <td className="p-3">{r.totalValetMoves}</td>
                <td className="p-3">{r.powerLimitBreaches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white">{selected.policyName}</h2>
        {selected.vehicleOutcomes.map((s) => (
          <div
            key={s.requestId}
            className="grid sm:grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-sm text-slate-300"
          >
            <strong className="text-white">
              {guestLabel(s, selected.vehicleOutcomes)} · {vehicleTypeLabel(s)}
            </strong>
            <span>
              {s.deliveredKwh.toFixed(2)} / {s.targetKwh.toFixed(2)} kWh
            </span>
            <span>
              {s.completedAt
                ? `Target reached ${formatDateTime(s.completedAt)}`
                : 'Target not reached'}{' '}
              · {s.outcomeReason}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
