import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, type Score, type User } from "./api";
import AdminPanel from "./components/AdminPanel";
import AuthPanel from "./components/AuthPanel";
import Leaderboard from "./components/Leaderboard";
import PlayerPanel from "./components/PlayerPanel";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(() => getToken() !== null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [myScores, setMyScores] = useState<Score[]>([]);
  const [bestScore, setBestScore] = useState<number | null>(null);

  const signOutLocal = useCallback(() => {
    setToken(null);
    setUser(null);
    setMyScores([]);
    setBestScore(null);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(setUser)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) signOutLocal();
      })
      .finally(() => setChecking(false));
  }, [signOutLocal]);

  const loadMyScores = useCallback(async () => {
    try {
      const res = await api.myScores();
      setMyScores(res.items);
      setBestScore(res.best_score);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signOutLocal();
    }
  }, [signOutLocal]);

  useEffect(() => {
    if (user) void loadMyScores();
  }, [user, loadMyScores]);

  const refreshAll = useCallback(() => {
    setRefreshKey((k) => k + 1);
    if (user) void loadMyScores();
  }, [user, loadMyScores]);

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    signOutLocal();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            <span className="text-indigo-400">▲</span> Game Leaderboard
          </h1>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300">
                Signed in as <strong className="text-white" data-testid="current-user">{user.username}</strong>
                {user.is_admin && (
                  <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-950">
                    Admin
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Leaderboard currentUser={user?.username ?? null} refreshKey={refreshKey} />
          {user?.is_admin && <AdminPanel onChanged={refreshAll} onUnauthorized={signOutLocal} />}
        </div>
        <aside>
          {checking ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : user ? (
            <PlayerPanel
              scores={myScores}
              bestScore={bestScore}
              onSubmitted={refreshAll}
              onUnauthorized={signOutLocal}
            />
          ) : (
            <AuthPanel
              onSignedIn={(token, u) => {
                setToken(token);
                setUser(u);
              }}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
