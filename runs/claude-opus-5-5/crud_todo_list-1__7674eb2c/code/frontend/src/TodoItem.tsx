import { useState } from "react";
import TodoForm from "./TodoForm";
import type { Priority, Todo, TodoInput } from "./api";

interface Props {
  todo: Todo;
  today: string;
  onToggle: (todo: Todo, completed: boolean) => Promise<void>;
  onUpdate: (todo: Todo, input: TodoInput) => Promise<void>;
  onDelete: (todo: Todo) => Promise<void>;
}

const priorityStyles: Record<Priority, string> = {
  high: "bg-red-100 text-red-700 ring-red-200",
  medium: "bg-amber-100 text-amber-800 ring-amber-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

function formatDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function TodoItem({ todo, today, onToggle, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overdue = !todo.completed && todo.due_date !== null && todo.due_date < today;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${todo.title}"? This cannot be undone.`)) return;
    void run(() => onDelete(todo));
  }

  if (editing) {
    return (
      <li className="border-b border-slate-100 bg-slate-50 px-4 py-4 last:border-b-0">
        <TodoForm
          initial={todo}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await onUpdate(todo, input);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li
      data-testid="todo-item"
      data-overdue={overdue || undefined}
      className={`group flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
        overdue ? "border-l-4 border-l-red-500 bg-red-50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={todo.completed}
        disabled={busy}
        onChange={(e) => {
          const checked = e.target.checked;
          void run(() => onToggle(todo, checked));
        }}
        aria-label={`Mark "${todo.title}" as ${todo.completed ? "open" : "completed"}`}
        className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
      />
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm font-medium ${todo.completed ? "text-slate-400 line-through" : "text-slate-900"}`}>
          {todo.title}
        </p>
        {todo.description && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-500">{todo.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium capitalize ring-1 ring-inset ${priorityStyles[todo.priority]}`}>
            {todo.priority}
          </span>
          {todo.due_date && (
            <span className={overdue ? "font-semibold text-red-600" : "text-slate-500"}>
              {overdue ? "Overdue · " : "Due "}
              <time dateTime={todo.due_date}>{formatDate(todo.due_date)}</time>
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
