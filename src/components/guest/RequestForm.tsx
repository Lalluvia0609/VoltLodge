import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { addMinutesToIso, formatDateTime } from '../../utils/time';
import { Zap, Clock, ShieldCheck, AlertCircle, Car, ArrowRight } from 'lucide-react';

interface RequestFormProps {
  onPlanCreated: (requestId: string) => void;
}

export const RequestForm: React.FC<RequestFormProps> = ({ onPlanCreated }) => {
  const { currentTimeIso, submitRequest, sitePowerBudgetKw } = useSimulation();

  // Form State
  const [vehicleId, setVehicleId] = useState('EV-NZ' + Math.floor(100 + Math.random() * 900));
  const [guestName, setGuestName] = useState('Sarah Jenkins');
  const [roomNumber, setRoomNumber] = useState('204');
  const [inputMode, setInputMode] = useState<'kwh' | 'percentage'>('percentage');

  // Values
  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState(60);
  const [currentPercent, setCurrentPercent] = useState(35);
  const [targetPercent, setTargetPercent] = useState(80);
  const [targetKwh, setTargetKwh] = useState(25);

  // Time selections: Default to tomorrow morning 08:00 or +4 hours
  const defaultDepartureIso = addMinutesToIso(currentTimeIso, 480); // +8h
  const [useByTime, setUseByTime] = useState(defaultDepartureIso);
  const [requestedMoveTime, setRequestedMoveTime] = useState(addMinutesToIso(defaultDepartureIso, 30));
  const [moveMethod, setMoveMethod] = useState<'self' | 'valet'>('valet');

  // Form errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Computed kWh needed if in percentage mode
  const calculatedKwhFromPercent =
    inputMode === 'percentage'
      ? Math.max(0, Math.round(((targetPercent - currentPercent) / 100) * batteryCapacityKwh * 10) / 10)
      : targetKwh;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!vehicleId.trim()) errs.vehicleId = 'Vehicle License Plate or Identifier is required.';
    if (!guestName.trim()) errs.guestName = 'Guest name is required.';

    if (inputMode === 'kwh') {
      if (!targetKwh || targetKwh <= 0) {
        errs.targetKwh = 'Energy target must be greater than 0 kWh.';
      } else if (targetKwh > batteryCapacityKwh) {
        errs.targetKwh = `Target cannot exceed vehicle battery size (${batteryCapacityKwh} kWh).`;
      }
    } else {
      if (currentPercent >= targetPercent) {
        errs.targetPercent = 'Target battery % must be strictly higher than current battery %';
      }
      if (targetPercent > 100) {
        errs.targetPercent = 'Target battery cannot exceed 100%.';
      }
      if (currentPercent < 0) {
        errs.currentPercent = 'Current percentage cannot be negative.';
      }
    }

    if (new Date(useByTime).getTime() <= new Date(currentTimeIso).getTime()) {
      errs.useByTime = 'Departure time must be set in the future relative to current time.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const res = submitRequest({
      vehicleId,
      guestName,
      roomNumber,
      inputMode,
      targetKwh: inputMode === 'kwh' ? targetKwh : calculatedKwhFromPercent,
      batteryCapacityKwh,
      currentPercent,
      targetPercent,
      useByTime,
      requestedMoveTime,
      moveMethod,
    });

    if (res.success && res.requestId) {
      onPlanCreated(res.requestId);
    } else if (res.error) {
      setErrors({ form: res.error });
    }
  };

  // Quick preset buttons for departure time
  const setQuickDeparture = (hoursAhead: number) => {
    const newDep = addMinutesToIso(currentTimeIso, hoursAhead * 60);
    setUseByTime(newDep);
    setRequestedMoveTime(addMinutesToIso(newDep, 30));
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Page Header */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-2">
          <span>EV01 – Guest Charging Registration</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Reserve Hotel EV Charging
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Tell us your charging target and morning departure time. Our smart allocation coordinates power and parking turnover so you leave fully charged without occupying chargers needlessly.
        </p>
      </div>

      {errors.form && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>{errors.form}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Guest & Vehicle Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Car className="w-4 h-4 text-emerald-400" />
            <span>1. Guest & Vehicle Details</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Vehicle Plate / ID <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                placeholder="e.g. EV-NZ842"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 uppercase"
              />
              {errors.vehicleId && (
                <p className="text-xs text-rose-400 mt-1">{errors.vehicleId}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Guest Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
              {errors.guestName && (
                <p className="text-xs text-rose-400 mt-1">{errors.guestName}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Room Number
              </label>
              <input
                type="text"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="e.g. 204"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Charging Target */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>2. Charging Target</span>
            </h2>

            {/* Mode Switcher */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setInputMode('percentage')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  inputMode === 'percentage'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                By Battery %
              </button>
              <button
                type="button"
                onClick={() => setInputMode('kwh')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  inputMode === 'kwh'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                By Energy (kWh)
              </button>
            </div>
          </div>

          {inputMode === 'percentage' ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Battery Capacity (kWh)
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="150"
                    value={batteryCapacityKwh}
                    onChange={(e) => setBatteryCapacityKwh(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Default: 60 kWh typical EV</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Current Battery Level (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={currentPercent}
                    onChange={(e) => setCurrentPercent(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  {errors.currentPercent && (
                    <p className="text-xs text-rose-400 mt-1">{errors.currentPercent}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Target Battery Level (%) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={targetPercent}
                    onChange={(e) => setTargetPercent(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  {errors.targetPercent && (
                    <p className="text-xs text-rose-400 mt-1">{errors.targetPercent}</p>
                  )}
                </div>
              </div>

              {/* Target calculation preview card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs text-slate-300">
                  Calculated Net Energy Required:
                </span>
                <div className="text-right">
                  <span className="text-lg font-bold font-mono text-emerald-400">
                    +{calculatedKwhFromPercent.toFixed(1)} kWh
                  </span>
                  <span className="text-xs text-slate-400 ml-2">
                    ({currentPercent}% → {targetPercent}%)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Vehicle Battery Size (kWh)
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="150"
                    value={batteryCapacityKwh}
                    onChange={(e) => setBatteryCapacityKwh(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Energy to Add (kWh) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="120"
                    value={targetKwh}
                    onChange={(e) => setTargetKwh(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  {errors.targetKwh && (
                    <p className="text-xs text-rose-400 mt-1">{errors.targetKwh}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Time & Turnover Coordination */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>3. Departure & Bay Turnover Plan</span>
          </h2>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Latest Vehicle Use-By / Departure Time <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Quick Presets:</span>
                  <button
                    type="button"
                    onClick={() => setQuickDeparture(1)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
                  >
                    +1h (Urgent)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDeparture(4)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
                  >
                    +4h (Evening)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDeparture(12)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
                  >
                    +12h (Tomorrow)
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Selected Departure:</span>
                  <span className="text-sm font-mono text-emerald-300 font-semibold">
                    {formatDateTime(useByTime)}
                  </span>
                </div>
                <input
                  type="datetime-local"
                  value={useByTime.slice(0, 16)}
                  onChange={(e) => {
                    const newTime = new Date(e.target.value).toISOString();
                    setUseByTime(newTime);
                    setRequestedMoveTime(addMinutesToIso(newTime, 30));
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              {errors.useByTime && (
                <p className="text-xs text-rose-400 mt-1">{errors.useByTime}</p>
              )}
            </div>

            {/* Move Method Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Bay Turnover Preference upon Target Completion
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMoveMethod('valet')}
                  className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                    moveMethod === 'valet'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      moveMethod === 'valet' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Complimentary Hotel Valet Move (Recommended)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Leave keys with front desk. Once battery reaches target, staff relocates your car to a regular stall, freeing the charger immediately for others.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMoveMethod('self')}
                  className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                    moveMethod === 'self'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      moveMethod === 'self' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Car className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Self-Move by Notification
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      You will receive alerts 15 minutes before target and upon completion. You agree to relocate the car within the 60-minute window.
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 transition active:scale-95"
          >
            <span>Review & Verify Feasibility Plan</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
