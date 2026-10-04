import React from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatTimeOnly, getMinutesDiff } from '../../utils/time';
import { Hourglass, Clock, Zap, Car, AlertCircle } from 'lucide-react';

export const QueueManager: React.FC = () => {
  const { sessions, currentTimeIso, bays } = useSimulation();

  const queuedSessions = sessions.filter((s) => s.status === 'waiting_bay').sort((a, b) => Date.parse(a.arrivalTime) - Date.parse(b.arrivalTime));
  const vacantBayCount = bays.filter((b) => b.currentStatus === 'vacant').length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Hourglass className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-bold text-white">Bays Waiting Queue</h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
            {queuedSessions.length} in line
          </span>
        </div>

        <div className="text-xs text-slate-400">
          Arrival-Order FIFO with Urgency Pre-Check
        </div>
      </div>

      {queuedSessions.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs">
          No vehicles waiting in line. All arriving guests currently accommodated.
        </div>
      ) : (
        <div className="space-y-3">
          {queuedSessions.map((s, index) => {
            const waitMins = Math.max(0, getMinutesDiff(s.arrivalTime, currentTimeIso));
            const timeUntilDeparture = Math.max(0, getMinutesDiff(currentTimeIso, s.useByTime));

            return (
              <div
                key={s.requestId}
                className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-mono font-bold flex items-center justify-center text-xs">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-white">
                      {s.vehicleId}
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      {s.guestName} · Room {s.roomNumber}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Requested</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {s.targetKwh.toFixed(1)} kWh
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Departure</span>
                    <span className="font-mono font-bold text-amber-300">
                      {formatTimeOnly(s.useByTime)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Queue Wait</span>
                    <span className="font-mono text-slate-300">
                      {waitMins}m
                    </span>
                  </div>

                  {index === 0 && (
                    <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Next in Line
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
