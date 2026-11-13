import type { DragEvent } from "react";
import { PRIORITY_LABELS, type Priority, type Task } from "../types";

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-green-100 text-green-700",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

interface TaskCardProps {
  task: Task;
  canEdit: boolean;
  dragging: boolean;
  onDragStart: (event: DragEvent, task: Task) => void;
  onDragEnd: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({
  task,
  canEdit,
  dragging,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
}: TaskCardProps) {
  return (
    <div
      data-task-id={task.id}
      draggable={canEdit}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md ${
        dragging ? "opacity-40" : ""
      } ${canEdit ? "active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium break-words text-slate-900">{task.title}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{task.description}</p>
      )}
      {canEdit && (
        <div className="mt-2 flex gap-3 text-xs font-medium">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="text-blue-600 hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(task)}
            className="text-red-600 hover:underline"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
