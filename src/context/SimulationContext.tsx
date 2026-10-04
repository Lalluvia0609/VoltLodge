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
  VehicleTypeId,
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
  deadlineOf,
  remainingEnergy,
  remainingCommitted,
  outcomeOf,
  type EngineState,
  type ChargingPrediction,
} from '../utils/allocation';
import { addMinutesToIso, formatDateTime, getMinutesDiff } from '../utils/time';

import {
  bookingPenalty,
  occupiesBay,
  DEFAULT_PENALTY_POLICY,
} from '../utils/penalties';
import type { PenaltyPolicy } from '../types';
import { guestLabel } from '../utils/guestIdentity';
import { getVehicleType, nextVehicleLabel } from '../data/vehicleTypes';
import { completionRange, previewMove } from '../utils/booking';

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
    agreedMoveByTime: new Date(s.agreedMoveByTime).toISOString(),
    targetPercent:
      s.initialSocPercent + (s.targetKwh / s.batteryCapacityKwh) * 100,
    originalLatestFinishTime:
      s.originalLatestFinishTime ||
      new Date(s.plannedLatestFinishTime).toISOString(),
    chargingDeadline: new Date(
      s.chargingDeadline || s.plannedLatestFinishTime,
    ).toISOString(),
    completionWindowStart: '',
    completionWindowEnd: '',
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
  // Preset timestamps define scenario commitments, never displayed predictions.
  for (const s of sessions) {
    const forecast = predictCharging(
      s,
      sessions,
      bays,
      preset.sitePowerBudgetKw,
      'demand_urgency',
      new Date(preset.simulationStartIso).toISOString(),
    );
    s.completionWindowStart = forecast.fastest || '';
    s.completionWindowEnd = forecast.fullLoad || '';
  }
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
  const [penaltyPolicy, setPenaltyPolicyState] = useState<PenaltyPolicy>(
    DEFAULT_PENALTY_POLICY,
  );
  const penaltyPolicyRef = useRef(penaltyPolicy);
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
      s.penalty = bookingPenalty(
        s,
        draft.currentTimeIso,
        penaltyPolicyRef.current,
      );
      s.allocatedKw = powers.get(s.requestId) || 0;
      if (s.status === 'charging' || s.status === 'paused')
        s.status = s.allocatedKw > 0 ? 'charging' : 'paused';
    });
    draft.bays = syncBays(draft.sessions, draft.bays);
    stateRef.current = draft;
    setState(draft);
    setActiveRequestId((current) =>
      current && !draft.sessions.some((s) => s.requestId === current)
        ? (
            draft.sessions.find((s) => s.status !== 'pending_confirmation') ||
            draft.sessions[0]
          )?.requestId || null
        : current,
    );
  }, []);
  const change = useCallback(
    (fn: (draft: DeskState) => void) => {
      const draft = structuredClone(stateRef.current);
      fn(draft);
      refresh(draft);
    },
    [refresh],
  );
  const setPenaltyPolicy = (policy: PenaltyPolicy): Result => {
    if (
      ![policy.ratePerMinute, policy.graceMinutes].every(
        (value) => Number.isFinite(value) && value >= 0,
      )
    )
      return failure('Enter non-negative penalty rate and grace period.');
    penaltyPolicyRef.current = { ...policy };
    setPenaltyPolicyState({ ...policy });
    change(() => {});
    return success;
  };
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
            s.acceptedEarlyDeparture && remainingCommitted(s) < 1e-7
              ? `${guestLabel(s, draft.sessions)}: Guest accepted early departure. Target gap: ${remainingEnergy(s).toFixed(1)} kWh.`
              : `${guestLabel(s, draft.sessions)}: Charging deadline missed; ${remainingEnergy(s).toFixed(1)} kWh still needed.`,
            'charging',
            'alert',
            s,
          );
        if (s.status === 'waiting_plugin' && old?.status !== 'waiting_plugin')
          event(
            draft,
            `${guestLabel(s, draft.sessions)}: your bay is reserved. Please park and plug in; staff will confirm.`,
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
    const type = getVehicleType(input.vehicleType);
    if (!type)
      return failure('Choose one of the four simulated vehicle types.');
    const { batteryCapacityKwh: capacity, maxChargeKw: ac } = type;
    const { currentPercent: current, targetPercent: target } = input;
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
    const mode = input.registrationMode || 'register_now';
    const arrival = mode === 'book_ahead' ? input.arrivalTime || '' : now;
    if (
      !Number.isFinite(time(arrival)) ||
      (mode === 'book_ahead' && time(arrival) <= time(now))
    )
      return failure('Choose a future arrival date and time.');
    const s: ChargingSession = {
      requestId: crypto.randomUUID(),
      vehicleId: nextVehicleLabel(
        [
          ...stateRef.current.sessions,
          ...stateRef.current.historyRecords.map((record) => record.session),
        ]
          .filter((s) => s.status !== 'pending_confirmation')
          .map((s) => s.vehicleId),
      ),
      vehicleType: type.id,
      guestName: input.guestName.trim(),
      roomNumber: input.roomNumber.trim(),
      batteryCapacityKwh: capacity,
      initialSocPercent: current!,
      targetPercent: target!,
      targetKwh: (capacity * (target! - current!)) / 100,
      maxChargeKw: ac,
      arrivalTime: new Date(arrival).toISOString(),
      registrationMode: mode,
      arrivalConfirmed: mode === 'register_now',
      agreedMoveByTime: '',
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
    const prediction = completionRange(
      s,
      stateRef.current.sessions,
      stateRef.current.bays,
      budgetRef.current,
      algorithmRef.current,
      now,
    );
    s.completionWindowStart = prediction.fastest || '';
    s.completionWindowEnd = prediction.fullLoad || '';
    s.estimatedStartTime =
      prediction.fastest && prediction.fastestMinutes !== null
        ? addMinutesToIso(prediction.fastest, -prediction.fastestMinutes)
        : '';
    s.estimatedFinishTime = prediction.expected || '';
    s.plannedLatestFinishTime = prediction.fullLoad || '';
    s.originalLatestFinishTime = prediction.fullLoad || '';
    s.chargingDeadline = prediction.fullLoad || '';
    // A suggested move time is shown only after the range has been generated.
    s.agreedMoveByTime = prediction.fullLoad || '';
    s.isFeasibleOnTime = prediction.feasible;
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
  const getMovePreview = (
    id: string,
    moveTime: string,
    targetPercent?: number,
    vehicleType?: VehicleTypeId,
  ) => {
    const old = stateRef.current.sessions.find((s) => s.requestId === id);
    if (!old) return null;
    const s = structuredClone(old);
    if (vehicleType !== undefined) {
      const type = getVehicleType(vehicleType);
      if (!type) return null;
      s.vehicleType = type.id;
      s.batteryCapacityKwh = type.batteryCapacityKwh;
      s.maxChargeKw = type.maxChargeKw;
    }
    if (targetPercent !== undefined) {
      s.targetPercent = targetPercent;
      s.targetKwh = Math.max(
        0,
        (s.batteryCapacityKwh * (targetPercent - s.initialSocPercent)) / 100,
      );
    }
    if (['target_reached', 'ended_incomplete', 'cancelled'].includes(s.status))
      s.status = s.bayId
        ? s.pluggedInAt
          ? 'charging'
          : 'waiting_plugin'
        : 'waiting_bay';
    return previewMove(
      s,
      moveTime,
      stateRef.current.sessions,
      stateRef.current.bays,
      budgetRef.current,
      algorithmRef.current,
      stateRef.current.currentTimeIso,
      extensionLimitMinutes,
    );
  };
  const confirmPlan = (
    requestId: string,
    moveTime: string,
    acceptedDeficit = false,
    moveMethod: 'self' | 'valet' = 'self',
  ): Result => {
    const draft = structuredClone(stateRef.current),
      s = draft.sessions.find((s) => s.requestId === requestId);
    if (!s || s.status !== 'pending_confirmation')
      return failure('Generate a new plan first.');
    const preview = getMovePreview(requestId, moveTime);
    if (!preview?.valid)
      return failure(preview?.error || 'Unable to confirm this plan.');
    if (preview.requiresAcceptance && !acceptedDeficit)
      return failure(
        `Please explicitly accept the estimated ${preview.expectedPercent.toFixed(1)}% battery before confirming early departure.`,
      );
    Object.assign(s, preview.candidate);
    s.moveMethod = moveMethod;
    s.earlyDepartureEstimatePercent = preview.expectedPercent;
    if (s.committedKwh === s.deliveredKwh && s.arrivalConfirmed)
      s.commitmentReachedAt = draft.currentTimeIso;
    reserveQueue(draft.sessions, draft.bays, draft.currentTimeIso);
    if (moveMethod === 'valet')
      s.valetTask = {
        taskId: crypto.randomUUID(),
        requestId: s.requestId,
        vehicleId: s.vehicleId,
        bayId: s.bayId || '',
        requestedAt: draft.currentTimeIso,
        status: 'pending_review',
        authorizationConfirmed: true,
        keysHandoverNote:
          'Please confirm key handover with reception on arrival.',
        keysReceived: false,
        staffAssigned: null,
        destinationBay: null,
      };
    event(
      draft,
      s.registrationMode === 'book_ahead'
        ? 'Booking confirmed. Confirm your actual battery when you arrive.'
        : 'Plan confirmed. Reception will confirm your bay and plug-in.',
      'queue',
      'success',
      s,
    );
    refresh(draft);
    return success;
  };
  const getArrivalPreview = (
    id: string,
    actualPercent: number,
    targetPercent?: number,
  ) => {
    const old = stateRef.current.sessions.find((s) => s.requestId === id);
    if (!old) return null;
    if (
      !Number.isFinite(actualPercent) ||
      actualPercent < 0 ||
      actualPercent > 100
    )
      return null;
    const target = targetPercent ?? old.targetPercent;
    if (!Number.isFinite(target) || target < 0 || target > 100) return null;
    const s = {
      ...structuredClone(old),
      initialSocPercent: actualPercent,
      targetPercent: target,
      targetKwh: Math.max(
        0,
        (old.batteryCapacityKwh * (target - actualPercent)) / 100,
      ),
      deliveredKwh: 0,
      arrivalConfirmed: true,
    };
    return previewMove(
      s,
      s.agreedMoveByTime,
      stateRef.current.sessions,
      stateRef.current.bays,
      budgetRef.current,
      algorithmRef.current,
      stateRef.current.currentTimeIso,
      extensionLimitMinutes,
    );
  };
  const confirmArrival = (
    id: string,
    actualPercent: number,
    acceptedDeficit = false,
    targetPercent?: number,
  ): Result => {
    const draft = structuredClone(stateRef.current),
      s = draft.sessions.find((s) => s.requestId === id);
    if (!s || s.registrationMode !== 'book_ahead' || s.arrivalConfirmed)
      return failure('No booking awaiting arrival confirmation.');
    if (time(draft.currentTimeIso) < time(s.arrivalTime))
      return failure(
        'Arrival cannot be confirmed before your booked arrival time.',
      );
    const preview = getArrivalPreview(id, actualPercent, targetPercent);
    if (!preview?.valid)
      return failure(
        preview?.error || 'Enter an actual battery percentage from 0 to 100.',
      );
    if (preview.requiresAcceptance && !acceptedDeficit)
      return failure(
        'Your actual battery changes the arrangement. Accept the reduced charge, lower your target or explicitly request a later time.',
      );
    Object.assign(s, preview.candidate);
    s.arrivalConfirmed = true;
    s.earlyDepartureEstimatePercent = preview.expectedPercent;
    s.commitmentReachedAt =
      remainingCommitted(s) < 1e-7 ? draft.currentTimeIso : null;
    s.targetReachedAt = remainingEnergy(s) < 1e-7 ? draft.currentTimeIso : null;
    reserveQueue(draft.sessions, draft.bays, draft.currentTimeIso);
    if (remainingCommitted(s) < 1e-7 && s.bayId)
      s.status =
        remainingEnergy(s) < 1e-7 ? 'target_reached' : 'ended_incomplete';
    event(
      draft,
      'Actual battery confirmed. Your original deadline has not been extended.',
      'charging',
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
    if (s.arrivalConfirmed === false)
      return failure(
        'Confirm the actual arrival battery before starting charging.',
      );
    if (!validate(draft.sessions))
      return failure(
        'Please revise the plan: the delayed arrival can no longer meet the confirmed deadlines.',
      );
    s.status = 'charging';
    s.pluggedInAt = draft.currentTimeIso;
    event(
      draft,
      `${guestLabel(s, draft.sessions)} parked and plugged in.`,
      'bay',
      'success',
      s,
    );
    refresh(draft);
    return success;
  };
  const reportVehicleMoved = (requestId: string) =>
    change((d) => {
      const s = d.sessions.find((s) => s.requestId === requestId);
      if (s?.bayId) {
        s.moveReportedAt = d.currentTimeIso;
        if (remainingEnergy(s) > 1e-7) s.chargingStoppedAt ||= d.currentTimeIso;
        s.allocatedKw = 0;
        if (remainingEnergy(s) > 1e-7) {
          s.status = 'cancelled';
          s.acceptedEarlyDeparture = true;
          s.guestAcceptedDeficit = true;
          s.committedKwh = s.deliveredKwh;
          s.commitmentReachedAt = d.currentTimeIso;
        }
        event(
          d,
          'Move reported. Waiting for reception to confirm the bay is clear.',
          'bay',
          'info',
          s,
        );
      }
    });
  const archive = (
    draft: DeskState,
    s: ChargingSession,
    hadBay: boolean,
    notes: string,
  ) => {
    if (draft.historyRecords.some((record) => record.requestId === s.requestId))
      return;
    s.allocatedKw = 0;
    const actualMoveTime = hadBay
      ? s.moveReportedAt || draft.currentTimeIso
      : null;
    const penalty = bookingPenalty(
      s,
      draft.currentTimeIso,
      penaltyPolicyRef.current,
      hadBay
        ? { actualMoveOutTime: actualMoveTime!, wasOccupied: true }
        : undefined,
    );
    s.penalty = penalty;
    const overstay = penalty.lateMinutes;
    const outcome = outcomeOf(s);
    draft.historyRecords.unshift({
      penalty,
      id: crypto.randomUUID(),
      requestId: s.requestId,
      vehicleId: s.vehicleId,
      vehicleType: s.vehicleType,
      guestName: s.guestName,
      roomNumber: s.roomNumber,
      arrivalTime: s.arrivalTime,
      departureTime: draft.currentTimeIso,
      targetKwh: s.targetKwh,
      actualDeliveredKwh: s.deliveredKwh,
      targetPercent: s.targetPercent,
      actualPercent: Math.min(
        100,
        s.initialSocPercent + (s.deliveredKwh / s.batteryCapacityKwh) * 100,
      ),
      targetAchieved: outcome.targetAchieved,
      onTimeCompletion:
        !!s.targetReachedAt && time(s.targetReachedAt) <= deadlineOf(s),
      chargingStartedAt: s.pluggedInAt,
      chargingCompletedAt: s.targetReachedAt,
      chargingStoppedAt:
        s.chargingStoppedAt ||
        s.targetReachedAt ||
        (s.pluggedInAt ? draft.currentTimeIso : null),
      actualMoveTime,
      actualReleaseTime: draft.currentTimeIso,
      archivedAt: draft.currentTimeIso,
      scheduledMoveTime: s.agreedMoveByTime,
      overstayMinutes: overstay,
      simulatedFeeCharged: penalty.penaltyAmount,
      acceptedEarlyDeparture: !!s.acceptedEarlyDeparture,
      earlyDepartureDeficitKwh: s.acceptedEarlyDeparture
        ? remainingEnergy(s)
        : 0,
      valetUsed: s.valetTask?.status === 'completed',
      valetTask: s.valetTask ? structuredClone(s.valetTask) : undefined,
      commitmentFulfilled: outcome.commitmentFulfilled,
      outcomeReason: outcome.outcomeReason,
      notes,
      hadBay,
      session: structuredClone(s),
    });
    draft.sessions = draft.sessions.filter(
      (car) => car.requestId !== s.requestId,
    );
  };
  const release = (draft: DeskState, bayId: string, notes?: string) => {
    const s = draft.sessions.find((s) => s.bayId === bayId && !s.bayReleasedAt);
    if (!s) return;
    const wasOccupied = occupiesBay(s);
    s.bayId = null;
    s.bayReleasedAt = draft.currentTimeIso;
    s.allocatedKw = 0;
    if (remainingEnergy(s) > 1e-7 && s.status !== 'cancelled')
      s.status = 'ended_incomplete';
    archive(draft, s, wasOccupied, notes || 'Bay inspected and released.');
    reserveQueue(draft.sessions, draft.bays, draft.currentTimeIso);
    event(
      draft,
      'Bay confirmed clear. Vehicle archived to History; the next driver must park and plug in before charging.',
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
        const occupied = occupiesBay(s);
        s.status = 'cancelled';
        s.chargingStoppedAt = d.currentTimeIso;
        s.allocatedKw = 0;
        if (remainingEnergy(s) > 1e-7) {
          s.acceptedEarlyDeparture = true;
          s.guestAcceptedDeficit = true;
          s.committedKwh = s.deliveredKwh;
          s.commitmentReachedAt = d.currentTimeIso;
        }
        event(
          d,
          occupied
            ? 'Charging stopped. Your bay remains occupied until reception confirms you have moved.'
            : 'Booking cancelled and archived to History; no bay was occupied.',
          'charging',
          'info',
          s,
        );
        if (!occupied) {
          s.bayId = null;
          archive(d, s, false, 'Booking cancelled before occupying a bay.');
          reserveQueue(d.sessions, d.bays, d.currentTimeIso);
        }
      }
    });
  const modifyRequest = (
    id: string,
    targetPercent: number,
    vehicleType?: VehicleTypeId,
    moveTime?: string,
    acceptedDeficit = false,
  ): Result => {
    const draft = structuredClone(stateRef.current),
      s = draft.sessions.find((s) => s.requestId === id);
    if (!s || s.bayReleasedAt) return failure('This charging plan has ended.');
    if (vehicleType !== undefined && !getVehicleType(vehicleType))
      return failure('Choose one of the four simulated vehicle types.');
    const preview = getMovePreview(
      id,
      moveTime || s.agreedMoveByTime,
      targetPercent,
      vehicleType,
    );
    const capacity =
      preview?.candidate.batteryCapacityKwh || s.batteryCapacityKwh;
    const current = s.initialSocPercent + (s.deliveredKwh / capacity) * 100;
    if (
      !Number.isFinite(targetPercent) ||
      targetPercent < current - 1e-7 ||
      targetPercent > 100
    )
      return failure(
        `Choose a target between ${current.toFixed(1)}% and 100%.`,
      );
    if (!preview?.valid)
      return failure(preview?.error || 'Unable to check this change.');
    if (preview.requiresAcceptance && !acceptedDeficit)
      return failure(
        `This arrangement is estimated to reach ${preview.expectedPercent.toFixed(1)}%, below your target. Explicitly accept early departure or change the time or target.`,
      );
    Object.assign(s, preview.candidate);
    s.earlyDepartureEstimatePercent = preview.expectedPercent;
    s.commitmentReachedAt =
      remainingCommitted(s) < 1e-7 ? draft.currentTimeIso : null;
    s.targetReachedAt =
      remainingEnergy(s) < 1e-7
        ? s.targetReachedAt || draft.currentTimeIso
        : null;
    if (remainingCommitted(s) > 1e-7) s.chargingStoppedAt = null;
    s.notificationsSent = {
      fifteenMinWarning: false,
      targetReached: false,
      overdueWarning: false,
    };
    if (remainingCommitted(s) < 1e-7)
      s.status =
        remainingEnergy(s) < 1e-7 ? 'target_reached' : 'ended_incomplete';
    event(
      draft,
      'Your updated arrangement is confirmed; other bookings remain protected.',
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
      // Explicit delayed charging renews the original target promise only when
      // every confirmed booking can still be delivered.
      s.committedKwh = s.targetKwh;
      s.acceptedEarlyDeparture = false;
      s.guestAcceptedDeficit = false;
      if (remainingCommitted(s) > 1e-7) {
        s.commitmentReachedAt = null;
        s.chargingStoppedAt = null;
        if (['ended_incomplete', 'target_reached'].includes(s.status))
          s.status = s.bayId
            ? s.pluggedInAt
              ? 'charging'
              : 'waiting_plugin'
            : 'waiting_bay';
      }
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
        (remainingCommitted(s) > 1e-7 &&
          !['cancelled', 'ended_incomplete'].includes(s.status))
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
    predictions[s.requestId] =
      s.status === 'pending_confirmation'
        ? completionRange(
            s,
            cars,
            state.bays,
            sitePowerBudgetKw,
            activeAlgorithm,
            state.currentTimeIso,
          )
        : predictCharging(
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
      state.sessions.filter((s) => s.valetTask?.status === 'completed').length -
      state.historyRecords.filter((record) => record.valetUsed).length,
    penaltyPolicy,
    setPenaltyPolicy,
    extensionLimitMinutes,
    setExtensionLimitMinutes,
    predictions,
    submitRequest,
    confirmPlan,
    getMovePreview,
    getArrivalPreview,
    confirmArrival,
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
