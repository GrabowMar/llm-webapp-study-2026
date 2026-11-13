/**
 * All date handling happens in UTC so that the calendar always matches the
 * values returned by the API (which are UTC with a trailing `Z`).
 */

const MS_PER_DAY = 86_400_000;

export function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function parseIso(value: string): Date {
  return new Date(value);
}

export function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function timeKey(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function addMonths(date: Date, months: number): Date {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 0, 0, 0, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 0));
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
}

export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

export function monthGrid(date: Date): Date[] {
  const first = startOfWeek(startOfMonth(date));
  const days: Date[] = [];
  for (let index = 0; index < 42; index += 1) {
    days.push(addDays(first, index));
  }
  return days;
}

/** `2024-06-01T10:30` -> `2024-06-01T10:30:00Z` (the API reads it as UTC). */
export function inputToIso(value: string): string {
  if (!value) return "";
  return value.length === 16 ? `${value}:00Z` : `${value}Z`;
}

/** `2024-06-01T10:30:00Z` -> `2024-06-01T10:30` for a datetime-local input. */
export function isoToInput(value: string): string {
  const date = parseIso(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${dateKey(date)}T${timeKey(date)}`;
}

export function formatTime(value: string): string {
  const date = parseIso(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const start = formatTime(startIso);
  const end = formatTime(endIso);
  return start === end ? start : `${start} - ${end}`;
}

export function formatDate(value: string): string {
  const date = parseIso(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string): string {
  const date = parseIso(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(value)}, ${formatTime(value)} UTC`;
}

export function formatMonthTitle(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

export function formatWeekTitle(start: Date): string {
  const end = addDays(start, 6);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startLabel = start.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: sameMonth ? undefined : "short",
  });
  const endLabel = end.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startLabel} - ${endLabel}`;
}

export function formatDayTitle(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function minutesOfDay(value: string): number {
  const date = parseIso(value);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function durationMinutes(startIso: string, endIso: string): number {
  const start = parseIso(startIso).getTime();
  const end = parseIso(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}
