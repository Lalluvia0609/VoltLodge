import { useSimulation } from '../../context/SimulationContext';
import { guestLabel, guestDetails } from '../../utils/guestIdentity';
import { fieldClass } from '../guest/GuestFields';
export function PenaltySummary() {
  const { sessions, historyRecords, penaltyPolicy, setPenaltyPolicy } =
    useSimulation();
  const identities = [...sessions, ...historyRecords];
  const rows = [
    ...sessions
      .filter((s) => s.bayId)
      .map((s) => ({ identity: s, penalty: s.penalty })),
    ...historyRecords.map((r) => ({ identity: r, penalty: r.penalty })),
  ];
  const total = rows.reduce(
    (sum, row) => sum + (row.penalty?.penaltyAmount || 0),
    0,
  );
  return (
    <section
      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
      aria-label="Late-move penalties"
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold text-white">
          Late-move penalties by booking
        </h2>
        <p className="text-emerald-300">
          Total penalties: ${total.toFixed(2)} NZD
        </p>
      </div>
      <p className="text-xs text-slate-400">
        Simulation only. Starts after the agreed move-by time while the bay is
        occupied. A reported move waits for reception confirmation; the final
        amount uses the confirmed actual move time.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {(['ratePerMinute', 'graceMinutes'] as const).map((key) => (
          <label key={key} className="text-sm text-slate-300">
            {key === 'ratePerMinute'
              ? 'Penalty rate (NZD/min)'
              : 'Late-move grace (minutes)'}
            <input
              aria-label={
                key === 'ratePerMinute'
                  ? 'Penalty rate (NZD/min)'
                  : 'Late-move grace (minutes)'
              }
              type="number"
              min={0}
              step={key === 'ratePerMinute' ? '.01' : '1'}
              className={fieldClass}
              value={penaltyPolicy[key]}
              onChange={(e) => {
                if (e.target.value !== '')
                  setPenaltyPolicy({
                    ...penaltyPolicy,
                    [key]: Number(e.target.value),
                  });
              }}
            />
          </label>
        ))}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead>
              <tr>
                {[
                  'Guest / booking',
                  'Minutes late',
                  'Penalty (NZD)',
                  'Status',
                ].map((label) => (
                  <th key={label} className="p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ identity, penalty }) => (
                <tr
                  key={identity.requestId}
                  data-penalty-request={identity.requestId}
                  className="border-t border-slate-800"
                >
                  <td className="p-2">
                    <p className="text-white">
                      {guestLabel(identity, identities)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {guestDetails(identity)}
                    </p>
                  </td>
                  <td className="p-2">
                    {(penalty?.lateMinutes || 0).toFixed(1)}
                  </td>
                  <td className="p-2">
                    ${(penalty?.penaltyAmount || 0).toFixed(2)}
                  </td>
                  <td className="p-2">
                    {penalty?.penaltyStatus === 'final'
                      ? 'Final'
                      : penalty?.penaltyStatus === 'accruing'
                        ? 'Accruing'
                        : 'No penalty'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          No occupied or archived bookings.
        </p>
      )}
    </section>
  );
}
