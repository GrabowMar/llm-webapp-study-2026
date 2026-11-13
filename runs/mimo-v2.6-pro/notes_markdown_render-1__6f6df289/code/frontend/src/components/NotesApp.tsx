import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createNote,
  getNote,
  listNotes,
} from "../api";
import type { Note, NoteSummary } from "../types";
import Editor from "./Editor";

interface Props {
  username: string;
  onSignOut: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function NotesApp({ username, onSignOut }: Props) {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setNotes(await listNotes());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [onSignOut]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            Markdown Notes
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-medium text-slate-900">{username}</span>
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        </div>
      )}

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-72">
          <button
            type="button"
            onClick={() => run(async () => {
              const note = await createNote();
              setSelected(note);
              await refresh();
            })}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            + New note
          </button>
          <ul className="mt-4 space-y-2">
            {loading && (
              <li className="px-1 py-2 text-sm text-slate-500">Loading notes…</li>
            )}
            {!loading && notes.length === 0 && (
              <li className="px-1 py-2 text-sm text-slate-500">
                No notes yet. Create your first one.
              </li>
            )}
            {notes.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      const note = await getNote(item.id);
                      setSelected(note);
                    })
                  }
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    selected?.id === item.id
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {item.title || (
                        <span className="italic text-slate-400">Untitled note</span>
                      )}
                    </span>
                    {item.published && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Published
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(item.updated_at)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="min-w-0 flex-1">
          {selected ? (
            <Editor
              key={selected.id}
              note={selected}
              onSaved={(note) => {
                setSelected(note);
                refresh();
              }}
              onDeleted={() => {
                setSelected(null);
                refresh();
              }}
              onSignOut={onSignOut}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60">
              <p className="text-sm text-slate-500">
                Select a note or create a new one to start writing.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
