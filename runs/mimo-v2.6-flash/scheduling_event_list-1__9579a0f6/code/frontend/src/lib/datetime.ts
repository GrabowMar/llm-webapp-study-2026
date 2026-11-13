export type ViewMode = "month" | "week" | "day";

export const MS_PER_DAY = 86_400_000;
export const MS_PER_HOUR = 3_600_000;

export function startOfDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function addDays(value: Date, days: number): Date {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addMonths(value: Date, months: number): Date {
  const targetMonth = value.getUTCMonth() + months;
  const daysInTarget = new Date(
    Date.UTC(value.getUTCFullYear(), targetMonth + 1, 0),
  ).getUTCDate();
  const day = Math.min(value.getUTCDate(), daysInTarget);
  return new Date(Date.UTC(value.getUTCFullYear(), targetMonth, day));
}

export function startOfWeek(value: Date): Date {
  const day = startOfDay(value);
  const weekday = day.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const offset = (weekday + 6) % 7; // week starts on Monday
  return addDays(day, -offset);
}

export function startOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const monthYearFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const createdAtFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatTime(value: Date): string {
  return timeFormatter.format(value);
}

export function formatMonthYear(value: Date): string {
  return monthYearFormatter.format(value);
}

export function formatLongDate(value: Date): string {
  return longDateFormatter.format(value);
}

export function formatShortDate(value: Date): string {
  return shortDateFormatter.format(value);
}

export function formatFullDate(value: Date): string {
  return fullDateFormatter.format(value);
}

export function formatCreatedAt(value: Date): string {
  return `${createdAtFormatter.format(value)} UTC`;
}

export function formatEventRange(start: Date, end: Date): string {
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  if (startDay.getTime() === endDay.getTime()) {
    return `${formatFullDate(start)} · ${formatTime(start)} – ${formatTime(end)} UTC`;
  }
  return `${formatFullDate(start)} ${formatTime(start)} – ${formatFullDate(end)} ${formatTime(end)} UTC`;
}

export function periodLabel(view: ViewMode, anchor: Date): string {
  if (view === "month") {
    return monthYearFormatter.format(anchor);
  }
  if (view === "day") {
    return longDateFormatter.format(anchor);
  }
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) {
    return `${shortDateFormatter.format(start)} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${shortDateFormatter.format(start)} – ${shortDateFormatter.format(end)}, ${end.getUTCFullYear()}`;
  }
  return `${shortDateFormatter.format(start)}, ${start.getUTCFullYear()} – ${shortDateFormatter.format(end)}, ${end.getUTCFullYear()}`;
}

/** Value for an <input type="datetime-local">, interpreted as UTC. */
export function toInputValue(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}` +
    `T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`
  );
}

/** Whether an event occupies the UTC day that starts at `dayStart`. */
export function eventCoversDay(
  event: { start_time: string; end_time: string },
  dayStart: Date,
): boolean {
  const start = new Date(event.start_time).getTime();
  const end = new Date(event.end_time).getTime();
  const lower = dayStart.getTime();
  return end >= lower && start < lower + MS_PER_DAY;
}
