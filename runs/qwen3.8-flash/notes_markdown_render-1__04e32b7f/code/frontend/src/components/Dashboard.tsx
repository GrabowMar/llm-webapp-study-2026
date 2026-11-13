import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import NoteEditor from "./NoteEditor";
import NoteList from "./NoteList";
import type { Note, NoteSummary } from "../types";

export default function Dashboard() {
  const { username, signOut } = useAuth();
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async (selectId?: number) => {
    try {
      const { items } = await api.listNotes();
      setNotes(items);
      if (selectId !== undefined) {
        setSelected(await api.getNote(selectId));
      } else if (items.length === 0) {
        setSelected(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notes");
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openNote(id: number) {
    try {
      setSelected(await api.getNote(id));
    } catch {
      /* ignore */
    }
  }

  function handleChange(updated: Note) {
    setSelected(updated);
    setNotes((prev) => {
      const rest = prev.filter((n) => n.id !== updated.id);
      const summary: NoteSummary = {
        id: updated.id,
        title: updated.title,
        published: updated.published,
        updated_at: updated.updated_at,
        author: updated.author,
      };
      return [summary, ...rest].sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      );
    });
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteNote(id);
    } catch {
      /* ignore */
    }
    if (selected?.id === id) setSelected(null);
    await loadList();
  }

  async function handleNew() {
    try {
      const note = await api.createNote({ title: "", body: "" });
      await loadList(note.id);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold text-slate-900">Markdown Notes</h1>
          <span className="text-sm text-slate-500">Signed in as {username}</span>
        </div>
        <button
          onClick={() => void signOut()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </header>
      {error && (
        <div className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}
      <main className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-hidden border-r border-slate-200 bg-white md:w-80">
          <NoteList
            notes={notes}
            selectedId={selected?.id ?? null}
            onSelect={openNote}
            onNew={handleNew}
          />
        </aside>
        <section className="min-w-0 flex-1 bg-white">
          <NoteEditor note={selected} onChange={handleChange} onDelete={handleDelete} />
        </section>
      </main>
    </div>
  );
}
