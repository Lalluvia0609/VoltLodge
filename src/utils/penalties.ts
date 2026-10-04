import type { ChargingSession, PenaltyPolicy, PenaltyRecord } from '../types';
export const DEFAULT_PENALTY_POLICY: PenaltyPolicy = {
  ratePerMinute: 0.5,
  graceMinutes: 0,
};
export function occupiesBay(s: ChargingSession): boolean {
  return (
    !!s.bayId &&
    !s.bayReleasedAt &&
    (!!s.pluggedInAt ||
      !!s.moveReportedAt ||
      ['charging', 'paused'].includes(s.status))
  );
}
export function bookingPenalty(
  s: ChargingSession,
  now: string,
  policy: PenaltyPolicy,
  departure?: { actualMoveOutTime: string; wasOccupied: boolean },
): PenaltyRecord {
  const occupied = departure ? departure.wasOccupied : occupiesBay(s);
  const end = departure?.actualMoveOutTime || now;
  const lateMinutes =
    occupied && Number.isFinite(Date.parse(s.agreedMoveByTime))
      ? Math.max(0, (Date.parse(end) - Date.parse(s.agreedMoveByTime)) / 60000)
      : 0;
  const penaltyAmount =
    Math.round(
      Math.max(0, lateMinutes - policy.graceMinutes) *
        policy.ratePerMinute *
        100,
    ) / 100;
  return {
    agreedMoveBy: s.agreedMoveByTime,
    actualMoveOutTime: departure?.actualMoveOutTime || null,
    lateMinutes,
    penaltyAmount,
    penaltyStatus: departure
      ? 'final'
      : occupied && lateMinutes > 0
        ? 'accruing'
        : 'none',
    penaltyReason:
      lateMinutes > 0 ? 'Bay occupied after agreed move-by time' : '',
    ratePerMinute: policy.ratePerMinute,
    graceMinutes: policy.graceMinutes,
  };
}
