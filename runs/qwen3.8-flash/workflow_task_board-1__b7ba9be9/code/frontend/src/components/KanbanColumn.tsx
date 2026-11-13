import type { Status, Task } from "../api";
import type { DragState, DropTarget } from "../dnd";
import DropIndicator from "./DropIndicator";
import TaskCard from "./TaskCard";

const HEADINGS: Record<Status, { label: string; dot: string; ring: string }> = {
  todo: { label: "To Do", dot: "bg-slate-400", ring: "border-slate-200" },
  in_progress: { label: "In Progress", dot: "bg-blue-500", ring: "border-blue-200" },
  done: { label: "Done", dot: "bg-emerald-500", ring: "border-emerald-200" },
};

interface Props {
  status: Status;
  tasks: Task[];
  count: number;
  canEdit: boolean;
  drag: DragState | null;
  onAdd: (status: Status) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMove: (taskId: number, target: DropTarget) => void;
}

function slotTarget(rawPosition: number, status: Status, drag: DragState | null): number {
  if (drag && drag.source.status === status && rawPosition > drag.source.position) {
    return rawPosition - 1;
  }
  return rawPosition;
}

export default function KanbanColumn({
  status,
  tasks,
  count,
  canEdit,
  drag,
  onAdd,
  onEdit,
  onDelete,
  onMove,
}: Props) {
  const heading = HEADINGS[status];
  const activeHere = drag?.target?.status === status;
  const indicatorSlot = activeHere && drag?.target ? drag.target.position : null;

  function handleMove(taskId: number, rawPosition: number) {
    onMove(taskId, { status, position: slotTarget(rawPosition, status, drag) });
  }

  const items: React.ReactNode[] = [];
  let indicatorPlaced = false;
  for (const task of tasks) {
    if (!indicatorPlaced && indicatorSlot !== null && task.position >= indicatorSlot) {
      items.push(<DropIndicator key="indicator" visible />);
      indicatorPlaced = true;
    }
    items.push(
      <div key={task.id} data-slot={task.position} className="relative">
        <TaskCard
          task={task}
          canEdit={canEdit}
          dragging={drag?.taskId === task.id}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={handleMove}
        />
      </div>
    );
  }
  if (!indicatorPlaced && indicatorSlot !== null) {
    items.push(<DropIndicator key="indicator" visible />);
  }
  const trailingSlot = tasks.length
    ? tasks[tasks.length - 1].position + 1
    : 1;

  return (
    <section
      data-column={status}
      className={`flex h-full min-w-0 flex-1 flex-col rounded-xl border bg-slate-50/80 transition ${
        activeHere ? `${heading.ring} ring-2 ring-blue-200 bg-white` : "border-slate-200"
      }`}
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${heading.dot}`} />
          <h3 className="text-sm font-semibold text-slate-700">{heading.label}</h3>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
            {count}
          </span>
        </div>
        {canEdit ? (
          <button
            type="button"
            aria-label={`Add task to ${heading.label}`}
            className="rounded-md px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            onClick={() => onAdd(status)}
          >
            + Add
          </button>
        ) : null}
      </header>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {items}
        {tasks.length === 0 && indicatorSlot === null ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
            No tasks
          </p>
        ) : null}
        <div data-slot={trailingSlot} className="min-h-1 flex-1" />
      </div>
    </section>
  );
}
