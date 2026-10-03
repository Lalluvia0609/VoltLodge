import React, { useState, useMemo } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { DEFAULT_POLICIES } from '../../data/presets';
import { runSimulationPolicy } from '../../utils/allocation';
import { formatTimeOnly, formatDurationMinutes } from '../../utils/time';
import {
  BarChart3,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Clock,
  Shield,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const SimulationComparisonView: React.FC = () => {
  const {
    allPresets,
    activePresetId,
    loadPreset,
    sitePowerBudgetKw,
    chargerMaxKw,
    bays,
    sessions,
  } = useSimulation();

  const currentPreset = allPresets.find((p) => p.id === activePresetId) || allPresets[0];

  // Configurable parameters for comparative run
  const [testPowerBudget, setTestPowerBudget] = useState<number>(currentPreset.sitePowerBudgetKw);
  const [testBayCount, setTestBayCount] = useState<number>(currentPreset.bayCount);
  const [selectedPolicyDetail, setSelectedPolicyDetail] = useState<string>('policy_d');

  // Compute simulation results for all 4 policies under identical parameters
  const benchmarkResults = useMemo(() => {
    return DEFAULT_POLICIES.map((policy) => {
      return runSimulationPolicy(
        policy,
        currentPreset.sessions,
        testBayCount,
        chargerMaxKw,
        testPowerBudget,
        currentPreset.simulationStartIso,
        currentPreset.simulationEndIso,
        5 // 5-minute time steps
      );
    });
  }, [currentPreset, testBayCount, chargerMaxKw, testPowerBudget]);

  const activePolicyMetric = benchmarkResults.find((r) => r.policyId === selectedPolicyDetail) || benchmarkResults[3];

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header and Scenario Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-2">
              <span>EV10 – Policy Benchmark & Simulation Engine</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Comparative Policy Analysis
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Benchmark the 4 operating schemes on identical vehicle arrival sequences, energy targets, and hardware constraints. Results are generated dynamically by our mathematical model.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">Test Scenario:</span>
            <select
              value={activePresetId}
              onChange={(e) => {
                loadPreset(e.target.value);
                const p = allPresets.find((x) => x.id === e.target.value);
                if (p) {
                  setTestPowerBudget(p.sitePowerBudgetKw);
                  setTestBayCount(p.bayCount);
                }
              }}
              className="bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
            >
              {allPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Current Scenario Overview */}
        <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <span className="text-slate-500 uppercase tracking-wider text-[10px] block">
              Scenario Premise
            </span>
            <span className="font-semibold text-white block mt-0.5">
              {currentPreset.subtitle}
            </span>
            <p className="text-slate-400 text-[11px] mt-1 leading-relaxed">
              {currentPreset.description}
            </p>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <span className="text-slate-500 uppercase tracking-wider text-[10px] block">
              Configured Hardware Conditions
            </span>
            <div className="flex justify-between text-slate-300">
              <span>Site Electrical Budget:</span>
              <span className="font-mono font-bold text-emerald-400">
                {testPowerBudget} kW
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Total Charging Bays:</span>
              <span className="font-mono font-bold text-white">{testBayCount} Bay(s)</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Max Power Per Charger:</span>
              <span className="font-mono font-bold text-white">{chargerMaxKw} kW</span>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
            <span className="text-slate-500 uppercase tracking-wider text-[10px] block">
              Simulation Parameters
            </span>
            <div className="flex justify-between text-slate-300">
              <span>Guest Fleet Size:</span>
              <span className="font-mono font-bold text-white">
                {currentPreset.sessions.length} Vehicles
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Total Energy Demanded:</span>
              <span className="font-mono font-bold text-white">
                {currentPreset.sessions.reduce((acc, s) => acc + s.targetKwh, 0)} kWh
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Simulation Window:</span>
              <span className="font-mono text-slate-400">
                {formatTimeOnly(currentPreset.simulationStartIso)} → {formatTimeOnly(currentPreset.simulationEndIso)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Policies Comparison Cards (EV10 Core Visual) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {benchmarkResults.map((result) => {
          const isSelected = result.policyId === selectedPolicyDetail;
          const policyConfig = DEFAULT_POLICIES.find((p) => p.id === result.policyId)!;

          return (
            <div
              key={result.policyId}
              onClick={() => setSelectedPolicyDetail(result.policyId)}
              className={`rounded-2xl border p-5 cursor-pointer transition-all shadow-sm flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-900 border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${policyConfig.color}20`,
                      color: policyConfig.color,
                      border: `1px solid ${policyConfig.color}40`,
                    }}
                  >
                    {policyConfig.shortName}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] text-emerald-400 font-semibold uppercase">
                      Viewing Details
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white leading-snug">
                    {policyConfig.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    {policyConfig.description}
                  </p>
                </div>

                {/* Key Metrics */}
                <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                  {/* On-time rate */}
                  <div>
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span className="text-[11px]">On-Time Completion Rate:</span>
                      <span className="font-mono font-bold text-white">
                        {result.onTimeSuccessRatePercent}% ({result.vehiclesCompletedOnTime}/{result.totalVehicles})
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${result.onTimeSuccessRatePercent}%`,
                          backgroundColor: policyConfig.color,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between text-slate-300">
                    <span className="text-[11px] text-slate-400">Energy Deficit:</span>
                    <span
                      className={`font-mono font-bold ${
                        result.totalDeficitKwh > 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {result.totalDeficitKwh > 0 ? `-${result.totalDeficitKwh} kWh` : '0 kWh (Satisfied)'}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-300">
                    <span className="text-[11px] text-slate-400">Avg. Queue Wait:</span>
                    <span className="font-mono font-bold text-white">
                      {result.averageQueueWaitMinutes} mins
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-300">
                    <span className="text-[11px] text-slate-400">Idle Bay Hogging:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {formatDurationMinutes(result.totalPostChargeIdleMinutes)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-300">
                    <span className="text-[11px] text-slate-400">Valet Relocations:</span>
                    <span className="font-mono font-bold text-white">
                      {result.totalValetMoves}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 mt-4 flex items-center justify-between text-[11px] text-slate-400">
                <span>Power limit overshoot:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {result.powerLimitBreaches} breaches
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparative Metrics Summary Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          <span>Side-by-Side Performance Comparison</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Policy Name</th>
                <th className="py-3 px-3">Power Logic</th>
                <th className="py-3 px-3">Bay Turnover</th>
                <th className="py-3 px-3">On-Time Success</th>
                <th className="py-3 px-3">Delivered / Target</th>
                <th className="py-3 px-3">Unmet Deficit</th>
                <th className="py-3 px-3">Avg Wait</th>
                <th className="py-3 px-3">Idle Occupancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {benchmarkResults.map((r) => {
                const isSelected = r.policyId === selectedPolicyDetail;
                return (
                  <tr
                    key={r.policyId}
                    onClick={() => setSelectedPolicyDetail(r.policyId)}
                    className={`cursor-pointer transition ${
                      isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <td className="py-3 px-3 font-semibold text-white">
                      {r.policyName}
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {r.policyId.includes('equal') ? 'Equal Split' : 'Urgency First'}
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {r.policyId.includes('policy_b') || r.policyId.includes('policy_d')
                        ? 'Proactive Valet'
                        : 'None (Idles)'}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <span
                        className={`font-bold ${
                          r.onTimeSuccessRatePercent === 100
                            ? 'text-emerald-400'
                            : r.onTimeSuccessRatePercent >= 75
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {r.onTimeSuccessRatePercent}%
                      </span>{' '}
                      ({r.vehiclesCompletedOnTime}/{r.totalVehicles})
                    </td>
                    <td className="py-3 px-3 font-mono text-white">
                      {r.totalDeliveredKwh} / {r.totalRequestedKwh} kWh
                    </td>
                    <td className="py-3 px-3 font-mono font-bold">
                      {r.totalDeficitKwh > 0 ? (
                        <span className="text-rose-400">-{r.totalDeficitKwh} kWh</span>
                      ) : (
                        <span className="text-emerald-400">0 kWh</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-white">
                      {r.averageQueueWaitMinutes} mins
                    </td>
                    <td className="py-3 px-3 font-mono text-amber-300">
                      {formatDurationMinutes(r.totalPostChargeIdleMinutes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Policy Breakdown & Vehicle Outcomes */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <span className="text-xs text-slate-400 uppercase font-mono block">
              Detailed Vehicle Outcomes for:
            </span>
            <h3 className="text-lg font-bold text-white">
              {activePolicyMetric.policyName}
            </h3>
          </div>
        </div>

        {/* Per-vehicle outcome table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] text-slate-400 uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Vehicle ID</th>
                <th className="py-2.5 px-3">Target Demand</th>
                <th className="py-2.5 px-3">Actual Delivered</th>
                <th className="py-2.5 px-3">Departure Deadline</th>
                <th className="py-2.5 px-3">Completed At</th>
                <th className="py-2.5 px-3">Queue Wait</th>
                <th className="py-2.5 px-3">Idle Occupancy</th>
                <th className="py-2.5 px-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {activePolicyMetric.vehicleOutcomes.map((v) => (
                <tr key={v.vehicleId} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3 font-mono font-bold text-white">
                    {v.vehicleId}
                  </td>
                  <td className="py-3 px-3 font-mono">{v.targetKwh} kWh</td>
                  <td className="py-3 px-3 font-mono font-bold text-white">
                    {v.deliveredKwh} kWh
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-300">
                    {formatTimeOnly(v.deadline)}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-300">
                    {v.completedAt ? formatTimeOnly(v.completedAt) : 'Did not finish'}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-300">
                    {v.queueWaitMins}m
                  </td>
                  <td className="py-3 px-3 font-mono text-amber-300">
                    {v.idleOccupancyMins}m
                  </td>
                  <td className="py-3 px-3">
                    {v.onTime ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        On-Time 100%
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Deficit / Late
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Simulation Timeline Event Playback */}
        <div className="pt-4 border-t border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Simulation Timeline Events
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {activePolicyMetric.timelineEvents.map((evt, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
              >
                <span className="font-mono text-[10px] text-slate-400 font-bold shrink-0">
                  {formatTimeOnly(evt.time)}
                </span>
                <span className="font-mono text-emerald-400 font-bold shrink-0">
                  [{evt.vehicleId}]
                </span>
                <span className="text-slate-300">{evt.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
