import { useCallback, useEffect, useState } from "react";
import AdminPanel from "./AdminPanel";
import Auth from "./Auth";
import Leaderboard from "./Leaderboard";
import MyScores from "./MyScores";
import ScoreForm from "./ScoreForm";
import { getLeaderboard, getToken, setToken } from "./api";
import type { LeaderboardEntry } from "./api";

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [items, setItems] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [myScoresKey, setMyScoresKey] = useState(0);

  const refreshLeaderboard = useCallback(async () => {
    setLoading(true);
    setLeaderboardError(null);
    try {
      const res = await getLeaderboard({ period: "all_time", limit: 100 });
      setItems(res.items);
    } catch (err) {
      setLeaderboardError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (username) refreshLeaderboard();
  }, [username, refreshLeaderboard]);

  function handleAuthed(name: string) {
    setUsername(name);
    refreshLeaderboard();
  }

  function handleSignOut() {
    setToken(null);
    setUsername(null);
    setItems([]);
  }

  function handleScoreSubmitted() {
    refreshLeaderboard();
    setMyScoresKey((k) => k + 1);
  }

  if (!username) {
    return (
      <div className="min-h-screen bg-slate-100 px-4">
        <Auth onAuthed={handleAuthed} />
      </div>
    );
  }

  const isAdmin = username === "admin";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-slate-800">
            Game Leaderboard
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">
              {username}
              {isAdmin && (
                <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700">
                  admin
                </span>
              )}
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {leaderboardError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {leaderboardError}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Leaderboard
              items={items}
              currentUser={username}
              onRefresh={refreshLeaderboard}
              loading={loading}
            />
          </div>

          <div className="space-y-6">
            <ScoreForm onSubmit={handleScoreSubmitted} />
            <MyScores refreshKey={myScoresKey} />
            {isAdmin && <AdminPanel />}
          </div>
        </div>
      </main>
    </div>
  );
}
