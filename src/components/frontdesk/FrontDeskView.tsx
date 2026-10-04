import { PenaltySummary } from './PenaltySummary';
import { formatTimeOnly } from '../../utils/time';
import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { BayCard } from './BayCard';
import { QueueManager } from './QueueManager';
import { ValetTaskManager } from './ValetTaskManager';
import { ExtensionManager } from './ExtensionManager';
import { HistoryDrawer } from './HistoryDrawer';
import {
  Zap,
  Sliders,
  Shield,
  Hourglass,
  Clock,
  BatteryCharging,
  History,
  AlertTriangle,
  Bell,
  Trash2,
} from 'lucide-react';

export const FrontDeskView: React.FC = () => {
  const {
    bays,
    sessions,
    sitePowerBudgetKw,
    setSitePowerBudgetKw,
    totalAllocatedPowerKw,
    activeAlgorithm,
    setActiveAlgorithm,
    systemEvents,
    clearAllEvents,
    currentTimeIso,
    chargerMaxKw,
    setChargerMaxKw,
    extensionLimitMinutes,
    setExtensionLimitMinutes,
  } = useSimulation();

  const [activeTab, setActiveTab] = useState<
    'bays' | 'valet' | 'queue' | 'history'
  >('bays');

  // Counts
  const activeChargingCount = bays.filter(
    (b) => b.currentStatus === 'occupied_charging',
  ).length;
  const hoggingBayCount = bays.filter(
    (b) => b.currentStatus === 'occupied_idle',
  ).length;
  const queuedCount = sessions.filter((s) => s.status === 'waiting_bay').length;
  const pendingValetCount = sessions.filter(
    (s) => s.valetTask?.status === 'pending_review',
  ).length;
  const pendingExtCount = sessions.filter(
    (s) => s.extensionRequest?.status === 'pending',
  ).length;

  const powerPercent = Math.min(
    100,
    Math.round(
      (sitePowerBudgetKw > 0 ? totalAllocatedPowerKw / sitePowerBudgetKw : 0) *
        100,
    ),
  );

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Banner: Site Electrical Budget & Algorithm Control */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Motel Infrastructure Power Management
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                EV03 Active
              </span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-extrabold font-mono text-white">
                {totalAllocatedPowerKw.toFixed(1)}
              </span>
              <span className="text-slate-400 font-mono text-sm">
                / {sitePowerBudgetKw.toFixed(1)} kW Site Budget ({powerPercent}
                %)
              </span>
            </div>
          </div>

          {/* Quick budget test slider */}
          <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-medium">
              Test Power Budget:
            </span>
            <input
              type="range"
              min="0"
              max="40"
              step="1"
              value={sitePowerBudgetKw}
              onChange={(e) => {
                const result = setSitePowerBudgetKw(Number(e.target.value));
                if (!result.success) window.alert(result.error);
              }}
              className="w-28 accent-emerald-500 cursor-pointer"
            />
            <span className="font-mono font-bold text-white w-12 text-right">
              {sitePowerBudgetKw} kW
            </span>
          </div>

          {/* Algorithm Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveAlgorithm('demand_urgency')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeAlgorithm === 'demand_urgency'
                  ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Adaptive sharing
            </button>
            <button
              onClick={() => {
                const result = setActiveAlgorithm('equal_sharing');
                if (!result.success) window.alert(result.error);
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeAlgorithm === 'equal_sharing'
                  ? 'bg-emerald-500 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Equal Split (Benchmark)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 py-3 text-xs text-slate-300">
          <label>
            Charger AC limit (kW){' '}
            <input
              aria-label="Charger AC limit"
              type="number"
              min="0.1"
              step="0.1"
              value={chargerMaxKw}
              className="bg-slate-950 border border-slate-700 rounded-lg p-2 w-20"
              onChange={(e) => {
                const result = setChargerMaxKw(Number(e.target.value));
                if (!result.success) window.alert(result.error);
              }}
            />
          </label>
          <label>
            Extension limit from original plan (minutes){' '}
            <input
              aria-label="Extension limit"
              type="number"
              min="0"
              value={extensionLimitMinutes}
              className="bg-slate-950 border border-slate-700 rounded-lg p-2 w-20"
              onChange={(e) => {
                const minutes = Number(e.target.value);
                if (Number.isFinite(minutes) && minutes >= 0)
                  setExtensionLimitMinutes(minutes);
              }}
            />
          </label>
          <span>
            Power reductions that break a confirmed deadline are rejected. Use
            the comparison page for insufficient-power tests.
          </span>
        </div>
        {/* Load bar */}
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden mt-4 border border-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              powerPercent >= 95
                ? 'bg-rose-500'
                : powerPercent >= 75
                  ? 'bg-amber-400'
                  : 'bg-emerald-500'
            }`}
            style={{ width: `${powerPercent}%` }}
          />
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Active Charging Bays</span>
            <BatteryCharging className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1">
            {activeChargingCount}{' '}
            <span className="text-xs font-normal text-slate-400">
              / {bays.length}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Target Reached (Idle In Bay)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-300 mt-1">
            {hoggingBayCount}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Waiting Queue</span>
            <Hourglass className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-blue-300 mt-1">
            {queuedCount}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Valet / Turnover Tasks</span>
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-300 mt-1">
            {pendingValetCount}
          </div>
        </div>
      </div>

      <PenaltySummary />
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('bays')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'bays'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>Charger Bays ({bays.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('valet')}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'valet'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Valet Relocation Center</span>
          {pendingValetCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
              {pendingValetCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'queue'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Hourglass className="w-3.5 h-3.5 text-blue-400" />
          <span>Waiting Queue ({queuedCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'history'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5 text-slate-400" />
          <span>Audit History (EV13)</span>
        </button>
      </div>

      {/* Main Tab Panels */}
      {activeTab === 'bays' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {bays.map((bay) => (
              <BayCard key={bay.bayId} bay={bay} />
            ))}
          </div>

          {/* Extension requests quick widget if any */}
          <ExtensionManager />
        </div>
      )}

      {activeTab === 'valet' && <ValetTaskManager />}
      {activeTab === 'queue' && <QueueManager />}
      {activeTab === 'history' && <HistoryDrawer />}

      {/* Real-time System Event Audit Stream */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Live System Notifications & Event Dispatch
            </h4>
          </div>
          <button
            onClick={clearAllEvents}
            className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear Log</span>
          </button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {systemEvents.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">No event records.</p>
          ) : (
            systemEvents.slice(0, 15).map((evt) => (
              <div
                key={evt.id}
                className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    evt.type === 'alert'
                      ? 'bg-rose-400'
                      : evt.type === 'warning'
                        ? 'bg-amber-400'
                        : evt.type === 'success'
                          ? 'bg-emerald-400'
                          : 'bg-blue-400'
                  }`}
                />
                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                  {formatTimeOnly(evt.timestamp)}
                </span>
                <span className="text-slate-300">{evt.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
