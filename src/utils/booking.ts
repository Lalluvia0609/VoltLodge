import type { Bay, ChargingSession, AllocationAlgorithm } from '../types';
import {
  remainingEnergy,
  remainingCommitted,
  predictCharging,
  validateSchedule,
  vehicleCap,
  limitTime,
} from './allocation';
import { addMinutesToIso } from './time';

export interface MovePreview {
  valid: boolean;
  error?: string;
  expectedPercent: number;
  deficitKwh: number;
  requiresAcceptance: boolean;
  committedKwh: number;
  expectedFinish: string | null;
  candidate: ChargingSession;
}
// Display a calculated completion range before the guest selects a move time. Existing bookings remain protected in every forecast.
export function completionRange(
  s: ChargingSession,
  cars: ChargingSession[],
  bays: Bay[],
  budget: number,
  algorithm: AllocationAlgorithm,
  now: string,
) {
  const cap = vehicleCap(s, bays, budget);
  if (cap <= 0) return predictCharging(s, cars, bays, budget, algorithm, now);
  const last = Math.max(
    Date.parse(now),
    Date.parse(s.arrivalTime),
    ...cars
      .flatMap((c) => [
        Date.parse(c.arrivalTime),
        Date.parse(c.agreedMoveByTime),
      ])
      .filter(Number.isFinite),
  );
  const minCap = Math.min(
    cap,
    ...bays.map((b) => b.maxKw).filter((v) => v > 0),
    budget,
  );
  const horizon = addMinutesToIso(
    new Date(last).toISOString(),
    ((remainingEnergy(s) +
      cars
        .filter((c) => c.requestId !== s.requestId)
        .reduce((sum, c) => sum + remainingEnergy(c), 0)) /
      minCap) *
      60 +
      1,
  );
  const candidate = {
    ...s,
    status: 'waiting_bay' as const,
    chargingDeadline: horizon,
    agreedMoveByTime: horizon,
    committedKwh: s.targetKwh,
  };
  const input = [
    ...cars.filter(
      (c) => c.requestId !== s.requestId && c.status !== 'pending_confirmation',
    ),
    candidate,
  ];
  const prediction = predictCharging(
    candidate,
    input,
    bays,
    budget,
    algorithm,
    now,
  );
  // Reservation deadlines can require more time than hypothetical full equal
  // sharing. Use the calculated current arrangement as an additional bound.
  if (
    prediction.expected &&
    prediction.fullLoad &&
    Date.parse(prediction.expected) > Date.parse(prediction.fullLoad)
  )
    prediction.fullLoad = prediction.expected;
  return prediction;
}

export function previewMove(
  s: ChargingSession,
  moveTime: string,
  cars: ChargingSession[],
  bays: Bay[],
  budget: number,
  algorithm: AllocationAlgorithm,
  now: string,
  extensionMinutes = 60,
): MovePreview {
  const candidate = {
    ...structuredClone(s),
    agreedMoveByTime: moveTime,
    committedKwh: s.targetKwh,
    acceptedEarlyDeparture: false,
  };
  if (candidate.status === 'pending_confirmation')
    candidate.status = 'waiting_bay';
  const result: MovePreview = {
    valid: false,
    expectedPercent:
      s.initialSocPercent + (s.deliveredKwh / s.batteryCapacityKwh) * 100,
    deficitKwh: remainingEnergy(s),
    requiresAcceptance: true,
    committedKwh: s.deliveredKwh,
    expectedFinish: null,
    candidate,
  };
  const original = limitTime(s.originalLatestFinishTime);
  const move = Date.parse(moveTime);
  if (
    !Number.isFinite(move) ||
    move <= Math.max(Date.parse(now), Date.parse(s.arrivalTime))
  )
    return {
      ...result,
      error: 'Choose a move time after arrival and after the current time.',
    };
  if (!Number.isFinite(original) || move > original + extensionMinutes * 60000)
    return {
      ...result,
      error:
        'Your move time cannot exceed the original latest finish plus the extension allowance.',
    };
  const input = () => [
    ...cars.filter(
      (c) => c.requestId !== s.requestId && c.status !== 'pending_confirmation',
    ),
    candidate,
  ];
  const feasible = () => {
    if (!validateSchedule(input(), bays, budget, now).feasible) return false;
    return (
      algorithm !== 'equal_sharing' ||
      input()
        .filter(
          (c) =>
            remainingCommitted(c) > 1e-7 &&
            !c.bayReleasedAt &&
            !['cancelled', 'ended_incomplete'].includes(c.status),
        )
        .every(
          (c) =>
            predictCharging(c, input(), bays, budget, algorithm, now).feasible,
        )
    );
  };
  if (!feasible()) {
    candidate.committedKwh = s.deliveredKwh;
    if (!feasible())
      return {
        ...result,
        error:
          'This arrangement would break another confirmed booking. Choose a different arrival or move time.',
      };
    let low = s.deliveredKwh,
      high = s.targetKwh;
    for (let i = 0; i < 45; i++) {
      const mid = (low + high) / 2;
      candidate.committedKwh = mid;
      if (feasible()) low = mid;
      else high = mid;
    }
    // Small numerical margin avoids promising more than a floating-point flow can deliver.
    candidate.committedKwh = Math.max(s.deliveredKwh, low - 1e-6);
  }
  const deficit = Math.max(0, s.targetKwh - candidate.committedKwh!);
  const partial = deficit > 1e-5;
  candidate.acceptedEarlyDeparture = partial;
  candidate.guestAcceptedDeficit = partial;
  const prediction = predictCharging(
    candidate,
    input(),
    bays,
    budget,
    algorithm,
    now,
  );
  return {
    ...result,
    valid: true,
    expectedPercent: Math.min(
      100,
      s.initialSocPercent +
        (candidate.committedKwh! / s.batteryCapacityKwh) * 100,
    ),
    deficitKwh: deficit,
    requiresAcceptance: partial,
    committedKwh: candidate.committedKwh!,
    expectedFinish: prediction.expected,
    candidate,
  };
}
