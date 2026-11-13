import { useCallback, useEffect, useState } from "react";
import AdminPanel from "./components/AdminPanel";
import AuthPanel from "./components/AuthPanel";
import Leaderboard from "./components/Leaderboard";
import MyScores from "./components/MyScores";
import ScoreForm from "./components/ScoreForm";
import { api, getToken, setToken } from "./api";
import { errorMessage } from "./lib/format";
import type { LeaderboardResponse, MyScoresResponse, Period, User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [board, setBoard] = useState<LeaderboardResponse>({ items: [], total: 0 });
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [myScores, setMyScores] = useState<MyScoresResponse>({ items: [], best_score: null });

  const loadBoard = useCallback(async (activePeriod: Period, activeSearch: string) => {
    setBoardLoading(true);
    setBoardError(null);
    try {
      const result = await api.leaderboard({ period: activePeriod, player: activeSearch });
      setBoard(result);
    } catch (error) {
      setBoardError(errorMessage(error));
    } finally {
      setBoardLoading(false);
    }
  }, []);

  const loadMyScores = useCallback(async () => {
    try {
      const result = await api.myScores();
      setMyScores(result);
    } catch {
      /* the session may have expired; the header keeps the current state */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getToken()) {
        try {
          const me = await api.me();
          if (!cancelled) {
            setUser(me);
          }
        } catch {
          setToken(null);
        }
      }
      if (!cancelled) {
        setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadBoard(period, appliedSearch);
  }, [loadBoard, period, appliedSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (user) {
      void loadMyScores();
    } else {
      setMyScores({ items: [], best_score: null });
    }
  }, [user, loadMyScores]);

  async function handleSignOut() {
    try {
      await api.logout();
    } catch {
      /* the token is dropped locally either way */
    }
    setToken(null);
    setUser(null);
  }

  function handleScoreSubmitted() {
    void loadBoard(period, appliedSearch);
    void loadMyScores();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(99,102,241,0.18),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Arcade Leaderboard
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Best score wins. All time, this week or today.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {checkingSession ? (
              <span className="text-sm text-slate-500">Checking session…</span>
            ) : user ? (
              <>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2 text-right">
                  <p className="text-sm font-semibold text-slate-100">{user.username}</p>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">
                    {user.is_admin ? "admin" : "player"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-xl border border-slate-700 bg-slate-800/60 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-rose-500/60 hover:text-rose-300"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2 text-sm text-slate-400">
                Not signed in
              </span>
            )}
          </div>
        </header>

        <main className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Leaderboard
              items={board.items}
              total={board.total}
              period={period}
              onPeriodChange={setPeriod}
              search={search}
              onSearchChange={setSearch}
              onRefresh={() => void loadBoard(period, appliedSearch)}
              loading={boardLoading}
              error={boardError}
              currentUsername={user?.username ?? null}
            />

            {user?.is_admin ? (
              <AdminPanel onChanged={() => void loadBoard(period, appliedSearch)} />
            ) : null}
          </div>

          <div className="space-y-6">
            {user ? (
              <>
                <ScoreForm onSubmitted={handleScoreSubmitted} />
                <MyScores data={myScores} onRefresh={() => void loadMyScores()} />
              </>
            ) : (
              <AuthPanel
                onSignedIn={(signedIn) => {
                  setUser(signedIn);
                  void loadBoard(period, appliedSearch);
                }}
              />
            )}
          </div>
        </main>

        <footer className="mt-10 border-t border-slate-800/70 pt-4 text-xs text-slate-600">
          Scores are ranked by each player&apos;s best visible score.
        </footer>
      </div>
    </div>
  );
}
