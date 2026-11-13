import { useState } from "react";
import type { Priority, Todo, TodoInput } from "../types";
import TodoForm from "./TodoForm";

const PRIORITY_BADGES: Record<Priority, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-emerald-100 text-emerald-800",
};

function formatDate(value: string): string {
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isOverdue(todo: Todo): boolean {
  if (todo.completed || !todo.due_date) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return todo.due_date < today;
}

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo, completed: boolean) => void;
  onSave: (id: number, input: TodoInput) => Promise<void>;
  onDelete: (todo: Todo) => void;
}

export default function TodoItem({ todo, onToggle, onSave, onDelete }: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const overdue = isOverdue(todo);

  if (editing) {
    return (
      <li className="rounded border border-indigo-300 bg-white p-3 shadow-sm">
        <TodoForm
          initial={todo}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await onSave(todo.id, input);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`rounded border p-3 shadow-sm ${
        overdue ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={(e) => onToggle(todo, e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          aria-label={`Mark "${todo.title}" as ${todo.completed ? "open" : "completed"}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-medium ${
                todo.completed ? "text-slate-400 line-through" : "text-slate-800"
              }`}
            >
              {todo.title}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGES[todo.priority]}`}>
              {todo.priority}
            </span>
            {overdue && <span className="text-xs font-semibold text-red-600">Overdue</span>}
          </div>

          {todo.description && <p className="mt-1 text-sm text-slate-600">{todo.description}</p>}

          <div className="mt-1 text-xs text-slate-500">
            {todo.due_date ? <span>Due {formatDate(todo.due_date)}</span> : <span>No due date</span>}
            {todo.completed && todo.completed_at && (
              <span> &middot; Completed {formatDate(todo.completed_at)}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(todo)}
            className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
