export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dateFromDayKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getUTCDay());
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function monthGridStart(d: Date): Date {
  return startOfWeek(startOfMonth(d));
}

export function todayKey(): string {
  return dayKey(new Date());
}

export function formatMonthYear(d: Date): string {
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatWeekLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const m1 = MONTHS_SHORT[weekStart.getUTCMonth()];
  const m2 = MONTHS_SHORT[weekEnd.getUTCMonth()];
  const y1 = weekStart.getUTCFullYear();
  const y2 = weekEnd.getUTCFullYear();
  if (y1 !== y2) {
    return `${m1} ${weekStart.getUTCDate()}, ${y1} – ${m2} ${weekEnd.getUTCDate()}, ${y2}`;
  }
  if (m1 !== m2) {
    return `${m1} ${weekStart.getUTCDate()} – ${m2} ${weekEnd.getUTCDate()}, ${y1}`;
  }
  return `${m1} ${weekStart.getUTCDate()} – ${weekEnd.getUTCDate()}, ${y1}`;
}

export function formatDayHeading(d: Date): string {
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatDateShort(d: Date): string {
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Format an API UTC date-time like "2025-01-15T10:00:00Z" for display. */
export function formatEventTime(iso: string): string {
  const d = dateFromDayKey(iso.slice(0, 10));
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${iso.slice(11, 16)} UTC`;
}

/** "10:00" */
export function formatTimeOfDay(iso: string): string {
  return iso.slice(11, 16);
}

/** "Jan 15" */
export function formatShortDate(iso: string): string {
  const d = dateFromDayKey(iso.slice(0, 10));
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Value for a datetime-local input (UTC wall time). */
export function isoToInputValue(iso: string): string {
  return iso.slice(0, 16);
}

/** Day keys a single event touches (its last day is exclusive when it ends at midnight). */
export function eventDayKeys(event: { start_time: string; end_time: string | null }): string[] {
  const startKey = event.start_time.slice(0, 10);
  let endKey = (event.end_time ?? event.start_time).slice(0, 10);
  if (event.end_time && event.end_time.slice(11) === "00:00:00Z" && endKey > startKey) {
    endKey = dayKey(addDays(dateFromDayKey(endKey), -1));
  }
  const keys: string[] = [];
  let cursor = dateFromDayKey(startKey);
  const end = dateFromDayKey(endKey);
  while (cursor.getTime() <= end.getTime() && keys.length < 366) {
    keys.push(dayKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}
