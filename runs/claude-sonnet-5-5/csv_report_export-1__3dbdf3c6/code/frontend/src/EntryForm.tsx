import { FormEvent, useState } from "react";
import { api, ApiError } from "./api";
import { btnCls, inputCls } from "./AuthForms";

export function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function EntryForm({
  projects,
  onCreated,
}: {
  projects: string[];
  onCreated: () => void;
}) {
  const [project, setProject] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    const h = hours.trim() === "" ? NaN : Number(hours.replace(",", "."));
    setBusy(true);
    try {
      await api.create({
        project,
        description,
        hours: Number.isNaN(h) ? (hours as unknown as number) : h,
        date,
      });
      setDescription("");
      setHours("");
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(Object.keys(err.errors).length ? "" : err.message);
      } else {
        setMessage("Network error");
      }
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k] && <span className="text-xs text-red-600">{errors[k]}</span>;

  return (
    <form onSubmit={submit} className="rounded-lg bg-white p-4 shadow">
      <h2 className="mb-3 font-semibold text-slate-800">Log time</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <label className="block text-sm lg:col-span-3">
          <span className="mb-1 block text-slate-600">Project</span>
          <input
            className={inputCls}
            list="project-suggestions"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <datalist id="project-suggestions">
            {projects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {err("project")}
        </label>
        <label className="block text-sm lg:col-span-4">
          <span className="mb-1 block text-slate-600">Description</span>
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {err("description")}
        </label>
        <label className="block text-sm lg:col-span-2">
          <span className="mb-1 block text-slate-600">Hours</span>
          <input
            className={inputCls}
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          {err("hours")}
        </label>
        <label className="block text-sm lg:col-span-2">
          <span className="mb-1 block text-slate-600">Date</span>
          <input
            className={inputCls}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {err("date")}
        </label>
        <div className="flex items-end lg:col-span-1">
          <button className={`${btnCls} w-full`} disabled={busy}>
            Add
          </button>
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
    </form>
  );
}
