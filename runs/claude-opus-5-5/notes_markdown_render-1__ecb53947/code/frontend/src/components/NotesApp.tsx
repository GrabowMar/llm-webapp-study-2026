import { useCallback, useEffect, useState } from "react";
import { api, formatDate, type Note, type NoteSummary } from "../api";
import { navigate } from "../router";
import NoteEditor from "./NoteEditor";

type Props = {
  username: string;
  selectedId: number | null;
  onSignOut: () => void;
};

export default function NotesApp({ username, selectedId, onSignOut }: Props) {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { items } = await api.listNotes();
      setNotes(items);
      setError(null);
    } catch {
      setError("Could not load notes.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createNote() {
    setCreating(true);
    try {
      const note = await api.createNote({ title: "Untitled", body: "" });
      setNotes((prev) => [toSummary(note), ...(prev ?? [])]);
      navigate(`/notes/${note.id}`);
    } catch {
      setError("Could not create note.");
    } finally {
      setCreating(false);
    }
  }

  const onChanged = useCallback((note: Note) => {
    setNotes((prev) => {
      const rest = (prev ?? []).filter((n) => n.id !== note.id);
      return [toSummary(note), ...rest].sort((a, b) =>
        a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : b.id - a.id,
      );
    });
  }, []);

  const onDeleted = useCallback((id: number) => {
    setNotes((prev) => (prev ?? []).filter((n) => n.id !== id));
    navigate("/", true);
  }, []);

  const onMissing = useCallback(() => {
    void load();
    navigate("/", true);
  }, [load]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          className="font-semibold text-slate-800 hover:text-indigo-600"
        >
          Markdown Notes
        </a>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">
            Signed in as <strong className="font-medium text-slate-900" data-testid="current-user">{username}</strong>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${selectedId ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 bg-white md:w-72`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">My notes</h2>
            <button
              type="button"
              onClick={createNote}
              disabled={creating}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              New note
            </button>
          </div>
          {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
          <ul className="flex-1 overflow-y-auto" aria-label="Notes">
            {notes === null && !error && <li className="px-4 py-3 text-sm text-slate-400">Loading…</li>}
            {notes?.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">
                No notes yet. Create your first one!
              </li>
            )}
            {notes?.map((n) => (
              <li key={n.id}>
                <a
                  href={`/notes/${n.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/notes/${n.id}`);
                  }}
                  className={`block border-b border-slate-100 px-4 py-3 hover:bg-slate-50 ${
                    n.id === selectedId ? "border-l-4 border-l-indigo-500 bg-indigo-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate font-medium text-slate-800">{n.title || "Untitled"}</span>
                    {n.published && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Published
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{formatDate(n.updated_at)}</div>
                </a>
              </li>
            ))}
          </ul>
        </aside>

        <main className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {selectedId ? (
            <>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="border-b border-slate-200 bg-white px-4 py-2 text-left text-sm text-indigo-600 md:hidden"
              >
                ← All notes
              </button>
              <NoteEditor
                key={selectedId}
                id={selectedId}
                onChanged={onChanged}
                onDeleted={onDeleted}
                onMissing={onMissing}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
              <p>Select a note or create a new one.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function toSummary(n: Note): NoteSummary {
  return { id: n.id, title: n.title, published: n.published, updated_at: n.updated_at };
}
