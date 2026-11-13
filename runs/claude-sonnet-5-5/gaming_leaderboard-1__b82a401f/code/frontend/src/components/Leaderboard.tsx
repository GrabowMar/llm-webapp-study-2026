import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDate, LeaderboardItem, Period } from "../api";

const tabs: { id: Period; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "week", label: "This week" },
  { id: "today", label: "Today" },
];

const medal = ["bg-amber-100", "bg-slate-100", "bg-orange-100"];

export default function Leaderboard({
  username,
  refreshKey,
}: {
  username: string | null;
  refreshKey: number;
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, limit: "50" });
      if (query) params.set("player", query);
      const res = await api<{ items: LeaderboardItem[]; total: number }>(
        `/leaderboard?${params}`,
      );
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [period, query]);

  useEffect(() => {
    load();
  }, [load, refreshKey, tick]);

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={period === t.id}
              onClick={() => setPeriod(t.id)}
              className={`rounded px-3 py-1 text-sm font-medium ${
                period === t.id
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search players"
          placeholder="Search players"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2 pr-2">Rank</th>
            <th className="py-2 pr-2">Player</th>
            <th className="py-2 pr-2 text-right">Score</th>
            <th className="py-2 pl-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const me = username !== null && it.player.toLowerCase() === username.toLowerCase();
            const top = it.rank <= 3;
            return (
              <tr
                key={it.player}
                data-top={top ? "true" : undefined}
                data-me={me ? "true" : undefined}
                className={`border-b border-slate-100 ${
                  me ? "bg-indigo-100 font-semibold" : top ? medal[it.rank - 1] : ""
                }`}
              >
                <td className="py-2 pr-2">
                  {top ? <span aria-label={`Top ${it.rank}`}>🏆 {it.rank}</span> : it.rank}
                </td>
                <td className="py-2 pr-2">
                  {it.player}
                  {me && <span className="ml-2 text-xs text-indigo-700">(you)</span>}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{it.score}</td>
                <td className="py-2 pl-2 text-slate-500">{formatDate(it.achieved_at)}</td>
              </tr>
            );
          })}
          {items.length === 0 && !loading && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-slate-400">
                No scores yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">
        {total} player{total === 1 ? "" : "s"}
      </p>
    </section>
  );
}
