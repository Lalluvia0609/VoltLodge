import type {
  ChargingSession,
  Bay,
  AllocationAlgorithm,
  SimulationPolicyConfig,
  SimulationResultMetrics,
} from '../types';
import { addMinutesToIso } from './time';

const EPS = 1e-7;
const ms = (iso: string) => Date.parse(iso);
const iso = (time: number) => new Date(time).toISOString();
export const remainingEnergy = (s: ChargingSession) =>
  Math.max(0, s.targetKwh - s.deliveredKwh);
export const deadlineOf = (s: ChargingSession) =>
  Math.min(
    ms(s.chargingDeadline || s.useByTime),
    ms(s.useByTime),
    ms(s.agreedMoveByTime),
  );
export const vehicleCap = (s: ChargingSession, bays: Bay[], budget: number) =>
  Math.max(
    0,
    Math.min(
      s.maxChargeKw,
      bays.find((b) => b.bayId === s.bayId)?.maxKw ?? bays[0]?.maxKw ?? 0,
      budget,
    ),
  );
export const isLive = (s: ChargingSession) =>
  !s.bayReleasedAt &&
  !['pending_confirmation', 'cancelled', 'ended_incomplete'].includes(
    s.status,
  ) &&
  remainingEnergy(s) > EPS;

export function equalPower(caps: number[], budget: number): number[] {
  const result = caps.map(() => 0);
  let pool = caps.map((_, i) => i),
    left = Math.max(0, budget);
  while (pool.length && left > EPS) {
    const share = left / pool.length;
    const capped = pool.filter((i) => caps[i] <= share + EPS);
    if (!capped.length) {
      pool.forEach((i) => (result[i] = share));
      break;
    }
    capped.forEach((i) => {
      result[i] = Math.max(0, caps[i]);
      left -= result[i];
    });
    pool = pool.filter((i) => !capped.includes(i));
  }
  return result;
}

interface Job {
  id: string;
  energy: number;
  cap: number;
  start: number;
  deadline: number;
}
interface Edge {
  to: number;
  reverse: number;
  capacity: number;
  initial: number;
}

// Fractional AC charging is a capacitated scheduling problem. Interval max-flow
// checks every deadline, vehicle cap and shared site limit, including future jobs.
function schedule(jobs: Job[], budget: number, now: number) {
  const boundaries = [
    ...new Set([
      now,
      ...jobs
        .flatMap((j) => [Math.max(now, j.start), j.deadline])
        .filter((t) => t > now),
    ]),
  ].sort((a, b) => a - b);
  const intervals = boundaries
    .slice(0, -1)
    .map((start, i) => ({ start, end: boundaries[i + 1] }));
  const sink = 1 + jobs.length + intervals.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const add = (from: number, to: number, capacity: number) => {
    const edge: Edge = {
      to,
      reverse: graph[to].length,
      capacity,
      initial: capacity,
    };
    graph[from].push(edge);
    graph[to].push({
      to: from,
      reverse: graph[from].length - 1,
      capacity: 0,
      initial: 0,
    });
    return edge;
  };
  const sourceEdges = jobs.map((j, i) => add(0, i + 1, j.energy));
  const firstEdges = new Map<string, Edge>();
  jobs.forEach((j, i) =>
    intervals.forEach((slot, k) => {
      if (slot.start >= j.start && slot.end <= j.deadline && j.cap > 0) {
        const edge = add(
          i + 1,
          1 + jobs.length + k,
          (j.cap * (slot.end - slot.start)) / 3600000,
        );
        if (k === 0) firstEdges.set(j.id, edge);
      }
    }),
  );
  intervals.forEach((slot, k) =>
    add(
      1 + jobs.length + k,
      sink,
      (Math.max(0, budget) * (slot.end - slot.start)) / 3600000,
    ),
  );
  while (true) {
    const parent: Array<[number, number] | undefined> = Array(graph.length);
    const queue = [0];
    parent[0] = [-1, -1];
    for (let q = 0; q < queue.length && !parent[sink]; q++) {
      const v = queue[q];
      graph[v].forEach((e, i) => {
        if (e.capacity > EPS && !parent[e.to]) {
          parent[e.to] = [v, i];
          queue.push(e.to);
        }
      });
    }
    if (!parent[sink]) break;
    let amount = Infinity;
    for (let v = sink; v !== 0;) {
      const [p, i] = parent[v]!;
      amount = Math.min(amount, graph[p][i].capacity);
      v = p;
    }
    for (let v = sink; v !== 0;) {
      const [p, i] = parent[v]!;
      const e = graph[p][i];
      e.capacity -= amount;
      graph[v][e.reverse].capacity += amount;
      v = p;
    }
  }
  const deficits = new Map(
    jobs.map((j, i) => [j.id, Math.max(0, sourceEdges[i].capacity)]),
  );
  const hours = intervals.length ? (intervals[0].end - now) / 3600000 : 0;
  return {
    feasible: [...deficits.values()].every((d) => d < EPS),
    deficits,
    power: new Map(
      jobs.map((j) => {
        const e = firstEdges.get(j.id);
        return [j.id, e && hours > 0 ? (e.initial - e.capacity) / hours : 0];
      }),
    ),
  };
}

// Queue forecasts assume existing cars vacate by their agreed move time and the
// next driver plugs in when invited. Live operation still requires staff checks.
export function plannedJobs(
  sessions: ChargingSession[],
  bays: Bay[],
  budget: number,
  now: number,
): Job[] | null {
  const slots = bays.map((b) => {
    const occupant = sessions.find(
      (s) => s.bayId === b.bayId && !s.bayReleasedAt,
    );
    return {
      cap: b.maxKw,
      free: occupant ? ms(occupant.agreedMoveByTime) : now,
    };
  });
  const jobs: Job[] = [];
  const active = sessions
    .filter(isLive)
    .sort((a, b) => ms(a.arrivalTime) - ms(b.arrivalTime));
  for (const s of active) {
    const bay = bays.find((b) => b.bayId === s.bayId);
    let start = Math.max(now, ms(s.arrivalTime)),
      cap = bay?.maxKw;
    if (!bay) {
      slots.sort((a, b) => a.free - b.free);
      const slot = slots[0];
      if (!slot || !Number.isFinite(slot.free) || slot.free < now - EPS)
        return null;
      start = Math.max(start, slot.free);
      cap = slot.cap;
      slot.free = Math.max(start, ms(s.agreedMoveByTime));
    }
    jobs.push({
      id: s.requestId,
      energy: remainingEnergy(s),
      cap: Math.max(0, Math.min(s.maxChargeKw, cap ?? 0, budget)),
      start,
      deadline: deadlineOf(s),
    });
  }
  return jobs;
}

export function validateSchedule(
  sessions: ChargingSession[],
  bays: Bay[],
  budget: number,
  nowIso: string,
) {
  const jobs = plannedJobs(sessions, bays, budget, ms(nowIso));
  return jobs
    ? schedule(jobs, budget, ms(nowIso))
    : {
        feasible: false,
        deficits: new Map<string, number>(),
        power: new Map<string, number>(),
      };
}

function allocateJobs(
  jobs: Job[],
  budget: number,
  now: number,
  algorithm: AllocationAlgorithm,
): Map<string, number> {
  const ready = jobs.filter(
    (j) => j.start <= now && j.deadline > now && j.energy > EPS,
  );
  const equal = equalPower(
    ready.map((j) => j.cap),
    budget,
  );
  const result = new Map(jobs.map((j) => [j.id, 0]));
  ready.forEach((j, i) => result.set(j.id, equal[i]));
  if (algorithm === 'equal_sharing' || !ready.length) return result;
  // Keep one minute of capped equal sharing whenever it preserves every promise.
  const next = Math.min(
    now + 60000,
    ...jobs.flatMap((j) => [j.start, j.deadline]).filter((t) => t > now),
    ...ready.map((j, i) =>
      equal[i] > EPS ? now + (j.energy / equal[i]) * 3600000 : Infinity,
    ),
  );
  const residual = jobs.map((j) => ({
    ...j,
    energy: Math.max(
      0,
      j.energy - ((result.get(j.id) || 0) * (next - now)) / 3600000,
    ),
  }));
  if (
    schedule(
      residual.filter((j) => j.energy > EPS),
      budget,
      next,
    ).feasible
  )
    return result;
  const protectedPlan = schedule(jobs, budget, now);
  if (protectedPlan.feasible) return protectedPlan.power;
  // Infeasible benchmark scenarios: best effort earliest-deadline allocation;
  // admission control prevents introducing this condition in the guest workflow.
  let left = Math.max(0, budget);
  ready
    .sort((a, b) => a.deadline - b.deadline || a.start - b.start)
    .forEach((j) => {
      const kw = Math.min(j.cap, left);
      result.set(j.id, kw);
      left -= kw;
    });
  return result;
}

export function calculatePowerAllocation(
  sessions: ChargingSession[],
  bays: Bay[],
  sitePowerBudget: number,
  algorithm: AllocationAlgorithm,
  currentTimeIso: string,
): Map<string, number> {
  const now = ms(currentTimeIso);
  const connected = sessions.filter(
    (s) =>
      isLive(s) &&
      s.bayId &&
      ['charging', 'paused'].includes(s.status) &&
      ms(s.arrivalTime) <= now,
  );
  const jobs = connected.map((s) => ({
    id: s.requestId,
    energy: remainingEnergy(s),
    cap: vehicleCap(s, bays, sitePowerBudget),
    start: now,
    deadline: deadlineOf(s),
  }));
  // Future admitted/queued cars participate in the feasibility check too.
  const all = plannedJobs(sessions, bays, sitePowerBudget, now);
  const connectedIds = new Set(connected.map((s) => s.requestId));
  const future = (all || [])
    .filter((j) => !connectedIds.has(j.id))
    .map((j) => ({ ...j, start: Math.max(now + 60000, j.start) }));
  const plan = allocateJobs(
    [...jobs, ...future],
    sitePowerBudget,
    now,
    algorithm,
  );
  return new Map(
    sessions.map((s) => [
      s.requestId,
      connectedIds.has(s.requestId) ? plan.get(s.requestId) || 0 : 0,
    ]),
  );
}

export interface EngineState {
  sessions: ChargingSession[];
  bays: Bay[];
  currentTimeIso: string;
}
export interface SimulationAssumptions {
  selfMoveMinutes: number;
  valetMoveMinutes: number;
  response: boolean;
  staffCount: number;
}
export const DEFAULT_ASSUMPTIONS: SimulationAssumptions = {
  selfMoveMinutes: 20,
  valetMoveMinutes: 15,
  response: true,
  staffCount: 1,
};
export function syncBays(sessions: ChargingSession[], bays: Bay[]): Bay[] {
  return bays.map((b) => {
    const s = sessions.find((s) => s.bayId === b.bayId && !s.bayReleasedAt);
    return {
      ...b,
      currentStatus: !s
        ? 'vacant'
        : s.status === 'waiting_plugin'
          ? 'reserved_entry'
          : remainingEnergy(s) < EPS ||
              ['cancelled', 'ended_incomplete'].includes(s.status) ||
              s.moveReportedAt
            ? 'occupied_idle'
            : 'occupied_charging',
      currentRequestId: s?.requestId || null,
      currentVehicleId: s?.vehicleId || null,
      allocatedKw: s?.allocatedKw || 0,
    };
  });
}
export function reserveQueue(
  sessions: ChargingSession[],
  bays: Bay[],
  nowIso: string,
) {
  for (const bay of syncBays(sessions, bays).filter(
    (b) => b.currentStatus === 'vacant',
  )) {
    const next = sessions
      .filter(
        (s) =>
          s.status === 'waiting_bay' &&
          ms(s.arrivalTime) <= ms(nowIso) &&
          deadlineOf(s) > ms(nowIso),
      )
      .sort((a, b) => ms(a.arrivalTime) - ms(b.arrivalTime))[0];
    if (next) {
      next.bayId = bay.bayId;
      next.status =
        remainingEnergy(next) > EPS ? 'waiting_plugin' : 'target_reached';
      next.targetReachedAt =
        remainingEnergy(next) > EPS
          ? next.targetReachedAt
          : next.targetReachedAt || nowIso;
      next.allocatedKw = 0;
    }
  }
}

// A fixed one-minute grid plus exact arrivals, deadlines and target crossings.
// Outer playback speed only batches these same internal transitions.
export function advanceEngine(
  state: EngineState,
  minutes: number,
  budget: number,
  algorithm: AllocationAlgorithm,
  automatic?: { managed: boolean; assumptions: SimulationAssumptions },
  onInterval?: (
    sessions: ChargingSession[],
    minutes: number,
    power: number,
    now: string,
  ) => void,
): EngineState {
  const sessions = structuredClone(state.sessions);
  let now = ms(state.currentTimeIso);
  const end = now + Math.max(0, minutes) * 60000;
  const processEvents = () => {
    const futureReleases: number[] = [];
    const staffRelease = new Map<string, number>();
    if (
      automatic?.managed &&
      automatic.assumptions.response &&
      automatic.assumptions.staffCount > 0
    ) {
      const staff = Array.from(
        { length: automatic.assumptions.staffCount },
        () => -Infinity,
      );
      sessions
        .filter((s) => s.moveMethod === 'valet' && s.targetReachedAt)
        .sort(
          (a, b) =>
            ms(a.targetReachedAt!) - ms(b.targetReachedAt!) ||
            a.requestId.localeCompare(b.requestId),
        )
        .forEach((s) => {
          const index = staff.indexOf(Math.min(...staff));
          const release =
            Math.max(ms(s.targetReachedAt!), staff[index]) +
            automatic.assumptions.valetMoveMinutes * 60000;
          staff[index] = release;
          staffRelease.set(s.requestId, release);
        });
    }
    for (const s of sessions) {
      if (isLive(s) && deadlineOf(s) <= now) {
        s.status = 'ended_incomplete';
        s.allocatedKw = 0;
      }
      if (automatic && s.bayId && !s.bayReleasedAt) {
        let release = Infinity;
        if (s.status === 'ended_incomplete' || s.status === 'cancelled')
          release = ms(s.useByTime);
        if (s.targetReachedAt) {
          release = ms(s.useByTime);
          if (!automatic.managed)
            release = Math.min(release, ms(s.targetReachedAt) + 90 * 60000);
          else if (automatic.assumptions.response) {
            const managedRelease =
              s.moveMethod === 'valet'
                ? (staffRelease.get(s.requestId) ?? Infinity)
                : ms(s.targetReachedAt) +
                  automatic.assumptions.selfMoveMinutes * 60000;
            release = Math.min(release, managedRelease);
          }
        }
        if (release > now && Number.isFinite(release))
          futureReleases.push(release);
        if (release <= now) {
          s.bayId = null;
          s.bayReleasedAt = iso(now);
          s.allocatedKw = 0;
          s.simulatedValetMoved =
            s.moveMethod === 'valet' &&
            (staffRelease.get(s.requestId) ?? Infinity) <= now;
        }
      }
    }
    reserveQueue(sessions, state.bays, iso(now));
    if (automatic)
      sessions.forEach((s) => {
        if (s.status === 'waiting_plugin') {
          s.status = 'charging';
          s.pluggedInAt = iso(now);
        }
      });
    return futureReleases;
  };
  while (now < end - EPS) {
    const releases = processEvents();
    const bays = syncBays(sessions, state.bays);
    const power = calculatePowerAllocation(
      sessions,
      bays,
      budget,
      algorithm,
      iso(now),
    );
    let next = Math.min(
      end,
      (Math.floor(now / 60000) + 1) * 60000,
      ...releases,
    );
    sessions.forEach((s) => {
      const kw = power.get(s.requestId) || 0;
      s.allocatedKw = kw;
      if (s.status === 'charging' || s.status === 'paused')
        s.status = kw > EPS ? 'charging' : 'paused';
      if (isLive(s)) {
        if (deadlineOf(s) > now) next = Math.min(next, deadlineOf(s));
        if (ms(s.arrivalTime) > now) next = Math.min(next, ms(s.arrivalTime));
      }
      if (kw > EPS)
        next = Math.min(next, now + (remainingEnergy(s) / kw) * 3600000);
    });
    if (next <= now) break;
    const dt = (next - now) / 60000;
    onInterval?.(
      sessions,
      dt,
      [...power.values()].reduce((a, b) => a + b, 0),
      iso(now),
    );
    for (const s of sessions) {
      const kw = power.get(s.requestId) || 0;
      if (kw > EPS) {
        s.deliveredKwh = Math.min(s.targetKwh, s.deliveredKwh + (kw * dt) / 60);
        if (remainingEnergy(s) <= EPS) {
          s.deliveredKwh = s.targetKwh;
          s.status = 'target_reached';
          s.targetReachedAt = iso(next);
          s.allocatedKw = 0;
        }
      }
      if (isLive(s) && deadlineOf(s) <= next) {
        s.status = 'ended_incomplete';
        s.allocatedKw = 0;
      }
    }
    now = next;
  }
  now = end;
  processEvents();
  const currentTimeIso = iso(end);
  const bays = syncBays(sessions, state.bays);
  const power = calculatePowerAllocation(
    sessions,
    bays,
    budget,
    algorithm,
    currentTimeIso,
  );
  sessions.forEach((s) => (s.allocatedKw = power.get(s.requestId) || 0));
  return { sessions, bays: syncBays(sessions, bays), currentTimeIso };
}

export interface ChargingPrediction {
  fastest: string | null;
  fullLoad: string | null;
  expected: string | null;
  waitMinutes: number | null;
  fastestMinutes: number | null;
  fullLoadMinutes: number | null;
  feasible: boolean;
  deficitKwh: number;
}
export function predictCharging(
  s: ChargingSession,
  sessions: ChargingSession[],
  bays: Bay[],
  budget: number,
  algorithm: AllocationAlgorithm,
  nowIso: string,
): ChargingPrediction {
  const now = ms(nowIso),
    remaining = remainingEnergy(s);
  const jobs = plannedJobs(sessions, bays, budget, now),
    job = jobs?.find((j) => j.id === s.requestId);
  const start =
    job?.start ??
    (s.bayId || bays.some((b) => b.currentStatus === 'vacant') ? now : null);
  const cap = vehicleCap(s, bays, budget);
  const fastestMinutes = cap > EPS ? (remaining / cap) * 60 : null;
  // Full occupancy assumption: every other bay has a continuously demanding
  // vehicle whose AC cap equals that bay's cap; no later arrivals/jumping queue.
  const competitors = sessions.filter(
    (other) => other.requestId !== s.requestId && isLive(other),
  );
  const otherBays = bays
    .filter((b) => b.bayId !== s.bayId)
    .slice(0, Math.max(0, bays.length - 1));
  const caps = [
    cap,
    ...otherBays.map((b, i) =>
      Math.min(b.maxKw, competitors[i]?.maxChargeKw ?? b.maxKw, budget),
    ),
  ];
  const fullKw = equalPower(caps, budget)[0] || 0;
  const fullLoadMinutes = fullKw > EPS ? (remaining / fullKw) * 60 : null;
  let expected: string | null = null,
    deficitKwh = remaining;
  if (remaining <= EPS) {
    expected = s.targetReachedAt || nowIso;
    deficitKwh = 0;
  } else if (jobs && budget > 0) {
    let evolving = structuredClone(jobs),
      clock = now;
    const horizon = Math.max(now, ...jobs.map((j) => j.deadline));
    while (
      clock < horizon - EPS &&
      evolving.some((j) => j.energy > EPS && j.deadline > clock)
    ) {
      const powers = allocateJobs(evolving, budget, clock, algorithm);
      let next = Math.min(horizon, (Math.floor(clock / 60000) + 1) * 60000);
      evolving.forEach((j) => {
        const kw = powers.get(j.id) || 0;
        if (j.start > clock) next = Math.min(next, j.start);
        if (j.deadline > clock) next = Math.min(next, j.deadline);
        if (kw > EPS) next = Math.min(next, clock + (j.energy / kw) * 3600000);
      });
      evolving.forEach((j) => {
        j.energy = Math.max(
          0,
          j.energy - ((powers.get(j.id) || 0) * (next - clock)) / 3600000,
        );
        if (j.id === s.requestId && j.energy <= EPS && !expected)
          expected = iso(next);
      });
      clock = next;
    }
    deficitKwh =
      evolving.find((j) => j.id === s.requestId)?.energy ?? remaining;
  }
  return {
    fastest:
      start !== null && fastestMinutes !== null
        ? addMinutesToIso(iso(start), fastestMinutes)
        : null,
    fullLoad:
      start !== null && fullLoadMinutes !== null
        ? addMinutesToIso(iso(start), fullLoadMinutes)
        : null,
    expected,
    waitMinutes: start !== null ? Math.max(0, (start - now) / 60000) : null,
    fastestMinutes,
    fullLoadMinutes,
    feasible:
      !!jobs && schedule(jobs, budget, now).feasible && deficitKwh < EPS,
    deficitKwh,
  };
}

export function runSimulationPolicy(
  policy: SimulationPolicyConfig,
  initialSessions: ChargingSession[],
  bayCount: number,
  chargerMaxKw: number,
  siteBudgetKw: number,
  simulationStartIso: string,
  simulationEndIso: string,
  stepMinutes = 5,
  assumptions: SimulationAssumptions = DEFAULT_ASSUMPTIONS,
): SimulationResultMetrics {
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
  const sessions = structuredClone(initialSessions).filter(
    (s) =>
      s.status !== 'pending_confirmation' &&
      !s.bayReleasedAt &&
      s.status !== 'cancelled',
  );
  sessions.forEach((s) => {
    s.status = 'waiting_bay';
    s.bayId = null;
    s.allocatedKw = 0;
    s.pluggedInAt = null;
    if (remainingEnergy(s) > EPS) s.targetReachedAt = null;
    s.simulatedValetMoved = false;
  });
  const wait = new Map<string, number>(),
    idle = new Map<string, number>();
  let max = 0,
    breaches = 0;
  let state: EngineState = {
    sessions,
    bays,
    currentTimeIso: simulationStartIso,
  };
  const end = ms(simulationEndIso);
  while (ms(state.currentTimeIso) < end)
    state = advanceEngine(
      state,
      Math.min(stepMinutes, (end - ms(state.currentTimeIso)) / 60000),
      siteBudgetKw,
      policy.allocationAlgorithm,
      { managed: policy.enableMoveManagement, assumptions },
      (cars, dt, power, nowIso) => {
        max = Math.max(max, power);
        if (power > siteBudgetKw + EPS) breaches++;
        cars.forEach((s) => {
          if (ms(s.arrivalTime) <= ms(nowIso) && s.status === 'waiting_bay')
            wait.set(s.requestId, (wait.get(s.requestId) || 0) + dt);
          if (s.status === 'target_reached' && s.bayId)
            idle.set(s.requestId, (idle.get(s.requestId) || 0) + dt);
        });
      },
    );
  const outcomes = state.sessions.map((s) => ({
    vehicleId: s.vehicleId,
    targetKwh: s.targetKwh,
    deliveredKwh: s.deliveredKwh,
    onTime:
      !!s.targetReachedAt &&
      ms(s.targetReachedAt) <= deadlineOf(s) + EPS &&
      remainingEnergy(s) < EPS,
    queueWaitMins: wait.get(s.requestId) || 0,
    idleOccupancyMins: idle.get(s.requestId) || 0,
    deadline: iso(deadlineOf(s)),
    completedAt: s.targetReachedAt,
  }));
  const sum = (fn: (s: (typeof outcomes)[number]) => number) =>
    outcomes.reduce((n, s) => n + fn(s), 0);
  const completed = outcomes.filter((s) => s.onTime).length;
  return {
    policyId: policy.id,
    policyName: policy.name,
    totalVehicles: outcomes.length,
    vehiclesCompletedOnTime: completed,
    onTimeSuccessRatePercent: outcomes.length
      ? (completed / outcomes.length) * 100
      : 0,
    totalRequestedKwh: sum((s) => s.targetKwh),
    totalDeliveredKwh: sum((s) => s.deliveredKwh),
    totalDeficitKwh: sum((s) => Math.max(0, s.targetKwh - s.deliveredKwh)),
    averageQueueWaitMinutes: outcomes.length
      ? sum((s) => s.queueWaitMins) / outcomes.length
      : 0,
    totalPostChargeIdleMinutes: sum((s) => s.idleOccupancyMins),
    totalValetMoves: state.sessions.filter((s) => s.simulatedValetMoved).length,
    maxPowerUsedKw: max,
    powerLimitBreaches: breaches,
    vehicleOutcomes: outcomes,
    timelineEvents: outcomes
      .filter((s) => s.completedAt)
      .map((s) => ({
        time: s.completedAt!,
        vehicleId: s.vehicleId,
        description: 'Target reached',
        type: 'success',
      })),
  };
}
