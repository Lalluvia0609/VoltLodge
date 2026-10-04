import { guestLabel, guestDetails } from '../../utils/guestIdentity';
import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { Bay } from '../../types';
import { ShieldCheck, AlertCircle, X, Check, Car } from 'lucide-react';

interface BayReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  bay: Bay | null;
}

export const BayReleaseModal: React.FC<BayReleaseModalProps> = ({
  isOpen,
  onClose,
  bay,
}) => {
  const { confirmBayReleased, sessions, staffOnDuty } = useSimulation();

  const [staffOperator, setStaffOperator] = useState(staffOnDuty[0]);
  const [destinationStall, setDestinationStall] =
    useState('Standard Stall #12');
  const [confirmedPhysicalDeparture, setConfirmedPhysicalDeparture] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !bay) return null;

  const currentSession = sessions.find((s) => s.bayId === bay.bayId);
  const bookingDisplay = currentSession
    ? `${guestLabel(currentSession, sessions)} · ${guestDetails(currentSession)}`
    : 'Unknown booking';

  const handleConfirm = () => {
    if (!confirmedPhysicalDeparture) {
      setError(
        'You must visually confirm the vehicle has cleared the bay before releasing.',
      );
      return;
    }

    confirmBayReleased(
      bay.bayId,
      `Inspected and released by ${staffOperator}. Relocated to ${destinationStall}.`,
    );
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
                Confirm Bay Released
              </h3>
              <p className="text-xs text-slate-400">
                EV09 – Physical Turnover Inspection
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

        <div className="space-y-4">
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
            <div className="flex justify-between text-slate-300">
              <span>Charger Bay:</span>
              <span className="font-bold text-white">{bay.name}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Vacating Vehicle:</span>
              <span className="font-mono font-bold text-emerald-400">
                {bookingDisplay}
              </span>
            </div>
            {currentSession && (
              <div className="flex justify-between text-slate-300">
                <span>Charge Delivered:</span>
                <span className="font-mono text-white">
                  {currentSession.deliveredKwh.toFixed(1)} /{' '}
                  {currentSession.targetKwh.toFixed(1)} kWh
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Confirming Staff Member
            </label>
            <select
              value={staffOperator}
              onChange={(e) => setStaffOperator(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
            >
              {staffOnDuty.map((staff) => (
                <option key={staff} value={staff}>
                  {staff}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Vehicle New Relocation Spot
            </label>
            <input
              type="text"
              value={destinationStall}
              onChange={(e) => setDestinationStall(e.target.value)}
              placeholder="e.g. Standard Stall #12 or Left Premises"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={confirmedPhysicalDeparture}
                onChange={(e) =>
                  setConfirmedPhysicalDeparture(e.target.checked)
                }
                className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
              />
              <span>
                I visually verify that{' '}
                <strong className="text-white">{bookingDisplay}</strong> has
                disconnected cable and fully backed out of{' '}
                <strong className="text-white">{bay.name}</strong>.
              </span>
            </label>
          </div>

          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
            ⚡ Releasing this bay will notify the next waiting vehicle and
            reserve this bay. Staff must confirm arrival and plug-in before
            charging starts.
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
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold text-white shadow-md shadow-emerald-500/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Verify & Free Bay</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
