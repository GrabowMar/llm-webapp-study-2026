import { useCallback, useEffect, useState } from "react";
import AuthForm from "./AuthForm";
import NoteListView from "./NoteListView";
import NotePage from "./NotePage";
import { api } from "./api";
import type { Session } from "./api";

type View = { kind: "list" } | { kind: "auth" } | { kind: "note"; id: number };

function parseHash(): View {
  const m = window.location.hash.match(/^#\/notes\/(\d+)$/);
  if (m) return { kind: "note", id: Number(m[1]) };
  if (window.location.hash === "#/signin") return { kind: "auth" };
  return { kind: "list" };
}

export default function App() {
  const [view, setView] = useState<View>(parseHash);
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [authors, setAuthors] = useState<string[]>([]);

  useEffect(() => {
    api
      .listNotes({})
      .then((r) => setAuthors([...new Set(r.items.map((n) => n.author))].sort()))
      .catch(() => undefined);
  }, [view]);

  useEffect(() => {
    const stored = localStorage.getItem("notes.session");
    if (!stored) {
      setRestoring(false);
      return;
    }
    let parsed: Session;
    try {
      parsed = JSON.parse(stored);
    } catch {
      localStorage.removeItem("notes.session");
      setRestoring(false);
      return;
    }
    api
      .me(parsed.token)
      .then((r) => setSession({ token: parsed.token, username: r.username }))
      .catch(() => localStorage.removeItem("notes.session"))
      .finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setView(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const go = useCallback((hash: string) => {
    if (window.location.hash === hash) setView(parseHash());
    else window.location.hash = hash;
  }, []);

  const saveSession = useCallback(
    (s: Session | null) => {
      setSession(s);
      if (s) {
        localStorage.setItem("notes.session", JSON.stringify(s));
        go("#/");
      } else {
        localStorage.removeItem("notes.session");
      }
    },
    [go],
  );

  const signOut = () => {
    if (session) api.logout(session.token).catch(() => undefined);
    saveSession(null);
    go("#/");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <button
            onClick={() => go("#/")}
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-emerald-700 hover:text-emerald-900"
          >
            <span aria-hidden>📌</span> Tagged Notes
          </button>
          <div className="flex items-center gap-3 text-sm">
            {restoring ? (
              <span className="text-slate-400">Checking session…</span>
            ) : session ? (
              <>
                <span className="hidden text-slate-600 sm:inline">
                  Signed in as <span className="font-semibold text-slate-900">{session.username}</span>
                </span>
                <button
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Sign out
                </button>
              </>
            ) : view.kind === "auth" ? (
              <button
                onClick={() => go("#/")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Browse notes
              </button>
            ) : (
              <button
                onClick={() => go("#/signin")}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-700"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {restoring ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : view.kind === "note" ? (
          <NotePage
            id={view.id}
            session={session}
            onBack={() => go("#/")}
            onDeleted={() => go("#/")}
            onUnauthorised={() => saveSession(null)}
          />
        ) : view.kind === "auth" ? (
          <AuthForm onSession={saveSession} authors={authors} />
        ) : (
          <NoteListView
            session={session}
            onOpenNote={(id) => go(`#/notes/${id}`)}
            onUnauthorised={() => saveSession(null)}
          />
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
        Notes are public to read; only their authors can change or delete them.
      </footer>
    </div>
  );
}
