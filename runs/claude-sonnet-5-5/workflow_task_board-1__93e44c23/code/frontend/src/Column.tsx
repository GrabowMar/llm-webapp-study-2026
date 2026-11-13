import { useState } from "react";
import { Priority, Status, Task } from "./api";

const BADGE: Record<Priority, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

interface Props {
  status: Status;
  label: string;
  tasks: Task[];
  count: number;
  signedIn: boolean;
  dragId: number | null;
  setDragId: (id: number | null) => void;
  onDrop: (taskId: number, status: Status, beforeId: number | null) => void;
  onAdd: () => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}

export default function Column(p: Props) {
  const [over, setOver] = useState(false);
  const [overCard, setOverCard] = useState<number | null>(null);

  function drop(e: React.DragEvent, beforeId: number | null) {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    setOverCard(null);
    if (p.dragId !== null) p.onDrop(p.dragId, p.status, beforeId);
    p.setDragId(null);
  }

  return (
    <section
      data-testid={`column-${p.status}`}
      aria-label={p.label}
      onDragOver={(e) => {
        if (p.signedIn && p.dragId !== null) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setOver(false);
          setOverCard(null);
        }
      }}
      onDrop={(e) => drop(e, null)}
      className={`flex min-h-48 flex-col rounded-lg bg-slate-200 p-3 ${over ? "ring-2 ring-blue-400" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">
          {p.label}{" "}
          <span data-testid={`count-${p.status}`} className="ml-1 rounded-full bg-slate-300 px-2 py-0.5 text-xs">
            {p.count}
          </span>
        </h2>
        {p.signedIn && (
          <button onClick={p.onAdd} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500" aria-label={`Add task to ${p.label}`}>
            + Add
          </button>
        )}
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {p.tasks.map((t) => (
          <li
            key={t.id}
            data-testid={`task-${t.id}`}
            draggable={p.signedIn}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(t.id));
              p.setDragId(t.id);
            }}
            onDragEnd={() => {
              p.setDragId(null);
              setOverCard(null);
              setOver(false);
            }}
            onDragOver={(e) => {
              if (p.signedIn && p.dragId !== null) {
                e.preventDefault();
                e.stopPropagation();
                setOver(true);
                setOverCard(t.id);
              }
            }}
            onDrop={(e) => drop(e, t.id)}
            className={`rounded bg-white p-3 shadow-sm ${p.signedIn ? "cursor-grab" : ""} ${
              p.dragId === t.id ? "opacity-40" : ""
            } ${overCard === t.id && p.dragId !== t.id ? "border-t-4 border-blue-400" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="break-words font-medium">{t.title}</span>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${BADGE[t.priority]}`}>{t.priority}</span>
            </div>
            {t.description && <p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">{t.description}</p>}
            {p.signedIn && (
              <div className="mt-2 flex gap-2 text-xs">
                <button onClick={() => p.onEdit(t)} className="text-blue-700 hover:underline">
                  Edit
                </button>
                <button onClick={() => p.onDelete(t)} className="text-red-700 hover:underline">
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
