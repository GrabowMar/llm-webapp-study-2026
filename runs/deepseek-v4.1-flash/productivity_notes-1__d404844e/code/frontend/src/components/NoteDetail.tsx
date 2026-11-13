import { useCallback, useEffect, useState } from "react";
import { api, type Note, type ValidationError } from "../api";
import { useAuth } from "../auth";
import { navigate } from "../router";
import { formatDate } from "../utils";

interface Props {
  id: number;
  onChanged: () => void;
}

export default function NoteDetail({ id, onChanged }: Props) {
  const { username, token } = useAuth();
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await api<Note>(`/api/notes/${id}`);
      setNote(result);
    } catch (err) {
      setError((err as ValidationError).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isAuthor = Boolean(note && username && note.author === username);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api<void>(`/api/notes/${id}`, { method: "DELETE", token });
      onChanged();
      navigate("/");
    } catch (err) {
      setError((err as ValidationError).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (error && !note) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!note) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading note…</p>;
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {note.pinned && (
            <span className="mb-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Pinned
            </span>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{note.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            by <span className="font-medium text-slate-700">{note.author}</span> ·
            created {formatDate(note.created_at)} · updated{" "}
            {formatDate(note.updated_at)}
          </p>
        </div>

        {isAuthor && (
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/notes/${note.id}/edit`)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {confirming && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-800">
            Delete this note? This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 whitespace-pre-wrap break-words font-sans text-[15px] leading-7 text-slate-800">
        {note.content}
      </div>

      {note.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
