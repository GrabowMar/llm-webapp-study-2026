export type View = "month" | "week" | "day";

export interface Period {
  year: number;
  month: number; // 0-based
  day: number; // 1-based, relevant for day view
}

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(startOfDay(d), -day);
}

export function weekdayNames(): string[] {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function periodLabel(view: View, d: Date): string {
  if (view === "month") return monthLabel(d);
  if (view === "day") {
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  const ws = startOfWeek(d);
  const we = addDays(ws, 6);
  const sameYear = ws.getFullYear() === we.getFullYear();
  const sameMonth = ws.getMonth() === we.getMonth();
  if (sameMonth && sameYear) {
    return `${ws.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
  }
  return `${ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${we.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function shift(view: View, d: Date, delta: number): Date {
  if (view === "month") return addMonths(d, delta);
  if (view === "week") return addDays(d, delta * 7);
  return addDays(d, delta);
}

export function rangeFor(view: View, d: Date): {
  start_date: string;
  end_date: string;
} {
  if (view === "month") {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start_date: toDateOnly(first), end_date: toDateOnly(last) };
  }
  if (view === "week") {
    const ws = startOfWeek(d);
    return { start_date: toDateOnly(ws), end_date: toDateOnly(addDays(ws, 6)) };
  }
  return { start_date: toDateOnly(d), end_date: toDateOnly(d) };
}

export function daysInMonth(d: Date): Date[] {
  const year = d.getFullYear();
  const month = d.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];
  for (let i = 1; i <= count; i++) days.push(new Date(year, month, i));
  return days;
}

export function gridDays(d: Date): Date[] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = startOfWeek(first);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const end = addDays(startOfWeek(last), 6);
  const days: Date[] = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) {
    days.push(cur);
  }
  return days;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Date-time helpers for the create/edit forms (local <-> UTC).
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): Date {
  return new Date(value);
}

export function toUtcIso(d: Date): string {
  return d.toISOString();
}
