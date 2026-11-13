import type { Todo } from "../types";

export const PRIORITY_OPTIONS = ["low", "medium", "high"] as const;

export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isOverdue(todo: Todo): boolean {
  return !todo.completed && todo.due_date !== null && todo.due_date < todayIso();
}

export function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parts = value.split("-");
  if (parts.length !== 3) {
    return value;
  }
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function priorityLabel(priority: string): string {
  if (!priority) {
    return priority;
  }
  return priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
}

export function priorityBadgeClass(priority: string): string {
  switch (priority.toLowerCase()) {
    case "high":
      return "bg-rose-100 text-rose-700 ring-rose-200";
    case "medium":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "low":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}
