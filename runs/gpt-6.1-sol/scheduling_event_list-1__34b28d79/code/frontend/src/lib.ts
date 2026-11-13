export type CalendarEvent = {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  created_by: string;
};

export type View = "month" | "week" | "day";
export type FieldErrors = Record<string, string>;
export type EventInput = Pick<CalendarEvent, "title" | "description" | "location" | "start_time" | "end_time">;

export class ApiError extends Error {
  status: number;
  fields: FieldErrors;
  constructor(message: string, status: number, fields: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("We couldn’t connect. Check your connection and try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "Something went wrong. Please try again.", response.status, data.errors);
  return data as T;
}

export const DAY = 86_400_000;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const dateKey = (date: Date) => date.toISOString().slice(0, 10);
export const dayStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
export const addDays = (date: Date, days: number) => new Date(dayStart(date).getTime() + days * DAY);
export const monthStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
export const weekStart = (date: Date) => addDays(date, -((date.getUTCDay() + 6) % 7));
export const sameDay = (a: Date, b: Date) => dateKey(a) === dateKey(b);
export const formatDate = (date: Date | string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(date));
export const timeLabel = (date: string | Date) => formatDate(date, { hour: "numeric", minute: "2-digit", hour12: true });
export const shortTime = (date: string) => timeLabel(date).replace(":00", "").replace(" AM", "a").replace(" PM", "p");

export function changeMonth(date: Date, direction: number) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), last.getUTCDate())));
}

export function monthDays(date: Date) {
  const first = monthStart(date);
  const start = weekStart(first);
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const length = Math.ceil((next.getTime() - start.getTime()) / DAY / 7) * 7;
  return Array.from({ length }, (_, i) => addDays(start, i));
}

export function daysForView(date: Date, view: View) {
  if (view === "month") return monthDays(date);
  if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  return [dayStart(date)];
}

export function eventsOnDay(events: CalendarEvent[], date: Date) {
  const start = dayStart(date).getTime();
  return events.filter(event => new Date(event.start_time).getTime() < start + DAY && new Date(event.end_time).getTime() > start);
}

export function periodTitle(date: Date, view: View) {
  if (view === "month") return formatDate(date, { month: "long", year: "numeric" });
  if (view === "day") return formatDate(date, { month: "long", day: "numeric", year: "numeric" });
  const start = weekStart(date);
  const end = addDays(start, 6);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${formatDate(start, { month: "short", day: "numeric" })} – ${formatDate(end, { day: "numeric", year: "numeric" })}`;
  }
  return `${formatDate(start, { month: "short", day: "numeric", ...(start.getUTCFullYear() !== end.getUTCFullYear() ? { year: "numeric" } : {}) })} – ${formatDate(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function inputDateTime(date: string | Date) {
  return new Date(date).toISOString().slice(0, 16);
}

export function eventInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export function timeSegments(events: CalendarEvent[], date: Date) {
  const midnight = dayStart(date).getTime();
  const segments = eventsOnDay(events, date).map(event => ({
    event,
    start: Math.max(0, (new Date(event.start_time).getTime() - midnight) / 60_000),
    end: Math.min(1440, (new Date(event.end_time).getTime() - midnight) / 60_000),
    column: 0,
    columns: 1,
  })).sort((a, b) => a.start - b.start || b.end - a.end);
  let group: typeof segments = [];
  let groupEnd = 0;
  let columnEnds: number[] = [];
  const finish = () => group.forEach(segment => { segment.columns = columnEnds.length; });
  for (const segment of segments) {
    if (segment.start >= groupEnd) {
      finish();
      group = [];
      columnEnds = [];
    }
    let column = columnEnds.findIndex(end => end <= segment.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = segment.end;
    segment.column = column;
    group.push(segment);
    groupEnd = Math.max(groupEnd, segment.end);
  }
  finish();
  return segments;
}
