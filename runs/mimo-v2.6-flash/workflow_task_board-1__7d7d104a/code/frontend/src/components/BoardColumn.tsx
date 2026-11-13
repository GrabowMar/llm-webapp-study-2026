import type { DragEvent } from "react";
import type { Priority, Status, Task } from "../api";

const COLUMN_THEME: Record<
  Status,
  { title: string; count: string; add: string; bar: string }
> = {
  todo: {
    title: "text-slate-700",
    count: "bg-slate-300/70 text-slate-700",
    add: "text-slate-500 hover:bg-slate-300/70 hover:text-slate-700",
    bar: "bg-slate-400",
  },
  in_progress: {
    title: "text-amber-700",
    count: "bg-amber-200 text-amber-800",
    add: "text-amber-600 hover:bg-amber-100 hover:text-amber-800",
    bar: "bg-amber-500",
  },
  done: {
    title: "text-emerald-700",
    count: "bg-emerald-200 text-emerald-800",
    add: "text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800",
    bar: "bg-emerald-500",
  },
};

export const PRIORITY_THEME: Record<Priority, string> = {
  low: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  medium: "bg-amber-100 text-amber-700 ring-amber-200",
  high: "bg-red-100 text-red-700 ring-red-200",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

interface BoardColumnProps {
  status: Status;
  label: string;
  tasks: Task[];
  count: number;
  signedIn: boolean;
  dragging: boolean;
  dropTarget: { status: Status; index: number } | null;
  onAdd: (status: Status) => void;
  onEdit: (task: Task) => void;
  onDragStart: (task: Task, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onCardDragOver: (status: Status, index: number) => void;
  onCardDrop: (status: Status, index: number) => void;
  onColumnDragOver: (status: Status) => void;
  onColumnDrop: (status: Status) => void;
  onColumnLeave: () => void;
}

function insertIndexFor(list: HTMLElement, clientY: number): number {
  const cards = Array.from(list.querySelectorAll<HTMLElement>("[data-task-id]"));
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return cards.length;
}

function DropIndicator() {
  return (
    <div className="my-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_0_2px_rgba(99,102,241,0.25)]" />
  );
}

export default function BoardColumn({
  status,
  label,
  tasks,
  count,
  signedIn,
  dragging,
  dropTarget,
  onAdd,
  onEdit,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDrop,
  onColumnDragOver,
  onColumnDrop,
  onColumnLeave,
}: BoardColumnProps) {
  const theme = COLUMN_THEME[status];

  return (
    <section
      data-column={status}
      className="flex min-h-96 flex-col rounded-xl bg-slate-200/70 p-2 shadow-inner"
      onDragOver={(event) => {
        if (!dragging) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onColumnDragOver(status);
      }}
      onDrop={(event) => {
        if (!dragging) return;
        event.preventDefault();
        onColumnDrop(status);
      }}
      onDragLeave={(event) => {
        const related = event.relatedTarget as Node | null;
        if (!related || !event.currentTarget.contains(related)) onColumnLeave();
      }}
    >
      <header className="flex items-center justify-between px-2 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${theme.bar}`} />
          <h2 className={`text-sm font-semibold uppercase tracking-wide ${theme.title}`}>
            {label}
          </h2>
          <span
            data-count={status}
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${theme.count}`}
          >
            {count}
          </span>
        </div>
        {signedIn && (
          <button
            type="button"
            aria-label={`Add task to ${label}`}
            onClick={() => onAdd(status)}
            className={`rounded-md p-1 text-lg leading-none ${theme.add}`}
          >
            +
          </button>
        )}
      </header>

      <div
        className="flex flex-1 flex-col gap-2"
        onDragOver={(event) => {
          if (!dragging) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          onCardDragOver(status, insertIndexFor(event.currentTarget, event.clientY));
        }}
        onDrop={(event) => {
          if (!dragging) return;
          event.preventDefault();
          event.stopPropagation();
          onCardDrop(status, insertIndexFor(event.currentTarget, event.clientY));
        }}
      >
        {tasks.map((task, index) => (
          <div key={task.id} className="contents">
            {dropTarget?.status === status && dropTarget.index === index && (
              <DropIndicator />
            )}
            <article
              data-task-id={task.id}
              draggable={signedIn}
              tabIndex={signedIn ? 0 : undefined}
              role={signedIn ? "button" : undefined}
              aria-label={signedIn ? `Edit task ${task.title}` : undefined}
              onDragStart={(event) => onDragStart(task, event)}
              onDragEnd={onDragEnd}
              onClick={() => {
                if (signedIn) onEdit(task);
              }}
              onKeyDown={(event) => {
                if (signedIn && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onEdit(task);
                }
              }}
              className={`group cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                dropTarget?.status === status &&
                dropTarget.index === index + 1 &&
                "ring-1 ring-indigo-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="break-words text-sm font-medium text-slate-800">
                  {task.title}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${PRIORITY_THEME[task.priority]}`}
                >
                  {PRIORITY_LABEL[task.priority]}
                </span>
              </div>
              {task.description && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                  {task.description}
                </p>
              )}
              {signedIn && (
                <div className="mt-2 flex justify-end opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100">
                  <span className="text-[11px] font-medium text-slate-400">
                    Edit
                  </span>
                </div>
              )}
            </article>
          </div>
        ))}
        {dropTarget?.status === status && dropTarget.index >= tasks.length && (
          <DropIndicator />
        )}
        {tasks.length === 0 && dropTarget?.status !== status && (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
            {signedIn ? "Drag tasks here or click +" : "No tasks"}
          </p>
        )}
      </div>
    </section>
  );
}
