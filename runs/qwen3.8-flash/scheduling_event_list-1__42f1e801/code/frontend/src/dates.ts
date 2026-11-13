export const HOUR_PX = 48;
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const MONTHS = [
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

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, lastDay));
  return x;
}

export function startOfWeek(d: Date): Date {
  const shifted = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(startOfDay(d), -shifted);
}

export function todayUTC(): Date {
  return startOfDay(new Date());
}

export function isSameDayUTC(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

/** Parse an API timestamp ("...Z" or naive-as-UTC) into a Date. */
export function parseAPI(value: string): Date {
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
  return new Date(normalized);
}

/** API timestamp -> value for <input type="datetime-local"> (UTC wall time). */
export function toInputValue(value: string): string {
  const d = parseAPI(value);
  return `${dateKey(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** <input type="datetime-local"> value -> API timestamp (naive = UTC). */
export function fromInputValue(value: string): string {
  if (!value) return "";
  const base = value.length === 16 ? `${value}:00` : value.slice(0, 19);
  return `${base}Z`;
}

export function formatTime(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatDateTime(d: Date): string {
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${wd} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${formatTime(d)} UTC`;
}

export function formatDayLong(d: Date): string {
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${wd}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Minutes from the day start (UTC). */
export function minutesUTC(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Events that overlap a given day (UTC midnight boundaries, non-empty range). */
export function overlapsDay(
  dayStart: Date,
  start: Date,
  end: Date,
): boolean {
  const dayEnd = addDays(dayStart, 1);
  return start < dayEnd && end > dayStart && start < end;
}
