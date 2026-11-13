import { useCallback, useEffect, useState } from "react";
import { api, ApiError, flattenFieldErrors } from "./api";
import type { Note, Session } from "./api";
import NoteEditor from "./NoteEditor";

export default function NotePage({
  id,
  session,
  onBack,
  onDeleted,
  onUnauthorised,
}: {
  id: number;
  session: Session | null;
  onBack: () => void;
  onDeleted: () => void;
  onUnauthorised: () => void;
}) {
  const [note, setNote] = useState<Note | null>(null);
  const [isAuthor, setIsAuthor] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setError("");
    setNotFound(false);
    api
      .getNote(id)
      .then((n) => {
        setNote(n);
        setIsAuthor(!!session && n.author === session.username);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError("Failed to load the note.");
      });
  }, [id, session]);

  useEffect(load, [load]);

  async function togglePin() {
    if (!note || !session) return;
    try {
      setNote(await api.updateNote(session.token, note.id, { pinned: !note.pinned }));
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) onUnauthorised();
        setError(err.message);
      }
    }
  }

  async function submitEdit(value: { title: string; content: string; tags: string[]; pinned: boolean }) {
    if (!session) return ["Not signed in."];
    try {
      const updated = await api.updateNote(session.token, id, value);
      setNote(updated);
      setEditing(false);
      return [];
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) onUnauthorised();
        return [err.message, ...flattenFieldErrors(err.fieldErrors)];
      }
      return ["Network error, please try again."];
    }
  }

  async function remove() {
    if (!session || !note) return;
    if (!window.confirm(`Delete note “${note.title}”? This cannot be undone.`)) return;
    try {
      await api.deleteNote(session.token, note.id);
      onDeleted();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) onUnauthorised();
        setError(err.message);
      }
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-slate-600">This note does not exist (or was deleted).</p>
        <button
          onClick={onBack}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Back to notes
        </button>
      </div>
    );
  }

  if (!note) {
    return (
      <div>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-sm text-slate-500">Loading note…</p>
        )}
        <button onClick={onBack} className="mt-4 text-sm text-emerald-700 underline">
          ← All notes
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <button onClick={onBack} className="text-sm text-emerald-700 underline hover:text-emerald-900">
        ← All notes
      </button>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {note.pinned && (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                  Pinned
                </span>
              )}
              <h1 className="text-2xl font-bold text-slate-900">{note.title}</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              by <span className="font-medium text-slate-700">{note.author}</span> · created{" "}
              {new Date(note.created_at).toLocaleString()} · updated {new Date(note.updated_at).toLocaleString()}
            </p>
          </div>
        </div>

        {note.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {note.tags.map((t) => (
              <span key={t} className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-800">
                #{t}
              </span>
            ))}
          </div>
        )}

        <p className="mt-6 whitespace-pre-line break-words text-[15px] leading-relaxed text-slate-800">{note.content}</p>

        {isAuthor && !editing && (
          <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              onClick={togglePin}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {note.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={() => {
                setEditing(true);
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Edit
            </button>
            <button
              onClick={remove}
              className="ml-auto rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
        {!isAuthor && !session && (
          <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">Sign in to write your own notes.</p>
        )}
      </div>

      {editing && session && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Edit note</h2>
          <NoteEditor
            key={note.id}
            initialTitle={note.title}
            initialContent={note.content}
            initialTags={note.tags}
            initialPinned={note.pinned}
            submitLabel="Save changes"
            onSubmit={submitEdit}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
