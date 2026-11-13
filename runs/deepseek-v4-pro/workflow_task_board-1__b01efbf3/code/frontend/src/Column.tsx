import { useRef, useState } from "react";
import type { DragEvent } from "react";
import TaskCard from "./TaskCard";
import { STATUS_LABEL } from "./store";
import type { Status, Task } from "./types";

interface ColumnProps {
  status: Status;
  tasks: Task[];
  count: number;
  canEdit: boolean;
  onAdd: (status: Status) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDropTask: (taskId: number, status: Status, position: number) => void;
}

export default function Column({
  status,
  tasks,
  count,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
  onDropTask,
}: ColumnProps) {
  const [dragOver, setDragOver] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    taskId: number;
    before: boolean;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const onDragStart = (e: DragEvent, task: Task) => {
    e.dataTransfer.setData("text/plain", String(task.id));
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(task.id);
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
    setDragOver(false);
  };

  const onDragEnter = () => {
    if (canEdit) setDragOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget === e.target) setDragOver(false);
  };

  const onDragOver = (e: DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const container = listRef.current;
    if (!container) return;

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-task-id]"),
    );
    const y = e.clientY;
    let target: { taskId: number; before: boolean } | null = null;

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) {
        target = { taskId: Number(card.dataset.taskId), before: true };
        break;
      } else if (y <= rect.bottom) {
        target = { taskId: Number(card.dataset.taskId), before: false };
        break;
      }
    }
    setDropTarget(target);
  };

  const onDrop = (e: DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    const taskId = Number(e.dataTransfer.getData("text/plain"));
    if (!taskId) return;

    let position: number;
    if (dropTarget) {
      const index = tasks.findIndex((t) => t.id === dropTarget.taskId);
      position = dropTarget.before ? index + 1 : index + 2;
    } else {
      position = tasks.length + 1;
    }
    onDropTask(taskId, status, position);
    onDragEnd();
  };

  const columnTone: Record<Status, string> = {
    todo: "bg-slate-100",
    in_progress: "bg-blue-50",
    done: "bg-emerald-50",
  };

  return (
    <div className="flex w-80 shrink-0 flex-col rounded-xl bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            {STATUS_LABEL[status]}
          </h2>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
            {count}
          </span>
        </div>
        {canEdit && (
          <button
            onClick={() => onAdd(status)}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            + Add
          </button>
        )}
      </div>
      <div
        ref={listRef}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`flex min-h-[4rem] flex-1 flex-col gap-2 rounded-lg p-1 transition ${
          dragOver ? `ring-2 ring-blue-400 ${columnTone[status]}` : ""
        }`}
      >
        {tasks.map((task) => (
          <div key={task.id} data-task-id={task.id}>
            {dropTarget?.taskId === task.id && dropTarget.before && (
              <div className="mb-2 h-1 rounded bg-blue-500" />
            )}
            <TaskCard
              task={task}
              canEdit={canEdit}
              onEdit={onEdit}
              onDelete={onDelete}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              dragging={draggingId === task.id}
            />
            {dropTarget?.taskId === task.id && !dropTarget.before && (
              <div className="mt-2 h-1 rounded bg-blue-500" />
            )}
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="p-3 text-center text-sm text-slate-400">
            {canEdit ? "Drop tasks here" : "No tasks"}
          </p>
        )}
      </div>
    </div>
  );
}
