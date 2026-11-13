import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createNote, listNotes, type NoteItem } from "../api";

function formatDate(iso: string): string {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function NotesPage() {
  const [notes, setNotes] = useState<NoteItem[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const data = await listNotes();
      setNotes(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onNew = async () => {
    setCreating(true);
    try {
      const note = await createNote();
      navigate(`/notes/${note.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Your notes</h1>
        <button
          onClick={onNew}
          disabled={creating}
          className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "Creating…" : "New note"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {notes === null ? (
        <p className="text-slate-500">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-slate-500">No notes yet. Create your first note.</p>
      ) : (
        <ul className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-medium text-slate-900 truncate">
                    {note.title || "Untitled"}
                  </span>
                  {note.published && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5">
                      Published
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0 ml-4">
                  {formatDate(note.updated_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
