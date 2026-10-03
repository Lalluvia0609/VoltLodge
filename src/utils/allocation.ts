import { ChargingSession, Bay, AllocationAlgorithm, SimulationPolicyConfig, SimulationResultMetrics } from '../types';
import { getMinutesDiff, addMinutesToIso } from './time';

/**
 * Calculates real-time allocated power (kW) for each active session plugged into a bay.
 *
 * Constraints:
 * 1. Only sessions in 'charging' or 'paused' status with a valid bayId can receive power.
 * 2. Each vehicle cannot receive more than min(vehicle.maxChargeKw, bay.maxKw).
 * 3. Total allocated power must never exceed sitePowerBudget.
 * 4. Completed vehicles (deliveredKwh >= targetKwh) receive 0 kW.
 */
export function calculatePowerAllocation(
  sessions: ChargingSession[],
  bays: Bay[],
  sitePowerBudget: number,
  algorithm: AllocationAlgorithm,
  currentTimeIso: string
): Map<string, number> {
  const allocation = new Map<string, number>();

  // Filter sessions that are physically occupying a bay and still need charge
  const eligibleSessions = sessions.filter((s) => {
    if (!s.bayId) return false;
    if (s.status !== 'charging' && s.status !== 'paused') return false;
    const remainingKwh = Math.max(0, s.targetKwh - s.deliveredKwh);
    return remainingKwh > 0.01;
  });

  if (eligibleSessions.length === 0 || sitePowerBudget <= 0) {
    // All get 0 kW
    sessions.forEach((s) => allocation.set(s.requestId, 0));
    return allocation;
  }

  // Pre-fill all sessions with 0
  sessions.forEach((s) => allocation.set(s.requestId, 0));

  if (algorithm === 'equal_sharing') {
    // Dynamic Equal Sharing: divide budget equally among eligible vehicles, capped by individual limits
    let remainingBudget = sitePowerBudget;
    let pool = [...eligibleSessions];

    // Iteratively distribute power so cars hitting their max kW don't bottleneck remaining budget
    let changed = true;
    while (changed && pool.length > 0 && remainingBudget > 0.05) {
      changed = false;
      const share = remainingBudget / pool.length;
      const remainingPool: ChargingSession[] = [];

      for (const session of pool) {
        const bay = bays.find((b) => b.bayId === session.bayId);
        const maxKw = Math.min(session.maxChargeKw, bay?.maxKw ?? session.maxChargeKw);
        const currentAlloc = allocation.get(session.requestId) || 0;
        const potentialAlloc = currentAlloc + share;

        if (potentialAlloc >= maxKw) {
          allocation.set(session.requestId, maxKw);
          remainingBudget -= (maxKw - currentAlloc);
          changed = true;
        } else {
          remainingPool.push(session);
        }
      }

      if (changed) {
        pool = remainingPool;
      } else {
        // Distribute remaining evenly to uncapped vehicles
        for (const session of pool) {
          const currentAlloc = allocation.get(session.requestId) || 0;
          allocation.set(session.requestId, currentAlloc + share);
        }
        remainingBudget = 0;
      }
    }
  } else {
    // Demand / Urgency-Based Allocation (Earliest Deadline / Least Laxity First)
    // Laxity = (Deadline - Current Time in hours) - (Remaining kWh / maxKw)
    const scoredSessions = eligibleSessions.map((s) => {
      const remainingKwh = Math.max(0, s.targetKwh - s.deliveredKwh);
      const bay = bays.find((b) => b.bayId === s.bayId);
      const maxKw = Math.min(s.maxChargeKw, bay?.maxKw ?? s.maxChargeKw);
      const hoursToMinCharge = maxKw > 0 ? remainingKwh / maxKw : 999;

      // Deadline is the earliest of use-by time and agreed move-by time
      const deadlineIso = s.useByTime < s.agreedMoveByTime ? s.useByTime : s.agreedMoveByTime;
      const minutesLeft = Math.max(1, getMinutesDiff(currentTimeIso, deadlineIso));
      const hoursLeft = minutesLeft / 60;
      const laxityHours = hoursLeft - hoursToMinCharge;

      return {
        session: s,
        maxKw,
        remainingKwh,
        laxityHours,
        minutesLeft,
        arrivalTime: s.arrivalTime,
      };
    });

    // Sort by smallest laxity (tightest deadline), then earliest arrival for tie-break
    scoredSessions.sort((a, b) => {
      if (Math.abs(a.laxityHours - b.laxityHours) > 0.05) {
        return a.laxityHours - b.laxityHours;
      }
      return new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime();
    });

    let availableKw = sitePowerBudget;

    for (const item of scoredSessions) {
      if (availableKw <= 0.05) {
        allocation.set(item.session.requestId, 0);
        continue;
      }

      // Allocate as much as possible up to maxKw
      const alloc = Math.min(item.maxKw, availableKw);
      allocation.set(item.session.requestId, Math.round(alloc * 100) / 100);
      availableKw -= alloc;
    }
  }

  return allocation;
}

/**
 * Estimates completion time for a candidate request based on available power.
 */
export function estimateChargingFeasibility(
  targetKwh: number,
  useByTimeIso: string,
  agreedMoveByIso: string,
  currentTimeIso: string,
  maxCarKw: number,
  activeBaysAvailable: boolean,
  estimatedWaitMinutes: number
): {
  estimatedStartTime: string;
  estimatedFinishTime: string;
  plannedLatestFinishTime: string;
  isFeasibleOnTime: boolean;
  projectedDeficitKwh: number;
  achievableKwh: number;
} {
  const effectiveDeadlineIso = useByTimeIso < agreedMoveByIso ? useByTimeIso : agreedMoveByIso;
  const estimatedStartTime = addMinutesToIso(currentTimeIso, activeBaysAvailable ? 0 : estimatedWaitMinutes);

  // Time required at max power (in minutes)
  const minChargingMinutes = Math.ceil((targetKwh / maxCarKw) * 60);
  const estimatedFinishTime = addMinutesToIso(estimatedStartTime, minChargingMinutes);

  // Planned latest finish time accounts for slight power fluctuations (+20% or +30m buffer)
  const plannedLatestFinishTime = addMinutesToIso(estimatedFinishTime, Math.max(15, Math.round(minChargingMinutes * 0.2)));

  const availableChargingMins = Math.max(0, getMinutesDiff(estimatedStartTime, effectiveDeadlineIso));
  const achievableKwh = Math.min(targetKwh, (availableChargingMins / 60) * maxCarKw);
  const projectedDeficitKwh = Math.max(0, Math.round((targetKwh - achievableKwh) * 10) / 10);
  const isFeasibleOnTime = projectedDeficitKwh <= 0.1;

  return {
    estimatedStartTime,
    estimatedFinishTime,
    plannedLatestFinishTime,
    isFeasibleOnTime,
    projectedDeficitKwh,
    achievableKwh: Math.round(achievableKwh * 10) / 10,
  };
}

/**
 * Runs a deterministic simulation benchmark on a set of initial vehicles and parameters
 * comparing the 4 policy configurations over time.
 * (Fulfills EV10 - Run & Compare Simulations)
 */
export function runSimulationPolicy(
  policy: SimulationPolicyConfig,
  initialSessions: ChargingSession[],
  bayCount: number,
  chargerMaxKw: number,
  siteBudgetKw: number,
  simulationStartIso: string,
  simulationEndIso: string,
  stepMinutes: number = 5
): SimulationResultMetrics {
  // Clone sessions for isolated policy run
  const sessions: ChargingSession[] = JSON.parse(JSON.stringify(initialSessions));

  // Initialize bays
  const bays: Bay[] = Array.from({ length: bayCount }, (_, i) => ({
    bayId: `sim-bay-${i + 1}`,
    bayNumber: i + 1,
    name: `Bay ${i + 1}`,
    maxKw: chargerMaxKw,
    currentStatus: 'vacant',
    currentVehicleId: null,
    currentRequestId: null,
    allocatedKw: 0,
  }));

  const timelineEvents: SimulationResultMetrics['timelineEvents'] = [];
  let currentIso = simulationStartIso;
  let totalValetMoves = 0;
  let maxPowerUsedKw = 0;
  let powerLimitBreaches = 0;

  // Track per-car metrics
  const waitTimes = new Map<string, number>(); // mins in queue
  const idleOccupancyTimes = new Map<string, number>(); // mins post-charge in bay
  const completionTimestamps = new Map<string, string>();

  sessions.forEach((s) => {
    s.status = 'waiting_bay';
    s.deliveredKwh = 0;
    s.allocatedKw = 0;
    s.bayId = null;
    waitTimes.set(s.requestId, 0);
    idleOccupancyTimes.set(s.requestId, 0);
  });

  const totalSteps = Math.ceil(getMinutesDiff(simulationStartIso, simulationEndIso) / stepMinutes);

  for (let step = 0; step < totalSteps; step++) {
    // 1. Advance queue to available bays
    for (const bay of bays) {
      if (bay.currentStatus === 'vacant') {
        const nextInQueue = sessions.find(
          (s) => s.status === 'waiting_bay' && s.arrivalTime <= currentIso
        );
        if (nextInQueue) {
          bay.currentStatus = 'occupied_charging';
          bay.currentVehicleId = nextInQueue.vehicleId;
          bay.currentRequestId = nextInQueue.requestId;
          nextInQueue.bayId = bay.bayId;
          nextInQueue.status = 'charging';
          nextInQueue.pluggedInAt = currentIso;

          timelineEvents.push({
            time: currentIso,
            vehicleId: nextInQueue.vehicleId,
            description: `Assigned to ${bay.name} and plugged in.`,
            type: 'info',
          });
        }
      }
    }

    // 2. Track wait time for queued cars
    sessions.forEach((s) => {
      if (s.status === 'waiting_bay' && s.arrivalTime <= currentIso) {
        waitTimes.set(s.requestId, (waitTimes.get(s.requestId) || 0) + stepMinutes);
      }
    });

    // 3. Compute power allocation
    const powerMap = calculatePowerAllocation(sessions, bays, siteBudgetKw, policy.allocationAlgorithm, currentIso);
    let currentTotalPower = 0;

    sessions.forEach((s) => {
      if (s.bayId && (s.status === 'charging' || s.status === 'paused')) {
        const kw = powerMap.get(s.requestId) || 0;
        s.allocatedKw = kw;
        s.status = kw > 0 ? 'charging' : 'paused';
        currentTotalPower += kw;

        // Deliver energy: kWh = kW * (stepMinutes / 60)
        const energyThisStep = kw * (stepMinutes / 60);
        s.deliveredKwh = Math.min(s.targetKwh, s.deliveredKwh + energyThisStep);

        // Check if target reached
        if (s.deliveredKwh >= s.targetKwh - 0.01) {
          s.status = 'target_reached';
          s.allocatedKw = 0;
          s.targetReachedAt = currentIso;
          completionTimestamps.set(s.requestId, currentIso);

          const bay = bays.find((b) => b.bayId === s.bayId);
          if (bay) {
            bay.currentStatus = 'occupied_idle';
          }

          timelineEvents.push({
            time: currentIso,
            vehicleId: s.vehicleId,
            description: `Target of ${s.targetKwh} kWh reached. Charger freed; bay remains occupied.`,
            type: 'success',
          });
        }
      }
    });

    if (currentTotalPower > maxPowerUsedKw) {
      maxPowerUsedKw = currentTotalPower;
    }
    if (currentTotalPower > siteBudgetKw + 0.01) {
      powerLimitBreaches++;
    }

    // 4. Handle Bay Turnover & Departures
    sessions.forEach((s) => {
      if (s.status === 'target_reached' && s.bayId) {
        // Vehicle is idling in bay after completion
        idleOccupancyTimes.set(s.requestId, (idleOccupancyTimes.get(s.requestId) || 0) + stepMinutes);

        const bay = bays.find((b) => b.bayId === s.bayId);
        const reachedAt = s.targetReachedAt || currentIso;
        const idleMins = getMinutesDiff(reachedAt, currentIso);

        if (policy.enableMoveManagement) {
          // With Proactive Management:
          // Reminder triggers at completion. Guest or Front Desk Valet moves car within 15-20 mins
          const moveThresholdMins = s.moveMethod === 'valet' ? 15 : 20;
          if (idleMins >= moveThresholdMins) {
            // Bay released!
            s.bayReleasedAt = currentIso;
            if (s.moveMethod === 'valet') {
              totalValetMoves++;
            }
            if (bay) {
              bay.currentStatus = 'vacant';
              bay.currentVehicleId = null;
              bay.currentRequestId = null;
              bay.allocatedKw = 0;
            }
            s.bayId = null;

            timelineEvents.push({
              time: currentIso,
              vehicleId: s.vehicleId,
              description: `Turnover complete (${s.moveMethod === 'valet' ? 'Valet moved to regular stall' : 'Guest self-moved'}). ${bay?.name} released.`,
              type: 'info',
            });
          }
        } else {
          // Without Move Management (Status Quo / Baseline):
          // Guest only moves when their useByTime arrives, or idles for 60-90 minutes!
          const minsToDeparture = getMinutesDiff(currentIso, s.useByTime);
          if (minsToDeparture <= 0 || idleMins >= 90) {
            s.bayReleasedAt = currentIso;
            if (bay) {
              bay.currentStatus = 'vacant';
              bay.currentVehicleId = null;
              bay.currentRequestId = null;
              bay.allocatedKw = 0;
            }
            s.bayId = null;

            timelineEvents.push({
              time: currentIso,
              vehicleId: s.vehicleId,
              description: `Guest departed at scheduled departure time. ${bay?.name} freed.`,
              type: 'warning',
            });
          }
        }
      }

      // Check if uncompleted vehicle reached use-by deadline and had to leave
      if (s.status !== 'target_reached' && s.status !== 'cancelled' && s.status !== 'ended_incomplete') {
        if (currentIso >= s.useByTime) {
          s.status = 'ended_incomplete';
          if (s.bayId) {
            const bay = bays.find((b) => b.bayId === s.bayId);
            if (bay) {
              bay.currentStatus = 'vacant';
              bay.currentVehicleId = null;
              bay.currentRequestId = null;
              bay.allocatedKw = 0;
            }
            s.bayId = null;
          }
          timelineEvents.push({
            time: currentIso,
            vehicleId: s.vehicleId,
            description: `Departure time reached! Left with only ${s.deliveredKwh.toFixed(1)} / ${s.targetKwh} kWh. Deficit: ${(s.targetKwh - s.deliveredKwh).toFixed(1)} kWh.`,
            type: 'alert',
          });
        }
      }
    });

    currentIso = addMinutesToIso(currentIso, stepMinutes);
  }

  // 5. Aggregate final benchmark metrics
  let vehiclesCompletedOnTime = 0;
  let totalRequestedKwh = 0;
  let totalDeliveredKwh = 0;
  let totalDeficitKwh = 0;
  let totalWaitMins = 0;
  let totalIdleMins = 0;

  const vehicleOutcomes = sessions.map((s) => {
    totalRequestedKwh += s.targetKwh;
    totalDeliveredKwh += s.deliveredKwh;
    const deficit = Math.max(0, s.targetKwh - s.deliveredKwh);
    totalDeficitKwh += deficit;

    const wait = waitTimes.get(s.requestId) || 0;
    totalWaitMins += wait;

    const idle = idleOccupancyTimes.get(s.requestId) || 0;
    totalIdleMins += idle;

    // On-time criteria: target reached before useByTime
    const completedAt = completionTimestamps.get(s.requestId) || null;
    const isOnTime = completedAt !== null && completedAt <= s.useByTime && deficit <= 0.1;
    if (isOnTime) {
      vehiclesCompletedOnTime++;
    }

    return {
      vehicleId: s.vehicleId,
      targetKwh: s.targetKwh,
      deliveredKwh: Math.round(s.deliveredKwh * 10) / 10,
      onTime: isOnTime,
      queueWaitMins: wait,
      idleOccupancyMins: idle,
      deadline: s.useByTime,
      completedAt,
    };
  });

  const onTimeSuccessRatePercent = sessions.length > 0
    ? Math.round((vehiclesCompletedOnTime / sessions.length) * 100)
    : 0;

  const averageQueueWaitMinutes = sessions.length > 0
    ? Math.round(totalWaitMins / sessions.length)
    : 0;

  return {
    policyId: policy.id,
    policyName: policy.name,
    totalVehicles: sessions.length,
    vehiclesCompletedOnTime,
    onTimeSuccessRatePercent,
    totalRequestedKwh: Math.round(totalRequestedKwh * 10) / 10,
    totalDeliveredKwh: Math.round(totalDeliveredKwh * 10) / 10,
    totalDeficitKwh: Math.round(totalDeficitKwh * 10) / 10,
    averageQueueWaitMinutes,
    totalPostChargeIdleMinutes: totalIdleMins,
    totalValetMoves,
    maxPowerUsedKw: Math.round(maxPowerUsedKw * 10) / 10,
    powerLimitBreaches,
    timelineEvents,
    vehicleOutcomes,
  };
}
