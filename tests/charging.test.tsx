import { PenaltySummary } from '../src/components/frontdesk/PenaltySummary';
import { BayCard } from '../src/components/frontdesk/BayCard';
import { QueueManager } from '../src/components/frontdesk/QueueManager';
import { bookingPenalty, DEFAULT_PENALTY_POLICY } from '../src/utils/penalties';
import {
  guestLabel,
  guestDetails,
  shortBookingId,
} from '../src/utils/guestIdentity';
import { SimulationComparisonView } from '../src/components/simulation/SimulationComparisonView';
import { ValetTaskManager } from '../src/components/frontdesk/ValetTaskManager';
import { completeScenarioVehicles } from '../src/utils/archive';
import { VEHICLE_TYPES, nextVehicleLabel } from '../src/data/vehicleTypes';
import { GuestView } from '../src/components/guest/GuestView';
import { RequestForm } from '../src/components/guest/RequestForm';
import { PlanReview } from '../src/components/guest/PlanReview';
import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import {
  SimulationProvider,
  useSimulation,
} from '../src/context/SimulationContext';
import {
  ALL_PRESETS,
  DEFAULT_POLICIES,
  PRESET_1_POWER_CRUNCH,
} from '../src/data/presets';
import {
  advanceEngine,
  calculatePowerAllocation,
  predictCharging,
  runSimulationPolicy,
  syncBays,
  validateSchedule,
  DEFAULT_ASSUMPTIONS,
  type EngineState,
} from '../src/utils/allocation';
import {
  addMinutesToIso,
  fromAucklandInput,
  toAucklandInput,
  formatTimeOnly,
} from '../src/utils/time';
import type { Bay, ChargingSession } from '../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const start = '2026-10-03T05:00:00.000Z'; // 18:00 Auckland
const at = (minutes: number) => addMinutesToIso(start, minutes);
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function car(
  id = 'A',
  energy = 7,
  deadline = 300,
  arrival = 0,
  cap = 11,
): ChargingSession {
  return {
    ...structuredClone(PRESET_1_POWER_CRUNCH.sessions[0]),
    vehicleType: undefined, // Independent numerical engine fixture.
    requestId: id,
    vehicleId: id,
    batteryCapacityKwh: 70,
    initialSocPercent: 0,
    targetKwh: energy,
    targetPercent: (energy / 70) * 100,
    arrivalTime: at(arrival),

    agreedMoveByTime: at(deadline),
    chargingDeadline: at(deadline),
    originalLatestFinishTime: at(deadline),
    status: 'charging',
    bayId: `bay-${id}`,
    maxChargeKw: cap,
    allocatedKw: 0,
    deliveredKwh: 0,
    targetReachedAt: null,
    bayReleasedAt: null,
    pluggedInAt: start,
    moveMethod: 'self',
  };
}
function hardware(ids: string[], cap = 7): Bay[] {
  return ids.map((id, i) => ({
    bayId: `bay-${id}`,
    bayNumber: i + 1,
    name: `Bay ${i + 1}`,
    maxKw: cap,
    currentStatus: 'vacant',
    currentRequestId: null,
    currentVehicleId: null,
    allocatedKw: 0,
  }));
}
function state(
  cars: ChargingSession[],
  bays = hardware(cars.map((s) => s.requestId)),
): EngineState {
  return { sessions: cars, bays: syncBays(cars, bays), currentTimeIso: start };
}

test('7 kW / 7 kWh: exact 60-minute finish, deadline stops energy, remaining-energy forecast', () => {
  const s = state([car('A', 7, 60)]);
  const before = advanceEngine(s, 55, 7, 'equal_sharing');
  assert.equal(before.sessions[0].targetReachedAt, null);
  near(before.sessions[0].deliveredKwh, (7 * 55) / 60);
  const after = advanceEngine(before, 5, 7, 'equal_sharing');
  assert.equal(after.sessions[0].targetReachedAt, at(60));
  near(after.sessions[0].deliveredKwh, 7);
  const partial = advanceEngine(
    state([car('A', 7, 30)]),
    60,
    7,
    'equal_sharing',
  );
  near(partial.sessions[0].deliveredKwh, 3.5);
  assert.equal(partial.sessions[0].status, 'ended_incomplete');
  const p = predictCharging(
    before.sessions[0],
    before.sessions,
    before.bays,
    7,
    'equal_sharing',
    before.currentTimeIso,
  );
  near(p.fastestMinutes!, 5);
});
test('four 7 kWh cars / 14 kW: equal sharing leaves A 3.5 kWh short; adaptive protects A', () => {
  const cars = ['A', 'B', 'C', 'D'].map((id, i) =>
    car(id, 7, i === 0 ? 60 : 300, 0, [11, 11, 9, 12][i]),
  );
  const equal = advanceEngine(state(cars), 60, 14, 'equal_sharing');
  near(equal.sessions[0].deliveredKwh, 3.5);
  near(equal.sessions[0].targetKwh - equal.sessions[0].deliveredKwh, 3.5);
  const adaptive = advanceEngine(state(cars), 60, 14, 'demand_urgency');
  assert.equal(adaptive.sessions[0].targetReachedAt, at(60));
  const result = runSimulationPolicy(
    DEFAULT_POLICIES[0],
    cars,
    4,
    7,
    14,
    start,
    at(300),
  );
  near(result.vehicleOutcomes[0].deliveredKwh, 3.5);
  assert.equal(result.powerLimitBreaches, 0);
});
test('capped equal sharing redistributes excess: 10.4 kW + 3.6 kW; nonurgent adaptive remains equal', () => {
  const cars = [car('A', 30, 600, 0, 11), car('B', 30, 600, 0, 3.6)],
    bays = hardware(['A', 'B'], 11);
  const power = calculatePowerAllocation(
    cars,
    bays,
    14,
    'equal_sharing',
    start,
  );
  near(power.get('A')!, 10.4);
  near(power.get('B')!, 3.6);
  const four = ['A', 'B', 'C', 'D'].map((id) => car(id));
  const shared = calculatePowerAllocation(
    four,
    hardware(['A', 'B', 'C', 'D']),
    14,
    'demand_urgency',
    start,
  );
  four.forEach((s) => near(shared.get(s.requestId)!, 3.5));
});
test('staggered arrivals recalculate and retain A deadline', () => {
  const cars = [
    car('A', 14, 120),
    car('B', 7, 240),
    car('C', 7, 300, 30, 9),
    car('D', 7, 300, 60, 12),
  ];
  cars.slice(2).forEach((s) => {
    s.status = 'waiting_bay';
    s.bayId = null;
  });
  const initial = state(cars, hardware(['A', 'B', 'C', 'D']));
  near(
    calculatePowerAllocation(
      cars,
      initial.bays,
      14,
      'demand_urgency',
      start,
    ).get('A')!,
    7,
  );
  const options = { managed: true, assumptions: DEFAULT_ASSUMPTIONS };
  const result = advanceEngine(initial, 120, 14, 'demand_urgency', options);
  assert.equal(result.sessions[0].targetReachedAt, at(120));
  assert.equal(result.sessions[0].chargingDeadline, at(120));
  assert.ok(result.sessions[2].deliveredKwh > 0);
});
test('full-load range is 19:00–20:00; zero power is unavailable; deficit is explicit', () => {
  const s = car(),
    bays = hardware(['A', 'B', 'C', 'D']);
  const p = predictCharging(s, [s], bays, 14, 'demand_urgency', start);
  assert.equal(p.fastest, at(60));
  assert.equal(p.fullLoad, at(120));
  const zero = predictCharging(s, [s], bays, 0, 'demand_urgency', start);
  assert.equal(zero.fastest, null);
  assert.equal(zero.fullLoad, null);
  assert.equal(zero.expected, null);
  assert.equal(zero.feasible, false);
  const bad = car('A', 20, 60);
  const deficit = predictCharging(
    bad,
    [bad],
    hardware(['A']),
    7,
    'demand_urgency',
    start,
  );
  near(deficit.deficitKwh, 13);
  assert.equal(deficit.feasible, false);
});
test('playback batches 1/5/15/60 produce identical finish times and energy', () => {
  const cars = [
    car('A', 7, 60),
    car('B', 12, 240),
    car('C', 9, 240, 20),
    car('D', 7, 240, 50),
  ];
  cars.slice(2).forEach((s) => {
    s.status = 'waiting_bay';
    s.bayId = null;
  });
  const results = [1, 5, 15, 60].map((batch) => {
    let s = state(cars, hardware(['A', 'B', 'C', 'D']));
    for (let minute = 0; minute < 240; minute += batch)
      s = advanceEngine(s, batch, 14, 'demand_urgency', {
        managed: true,
        assumptions: DEFAULT_ASSUMPTIONS,
      });
    return s.sessions.map((c) => ({
      energy: c.deliveredKwh,
      finish: c.targetReachedAt,
      release: c.bayReleasedAt,
    }));
  });
  results.slice(1).forEach((r) => assert.deepEqual(r, results[0]));
});
test('comparison responds to current input changes and insufficient staff/no response assumptions', () => {
  const cars = [car('A', 7, 300), car('B', 7, 300)];
  cars.forEach((s) => (s.moveMethod = 'valet'));
  const run = (input: ChargingSession[], response = true, staffCount = 1) =>
    runSimulationPolicy(
      DEFAULT_POLICIES[3],
      input,
      1,
      7,
      7,
      start,
      at(300),
      5,
      { ...DEFAULT_ASSUMPTIONS, response, staffCount },
    );
  const initial = run(cars),
    changed = run([{ ...cars[0], targetKwh: 14, targetPercent: 20 }, cars[1]]);
  assert.notEqual(initial.totalRequestedKwh, changed.totalRequestedKwh);
  assert.notEqual(
    initial.averageQueueWaitMinutes,
    changed.averageQueueWaitMinutes,
  );
  assert.equal(run(cars, false).totalValetMoves, 0);
  assert.equal(run(cars, true, 0).totalValetMoves, 0);
  assert.ok(initial.totalValetMoves > 0);
});
test('Auckland conversion works across UTC, DST, overnight and invalid wall time', () => {
  assert.equal(toAucklandInput(start), '2026-10-03T18:00');
  assert.equal(fromAucklandInput('2026-10-03T18:00'), start);
  assert.equal(formatTimeOnly(start), '18:00');
  assert.equal(
    fromAucklandInput('2026-07-01T18:00'),
    '2026-07-01T06:00:00.000Z',
  );
  assert.equal(fromAucklandInput('2026-09-27T02:30'), '');
  assert.equal(
    toAucklandInput(addMinutesToIso(fromAucklandInput('2026-09-27T01:30'), 60)),
    '2026-09-27T03:30',
  );
  assert.equal(
    toAucklandInput(addMinutesToIso(fromAucklandInput('2026-10-03T23:30'), 60)),
    '2026-10-04T00:30',
  );
});

const emptyPreset = {
  ...PRESET_1_POWER_CRUNCH,
  id: 'test-empty',
  name: 'Test empty',
  simulationStartIso: start,
  simulationEndIso: at(600),
  sessions: [],
};
ALL_PRESETS.push(emptyPreset);
async function mount(comparison = false, guest = false, staff = false) {
  let api!: ReturnType<typeof useSimulation>, renderer!: ReactTestRenderer;
  function Probe() {
    api = useSimulation();
    return staff ? (
      <>
        {api.bays.map((bay) => (
          <BayCard key={bay.bayId} bay={bay} />
        ))}
      </>
    ) : null;
  }
  await act(async () => {
    renderer = create(
      <SimulationProvider>
        <Probe />
        {comparison && <SimulationComparisonView />}
        {guest && <GuestView />}
        {staff && (
          <>
            <ValetTaskManager />
            <PenaltySummary />
            <QueueManager />
          </>
        )}
      </SimulationProvider>,
    );
  });
  await act(async () => api.loadPreset('test-empty'));
  return {
    get api() {
      return api;
    },
    get renderer() {
      return renderer;
    },
    act: async (fn: () => unknown) =>
      act(async () => {
        fn();
      }),
    close: async () => act(async () => renderer.unmount()),
  };
}
// Preserve the numerical scenarios using percentages of the selected 60 kWh type.
const input = (guest = 'A', target = 10, capacity = 70) => ({
  vehicleType: 'A' as const,
  guestName:
    (
      { A: 'Henry', B: 'Mia', C: 'Oliver', D: 'Amelia' } as Record<
        string,
        string
      >
    )[guest] || guest,
  roomNumber: '1',
  inputMode: 'percentage' as const,
  currentPercent: 0,
  targetPercent: Math.min(100, (target * capacity) / 60),
  requestedMoveTime: '',
  moveMethod: 'self' as const,
});
async function add(
  h: Awaited<ReturnType<typeof mount>>,
  id = 'A',
  target = 10,
  capacity = 70,
) {
  let result!: ReturnType<typeof h.api.submitRequest>;
  await h.act(
    () => (result = h.api.submitRequest(input(id, target, capacity))),
  );
  assert.ok(result.success, result.error);
  let confirmed!: ReturnType<typeof h.api.confirmPlan>;
  await h.act(
    () =>
      (confirmed = h.api.confirmPlan(
        result.requestId!,
        h.api.activeSession!.agreedMoveByTime,
      )),
  );
  assert.ok(confirmed.success, confirmed.error);
  const s = h.api.sessions.find((s) => s.requestId === result.requestId)!;
  if (s.bayId)
    await h.act(() => {
      const result = h.api.confirmVehicleParkedAndPlugged(
        s.bayId!,
        s.vehicleId,
      );
      assert.ok(result.success, result.error);
    });
  return result.requestId!;
}

test('guest percentage input computes 24 kWh and AC cap remains separate', async () => {
  const h = await mount();
  try {
    let result!: ReturnType<typeof h.api.submitRequest>;
    await h.act(
      () =>
        (result = h.api.submitRequest({
          ...input('A', 80, 60),
          currentPercent: 40,
        })),
    );
    assert.ok(result.success);
    near(h.api.activeSession!.targetKwh, 24);
    near(h.api.activeSession!.maxChargeKw, 11);
    near(h.api.chargerMaxKw, 7);
  } finally {
    await h.close();
  }
});
test('confirmed latest deadline survives B/C/D admission; conflict rejected without changing A', async () => {
  const h = await mount();
  try {
    const id = await add(h);
    const original = h.api.sessions.find(
      (s) => s.requestId === id,
    )!.originalLatestFinishTime;
    await h.act(() => h.api.stepMinutes(30));
    await add(h, 'B');
    await h.act(() => h.api.stepMinutes(15));
    await add(h, 'C');
    await add(h, 'D');
    assert.equal(
      h.api.sessions.find((s) => s.requestId === id)!.originalLatestFinishTime,
      original,
    );
    await h.act(() => h.api.stepMinutes(75));
    assert.ok(
      h.api.sessions.find((s) => s.requestId === id)!.targetReachedAt! <=
        original!,
    );
    let request!: ReturnType<typeof h.api.submitRequest>;
    await h.act(
      () =>
        (request = h.api.submitRequest({
          ...input('IMPOSSIBLE', 100, 200),
        })),
    );
    let confirmation!: ReturnType<typeof h.api.confirmPlan>;
    await h.act(
      () => (confirmation = h.api.confirmPlan(request.requestId!, at(180))),
    );
    assert.equal(confirmation.success, false);
    assert.equal(
      h.api.sessions.find((s) => s.requestId === id)!.originalLatestFinishTime,
      original,
    );
  } finally {
    await h.close();
  }
});
test('explicit charging extension to 20:45, original 21:00 cap, repeated extensions cannot roll the cap', async () => {
  const h = await mount();
  try {
    const id = await add(h);
    assert.equal(h.api.activeSession!.originalLatestFinishTime, at(120));
    await h.act(() => {
      assert.ok(
        h.api.requestExtension(id, at(165), 'Explicit consent', true).success,
      );
    });
    assert.equal(h.api.activeSession!.chargingDeadline, at(165));
    assert.equal(h.api.activeSession!.originalLatestFinishTime, at(120));
    await h.act(() =>
      assert.equal(
        h.api.requestExtension(id, at(181), 'Too late', true).success,
        false,
      ),
    );
    await h.act(() =>
      assert.ok(
        h.api.requestExtension(id, at(180), 'Within limit', true).success,
      ),
    );
    await h.act(() =>
      assert.equal(
        h.api.requestExtension(id, at(195), 'Repeated', true).success,
        false,
      ),
    );
    await h.act(() => h.api.stepMinutes(165));
    assert.ok(h.api.activeSession!.targetReachedAt! <= at(165));
  } finally {
    await h.close();
  }
});
test('move-only extension does not delay charging; earlier move and increased target recheck feasibility', async () => {
  const h = await mount();
  try {
    const id = await add(h);
    await h.act(() =>
      assert.ok(
        h.api.requestExtension(id, at(150), 'Move only', false).success,
      ),
    );
    assert.equal(h.api.activeSession!.chargingDeadline, at(120));
    await h.act(() =>
      assert.equal(
        h.api.modifyRequest(id, (7 / 60) * 100, 'A', at(30)).success,
        false,
      ),
    );
    await h.act(() =>
      assert.equal(h.api.modifyRequest(id, 90, 'A').success, false),
    );
    near(h.api.activeSession!.targetPercent, (7 / 60) * 100);
  } finally {
    await h.close();
  }
});
test('cancel retains occupancy; reported move waits for front desk; next vehicle needs plug-in confirmation', async () => {
  const h = await mount();
  try {
    const id = await add(h);
    const bay = h.api.activeSession!.bayId!;
    await h.act(() => h.api.cancelRequest(id));
    assert.equal(h.api.activeSession!.bayId, bay);
    assert.equal(h.api.activeSession!.allocatedKw, 0);
    await h.act(() => h.api.reportVehicleMoved(id));
    assert.equal(h.api.activeSession!.bayId, bay);
    assert.ok(h.api.activeSession!.moveReportedAt);
    await h.act(() => h.api.confirmBayReleased(bay));
    assert.equal(h.api.activeSession, null);
    assert.equal(
      h.api.sessions.some((s) => s.requestId === id),
      false,
    );
    assert.equal(h.api.historyRecords[0].requestId, id);
    let request!: ReturnType<typeof h.api.submitRequest>;
    await h.act(() => (request = h.api.submitRequest(input('B'))));
    await h.act(() =>
      assert.ok(
        h.api.confirmPlan(
          request.requestId!,
          h.api.activeSession!.agreedMoveByTime,
        ).success,
      ),
    );
    assert.equal(h.api.activeSession!.status, 'waiting_plugin');
    await h.act(() => h.api.stepMinutes(5));
    near(h.api.activeSession!.deliveredKwh, 0);
  } finally {
    await h.close();
  }
});
test('reached target can be increased and charging resumes within protected deadline', async () => {
  const h = await mount();
  try {
    const id = await add(h);
    await h.act(() => h.api.stepMinutes(60));
    assert.equal(h.api.activeSession!.status, 'target_reached');
    await h.act(() => assert.ok(h.api.modifyRequest(id, 17.5, 'A').success));
    assert.equal(h.api.activeSession!.status, 'charging');
    assert.equal(h.api.activeSession!.targetReachedAt, null);
    await h.act(() => h.api.stepMinutes(30));
    near(h.api.activeSession!.deliveredKwh, 10.5);
    assert.equal(h.api.activeSession!.targetReachedAt, at(90));
  } finally {
    await h.close();
  }
});

test('feasible connected schedules honor every deadline across varied AC caps and targets', () => {
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let attempt = 0; attempt < 40; attempt++) {
    const cars = ['A', 'B', 'C', 'D'].map((id) =>
      car(
        id,
        1 + random() * 15,
        60 + Math.floor(random() * 240),
        0,
        3 + random() * 9,
      ),
    );
    const bays = hardware(['A', 'B', 'C', 'D'], 11);
    if (!validateSchedule(cars, bays, 14, start).feasible) continue;
    const result = advanceEngine(state(cars, bays), 300, 14, 'demand_urgency');
    result.sessions.forEach((s) => {
      near(s.deliveredKwh, s.targetKwh);
      assert.ok(
        Date.parse(s.targetReachedAt!) <= Date.parse(s.chargingDeadline!) + 1,
      );
    });
  }
});
test('explicit extension allows less power without breaking the new charging deadline', () => {
  const cars = [
    car('A', 14, 120),
    car('B', 14, 180),
    car('C', 14, 300),
    car('D', 14, 300),
  ];
  const bays = hardware(['A', 'B', 'C', 'D']);
  const before = calculatePowerAllocation(
    cars,
    bays,
    14,
    'demand_urgency',
    start,
  ).get('A')!;
  cars[0].chargingDeadline = at(165);
  cars[0].agreedMoveByTime = at(165);
  const after = calculatePowerAllocation(
    cars,
    bays,
    14,
    'demand_urgency',
    start,
  ).get('A')!;
  assert.ok(after < before);
  const result = advanceEngine(state(cars, bays), 300, 14, 'demand_urgency');
  near(result.sessions[0].deliveredKwh, 14);
  assert.ok(
    Date.parse(result.sessions[0].targetReachedAt!) <= Date.parse(at(165)),
  );
});
test('full bay queue is FIFO; release invites one vehicle, without automatically charging it', async () => {
  const one = {
    ...emptyPreset,
    id: 'test-one-bay',
    bayCount: 1,
    sitePowerBudgetKw: 7,
  };
  ALL_PRESETS.push(one);
  const h = await mount();
  try {
    await h.act(() => h.api.loadPreset(one.id));
    const a = await add(h, 'A');
    const b = await add(h, 'B');
    const c = await add(h, 'C');
    assert.equal(
      h.api.sessions.find((s) => s.requestId === b)!.status,
      'waiting_bay',
    );
    await h.act(() => h.api.cancelRequest(a));
    assert.ok(h.api.sessions.find((s) => s.requestId === a)!.bayId);
    const bay = h.api.sessions.find((s) => s.requestId === a)!.bayId!;
    await h.act(() => h.api.reportVehicleMoved(a));
    assert.equal(
      h.api.sessions.find((s) => s.requestId === b)!.status,
      'waiting_bay',
    );
    await h.act(() => h.api.confirmBayReleased(bay));
    assert.equal(
      h.api.sessions.find((s) => s.requestId === b)!.status,
      'waiting_plugin',
    );
    assert.equal(
      h.api.sessions.find((s) => s.requestId === c)!.status,
      'waiting_bay',
    );
    await h.act(() => h.api.stepMinutes(5));
    near(h.api.sessions.find((s) => s.requestId === b)!.deliveredKwh, 0);
    await h.act(() =>
      assert.ok(h.api.confirmVehicleParkedAndPlugged(bay, 'B').success),
    );
    await h.act(() => h.api.stepMinutes(5));
    assert.ok(h.api.sessions.find((s) => s.requestId === b)!.deliveredKwh > 0);
  } finally {
    await h.close();
  }
});

test('comparison UI uses algorithm fields and reacts to current vehicle target edits', async () => {
  const h = await mount(true);
  try {
    const id = await add(h, 'A');
    await h.act(() =>
      h.renderer.root
        .findByProps({ 'aria-label': 'Data source' })
        .props.onChange({ target: { value: 'current' } }),
    );
    const text = () =>
      h.renderer.root
        .findAllByType('span')
        .map((n) => n.children.join(''))
        .join('|');
    assert.ok(text().includes('7.00 / 7.00 kWh'));
    await h.act(() => assert.ok(h.api.modifyRequest(id, 17.5, 'A').success));
    assert.ok(text().includes('10.50 / 10.50 kWh'));
    const rows = h.renderer.root.findAllByType('tr');
    const rowText = (index: number) =>
      rows[index]
        .findAllByType('td')
        .map((n) => n.children.join(''))
        .join('|');
    assert.ok(rowText(1).includes('Equal sharing'));
    assert.ok(rowText(2).includes('Equal sharing'));
    assert.ok(rowText(3).includes('Adaptive sharing'));
  } finally {
    await h.close();
  }
});

test('register now uses simulation clock; no use-by field is needed to generate range', async () => {
  const h = await mount();
  try {
    await h.act(() => h.api.stepMinutes(25));
    await h.act(() =>
      assert.ok(
        h.api.submitRequest({
          ...input(),

          arrivalTime: at(90),
          registrationMode: 'register_now',
        }).success,
      ),
    );
    assert.equal(h.api.activeSession!.arrivalTime, at(25));
    assert.equal(h.api.activeSession!.completionWindowStart, at(85));
    assert.equal(h.api.activeSession!.completionWindowEnd, at(145));
  } finally {
    await h.close();
  }
});

test('booking reserves future power and bay; no charging before arrival and actual battery confirmation', async () => {
  const h = await mount();
  try {
    let id = '';
    await h.act(() => {
      const r = h.api.submitRequest({
        ...input(),

        registrationMode: 'book_ahead',
        arrivalTime: at(60),
      });
      assert.ok(r.success, r.error);
      id = r.requestId!;
    });
    assert.equal(h.api.activeSession!.completionWindowStart, at(120));
    assert.equal(h.api.activeSession!.completionWindowEnd, at(180));
    await h.act(() => assert.ok(h.api.confirmPlan(id, at(180)).success));
    await h.act(() => assert.equal(h.api.confirmArrival(id, 0).success, false));
    await h.act(() => h.api.stepMinutes(59));
    near(h.api.activeSession!.deliveredKwh, 0);
    assert.equal(h.api.activeSession!.bayId, null);
    await h.act(() => h.api.stepMinutes(1));
    const bay = h.api.activeSession!.bayId!;
    assert.ok(bay);
    await h.act(() =>
      assert.equal(
        h.api.confirmVehicleParkedAndPlugged(bay, 'A').success,
        false,
      ),
    );
    await h.act(() => h.api.stepMinutes(5));
    near(h.api.activeSession!.deliveredKwh, 0);
    await h.act(() => assert.ok(h.api.confirmArrival(id, 0).success));
    await h.act(() =>
      assert.ok(h.api.confirmVehicleParkedAndPlugged(bay, 'A').success),
    );
    await h.act(() => h.api.stepMinutes(60));
    near(h.api.activeSession!.deliveredKwh, 7);
  } finally {
    await h.close();
  }
});

test('explicit early acceptance is required; calculated partial battery becomes promise, never original goal success', async () => {
  const h = await mount();
  try {
    await h.act(() =>
      h.api.submitRequest({
        ...input('A', 80, 60),
        currentPercent: 40,
      }),
    );
    const id = h.api.activeRequestId!;
    const preview = h.api.getMovePreview(id, at(60))!;
    assert.ok(preview.valid);
    assert.ok(preview.requiresAcceptance);
    assert.ok(Math.abs(preview.expectedPercent - (40 + (7 / 60) * 100)) < 1e-4);
    await h.act(() =>
      assert.equal(h.api.confirmPlan(id, at(60)).success, false),
    );
    assert.equal(h.api.activeSession!.status, 'pending_confirmation');
    await h.act(() => assert.ok(h.api.confirmPlan(id, at(60), true).success));
    const bay = h.api.activeSession!.bayId!;
    await h.act(() =>
      assert.ok(h.api.confirmVehicleParkedAndPlugged(bay, 'A').success),
    );
    const initial = structuredClone(h.api.sessions);
    await h.act(() => h.api.stepMinutes(60));
    assert.equal(h.api.activeSession!.targetReachedAt, null);
    assert.ok(h.api.activeSession!.commitmentReachedAt);
    assert.equal(h.api.activeSession!.status, 'ended_incomplete');
    const r = runSimulationPolicy(
      DEFAULT_POLICIES[3],
      initial,
      4,
      7,
      14,
      start,
      at(120),
    );
    assert.equal(r.targetSuccessRatePercent, 0);
    assert.equal(r.commitmentSuccessRatePercent, 100);
    assert.equal(r.guestEarlyDepartureCount, 1);
    assert.ok(r.guestEarlyDepartureDeficitKwh > 16.9);
    assert.equal(
      r.vehicleOutcomes[0].outcomeReason,
      'Guest accepted early departure',
    );
    const failed = runSimulationPolicy(
      DEFAULT_POLICIES[3],
      initial,
      4,
      7,
      0,
      start,
      at(120),
    );
    assert.equal(failed.commitmentSuccessRatePercent, 0);
    assert.equal(
      failed.vehicleOutcomes[0].outcomeReason,
      'Charging deadline missed',
    );
  } finally {
    await h.close();
  }
});

test('early change preserves other confirmed promises; first confirmation obeys absolute extension cap', async () => {
  const h = await mount();
  try {
    const a = await add(h, 'A');
    const deadline = h.api.sessions.find(
      (s) => s.requestId === a,
    )!.chargingDeadline;
    await h.act(() =>
      h.api.submitRequest({
        ...input('B', 80, 60),
        currentPercent: 40,
      }),
    );
    const b = h.api.activeRequestId!;
    const original = h.api.activeSession!.originalLatestFinishTime!;
    await h.act(() =>
      assert.equal(
        h.api.confirmPlan(b, addMinutesToIso(original, 61), true).success,
        false,
      ),
    );
    await h.act(() => assert.ok(h.api.confirmPlan(b, at(30), true).success));
    assert.equal(
      h.api.sessions.find((s) => s.requestId === a)!.chargingDeadline,
      deadline,
    );
    const bay = h.api.sessions.find((s) => s.requestId === b)!.bayId!;
    await h.act(() =>
      assert.ok(h.api.confirmVehicleParkedAndPlugged(bay, 'B').success),
    );
    await h.act(() => h.api.stepMinutes(120));
    assert.ok(
      h.api.sessions.find((s) => s.requestId === a)!.targetReachedAt! <=
        deadline!,
    );
  } finally {
    await h.close();
  }
});

test('future reservations affect immediate registration range and cannot be displaced by new requests', async () => {
  const h = await mount();
  const one = {
    ...emptyPreset,
    id: 'booking-one',
    bayCount: 1,
    sitePowerBudgetKw: 7,
  };
  ALL_PRESETS.push(one);
  try {
    await h.act(() => h.api.loadPreset(one.id));
    await h.act(() =>
      h.api.submitRequest({
        ...input('A'),
        registrationMode: 'book_ahead',
        arrivalTime: at(60),
      }),
    );
    const a = h.api.activeRequestId!;
    await h.act(() => assert.ok(h.api.confirmPlan(a, at(120)).success));
    await h.act(() => h.api.submitRequest(input('B', 20)));
    const b = h.api.activeRequestId!;
    // B cannot occupy this only bay until 20:00: A already booked it at 19:00.
    await h.act(() =>
      assert.equal(h.api.confirmPlan(b, at(120), true).success, false),
    );
    assert.equal(
      h.api.sessions.find((s) => s.requestId === a)!.chargingDeadline,
      at(120),
    );
    await h.act(() =>
      h.api.submitRequest({
        ...input('C'),
        registrationMode: 'book_ahead',
        arrivalTime: at(90),
      }),
    );
    assert.equal(h.api.activeSession!.completionWindowStart, at(180));
    assert.equal(h.api.predictions[h.api.activeRequestId!].waitMinutes, 30);
  } finally {
    await h.close();
  }
});

test('arrival SOC revision exposes shortfall; no silent battery or deadline changes without confirmation', async () => {
  const h = await mount();
  try {
    await h.act(() =>
      h.api.submitRequest({
        ...input('A', 80, 60),
        currentPercent: 70,
        registrationMode: 'book_ahead',
        arrivalTime: at(60),
      }),
    );
    const id = h.api.activeRequestId!,
      deadline = h.api.activeSession!.chargingDeadline!,
      move = h.api.activeSession!.agreedMoveByTime;
    await h.act(() => assert.ok(h.api.confirmPlan(id, move).success));
    await h.act(() => h.api.stepMinutes(60));
    const preview = h.api.getArrivalPreview(id, 40)!;
    near(preview.candidate.targetKwh, 24);
    assert.ok(preview.requiresAcceptance);
    assert.equal(h.api.activeSession!.initialSocPercent, 70);
    await h.act(() =>
      assert.equal(h.api.confirmArrival(id, 40).success, false),
    );
    assert.equal(h.api.activeSession!.initialSocPercent, 70);
    await h.act(() => assert.ok(h.api.confirmArrival(id, 40, true).success));
    near(h.api.activeSession!.targetKwh, 24);
    assert.equal(h.api.activeSession!.chargingDeadline, deadline);
    assert.equal(h.api.activeSession!.originalLatestFinishTime, deadline);
  } finally {
    await h.close();
  }
});

test('guest flow has separate entries, no itinerary field, forecast before move selection, explicit final early confirmation', async () => {
  const h = await mount(false, true);
  const button = (text: string) =>
    h.renderer.root
      .findAllByType('button')
      .find((n) =>
        n.children.some((c) => typeof c === 'string' && c === text),
      )!;
  try {
    assert.ok(button('Book ahead'));
    assert.ok(button('Register now'));
    await h.act(() => button('Book ahead').props.onClick());
    assert.equal(
      h.renderer.root.findByType(RequestForm).props.registrationMode,
      'book_ahead',
    );
    assert.ok(
      h.renderer.root.findByProps({ 'aria-label': 'Expected arrival' }),
    );
    assert.equal(
      h.renderer.root.findAllByProps({
        'aria-label': 'Need your car by (optional)',
      }).length,
      0,
    );
    await h.act(() => button('Register now').props.onClick());
    assert.equal(
      h.renderer.root.findAllByProps({ 'aria-label': 'Expected arrival' })
        .length,
      0,
    );
    await h.act(() =>
      h.renderer.root
        .findByType('form')
        .props.onSubmit({ preventDefault() {} }),
    );
    assert.ok(h.renderer.root.findByType(PlanReview));
    assert.equal(
      h.renderer.root.findAllByProps({ 'aria-label': 'Move your car by' })
        .length,
      0,
    );
    await h.act(() => button('Choose move time').props.onClick());
    await h.act(() =>
      h.renderer.root
        .findByProps({ 'aria-label': 'Move your car by' })
        .props.onChange({ target: { value: toAucklandInput(at(60)) } }),
    );
    assert.equal(button('Review arrangement').props.disabled, true);
    const check = h.renderer.root
      .findAllByType('input')
      .find((n) => n.props.type === 'checkbox')!;
    await h.act(() => check.props.onChange({ target: { checked: true } }));
    await h.act(() => button('Review arrangement').props.onClick());
    assert.ok(button('Confirm early departure'));
    await h.act(() => button('Confirm early departure').props.onClick());
    assert.ok(h.api.activeSession!.acceptedEarlyDeparture);
  } finally {
    await h.close();
  }
});

test('active early move needs renewed consent, may resume after explicit extension; original cap never changes', async () => {
  const h = await mount();
  try {
    const id = await add(h);
    const original = h.api.activeSession!.originalLatestFinishTime!;
    const preview = h.api.getMovePreview(id, at(30))!;
    assert.ok(preview.requiresAcceptance);
    await h.act(() =>
      assert.equal(
        h.api.modifyRequest(id, (7 / 60) * 100, 'A', at(30)).success,
        false,
      ),
    );
    assert.equal(h.api.activeSession!.agreedMoveByTime, at(120));
    await h.act(() =>
      assert.ok(
        h.api.modifyRequest(id, (7 / 60) * 100, 'A', at(30), true).success,
      ),
    );
    await h.act(() => h.api.stepMinutes(30));
    near(h.api.activeSession!.deliveredKwh, 3.5 - 1e-6);
    await h.act(() =>
      assert.ok(
        h.api.requestExtension(
          id,
          at(165),
          'Guest accepts delayed charging',
          true,
        ).success,
      ),
    );
    assert.equal(h.api.activeSession!.status, 'charging');
    assert.equal(h.api.activeSession!.originalLatestFinishTime, original);
    assert.equal(h.api.activeSession!.acceptedEarlyDeparture, false);
    await h.act(() =>
      assert.equal(
        h.api.requestExtension(id, at(181), 'Repeated extension', true).success,
        false,
      ),
    );
    await h.act(() => h.api.stepMinutes(45));
    near(h.api.activeSession!.deliveredKwh, 7);
  } finally {
    await h.close();
  }
});

test('arrival may choose a lower target; staff assistance is requested with final confirmation', async () => {
  const h = await mount();
  try {
    await h.act(() =>
      h.api.submitRequest({
        ...input('A', 80, 60),
        currentPercent: 70,
        registrationMode: 'book_ahead',
        arrivalTime: at(60),
      }),
    );
    const id = h.api.activeRequestId!,
      deadline = h.api.activeSession!.originalLatestFinishTime!;
    await h.act(() =>
      assert.ok(h.api.confirmPlan(id, deadline, false, 'valet').success),
    );
    assert.equal(h.api.activeSession!.valetTask?.status, 'pending_review');
    await h.act(() => h.api.stepMinutes(60));
    const revised = h.api.getArrivalPreview(id, 40, 45)!;
    assert.ok(revised.valid);
    assert.equal(revised.requiresAcceptance, false);
    await h.act(() =>
      assert.ok(h.api.confirmArrival(id, 40, false, 45).success),
    );
    assert.equal(h.api.activeSession!.targetPercent, 45);
    near(h.api.activeSession!.targetKwh, 3);
    assert.equal(h.api.activeSession!.originalLatestFinishTime, deadline);
  } finally {
    await h.close();
  }
});

test('future accepted departure has identical delivered energy and fulfillment across playback speeds; cancellation retains benchmark bay', () => {
  const partial = {
    ...car('A', 14, 120, 30),
    committedKwh: 5,
    acceptedEarlyDeparture: true,
    arrivalConfirmed: false,
    status: 'waiting_bay' as const,
    bayId: null,
    agreedMoveByTime: at(90),
  };
  const runs = [1, 5, 15, 60].map((step) =>
    runSimulationPolicy(
      DEFAULT_POLICIES[3],
      [partial],
      1,
      7,
      7,
      start,
      at(180),
      step,
    ),
  );
  runs
    .slice(1)
    .forEach((r) =>
      assert.deepEqual(r.vehicleOutcomes, runs[0].vehicleOutcomes),
    );
  assert.equal(runs[0].commitmentSuccessRatePercent, 100);
  assert.equal(runs[0].targetSuccessRatePercent, 0);
  const stopped = {
    ...car('A', 7, 120),
    status: 'cancelled' as const,
    committedKwh: 0,
    acceptedEarlyDeparture: true,
    commitmentReachedAt: start,
  };
  const queued = {
    ...car('B', 7, 240),
    status: 'waiting_bay' as const,
    bayId: null,
  };
  const result = runSimulationPolicy(
    DEFAULT_POLICIES[3],
    [stopped, queued],
    1,
    7,
    7,
    start,
    at(240),
  );
  assert.equal(result.vehicleOutcomes[1].queueWaitMins, 120);
  assert.equal(
    result.vehicleOutcomes[0].outcomeReason,
    'Guest accepted early departure',
  );
});

test('late move at first confirmation leaves deadline fixed; explicit delay alone changes it, repeats stay within original cap', async () => {
  const h = await mount();
  try {
    await h.act(() => assert.ok(h.api.submitRequest(input()).success));
    const id = h.api.activeRequestId!;
    assert.equal(h.api.activeSession!.originalLatestFinishTime, at(120));
    await h.act(() => assert.ok(h.api.confirmPlan(id, at(150)).success));
    assert.equal(h.api.activeSession!.agreedMoveByTime, at(150));
    assert.equal(h.api.activeSession!.chargingDeadline, at(120));
    await h.act(() =>
      assert.ok(h.api.modifyRequest(id, (7 / 60) * 100, 'A', at(165)).success),
    );
    assert.equal(h.api.activeSession!.chargingDeadline, at(120));
    await h.act(() =>
      assert.ok(
        h.api.requestExtension(id, at(165), 'Explicit consent', true).success,
      ),
    );
    assert.equal(h.api.activeSession!.chargingDeadline, at(165));
    await h.act(() =>
      assert.ok(
        h.api.requestExtension(id, at(180), 'Move only', false).success,
      ),
    );
    assert.equal(h.api.activeSession!.chargingDeadline, at(165));
    await h.act(() =>
      assert.equal(
        h.api.requestExtension(id, at(181), 'Too late', true).success,
        false,
      ),
    );
    assert.equal(h.api.activeSession!.originalLatestFinishTime, at(120));
  } finally {
    await h.close();
  }
});

test('initial move limit permits exactly original plus 60 minutes and rejects any later time', async () => {
  const h = await mount();
  try {
    await h.act(() => h.api.submitRequest(input()));
    const id = h.api.activeRequestId!;
    await h.act(() =>
      assert.equal(h.api.confirmPlan(id, at(181)).success, false),
    );
    assert.equal(h.api.activeSession!.status, 'pending_confirmation');
    await h.act(() => assert.ok(h.api.confirmPlan(id, at(180)).success));
    assert.equal(h.api.activeSession!.chargingDeadline, at(120));
    assert.equal(h.api.activeSession!.agreedMoveByTime, at(180));
  } finally {
    await h.close();
  }
});

test('guest edit form exposes one move time and target; early consent works with no itinerary input', async () => {
  const h = await mount(false, true);
  try {
    await add(h);
    // Creating the initial page through the same guest flow ensures its routing
    // changes to the active plan instead of relying on the simulation selector.
    const selector = h.renderer.root
      .findAllByType('button')
      .find((n) => n.props['data-request-id'] === h.api.activeRequestId)!;
    await h.act(() => selector.props.onClick());
    const change = h.renderer.root
      .findAllByType('button')
      .find((n) => n.children.includes('Change target or move time'))!;
    await h.act(() => change.props.onClick());
    const dateInputs = h.renderer.root
      .findAllByType('input')
      .filter((n) => n.props.type === 'datetime-local');
    assert.equal(dateInputs.length, 1);
    assert.equal(dateInputs[0].props['aria-label'], 'Move your car by');
    await h.act(() =>
      dateInputs[0].props.onChange({
        target: { value: toAucklandInput(at(30)) },
      }),
    );
    const confirm = h.renderer.root
      .findAllByType('button')
      .find((n) => n.children.includes('Confirm early departure'))!;
    assert.equal(confirm.props.disabled, true);
    const accept = h.renderer.root
      .findAllByType('input')
      .find((n) => n.props.type === 'checkbox')!;
    await h.act(() => accept.props.onChange({ target: { checked: true } }));
    await h.act(() =>
      h.renderer.root
        .findByType('form')
        .props.onSubmit({ preventDefault() {} }),
    );
    assert.equal(h.api.activeSession!.agreedMoveByTime, at(30));
    assert.equal(h.api.activeSession!.chargingDeadline, at(120));
    assert.equal(h.api.activeSession!.acceptedEarlyDeparture, true);
  } finally {
    await h.close();
  }
});

test('every vehicle type supplies preset capacity and AC limit for registration and booking forecasts', async () => {
  const h = await mount();
  try {
    for (const type of VEHICLE_TYPES) {
      for (const mode of ['register_now', 'book_ahead'] as const) {
        await h.act(() => h.api.loadPreset('test-empty'));
        await h.act(() =>
          assert.ok(
            h.api.submitRequest({
              ...input(),
              vehicleType: type.id,
              currentPercent: 40,
              targetPercent: 80,
              registrationMode: mode,
              arrivalTime: at(60),
            }).success,
          ),
        );
        const s = h.api.activeSession!;
        assert.equal(s.vehicleType, type.id);
        near(s.batteryCapacityKwh, type.batteryCapacityKwh);
        near(s.maxChargeKw, type.maxChargeKw);
        near(s.targetKwh, type.batteryCapacityKwh * 0.4);
        const p = h.api.predictions[s.requestId];
        near(p.fastestMinutes!, (s.targetKwh / 7) * 60);
        assert.ok(Date.parse(p.fastest!) >= Date.parse(s.arrivalTime));
      }
    }
    await h.act(() =>
      assert.equal(
        h.api.submitRequest({ ...input(), vehicleType: 'unknown' as any })
          .success,
        false,
      ),
    );
  } finally {
    await h.close();
  }
});

test('two guests selecting Type A get separate vehicle labels, requests and promises; labels extend beyond Z', async () => {
  const h = await mount();
  try {
    const first = await add(h),
      second = await add(h);
    assert.notEqual(first, second);
    const a = h.api.sessions.find((s) => s.requestId === first)!,
      b = h.api.sessions.find((s) => s.requestId === second)!;
    assert.equal(a.vehicleType, 'A');
    assert.equal(b.vehicleType, 'A');
    assert.notEqual(a.vehicleId, b.vehicleId);
    const oldB = structuredClone(b);
    await h.act(() => assert.ok(h.api.modifyRequest(first, 20, 'A').success));
    assert.deepEqual(
      h.api.sessions.find((s) => s.requestId === second),
      oldB,
    );
    near(h.api.sessions.find((s) => s.requestId === first)!.targetKwh, 12);
    assert.equal(
      nextVehicleLabel(
        Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
      ),
      'AA',
    );
  } finally {
    await h.close();
  }
});

test('editing type updates both parameters, forecasts and comparison input while keeping deadline and energy delivered', async () => {
  const h = await mount(true);
  try {
    const id = await add(h, 'A', 80, 60);
    const before = structuredClone(h.api.activeSession!);
    await h.act(() => h.api.stepMinutes(10));
    const delivered = h.api.activeSession!.deliveredKwh;
    await h.act(() => assert.ok(h.api.modifyRequest(id, 80, 'D').success));
    const changed = h.api.sessions.find((s) => s.requestId === id)!;
    assert.equal(changed.vehicleType, 'D');
    near(changed.batteryCapacityKwh, 75);
    near(changed.maxChargeKw, 12);
    near(changed.deliveredKwh, delivered);
    near(changed.targetKwh, 60);
    assert.equal(
      changed.originalLatestFinishTime,
      before.originalLatestFinishTime,
    );
    assert.equal(changed.chargingDeadline, before.chargingDeadline);
    await h.act(() =>
      h.renderer.root
        .findByProps({ 'aria-label': 'Data source' })
        .props.onChange({ target: { value: 'current' } }),
    );
    assert.ok(
      h.renderer.root
        .findAllByType('span')
        .some((n) => n.children.join('').includes('/ 60.00 kWh')),
    );
  } finally {
    await h.close();
  }
});

test('selected type AC limit is distinct from charger and shared power limits', async () => {
  const h = await mount();
  try {
    await h.act(() => assert.ok(h.api.setChargerMaxKw(11).success));
    await h.act(() => assert.ok(h.api.setSitePowerBudgetKw(40).success));
    await h.act(() => h.api.submitRequest({ ...input(), vehicleType: 'C' }));
    const c = h.api.activeRequestId!;
    await h.act(() =>
      assert.ok(
        h.api.confirmPlan(c, h.api.activeSession!.agreedMoveByTime).success,
      ),
    );
    await h.act(() =>
      assert.ok(
        h.api.confirmVehicleParkedAndPlugged(
          h.api.activeSession!.bayId!,
          h.api.activeSession!.vehicleId,
        ).success,
      ),
    );
    near(h.api.activeSession!.allocatedKw, 9);
    await h.act(() => h.api.submitRequest({ ...input(), vehicleType: 'D' }));
    const d = h.api.activeRequestId!;
    await h.act(() =>
      assert.ok(
        h.api.confirmPlan(d, h.api.activeSession!.agreedMoveByTime).success,
      ),
    );
    await h.act(() =>
      assert.ok(
        h.api.confirmVehicleParkedAndPlugged(
          h.api.activeSession!.bayId!,
          h.api.activeSession!.vehicleId,
        ).success,
      ),
    );
    near(h.api.activeSession!.maxChargeKw, 12);
    near(h.api.activeSession!.allocatedKw, 11);
    // Existing tight promises must prevent a silent power reduction.
    await h.act(() =>
      assert.equal(h.api.setSitePowerBudgetKw(14).success, false),
    );
    await h.act(() =>
      assert.ok(
        h.api.requestExtension(c, at(100), 'Explicit delayed charging', true)
          .success,
      ),
    );
    await h.act(() =>
      assert.ok(
        h.api.requestExtension(d, at(100), 'Explicit delayed charging', true)
          .success,
      ),
    );
    await h.act(() => assert.ok(h.api.setSitePowerBudgetKw(14).success));
    near(h.api.totalAllocatedPowerKw, 14);
  } finally {
    await h.close();
  }
});

test('guest forms only offer four vehicle types, with no manual label, capacity or AC input; type edit is applied', async () => {
  const h = await mount(false, true);
  const button = (text: string) =>
    h.renderer.root
      .findAllByType('button')
      .find((n) => n.children.includes(text))!;
  try {
    await h.act(() => button('Register now').props.onClick());
    const selector = h.renderer.root.findByProps({
      'aria-label': 'Vehicle type',
    });
    assert.deepEqual(
      selector.findAllByType('option').map((n) => n.children.join('')),
      ['Type A', 'Type B', 'Type C', 'Type D'],
    );
    const numberLabels = () =>
      h.renderer.root
        .findAllByType('input')
        .filter((n) => n.props.type === 'number')
        .map((n) => n.props['aria-label']);
    assert.deepEqual(numberLabels(), [
      'Current battery (%)',
      'Target battery (%)',
    ]);
    assert.equal(
      h.renderer.root
        .findAllByType('input')
        .filter((n) => n.props.required && n.props.type !== 'number').length,
      0,
    );
    await h.act(() => selector.props.onChange({ target: { value: 'C' } }));
    await h.act(() =>
      h.renderer.root
        .findByType('form')
        .props.onSubmit({ preventDefault() {} }),
    );
    assert.equal(h.api.activeSession!.vehicleType, 'C');
    near(h.api.activeSession!.targetKwh, 25.6);
    await h.act(() => button('Choose move time').props.onClick());
    await h.act(() => button('Review arrangement').props.onClick());
    await h.act(() => button('Confirm booking').props.onClick());
    await h.act(() => button('Change target or move time').props.onClick());
    assert.equal(
      h.renderer.root
        .findAllByType('input')
        .filter((n) => n.props.type === 'number').length,
      1,
    );
    await h.act(() =>
      h.renderer.root
        .findByProps({ 'aria-label': 'Vehicle type' })
        .props.onChange({ target: { value: 'D' } }),
    );
    await h.act(() =>
      h.renderer.root
        .findByType('form')
        .props.onSubmit({ preventDefault() {} }),
    );
    assert.equal(h.api.activeSession!.vehicleType, 'D');
    near(h.api.activeSession!.batteryCapacityKwh, 75);
    near(h.api.activeSession!.maxChargeKw, 12);
  } finally {
    await h.close();
  }
});

test('type changes needing a reduced promise require consent and keep other bookings protected', async () => {
  const h = await mount();
  try {
    const a = await add(h),
      b = await add(h);
    const original = h.api.sessions.find(
      (s) => s.requestId === a,
    )!.originalLatestFinishTime;
    const other = h.api.sessions.find((s) => s.requestId === b)!;
    await h.act(() =>
      assert.equal(h.api.modifyRequest(a, 80, 'D').success, false),
    );
    assert.equal(
      h.api.sessions.find((s) => s.requestId === a)!.vehicleType,
      'A',
    );
    const preview = h.api.getMovePreview(a, other.agreedMoveByTime, 80, 'D')!;
    assert.ok(preview.valid);
    assert.ok(preview.requiresAcceptance);
    await h.act(() =>
      assert.ok(h.api.modifyRequest(a, 80, 'D', undefined, true).success),
    );
    assert.equal(
      h.api.sessions.find((s) => s.requestId === a)!.originalLatestFinishTime,
      original,
    );
    await h.act(() => h.api.stepMinutes(120));
    near(h.api.sessions.find((s) => s.requestId === b)!.deliveredKwh, 7);
    assert.ok(
      h.api.sessions.find((s) => s.requestId === b)!.targetReachedAt! <=
        other.chargingDeadline!,
    );
  } finally {
    await h.close();
  }
});

test('target reached and reported moves remain occupied; front desk confirmation archives snapshot and selects next vehicle', async () => {
  const h = await mount(false, true);
  try {
    const a = await add(h),
      b = await add(h);
    await h.act(() => h.api.setActiveRequestId(a));
    const bay = h.api.activeSession!.bayId!;
    await h.act(() => h.api.stepMinutes(60));
    assert.equal(h.api.activeSession!.status, 'target_reached');
    assert.equal(h.api.sessions.length, 2);
    assert.equal(h.api.historyRecords.length, 0);
    assert.equal(
      h.api.bays.find((s) => s.bayId === bay)!.currentStatus,
      'occupied_idle',
    );
    assert.ok(
      h.renderer.root
        .findAllByType('p')
        .some((n) =>
          n.children.join('').includes('Charging complete — waiting'),
        ),
    );
    await h.act(() => h.api.stepMinutes(5));
    await h.act(() => h.api.reportVehicleMoved(a));
    assert.equal(h.api.sessions.length, 2);
    assert.equal(h.api.historyRecords.length, 0);
    assert.equal(h.api.activeSession!.bayId, bay);
    assert.ok(
      h.renderer.root
        .findAllByType('p')
        .some((n) =>
          n.children.join('').includes('waiting for reception confirmation'),
        ),
    );
    await h.act(() => h.api.stepMinutes(5));
    await h.act(() => h.api.confirmBayReleased(bay));
    assert.equal(
      h.api.sessions.some((s) => s.requestId === a),
      false,
    );
    assert.equal(h.api.activeRequestId, b);
    assert.equal(h.api.activeSession!.requestId, b);
    assert.equal(
      h.api.bays.find((s) => s.bayId === bay)!.currentStatus,
      'vacant',
    );
    const record = h.api.historyRecords[0];
    assert.equal(record.requestId, a);
    assert.equal(record.vehicleType, 'A');
    near(record.targetKwh, 7);
    near(record.actualDeliveredKwh, 7);
    assert.equal(record.chargingStartedAt, start);
    assert.equal(record.chargingCompletedAt, at(60));
    assert.equal(record.actualMoveTime, at(65));
    assert.equal(record.actualReleaseTime, at(70));
    assert.equal(record.session.targetReachedAt, at(60));
    assert.equal(record.acceptedEarlyDeparture, false);
    assert.equal(
      h.renderer.root
        .findAllByType('button')
        .filter((n) => n.props['data-request-id'] === a).length,
      0,
    );
  } finally {
    await h.close();
  }
});

test('stopped car keeps occupancy and pending staff task until staff confirm the move; staff record survives archive', async () => {
  const h = await mount(false, false, true);
  try {
    const id = await add(h);
    const bay = h.api.activeSession!.bayId!;
    await h.act(() => h.api.stepMinutes(30));
    await h.act(() =>
      h.api.requestValetAssistance(id, 'Keys left with reception.'),
    );
    const task = h.api.activeSession!.valetTask!;
    await h.act(() =>
      h.api.reviewValetTask(task.taskId, true, {
        staffAssigned: 'Alex',
        destinationBay: 'Standard 1',
        keysReceived: true,
        authorizationConfirmed: true,
      }),
    );
    await h.act(() => h.api.cancelRequest(id));
    assert.equal(h.api.sessions.length, 1);
    assert.equal(h.api.historyRecords.length, 0);
    assert.equal(h.api.activeSession!.bayId, bay);
    assert.equal(h.api.activeSession!.valetTask!.status, 'accepted');
    near(h.api.activeSession!.deliveredKwh, 3.5);
    await h.act(() => h.api.stepMinutes(10));
    near(h.api.activeSession!.deliveredKwh, 3.5);
    const moveButton = h.renderer.root
      .findAllByType('button')
      .find((n) =>
        n
          .findAllByType('span')
          .some((span) =>
            span.children.includes('Confirm staff moved car and bay is clear'),
          ),
      )!;
    assert.equal(moveButton.props.disabled, false);
    await h.act(() => moveButton.props.onClick());
    assert.equal(
      h.renderer.root
        .findAllByType('button')
        .filter((n) =>
          n
            .findAllByType('span')
            .some((span) =>
              span.children.includes(
                'Confirm staff moved car and bay is clear',
              ),
            ),
        ).length,
      0,
    );
    assert.equal(h.api.sessions.length, 0);
    assert.equal(h.api.activeSession, null);
    assert.equal(
      h.api.bays.find((s) => s.bayId === bay)!.currentStatus,
      'vacant',
    );
    const record = h.api.historyRecords[0];
    assert.equal(record.valetUsed, true);
    assert.equal(record.valetTask!.staffAssigned, 'Alex');
    assert.equal(record.valetTask!.status, 'completed');
    assert.equal(record.valetTask!.completedAt, at(40));
    assert.equal(record.chargingStoppedAt, at(30));
    assert.equal(record.actualMoveTime, at(40));
    assert.equal(record.acceptedEarlyDeparture, true);
    near(record.earlyDepartureDeficitKwh, 3.5);
    assert.equal(record.outcomeReason, 'Guest accepted early departure');
    assert.equal(h.api.availableStandardStalls, 11);
    await h.act(() => h.api.completeValetTask(task.taskId));
    assert.equal(h.api.historyRecords.length, 1);
  } finally {
    await h.close();
  }
});

test('remote and reserved-but-unparked bookings cancel directly into History with no fabricated move time', async () => {
  const h = await mount(false, true);
  try {
    await h.act(() =>
      h.api.submitRequest({
        ...input(),
        registrationMode: 'book_ahead',
        arrivalTime: at(60),
      }),
    );
    const id = h.api.activeRequestId!;
    await h.act(() =>
      assert.ok(
        h.api.confirmPlan(id, h.api.activeSession!.agreedMoveByTime).success,
      ),
    );
    assert.equal(h.api.activeSession!.bayId, null);
    await h.act(() => h.api.cancelRequest(id));
    assert.equal(h.api.sessions.length, 0);
    assert.equal(h.api.activeRequestId, null);
    const record = h.api.historyRecords[0];
    assert.equal(record.hadBay, false);
    assert.equal(record.actualMoveTime, null);
    assert.equal(record.chargingStartedAt, null);
    assert.equal(record.session.registrationMode, 'book_ahead');
    assert.equal(record.session.arrivalTime, at(60));
    assert.ok(
      h.renderer.root
        .findAllByType('p')
        .some((n) => n.children.join('').includes('No current vehicles')),
    );
    await h.act(() => h.api.submitRequest(input()));
    const second = h.api.activeRequestId!;
    await h.act(() =>
      assert.ok(
        h.api.confirmPlan(second, h.api.activeSession!.agreedMoveByTime)
          .success,
      ),
    );
    const reserved = h.api.activeSession!.bayId!;
    assert.ok(reserved);
    await h.act(() => h.api.cancelRequest(second));
    assert.equal(h.api.sessions.length, 0);
    assert.equal(h.api.historyRecords.length, 2);
    assert.equal(
      h.api.bays.find((s) => s.bayId === reserved)!.currentStatus,
      'vacant',
    );
    assert.equal(h.api.historyRecords[0].actualMoveTime, null);
  } finally {
    await h.close();
  }
});

test('archiving clears outstanding task views; complete scenario comparison includes history and preserves historical actuals', async () => {
  const h = await mount(true);
  try {
    const id = await add(h);
    await h.act(() => h.api.requestValetAssistance(id, 'Keys available.'));
    await h.act(() => h.api.requestExtension(id, at(150), 'Move only', false));
    await h.act(() => h.api.stepMinutes(60));
    const bay = h.api.activeSession!.bayId!;
    await h.act(() => h.api.reportVehicleMoved(id));
    await h.act(() => h.api.confirmBayReleased(bay));
    assert.equal(
      h.api.sessions.filter((s) => s.valetTask || s.extensionRequest).length,
      0,
    );
    const record = structuredClone(h.api.historyRecords[0]);
    assert.equal(record.valetTask!.status, 'pending_review');
    assert.ok(record.session.extensionRequest);
    await h.act(() =>
      h.renderer.root
        .findByProps({ 'aria-label': 'Data source' })
        .props.onChange({ target: { value: 'current' } }),
    );
    assert.ok(
      !h.renderer.root
        .findAllByType('span')
        .some((n) => n.children.join('').includes('/ 7.00 kWh')),
    );
    await h.act(() =>
      h.renderer.root
        .findByProps({ 'aria-label': 'Data source' })
        .props.onChange({ target: { value: 'complete' } }),
    );
    assert.ok(
      h.renderer.root
        .findAllByType('span')
        .some((n) => n.children.join('').includes('7.00 / 7.00 kWh')),
    );
    const cars = completeScenarioVehicles(h.api.sessions, h.api.historyRecords);
    assert.equal(cars.length, 1);
    assert.equal(cars[0].requestId, id);
    near(cars[0].deliveredKwh, 0);
    assert.equal(cars[0].bayReleasedAt, null);
    const result = runSimulationPolicy(
      DEFAULT_POLICIES[3],
      cars,
      4,
      7,
      14,
      start,
      at(180),
    );
    assert.equal(result.totalVehicles, 1);
    assert.equal(result.targetSuccessRatePercent, 100);
    // A completed car's observed move at 19:00 is not a new guest promise:
    // replay may finish at the agreed 20:00 deadline at lower site power.
    const slower = runSimulationPolicy(
      DEFAULT_POLICIES[3],
      cars,
      4,
      7,
      3.5,
      start,
      at(180),
    );
    assert.equal(slower.commitmentSuccessRatePercent, 100);
    assert.equal(slower.targetSuccessRatePercent, 100);
    assert.deepEqual(h.api.historyRecords[0], record);
    await h.act(() => h.api.confirmBayReleased(bay));
    assert.equal(h.api.historyRecords.length, 1);
  } finally {
    await h.close();
  }
});

test('full-scenario history retains early withdrawal in statistics without reserving a bay or classifying it as a missed promise', async () => {
  const h = await mount();
  try {
    await h.act(() =>
      h.api.submitRequest({
        ...input(),
        registrationMode: 'book_ahead',
        arrivalTime: at(60),
      }),
    );
    const id = h.api.activeRequestId!;
    await h.act(() =>
      assert.ok(
        h.api.confirmPlan(id, h.api.activeSession!.agreedMoveByTime).success,
      ),
    );
    await h.act(() => h.api.cancelRequest(id));
    const cars = completeScenarioVehicles(h.api.sessions, h.api.historyRecords);
    const result = runSimulationPolicy(
      DEFAULT_POLICIES[3],
      cars,
      1,
      7,
      7,
      start,
      at(240),
    );
    assert.equal(result.totalVehicles, 1);
    assert.equal(result.guestEarlyDepartureCount, 1);
    assert.equal(result.targetSuccessRatePercent, 0);
    assert.equal(result.commitmentSuccessRatePercent, 100);
    assert.equal(
      result.vehicleOutcomes[0].outcomeReason,
      'Guest accepted early departure',
    );
    near(result.totalDeficitKwh, 7);
  } finally {
    await h.close();
  }
});

test('guest names, shared types and unique booking IDs remain distinct in selectors, detail titles and history', async () => {
  const h = await mount(false, true);
  try {
    const ids: string[] = [];
    for (const roomNumber of ['101', '102']) {
      await h.act(() =>
        assert.ok(
          h.api.submitRequest({
            ...input(),
            guestName: 'Henry',
            roomNumber,
            vehicleType: 'A',
          }).success,
        ),
      );
      const id = h.api.activeRequestId!;
      ids.push(id);
      await h.act(() =>
        assert.ok(
          h.api.confirmPlan(id, h.api.activeSession!.agreedMoveByTime).success,
        ),
      );
    }
    assert.notEqual(ids[0], ids[1]);
    const buttons = ids.map((id) =>
      h.renderer.root.findByProps({ 'data-request-id': id }),
    );
    const text = (n: any) =>
      n
        .findAllByType('span')
        .map((s: any) => s.children.join(''))
        .join('|');
    assert.ok(text(buttons[0]).includes('Henry · Room 101 · Type A'));
    assert.ok(text(buttons[1]).includes('Henry · Room 102 · Type A'));
    assert.ok(
      h.renderer.root
        .findByType('h1')
        .children.join('')
        .includes('Henry · Room 102'),
    );
    await h.act(() => h.api.cancelRequest(ids[0]));
    const record = h.api.historyRecords[0];
    assert.equal(record.guestName, 'Henry');
    assert.equal(record.vehicleType, 'A');
    assert.equal(record.requestId, ids[0]);
    assert.equal(guestLabel(record), 'Henry');
    assert.ok(guestDetails(record).includes('Room 101 · Type A'));
  } finally {
    await h.close();
  }
});

test('unnamed guest uses a stable short booking label before and after archive; same name and room use booking IDs', async () => {
  const h = await mount(false, true);
  try {
    await h.act(() =>
      h.api.submitRequest({ ...input(), guestName: '  ', roomNumber: '' }),
    );
    const s = h.api.activeSession!,
      expected = `Guest ${shortBookingId(s.requestId)}`;
    assert.equal(s.guestName, '');
    assert.equal(guestLabel(s), expected);
    assert.equal(h.renderer.root.findByType('h1').children.join(''), expected);
    assert.ok(
      h.renderer.root
        .findByProps({ 'data-request-id': s.requestId })
        .findAllByType('span')
        .some((n) => n.children.join('').includes(expected)),
    );
    await h.act(() =>
      assert.ok(h.api.confirmPlan(s.requestId, s.agreedMoveByTime).success),
    );
    assert.equal(h.renderer.root.findByType('h1').children.join(''), expected);
    await h.act(() => h.api.cancelRequest(s.requestId));
    assert.equal(guestLabel(h.api.historyRecords[0]), expected);
    const same = [
      {
        ...s,
        requestId: 'booking-00000001',
        guestName: 'Henry',
        roomNumber: '101',
      },
      {
        ...s,
        requestId: 'booking-00000002',
        guestName: 'Henry',
        roomNumber: '101',
      },
    ];
    assert.equal(guestLabel(same[0], same), 'Henry · Booking 00000001');
    assert.equal(guestLabel(same[1], same), 'Henry · Booking 00000002');
  } finally {
    await h.close();
  }
});

test('deadline slack gives nearly finished urgent cars only needed power and shares the rest; exact completion redistributes immediately', () => {
  const cars = [
    car('A', 0.1, 1),
    car('B', 0.1, 300),
    car('C', 7, 120),
    car('D', 7, 120),
  ];
  const bays = hardware(['A', 'B', 'C', 'D']);
  assert.ok(validateSchedule(cars, bays, 14, start).feasible);
  const power = calculatePowerAllocation(
    cars,
    bays,
    14,
    'demand_urgency',
    start,
  );
  near(power.get('A')!, 6);
  assert.ok(power.get('B')! > 0 && power.get('B')! < 1);
  assert.ok(power.get('C')! > 3 && power.get('D')! > 3);
  near(
    [...power.values()].reduce((a, b) => a + b, 0),
    14,
  );
  cars.forEach((s) =>
    assert.ok(power.get(s.requestId)! <= Math.min(7, s.maxChargeKw)),
  );
  const after = advanceEngine(state(cars, bays), 1, 14, 'demand_urgency');
  assert.equal(after.sessions[0].targetReachedAt, at(1));
  assert.equal(after.sessions[0].allocatedKw, 0);
  assert.ok(after.sessions[0].bayId);
  assert.ok(after.sessions[2].allocatedKw > power.get('C')!);
  const done = advanceEngine(after, 299, 14, 'demand_urgency');
  done.sessions.forEach((s) => {
    near(s.deliveredKwh, s.targetKwh);
    assert.ok(
      Date.parse(s.targetReachedAt!) <= Date.parse(s.chargingDeadline!),
    );
  });
});

test('genuinely mandatory full-power deadlines may temporarily pause flexible cars', () => {
  const cars = [
    car('A', 7, 60),
    car('B', 7, 60),
    car('C', 7, 300),
    car('D', 7, 300),
  ];
  const bays = hardware(['A', 'B', 'C', 'D']);
  assert.ok(validateSchedule(cars, bays, 14, start).feasible);
  const power = calculatePowerAllocation(
    cars,
    bays,
    14,
    'demand_urgency',
    start,
  );
  near(power.get('A')!, 7);
  near(power.get('B')!, 7);
  near(power.get('C')!, 0);
  near(power.get('D')!, 0);
  const after = advanceEngine(state(cars, bays), 60, 14, 'demand_urgency');
  near(after.sessions[2].allocatedKw, 7);
  near(after.sessions[3].allocatedKw, 7);
  const done = advanceEngine(after, 240, 14, 'demand_urgency');
  done.sessions.forEach((s) => {
    near(s.deliveredKwh, 7);
    assert.ok(
      Date.parse(s.targetReachedAt!) <= Date.parse(s.chargingDeadline!),
    );
  });
});

test('slack allocation protects future tight bookings while sharing power with flexible connected vehicles', () => {
  const cars = [
    car('A', 7, 180),
    car('B', 7, 180),
    car('C', 7, 120, 60),
    car('D', 7, 120, 60),
  ];
  cars.slice(2).forEach((s) => {
    s.bayId = null;
    s.status = 'waiting_bay';
  });
  const bays = hardware(['A', 'B', 'C', 'D']);
  assert.ok(validateSchedule(cars, bays, 14, start).feasible);
  const done = advanceEngine(state(cars, bays), 180, 14, 'demand_urgency', {
    managed: true,
    assumptions: DEFAULT_ASSUMPTIONS,
  });
  done.sessions.forEach((s) => {
    near(s.deliveredKwh, 7);
    assert.ok(
      Date.parse(s.targetReachedAt!) <= Date.parse(s.chargingDeadline!),
    );
  });
});

test('late penalties start at agreed move-by, not completion, and unused reservations incur none', () => {
  const s = car('A', 7, 75);
  s.status = 'target_reached';
  s.deliveredKwh = 7;
  s.targetReachedAt = at(60);
  near(bookingPenalty(s, at(60), DEFAULT_PENALTY_POLICY).penaltyAmount, 0);
  near(bookingPenalty(s, at(75), DEFAULT_PENALTY_POLICY).penaltyAmount, 0);
  const late = bookingPenalty(s, at(87), DEFAULT_PENALTY_POLICY);
  near(late.lateMinutes, 12);
  near(late.penaltyAmount, 6);
  assert.equal(late.penaltyStatus, 'accruing');
  const stopped = { ...s, status: 'cancelled' as const };
  near(
    bookingPenalty(stopped, at(87), DEFAULT_PENALTY_POLICY).penaltyAmount,
    6,
  );
  const reserved = {
    ...s,
    status: 'waiting_plugin' as const,
    pluggedInAt: null,
    moveReportedAt: null,
  };
  near(
    bookingPenalty(reserved, at(87), DEFAULT_PENALTY_POLICY).penaltyAmount,
    0,
  );
  const grace = bookingPenalty(s, at(87), {
    ratePerMinute: 0.5,
    graceMinutes: 10,
  });
  near(grace.penaltyAmount, 1);
});

test('completed overdue occupant blocks an arrived booking until reception confirms vacancy; penalties freeze to the confirmed move time', async () => {
  const h = await mount(false, false, true);
  const a = {
    ...car('A', 7, 90),
    guestName: 'Sarah Jenkins',
    roomNumber: '101',
    bayId: 'bay-1',
  };
  const b = {
    ...car('B', 7, 300, 80),
    guestName: 'Emma Watson',
    roomNumber: '102',
    bayId: null,
    status: 'waiting_bay' as const,
  };
  const preset = {
    ...emptyPreset,
    id: 'turnover-penalty-test',
    bayCount: 1,
    sitePowerBudgetKw: 7,
    sessions: [a, b],
  };
  ALL_PRESETS.push(preset);
  try {
    await h.act(() => h.api.loadPreset(preset.id));
    await h.act(() => h.api.stepMinutes(60));
    assert.equal(
      h.api.sessions.find((s) => s.requestId === 'A')!.status,
      'target_reached',
    );
    assert.equal(h.api.bays[0].currentRequestId, 'A');
    near(h.api.sessions[0].penalty!.penaltyAmount, 0);
    await h.act(() => h.api.stepMinutes(42));
    const blocked = h.api.sessions.find((s) => s.requestId === 'B')!;
    assert.equal(blocked.bayId, null);
    assert.equal(blocked.status, 'waiting_bay');
    near(blocked.deliveredKwh, 0);
    near(
      h.api.sessions.find((s) => s.requestId === 'A')!.penalty!.lateMinutes,
      12,
    );
    near(
      h.api.sessions.find((s) => s.requestId === 'A')!.penalty!.penaltyAmount,
      6,
    );
    const bayCard = h.renderer.root.findAllByType(BayCard)[0];
    const bayText = JSON.stringify(
      bayCard.findAllByType('p').map((n) => n.children),
    );
    assert.ok(bayText.includes('Charging completion:'));
    assert.ok(bayText.includes('Current accumulated penalty:'));
    assert.ok(bayText.includes('6.00'));
    assert.ok(bayText.includes('12.0 min'));
    const row = h.renderer.root.findByProps({ 'data-penalty-request': 'A' });
    assert.ok(
      row
        .findAllByType('td')
        .some((n) => n.children.join('').includes('$6.00')),
    );
    assert.ok(
      h.renderer.root
        .findAllByType('p')
        .some(
          (n) =>
            n.children.join('').includes('Sarah Jenkins') &&
            n.children.join('').includes('still occupying bay'),
        ),
    );
    await h.act(() => h.api.reportVehicleMoved('A'));
    assert.equal(h.api.bays[0].currentRequestId, 'A');
    assert.equal(h.api.sessions.find((s) => s.requestId === 'B')!.bayId, null);
    await h.act(() => h.api.stepMinutes(3));
    near(
      h.api.sessions.find((s) => s.requestId === 'A')!.penalty!.penaltyAmount,
      7.5,
    );
    await h.act(() => h.api.confirmBayReleased('bay-1'));
    const final = h.api.historyRecords.find((r) => r.requestId === 'A')!;
    assert.equal(final.penalty.actualMoveOutTime, at(102));
    assert.equal(final.penalty.penaltyStatus, 'final');
    near(final.penalty.penaltyAmount, 6);
    near(final.simulatedFeeCharged, 6);
    near(final.overstayMinutes, 12);
    assert.equal(final.guestName, 'Sarah Jenkins');
    assert.equal(h.api.bays[0].currentRequestId, 'B');
    assert.equal(
      h.api.sessions.find((s) => s.requestId === 'B')!.status,
      'waiting_plugin',
    );
    near(h.api.sessions.find((s) => s.requestId === 'B')!.allocatedKw, 0);
    await h.act(() =>
      assert.ok(h.api.confirmVehicleParkedAndPlugged('bay-1', 'B').success),
    );
    near(h.api.sessions.find((s) => s.requestId === 'B')!.allocatedKw, 7);
    await h.act(() => h.api.stepMinutes(60));
    near(h.api.sessions.find((s) => s.requestId === 'B')!.deliveredKwh, 7);
    near(h.api.historyRecords[0].penalty.penaltyAmount, 6);
    await h.act(() =>
      assert.ok(
        h.api.setPenaltyPolicy({ ratePerMinute: 2, graceMinutes: 0 }).success,
      ),
    );
    near(h.api.historyRecords[0].penalty.penaltyAmount, 6);
    assert.ok(
      h.renderer.root
        .findByProps({ 'data-penalty-request': 'A' })
        .findAllByType('td')
        .some((n) => n.children.join('').includes('Final')),
    );
    near(
      h.api.sessions.find((s) => s.requestId === 'B')!.penalty!.penaltyAmount,
      0,
    );
  } finally {
    await h.close();
  }
});

test('adaptive slack sharing honors distinct vehicle and charger caps while redistributing the site budget', () => {
  const cars = [car('A', 7, 300, 0, 11), car('B', 7, 300, 0, 3.6)];
  const bays = hardware(['A', 'B'], 11);
  const power = calculatePowerAllocation(
    cars,
    bays,
    14,
    'demand_urgency',
    start,
  );
  near(power.get('A')!, 10.4);
  near(power.get('B')!, 3.6);
  near(
    [...power.values()].reduce((a, b) => a + b, 0),
    14,
  );
  const done = advanceEngine(state(cars, bays), 300, 14, 'demand_urgency');
  done.sessions.forEach((s) => {
    near(s.deliveredKwh, 7);
    assert.ok(
      Date.parse(s.targetReachedAt!) <= Date.parse(s.chargingDeadline!),
    );
  });
});
