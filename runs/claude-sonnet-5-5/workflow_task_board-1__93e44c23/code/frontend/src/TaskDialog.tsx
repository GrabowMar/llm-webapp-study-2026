import { FormEvent, useState } from "react";
import { api, ApiError, Priority, Status, Task } from "./api";

interface Props {
  task?: Task;
  initialStatus: Status;
  onClose: () => void;
  onSaved: () => void;
}

export default function TaskDialog({ task, initialStatus, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFields({});
    setBusy(true);
    try {
      if (task) await api.update(task.id, { title, description, priority });
      else await api.create({ title, description, priority, status: initialStatus });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError("Something went wrong");
      setBusy(false);
    }
  }

  const input = "w-full rounded border border-slate-300 px-2 py-1.5";
  const hasFieldErrors = Object.keys(fields).length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={task ? "Edit task" : "New task"}>
      <form onSubmit={submit} className="w-full max-w-md rounded bg-white p-5 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold">{task ? "Edit task" : "New task"}</h2>
        <label className="mb-3 block text-sm">
          Title
          <input name="title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          {fields.title && <span className="text-xs text-red-600">{fields.title}</span>}
        </label>
        <label className="mb-3 block text-sm">
          Description
          <textarea name="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
          {fields.description && <span className="text-xs text-red-600">{fields.description}</span>}
        </label>
        <label className="mb-3 block text-sm">
          Priority
          <select name="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={input}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {fields.priority && <span className="text-xs text-red-600">{fields.priority}</span>}
        </label>
        {error && !hasFieldErrors && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Cancel
          </button>
          <button disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
