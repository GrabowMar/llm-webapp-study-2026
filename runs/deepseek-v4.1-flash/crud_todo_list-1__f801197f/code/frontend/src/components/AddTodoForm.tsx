import { useState } from "react";
import { ApiError, createTodo, type Todo, type TodoInput } from "../api";
import { PRIORITIES } from "./TodoItem";

interface Props {
  onCreated: (todo: Todo) => void;
  onUnauthorized: () => void;
}

const EMPTY = {
  title: "",
  description: "",
  priority: "medium",
  due_date: "",
};

export default function AddTodoForm({ onCreated, onUnauthorized }: Props) {
  const [draft, setDraft] = useState({ ...EMPTY });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    setFieldErrors({});
    const payload: TodoInput = {
      title: draft.title,
      description: draft.description.trim() ? draft.description : null,
      priority: draft.priority,
      due_date: draft.due_date ? draft.due_date : null,
    };
    try {
      const created = await createTodo(payload);
      onCreated(created);
      setDraft({ ...EMPTY });
      setExpanded(false);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          onUnauthorized();
          return;
        }
        setFormError(error.message);
        setFieldErrors(error.fields);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      noValidate
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            onFocus={() => setExpanded(true)}
            placeholder="What needs doing?"
            aria-label="Todo title"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          {fieldErrors.title && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add todo"}
        </button>
      </div>

      {(expanded || formError) && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          {formError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              {formError}
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Description (optional)
            </label>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {fieldErrors.description && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Priority
              </label>
              <select
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              {fieldErrors.priority && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.priority}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Due date (optional)
              </label>
              <input
                type="date"
                value={draft.due_date}
                onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
              {fieldErrors.due_date && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.due_date}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
