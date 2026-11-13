import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, formatDate, formatScore, type LeaderboardItem, type Period } from "../api";

interface Props {
  currentUser: string | null;
  refreshKey: number;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All-time" },
  { value: "week", label: "This week" },
  { value: "day", label: "Today" },
];

const MEDALS: Record<number, { badge: string; row: string; label: string }> = {
  1: { badge: "bg-amber-400 text-amber-950", row: "bg-amber-400/10", label: "Gold" },
  2: { badge: "bg-slate-300 text-slate-900", row: "bg-slate-300/10", label: "Silver" },
  3: { badge: "bg-orange-600 text-orange-50", row: "bg-orange-600/10", label: "Bronze" },
};

const LIMIT = 50;

export default function Leaderboard({ currentUser, refreshKey }: Props) {
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.leaderboard(period, LIMIT, query);
      if (id !== requestId.current) return;
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof ApiError ? err.message : "Could not load leaderboard");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [period, query]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 shadow-lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white">Leaderboard</h2>
        <div className="flex gap-1 rounded-lg bg-slate-900 p-1" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                period === p.value ? "bg-indigo-500 text-white shadow" : "text-slate-300 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex gap-2">
        <input
          type="search"
          placeholder="Search player…"
          aria-label="Search player"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setQuery(search);
          }}
          className="flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
        />
        <button
          type="button"
          onClick={() => {
            if (query !== search) setQuery(search);
            else void load();
          }}
          disabled={loading}
          className="rounded-md border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-600 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 w-16">Rank</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right">Date</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                  No scores yet for this period.
                </td>
              </tr>
            )}
            {items.map((item) => {
              const medal = MEDALS[item.rank];
              const isMe = currentUser !== null && item.player === currentUser;
              return (
                <tr
                  key={item.player}
                  data-rank={item.rank}
                  aria-current={isMe ? "true" : undefined}
                  className={`border-b border-slate-700/60 ${
                    isMe ? "bg-indigo-500/25 ring-2 ring-inset ring-indigo-400" : medal ? medal.row : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    {medal ? (
                      <span
                        title={medal.label}
                        aria-label={`${medal.label}, rank ${item.rank}`}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${medal.badge}`}
                      >
                        {item.rank}
                      </span>
                    ) : (
                      <span className="inline-flex h-7 w-7 items-center justify-center text-slate-300">
                        {item.rank}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-100">
                    {item.player}
                    {isMe && (
                      <span className="ml-2 rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-100">{formatScore(item.score)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{formatDate(item.achieved_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {total} player{total === 1 ? "" : "s"}
        {total > items.length ? ` · showing top ${items.length}` : ""}
      </p>
    </section>
  );
}
