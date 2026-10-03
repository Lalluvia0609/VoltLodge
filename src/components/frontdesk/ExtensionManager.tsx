import React from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { formatTimeOnly } from '../../utils/time';
import { Clock, Check, X, AlertTriangle } from 'lucide-react';

export const ExtensionManager: React.FC = () => {
  const { sessions, reviewExtensionRequest } = useSimulation();

  const extensionRequests = sessions
    .filter((s) => s.extensionRequest)
    .map((s) => ({ session: s, request: s.extensionRequest! }));

  if (extensionRequests.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-white">Parking Extension Applications</h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
            {extensionRequests.filter((r) => r.request.status === 'pending').length} pending
          </span>
        </div>
        <span className="text-xs text-slate-400">EV12 Workflow</span>
      </div>

      <div className="space-y-3">
        {extensionRequests.map(({ session, request }) => (
          <div
            key={session.requestId}
            className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-white">{session.vehicleId}</span>
                <span className="text-slate-400">Room {session.roomNumber}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                    request.status === 'approved'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : request.status === 'rejected'
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {request.status}
                </span>
              </div>
              <p className="text-slate-300 mt-1">
                Reason: <span className="italic text-slate-400">"{request.reason}"</span>
              </p>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Current deadline: {formatTimeOnly(request.currentDeadline)} → Requested:{' '}
                <strong className="text-amber-300 font-mono">
                  {formatTimeOnly(request.requestedDeadline)}
                </strong>
              </div>
            </div>

            {request.status === 'pending' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => reviewExtensionRequest(session.requestId, false)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-medium transition"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Decline</span>
                </button>
                <button
                  onClick={() => reviewExtensionRequest(session.requestId, true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Approve (+30m)</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
