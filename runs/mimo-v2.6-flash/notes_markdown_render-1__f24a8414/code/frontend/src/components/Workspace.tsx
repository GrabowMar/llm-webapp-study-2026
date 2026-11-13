import { useCallback, useEffect, useState } from "react";
import { ApiError, Note, NoteMeta, api, clearSession, formatDate } from "../api";
import Editor from "./Editor";

type Props = {
  user: string;
  onSignOut: () => void;
};

function selectedFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get("note");
  if (raw === null) {
    return null;
  }
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function Workspace({ user, onSignOut }: Props) {
  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(() => selectedFromUrl());

  const handleUnauthorized = useCallback(() => {
    clearSession();
    onSignOut();
  }, [onSignOut]);

  const load = useCallback(async () => {
    setError(null);
    setNotes(null);
    try {
      const res = await api<{ items: NoteMeta[] }>("/api/notes");
      setNotes(res.items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load notes.");
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  function select(id: number | null) {
    setSelectedId(id);
    window.history.replaceState({}, "", id === null ? "/" : `/?note=${id}`);
  }

  async function createNote() {
    try {
      const note = await api<Note>("/api/notes", {
        method: "POST",
        body: { title: "", body: "" },
      });
      setNotes((prev) => [note, ...(prev ?? [])]);
      select(note.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not create note.");
    }
  }

  function handleUpdated(updated: NoteMeta) {
    setNotes((prev) =>
      prev === null ? prev : prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)),
    );
  }

  function handleDeleted(id: number) {
    const current = notes ?? [];
    const index = current.findIndex((n) => n.id === id);
    const remaining = current.filter((n) => n.id !== id);
    setNotes(remaining);
    const neighbour = remaining[Math.min(index, remaining.length - 1)];
    select(neighbour ? neighbour.id : null);
  }

  const isSelected = selectedId !== null && notes?.some((n) => n.id === selectedId) === true;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900">
      <aside
        className={`${isSelected ? "hidden" : "flex"} w-full shrink-0 flex-col border-r border-slate-200 bg-white sm:flex sm:w-72`}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h1 className="text-base font-semibold tracking-tight">Markdown Notes</h1>
          <p className="mt-0.5 truncate text-xs text-slate-500">Signed in as {user}</p>
        </div>

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => void createNote()}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            New note
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {notes === null && error === null && (
            <p className="px-3 py-2 text-sm text-slate-500">Loading notes…</p>
          )}
          {error && (
            <div className="px-3 py-2">
              <p className="text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Retry
              </button>
            </div>
          )}
          {notes?.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-500">No notes yet. Create one above.</p>
          )}
          {notes?.map((note) => {
            const active = note.id === selectedId;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => select(note.id)}
                className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-indigo-200 bg-indigo-50"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">
                    {note.title.trim() || "Untitled"}
                  </span>
                  {note.published && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      Public
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{formatDate(note.updated_at)}</div>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={onSignOut}
            className="w-full rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main
        className={`${isSelected ? "flex" : "hidden"} min-w-0 flex-1 flex-col sm:flex`}
      >
        {isSelected && selectedId !== null ? (
          <Editor
            key={selectedId}
            noteId={selectedId}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
            onUnauthorized={handleUnauthorized}
            onBack={() => select(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-white p-8 text-center">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-10 w-10 text-slate-300"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
              />
            </svg>
            <h2 className="text-lg font-semibold text-slate-900">
              {notes && notes.length > 0 ? "Select a note" : "No notes yet"}
            </h2>
            <p className="max-w-sm text-sm text-slate-500">
              {notes && notes.length > 0
                ? "Pick a note from the list to start editing, or create a new one."
                : "Create your first note and start writing in Markdown."}
            </p>
            <button
              type="button"
              onClick={() => void createNote()}
              className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              New note
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
