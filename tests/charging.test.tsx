import { SimulationComparisonView } from '../src/components/simulation/SimulationComparisonView';
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
    requestId: id,
    vehicleId: id,
    batteryCapacityKwh: 70,
    initialSocPercent: 0,
    targetKwh: energy,
    targetPercent: (energy / 70) * 100,
    arrivalTime: at(arrival),
    useByTime: at(deadline),
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
async function mount(comparison = false) {
  let api!: ReturnType<typeof useSimulation>, renderer!: ReactTestRenderer;
  function Probe() {
    api = useSimulation();
    return null;
  }
  await act(async () => {
    renderer = create(
      <SimulationProvider>
        <Probe />
        {comparison && <SimulationComparisonView />}
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
const input = (id = 'A', target = 10, capacity = 70) => ({
  vehicleId: id,
  guestName: 'Guest',
  roomNumber: '1',
  inputMode: 'percentage' as const,
  currentPercent: 0,
  targetPercent: target,
  batteryCapacityKwh: capacity,
  maxChargeKw: 11,
  useByTime: at(360),
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
          useByTime: at(180),
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
        h.api.modifyRequest(id, 10, at(360), 11, at(30)).success,
        false,
      ),
    );
    await h.act(() =>
      assert.equal(h.api.modifyRequest(id, 90, at(360), 11).success, false),
    );
    assert.equal(h.api.activeSession!.targetPercent, 10);
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
    assert.equal(h.api.activeSession!.bayId, null);
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
    await h.act(() =>
      assert.ok(h.api.modifyRequest(id, 15, at(360), 11).success),
    );
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
  cars[0].useByTime = at(165);
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
    await h.act(() =>
      assert.ok(h.api.modifyRequest(id, 15, at(360), 11).success),
    );
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
