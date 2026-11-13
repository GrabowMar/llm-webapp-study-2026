import type { LeaderboardItem, Period } from "../types";
import { formatDate, formatNumber } from "../lib/format";

interface Props {
  items: LeaderboardItem[];
  total: number;
  period: Period;
  onPeriodChange: (period: Period) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  currentUsername: string | null;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "week", label: "This week" },
  { value: "today", label: "Today" },
];

function rankBadge(rank: number) {
  if (rank === 1) {
    return "bg-amber-400 text-slate-950 ring-amber-300/60";
  }
  if (rank === 2) {
    return "bg-slate-300 text-slate-950 ring-slate-200/60";
  }
  if (rank === 3) {
    return "bg-amber-700 text-amber-50 ring-amber-600/60";
  }
  return "bg-slate-800 text-slate-300 ring-slate-700/60";
}

export default function Leaderboard({
  items,
  total,
  period,
  onPeriodChange,
  search,
  onSearchChange,
  onRefresh,
  loading,
  error,
  currentUsername,
}: Props) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl shadow-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">Leaderboard</h2>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
            {total} {total === 1 ? "player" : "players"}
          </span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700/60 disabled:opacity-60"
        >
          <span
            className={`inline-block h-2 w-2 rounded-full bg-emerald-400 ${
              loading ? "animate-pulse" : ""
            }`}
          />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-5 py-3">
        <div className="flex rounded-xl bg-slate-950/70 p-1">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPeriodChange(option.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                period === option.value
                  ? "bg-indigo-500 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label htmlFor="player-search" className="sr-only">
          Search player
        </label>
        <div className="relative min-w-[12rem] flex-1">
          <input
            id="player-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search player…"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
      </div>

      {error ? (
        <p className="m-5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <th scope="col" className="px-5 py-3 font-semibold">
                Rank
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Player
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Score
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isTop = item.rank <= 3;
              const isMe = currentUsername !== null && item.player === currentUsername;
              return (
                <tr
                  key={`${item.player}-${item.rank}`}
                  className={`border-b border-slate-800/70 transition ${
                    isMe
                      ? "bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/40"
                      : isTop
                        ? "bg-amber-500/5"
                        : "hover:bg-slate-800/40"
                  }`}
                >
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-1 ${rankBadge(
                        item.rank,
                      )}`}
                    >
                      {item.rank}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-100">{item.player}</span>
                    {isMe ? (
                      <span className="ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
                        you
                      </span>
                    ) : null}
                    {isTop ? (
                      <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-400/80">
                        top {item.rank}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-base font-semibold text-slate-100">
                    {formatNumber(item.score)}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-slate-400">
                    {formatDate(item.achieved_at)}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                  No scores yet{search ? ` for “${search}”` : ""}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
