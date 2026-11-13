import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, setToken, type Session } from "./api";
import AdminSection from "./components/AdminSection";
import AuthForm from "./components/AuthForm";
import Leaderboard from "./components/Leaderboard";
import ScoreSection from "./components/ScoreSection";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiGet<Session>("/api/auth/me")
      .then((value) => {
        if (!cancelled) setSession(value);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
        }
        setSession(null);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignedIn = useCallback(async () => {
    try {
      const value = await apiGet<Session>("/api/auth/me");
      setSession(value);
      setRefreshKey((key) => key + 1);
    } catch {
      setToken(null);
      setSession(null);
    }
  }, []);

  const bumpRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  function signOut() {
    setToken(null);
    setSession(null);
    setRefreshKey((key) => key + 1);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">Game Leaderboard</h1>
          {session && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">
                  {session.username}
                </span>
                {session.isAdmin && (
                  <span className="ml-2 rounded bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                    Admin
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {booting ? (
          <p className="py-10 text-center text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="md:col-span-2">
                <Leaderboard
                  username={session?.username ?? null}
                  refreshKey={refreshKey}
                />
              </div>
              <div className="space-y-6">
                {!session && <AuthForm onSignedIn={handleSignedIn} />}
                <ScoreSection
                  signedIn={session !== null}
                  refreshKey={refreshKey}
                  onScoreSubmitted={bumpRefresh}
                />
              </div>
            </div>

            {session?.isAdmin && (
              <div className="mt-6">
                <AdminSection onScoresChanged={bumpRefresh} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
