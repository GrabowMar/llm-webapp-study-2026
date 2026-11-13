import type { Priority, PriorityFilter, Status, Task } from "../types";

export const COLUMNS: { status: Status; label: string; accent: string }[] = [
  { status: "todo", label: "To Do", accent: "bg-slate-400" },
  { status: "in_progress", label: "In Progress", accent: "bg-amber-400" },
  { status: "done", label: "Done", accent: "bg-emerald-500" },
];

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function matchesFilter(task: Task, filter: PriorityFilter): boolean {
  return filter === "all" || task.priority === filter;
}

export function byStatus(tasks: Task[], status: Status): Task[] {
  return tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position);
}

export function countByStatus(tasks: Task[], status: Status): number {
  return tasks.filter((task) => task.status === status).length;
}

/** Move a task locally so the board reacts instantly while the API call is in flight. */
export function applyMove(
  tasks: Task[],
  taskId: number,
  status: Status,
  position: number,
): Task[] {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving) {
    return tasks;
  }

  const columns: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const task of tasks) {
    columns[task.status].push(task);
  }

  columns[moving.status] = columns[moving.status].filter((task) => task.id !== taskId);
  const target = columns[status];
  const index = Math.max(0, Math.min(position - 1, target.length));
  target.splice(index, 0, { ...moving, status });

  const next: Task[] = [];
  for (const column of COLUMNS) {
    columns[column.status].forEach((task, idx) => {
      next.push({ ...task, status: column.status, position: idx + 1 });
    });
  }
  return next;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
