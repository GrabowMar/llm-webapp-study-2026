import { useState } from "react";
import { api, ApiError, Entry } from "./api";
import { btnCls, btnSecondaryCls, inputCls } from "./AuthForms";

export default function EntryRow({
  entry,
  onChanged,
}: {
  entry: Entry;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [project, setProject] = useState(entry.project);
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(String(entry.hours));
  const [date, setDate] = useState(entry.date);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setProject(entry.project);
    setDescription(entry.description);
    setHours(String(entry.hours));
    setDate(entry.date);
    setErrors({});
    setMessage("");
    setEditing(true);
  }

  function fail(err: unknown) {
    if (err instanceof ApiError) {
      setErrors(err.errors);
      setMessage(Object.keys(err.errors).length ? "" : err.message);
    } else {
      setMessage("Network error");
    }
  }

  async function save() {
    setBusy(true);
    setErrors({});
    setMessage("");
    const h = Number(hours.replace(",", "."));
    try {
      await api.update(entry.id, {
        project,
        description,
        hours: hours.trim() === "" || Number.isNaN(h) ? (hours as unknown as number) : h,
        date,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.remove(entry.id);
      onChanged();
    } catch (err) {
      fail(err);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => errors[k] && <div className="text-xs text-red-600">{errors[k]}</div>;

  if (editing) {
    return (
      <tr className="bg-indigo-50 align-top">
        <td className="p-2">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {err("date")}
        </td>
        <td className="p-2">
          <input className={inputCls} value={project} onChange={(e) => setProject(e.target.value)} />
          {err("project")}
        </td>
        <td className="p-2">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          {err("description")}
        </td>
        <td className="p-2">
          <input className={inputCls} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
          {err("hours")}
        </td>
        <td className="p-2 text-right whitespace-nowrap">
          <button className={btnCls} onClick={save} disabled={busy}>
            Save
          </button>{" "}
          <button className={btnSecondaryCls} onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </button>
          {message && <div className="text-xs text-red-600">{message}</div>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="align-top hover:bg-slate-50">
      <td className="p-2 whitespace-nowrap">{entry.date}</td>
      <td className="p-2">{entry.project}</td>
      <td className="p-2 break-words text-slate-600">{entry.description}</td>
      <td className="p-2 text-right tabular-nums">{entry.hours}</td>
      <td className="p-2 text-right whitespace-nowrap">
        {confirming ? (
          <>
            <span className="mr-2 text-sm text-slate-600">Delete this entry?</span>
            <button
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              onClick={remove}
              disabled={busy}
            >
              Delete
            </button>{" "}
            <button className={btnSecondaryCls} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className={btnSecondaryCls} onClick={startEdit}>
              Edit
            </button>{" "}
            <button className={btnSecondaryCls} onClick={() => setConfirming(true)}>
              Delete
            </button>
          </>
        )}
        {message && <div className="text-xs text-red-600">{message}</div>}
      </td>
    </tr>
  );
}
