import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { Task } from "../api";
import { startDrag, type DropTarget } from "../dnd";
import PriorityBadge from "./PriorityBadge";

interface Props {
  task: Task;
  canEdit: boolean;
  dragging: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMove: (taskId: number, target: DropTarget) => void;
}

const DRAG_THRESHOLD = 5;

export default function TaskCard({ task, canEdit, dragging, onEdit, onDelete, onMove }: Props) {
  const suppressClick = useRef(false);

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!canEdit || event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    const cleanup = () => {
      window.removeEventListener("pointermove", onMoveWindow);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    const onMoveWindow = (moveEvent: PointerEvent) => {
      if (dragStarted) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragStarted = true;
      suppressClick.current = true;
      cleanup();
      startDrag(task.id, { status: task.status, position: task.position }, (target) =>
        onMove(task.id, target)
      );
    };
    window.addEventListener("pointermove", onMoveWindow);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }

  return (
    <article
      className={`group rounded-lg border bg-white p-3 shadow-sm transition ${
        dragging
          ? "border-blue-300 opacity-40"
          : "border-slate-200 hover:border-slate-300 hover:shadow"
      } ${canEdit ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""}`}
      onPointerDown={handlePointerDown}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 break-words text-sm font-semibold text-slate-800">
          {task.title}
        </h4>
        <PriorityBadge priority={task.priority} />
      </div>
      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</p>
      ) : null}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          #{task.id} · pos {task.position}
        </span>
        {canEdit ? (
          <span className="flex gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(task);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(task);
              }}
            >
              Delete
            </button>
          </span>
        ) : null}
      </div>
    </article>
  );
}
