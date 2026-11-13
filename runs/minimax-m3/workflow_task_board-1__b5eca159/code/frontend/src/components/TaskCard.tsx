import type { PointerEvent as ReactPointerEvent } from "react";
import type { Priority, Task } from "../types";

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-sky-100 text-sky-700 ring-sky-200",
  medium: "bg-amber-100 text-amber-800 ring-amber-200",
  high: "bg-rose-100 text-rose-700 ring-rose-200",
  urgent: "bg-rose-100 text-rose-700 ring-rose-200",
  critical: "bg-rose-100 text-rose-700 ring-rose-200",
  normal: "bg-amber-100 text-amber-800 ring-amber-200",
};

export function priorityBadge(priority: Priority | string) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium
      }`}
    >
      {priority}
    </span>
  );
}

interface TaskCardProps {
  task: Task;
  draggable: boolean;
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, task: Task) => void;
  onOpen: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({
  task,
  draggable,
  dragging,
  onPointerDown,
  onOpen,
  onDelete,
}: TaskCardProps) {
  return (
    <article
      data-task-id={task.id}
      data-priority={task.priority}
      data-status={task.status}
      onPointerDown={(event) => onPointerDown(event, task)}
      onClick={() => onOpen(task)}
      className={`group cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow ${
        draggable ? "touch-none select-none" : ""
      } ${dragging ? "opacity-60 ring-2 ring-slate-900/20" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">{task.title}</h3>
        {priorityBadge(task.priority)}
      </div>
      {task.description ? (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-slate-500">
          {task.description}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>#{task.position}</span>
        {draggable ? (
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              data-no-drag
              onClick={(event) => {
                event.stopPropagation();
                onOpen(task);
              }}
              className="rounded-md px-2 py-1 font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              Edit
            </button>
            <button
              type="button"
              data-no-drag
              onClick={(event) => {
                event.stopPropagation();
                onDelete(task);
              }}
              className="rounded-md px-2 py-1 font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        ) : (
          <span>View only</span>
        )}
      </div>
    </article>
  );
}
