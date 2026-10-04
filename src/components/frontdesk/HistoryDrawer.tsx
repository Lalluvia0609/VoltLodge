import { guestLabel, guestDetails } from '../../utils/guestIdentity';
import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { getVehicleType } from '../../data/vehicleTypes';
import { formatDateTime, formatTimeOnly } from '../../utils/time';
import {
  History,
  Search,
  Download,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

export const HistoryDrawer: React.FC = () => {
  const { historyRecords } = useSimulation();
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = historyRecords.filter(
    (r) =>
      r.vehicleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guestLabel(r, historyRecords)
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      r.requestId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="text-base font-bold text-white">
            Historical Charging & Bay Turnover Log
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300">
            {historyRecords.length} records
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by name, room or booking..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-48 sm:w-64"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No archived records yet. Reception-confirmed moves and cancellations
          without a bay will appear here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Guest / Booking</th>
                <th className="py-2.5 px-3">Target vs Delivered</th>
                <th className="py-2.5 px-3">Target Status</th>
                <th className="py-2.5 px-3">Scheduled Move</th>
                <th className="py-2.5 px-3">Actual Released</th>
                <th className="py-2.5 px-3">Overstay</th>
                <th className="py-2.5 px-3">Turnover</th>
                <th className="py-2.5 px-3">Simulated Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filtered.map((record) => (
                <tr
                  key={record.id}
                  className="hover:bg-slate-800/30 transition"
                >
                  <td className="py-3 px-3">
                    <span className="font-mono font-bold text-white block">
                      {guestLabel(record, historyRecords)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {guestDetails(record)}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono">
                    <details className="text-xs text-slate-400 mb-2">
                      <summary className="cursor-pointer text-emerald-300">
                        Archive details
                      </summary>
                      <div className="space-y-1 mt-2 font-sans">
                        <p>
                          Vehicle type:{' '}
                          {record.vehicleType
                            ? getVehicleType(record.vehicleType)?.label
                            : 'Custom simulation vehicle'}
                        </p>
                        <p>Booking: {record.requestId}</p>
                        <p>
                          Target battery: {record.targetPercent.toFixed(1)}% ·
                          Actual battery: {record.actualPercent.toFixed(1)}%
                        </p>
                        <p>
                          Started:{' '}
                          {record.chargingStartedAt
                            ? formatDateTime(record.chargingStartedAt)
                            : 'Not started'}
                        </p>
                        <p>
                          Target reached:{' '}
                          {record.chargingCompletedAt
                            ? formatDateTime(record.chargingCompletedAt)
                            : 'Not reached'}
                        </p>
                        <p>
                          Stopped:{' '}
                          {record.chargingStoppedAt
                            ? formatDateTime(record.chargingStoppedAt)
                            : 'Not started'}
                        </p>
                        <p>
                          Moved:{' '}
                          {record.actualMoveTime
                            ? formatDateTime(record.actualMoveTime)
                            : 'No bay occupied'}
                        </p>
                        <p>Archived: {formatDateTime(record.archivedAt)}</p>
                        <p>
                          {record.acceptedEarlyDeparture
                            ? `Guest accepted early departure · ${record.earlyDepartureDeficitKwh.toFixed(1)} kWh below target`
                            : 'No accepted early departure'}
                        </p>
                        {record.valetTask && (
                          <p>
                            Staff assistance: {record.valetTask.status} ·{' '}
                            {record.valetTask.staffAssigned || 'Unassigned'} ·{' '}
                            {record.valetTask.destinationBay ||
                              'No destination'}{' '}
                            ·{' '}
                            {record.valetTask.completedAt
                              ? formatDateTime(record.valetTask.completedAt)
                              : 'Not completed'}
                          </p>
                        )}
                        <p>
                          Final late-move penalty: $
                          {record.penalty.penaltyAmount.toFixed(2)} NZD ·{' '}
                          {record.penalty.lateMinutes.toFixed(1)} minutes late
                        </p>
                        <p>
                          {record.penalty.penaltyReason ||
                            'No late-move penalty'}
                        </p>
                        <p>{record.notes}</p>
                      </div>
                    </details>
                    <span className="text-white font-bold">
                      {record.actualDeliveredKwh}
                    </span>{' '}
                    / {record.targetKwh} kWh
                  </td>
                  <td className="py-3 px-3">
                    {record.targetAchieved ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        100% Achieved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-400 text-[11px] font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {record.outcomeReason || 'Shortfall'}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-400">
                    {formatTimeOnly(record.scheduledMoveTime)}
                  </td>
                  <td className="py-3 px-3 font-mono text-white">
                    {record.hadBay
                      ? formatDateTime(record.actualReleaseTime)
                      : 'Cancelled without a bay'}
                  </td>
                  <td className="py-3 px-3">
                    {record.overstayMinutes > 0 ? (
                      <span className="font-mono font-bold text-rose-400">
                        +{record.overstayMinutes}m
                      </span>
                    ) : (
                      <span className="text-slate-500 font-mono">On Time</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {record.valetUsed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300 text-[11px]">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Valet
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">
                        Self-Move
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono">
                    {record.simulatedFeeCharged > 0 ? (
                      <span className="text-amber-400 font-bold">
                        ${record.simulatedFeeCharged.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-500">$0.00</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
