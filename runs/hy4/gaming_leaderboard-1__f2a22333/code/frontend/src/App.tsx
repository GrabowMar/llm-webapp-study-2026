import { useCallback, useEffect, useState } from "react";
import {
  api,
  type LeaderboardItem,
  type Period,
  type Score,
  type SubmittedScore,
} from "./api";

const TOKEN_KEY = "leaderboard.token";
const USERNAME_KEY = "leaderboard.username";

type LoginResponse = { token: string };
type RegisterResponse = { username: string };
type LeaderboardResponse = { items: LeaderboardItem[]; total: number };
type MyScoresResponse = { items: Score[]; best_score: number | null };
type AdminScoresResponse = {
  items: Score[];
  total: number;
  page: number;
  page_size: number;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl shadow-black/20 backdrop-blur">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
      {label}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
      {message}
    </p>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30";
const primaryBtn =
  "rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";

function AuthPanel({ onSignedIn }: { onSignedIn: (token: string, username: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api<RegisterResponse>("/auth/register", {
          method: "POST",
          body: { username, password },
        });
      }
      const { token } = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setPassword("");
      onSignedIn(token, username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={mode === "login" ? "Sign in" : "Create an account"}
      subtitle={
        mode === "login"
          ? "Sign in to submit scores and track your progress."
          : "Pick a username and password to start playing."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="auth-username">
            Username
          </label>
          <input
            id="auth-username"
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>
        {error && <ErrorNote message={error} />}
        <button className={primaryBtn} type="submit" disabled={busy}>
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Register"}
        </button>
        <p className="text-sm text-slate-400">
          {mode === "login" ? "No account yet?" : "Already registered?"}{" "}
          <button
            type="button"
            className="font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </form>
    </Panel>
  );
}

function LeaderboardPanel({
  token,
  username,
  refreshKey,
}: {
  token: string | null;
  username: string | null;
  refreshKey: number;
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ period });
    if (search.trim()) params.set("player", search.trim());
    try {
      const data = await api<LeaderboardResponse>(`/leaderboard?${params}`, { token });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [period, search, token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const periods: { value: Period; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "week", label: "This week" },
    { value: "today", label: "Today" },
  ];

  return (
    <Panel
      title="Leaderboard"
      subtitle={`${total} ${total === 1 ? "player" : "players"} ranked by best visible score`}
      action={
        <button className={secondaryBtn} onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                period === p.value
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          className={`${inputClass} max-w-xs flex-1`}
          placeholder="Search player..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search player"
        />
      </div>
      {error && <ErrorNote message={error} />}
      {loading ? (
        <Spinner label="Loading leaderboard..." />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          No visible scores yet. Be the first to submit one!
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isMe = username !== null && item.player.toLowerCase() === username.toLowerCase();
                const topThree = item.rank <= 3;
                return (
                  <tr
                    key={item.player}
                    className={`border-b border-slate-800/70 transition ${
                      isMe
                        ? "bg-cyan-500/15 ring-1 ring-inset ring-cyan-500/40"
                        : topThree
                          ? "bg-amber-400/5"
                          : "hover:bg-slate-800/40"
                    }`}
                  >
                    <td className="px-3 py-3 font-semibold">
                      {topThree ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                            item.rank === 1
                              ? "bg-amber-400/20 text-amber-300"
                              : item.rank === 2
                                ? "bg-slate-300/15 text-slate-200"
                                : "bg-orange-400/15 text-orange-300"
                          }`}
                        >
                          <span aria-hidden="true">
                            {item.rank === 1 ? "★" : item.rank === 2 ? "★" : "★"}
                          </span>
                          #{item.rank}
                        </span>
                      ) : (
                        <span className="text-slate-400">#{item.rank}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-100">
                      {item.player}
                      {isMe && (
                        <span className="ml-2 rounded bg-cyan-500/20 px-1.5 py-0.5 text-xs text-cyan-300">
                          you
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-cyan-300">
                      {item.score.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-400">
                      {formatDate(item.achieved_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SubmitPanel({
  token,
  onSubmitted,
}: {
  token: string;
  onSubmitted: () => void;
}) {
  const [score, setScore] = useState("");
  const [result, setResult] = useState<SubmittedScore | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    const value = Number(score);
    if (!Number.isInteger(value) || value < 0) {
      setError("Enter a whole number of 0 or more.");
      return;
    }
    setBusy(true);
    try {
      const submitted = await api<SubmittedScore>("/scores", {
        method: "POST",
        body: { score: value },
        token,
      });
      setResult(submitted);
      setScore("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit score");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Submit a score" subtitle="Every submission is saved to your account.">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-300" htmlFor="score-input">
            Score
          </label>
          <input
            id="score-input"
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="e.g. 12500"
            required
          />
        </div>
        <button className={primaryBtn} type="submit" disabled={busy}>
          {busy ? "Submitting..." : "Submit"}
        </button>
      </form>
      {error && (
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
          <p className="text-sm text-slate-300">
            Score <span className="font-mono font-bold text-cyan-300">{result.score.toLocaleString()}</span>{" "}
            saved — your all-time rank is{" "}
            <span className="font-bold text-cyan-300">#{result.rank}</span>.
          </p>
          {result.personal_best && (
            <p className="mt-2 text-lg font-bold text-amber-300">New personal best!</p>
          )}
        </div>
      )}
    </Panel>
  );
}

function MyScoresPanel({
  token,
  refreshKey,
}: {
  token: string;
  refreshKey: number;
}) {
  const [data, setData] = useState<MyScoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<MyScoresResponse>("/scores", { token }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your scores");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <Panel
      title="Your submissions"
      subtitle="Newest first"
      action={
        <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-300">
          Best:{" "}
          <span className="font-mono font-bold text-cyan-300">
            {data?.best_score == null ? "—" : data.best_score.toLocaleString()}
          </span>
        </span>
      }
    >
      {error && <ErrorNote message={error} />}
      {loading ? (
        <Spinner label="Loading your scores..." />
      ) : !data || data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">You have not submitted any scores yet.</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-base font-semibold ${
                    item.is_hidden ? "text-slate-500 line-through" : "text-slate-100"
                  }`}
                >
                  {item.score.toLocaleString()}
                </span>
                {item.is_hidden && (
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-xs text-rose-300">
                    hidden
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">{formatDate(item.achieved_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AdminPanel({ token, onChanged }: { token: string; onChanged: () => void }) {
  const [data, setData] = useState<AdminScoresResponse | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await api<AdminScoresResponse>(
          `/admin/scores?page=${page}&page_size=${pageSize}`,
          { token },
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load scores");
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(id: number) {
    setBusyId(id);
    setError("");
    try {
      await api<Score>(`/admin/scores/${id}/toggle`, { method: "POST", token });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update score");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <Panel
      title="Admin: all scores"
      subtitle={`${data?.total ?? 0} submissions · hide implausible scores`}
      action={
        <div className="flex items-center gap-2">
          <button
            className={secondaryBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span className="text-sm text-slate-400">
            {page} / {totalPages}
          </span>
          <button
            className={secondaryBtn}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
          <button className={secondaryBtn} onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      }
    >
      {error && <ErrorNote message={error} />}
      {loading ? (
        <Spinner label="Loading all scores..." />
      ) : !data || data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No scores submitted yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Date</th>
                <th className="px-3 py-2 text-right">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-800/70">
                  <td className="px-3 py-2.5 font-medium text-slate-100">{item.player}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-100">
                    {item.score.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-400">
                    {formatDate(item.achieved_at)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        item.is_hidden
                          ? "bg-rose-500/15 text-rose-300"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {item.is_hidden ? "Hidden" : "Visible"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      className={`rounded-lg border px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                        item.is_hidden
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                          : "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                      }`}
                      onClick={() => void toggle(item.id)}
                      disabled={busyId === item.id}
                    >
                      {busyId === item.id ? "..." : item.is_hidden ? "Show" : "Hide"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem(USERNAME_KEY),
  );
  const [refreshKey, setRefreshKey] = useState(0);

  function signedIn(newToken: string, newUsername: string) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USERNAME_KEY, newUsername);
    setToken(newToken);
    setUsername(newUsername);
    setRefreshKey((k) => k + 1);
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setToken(null);
    setUsername(null);
    setRefreshKey((k) => k + 1);
  }

  const refresh = () => setRefreshKey((k) => k + 1);
  const isAdmin = username?.toLowerCase() === "admin";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-2xl text-cyan-400">
              ★
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Arcade Leaderboard
              </h1>
              <p className="text-sm text-slate-400">Climb the ranks, one score at a time.</p>
            </div>
          </div>
          {token && username ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2">
              <div className="text-right">
                <p className="text-xs text-slate-400">Signed in as</p>
                <p className="font-semibold text-cyan-300">{username}</p>
              </div>
              <button className={secondaryBtn} onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            <span className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-400">
              Viewing as guest
            </span>
          )}
        </header>

        <div className="space-y-6">
          <LeaderboardPanel token={token} username={username} refreshKey={refreshKey} />
          {token ? (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <SubmitPanel token={token} onSubmitted={refresh} />
                <MyScoresPanel token={token} refreshKey={refreshKey} />
              </div>
              {isAdmin && <AdminPanel token={token} onChanged={refresh} />}
            </>
          ) : (
            <AuthPanel onSignedIn={signedIn} />
          )}
        </div>

        <footer className="mt-10 text-center text-xs text-slate-600">
          Hidden scores are excluded from rankings and best scores.
        </footer>
      </div>
    </div>
  );
}
