import { useCallback, useEffect, useState } from "react";
import {
  api,
  clearSession,
  getUsername,
  setUnauthorizedHandler,
  type NoteFilters,
  type TagCount,
} from "./api";
import AuthPage from "./pages/AuthPage";
import NoteDetailPage from "./pages/NoteDetailPage";
import NoteFormPage from "./pages/NoteFormPage";
import NotesListPage from "./pages/NotesListPage";

type View =
  | { name: "list" }
  | { name: "note"; id: number }
  | { name: "create" }
  | { name: "edit"; id: number }
  | { name: "auth" };

const initialFilters: NoteFilters = { q: "", author: "", tag: "", page: 1, page_size: 10 };

export default function App() {
  const [username, setUsername] = useState<string | null>(() => getUsername());
  const [view, setView] = useState<View>({ name: "list" });
  const [filters, setFilters] = useState<NoteFilters>(initialFilters);
  const [tags, setTags] = useState<TagCount[]>([]);

  const refreshTags = useCallback(() => {
    api
      .listTags()
      .then((res) => setTags(res.items))
      .catch(() => setTags([]));
  }, []);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUsername(null);
      setView({ name: "list" });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const changeFilters = useCallback((patch: Partial<NoteFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  function goList(patch: Partial<NoteFilters> = {}) {
    setFilters((current) => ({ ...current, ...patch }));
    setView({ name: "list" });
  }

  function signOut() {
    clearSession();
    setUsername(null);
    setView({ name: "list" });
  }

  function afterChange() {
    refreshTags();
  }

  const pageTitle =
    view.name === "create"
      ? "New note"
      : view.name === "edit"
        ? "Edit note"
        : view.name === "note"
          ? "Note"
          : view.name === "auth"
            ? "Account"
            : "Notes";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <button
            type="button"
            onClick={() => goList()}
            className="flex items-center gap-2 text-lg font-bold text-slate-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              N
            </span>
            Tagged Notes
          </button>

          <div className="flex items-center gap-3">
            {username ? (
              <>
                <button
                  type="button"
                  onClick={() => setView({ name: "create" })}
                  className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  New note
                </button>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  Signed in as <span className="font-semibold">{username}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setView({ name: "auth" })}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="sr-only">{pageTitle}</h2>
        {view.name === "auth" && (
          <AuthPage
            onAuthed={(name) => {
              setUsername(name);
              goList();
            }}
          />
        )}
        {view.name === "list" && (
          <NotesListPage
            filters={filters}
            onFiltersChange={changeFilters}
            tags={tags}
            onOpenNote={(id) => setView({ name: "note", id })}
          />
        )}
        {view.name === "note" && (
          <NoteDetailPage
            noteId={view.id}
            username={username}
            onBack={() => goList()}
            onEdit={(id) => setView({ name: "edit", id })}
            onChanged={afterChange}
          />
        )}
        {(view.name === "create" || view.name === "edit") && (
          <NoteFormPage
            noteId={view.name === "edit" ? view.id : null}
            onCancel={() => goList()}
            onSaved={(note) => {
              afterChange();
              setView({ name: "note", id: note.id });
            }}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        Tagged Notes — public notes with tags
      </footer>
    </div>
  );
}
