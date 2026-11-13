import { useCallback, useEffect, useState } from "react";
import { setToken, getToken } from "./api";
import AuthForm from "./components/AuthForm";
import LinkList from "./components/LinkList";
import ShortenForm from "./components/ShortenForm";

const USER_KEY = "urlshortener.username";

export default function App() {
  const [username, setUsername] = useState<string | null>(
    () => (getToken() ? localStorage.getItem(USER_KEY) : null)
  );
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!getToken()) localStorage.removeItem(USER_KEY);
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  function signOut() {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUsername(null);
  }

  function signedIn(name: string) {
    localStorage.setItem(USER_KEY, name);
    setUsername(name);
  }

  if (!username) {
    return (
      <main className="min-h-screen bg-slate-100 px-4">
        <div className="mx-auto max-w-2xl py-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Link Shorty</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in or create an account to shorten long addresses.
          </p>
        </div>
        <AuthForm onSignedIn={signedIn} />
      </main>
    );
  }

  const isAdmin = username === "admin";

  return (
    <main className="min-h-screen bg-slate-100 px-4 pb-16">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between py-6">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Link Shorty</h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-slate-700">{username}</span>
            {isAdmin && (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                admin
              </span>
            )}
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="space-y-6">
          <ShortenForm onCreated={refresh} />
          <LinkList
            username={username}
            isAdmin={isAdmin}
            refreshKey={refreshKey}
            onChanged={refresh}
          />
        </div>
      </div>
    </main>
  );
}
