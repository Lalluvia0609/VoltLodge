import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatDateTime, formatTimeOnly } from '../../utils/time';
import { History, Search, Download, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export const HistoryDrawer: React.FC = () => {
  const { historyRecords } = useSimulation();
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = historyRecords.filter(
    (r) =>
      r.vehicleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.guestName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="text-base font-bold text-white">Historical Charging & Bay Turnover Log</h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300">
            {historyRecords.length} records
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by vehicle or guest..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-48 sm:w-64"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No historical records yet. Completed sessions will be permanently recorded here upon bay release.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Vehicle / Guest</th>
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
                <tr key={record.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3">
                    <span className="font-mono font-bold text-white block">
                      {record.vehicleId}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {record.guestName} (Room {record.roomNumber})
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono">
                    <span className="text-white font-bold">{record.actualDeliveredKwh}</span> / {record.targetKwh} kWh
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
                        Shortfall
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-400">
                    {formatTimeOnly(record.scheduledMoveTime)}
                  </td>
                  <td className="py-3 px-3 font-mono text-white">
                    {formatTimeOnly(record.actualReleaseTime)}
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
                      <span className="text-slate-400 text-[11px]">Self-Move</span>
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
