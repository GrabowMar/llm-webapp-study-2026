const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth(),
      Math.min(date.getUTCDate(), lastDay),
    ),
  );
}

export function startOfWeek(date: Date): Date {
  return addDays(startOfDay(date), -date.getUTCDay());
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function monthGridStart(date: Date): Date {
  return startOfWeek(startOfMonth(date));
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function isoDay(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function dayRangeIso(date: Date): { start: string; end: string } {
  const start = startOfDay(date);
  return { start: `${isoDay(start)}T00:00:00Z`, end: `${isoDay(addDays(start, 1))}T00:00:00Z` };
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${isoDay(d)} ${fmtTime(iso)} UTC`;
}

export function fmtDateLong(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function fmtPeriodLabel(view: "month" | "week" | "day", anchor: Date): string {
  if (view === "month") {
    return `${MONTHS[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`;
  }
  if (view === "day") {
    return fmtDateLong(anchor);
  }
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const startLabel = `${MONTHS[start.getUTCMonth()].slice(0, 3)} ${start.getUTCDate()}`;
  const endLabel = `${MONTHS[end.getUTCMonth()].slice(0, 3)} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  return `${startLabel} – ${endLabel}`;
}

export function isoToInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

export function inputToIso(value: string): string {
  if (!value) return "";
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}Z`;
}

export function defaultInputFor(date: Date, hour: number): string {
  return `${isoDay(date)}T${String(hour).padStart(2, "0")}:00`;
}
