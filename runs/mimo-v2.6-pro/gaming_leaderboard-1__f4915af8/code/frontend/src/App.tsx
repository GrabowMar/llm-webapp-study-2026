import { useCallback, useEffect, useState } from "react";
import { api, clearAuth, loadAuth, saveAuth } from "./api";
import AdminPanel from "./components/AdminPanel";
import AuthPanel from "./components/AuthPanel";
import Header from "./components/Header";
import Leaderboard from "./components/Leaderboard";
import ScorePanel from "./components/ScorePanel";
import type { LeaderboardItem, Period } from "./types";

interface Auth {
  token: string;
  username: string;
}

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(() => loadAuth());
  const [period, setPeriod] = useState<Period>("all");
  const [appliedPlayer, setAppliedPlayer] = useState("");
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .leaderboard({ period, player: appliedPlayer, limit: 50 })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, appliedPlayer, refreshKey]);

  const refreshLeaderboard = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const handleSignedIn = useCallback((token: string, username: string) => {
    saveAuth(token, username);
    setAuth({ token, username });
  }, []);

  const handleSignOut = useCallback(() => {
    clearAuth();
    setAuth(null);
    refreshLeaderboard();
  }, [refreshLeaderboard]);

  const handleUnauthorized = useCallback(() => {
    clearAuth();
    setAuth(null);
  }, []);

  const handleSearch = useCallback((player: string) => {
    setAppliedPlayer(player);
  }, []);

  const isAdmin = auth?.username === "admin";

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        username={auth?.username ?? null}
        isAdmin={isAdmin}
        onSignOut={handleSignOut}
      />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {!auth && (
          <AuthPanel onSignedIn={handleSignedIn} />
        )}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Leaderboard</h2>
          <Leaderboard
            items={items}
            total={total}
            loading={loading}
            error={error}
            period={period}
            playerQuery={appliedPlayer}
            onPeriodChange={setPeriod}
            onSearch={handleSearch}
            onRefresh={refreshLeaderboard}
            username={auth?.username ?? null}
          />
        </section>
        {auth && (
          <ScorePanel
            token={auth.token}
            onScoreSubmitted={refreshLeaderboard}
            onUnauthorized={handleUnauthorized}
          />
        )}
        {auth && isAdmin && (
          <AdminPanel token={auth.token} onUnauthorized={handleUnauthorized} />
        )}
      </main>
    </div>
  );
}
