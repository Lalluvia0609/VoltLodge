import { guestLabel, vehicleTypeLabel } from '../utils/guestIdentity';
import React from 'react';
import { useSimulation } from '../context/SimulationContext';
import { formatTimeOnly, formatDateTime } from '../utils/time';
import {
  Zap,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  User,
  Shield,
  BarChart3,
  PlusCircle,
  AlertTriangle,
  BatteryCharging,
  Sliders,
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    currentTimeIso,
    isPlaying,
    togglePlay,
    playbackSpeed,
    setSpeed,
    stepMinutes,
    resetSimulation,
    activePresetId,
    loadPreset,
    allPresets,
    sitePowerBudgetKw,
    totalAllocatedPowerKw,
    activeAlgorithm,
    setActiveAlgorithm,
    userRole,
    setUserRole,
    sessions,
    activeRequestId,
    setActiveRequestId,
    systemEvents,
  } = useSimulation();

  const powerPercentage = Math.min(
    100,
    Math.round(
      (sitePowerBudgetKw > 0 ? totalAllocatedPowerKw / sitePowerBudgetKw : 0) *
        100,
    ),
  );

  // Count pending front desk tasks
  const pendingValetCount = sessions.filter(
    (s) => s.valetTask?.status === 'pending_review',
  ).length;
  const overdueBayCount = sessions.filter(
    (s) =>
      s.status === 'target_reached' &&
      s.bayId &&
      currentTimeIso > s.agreedMoveByTime,
  ).length;
  const pendingExtCount = sessions.filter(
    (s) => s.extensionRequest?.status === 'pending',
  ).length;
  const totalFrontDeskAlerts =
    pendingValetCount + overdueBayCount + pendingExtCount;

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      {/* Top Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo & Project Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-bold">
              <Zap className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">
                  VoltLodge
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Electrification Prototype
                </span>
                <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                  Simulation Model
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Hotel EV Peak Power Sharing & Bay Turnover Management
              </p>
            </div>
          </div>

          {/* Center: Role Switcher Navigation */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setUserRole('guest')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                userRole === 'guest'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Guest Portal</span>
            </button>

            <button
              onClick={() => setUserRole('frontdesk')}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                userRole === 'frontdesk'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Front Desk</span>
              {totalFrontDeskAlerts > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-amber-500 rounded-full animate-pulse">
                  {totalFrontDeskAlerts}
                </span>
              )}
            </button>

            <button
              onClick={() => setUserRole('simulation')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                userRole === 'simulation'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Comparison</span>
              <span className="sm:hidden">Compare</span>
            </button>
          </div>

          {/* Right Side: Site Grid Load Quick Indicator */}
          <div className="hidden lg:flex items-center gap-3 bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-xl">
            <div className="text-right">
              <div className="text-[11px] text-slate-400 flex items-center justify-end gap-1">
                <span>Site Power Load</span>
                <span className="font-mono text-white font-bold">
                  {totalAllocatedPowerKw.toFixed(1)} /{' '}
                  {sitePowerBudgetKw.toFixed(1)} kW
                </span>
              </div>
              <div className="w-28 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    powerPercentage >= 95
                      ? 'bg-rose-500'
                      : powerPercentage >= 75
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${powerPercentage}%` }}
                />
              </div>
            </div>
            <div
              className={`p-1.5 rounded-lg ${
                powerPercentage >= 95
                  ? 'bg-rose-500/10 text-rose-400'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              <BatteryCharging className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Bar: Interactive Simulation Controls & Clock (Synced for all views) */}
      <div className="bg-slate-950/90 border-t border-slate-800/80 px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Preset Selector */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium hidden sm:inline">
              Scenario:
            </span>
            <select
              value={activePresetId}
              onChange={(e) => loadPreset(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1 text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
            >
              {allPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* Clock & Playback Player */}
          <div className="flex items-center gap-3">
            {/* Clock display */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
              <span
                className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}
              />
              <span className="text-slate-400 text-[11px]">
                Simulation · Auckland:
              </span>
              <span className="font-mono text-emerald-300 font-semibold tracking-wide">
                {formatDateTime(currentTimeIso)}
              </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg">
              <button
                onClick={togglePlay}
                title={isPlaying ? 'Pause Simulation' : 'Start Simulation'}
                className={`p-1.5 rounded-md transition-colors ${
                  isPlaying
                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600'
                }`}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                onClick={() => stepMinutes(5)}
                title="Step forward +5 minutes"
                className="px-2 py-1 text-[11px] font-mono font-medium rounded text-slate-300 hover:bg-slate-800 transition"
              >
                +5m
              </button>

              <button
                onClick={() => stepMinutes(15)}
                title="Step forward +15 minutes"
                className="px-2 py-1 text-[11px] font-mono font-medium rounded text-slate-300 hover:bg-slate-800 transition"
              >
                +15m
              </button>

              <div className="h-4 w-px bg-slate-800 mx-0.5" />

              {/* Speed selector */}
              <div className="flex items-center text-[10px] text-slate-400 px-1 font-mono">
                {[1, 5, 15, 60].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setSpeed(speed)}
                    className={`px-1.5 py-0.5 rounded ${
                      playbackSpeed === speed
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-800 mx-0.5" />

              <button
                onClick={resetSimulation}
                title="Reset simulation to initial state"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Vehicle Switcher (when in Guest view) */}
          {userRole === 'guest' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">
                Viewing Vehicle:
              </span>
              <select
                value={activeRequestId || ''}
                onChange={(e) => setActiveRequestId(e.target.value || null)}
                className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 font-mono"
              >
                {sessions.map((s) => (
                  <option key={s.requestId} value={s.requestId}>
                    {guestLabel(s, sessions)} · {vehicleTypeLabel(s)} -{' '}
                    {s.status.replace('_', ' ').toUpperCase()}
                  </option>
                ))}
                <option value="">Choose a vehicle</option>
              </select>
            </div>
          )}

          {/* Quick Algorithm Switcher (when in Front Desk view) */}
          {userRole === 'frontdesk' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Active Policy:</span>
              <button
                onClick={() =>
                  (() => {
                    const result = setActiveAlgorithm(
                      activeAlgorithm === 'demand_urgency'
                        ? 'equal_sharing'
                        : 'demand_urgency',
                    );
                    if (!result.success) window.alert(result.error);
                  })()
                }
                className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg hover:border-emerald-500 transition text-xs"
              >
                <Sliders className="w-3 h-3 text-emerald-400" />
                <span className="font-semibold text-slate-200">
                  {activeAlgorithm === 'demand_urgency'
                    ? 'Adaptive sharing'
                    : 'Equal Power Sharing'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  (Click to switch)
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
