import { useCallback, useEffect, useState } from "react";
import { getToken, setToken, setUnauthorizedHandler } from "./api";
import AdminPanel from "./components/AdminPanel";
import AuthForms from "./components/AuthForms";
import Leaderboard from "./components/Leaderboard";
import ScorePanel from "./components/ScorePanel";

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? localStorage.getItem("username") : null,
  );
  const [refreshKey, setRefreshKey] = useState(0);

  const signOut = useCallback(() => {
    setToken(null);
    localStorage.removeItem("username");
    setUsername(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
  }, [signOut]);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);
  const isAdmin = username?.toLowerCase() === "admin";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-indigo-700 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Game Leaderboard</h1>
          {username && (
            <div className="flex items-center gap-3 text-sm">
              <span>
                Signed in as <strong data-testid="current-user">{username}</strong>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded bg-white/20 px-3 py-1 hover:bg-white/30"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Leaderboard username={username} refreshKey={refreshKey} />
          {isAdmin && <AdminPanel refreshKey={refreshKey} onChanged={bump} />}
        </div>
        <div className="space-y-6">
          {username ? (
            <ScorePanel refreshKey={refreshKey} onSubmitted={bump} />
          ) : (
            <AuthForms
              onSignedIn={(name, token) => {
                setToken(token);
                localStorage.setItem("username", name);
                setUsername(name);
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
