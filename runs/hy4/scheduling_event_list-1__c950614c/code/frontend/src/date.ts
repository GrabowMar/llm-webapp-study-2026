export type ViewMode = "month" | "week" | "day";

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (value: number) => String(value).padStart(2, "0");

export function dateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 86_400_000);
}

export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function startOfWeek(date: Date): Date {
  const day = startOfDay(date).getUTCDay();
  return addDays(startOfDay(date), -(day === 0 ? 6 : day - 1));
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export interface Period {
  start: Date;
  end: Date;
}

export function getPeriod(anchor: Date, mode: ViewMode): Period {
  if (mode === "day") {
    const start = startOfDay(anchor);
    return { start, end: new Date(start.getTime() + 86_400_000 - 1) };
  }
  if (mode === "week") {
    const start = startOfWeek(anchor);
    return { start, end: new Date(start.getTime() + 7 * 86_400_000 - 1) };
  }
  const start = startOfMonth(anchor);
  const end = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1) - 1,
  );
  return { start, end };
}

export function shiftPeriod(anchor: Date, mode: ViewMode, delta: number): Date {
  if (mode === "day") return addDays(anchor, delta);
  if (mode === "week") return addDays(anchor, 7 * delta);
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + delta, 1));
}

export function periodTitle(anchor: Date, mode: ViewMode): string {
  if (mode === "day") {
    return anchor.toLocaleDateString(undefined, {
      timeZone: "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  if (mode === "week") {
    const { start, end } = getPeriod(anchor, "week");
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    const startText = start.toLocaleDateString(undefined, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
    const endText = end.toLocaleDateString(undefined, {
      timeZone: "UTC",
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startText} – ${endText}`;
  }
  return anchor.toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  });
}

export function monthGridDays(anchor: Date): Date[] {
  const first = startOfWeek(startOfMonth(anchor));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function toInputValue(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return "";
  return `${dateKey(date)}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function fromInputValue(value: string): string {
  if (!value) return "";
  return value.length === 16 ? `${value}:00` : value;
}

export function formatTime(isoUtc: string): string {
  const date = new Date(isoUtc);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatDateTime(isoUtc: string): string {
  const date = new Date(isoUtc);
  return `${date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  })} at ${formatTime(isoUtc)} UTC`;
}

export function eventOverlapsPeriod(
  event: { start_time: string; end_time: string },
  period: Period,
): boolean {
  const start = new Date(event.start_time).getTime();
  const end = new Date(event.end_time).getTime();
  return start <= period.end.getTime() && end >= period.start.getTime();
}

export function eventsOnDay<T extends { start_time: string; end_time: string }>(
  events: T[],
  day: Date,
): T[] {
  const start = startOfDay(day).getTime();
  const end = start + 86_400_000;
  return events.filter((event) => {
    const eventStart = new Date(event.start_time).getTime();
    const eventEnd = new Date(event.end_time).getTime();
    return eventStart < end && eventEnd > start;
  });
}

export function isToday(day: Date): boolean {
  return dateKey(day) === dateKey(new Date());
}
