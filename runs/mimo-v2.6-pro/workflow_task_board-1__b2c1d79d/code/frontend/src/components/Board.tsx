import { Fragment, useState, type DragEvent } from "react";
import { STATUS_LABELS, STATUS_ORDER, type Status, type Task } from "../types";
import { TaskCard } from "./TaskCard";

interface DragState {
  id: number;
  status: Status;
  position: number;
}

interface DropState {
  status: Status;
  index: number;
}

interface BoardProps {
  tasks: Task[];
  counts: Record<Status, number>;
  canEdit: boolean;
  loading: boolean;
  onMove: (task: Task, status: Status, position: number) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onCreate: (status: Status) => void;
}

function computePosition(
  visible: Task[],
  index: number,
  sameColumn: boolean,
  dragPosition: number,
  columnSize: number,
): number {
  if (index < visible.length) {
    const ref = visible[index];
    return sameColumn && dragPosition < ref.position ? ref.position - 1 : ref.position;
  }
  if (visible.length > 0) {
    const ref = visible[visible.length - 1];
    return sameColumn && dragPosition < ref.position ? ref.position : ref.position + 1;
  }
  return columnSize - (sameColumn ? 1 : 0) + 1;
}

function DropIndicator() {
  return <div className="h-1.5 shrink-0 rounded-full bg-blue-500/70" />;
}

export function Board({
  tasks,
  counts,
  canEdit,
  loading,
  onMove,
  onEdit,
  onDelete,
  onCreate,
}: BoardProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [drop, setDrop] = useState<DropState | null>(null);

  function columnTasks(status: Status): Task[] {
    return tasks.filter((t) => t.status === status);
  }

  function handleDragStart(event: DragEvent, task: Task) {
    if (!canEdit) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(task.id));
    setDrag({ id: task.id, status: task.status, position: task.position });
    setDrop(null);
  }

  function handleDragEnd() {
    setDrag(null);
    setDrop(null);
  }

  function handleDragOver(event: DragEvent, status: Status) {
    if (!canEdit || !drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const container = event.currentTarget as HTMLElement;
    const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-task-id]")).filter(
      (el) => el.dataset.taskId !== String(drag.id),
    );
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        index = i;
        break;
      }
    }
    setDrop((prev) =>
      prev && prev.status === status && prev.index === index ? prev : { status, index },
    );
  }

  function handleDrop(event: DragEvent, status: Status) {
    event.preventDefault();
    if (!drag) return;
    const current = drag;
    const items = columnTasks(status);
    const visible = items.filter((t) => t.id !== current.id);
    const index = drop && drop.status === status ? drop.index : visible.length;
    const position = computePosition(
      visible,
      index,
      current.status === status,
      current.position,
      items.length,
    );
    const task = tasks.find((t) => t.id === current.id);
    setDrag(null);
    setDrop(null);
    if (task && (task.status !== status || task.position !== position)) {
      onMove(task, status, position);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {STATUS_ORDER.map((status) => {
        const items = columnTasks(status);
        const visibleCount = drag ? items.filter((t) => t.id !== drag.id).length : items.length;
        return (
          <section
            key={status}
            className={`flex flex-col rounded-xl border p-3 ${
              drop?.status === status && drag
                ? "border-blue-300 bg-blue-50/50"
                : "border-slate-200 bg-slate-100"
            }`}
          >
            <header className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-700 uppercase">
                {STATUS_LABELS[status]}
                <span
                  data-testid={`count-${status}`}
                  className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
                >
                  {counts[status] ?? 0}
                </span>
              </h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onCreate(status)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                >
                  + Add task
                </button>
              )}
            </header>
            <div
              className="flex min-h-[10rem] flex-col gap-2"
              onDragOver={(e) => handleDragOver(e, status)}
              onDrop={(e) => handleDrop(e, status)}
            >
              {items.map((task, i) => {
                const insertIndex = items
                  .slice(0, i)
                  .filter((t) => t.id !== drag?.id).length;
                return (
                  <Fragment key={task.id}>
                    {drag && drop && drop.status === status && drop.index === insertIndex && (
                      <DropIndicator />
                    )}
                    <TaskCard
                      task={task}
                      canEdit={canEdit}
                      dragging={drag?.id === task.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  </Fragment>
                );
              })}
              {drag && drop && drop.status === status && drop.index === visibleCount && (
                <DropIndicator />
              )}
              {items.length === 0 && !loading && (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                  {canEdit ? "Drag tasks here or click \u201cAdd task\u201d" : "No tasks yet"}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
