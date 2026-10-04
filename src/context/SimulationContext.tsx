import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  Bay,
  ChargingSession,
  SystemEvent,
  HistoryRecord,
  AllocationAlgorithm,
  VehicleRequestInput,
} from '../types';
import {
  ALL_PRESETS,
  PRESET_1_POWER_CRUNCH,
  type SimulationPreset,
} from '../data/presets';
import {
  advanceEngine,
  calculatePowerAllocation,
  syncBays,
  reserveQueue,
  predictCharging,
  validateSchedule,
  remainingEnergy,
  type EngineState,
  type ChargingPrediction,
} from '../utils/allocation';
import { addMinutesToIso, formatDateTime, getMinutesDiff } from '../utils/time';

type Result = { success: boolean; requestId?: string; error?: string };
const success: Result = { success: true };
const failure = (error: string): Result => ({ success: false, error });
const time = (value: string) => Date.parse(value);
interface DeskState extends EngineState {
  historyRecords: HistoryRecord[];
  systemEvents: SystemEvent[];
}
function initialState(preset: SimulationPreset): DeskState {
  const sessions = structuredClone(preset.sessions).map((s) => ({
    ...s,
    arrivalTime: new Date(s.arrivalTime).toISOString(),
    useByTime: new Date(s.useByTime).toISOString(),
    agreedMoveByTime: new Date(s.agreedMoveByTime).toISOString(),
    targetPercent:
      s.initialSocPercent + (s.targetKwh / s.batteryCapacityKwh) * 100,
    originalLatestFinishTime: new Date(
      Math.min(time(s.plannedLatestFinishTime), time(s.useByTime)),
    ).toISOString(),
    chargingDeadline: new Date(
      Math.min(time(s.plannedLatestFinishTime), time(s.useByTime)),
    ).toISOString(),
    completionWindowStart: new Date(s.estimatedFinishTime).toISOString(),
    completionWindowEnd: new Date(s.plannedLatestFinishTime).toISOString(),
    moveReportedAt: null,
    ...(time(s.arrivalTime) > time(preset.simulationStartIso)
      ? { status: 'waiting_bay' as const, bayId: null, allocatedKw: 0 }
      : {}),
  }));
  const bays: Bay[] = Array.from({ length: preset.bayCount }, (_, i) => ({
    bayId: `bay-${i + 1}`,
    bayNumber: i + 1,
    name: `Bay ${i + 1}`,
    maxKw: preset.chargerMaxKw,
    currentStatus: 'vacant',
    currentVehicleId: null,
    currentRequestId: null,
    allocatedKw: 0,
  }));
  return {
    sessions,
    bays: syncBays(sessions, bays),
    currentTimeIso: new Date(preset.simulationStartIso).toISOString(),
    historyRecords: [],
    systemEvents: [],
  };
}
function event(
  state: DeskState,
  message: string,
  category: SystemEvent['category'] = 'charging',
  type: SystemEvent['type'] = 'info',
  session?: ChargingSession,
) {
  state.systemEvents = [
    {
      id: crypto.randomUUID(),
      timestamp: state.currentTimeIso,
      message,
      category,
      type,
      requestId: session?.requestId,
      vehicleId: session?.vehicleId,
    },
    ...state.systemEvents,
  ].slice(0, 80);
}

function useSimulationState() {
  const [activePresetId, setActivePresetId] = useState(
    PRESET_1_POWER_CRUNCH.id,
  );
  const [state, setState] = useState(() => initialState(PRESET_1_POWER_CRUNCH));
  const stateRef = useRef(state);
  const [sitePowerBudgetKw, setBudget] = useState(
    PRESET_1_POWER_CRUNCH.sitePowerBudgetKw,
  );
  const budgetRef = useRef(sitePowerBudgetKw);
  const [activeAlgorithm, setAlgorithm] =
    useState<AllocationAlgorithm>('demand_urgency');
  const algorithmRef = useRef(activeAlgorithm);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(
    state.sessions[0]?.requestId || null,
  );
  const [userRole, setUserRole] = useState<
    'guest' | 'frontdesk' | 'simulation'
  >('guest');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(5);
  const [extensionLimitMinutes, setExtensionLimitMinutes] = useState(60);
  const staffOnDuty = [
    'Alex Turner (Front Desk)',
    'Jordan Miller (Duty Manager)',
    'Sam Vance (Night Attendant)',
  ];
  const idleGracePeriodMins = 15,
    idleFeePerMin = 0.5;
  const refresh = useCallback((draft: DeskState) => {
    draft.bays = syncBays(draft.sessions, draft.bays);
    const powers = calculatePowerAllocation(
      draft.sessions,
      draft.bays,
      budgetRef.current,
      algorithmRef.current,
      draft.currentTimeIso,
    );
    draft.sessions.forEach((s) => {
      s.allocatedKw = powers.get(s.requestId) || 0;
      if (s.status === 'charging' || s.status === 'paused')
        s.status = s.allocatedKw > 0 ? 'charging' : 'paused';
    });
    draft.bays = syncBays(draft.sessions, draft.bays);
    stateRef.current = draft;
    setState(draft);
  }, []);
  const change = useCallback(
    (fn: (draft: DeskState) => void) => {
      const draft = structuredClone(stateRef.current);
      fn(draft);
      refresh(draft);
    },
    [refresh],
  );
  const loadPreset = useCallback(
    (id: string) => {
      const preset = ALL_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      setIsPlaying(false);
      setActivePresetId(id);
      budgetRef.current = preset.sitePowerBudgetKw;
      setBudget(preset.sitePowerBudgetKw);
      const draft = initialState(preset);
      event(draft, `Loaded ${preset.name}`, 'power');
      refresh(draft);
      setActiveRequestId(draft.sessions[0]?.requestId || null);
    },
    [refresh],
  );
  const resetSimulation = () => loadPreset(activePresetId);
  useEffect(() => {
    refresh(structuredClone(stateRef.current));
  }, [refresh]);
  const stepMinutes = useCallback(
    (minutes: number) => {
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      const previous = stateRef.current;
      const advanced = advanceEngine(
        previous,
        minutes,
        budgetRef.current,
        algorithmRef.current,
      );
      const draft = { ...previous, ...advanced };
      draft.sessions.forEach((s) => {
        const old = previous.sessions.find((o) => o.requestId === s.requestId);
        if (s.targetReachedAt && !old?.targetReachedAt)
          event(
            draft,
            `Target reached. Please move your car by ${formatDateTime(s.agreedMoveByTime)}.`,
            'charging',
            'success',
            s,
          );
        if (
          s.status === 'ended_incomplete' &&
          old?.status !== 'ended_incomplete'
        )
          event(
            draft,
            `${s.vehicleId}: charging stopped at deadline; ${remainingEnergy(s).toFixed(1)} kWh still needed.`,
            'charging',
            'alert',
            s,
          );
        if (s.status === 'waiting_plugin' && old?.status !== 'waiting_plugin')
          event(
            draft,
            `${s.vehicleId}: your bay is reserved. Please park and plug in; staff will confirm.`,
            'queue',
            'info',
            s,
          );
      });
      refresh(draft);
    },
    [refresh],
  );
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => stepMinutes(playbackSpeed), 1000);
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, stepMinutes]);

  const validate = (
    sessions: ChargingSession[],
    bays = stateRef.current.bays,
    budget = budgetRef.current,
  ) => {
    if (
      !validateSchedule(sessions, bays, budget, stateRef.current.currentTimeIso)
        .feasible
    )
      return false;
    return (
      algorithmRef.current !== 'equal_sharing' ||
      sessions
        .filter(
          (s) =>
            !s.bayReleasedAt &&
            ['charging', 'paused', 'waiting_bay', 'waiting_plugin'].includes(
              s.status,
            ) &&
            remainingEnergy(s) > 1e-7,
        )
        .every(
          (s) =>
            predictCharging(
              s,
              sessions,
              bays,
              budget,
              'equal_sharing',
              stateRef.current.currentTimeIso,
            ).feasible,
        )
    );
  };
  const setSitePowerBudgetKw = (kw: number): Result => {
    if (!Number.isFinite(kw) || kw < 0)
      return failure('Enter a non-negative site power limit.');
    if (!validate(stateRef.current.sessions, stateRef.current.bays, kw))
      return failure(
        'This power limit would break an existing charging deadline. Extend the affected plans explicitly first.',
      );
    budgetRef.current = kw;
    setBudget(kw);
    change((d) => event(d, `Site limit updated to ${kw} kW.`, 'power'));
    return success;
  };
  const setActiveAlgorithm = (algorithm: AllocationAlgorithm): Result => {
    // Equal sharing is a benchmark option; do not break protected live promises.
    if (
      algorithm === 'equal_sharing' &&
      stateRef.current.sessions.some(
        (s) =>
          !s.bayReleasedAt &&
          ['charging', 'paused', 'waiting_bay', 'waiting_plugin'].includes(
            s.status,
          ) &&
          !predictCharging(
            s,
            stateRef.current.sessions,
            stateRef.current.bays,
            budgetRef.current,
            algorithm,
            stateRef.current.currentTimeIso,
          ).feasible,
      )
    )
      return failure(
        'Equal sharing would miss a confirmed deadline. Use the comparison page to test it.',
      );
    algorithmRef.current = algorithm;
    setAlgorithm(algorithm);
    change(() => {});
    return success;
  };
  const setChargerMaxKw = (kw: number): Result => {
    if (!Number.isFinite(kw) || kw <= 0)
      return failure('Charger AC limit must be greater than zero.');
    const bays = stateRef.current.bays.map((b) => ({ ...b, maxKw: kw }));
    if (!validate(stateRef.current.sessions, bays))
      return failure('This charger limit would break a confirmed deadline.');
    change((d) => {
      d.bays = bays;
    });
    return success;
  };
  const submitRequest = (input: VehicleRequestInput): Result => {
    const {
      batteryCapacityKwh: capacity,
      currentPercent: current,
      targetPercent: target,
      maxChargeKw: ac,
    } = input;
    if (!input.vehicleId.trim())
      return failure('Enter your vehicle registration.');
    if (
      !Number.isFinite(capacity) ||
      !capacity ||
      capacity <= 0 ||
      !Number.isFinite(ac) ||
      !ac ||
      ac <= 0
    )
      return failure(
        'Enter valid usable capacity and maximum AC charging power.',
      );
    if (
      !Number.isFinite(current) ||
      !Number.isFinite(target) ||
      current! < 0 ||
      target! > 100 ||
      target! <= current!
    )
      return failure(
        'Choose a target above your current battery level, up to 100%.',
      );
    const now = stateRef.current.currentTimeIso;
    if (
      !Number.isFinite(time(input.useByTime)) ||
      time(input.useByTime) <= time(now)
    )
      return failure('Choose a future time when you need your car.');
    if (
      stateRef.current.sessions.some(
        (s) =>
          s.vehicleId === input.vehicleId.trim().toUpperCase() &&
          !s.bayReleasedAt &&
          s.status !== 'pending_confirmation',
      )
    )
      return failure('This vehicle already has an active plan.');
    const s: ChargingSession = {
      requestId: crypto.randomUUID(),
      vehicleId: input.vehicleId.trim().toUpperCase(),
      guestName: input.guestName.trim() || 'Hotel Guest',
      roomNumber: input.roomNumber.trim(),
      batteryCapacityKwh: capacity,
      initialSocPercent: current!,
      targetPercent: target!,
      targetKwh: (capacity * (target! - current!)) / 100,
      maxChargeKw: ac,
      arrivalTime: now,
      useByTime: new Date(input.useByTime).toISOString(),
      agreedMoveByTime: input.useByTime,
      moveMethod: input.moveMethod || 'self',
      estimatedStartTime: now,
      estimatedFinishTime: '',
      plannedLatestFinishTime: '',
      isFeasibleOnTime: false,
      projectedDeficitKwh: 0,
      guestAcceptedDeficit: false,
      status: 'pending_confirmation',
      bayId: null,
      deliveredKwh: 0,
      allocatedKw: 0,
      pluggedInAt: null,
      targetReachedAt: null,
      bayReleasedAt: null,
      notificationsSent: {
        fifteenMinWarning: false,
        targetReached: false,
        overdueWarning: false,
      },
    };
    // Pending plans never consume power or reserve bays. Generate tentative
    // full-load bounds and revalidate against the live state at confirmation.
    const tentative = { ...s, status: 'waiting_bay' as const };
    const cars = [
      ...stateRef.current.sessions.filter(
        (x) => x.status !== 'pending_confirmation',
      ),
      tentative,
    ];
    const prediction = predictCharging(
      tentative,
      cars,
      stateRef.current.bays,
      budgetRef.current,
      algorithmRef.current,
      now,
    );
    s.completionWindowStart = prediction.fastest || '';
    s.completionWindowEnd = prediction.fullLoad || '';
    s.estimatedStartTime =
      prediction.waitMinutes !== null
        ? addMinutesToIso(now, prediction.waitMinutes)
        : '';
    s.estimatedFinishTime = prediction.expected || '';
    s.plannedLatestFinishTime = prediction.fullLoad || '';
    s.originalLatestFinishTime = prediction.fullLoad || '';
    s.chargingDeadline = prediction.fullLoad || '';
    s.agreedMoveByTime = prediction.fullLoad || input.useByTime;
    s.isFeasibleOnTime =
      prediction.feasible &&
      !!prediction.fullLoad &&
      time(prediction.fullLoad) <= time(s.useByTime);
    s.projectedDeficitKwh = prediction.deficitKwh;
    change((d) => {
      d.sessions = d.sessions.filter(
        (x) => x.status !== 'pending_confirmation',
      );
      d.sessions.push(s);
    });
    setActiveRequestId(s.requestId);
    return { success: true, requestId: s.requestId };
  };
  const confirmPlan = (
    requestId: string,
    moveTime: string,
    _acceptedDeficit = false,
  ): Result => {
    const draft = structuredClone(stateRef.current),
      s = draft.sessions.find((s) => s.requestId === requestId);
    if (!s || s.status !== 'pending_confirmation')
      return failure('Generate a new plan first.');
    if (
      !s.originalLatestFinishTime ||
      time(s.originalLatestFinishTime) > time(s.useByTime) ||
      !Number.isFinite(time(moveTime)) ||
      time(moveTime) > time(s.useByTime) ||
      time(moveTime) <= time(draft.currentTimeIso)
    )
      return failure('Choose a valid move time before you need your car.');
    s.agreedMoveByTime = new Date(moveTime).toISOString();
    s.status = 'waiting_bay';
    // Check the current queue and all existing promises, not only this car.
    if (!validate(draft.sessions))
      return failure(
        'This plan cannot meet all confirmed deadlines. Choose a later use-by time or a lower target.',
      );
    const predicted = predictCharging(
      s,
      draft.sessions,
      draft.bays,
      budgetRef.current,
      algorithmRef.current,
      draft.currentTimeIso,
    );
    if (
      !predicted.expected ||
      time(predicted.expected) >
        Math.min(time(moveTime), time(s.chargingDeadline!))
    )
      return failure(
        'We cannot finish before this move time. Choose a later time or lower target.',
      );
    reserveQueue(draft.sessions, draft.bays, draft.currentTimeIso);
    event(
      draft,
      s.bayId
        ? 'Your bay is reserved. Park and plug in, then ask reception to confirm.'
        : 'Your plan is confirmed. We will invite you when a bay is available.',
      'queue',
      'success',
      s,
    );
    refresh(draft);
    return success;
  };
  const confirmVehicleParkedAndPlugged = (
    bayId: string,
    vehicleId: string,
  ): Result => {
    const draft = structuredClone(stateRef.current),
      s = draft.sessions.find(
        (s) =>
          s.bayId === bayId &&
          s.vehicleId === vehicleId &&
          s.status === 'waiting_plugin',
      );
    if (!s)
      return failure('This vehicle does not have a reservation for this bay.');
    if (!validate(draft.sessions))
      return failure(
        'Please revise the plan: the delayed arrival can no longer meet the confirmed deadlines.',
      );
    s.status = 'charging';
    s.pluggedInAt = draft.currentTimeIso;
    event(draft, `${vehicleId} parked and plugged in.`, 'bay', 'success', s);
    refresh(draft);
    return success;
  };
  const reportVehicleMoved = (requestId: string) =>
    change((d) => {
      const s = d.sessions.find((s) => s.requestId === requestId);
      if (s?.bayId) {
        s.moveReportedAt = d.currentTimeIso;
        s.allocatedKw = 0;
        if (remainingEnergy(s) > 1e-7) s.status = 'cancelled';
        event(
          d,
          'Move reported. Waiting for reception to confirm the bay is clear.',
          'bay',
          'info',
          s,
        );
      }
    });
  const release = (draft: DeskState, bayId: string, notes?: string) => {
    const s = draft.sessions.find((s) => s.bayId === bayId && !s.bayReleasedAt);
    if (!s) return;
    s.bayId = null;
    s.bayReleasedAt = draft.currentTimeIso;
    s.allocatedKw = 0;
    s.moveReportedAt = null;
    if (remainingEnergy(s) > 1e-7 && s.status !== 'cancelled')
      s.status = 'ended_incomplete';
    const overstay = Math.max(
      0,
      getMinutesDiff(s.agreedMoveByTime, draft.currentTimeIso),
    );
    draft.historyRecords.unshift({
      id: crypto.randomUUID(),
      requestId: s.requestId,
      vehicleId: s.vehicleId,
      guestName: s.guestName,
      roomNumber: s.roomNumber,
      arrivalTime: s.arrivalTime,
      departureTime: draft.currentTimeIso,
      targetKwh: s.targetKwh,
      actualDeliveredKwh: s.deliveredKwh,
      targetAchieved: remainingEnergy(s) < 1e-7,
      onTimeCompletion:
        !!s.targetReachedAt &&
        time(s.targetReachedAt) <=
          Math.min(time(s.chargingDeadline || s.useByTime), time(s.useByTime)),
      scheduledMoveTime: s.agreedMoveByTime,
      actualReleaseTime: draft.currentTimeIso,
      overstayMinutes: overstay,
      simulatedFeeCharged:
        Math.max(0, overstay - idleGracePeriodMins) * idleFeePerMin,
      valetUsed: s.valetTask?.status === 'completed',
      notes: notes || 'Bay inspected and released.',
    });
    reserveQueue(draft.sessions, draft.bays, draft.currentTimeIso);
    event(
      draft,
      `Bay released. The next waiting vehicle is invited to park; charging waits for plug-in confirmation.`,
      'bay',
      'success',
      s,
    );
  };
  const confirmBayReleased = (bayId: string, notes?: string) =>
    change((d) => release(d, bayId, notes));
  const cancelRequest = (id: string) =>
    change((d) => {
      const s = d.sessions.find((s) => s.requestId === id);
      if (s) {
        s.status = 'cancelled';
        s.allocatedKw = 0;
        event(
          d,
          'Charging stopped. Your bay remains occupied until reception confirms you have moved.',
          'charging',
          'info',
          s,
        );
      }
    });
  const modifyRequest = (
    id: string,
    targetPercent: number,
    newUseByTime: string,
    maxChargeKw?: number,
    moveTime?: string,
  ): Result => {
    const draft = structuredClone(stateRef.current),
      s = draft.sessions.find((s) => s.requestId === id);
    if (!s || s.bayReleasedAt) return failure('This charging plan has ended.');
    const current =
      s.initialSocPercent + (s.deliveredKwh / s.batteryCapacityKwh) * 100;
    if (
      !Number.isFinite(targetPercent) ||
      targetPercent < current - 1e-7 ||
      targetPercent > 100
    )
      return failure(
        `Choose a target between ${current.toFixed(1)}% and 100%.`,
      );
    if (
      !Number.isFinite(time(newUseByTime)) ||
      time(newUseByTime) <= time(draft.currentTimeIso)
    )
      return failure('Choose a future use-by time.');
    if (
      maxChargeKw !== undefined &&
      (!Number.isFinite(maxChargeKw) || maxChargeKw <= 0)
    )
      return failure('Enter a positive AC charging limit.');
    s.targetPercent = targetPercent;
    s.targetKwh =
      (s.batteryCapacityKwh * (targetPercent - s.initialSocPercent)) / 100;
    s.useByTime = newUseByTime;
    s.maxChargeKw = maxChargeKw ?? s.maxChargeKw;
    if (moveTime) {
      if (
        !Number.isFinite(time(moveTime)) ||
        time(moveTime) <= time(draft.currentTimeIso) ||
        time(moveTime) > time(newUseByTime)
      )
        return failure(
          'Choose a future move time no later than your use-by time.',
        );
      s.agreedMoveByTime = moveTime;
    }
    if (remainingEnergy(s) > 1e-7) {
      s.status = s.bayId
        ? s.pluggedInAt
          ? 'charging'
          : 'waiting_plugin'
        : 'waiting_bay';
      s.targetReachedAt = null;
      s.notificationsSent = {
        fifteenMinWarning: false,
        targetReached: false,
        overdueWarning: false,
      };
    } else {
      s.status = 'target_reached';
      s.targetReachedAt = s.targetReachedAt || draft.currentTimeIso;
    }
    if (!validate(draft.sessions))
      return failure(
        'This change would miss a charging deadline. Lower your target or explicitly extend your charging time.',
      );
    const prediction = predictCharging(
      s,
      draft.sessions,
      draft.bays,
      budgetRef.current,
      algorithmRef.current,
      draft.currentTimeIso,
    );
    if (!prediction.feasible)
      return failure('This change cannot meet the confirmed schedule.');
    event(
      draft,
      'Charging target updated; all confirmed deadlines remain protected.',
      'charging',
      'success',
      s,
    );
    refresh(draft);
    return success;
  };
  const requestExtension = (
    id: string,
    newTime: string,
    reason: string,
    allowChargingDelay = false,
  ): Result => {
    const draft = structuredClone(stateRef.current),
      s = draft.sessions.find((s) => s.requestId === id);
    if (!s || !s.originalLatestFinishTime || s.bayReleasedAt)
      return failure('No active confirmed plan.');
    const limit = time(
      addMinutesToIso(s.originalLatestFinishTime, extensionLimitMinutes),
    );
    if (
      !Number.isFinite(time(newTime)) ||
      time(newTime) > limit ||
      time(newTime) <= time(draft.currentTimeIso) ||
      time(newTime) < time(s.agreedMoveByTime)
    )
      return failure(
        `Choose a later time no later than ${formatDateTime(new Date(limit).toISOString())}. The limit is based on your original plan.`,
      );
    const old = s.agreedMoveByTime;
    s.agreedMoveByTime = newTime;
    if (allowChargingDelay) {
      s.chargingDeadline = newTime;
      s.useByTime = new Date(
        Math.max(time(s.useByTime), time(newTime)),
      ).toISOString();
    }
    if (!validate(draft.sessions))
      return failure('This extension would break another confirmed plan.');
    s.extensionRequest = {
      requestId: id,
      vehicleId: s.vehicleId,
      currentDeadline: old,
      requestedDeadline: newTime,
      reason,
      status: 'approved',
      requestedAt: draft.currentTimeIso,
      reviewedAt: draft.currentTimeIso,
      allowChargingDelay,
    };
    event(
      draft,
      allowChargingDelay
        ? 'You accepted a later charging deadline. Power may be reduced while still finishing by the new time.'
        : 'Move time extended. Your charging deadline is unchanged.',
      'charging',
      'success',
      s,
    );
    refresh(draft);
    return success;
  };
  const reviewExtensionRequest = (id: string, approved: boolean) =>
    change((d) => {
      const s = d.sessions.find((s) => s.requestId === id);
      if (s?.extensionRequest && !approved)
        s.extensionRequest.status = 'rejected';
    });
  const requestValetAssistance = (id: string, note: string) =>
    change((d) => {
      const s = d.sessions.find((s) => s.requestId === id);
      if (
        !s?.bayId ||
        ['accepted', 'pending_review'].includes(s.valetTask?.status || '')
      )
        return;
      s.moveMethod = 'valet';
      s.valetTask = {
        taskId: crypto.randomUUID(),
        requestId: id,
        vehicleId: s.vehicleId,
        bayId: s.bayId,
        requestedAt: d.currentTimeIso,
        status: 'pending_review',
        authorizationConfirmed: true,
        keysHandoverNote: note,
        keysReceived: false,
        staffAssigned: null,
        destinationBay: null,
      };
      event(
        d,
        'Staff assistance requested. Reception will verify your keys and parking space.',
        'valet',
        'info',
        s,
      );
    });
  const reviewValetTask = (
    id: string,
    approved: boolean,
    params?: {
      staffAssigned?: string;
      destinationBay?: string;
      rejectionReason?: string;
      keysReceived?: boolean;
      authorizationConfirmed?: boolean;
    },
  ) =>
    change((d) => {
      const s = d.sessions.find((s) => s.valetTask?.taskId === id);
      if (!s?.valetTask || s.valetTask.status !== 'pending_review') return;
      if (
        approved &&
        (!params?.keysReceived ||
          !params.authorizationConfirmed ||
          !params.destinationBay?.trim() ||
          !params.staffAssigned)
      )
        return;
      s.valetTask = {
        ...s.valetTask,
        ...params,
        status: approved ? 'accepted' : 'rejected',
      };
    });
  const completeValetTask = (id: string) =>
    change((d) => {
      const s = d.sessions.find((s) => s.valetTask?.taskId === id);
      if (
        !s?.valetTask ||
        s.valetTask.status !== 'accepted' ||
        !s.bayId ||
        remainingEnergy(s) > 1e-7
      )
        return;
      s.valetTask.status = 'completed';
      s.valetTask.completedAt = d.currentTimeIso;
      release(d, s.bayId, 'Staff confirmed vehicle moved to standard parking.');
    });
  const predictions: Record<string, ChargingPrediction> = {};
  for (const s of state.sessions) {
    const candidate =
      s.status === 'pending_confirmation'
        ? { ...s, status: 'waiting_bay' as const }
        : s;
    const cars = state.sessions.filter(
      (x) => x.status !== 'pending_confirmation',
    );
    if (s.status === 'pending_confirmation') cars.push(candidate);
    predictions[s.requestId] = predictCharging(
      candidate,
      cars,
      state.bays,
      sitePowerBudgetKw,
      activeAlgorithm,
      state.currentTimeIso,
    );
  }
  return {
    ...state,
    activePresetId,
    allPresets: ALL_PRESETS,
    loadPreset,
    resetSimulation,
    activeRequestId,
    setActiveRequestId,
    activeSession:
      state.sessions.find((s) => s.requestId === activeRequestId) || null,
    userRole,
    setUserRole,
    isPlaying,
    togglePlay: () => setIsPlaying((p) => !p),
    playbackSpeed,
    setSpeed: setPlaybackSpeed,
    stepMinutes,
    sitePowerBudgetKw,
    setSitePowerBudgetKw,
    activeAlgorithm,
    setActiveAlgorithm,
    chargerMaxKw: state.bays[0]?.maxKw || 0,
    setChargerMaxKw,
    totalAllocatedPowerKw: state.sessions.reduce(
      (n, s) => n + s.allocatedKw,
      0,
    ),
    staffOnDuty,
    availableStandardStalls:
      12 -
      state.sessions.filter((s) => s.valetTask?.status === 'completed').length,
    idleGracePeriodMins,
    idleFeePerMin,
    extensionLimitMinutes,
    setExtensionLimitMinutes,
    predictions,
    submitRequest,
    confirmPlan,
    confirmVehicleParkedAndPlugged,
    reportVehicleMoved,
    confirmBayReleased,
    cancelRequest,
    modifyRequest,
    requestExtension,
    reviewExtensionRequest,
    requestValetAssistance,
    reviewValetTask,
    completeValetTask,
    dismissEvent: (id: string) =>
      change((d) => {
        d.systemEvents = d.systemEvents.filter((e) => e.id !== id);
      }),
    clearAllEvents: () =>
      change((d) => {
        d.systemEvents = [];
      }),
  };
}
const SimulationContext = createContext<ReturnType<
  typeof useSimulationState
> | null>(null);
export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const value = useSimulationState();
  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
};
export function useSimulation() {
  const state = useContext(SimulationContext);
  if (!state)
    throw new Error('useSimulation must be used within SimulationProvider');
  return state;
}
