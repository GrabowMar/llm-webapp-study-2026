import { useId, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, errorMessage } from "../api";
import type { FieldErrors, Priority, Todo, TodoValues } from "../api";
import Icon from "./Icon";

export default function TodoForm({ todo, onSave, onCancel }: {
  todo?: Todo;
  onSave: (values: TodoValues) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(todo?.title ?? "");
  const [description, setDescription] = useState(todo?.description ?? "");
  const [priority, setPriority] = useState<Priority>(todo?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(todo?.due_date ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      await onSave({ title, description, priority, due_date: dueDate || null });
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError) setFields(error.fields);
      setBusy(false);
    }
  }

  const inputClass = "mt-1.5 w-full rounded-lg border border-[#dde4d8] bg-white px-3 py-2.5 text-sm focus:border-leaf focus:ring-2 focus:ring-leaf/10 placeholder:text-[#a1a69e] disabled:opacity-60";
  function fieldError(field: string) {
    return fields[field] ? <p id={`${id}-${field}-error`} className="mt-1.5 text-xs text-red-600">{fields[field]}</p> : null;
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-[#dce6d6] bg-[#f7faf4] p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name={todo ? "pencil" : "plus"} className="size-4 text-leaf" />{todo ? "Edit task" : "A new little to-do"}</h3><button type="button" onClick={onCancel} disabled={busy} aria-label="Close task form" className="rounded-md p-1 text-muted hover:bg-mint"><Icon name="x" className="size-4" /></button></div>
      <fieldset disabled={busy} className="space-y-4">
        <div>
          <label htmlFor={`${id}-title`} className="text-xs font-medium">Task title <span className="text-leaf">*</span></label>
          <input autoFocus id={`${id}-title`} name="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What would you like to get done?" className={inputClass} aria-invalid={!!fields.title} aria-describedby={fields.title ? `${id}-title-error` : undefined} />
          {fieldError("title")}
        </div>
        <div>
          <label htmlFor={`${id}-description`} className="text-xs font-medium">Description <span className="font-normal text-muted">(optional)</span></label>
          <textarea id={`${id}-description`} name="description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A few details, a helpful reminder…" className={`${inputClass} resize-y`} aria-invalid={!!fields.description} aria-describedby={fields.description ? `${id}-description-error` : undefined} />
          {fieldError("description")}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor={`${id}-priority`} className="text-xs font-medium">Priority</label><select id={`${id}-priority`} value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className={inputClass} aria-invalid={!!fields.priority} aria-describedby={fields.priority ? `${id}-priority-error` : undefined}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select>{fieldError("priority")}</div>
          <div><label htmlFor={`${id}-due_date`} className="text-xs font-medium">Due date <span className="font-normal text-muted">(optional)</span></label><input id={`${id}-due_date`} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} aria-invalid={!!fields.due_date} aria-describedby={fields.due_date ? `${id}-due_date-error` : undefined} />{fieldError("due_date")}</div>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <div className="mt-5 flex items-center justify-end gap-3"><button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-4 py-2.5 text-xs font-medium text-muted transition hover:bg-mint">Cancel</button><button disabled={busy} className="flex items-center gap-2 rounded-lg bg-leaf px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#2f6848] disabled:opacity-60"><Icon name={todo ? "check" : "plus"} className="size-4" />{busy ? "Saving…" : todo ? "Save changes" : "Add task"}</button></div>
    </form>
  );
}
