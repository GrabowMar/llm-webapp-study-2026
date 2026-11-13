import type { CalEvent, ViewMode } from "./types";

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function shift(d: Date, view: ViewMode, dir: 1 | -1): Date {
  if (view === "month") return new Date(d.getFullYear(), d.getMonth() + dir, 1);
  return addDays(d, dir * (view === "week" ? 7 : 1));
}

export function range(d: Date, view: ViewMode): { start: Date; end: Date } {
  if (view === "day") {
    const s = startOfDay(d);
    return { start: s, end: addDays(s, 1) };
  }
  if (view === "week") {
    const s = startOfWeek(d);
    return { start: s, end: addDays(s, 7) };
  }
  const s = startOfWeek(startOfMonth(d));
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const e = addDays(startOfWeek(last), 7);
  return { start: s, end: e };
}

export function daysIn(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function eventsOn(events: CalEvent[], day: Date): CalEvent[] {
  const s = day.getTime();
  const e = addDays(day, 1).getTime();
  return events.filter((ev) => {
    const st = new Date(ev.start_time).getTime();
    const en = ev.end_time ? new Date(ev.end_time).getTime() : st;
    return st < e && (en > s || (en === st && st >= s));
  });
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function title(d: Date, view: ViewMode): string {
  if (view === "month") return d.toLocaleDateString([], { month: "long", year: "numeric" });
  if (view === "day")
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const { start } = range(d, "week");
  const end = addDays(start, 6);
  const a = start.toLocaleDateString([], { month: "short", day: "numeric" });
  const b = end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${a} – ${b}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
