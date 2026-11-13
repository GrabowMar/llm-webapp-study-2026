import { useState, type FormEvent } from "react";
import { formatDate, formatScore } from "../format";
import type { LeaderboardItem, Period } from "../types";

interface LeaderboardProps {
  items: LeaderboardItem[];
  total: number;
  loading: boolean;
  error: string | null;
  period: Period;
  playerQuery: string;
  onPeriodChange: (period: Period) => void;
  onSearch: (player: string) => void;
  onRefresh: () => void;
  username: string | null;
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "all", label: "All-time" },
];

const MEDAL_STYLES = [
  "bg-amber-400 text-amber-950",
  "bg-slate-300 text-slate-800",
  "bg-orange-300 text-orange-950",
];

export default function Leaderboard({
  items,
  total,
  loading,
  error,
  period,
  playerQuery,
  onPeriodChange,
  onSearch,
  onRefresh,
  username,
}: LeaderboardProps) {
  const [search, setSearch] = useState(playerQuery);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    onSearch(search.trim());
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onPeriodChange(entry.id)}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition ${
                period === entry.id
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search player…"
              aria-label="Search player"
              className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              Search
            </button>
          </form>
          <button
            type="button"
            onClick={onRefresh}
            className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Rank</th>
              <th className="px-4 py-3 font-semibold">Player</th>
              <th className="px-4 py-3 font-semibold">Score</th>
              <th className="px-4 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const isMe = username !== null && item.player === username;
              return (
                <tr
                  key={item.player}
                  className={isMe ? "bg-indigo-50" : "hover:bg-slate-50"}
                >
                  <td className="px-4 py-3">
                    {item.rank <= 3 ? (
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                          MEDAL_STYLES[item.rank - 1]
                        }`}
                      >
                        {item.rank}
                      </span>
                    ) : (
                      <span className="inline-flex h-7 w-7 items-center justify-center text-sm font-semibold text-slate-500">
                        {item.rank}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.player}
                    {isMe && (
                      <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {formatScore(item.score)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(item.achieved_at)}
                  </td>
                </tr>
              );
            })}
            {!loading && !error && items.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-slate-400"
                >
                  No scores yet for this period.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {error && (
          <p className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Showing {items.length} of {total} ranked player{total === 1 ? "" : "s"}
      </p>
    </section>
  );
}
