import { useState } from "react";
import { clearSession, getStoredUsername, getToken, setSession } from "./api";
import Auth from "./components/Auth";
import TodoApp from "./components/TodoApp";

export default function App() {
  const [token, setToken] = useState<string | null>(getToken());
  const [username, setUsername] = useState<string | null>(getStoredUsername());

  function handleSignedIn(newToken: string, newUsername: string) {
    setSession(newToken, newUsername);
    setToken(newToken);
    setUsername(newUsername);
  }

  function handleSignOut() {
    clearSession();
    setToken(null);
    setUsername(null);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-bold text-slate-800">Todos</h1>
          {token && username && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-medium text-slate-800">{username}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {token ? <TodoApp /> : <Auth onSignedIn={handleSignedIn} />}
      </main>
    </div>
  );
}
