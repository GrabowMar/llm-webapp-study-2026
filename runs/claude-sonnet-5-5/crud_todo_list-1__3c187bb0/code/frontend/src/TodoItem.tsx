import { FormEvent, useState } from "react";
import { api, ApiError, Priority, Todo } from "./api";
import { btnCls, inputCls } from "./AuthForm";

const prioCls: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function TodoFields({
  initial,
  fields,
  message,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Todo;
  fields: Record<string, string>;
  message: string;
  busy: boolean;
  submitLabel: string;
  onSubmit: (v: {
    title: string;
    description: string | null;
    priority: Priority;
    due_date: string | null;
  }) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [due, setDue] = useState(initial?.due_date ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ title, description: description === "" ? null : description, priority, due_date: due || null });
  }

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <div>
        <input
          aria-label="Title"
          placeholder="Title"
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {fields.title && <p className="mt-1 text-sm text-red-600">{fields.title}</p>}
      </div>
      <div>
        <textarea
          aria-label="Description"
          placeholder="Description (optional)"
          rows={2}
          className={inputCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {fields.description && <p className="mt-1 text-sm text-red-600">{fields.description}</p>}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <div>
          <select
            aria-label="Priority"
            className={inputCls}
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {fields.priority && <p className="mt-1 text-sm text-red-600">{fields.priority}</p>}
        </div>
        <div>
          <input
            aria-label="Due date"
            type="date"
            className={inputCls}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          {fields.due_date && <p className="mt-1 text-sm text-red-600">{fields.due_date}</p>}
        </div>
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button className={btnCls} disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </form>
  );
}

export default function TodoItem({ todo, onChanged }: { todo: Todo; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  const overdue = !todo.completed && todo.due_date !== null && todo.due_date < today();

  async function toggle(checked: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await api.update(todo.id, { completed: checked });
      onChanged();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function save(v: Parameters<Parameters<typeof TodoFields>[0]["onSubmit"]>[0]) {
    setBusy(true);
    setFields({});
    setMessage("");
    try {
      await api.update(todo.id, v);
      setEditing(false);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        if (Object.keys(err.fields).length === 0) setMessage(err.message);
      } else setMessage("Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${todo.title}"?`)) return;
    setBusy(true);
    try {
      await api.remove(todo.id);
      onChanged();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg bg-white p-4 shadow-sm">
        <TodoFields
          initial={todo}
          fields={fields}
          message={message}
          busy={busy}
          submitLabel="Save"
          onSubmit={save}
          onCancel={() => {
            setEditing(false);
            setFields({});
            setMessage("");
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`rounded-lg p-4 shadow-sm ${overdue ? "border border-red-300 bg-red-50" : "bg-white"}`}
      data-overdue={overdue}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`Complete ${todo.title}`}
          className="mt-1 h-4 w-4"
          checked={todo.completed}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`break-words font-medium ${todo.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
              {todo.title}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${prioCls[todo.priority]}`}>{todo.priority}</span>
            {todo.due_date && (
              <span className={`text-xs ${overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>
                {overdue ? "Overdue: " : "Due "}
                {todo.due_date}
              </span>
            )}
          </div>
          {todo.description && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{todo.description}</p>
          )}
          {message && <p className="mt-1 text-sm text-red-600">{message}</p>}
        </div>
        <div className="flex gap-2 text-sm">
          <button className="text-indigo-600 hover:underline" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="text-red-600 hover:underline" disabled={busy} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
