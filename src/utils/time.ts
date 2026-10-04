/**
 * Time utility functions for VoltLodge EV Charging System.
 * Adheres to specification:
 * - Uses full date-time timestamps (handling overnight crossing, e.g. "Tomorrow 08:00")
 * - Handles New Zealand style presentation and clear ISO dates
 */

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Pending Calculation';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Pending Calculation';

    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return 'Pending Calculation';
  }
}

export function formatTimeOnly(isoString: string | null | undefined): string {
  if (!isoString) return '--:--';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--:--';
    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '--:--';
  }
}

export function formatFullDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-NZ', {
      year: 'numeric',
      timeZone: 'Pacific/Auckland',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return isoString;
  }
}

export function addMinutesToIso(isoString: string, minutes: number): string {
  return new Date(
    new Date(isoString).getTime() + minutes * 60000,
  ).toISOString();
}

export function getMinutesDiff(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.round((end - start) / (1000 * 60));
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 0) minutes = 0;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function getRelativeTimeLabel(
  targetIso: string,
  currentIso: string,
): { label: string; isPast: boolean } {
  const diffMins = getMinutesDiff(currentIso, targetIso);
  if (diffMins === 0) return { label: 'Now', isPast: false };
  if (diffMins > 0) {
    return { label: `in ${formatDurationMinutes(diffMins)}`, isPast: false };
  } else {
    return {
      label: `${formatDurationMinutes(Math.abs(diffMins))} overdue`,
      isPast: true,
    };
  }
}

/**
 * Creates an ISO string starting from base date with specific hour and minute.
 * If hour is lower than base hour, can automatically advance to next day.
 */
export function createIsoWithTime(
  baseIso: string,
  hour: number,
  minute: number,
  isNextDay = false,
): string {
  const wall = toAucklandInput(baseIso);
  if (!wall) return '';
  const date = new Date(wall.slice(0, 10) + 'T12:00:00Z');
  if (isNextDay) date.setUTCDate(date.getUTCDate() + 1);
  return fromAucklandInput(
    `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  );
}

// datetime-local has no zone: convert explicitly to/from the hotel's zone.
export function toAucklandInput(iso: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function fromAucklandInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return '';
  const nominal = Date.parse(value + ':00Z');
  if (!Number.isFinite(nominal)) return '';
  // Check both NZST/NZDT; reject nonexistent spring-forward wall times.
  // For the repeated autumn hour choose the earlier occurrence deterministically.
  for (const offset of [13, 12]) {
    const iso = new Date(nominal - offset * 3600000).toISOString();
    if (toAucklandInput(iso) === value) return iso;
  }
  return '';
}
