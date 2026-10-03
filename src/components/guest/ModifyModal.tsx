import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { Sliders, Trash2, AlertCircle, X, Check } from 'lucide-react';

interface ModifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
}

export const ModifyModal: React.FC<ModifyModalProps> = ({ isOpen, onClose, requestId }) => {
  const { modifyRequest, cancelRequest, sessions } = useSimulation();
  const session = sessions.find((s) => s.requestId === requestId);

  const [newTargetKwh, setNewTargetKwh] = useState(session ? session.targetKwh : 20);
  const [newUseByTime, setNewUseByTime] = useState(session ? session.useByTime : '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !session) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const res = modifyRequest(session.requestId, Number(newTargetKwh), newUseByTime);
    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Failed to modify request');
    }
  };

  const handleCancelSession = () => {
    if (confirm(`Are you sure you want to cancel the charging request for ${session.vehicleId}?`)) {
      cancelRequest(session.requestId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Modify Charging Request</h3>
              <p className="text-xs text-slate-400">EV11 – Adjust Target or Cancel Session</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
            <div>
              Vehicle: <span className="font-mono text-white font-bold">{session.vehicleId}</span>
            </div>
            <div>
              Delivered so far:{' '}
              <span className="font-mono text-emerald-400 font-bold">
                {session.deliveredKwh.toFixed(1)} kWh
              </span>{' '}
              (Target: {session.targetKwh} kWh)
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              New Energy Target (kWh)
            </label>
            <input
              type="number"
              step="0.5"
              min={Math.ceil(session.deliveredKwh)}
              max={session.batteryCapacityKwh}
              value={newTargetKwh}
              onChange={(e) => setNewTargetKwh(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Minimum allowed is {session.deliveredKwh.toFixed(1)} kWh (already delivered energy cannot be lowered).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              New Departure / Use-By Time
            </label>
            <input
              type="datetime-local"
              value={newUseByTime.slice(0, 16)}
              onChange={(e) => setNewUseByTime(new Date(e.target.value).toISOString())}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleCancelSession}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium border border-rose-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Cancel Session</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold text-white shadow-md"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
