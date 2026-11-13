import type { DragEvent } from "react";
import { PRIORITY_BADGE, PRIORITY_LABEL } from "./store";
import type { Task } from "./types";

interface TaskCardProps {
  task: Task;
  canEdit: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDragStart: (e: DragEvent, task: Task) => void;
  onDragEnd: () => void;
  dragging: boolean;
}

export default function TaskCard({
  task,
  canEdit,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  dragging,
}: TaskCardProps) {
  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      className={`group rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition ${
        dragging ? "opacity-40" : ""
      } ${canEdit ? "cursor-grab" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{task.title}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[task.priority]}`}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>
      {task.description && (
        <p className="mt-1 text-sm text-slate-600">{task.description}</p>
      )}
      {canEdit && (
        <div className="mt-2 flex gap-2 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={() => onEdit(task)}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(task)}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
