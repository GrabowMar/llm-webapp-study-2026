import { useCallback, useEffect, useState } from "react";
import { api, NoteSummary } from "./api";
import Editor from "./Editor";
import { primaryBtn } from "./ui";

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setNotes(await api.listNotes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    setError("");
    try {
      const note = await api.createNote("Untitled", "");
      await refresh();
      setSelected(note.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="flex max-h-60 w-full shrink-0 flex-col border-b border-slate-200 bg-white md:max-h-none md:w-72 md:border-b-0 md:border-r">
        <div className="p-3">
          <button className={`${primaryBtn} w-full`} onClick={create}>
            New note
          </button>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto" aria-label="Notes">
          {notes.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">No notes yet.</li>
          )}
          {notes.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => setSelected(n.id)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                  n.id === selected ? "bg-indigo-50" : ""
                }`}
              >
                <span className="truncate">{n.title || "Untitled"}</span>
                {n.published && (
                  <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Published
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {selected === null ? (
          <p className="p-6 text-slate-500">Select or create a note.</p>
        ) : (
          <Editor
            key={selected}
            id={selected}
            onChanged={refresh}
            onDeleted={() => {
              setSelected(null);
              refresh();
            }}
          />
        )}
      </section>
    </div>
  );
}
