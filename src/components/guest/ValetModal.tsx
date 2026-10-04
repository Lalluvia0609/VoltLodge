import { guestLabel, vehicleTypeLabel } from '../../utils/guestIdentity';
import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { ShieldCheck, Key, AlertCircle, X, Check } from 'lucide-react';

interface ValetModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
}

export const ValetModal: React.FC<ValetModalProps> = ({
  isOpen,
  onClose,
  requestId,
}) => {
  const { requestValetAssistance, sessions } = useSimulation();
  const session = sessions.find((s) => s.requestId === requestId);

  const [authorized, setAuthorized] = useState(true);
  const [keysOption, setKeysOption] = useState<
    'front_desk' | 'room' | 'custom'
  >('front_desk');
  const [customKeyNote, setCustomKeyNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !session) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorized) {
      setError('You must authorize hotel staff to relocate your vehicle.');
      return;
    }

    let note = '';
    if (keysOption === 'front_desk') {
      note = `Keys deposited at Reception drop box (Room ${session.roomNumber}).`;
    } else if (keysOption === 'room') {
      note = `Keys with guest in Room ${session.roomNumber} - call when ready.`;
    } else {
      note = customKeyNote || 'Keys available at front desk.';
    }

    requestValetAssistance(session.requestId, note);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Request Front Desk Valet Move
              </h3>
              <p className="text-xs text-slate-400">
                Hotel Staff Vehicle Relocation
              </p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Conveniently enjoy your dinner, meeting, or sleep. Once your vehicle
            (
            <span className="font-mono font-bold text-emerald-400">
              {guestLabel(session)} · {vehicleTypeLabel(session)}
            </span>
            ) completes its charging target, trained hotel staff will unplug and
            park it into a designated standard parking stall.
          </p>

          {/* Key Drop Location */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-200">
              Where are your vehicle keys located?
            </label>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer hover:border-slate-700">
                <input
                  type="radio"
                  name="keys"
                  checked={keysOption === 'front_desk'}
                  onChange={() => setKeysOption('front_desk')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-slate-200 font-medium">
                  Deposited in Reception Key Drop Box (Recommended)
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer hover:border-slate-700">
                <input
                  type="radio"
                  name="keys"
                  checked={keysOption === 'room'}
                  onChange={() => setKeysOption('room')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-slate-200 font-medium">
                  Currently with me in Room {session.roomNumber}
                </span>
              </label>

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer hover:border-slate-700">
                <input
                  type="radio"
                  name="keys"
                  checked={keysOption === 'custom'}
                  onChange={() => setKeysOption('custom')}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-slate-200 font-medium">
                  Other Instructions
                </span>
              </label>

              {keysOption === 'custom' && (
                <input
                  type="text"
                  placeholder="e.g. Left with Duty Manager Alex at 18:30"
                  value={customKeyNote}
                  onChange={(e) => setCustomKeyNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 mt-1"
                />
              )}
            </div>
          </div>

          {/* Authorization Checkbox */}
          <div className="pt-2 border-t border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
              />
              <span>
                I authorize licensed motel staff to move my vehicle to an
                adjacent standard stall upon charge completion to keep the
                charging bay accessible.
              </span>
            </label>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950 text-[11px] text-slate-400">
            * Note: Submitting displays{' '}
            <strong className="text-amber-400">
              "Pending Front Desk Verification"
            </strong>
            . Staff verifies keys and parking spot availability before
            accepting.
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold text-white shadow-md shadow-emerald-500/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Submit Valet Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
