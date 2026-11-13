import { useState } from "react";
import AdminPanel from "./components/AdminPanel";
import AuthPanel from "./components/AuthPanel";
import LinksPanel from "./components/LinksPanel";
import ShortenForm from "./components/ShortenForm";

const TOKEN_KEY = "url-shortener.token";
const USERNAME_KEY = "url-shortener.username";

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem(USERNAME_KEY),
  );
  const [linksVersion, setLinksVersion] = useState(0);

  const handleSignedIn = (newToken: string, newUsername: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USERNAME_KEY, newUsername);
    setToken(newToken);
    setUsername(newUsername);
  };

  const handleSignOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setToken(null);
    setUsername(null);
  };

  const bumpLinks = () => setLinksVersion((v) => v + 1);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">
            <span className="text-indigo-600">URL</span> Shortener
          </h1>
          {token && username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">{username}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-500">Not signed in</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {!token || !username ? (
          <AuthPanel onSignedIn={handleSignedIn} />
        ) : (
          <ShortenForm token={token} onCreated={bumpLinks} />
        )}

        {token && username === "admin" ? (
          <AdminPanel token={token} version={linksVersion} />
        ) : null}

        <LinksPanel
          token={token}
          username={username}
          version={linksVersion}
          onChanged={bumpLinks}
        />

        <footer className="pb-4 text-center text-xs text-slate-400">
          Follow a short link at <code className="font-mono">/r/&lt;code&gt;</code>{" "}
          &mdash; it redirects and counts the click.
        </footer>
      </main>
    </div>
  );
}
