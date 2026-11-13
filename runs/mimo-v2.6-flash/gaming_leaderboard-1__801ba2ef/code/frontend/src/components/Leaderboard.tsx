import { useEffect, useState } from "react";
import { apiGet, formatDate, type LeaderboardItem } from "../api";

type Props = {
  username: string | null;
  refreshKey: number;
};

const PERIODS = [
  { id: "all", label: "All-time" },
  { id: "week", label: "This week" },
  { id: "today", label: "Today" },
];

function rankBadge(rank: number): string {
  if (rank === 1) return "bg-amber-400 text-white";
  if (rank === 2) return "bg-slate-400 text-white";
  if (rank === 3) return "bg-orange-400 text-white";
  return "bg-slate-100 text-slate-600";
}

export default function Leaderboard({ username, refreshKey }: Props) {
  const [period, setPeriod] = useState("all");
  const [query, setQuery] = useState("");
  const [player, setPlayer] = useState("");
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const handle = setTimeout(() => setPlayer(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ period, limit: "100" });
    if (player) {
      params.set("player", player);
    }
    apiGet<{ items: LeaderboardItem[]; total: number }>(
      `/api/leaderboard?${params.toString()}`,
    )
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, player, refreshKey, nonce]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Leaderboard
            </h2>
            <p className="text-xs text-slate-500">
              {total} player{total === 1 ? "" : "s"} ranked
            </p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1">
            {PERIODS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setPeriod(entry.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  period === entry.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player…"
            aria-label="Search player"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Rank</th>
              <th className="px-5 py-3">Player</th>
              <th className="px-5 py-3 text-right">Score</th>
              <th className="px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-slate-500">
                  No scores found.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => {
                const isSelf =
                  username !== null &&
                  item.player.toLowerCase() === username.toLowerCase();
                return (
                  <tr
                    key={item.player}
                    className={`border-b border-slate-100 last:border-0 ${
                      isSelf
                        ? "bg-indigo-50 hover:bg-indigo-100"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${rankBadge(item.rank)}`}
                      >
                        {item.rank}
                      </span>
                    </td>
                    <td
                      className={`px-5 py-3 ${
                        item.rank <= 3 ? "font-semibold text-slate-900" : "text-slate-700"
                      }`}
                    >
                      {item.player}
                      {isSelf && (
                        <span className="ml-2 text-xs font-medium text-indigo-600">
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900">
                      {item.score}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {formatDate(item.achieved_at)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
