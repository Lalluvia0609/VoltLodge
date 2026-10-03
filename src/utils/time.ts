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
  const d = new Date(isoString);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
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

export function getRelativeTimeLabel(targetIso: string, currentIso: string): { label: string; isPast: boolean } {
  const diffMins = getMinutesDiff(currentIso, targetIso);
  if (diffMins === 0) return { label: 'Now', isPast: false };
  if (diffMins > 0) {
    return { label: `in ${formatDurationMinutes(diffMins)}`, isPast: false };
  } else {
    return { label: `${formatDurationMinutes(Math.abs(diffMins))} overdue`, isPast: true };
  }
}

/**
 * Creates an ISO string starting from base date with specific hour and minute.
 * If hour is lower than base hour, can automatically advance to next day.
 */
export function createIsoWithTime(baseIso: string, hour: number, minute: number, isNextDay = false): string {
  const d = new Date(baseIso);
  d.setHours(hour, minute, 0, 0);
  if (isNextDay) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}
