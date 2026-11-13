import { useCallback, useEffect, useState } from "react";
import AuthForm from "./AuthForm";
import TodoList from "./TodoList";
import { api, loadSession, onUnauthorized, saveSession, type Session } from "./api";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  useEffect(() => {
    onUnauthorized(signOut);
    return () => onUnauthorized(null);
  }, [signOut]);

  function handleSignedIn(next: Session) {
    saveSession(next);
    setSession(next);
  }

  async function handleSignOut() {
    await api.logout().catch(() => undefined);
    signOut();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {session ? (
        <>
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
              <h1 className="text-lg font-semibold">Todos</h1>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">
                  Signed in as <strong data-testid="current-user" className="font-semibold text-slate-900">{session.username}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-6">
            <TodoList key={session.token} />
          </main>
        </>
      ) : (
        <main className="px-4">
          <AuthForm onSignedIn={handleSignedIn} />
        </main>
      )}
    </div>
  );
}
