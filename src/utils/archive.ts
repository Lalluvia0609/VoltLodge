import type { ChargingSession, HistoryRecord } from '../types';

// Complete-scenario comparison replays guest inputs from arrival, rather than
// pretending already-delivered historical energy was delivered by each policy.
// Actual timestamps, energy and staff records remain untouched in History.
export function completeScenarioVehicles(
  current: ChargingSession[],
  history: HistoryRecord[],
): ChargingSession[] {
  const cars = new Map<
    string,
    { session: ChargingSession; record?: HistoryRecord }
  >();
  for (const record of history)
    cars.set(record.requestId, { session: record.session, record });
  for (const session of current)
    if (session.status !== 'pending_confirmation')
      cars.set(session.requestId, { session });
  return [...cars.values()].map(({ session, record }) => {
    const s = structuredClone(session);
    const withdrawn =
      s.status === 'cancelled' && !s.pluggedInAt && !s.bayId && !record?.hadBay;
    if (s.chargingStoppedAt && s.acceptedEarlyDeparture) {
      const stop = Date.parse(s.chargingStoppedAt);
      if (!s.chargingDeadline || stop < Date.parse(s.chargingDeadline))
        s.chargingDeadline = s.chargingStoppedAt;
    }
    if (!s.chargingDeadline)
      s.chargingDeadline = record?.archivedAt || s.agreedMoveByTime;
    // Completed cars' observed early moves are not new guest deadlines.
    // Voluntary departure remains an explicit input to every replayed policy.
    if (s.acceptedEarlyDeparture && record?.actualMoveTime)
      s.agreedMoveByTime = record.actualMoveTime;
    s.bayId = null;
    s.bayReleasedAt = null;
    s.moveReportedAt = null;
    s.pluggedInAt = null;
    s.targetReachedAt = null;
    s.allocatedKw = 0;
    s.deliveredKwh = 0;
    s.status = withdrawn ? 'cancelled' : 'waiting_bay';
    if (!withdrawn) s.commitmentReachedAt = null;
    s.simulatedValetMoved = false;
    return s;
  });
}
