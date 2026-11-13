import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type NoteSummary } from "./api";
import { Badge, ErrorBanner, Spinner, formatDate } from "./components";

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api
      .listNotes()
      .then((data) => {
        if (!cancelled) setNotes(data.items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load notes");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createNote() {
    setCreating(true);
    setError("");
    try {
      const note = await api.createNote({ title: "Untitled note", body: "" });
      navigate(`/notes/${note.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create note");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your notes</h1>
          <p className="mt-1 text-sm text-slate-500">
            {notes === null
              ? "Loading your notes…"
              : `${notes.length} note${notes.length === 1 ? "" : "s"}, most recently updated first.`}
          </p>
        </div>
        <button
          type="button"
          onClick={createNote}
          disabled={creating}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? "Creating…" : "New note"}
        </button>
      </div>

      <ErrorBanner>{error}</ErrorBanner>

      {notes === null ? (
        <Spinner label="Loading notes…" />
      ) : notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <h2 className="text-lg font-medium text-slate-800">No notes yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Create your first note, write it in Markdown, and publish it when it
            is ready to share.
          </p>
          <button
            type="button"
            onClick={createNote}
            disabled={creating}
            className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            Write a note
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">
                      {note.title || "Untitled note"}
                    </span>
                    <Badge published={note.published} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Updated {formatDate(note.updated_at)}
                  </p>
                </div>
                <span className="text-slate-400">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
