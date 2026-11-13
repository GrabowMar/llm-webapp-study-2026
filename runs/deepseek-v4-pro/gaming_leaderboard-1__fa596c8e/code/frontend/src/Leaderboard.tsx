import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "./api";

type Period = "all_time" | "week" | "today";

const PERIOD_LABELS: Record<Period, string> = {
  all_time: "All time",
  week: "This week",
  today: "Today",
};

const MEDALS = ["", "bg-amber-300/90", "bg-slate-300/80", "bg-amber-700/40"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function Leaderboard({
  items,
  currentUser,
  onRefresh,
  loading,
}: {
  items: LeaderboardEntry[];
  currentUser: string | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [period, setPeriod] = useState<Period>("all_time");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState<number>(50);
  const [filtered, setFiltered] = useState<LeaderboardEntry[]>(items);

  useEffect(() => {
    const s = search.trim().toLowerCase();
    if (!s) {
      setFiltered(items);
    } else {
      setFiltered(items.filter((i) => i.player.toLowerCase().includes(s)));
    }
  }, [items, search]);

  const visible = filtered.slice(0, limit);

  return (
    <section className="rounded-xl bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-800">Leaderboard</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                period === p
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player..."
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Rank</th>
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => {
              const isMe = currentUser === entry.player;
              const medal = MEDALS[entry.rank] ?? "";
              return (
                <tr
                  key={`${entry.player}-${entry.rank}`}
                  className={`border-b border-slate-100 ${
                    medal || ""
                  } ${isMe ? "bg-indigo-50 font-semibold text-indigo-900" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        entry.rank <= 3
                          ? "bg-white/70 text-slate-800"
                          : "text-slate-600"
                      }`}
                    >
                      {entry.rank}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {entry.player}
                    {isMe && (
                      <span className="ml-2 text-xs font-normal text-indigo-500">
                        (you)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{entry.score}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {formatDate(entry.achieved_at)}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No scores yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
